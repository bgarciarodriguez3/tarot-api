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
  } catch {}

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
    return {
      get: async () => null,
      set: async () => null,
      del: async () => null,
      expire: async () => null,
      ping: async () => "NO_REDIS",
      on: () => {},
      quit: async () => {},
    };
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

const SITE_URL = (process.env.SITE_URL || "https://eltarotdelaruedadelafortuna.com").trim();

const GMAIL_USER = (process.env.GMAIL_USER || "").trim();
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || "").trim();

const ACCESS_PATHS = {
  arcanos_mayores_3: "/pages/arcanos-mayores-tirada-personalizada?spread=3",
  arcanos_mayores_12: "/pages/arcanos-mayores-tirada-personalizada?spread=12",
  angeles_4: "/pages/mensaje-de-los-angeles-tirada-de-4-cartas",
  semilla_estelar_5: "/pages/camino-de-la-semilla-estelar-tirada-de-5-cartas",
};

// ----------------------------
// MAILER
// ----------------------------
function createMailer() {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.warn("⚠️ Gmail no configurado. No se enviarán correos de acceso.");
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });
}

const mailer = createMailer();

// ----------------------------
// HELPERS
// ----------------------------
function verifyShopifyHmac(rawBody, hmacHeader) {
  if (!SHOPIFY_WEBHOOK_SECRET) return false;
  if (!rawBody || !hmacHeader) return false;

  const digest = crypto
    .createHmac("sha256", SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(String(hmacHeader))
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

function getOrderEmail(order) {
  return (
    String(order?.email || "").trim() ||
    String(order?.contact_email || "").trim() ||
    String(order?.customer?.email || "").trim()
  );
}

function getCustomerName(order) {
  const first = String(order?.customer?.first_name || "").trim();
  const last = String(order?.customer?.last_name || "").trim();
  return [first, last].filter(Boolean).join(" ").trim();
}

function detectCfgFromProductIds(productIds) {
  if (productIds.has("10496012616017")) {
    return {
      productId: "10496012616017",
      productName: "Mensaje de los Ángeles (4 cartas)",
      deckId: "angeles",
      pick: 4,
      manual: false,
      accessPath: ACCESS_PATHS.angeles_4,
    };
  }

  if (productIds.has("10495993446737")) {
    return {
      productId: "10495993446737",
      productName: "Camino de la Semilla Estelar (5 cartas)",
      deckId: "semilla_estelar",
      pick: 5,
      manual: false,
      accessPath: ACCESS_PATHS.semilla_estelar_5,
    };
  }

  if (productIds.has("10493383082321")) {
    return {
      productId: "10493383082321",
      productName: "Lectura Profunda: Análisis Completo (12 cartas)",
      deckId: "arcanos_mayores",
      pick: 12,
      manual: false,
      accessPath: ACCESS_PATHS.arcanos_mayores_12,
    };
  }

  if (productIds.has("10493369745745")) {
    return {
      productId: "10493369745745",
      productName: "Tres Puertas del Destino (3 cartas)",
      deckId: "arcanos_mayores",
      pick: 3,
      manual: false,
      accessPath: ACCESS_PATHS.arcanos_mayores_3,
    };
  }

  return {
    productId: null,
    productName: "Tu lectura (3 cartas)",
    deckId: "arcanos_mayores",
    pick: 3,
    manual: false,
    accessPath: ACCESS_PATHS.arcanos_mayores_3,
  };
}

function detectCfgFromOrder(order) {
  const items = Array.isArray(order?.line_items) ? order.line_items : [];
  const productIds = new Set(
    items
      .map((li) => String(li?.product_id || "").trim())
      .filter(Boolean)
  );
  return detectCfgFromProductIds(productIds);
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

function weekKeyUTC(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  const yyyy = date.getUTCFullYear();
  return `${yyyy}-W${String(weekNo).padStart(2, "0")}`;
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

function buildAccessUrl({ token, orderNumber, accessPath }) {
  const orderParam = orderNumber ? `&order=${encodeURIComponent(orderNumber)}` : "";
  return `${SITE_URL}${accessPath}${accessPath.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}${orderParam}`;
}

function emailWasAlreadySentKey(orderNumber) {
  return `order:${orderNumber}:email_sent`;
}

function tokenKey(orderNumber) {
  return `order:${orderNumber}:token`;
}

function sessionKey(token) {
  return `token:${token}:session`;
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
    } catch {}
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

  if (!r.ok) {
    throw new Error(`Shopify GraphQL HTTP ${r.status}: ${JSON.stringify(json).slice(0, 900)}`);
  }
  if (json.errors?.length) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors).slice(0, 900)}`);
  }

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
// EMAIL acceso lectura
// ----------------------------
async function sendAccessEmail({ to, customerName, orderNumber, productName, accessUrl }) {
  if (!mailer) {
    console.warn("⚠️ No hay mailer configurado. Saltando envío email acceso.");
    return { ok: false, skipped: true, reason: "mailer_not_configured" };
  }

  if (!to) {
    return { ok: false, skipped: true, reason: "missing_recipient" };
  }

  const subject = `Tu acceso a la lectura automática #${orderNumber}`;
  const safeName = customerName ? escapeHtml(customerName) : "alma bella";

  const html = `
    <div style="margin:0; padding:0; background:#f7f7fa;">
      <div style="max-width:700px; margin:0 auto; padding:24px;">
        <div style="background:#ffffff; border-radius:22px; box-shadow:0 18px 40px rgba(0,0,0,.08); overflow:hidden;">
          <div style="padding:28px 24px; background:linear-gradient(180deg,#0b0f2a,#111); color:#fff;">
            <div style="font-size:24px; font-weight:900;">✨ Tu lectura está lista</div>
            <div style="opacity:.86; margin-top:8px;">${escapeHtml(productName || "Lectura automática")}</div>
          </div>

          <div style="padding:24px;">
            <p>Hola ${safeName},</p>
            <p>Gracias por tu compra. Ya puedes acceder a tu lectura automática desde este botón:</p>

            <div style="margin:24px 0; text-align:center;">
              <a href="${escapeHtml(accessUrl)}"
                 style="display:inline-block; padding:14px 22px; border-radius:999px; background:#111; color:#fff; text-decoration:none; font-weight:900;">
                 🔮 Acceder a mi lectura
              </a>
            </div>

            <p style="font-size:14px; opacity:.8;">
              Pedido #${escapeHtml(orderNumber)}
            </p>

            <p style="font-size:13px; opacity:.75; margin-top:18px;">
              Si el botón no funciona, copia y pega este enlace en tu navegador:
            </p>
            <p style="font-size:12px; word-break:break-all; opacity:.75;">
              ${escapeHtml(accessUrl)}
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  const text = [
    `Hola ${customerName || ""}`.trim(),
    "",
    `Tu lectura automática ya está lista.`,
    `Producto: ${productName || "Lectura automática"}`,
    `Pedido: #${orderNumber}`,
    "",
    `Accede aquí:`,
    accessUrl,
  ].join("\n");

  await mailer.sendMail({
    from: `"La Rueda de la Fortuna" <${GMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  });

  return { ok: true };
}

// ----------------------------
// Guardar sesión
// ----------------------------
async function saveOrderSession({ order, cfg }) {
  const orderNumber = normalizeOrderNumber(order);
  if (!orderNumber) throw new Error("Missing order number");

  const existingToken = await redis.get(tokenKey(orderNumber));
  const token = existingToken || randomToken();

  const session = {
    token,
    orderNumber,
    orderId: String(order?.id || "").trim() || null,
    email: getOrderEmail(order) || null,
    customerName: getCustomerName(order) || null,
    manual: cfg.manual,
    productName: cfg.productName,
    deckId: cfg.deckId,
    pick: cfg.pick,
    accessPath: cfg.accessPath,
    productId: cfg.productId,
    createdAt: Date.now(),
    source: "shopify_order_paid",
  };

  const ttl = 60 * 60 * 24 * 180;
  await redis.set(tokenKey(orderNumber), token, "EX", ttl);
  await redis.set(sessionKey(token), JSON.stringify(session), "EX", ttl);

  return session;
}

// ----------------------------
// CRON
// ----------------------------
const AUTOMATED_PRODUCTS = [
  "10493369745745", // 3 cartas
  "10496012616017", // ángeles
  "10495993446737", // semilla
  "10493383082321", // 12 cartas
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

// ----------------------------
// ROUTES
// ----------------------------
app.get("/", (req, res) => {
  res.send("API de Tarot en funcionamiento ✅");
});

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

    const token = await redis.get(tokenKey(order));
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

    const raw = await redis.get(sessionKey(token));
    if (!raw) return res.status(404).json({ error: "Session not found" });

    return res.json(JSON.parse(raw));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/shopify/order-paid", async (req, res) => {
  try {
    if (!SHOPIFY_WEBHOOK_SECRET) {
      return res.status(500).send("Missing SHOPIFY_WEBHOOK_SECRET");
    }

    const hmac = req.get("X-Shopify-Hmac-Sha256");
    const rawBody = req.rawBody;

    if (!rawBody) {
      return res.status(400).send("Missing rawBody");
    }

    if (!verifyShopifyHmac(rawBody, hmac)) {
      console.error("❌ Invalid HMAC");
      return res.status(401).send("Invalid HMAC");
    }

    const order = req.body;
    const orderNumber = normalizeOrderNumber(order);

    if (!orderNumber) {
      return res.status(400).send("Missing order number");
    }

    const cfg = detectCfgFromOrder(order);
    const session = await saveOrderSession({ order, cfg });

    // idempotencia: no reenviar correo si ya fue enviado
    const alreadySent = await redis.get(emailWasAlreadySentKey(orderNumber));
    let emailResult = { ok: false, skipped: true, reason: "already_sent" };

    if (!alreadySent) {
      const accessUrl = buildAccessUrl({
        token: session.token,
        orderNumber,
        accessPath: cfg.accessPath,
      });

      emailResult = await sendAccessEmail({
        to: session.email,
        customerName: session.customerName,
        orderNumber,
        productName: session.productName,
        accessUrl,
      });

      if (emailResult.ok) {
        await redis.set(emailWasAlreadySentKey(orderNumber), "1", "EX", 60 * 60 * 24 * 180);
      }
    }

    return res.status(200).json({
      ok: true,
      orderNumber,
      token: session.token,
      deckId: session.deckId,
      pick: session.pick,
      email: emailResult,
    });
  } catch (e) {
    console.error("❌ /api/shopify/order-paid error:", e);
    return res.status(500).send(e.message);
  }
});

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
    console.error("❌ cron/weekly-refresh:", e);
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

    const token = await redis.get(tokenKey(order));

    if (token) {
      await redis.del(sessionKey(token));
    }

    await redis.del(tokenKey(order));
    await redis.del(emailWasAlreadySentKey(order));

    return res.json({
      ok: true,
      clearedOrder: order,
      clearedToken: token || null,
    });
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
    const customerName = String(req.query.customer_name || "").trim();

    if (!ADMIN_SECRET) return res.status(500).json({ error: "Missing ADMIN_SECRET" });
    if (secret !== ADMIN_SECRET) return res.status(401).json({ error: "Unauthorized" });
    if (!order) return res.status(400).json({ error: "Missing order" });
    if (!productId) return res.status(400).json({ error: "Missing product_id" });

    const cfg = detectCfgFromProductIds(new Set([productId]));
    const existingToken = await redis.get(tokenKey(order));
    const token = existingToken || randomToken();

    const session = {
      token,
      orderNumber: order,
      orderId: null,
      email: email || null,
      customerName: customerName || null,
      manual: cfg.manual,
      productName: cfg.productName,
      deckId: cfg.deckId,
      pick: cfg.pick,
      accessPath: cfg.accessPath,
      productId: cfg.productId,
      createdAt: Date.now(),
      rebuilt: true,
      rebuiltFromProductId: productId,
    };

    const ttl = 60 * 60 * 24 * 180;
    await redis.set(tokenKey(order), token, "EX", ttl);
    await redis.set(sessionKey(token), JSON.stringify(session), "EX", ttl);
    await redis.del(emailWasAlreadySentKey(order));

    return res.json({
      ok: true,
      orderNumber: order,
      token,
      pick: cfg.pick,
      deckId: cfg.deckId,
      accessUrl: buildAccessUrl({
        token,
        orderNumber: order,
        accessPath: cfg.accessPath,
      }),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ----------------------------
// START + graceful shutdown
// ----------------------------
const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});

process.on("SIGTERM", async () => {
  console.log("🧹 SIGTERM recibido. Cerrando...");
  try { await redis.quit?.(); } catch {}
  server.close(() => process.exit(0));
});
