// server.js (CommonJS para Railway)
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const Redis = require("ioredis");
const fs = require("fs");
const path = require("path");

// Tu generador semanal (lo que me pegaste)
const { getWeeklyLongMeaningForCard } = require("./lib/weekly-reading");

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

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

const CRON_SECRET = process.env.CRON_SECRET;

// Para actualizar productos por Admin API
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN; // ej: el-tarot-de-la-rueda-de-la-fortuna.myshopify.com
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";

// ----------------------------
// Utils Shopify webhook
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

  // Fallback seguro
  return { productName: "Tu lectura (3 cartas)", deckId: "arcanos_mayores", pick: 3, manual: false };
}

function detectCfgFromOrder(order) {
  const items = Array.isArray(order?.line_items) ? order.line_items : [];
  const productIds = new Set(
    items.map(li => String(li?.product_id || "").trim()).filter(Boolean)
  );
  return detectCfgFromProductIds(productIds);
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
// ✅ ADMIN: borrar pedido viejo
// GET /api/admin/clear-order?secret=XXX&order=1063
// =====================================================
app.get("/api/admin/clear-order", async (req, res) => {
  try {
    const secret = String(req.query.secret || "");
    const order = String(req.query.order || "").trim();
    if (!ADMIN_SECRET) return res.status(500).json({ error: "Missing ADMIN_SECRET" });
    if (secret !== ADMIN_SECRET) return res.status(401).json({ error: "Unauthorized" });
    if (!order) return res.status(400).json({ error: "Missing order" });

    const token = await redis.get(`order:${order}:token`);
    if (token) {
      await redis.del(`token:${token}:session`);
    }
    await redis.del(`order:${order}:token`);

    return res.json({ ok: true, clearedOrder: order, clearedToken: token || null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// =====================================================
// ✅ ADMIN: reconstruir sesión manualmente para un pedido
// GET /api/admin/rebuild-order?secret=XXX&order=1063&product_id=10493369745745
// =====================================================
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
      rebuiltFromProductId: productId
    };

    const ttl = 60 * 60 * 24 * 180;
    await redis.set(`order:${order}:token`, token, "EX", ttl);
    await redis.set(`token:${token}:session`, JSON.stringify(session), "EX", ttl);

    return res.json({ ok: true, orderNumber: order, token, pick: cfg.pick, deckId: cfg.deckId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// =====================================================
// ✅ CRON WEEKLY REFRESH (Railway)
// POST /cron/weekly-refresh?secret=XXXXX
// =====================================================

function requireCronSecret(req) {
  const s = String(req.query.secret || "");
  return !!CRON_SECRET && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(CRON_SECRET));
}

function loadDeck(deckId) {
  const file = path.join(process.cwd(), "data", "decks", `${deckId}.json`);
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw);
}

function sampleCards(cards, n) {
  const arr = [...cards];
  // shuffle simple
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n).map(c => ({
    ...c,
    reversed: Math.random() < 0.35, // 35% invertida
  }));
}

async function shopifyUpdateProductBodyHtml(productId, bodyHtml) {
  if (!SHOPIFY_ADMIN_TOKEN) throw new Error("Missing SHOPIFY_ADMIN_TOKEN");
  if (!SHOPIFY_STORE_DOMAIN) throw new Error("Missing SHOPIFY_STORE_DOMAIN");

  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}.json`;

  const r = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify({
      product: {
        id: Number(productId),
        body_html: bodyHtml,
      },
    }),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.errors ? JSON.stringify(data.errors) : JSON.stringify(data);
    throw new Error(`Shopify update failed (${r.status}): ${msg}`);
  }
  return data;
}

function htmlEscape(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function buildWeeklyDescriptionHTML({ productId, deckId, pick }) {
  const deck = loadDeck(deckId);
  const picked = sampleCards(deck.cards || [], pick);

  // Generar textos largos (cache semanal) por carta
  const blocks = [];
  for (const card of picked) {
    const longText = await getWeeklyLongMeaningForCard({
      productId: String(productId),
      card,
      reversed: !!card.reversed,
    });

    blocks.push(`
      <hr/>
      <h2>✨ ${htmlEscape(card.name)} ${card.reversed ? "(Invertida)" : ""}</h2>
      <p><em>${htmlEscape(card.meaning || "")}</em></p>
      <div style="white-space:pre-wrap; line-height:1.55;">
        ${htmlEscape(longText)}
      </div>
    `);
  }

  const header = `
    <div>
      <h1>🌙 Lectura semanal actualizada</h1>
      <p>Esta descripción se renueva automáticamente cada semana.</p>
      <p><strong>Baraja:</strong> ${htmlEscape(deck.name || deckId)} · <strong>Cartas:</strong> ${pick}</p>
    </div>
  `;

  return `
    <div class="tarot-weekly-reading">
      ${header}
      ${blocks.join("\n")}
    </div>
  `;
}

async function runWeeklyRefresh() {
  // Tus 4 productos (ids Shopify)
  const targets = [
    { productId: "10496012616017", deckId: "angeles", pick: 4 },          // Mensaje de los Ángeles
    { productId: "10495993446737", deckId: "semilla_estelar", pick: 5 },  // Semilla Estelar
    { productId: "10493383082321", deckId: "arcanos_mayores", pick: 12 }, // Lectura Profunda
    { productId: "10493369745745", deckId: "arcanos_mayores", pick: 3 },  // Tres Puertas
  ];

  const results = [];

  for (const t of targets) {
    const html = await buildWeeklyDescriptionHTML(t);
    await shopifyUpdateProductBodyHtml(t.productId, html);
    results.push({ ...t, ok: true });
  }

  return { ok: true, updated: results.length, results };
}

app.post("/cron/weekly-refresh", async (req, res) => {
  try {
    if (!CRON_SECRET) return res.status(500).json({ ok: false, error: "Missing CRON_SECRET" });
    if (!requireCronSecret(req)) return res.status(401).json({ ok: false, error: "Unauthorized cron" });

    const out = await runWeeklyRefresh();
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// (Opcional) permitir GET para test rápido en navegador
app.get("/cron/weekly-refresh", async (req, res) => {
  try {
    if (!CRON_SECRET) return res.status(500).json({ ok: false, error: "Missing CRON_SECRET" });
    if (!requireCronSecret(req)) return res.status(401).json({ ok: false, error: "Unauthorized cron" });

    const out = await runWeeklyRefresh();
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server running on port", PORT));
