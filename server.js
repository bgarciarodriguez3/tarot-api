// server.js (ESM)
// Backend mínimo y estable para automatizados

import express from "express";
import cors from "cors";
import crypto from "crypto";
import Redis from "ioredis";
import { Resend } from "resend";

const app = express();

const ALLOWED_ORIGINS = [
  "https://eltarotdelaruedadelafortuna.com",
  "https://www.eltarotdelaruedadelafortuna.com",
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options(
  "*",
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

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

const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const EMAIL_FROM = String(process.env.EMAIL_FROM || "").trim();

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
    console.warn("⚠️ REDIS_URL no configurado");
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
  });

  client.on("connect", () => console.log("✅ Redis connect"));
  client.on("ready", () => console.log("✅ Redis ready"));
  client.on("error", (err) => console.error("❌ Redis error:", err?.message || err));

  return client;
}

const redis = createRedisClient();

// --------------------------------------------------
// MAILER (RESEND)
// --------------------------------------------------

function createResendClient() {
  if (!RESEND_API_KEY) {
    console.warn("⚠️ RESEND_API_KEY no configurado.");
    return null;
  }

  return new Resend(RESEND_API_KEY);
}

const resend = createResendClient();

// --------------------------------------------------
// CONFIG PRODUCTOS
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
    items.map((li) => String(li?.product_id || "").trim()).filter(Boolean)
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
  return `${SITE_URL}${accessPath}${
    accessPath.includes("?") ? "&" : "?"
  }token=${encodeURIComponent(token)}${orderParam}`;
}

// --------------------------------------------------
// EMAIL
// --------------------------------------------------

async function sendAccessEmail({ to, customerName, orderNumber, productName, accessUrl }) {
  if (!resend) {
    console.warn("⚠️ Resend no configurado.");
    return { ok: false, error: "Resend no configurado" };
  }

  if (!EMAIL_FROM) {
    console.warn("⚠️ EMAIL_FROM no configurado.");
    return { ok: false, error: "EMAIL_FROM no configurado" };
  }

  const safeName = customerName || "alma bella";
  const safeProduct = productName || "Tu lectura automática";

  const subject = `✨ Tu lectura está lista — Pedido #${orderNumber}`;

  const html = `
<div style="font-family:Arial,sans-serif;padding:20px;background:#f6f6f8;">
  <div style="max-width:700px;margin:0 auto;background:#fff;border-radius:20px;padding:24px;box-shadow:0 12px 30px rgba(0,0,0,.08);">
    <h2 style="margin-top:0;">✨ Tu lectura está lista</h2>
    <p>Hola ${escapeHtml(safeName)},</p>
    <p>Tu lectura <b>${escapeHtml(safeProduct)}</b> ya está disponible.</p>

    <p style="margin:30px 0">
      <a href="${escapeHtml(accessUrl)}"
         style="background:#111;color:#fff;padding:14px 20px;border-radius:30px;text-decoration:none;display:inline-block;font-weight:700;">
         🔮 Acceder a tu lectura
      </a>
    </p>

    <p>Pedido #${escapeHtml(orderNumber)}</p>

    <p style="font-size:12px;opacity:.8;margin-top:18px;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:
    </p>
    <p style="font-size:12px;word-break:break-all;opacity:.85;">
      ${escapeHtml(accessUrl)}
    </p>
  </div>
</div>
`;

  const text = [
    `Hola ${safeName}`,
    "",
    `Tu lectura ${safeProduct} ya está disponible.`,
    `Pedido #${orderNumber}`,
    "",
    "Accede aquí:",
    accessUrl,
  ].join("\n");

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    text,
    html,
  });

  if (error) {
    console.error("❌ Resend error:", error);
    return { ok: false, error: error.message || "No se pudo enviar el email" };
  }

  console.log("✅ Email enviado con Resend", {
    orderNumber,
    id: data?.id || null,
  });

  return { ok: true, id: data?.id || null };
}

// --------------------------------------------------
// SESIÓN
// --------------------------------------------------

function tokenKey(orderNumber) {
  return `order:${orderNumber}:token`;
}

function sessionKey(token) {
  return `token:${token}:session`;
}

async function saveOrderSession({ order, cfg }) {
  const orderNumber = normalizeOrderNumber(order);
  const existingToken = await redis.get(tokenKey(orderNumber));
  const token = existingToken || randomToken();

  const session = {
    token,
    orderNumber,
    email: getOrderEmail(order),
    customerName: getCustomerName(order),
    productName: cfg.productName,
    productId: cfg.productId,
    deckId: cfg.deckId,
    accessPath: cfg.accessPath,
    pick: cfg.pick,
    automated: true,
    createdAt: Date.now(),
  };

  await redis.set(tokenKey(orderNumber), token);
  await redis.set(sessionKey(token), JSON.stringify(session));

  console.log("💾 Sesión guardada", { orderNumber, token });

  return session;
}

// --------------------------------------------------
// WEBHOOK SHOPIFY
// --------------------------------------------------

app.post("/api/shopify/order-paid", async (req, res) => {
  console.log("➡️ Entró webhook /api/shopify/order-paid");

  try {
    const order = req.body || {};
    const orderNumber = normalizeOrderNumber(order);

    const cfg = detectCfgFromOrder(order);

    if (!cfg) {
      console.log("Pedido ignorado: no automatizado");
      return res.json({ ok: true, ignored: true });
    }

    const session = await saveOrderSession({ order, cfg });

    const accessUrl = buildAccessUrl({
      token: session.token,
      orderNumber,
      accessPath: cfg.accessPath,
    });

    const emailResult = await sendAccessEmail({
      to: session.email,
      customerName: session.customerName,
      orderNumber,
      productName: cfg.productName,
      accessUrl,
    });

    return res.json({ ok: true, email: emailResult });
  } catch (e) {
    console.error("❌ /api/shopify/order-paid error:", e?.stack || e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Error interno",
    });
  }
});

// --------------------------------------------------
// API LECTURA
// --------------------------------------------------

app.post("/api/reading/result", async (req, res) => {
  try {
    const { spread, cards } = req.body || {};

    return res.json({
      ok: true,
      title: "Tu lectura",
      short: `Has realizado una tirada de ${spread || 0} cartas.`,
      long: Array.isArray(cards) && cards.length
        ? "Las cartas seleccionadas ya están listas para interpretarse."
        : "No se recibieron cartas.",
    });
  } catch (e) {
    console.error("❌ /api/reading/result error:", e?.stack || e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Error interno",
    });
  }
});

app.post("/api/reading/email", async (req, res) => {
  try {
    if (!resend) {
      return res.status(500).json({
        ok: false,
        error: "Resend no configurado",
      });
    }

    if (!EMAIL_FROM) {
      return res.status(500).json({
        ok: false,
        error: "EMAIL_FROM no configurado",
      });
    }

    const {
      to,
      subject,
      text,
      html,
      order,
      spread,
      cards,
    } = req.body || {};

    if (!to || !String(to).includes("@")) {
      return res.status(400).json({
        ok: false,
        error: "Email inválido",
      });
    }

    const safeSubject =
      String(subject || "").trim() ||
      `✨ Tu lectura está lista${order ? ` — Pedido #${order}` : ""}`;

    const fallbackText = [
      "✨ Tu lectura",
      order ? `Pedido: #${order}` : "",
      spread ? `Tirada: ${spread} cartas` : "",
      "",
      String(text || "").trim(),
      "",
      Array.isArray(cards) && cards.length
        ? "Cartas:\n" +
          cards
            .map((c, i) => {
              const inv = c?.inverted ? " (Invertida)" : "";
              const desc = c?.description ? `\n${c.description}` : "";
              return `${i + 1}. ${c?.name || "Carta"}${inv}${desc}`;
            })
            .join("\n\n")
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const fallbackHtml = html || `
      <div style="margin:0;padding:0;background:#f6f6f8;">
        <div style="max-width:720px;margin:0 auto;padding:22px;">
          <div style="border-radius:22px;padding:20px;background:linear-gradient(180deg,#0b0f2a,#111);color:#fff;box-shadow:0 18px 50px rgba(0,0,0,.18);">
            <div style="font-size:18px;font-weight:900;">✨ Tu lectura</div>
            ${order ? `<div style="opacity:.85;margin-top:6px;font-size:13px;">Pedido #${escapeHtml(order)}</div>` : ""}
          </div>

          <div style="border-radius:22px;padding:18px;background:#fff;margin-top:14px;box-shadow:0 14px 40px rgba(0,0,0,.06);border:1px solid rgba(0,0,0,.06);">
            <div style="white-space:pre-wrap;line-height:1.6;font-size:14px;color:#111;">${escapeHtml(fallbackText)}</div>
          </div>
        </div>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: safeSubject,
      text: fallbackText,
      html: fallbackHtml,
    });

    if (error) {
      console.error("❌ /api/reading/email Resend error:", error);
      return res.status(500).json({
        ok: false,
        error: error.message || "No se pudo enviar el email",
      });
    }

    console.log("✅ Lectura enviada por email", {
      to,
      order: order || null,
      id: data?.id || null,
    });

    return res.json({
      ok: true,
      id: data?.id || null,
    });
  } catch (e) {
    console.error("❌ /api/reading/email error:", e?.stack || e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Error interno",
    });
  }
});

// --------------------------------------------------
// SESSION API
// --------------------------------------------------

app.get("/api/session", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();

    if (!token) {
      return res.status(400).json({
        ok: false,
        error: "Missing token",
      });
    }

    const raw = await redis.get(sessionKey(token));

    if (!raw) {
      return res.status(404).json({
        ok: false,
        error: "Session not found",
      });
    }

    return res.json(JSON.parse(raw));
  } catch (e) {
    console.error("❌ /api/session error:", e?.stack || e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Error interno",
    });
  }
});

// --------------------------------------------------
// HEALTH
// --------------------------------------------------

app.get("/health/redis", async (req, res) => {
  try {
    const pong = await redis.ping();
    res.json({ ok: true, redis: pong });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e?.message || "Redis error",
    });
  }
});

// --------------------------------------------------
// START
// --------------------------------------------------

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("🚀 Server running on", PORT);
});
