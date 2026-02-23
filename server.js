import express from "express";
import cors from "cors";
import crypto from "crypto";
import Redis from "ioredis";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath, createRequire } from "module";

const require = createRequire(import.meta.url);
const { getWeeklyLongMeaningForCard } = require("./lib/weekly-reading.js");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// Guardar rawBody para verificar HMAC Shopify
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

const redis = new Redis(process.env.REDIS_URL);

const SHOPIFY_WEBHOOK_SECRET = (process.env.SHOPIFY_WEBHOOK_SECRET || "").trim();
const ADMIN_SECRET = (process.env.ADMIN_SECRET || "").trim();
const CRON_SECRET = (process.env.CRON_SECRET || "").trim();

const SHOPIFY_STORE_DOMAIN = (process.env.SHOPIFY_STORE_DOMAIN || "").trim(); // mejor: xxx.myshopify.com
const SHOPIFY_ADMIN_TOKEN = (process.env.SHOPIFY_ADMIN_TOKEN || "").trim();   // shpat_...
const SHOPIFY_API_VERSION = (process.env.SHOPIFY_API_VERSION || "2024-07").trim();

// ----------------------------
// HELPERS
// ----------------------------
function verifyShopifyHmac(rawBody, hmacHeader) {
  const digest = crypto
    .createHmac("sha256", SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(hmacHeader || "")
    );
  } catch {
    return false;
  }
}

function randomToken() {
  return crypto.randomBytes(16).toString("hex");
}

function normalizeOrderNumber(order) {
  return (
    String(order?.order_number || "").trim() ||
    String(order?.name || "").replace("#", "").trim()
  );
}

/**
 * ✅ DETECCIÓN POR PRODUCT_ID EXACTO (tus 4 productos)
 */
function detectCfgFromProductIds(productIds) {
  // Mensaje de los Ángeles (4)
  if (productIds.has("10496012616017")) {
    return { productName: "Mensaje de los Ángeles (4 cartas)", deckId: "angeles", pick: 4, manual: false };
  }

  // Semilla Estelar (5)
  if (productIds.has("10495993446737")) {
    return { productName: "Camino de la Semilla Estelar (5 cartas)", deckId: "semilla_estelar", pick: 5, manual: false };
  }

  // Lectura Profunda (12)
  if (productIds.has("10493383082321")) {
    return { productName: "Lectura Profunda: Análisis Completo (12 cartas)", deckId: "arcanos_mayores", pick: 12, manual: false };
  }

  // Tres Puertas (3)
  if (productIds.has("10493369745745")) {
    return { productName: "Tres Puertas del Destino (3 cartas)", deckId: "arcanos_mayores", pick: 3, manual: false };
  }

  return { productName: "Tu lectura (3 cartas)", deckId: "arcanos_mayores", pick: 3, manual: false };
}

function detectCfgFromOrder(order) {
  const items = Array.isArray(order?.line_items) ? order.line_items : [];
  const productIds = new Set(
    items.map(li => String(li?.product_id || "").trim()).filter(Boolean)
  );
  return detectCfgFromProductIds(productIds);
}

// Semana ISO simple (año-semana) UTC (igual que tu weekly-reading)
function weekKeyUTC(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  const yyyy = date.getUTCFullYear();
  return `${yyyy}-W${String(weekNo).padStart(2, "0")}`;
}

// Secret por query o header (más robusto)
function getProvidedCronSecret(req) {
  const q = String(req.query.secret || "").trim();
  const h = String(req.get("x-cron-secret") || "").trim();
  const raw = h || q;
  if (!raw) return "";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

// Deterministic RNG por seed (semanal estable)
function seededRandom(seedStr) {
  const h = crypto.createHash("sha256").update(seedStr).digest();
  let x = h.readUInt32BE(0);
  return function () {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) / 4294967296);
  };
}

function pickWeeklyCards({ deckCards, pickCount, seed }) {
  const rnd = seededRandom(seed);
  const arr = deckCards.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, pickCount);
}

// ----------------------------
// LOAD DECKS from repo (data/decks/*.json)
// Cache en Redis 1h (para que sea rápido)
// ----------------------------
async function loadDeck(deckId) {
  const cacheKey = `deck:${deckId}:v1`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }

  const deckPath = path.join(__dirname, "data", "decks", `${deckId}.json`);
  const raw = await fs.readFile(deckPath, "utf8");
  const json = JSON.parse(raw);

  const cards = Array.isArray(json?.cards) ? json.cards : [];
  if (!cards.length) throw new Error(`Deck inválido: ${deckId}.json no tiene cards[]`);

  await redis.set(cacheKey, JSON.stringify(json), "EX", 60 * 60); // 1h
  return json;
}

// ----------------------------
// Shopify Admin GraphQL
// ----------------------------
function toProductGid(productIdNumeric) {
  return `gid://shopify/Product/${productIdNumeric}`;
}

async function shopifyGraphQL(query, variables) {
  if (!SHOPIFY_STORE_DOMAIN) throw new Error("Missing SHOPIFY_STORE_DOMAIN");
  if (!SHOPIFY_ADMIN_TOKEN) throw new Error("Missing SHOPIFY_ADMIN_TOKEN");

  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Shopify GraphQL HTTP ${r.status}: ${JSON.stringify(json).slice(0, 600)}`);
  if (json.errors?.length) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors).slice(0, 600)}`);

  return json.data;
}

async function updateProductDescriptionHtml(productId, html) {
  const mutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title }
        userErrors { field message }
      }
    }
  `;

  const data = await shopifyGraphQL(mutation, {
    input: {
      id: toProductGid(productId),
      descriptionHtml: html,
    },
  });

  const errs = data?.productUpdate?.userErrors || [];
  if (errs.length) throw new Error(`Shopify userErrors: ${JSON.stringify(errs)}`);

  return data.productUpdate.product;
}

// ----------------------------
// HTML builder
// ----------------------------
function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildProductHtml({ productName, week, cardsBlocks }) {
  const blocks = cardsBlocks.map(b => {
    const body = escapeHtml(b.text || "")
      .split(/\n{2,}/g)
      .map(p => `<p>${p.replaceAll("\n", "<br/>")}</p>`)
      .join("\n");

    return `
      <div style="margin:18px 0; padding:14px; border:1px solid rgba(0,0,0,.08); border-radius:14px;">
        <div style="font-weight:900; margin-bottom:8px;">🃏 ${escapeHtml(b.name)}</div>
        <div style="line-height:1.6; font-size:14px;">${body}</div>
      </div>
    `.trim();
  }).join("\n");

  return `
    <div style="max-width:900px; margin:0 auto; line-height:1.6;">
      <h2 style="margin:0 0 8px;">✨ Lectura semanal — ${escapeHtml(productName)}</h2>
      <div style="opacity:.7; margin-bottom:14px;">Semana: ${escapeHtml(week)}</div>
      ${blocks}
      <div style="margin-top:18px; font-size:12px; opacity:.7;">Actualizado automáticamente.</div>
    </div>
  `.trim();
}

// ----------------------------
// HEALTH
// ----------------------------
app.get("/", (req, res) => {
  res.send("API de Tarot en funcionamiento ✅");
});

// ----------------------------
// GET /api/token?order=1063
// ----------------------------
app.get("/api/token", async (req, res) => {
  try {
    const order = String(req.query.order || "").trim();
    if (!order) return res.status(400).json({ error: "Falta pedido" });

    const token = await redis.get(`order:${order}:token`);
    if (!token) return res.status(404).json({ error: "Pedido no encontrado" });

    return res.json({ token });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ----------------------------
// GET /api/session?token=xxxx
// ----------------------------
app.get("/api/session", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return res.status(400).json({ error: "Missing token" });

    const raw = await redis.get(`token:${token}:session`);
    if (!raw) return res.status(404).json({ error: "Session not found" });

    return res.json(JSON.parse(raw));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ----------------------------
// ✅ WEBHOOK SHOPIFY: Order Paid
// POST /api/shopify/order-paid
// ----------------------------
app.post("/api/shopify/order-paid", async (req, res) => {
  try {
    if (!SHOPIFY_WEBHOOK_SECRET) return res.status(500).send("Missing SHOPIFY_WEBHOOK_SECRET");

    const hmac = req.get("X-Shopify-Hmac-Sha256");
    const rawBody = req.rawBody;

    if (!rawBody) return res.status(400).send("Missing rawBody");
    if (!verifyShopifyHmac(rawBody, hmac)) return res.status(401).send("Invalid HMAC");

    const order = req.body;
    const orderNumber = normalizeOrderNumber(order);
    if (!orderNumber) return res.status(400).send("Missing order number");

    const cfg = detectCfgFromOrder(order);

    const token = randomToken();
    const session = {
      token,
      manual: cfg.manual,
      productName: cfg.productName,
      deckId: cfg.deckId,
      pick: cfg.pick,
      createdAt: Date.now(),
    };

    const ttl = 60 * 60 * 24 * 180; // 180 días
    await redis.set(`order:${orderNumber}:token`, token, "EX", ttl);
    await redis.set(`token:${token}:session`, JSON.stringify(session), "EX", ttl);

    return res.status(200).json({ ok: true, orderNumber, pick: cfg.pick, deckId: cfg.deckId });
  } catch (e) {
    return res.status(500).send(e.message);
  }
});

// =====================================================
// ✅ CRON: Weekly refresh (actualiza los 4 productos)
// ALL /cron/weekly-refresh?secret=XXXX
// (o header x-cron-secret: XXXX)
// =====================================================
const AUTOMATED_PRODUCTS = [
  "10493369745745", // Tres Puertas (3)
  "10496012616017", // Ángeles (4)
  "10495993446737", // Semilla Estelar (5)
  "10493383082321", // Lectura Profunda (12)
];

async function runWeeklyRefresh() {
  if (typeof getWeeklyLongMeaningForCard !== "function") {
    throw new Error("getWeeklyLongMeaningForCard no está disponible (lib/weekly-reading.js)");
  }

  const wk = weekKeyUTC();
  const results = [];

  for (const productId of AUTOMATED_PRODUCTS) {
    const cfg = detectCfgFromProductIds(new Set([productId]));

    // 1) cargar mazo del repo
    const deck = await loadDeck(cfg.deckId);
    const cards = deck.cards;

    // 2) elegir cartas semanales estables
    const seed = `weekly:${wk}:${productId}:${cfg.deckId}`;
    const picked = pickWeeklyCards({
      deckCards: cards,
      pickCount: cfg.pick,
      seed,
    });

    // 3) generar texto largo por carta (cacheado por tu weekly-reading.js)
    const blocks = [];
    for (const card of picked) {
      const text = await getWeeklyLongMeaningForCard({
        productId,
        card,
        reversed: false,
      });

      blocks.push({
        id: card.id,
        name: card.name,
        text: text || card.meaning || "",
      });
    }

    // 4) construir HTML final y actualizar Shopify
    const html = buildProductHtml({
      productName: cfg.productName,
      week: wk,
      cardsBlocks: blocks,
    });

    const updated = await updateProductDescriptionHtml(productId, html);

    results.push({
      productId,
      deckId: cfg.deckId,
      pick: cfg.pick,
      updatedTitle: updated?.title || null,
      ok: true,
    });
  }

  return { week: wk, count: results.length, results };
}

app.all("/cron/weekly-refresh", async (req, res) => {
  try {
    if (!CRON_SECRET) {
      return res.status(500).json({ ok: false, error: "Missing CRON_SECRET in Railway env" });
    }

    const provided = getProvidedCronSecret(req);
    if (!provided || provided !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized cron" });
    }

    const out = await runWeeklyRefresh();
    return res.json({ ok: true, ...out });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// =====================================================
// ✅ ADMIN: clear-order / rebuild-order (igual que antes)
// =====================================================
app.get("/api/admin/clear-order", async (req, res) => {
  try {
    const secret = String(req.query.secret || "");
    const order = String(req.query.order || "").trim();
    if (!ADMIN_SECRET) return res.status(500).json({ error: "Missing ADMIN_SECRET" });
    if (secret !== ADMIN_SECRET) return res.status(401).json({ error: "Unauthorized" });
    if (!order) return res.status(400).json({ error: "Missing order" });

    const token = await redis.get(`order:${order}:token`);
    if (token) await redis.del(`token:${token}:session`);
    await redis.del(`order:${order}:token`);

    return res.json({ ok: true, clearedOrder: order, clearedToken: token || null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/rebuild-order", async (req, res) => {
  try {
    const secret = String(req.query.secret || "");
    const order = String(req.query.order || "").trim();
    const productId = String(req.query.product_id || "").trim();

    if (!ADMIN_SECRET) return res.status(500).json({ error: "Missing ADMIN_SECRET" });
    if (secret !== ADMIN_SECRET) return res.status(401).json({ error: "Unauthorized" });
    if (!order) return res.status(400).json({ error: "Missing order" });
    if (!productId) return res.status(400).json({ error: "Missing product_id" });

    const cfg = detectCfgFromProductIds(new Set([productId]));
    const token = randomToken();

    const session = {
      token,
      manual: cfg.manual,
      productName: cfg.productName,
      deckId: cfg.deckId,
      pick: cfg.pick,
      createdAt: Date.now(),
      rebuilt: true,
      rebuiltFromProductId: productId,
    };

    const ttl = 60 * 60 * 24 * 180;
    await redis.set(`order:${order}:token`, token, "EX", ttl);
    await redis.set(`token:${token}:session`, JSON.stringify(session), "EX", ttl);

    return res.json({ ok: true, orderNumber: order, token, pick: cfg.pick, deckId: cfg.deckId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server running on port", PORT));
