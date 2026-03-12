// server.js (ESM)
// Backend mínimo y estable para automatizados:
// - POST /api/shopify/order-paid
// - GET  /api/session?token=...
// - GET  /api/token?order=...
// - GET  /health/redis
// - Admin: clear-order / rebuild-order
//
// Flujo:
// Shopify pago -> webhook -> genera token -> guarda sesión -> envía email con botón al tapete
// Tapete -> /api/session?token=... -> valida acceso

import express from "express";
import cors from "cors";
import crypto from "crypto";
import Redis from "ioredis";
import nodemailer from "nodemailer";

const app = express();
app.use(cors());

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// --------------------------------------------------
// ENV
// --------------------------------------------------
const SHOPIFY_WEBHOOK_SECRET = String(process.env.SHOPIFY_WEBHOOK_SECRET || "").trim();
const ADMIN_SECRET = String(process.env.ADMIN_SECRET || "").trim();
const SITE_URL = String(process.env.SITE_URL || "https://eltarotdelaruedadelafortuna.com").trim();

const GMAIL_USER = String(process.env.GMAIL_USER || "").trim();
const GMAIL_APP_PASSWORD = String(process.env.GMAIL_APP_PASSWORD || "").trim();

// --------------------------------------------------
// REDIS
// --------------------------------------------------
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
    console.warn("⚠️ REDIS_URL no configurado. Se usarán stubs en memoria nula.");
    return {
      get: async () => null,
      set: async () => "OK",
      del: async () => 1,
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

// --------------------------------------------------
// MAILER
// --------------------------------------------------
function createMailer() {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.warn("⚠️ Gmail no configurado. No se enviarán correos.");
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

// --------------------------------------------------
// CONFIG PRODUCTOS AUTOMATIZADOS
// --------------------------------------------------
const ACCESS_PATHS = {
  arcanos_mayores_3: "/pages/arcanos-mayores-tirada-personalizada?spread=3",
  arcanos_mayores_12: "/pages/arcanos-mayores-tirada-personalizada?spread=12",
  angeles_4: "/pages/mensaje-de-los-angeles-tirada-de-4-cartas",
  semilla_estelar_5: "/pages/camino-de-la-semilla-estelar-tirada-de-5-cartas",
};

function detectCfgFromProductIds(productIds) {
  if (productIds.has("10496012616017")) {
    return {
      productId: "10496012616017",
      productName: "Mensaje de los Ángeles (4 cartas)",
      deckId: "angeles",
      pick: 4,
      accessPath: ACCESS_PATHS.angeles_4,
      automated: true,
    };
  }

  if (productIds.has("10495993446737")) {
    return {
      productId: "10495993446737",
      productName: "Camino de la Semilla Estelar (5 cartas)",
      deckId: "semilla_estelar",
      pick: 5,
      accessPath: ACCESS_PATHS.semilla_estelar_5,
      automated: true,
    };
  }

  if (productIds.has("10493383082321")) {
    return {
      productId: "10493383082321",
      productName: "Lectura Profunda: Análisis Completo (12 cartas)",
      deckId: "arcanos_mayores",
      pick: 12,
      accessPath: ACCESS_PATHS.arcanos_mayores_12,
      automated: true,
    };
  }

  if (productIds.has("10493369745745")) {
    return {
      productId: "10493369745745",
      productName: "Tres Puertas del Destino (3 cartas)",
      deckId: "arcanos_mayores",
      pick: 3,
      accessPath: ACCESS_PATHS.arcanos_mayores_3,
      automated: true,
    };
  }

  return null;
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

// --------------------------------------------------
// HELPERS
// --------------------------------------------------
function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

// --------------------------------------------------
// EMAIL
// --------------------------------------------------
async function sendAccessEmail({ to, customerName, orderNumber, productName, accessUrl }) {
  if (!mailer) {
    console.warn("⚠️ No hay mailer configurado.");
    return { ok: false, skipped: true, reason: "mailer_not_configured" };
  }

  if (!to) {
    console.warn("⚠️ Falta destinatario.");
    return { ok: false, skipped: true, reason: "missing_recipient" };
  }

  const safeName = customerName ? escapeHtml(customerName) : "alma bella";
  const safeProductName = escapeHtml(productName || "Tu lectura automática");
  const safeAccessUrl = escapeHtml(accessUrl);
  const safeOrder = escapeHtml(orderNumber || "");

  const subject = `✨ Tu lectura está lista — Pedido #${orderNumber}`;

  const html = `
    <div style="margin:0;padding:0;background:#f7f7fa;">
      <div style="max-width:700px;margin:0 auto;padding:24px;">
        <div style="background:#ffffff;border-radius:22px;box-shadow:0 18px 40px rgba(0,0,0,.08);overflow:hidden;">
          <div style="padding:28px 24px;background:linear-gradient(180deg,#0b0f2a,#111);color:#fff;">
            <div style="font-size:24px;font-weight:900;">✨ Tu lectura está lista</div>
            <div style="opacity:.86;margin-top:8px;">${safeProductName}</div>
          </div>

          <div style="padding:24px;">
            <p>Hola ${safeName},</p>

            <p>
              Gracias por tu compra. Tu acceso ya está preparado y puedes entrar directamente
              desde este botón:
            </p>

            <div style="margin:24px 0;text-align:center;">
              <a href="${safeAccessUrl}"
                 style="display:inline-block;padding:14px 22px;border-radius:999px;background:#111;color:#fff;text-decoration:none;font-weight:900;">
                 🔮 Accede a tu lectura
              </a>
            </div>

            <p style="font-size:14px;opacity:.8;">
              Pedido #${safeOrder}
            </p>

            <p style="font-size:13px;opacity:.75;margin-top:18px;">
              Si el botón no funciona, copia y pega este enlace en tu navegador:
            </p>

            <p style="font-size:12px;word-break:break-all;opacity:.75;">
              ${safeAccessUrl}
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  const text = [
    `Hola ${customerName || ""}`.trim(),
    "",
    "Tu lectura está lista.",
    `Producto: ${productName || "Tu lectura automática"}`,
    `Pedido: #${orderNumber}`,
    "",
    "Accede aquí:",
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

// --------------------------------------------------
// SESIÓN
// --------------------------------------------------
async function saveOrderSession({ order, cfg, source = "shopify_order_paid" }) {
  const orderNumber = normalizeOrderNumber(order);
  if (!orderNumber) throw new Error("Missing order number");
  if (!cfg) throw new Error("Missing product config");

  const existingToken = await redis.get(tokenKey(orderNumber));
  const token = existingToken || randomToken();

  const session = {
    token,
    orderNumber,
    orderId: String(order?.id || "").trim() || null,
    email: getOrderEmail(order) || null,
    customerName: getCustomerName(order) || null,
    productId: cfg.productId,
    productName: cfg.productName,
    deckId: cfg.deckId,
    pick: cfg.pick,
    accessPath: cfg.accessPath,
    automated: true,
    createdAt: Date.now(),
    source,
  };

  const ttl = 60 * 60 * 24 * 180;

  await redis.set(tokenKey(orderNumber), token, "EX", ttl);
  await redis.set(sessionKey(token), JSON.stringify(session), "EX", ttl);

  console.log("💾 Sesión guardada", {
    orderNumber,
    token,
    email: session.email,
    productId: session.productId,
    productName: session.productName,
  });

  return session;
}

async function processOrderAndMaybeSendEmail(order, source = "shopify_order_paid") {
  const orderNumber = normalizeOrderNumber(order);
  if (!orderNumber) throw new Error("Missing order number");

  const cfg = detectCfgFromOrder(order);

  if (!cfg) {
    console.log("ℹ️ Pedido ignorado: no corresponde a un automatizado", {
      orderNumber,
      lineItems: Array.isArray(order?.line_items)
        ? order.line_items.map((li) => ({
            product_id: li?.product_id || null,
            title: li?.title || null,
          }))
        : [],
    });

    return {
      ok: true,
      ignored: true,
      reason: "non_automated_product",
      orderNumber,
    };
  }

  const session = await saveOrderSession({ order, cfg, source });

  const alreadySent = await redis.get(emailWasAlreadySentKey(orderNumber));
  if (alreadySent) {
    console.log("ℹ️ Email ya enviado para pedido", orderNumber);
    return {
      ok: true,
      orderNumber,
      token: session.token,
      email: { ok: false, skipped: true, reason: "already_sent" },
    };
  }

  const accessUrl = buildAccessUrl({
    token: session.token,
    orderNumber,
    accessPath: cfg.accessPath,
  });

  console.log("📩 Enviando email acceso", {
    to: session.email,
    orderNumber,
    productId: cfg.productId,
    productName: cfg.productName,
    accessUrl,
  });

  const emailResult = await sendAccessEmail({
    to: session.email,
    customerName: session.customerName,
    orderNumber,
    productName: session.productName,
    accessUrl,
  });

  console.log("📩 Resultado email", emailResult);

  if (emailResult.ok) {
    await redis.set(emailWasAlreadySentKey(orderNumber), "1", "EX", 60 * 60 * 24 * 180);
  }

  return {
    ok: true,
    orderNumber,
    token: session.token,
    email: emailResult,
  };
}

// --------------------------------------------------
// ROUTES
// --------------------------------------------------
app.get("/", (req, res) => {
  res.send("API de Tarot automatizado en funcionamiento ✅");
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
    if (!order) return res.status(400).json({ ok: false, error: "Missing order" });

    const token = await redis.get(tokenKey(order));
    if (!token) return res.status(404).json({ ok: false, error: "Order not found" });

    return res.json({ ok: true, token });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get("/api/session", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return res.status(400).json({ ok: false, error: "Missing token" });

    const raw = await redis.get(sessionKey(token));
    if (!raw) return res.status(404).json({ ok: false, error: "Session not found" });

    return res.json(JSON.parse(raw));
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post("/api/shopify/order-paid", async (req, res) => {
  console.log("➡️ Entró webhook /api/shopify/order-paid");

  try {
    if (!SHOPIFY_WEBHOOK_SECRET) {
      console.error("❌ Missing SHOPIFY_WEBHOOK_SECRET");
      return res.status(500).send("Missing SHOPIFY_WEBHOOK_SECRET");
    }

    const hmac = req.get("X-Shopify-Hmac-Sha256");
    const rawBody = req.rawBody;

    console.log("🧾 Headers webhook", {
      hasHmac: !!hmac,
      contentType: req.get("content-type") || null,
      rawBodyLength: rawBody?.length || 0,
    });

    if (!rawBody) {
      console.error("❌ Missing rawBody");
      return res.status(400).send("Missing rawBody");
    }

    const hmacOk = verifyShopifyHmac(rawBody, hmac);
    console.log("🔐 Resultado HMAC", { hmacOk });

    if (!hmacOk) {
      console.error("❌ Invalid HMAC /api/shopify/order-paid");
      return res.status(401).send("Invalid HMAC");
    }

    const order = req.body || {};
    const orderNumber = normalizeOrderNumber(order);
    const email = getOrderEmail(order);

    console.log("🛒 Pedido recibido", {
      orderId: order?.id || null,
      orderNumber,
      email,
      lineItems: Array.isArray(order?.line_items)
        ? order.line_items.map((li) => ({
            product_id: li?.product_id || null,
            title: li?.title || null,
          }))
        : [],
    });

    if (!orderNumber) {
      console.error("❌ Missing order number");
      return res.status(400).send("Missing order number");
    }

    res.status(200).json({
      ok: true,
      received: true,
      orderNumber,
    });

    setImmediate(async () => {
      try {
        console.log("⚙️ Background processing start", { orderNumber });

        const result = await processOrderAndMaybeSendEmail(order, "shopify_order_paid");

        console.log("✅ Background processing done", {
          orderNumber,
          result,
        });
      } catch (e) {
        console.error("❌ Background /api/shopify/order-paid error:", e?.stack || e);
      }
    });
  } catch (e) {
    console.error("❌ /api/shopify/order-paid error:", e?.stack || e);
    return res.status(500).send(e?.message || "Internal error");
  }
});

app.post("/webhooks/orders-create", async (req, res) => {
  return res.status(410).json({
    ok: false,
    disabled: true,
    message: "Use /api/shopify/order-paid",
  });
});

// --------------------------------------------------
// ADMIN
// --------------------------------------------------
app.get("/api/admin/clear-order", async (req, res) => {
  try {
    const secret = String(req.query.secret || "").trim();
    const order = String(req.query.order || "").trim();

    if (!ADMIN_SECRET) return res.status(500).json({ ok: false, error: "Missing ADMIN_SECRET" });
    if (secret !== ADMIN_SECRET) return res.status(401).json({ ok: false, error: "Unauthorized" });
    if (!order) return res.status(400).json({ ok: false, error: "Missing order" });

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
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get("/api/admin/rebuild-order", async (req, res) => {
  try {
    const secret = String(req.query.secret || "").trim();
    const order = String(req.query.order || "").trim();
    const productId = String(req.query.product_id || "").trim();
    const email = String(req.query.email || "").trim();
    const customerName = String(req.query.customer_name || "").trim();

    if (!ADMIN_SECRET) return res.status(500).json({ ok: false, error: "Missing ADMIN_SECRET" });
    if (secret !== ADMIN_SECRET) return res.status(401).json({ ok: false, error: "Unauthorized" });
    if (!order) return res.status(400).json({ ok: false, error: "Missing order" });
    if (!productId) return res.status(400).json({ ok: false, error: "Missing product_id" });

    const cfg = detectCfgFromProductIds(new Set([productId]));
    if (!cfg) {
      return res.status(400).json({ ok: false, error: "Unsupported automated product_id" });
    }

    const existingToken = await redis.get(tokenKey(order));
    const token = existingToken || randomToken();

    const session = {
      token,
      orderNumber: order,
      orderId: null,
      email: email || null,
      customerName: customerName || null,
      productId: cfg.productId,
      productName: cfg.productName,
      deckId: cfg.deckId,
      pick: cfg.pick,
      accessPath: cfg.accessPath,
      automated: true,
      rebuilt: true,
      createdAt: Date.now(),
    };

    const ttl = 60 * 60 * 24 * 180;
    await redis.set(tokenKey(order), token, "EX", ttl);
    await redis.set(sessionKey(token), JSON.stringify(session), "EX", ttl);
    await redis.del(emailWasAlreadySentKey(order));

    return res.json({
      ok: true,
      orderNumber: order,
      token,
      accessUrl: buildAccessUrl({
        token,
        orderNumber: order,
        accessPath: cfg.accessPath,
      }),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// --------------------------------------------------
// START
// --------------------------------------------------
const PORT = process.env.PORT || 8080;

const server = app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});

process.on("SIGTERM", async () => {
  console.log("🧹 SIGTERM recibido. Cerrando...");
  try {
    await redis.quit?.();
  } catch {}
  server.close(() => process.exit(0));
});
