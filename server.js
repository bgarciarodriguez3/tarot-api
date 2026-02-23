// server.js (ESM) ✅ para "type":"module"
// ✅ Decks locales ./data/decks/*.json
// ✅ Selección semanal estable (determinística)
// ✅ Textos largos con OpenAI (lib/weekly-reading.js)
// ✅ Actualiza descriptionHtml en Shopify (GraphQL Admin API)
// ✅ Cron protegido por CRON_SECRET (query o header)
// ✅ Webhook Shopify order-paid + Redis token/sesión
// ✅ Admin: clear-order / rebuild-order
// ✅ HTML con imágenes (dorso + cartas)

import express from "express";
import cors from "cors";
import crypto from "crypto";
import Redis from "ioredis";
import fs from "fs/promises";
import path from "path";

import { getWeeklyLongMeaningForCard } from "./lib/weekly-reading.js";

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

// ----------------------------
// ENV
// ----------------------------
const SHOPIFY_WEBHOOK_SECRET = (process.env.SHOPIFY_WEBHOOK_SECRET || "").trim();
const ADMIN_SECRET = (process.env.ADMIN_SECRET || "").trim();
const CRON_SECRET = (process.env.CRON_SECRET || "").trim();

const SHOPIFY_STORE_DOMAIN = (process.env.SHOPIFY_STORE_DOMAIN || "").trim();
const SHOPIFY_ADMIN_TOKEN = (process.env.SHOPIFY_ADMIN_TOKEN || "").trim();
const SHOPIFY_API_VERSION = (process.env.SHOPIFY_API_VERSION || "2024-07").trim();

// Redis env (usa SOLO variables, no hardcode)
const REDIS_URL = (process.env.REDIS_URL || "").trim();

// ----------------------------
// REDIS (Upstash rediss://)
// ----------------------------
if (!REDIS_URL) {
  console.error("❌ Missing REDIS_URL in env (Railway → Variables)");
}

// ioredis con TLS si es rediss:// (Upstash)
const redis = new Redis(REDIS_URL, {
  // Si la URL empieza por rediss://, forzamos TLS
  tls: REDIS_URL?.startsWith("rediss://") ? {} : undefined,
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on("connect", () => console.log("✅ Redis connect"));
redis.on("ready", () => console.log("✅ Redis ready"));
redis.on("error", (err) => console.error("❌ Redis error:", err?.message || err));

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

function detectCfgFromProductIds(productIds) {
  if (productIds.has("10496012616017")) {
    return { productName: "Mensaje de los Ángeles (4 cartas)", deckId: "angeles", pick: 4, manual: false };
  }
  if (productIds.has("10495993446737")) {
    return { productName: "Camino de la Semilla Estelar (5 cartas)", deckId: "semilla_estelar", pick: 5, manual: false };
  }
  if (productIds.has("10493383082321")) {
    return { productName: "Lectura Profunda: Análisis Completo (12 cartas)", deckId: "arcanos_mayores", pick: 12, manual: false };
  }
  if (productIds.has("10493369745745")) {
    return { productName: "Tres Puertas del Destino (3 cartas)", deckId: "arcanos_mayores", pick: 3, manual: false };
  }
  return { productName: "Tu lectura (3 cartas)", deckId: "arcanos_mayores", pick: 3, manual: false };
}

function detectCfgFromOrder(order) {
  const items = Array.isArray(order?.line_items) ? order.line_items : [];
  const productIds = new Set(items.map(li => String(li?.product_id || "").trim()).filter(Boolean));
  return detectCfgFromProductIds(productIds);
}

// Semana ISO simple (año-semana)
function weekKeyUTC(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  const yyyy = date.getUTCFullYear();
  return `${yyyy}-W${String(weekNo).padStart(2, "0")}`;
}

function getProvidedCronSecret(req) {
  const q = String(req.query.secret || "").trim();
  const h = String(req.get("x-cron-secret") || "").trim();
  const raw = h || q;
  if (!raw) return "";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function seededRandom(seedStr) {
  const h = crypto.createHash("sha256").update(seedStr).digest();
  let x = h.readUInt32BE(0);
  return function () {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
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
// LOAD DECKS (cache redis 1h)
// ----------------------------
async function loadDeck(deckId) {
  const cacheKey = `deck:${deckId}:v1`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }

  const deckPath = path.join(process.cwd(), "data", "decks", `${deckId}.json`);
  const raw = await fs.readFile(deckPath, "utf8");
  const json = JSON.parse(raw);

  const cards = Array.isArray(json?.cards) ? json.cards : [];
  if (!cards.length) throw new Error(`Deck inválido: ${deckId}.json no tiene cards[]`);

  await redis.set(cacheKey, JSON.stringify(json), "EX", 60 * 60);
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
  if (!r.ok) throw new Error(`Shopify GraphQL HTTP ${r.status}: ${JSON.stringify(json).slice(0, 900)}`);
  if (json.errors?.length) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors).slice(0, 900)}`);
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
    input: { id: toProductGid(productId), descriptionHtml: html },
  });

  const errs = data?.productUpdate?.userErrors || [];
  if (errs.length) throw new Error(`Shopify userErrors: ${JSON.stringify(errs)}`);

  return data.productUpdate.product;
}

// ----------------------------
// HTML builder (imágenes)
// ----------------------------
function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildProductHtml({ productName, week, deckName, deckBackImage, cardsBlocks }) {
  const back = deckBackImage
    ? `
      <div style="margin:12px 0 18px;">
        <img src="${escapeHtml(deckBackImage)}" alt="Dorso del mazo"
          style="width:100%; max-width:520px; border-radius:18px; display:block;" loading="lazy" />
      </div>
    `.trim()
    : "";

  const blocks = cardsBlocks.map((b) => {
    const img = b.image
      ? `
        <div style="margin: 0 0 10px;">
          <img src="${escapeHtml(b.image)}" alt="${escapeHtml(b.name)}"
            style="width:100%; max-width:420px; border-radius:16px; display:block;" loading="lazy" />
        </div>
      `.trim()
      : "";

    const body = escapeHtml(b.text || "")
      .split(/\n{2,}/g)
      .map((p) => `<p>${p.replaceAll("\n", "<br/>")}</p>`)
      .join("\n");

    return `
      <div style="margin:18px 0; padding:14px; border:1px solid rgba(0,0,0,.08); border-radius:14px;">
        <div style="font-weight:900; margin-bottom:10px;">🃏 ${escapeHtml(b.name)}</div>
        ${img}
        <div style="line-height:1.6; font-size:14px;">${body}</div>
      </div>
    `.trim();
  }).join("\n");

  return `
    <div style="max-width:900px; margin:0 auto; line-height:1.6;">
      <h2 style="margin:0 0 6px;">✨ Lectura semanal — ${escapeHtml(productName)}</h2>
      <div style="opacity:.75; margin-bottom:10px;">
        Semana: ${escapeHtml(week)}${deckName ? ` · Mazo: ${escapeHtml(deckName)}` : ""}
      </div>
      ${back}
      ${blocks}
      <div style="margin-top:18px; font-size:12px; opacity:.7;">Actualizado automáticamente.</div>
    </div>
  `.trim();
}

// ----------------------------
// ROUTES
// ----------------------------
app.get("/", (req, res) => res.send("API de Tarot en funcionamiento ✅"));

// Health rápido para comprobar que Railway sirve bien
app.get("/health", async (req, res) => {
  try {
    // ping redis (si falla, lo verás aquí)
    const pong = await redis.ping();
    res.json({ ok: true, redis: pong, time: Date.now() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

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

    const ttl = 60 * 60 * 24 * 180;
    await redis.set(`order:${orderNumber}:token`, token, "EX", ttl);
    await redis.set(`token:${token}:session`, JSON.stringify(session), "EX", ttl);

    return res.status(200).json({ ok: true, orderNumber, pick: cfg.pick, deckId: cfg.deckId });
  } catch (e) {
    return res.status(500).send(e.message);
  }
});

// ----------------------------
// CRON
// ----------------------------
const AUTOMATED_PRODUCTS = [
  "10493369745745",
  "10496012616017",
  "10495993446737",
  "10493383082321",
];

async function runWeeklyRefresh() {
  const wk = weekKeyUTC();
  const results = [];

  for (const productId of AUTOMATED_PRODUCTS) {
    const cfg = detectCfgFromProductIds(new Set([productId]));

    const deck = await loadDeck(cfg.deckId);
    const seed = `weekly:${wk}:${productId}:${cfg.deckId}`;

    const picked = pickWeeklyCards({
      deckCards: deck.cards,
      pickCount: cfg.pick,
      seed,
    });

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
        image: card.image || "",
        text: text || card.meaning || "",
      });
    }

    const html = buildProductHtml({
      productName: cfg.productName,
      week: wk,
      deckName: deck?.name || cfg.deckId,
      deckBackImage: deck?.back_image || "",
      cardsBlocks: blocks,
    });

    const updated = await updateProductDescriptionHtml(productId, html);

    results.push({ productId, deckId: cfg.deckId, pick: cfg.pick, updatedTitle: updated?.title || null, ok: true });
  }

  return { week: wk, count: results.length, results };
}

// ✅ Cron (acepta GET/POST/ALL)
async function cronHandler(req, res) {
  try {
    if (!CRON_SECRET) return res.status(500).json({ ok: false, error: "Missing CRON_SECRET" });

    const provided = getProvidedCronSecret(req);
    if (!provided || provided !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized cron" });
    }

    const out = await runWeeklyRefresh();
    return res.json({ ok: true, ...out });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

app.get("/cron/weekly-refresh", cronHandler);
app.post("/cron/weekly-refresh", cronHandler);
app.all("/cron/weekly-refresh", cronHandler);

// Alias por si alguna vez llamaste con underscore
app.all("/cron/weekly_refresh", cronHandler);

// ----------------------------
// ADMIN
// ----------------------------
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

// ----------------------------
// START
// ----------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("🚀 Server running on port", PORT));
