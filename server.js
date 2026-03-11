// server.js (ESM) ✅ para "type":"module"
// ✅ Decks locales ./data/decks/*.json
// ✅ Selección semanal estable (determinística)
// ✅ Textos largos con OpenAI (lib/weekly-reading.js)
// ✅ Actualiza descriptionHtml en Shopify (GraphQL Admin API)
// ✅ Cron protegido por CRON_SECRET (query o header)
// ✅ Webhook Shopify order-paid + Redis token/sesión
// ✅ Email de acceso a la lectura automática
// ✅ Idempotencia para evitar correos duplicados
// ✅ Admin: clear-order / rebuild-order
// ✅ HTML con imágenes (dorso + cartas)

import express from "express";
import cors from "cors";
import crypto from "crypto";
import Redis from "ioredis";
import fs from "fs/promises";
import path from "path";
import nodemailer from "nodemailer";

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
// REDIS (robusto)
// ----------------------------
function cleanRedisUrl(raw) {
  if (!raw) return "";
  let s = String(raw).trim();

  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }

  const m = s.match(/(rediss?:\/\/\S+)/i);
  if (m?.[1]) s = m[1];

  try {
    s = decodeURIComponent(s);
  } catch {
    // ok
  }

  return s.trim();
}

function createRedisClient() {
  const raw =
    process.env.REDIS_URL ||
    process.env.UPSTASH_REDIS_URL ||
    process.env.KV_URL ||
    "";

  const url = cleanRedisUrl(raw);

  if (!url) {
    console.warn("⚠️ REDIS_URL no está configurado. La API seguirá, pero sin cache/sesiones.");
    const dummy = {
      get: async () => null,
      set: async () => null,
      del: async () => null,
      expire: async () => null,
      ping: async () => "NO_REDIS",
      on: () => {},
      quit: async () => {},
    };
    return dummy;
  }

  const client = new Redis(url, {
    tls: url.startsWith("rediss://") ? {} : undefined,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on("connect", () => console.log("✅ Redis connect"));
  client.on("ready", () => console.log("✅ Redis ready"));
  client.on("error", (err) => console.error("❌ Redis error:", err?.message || err));

  return client;
}

const redis = createRedisClient();

// ----------------------------
// ENV
// ----------------------------
const SHOPIFY_WEBHOOK_SECRET = (process.env.SHOPIFY_WEBHOOK_SECRET || "").trim();
const ADMIN_SECRET = (process.env.ADMIN_SECRET || "").trim();
const CRON_SECRET = (process.env.CRON_SECRET || "").trim();

const SHOPIFY_STORE_DOMAIN = (process.env.SHOPIFY_STORE_DOMAIN || "").trim();
const SHOPIFY_ADMIN_TOKEN = (process.env.SHOPIFY_ADMIN_TOKEN || "").trim();
const SHOPIFY_API_VERSION = (process.env.SHOPIFY_API_VERSION || "2024-07").trim();

const GMAIL_USER = (process.env.GMAIL_USER || "").trim();
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || "").trim();
const MAIL_FROM_NAME = (process.env.MAIL_FROM_NAME || "El Tarot de la Rueda de la Fortuna").trim();

const SITE_URL = (process.env.SITE_URL || "https://eltarotdelaruedadelafortuna.com").trim();
const ARCANOS_READING_PATH = (process.env.ARCANOS_READING_PATH || "/pages/arcanos-mayores-tirada-personalizada").trim();
const ANGELS_READING_PATH = (process.env.ANGELS_READING_PATH || "/pages/mensaje-de-los-angeles-tirada-de-4-cartas").trim();
const SEEDSTAR_READING_PATH = (process.env.SEEDSTAR_READING_PATH || "/pages/camino-de-la-semilla-estelar-tirada-de-5-cartas").trim();

// ----------------------------
// MAILER
// ----------------------------
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.warn("⚠️ Faltan GMAIL_USER / GMAIL_APP_PASSWORD. No se podrán enviar emails.");
    return null;
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });

  return transporter;
}

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

function normalizeCustomerEmail(order) {
  return (
    String(order?.email || "").trim() ||
    String(order?.contact_email || "").trim() ||
    String(order?.customer?.email || "").trim()
  );
}

function getProductConfigByProductId(productId) {
  const id = String(productId || "").trim();

  if (id === "10496012616017") {
    return {
      automated: true,
      manual: false,
      productName: "Mensaje de los Ángeles (4 cartas)",
      deckId: "angeles",
      pick: 4,
      readingPath: ANGELS_READING_PATH,
    };
  }

  if (id === "10495993446737") {
    return {
      automated: true,
      manual: false,
      productName: "Camino de la Semilla Estelar (5 cartas)",
      deckId: "semilla_estelar",
      pick: 5,
      readingPath: SEEDSTAR_READING_PATH,
    };
  }

  if (id === "10493383082321") {
    return {
      automated: true,
      manual: false,
      productName: "Lectura Profunda: Análisis Completo (12 cartas)",
      deckId: "arcanos_mayores",
      pick: 12,
      readingPath: ARCANOS_READING_PATH,
    };
  }

  if (id === "10493369745745") {
    return {
      automated: true,
      manual: false,
      productName: "Tres Puertas del Destino (3 cartas)",
      deckId: "arcanos_mayores",
      pick: 3,
      readingPath: ARCANOS_READING_PATH,
    };
  }

  return null;
}

function detectCfgFromProductIds(productIds) {
  for (const pid of productIds) {
    const cfg = getProductConfigByProductId(pid);
    if (cfg) return cfg;
  }

  return {
    automated: false,
    manual: true,
    productName: "Lectura premium o producto no automático",
    deckId: null,
    pick: null,
    readingPath: null,
  };
}

function detectCfgFromOrder(order) {
  const items = Array.isArray(order?.line_items) ? order.line_items : [];
  const productIds = new Set(
    items.map((li) => String(li?.product_id || "").trim()).filter(Boolean)
  );
  return detectCfgFromProductIds(productIds);
}

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
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
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

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildReadingUrl({ cfg, token, orderNumber }) {
  const base = new URL(cfg.readingPath, SITE_URL);

  base.searchParams.set("token", token);
  base.searchParams.set("order", orderNumber);

  if (cfg.deckId) base.searchParams.set("deck", cfg.deckId);
  if (cfg.pick) base.searchParams.set("cartas", String(cfg.pick));

  return base.toString();
}

function buildAccessEmailHtml({ customerName, productName, accessUrl, orderNumber }) {
  const safeName = escapeHtml(customerName || "querida alma");
  const safeProduct = escapeHtml(productName);
  const safeAccessUrl = escapeHtml(accessUrl);
  const safeOrder = escapeHtml(orderNumber);

  return `
    <div style="font-family:Arial,Helvetica,sans-serif; background:#f8f5ff; padding:24px; color:#222;">
      <div style="max-width:680px; margin:0 auto; background:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,.08);">
        <div style="background:#1a102f; color:#fff; padding:28px 24px; text-align:center;">
          <h1 style="margin:0; font-size:28px;">🔮 Tu lectura está lista</h1>
          <p style="margin:10px 0 0; font-size:15px; opacity:.9;">Accede ahora a tu tirada automática</p>
        </div>

        <div style="padding:28px 24px;">
          <p style="margin:0 0 14px;">Hola, ${safeName}.</p>

          <p style="margin:0 0 14px;">
            Hemos preparado tu acceso para:
            <strong>${safeProduct}</strong>
          </p>

          <p style="margin:0 0 24px;">
            Pedido: <strong>#${safeOrder}</strong>
          </p>

          <div style="text-align:center; margin:28px 0;">
            <a href="${safeAccessUrl}"
               style="display:inline-block; background:#5b2be0; color:#fff; text-decoration:none; font-weight:700; padding:16px 26px; border-radius:12px; font-size:16px;">
              Acceder a mi lectura
            </a>
          </div>

          <p style="margin:0 0 12px; font-size:14px; color:#444;">
            Si el botón no funciona, copia y pega este enlace en tu navegador:
          </p>

          <p style="margin:0 0 20px; font-size:13px; line-height:1.6; word-break:break-all; color:#5b2be0;">
            ${safeAccessUrl}
          </p>

          <hr style="border:none; border-top:1px solid #eee; margin:24px 0;" />

          <p style="margin:0; font-size:13px; color:#666;">
            Si además compraste una lectura premium, recibirás su información por separado.
          </p>
        </div>
      </div>
    </div>
  `.trim();
}

function buildAccessEmailText({ customerName, productName, accessUrl, orderNumber }) {
  return [
    `Hola ${customerName || ""},`,
    "",
    `Tu acceso para "${productName}" ya está listo.`,
    `Pedido: #${orderNumber}`,
    "",
    "Accede aquí a tu lectura:",
    accessUrl,
    "",
    "Si además compraste una lectura premium, recibirás su información por separado.",
  ].join("\n");
}

async function sendAccessEmail({ to, customerName, productName, accessUrl, orderNumber }) {
  const tx = getTransporter();
  if (!tx) throw new Error("Mailer no configurado");

  const from = `"${MAIL_FROM_NAME}" <${GMAIL_USER}>`;

  const mail = {
    from,
    to,
    subject: `🔮 Accede a tu lectura — Pedido #${orderNumber}`,
    text: buildAccessEmailText({ customerName, productName, accessUrl, orderNumber }),
    html: buildAccessEmailHtml({ customerName, productName, accessUrl, orderNumber }),
  };

  const info = await tx.sendMail(mail);
  return info;
}

// ----------------------------
// LOAD DECKS (cache redis 1h)
// ----------------------------
async function loadDeck(deckId) {
  const cacheKey = `deck:${deckId}:v1`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // ignore
    }
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

app.get("/health/redis", async (req, res) => {
  try {
    const pong = await redis.ping();
    res.json({ ok: true, redis: pong });
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
    const customerEmail = normalizeCustomerEmail(order);

    if (!orderNumber) return res.status(400).send("Missing order number");
    if (!customerEmail) return res.status(400).send("Missing customer email");

    const cfg = detectCfgFromOrder(order);

    // Si no es un producto automático, no hacemos nada y respondemos ok.
    if (!cfg.automated) {
      console.log(`ℹ️ Pedido #${orderNumber}: sin producto automático. No se envía email de acceso.`);
      return res.status(200).json({ ok: true, skipped: true, reason: "non-automated-product" });
    }

    const mailSentKey = `order:${orderNumber}:mail_sent`;
    const existingMailSent = await redis.get(mailSentKey);

    let token = await redis.get(`order:${orderNumber}:token`);
    const isDuplicate = Boolean(token);

    if (existingMailSent === "1" && token) {
      console.log(`ℹ️ Pedido #${orderNumber}: webhook duplicado, email ya enviado.`);
      return res.status(200).json({
        ok: true,
        duplicate: true,
        orderNumber,
        productName: cfg.productName,
      });
    }

    if (!token) token = randomToken();

    const customerName =
      String(order?.customer?.first_name || "").trim() ||
      String(order?.billing_address?.first_name || "").trim() ||
      String(order?.shipping_address?.first_name || "").trim() ||
      "";

    const session = {
      token,
      manual: cfg.manual,
      automated: cfg.automated,
      productName: cfg.productName,
      deckId: cfg.deckId,
      pick: cfg.pick,
      orderNumber,
      customerEmail,
      customerName,
      createdAt: Date.now(),
    };

    const ttl = 60 * 60 * 24 * 180;

    await redis.set(`order:${orderNumber}:token`, token, "EX", ttl);
    await redis.set(`token:${token}:session`, JSON.stringify(session), "EX", ttl);

    const accessUrl = buildReadingUrl({ cfg, token, orderNumber });

    try {
      const info = await sendAccessEmail({
        to: customerEmail,
        customerName,
        productName: cfg.productName,
        accessUrl,
        orderNumber,
      });

      await redis.set(mailSentKey, "1", "EX", ttl);

      console.log(`✅ Email de acceso enviado para pedido #${orderNumber} a ${customerEmail}`, {
        messageId: info?.messageId || null,
        duplicateWebhook: isDuplicate,
      });

      return res.status(200).json({
        ok: true,
        orderNumber,
        pick: cfg.pick,
        deckId: cfg.deckId,
        productName: cfg.productName,
        accessUrl,
        emailed: true,
      });
    } catch (mailErr) {
      console.error(`❌ Error enviando email de acceso para pedido #${orderNumber}:`, mailErr?.message || mailErr);

      await redis.del(mailSentKey);

      return res.status(500).send(`Email send failed: ${mailErr?.message || mailErr}`);
    }
  } catch (e) {
    console.error("❌ Error en /api/shopify/order-paid:", e?.message || e);
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
});

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
    await redis.del(`order:${order}:mail_sent`);

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
    const email = String(req.query.email || "").trim();
    const name = String(req.query.name || "").trim();

    if (!ADMIN_SECRET) return res.status(500).json({ error: "Missing ADMIN_SECRET" });
    if (secret !== ADMIN_SECRET) return res.status(401).json({ error: "Unauthorized" });
    if (!order) return res.status(400).json({ error: "Missing order" });
    if (!productId) return res.status(400).json({ error: "Missing product_id" });

    const cfg = detectCfgFromProductIds(new Set([productId]));
    if (!cfg.automated) return res.status(400).json({ error: "El producto no es automático" });

    const token = randomToken();

    const session = {
      token,
      manual: cfg.manual,
      automated: cfg.automated,
      productName: cfg.productName,
      deckId: cfg.deckId,
      pick: cfg.pick,
      orderNumber: order,
      customerEmail: email || null,
      customerName: name || null,
      createdAt: Date.now(),
      rebuilt: true,
      rebuiltFromProductId: productId,
    };

    const ttl = 60 * 60 * 24 * 180;
    await redis.set(`order:${order}:token`, token, "EX", ttl);
    await redis.set(`token:${token}:session`, JSON.stringify(session), "EX", ttl);
    await redis.del(`order:${order}:mail_sent`);

    const accessUrl = buildReadingUrl({ cfg, token, orderNumber: order });

    return res.json({
      ok: true,
      orderNumber: order,
      token,
      pick: cfg.pick,
      deckId: cfg.deckId,
      productName: cfg.productName,
      accessUrl,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ----------------------------
// START + graceful shutdown
// ----------------------------
const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => console.log("🚀 Server running on port", PORT));

process.on("SIGTERM", async () => {
  console.log("🧹 SIGTERM recibido. Cerrando...");
  try {
    await redis.quit?.();
  } catch {
    // ignore
  }
  server.close(() => process.exit(0));
});
