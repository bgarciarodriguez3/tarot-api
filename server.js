// server.js
"use strict";

require("dotenv").config(); // OK aunque en Railway no siempre haga falta

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { OpenAI } = require("openai");
const { createClient } = require("redis");
const { Resend } = require("resend");

const app = express();

// ------------------------------------------------------
// 0) MIDDLEWARES
// ------------------------------------------------------
app.set("trust proxy", 1);

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());
app.use(express.json({ limit: "1mb" }));

// Logs (Railway)
app.use((req, res, next) => {
  const t = new Date().toISOString();
  console.log(`[${t}] ${req.method} ${req.originalUrl}`);
  next();
});

// ------------------------------------------------------
// 1) OPENAI
// ------------------------------------------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ------------------------------------------------------
// 2) CONFIG PRODUCTOS
// ------------------------------------------------------
const VARIANT_CONFIG = {
  "52443282112849": {
    productName: "Tres Puertas del Destino (3 Cartas).",
    deckId: "arcanos_mayores",
    deckName: "Tarot Arcanos Mayores",
    pick: 3,
    manual: true,
  },

  "52457830154577": {
    productName: "Camino de la Semilla Estelar (5 Cartas)",
    deckId: "semilla_estelar",
    deckName: "Tarot Semilla Estelar",
    pick: 5,
  },

  "52457929867601": {
    productName: "Mensaje de los Ángeles ✨ Lectura Angelical Premium de 4 Cartas",
    deckId: "angeles",
    deckName: "Tarot de los Ángeles",
    pick: 4,
    manual: true,
  },

  "52443409383761": {
    productName: "Lectura Profunda: Análisis Completo (12 Cartas)",
    deckId: "arcanos_mayores",
    deckName: "Tarot Arcanos Mayores",
    pick: 12,
  },

  "52458382459217": {
    productName: "Mentoría de Claridad Total",
    manual: true,
  },
  "52570216857937": {
    productName: "Tarot del Amor Premium",
    manual: true,
  },
};

// ------------------------------------------------------
// 3) SESIONES + REDIS
// ------------------------------------------------------
const sessions = new Map();
const SESSION_TTL_SEC = 86400; // 24h

const redis = process.env.REDIS_URL
  ? createClient({ url: process.env.REDIS_URL })
  : null;

let REDIS_CONNECTED = false;

async function setSession(token, obj) {
  if (redis && REDIS_CONNECTED) {
    await redis.set(`sess:${token}`, JSON.stringify(obj), {
      EX: SESSION_TTL_SEC,
    });
    return;
  }
  sessions.set(token, obj);
}

async function getSession(token) {
  if (redis && REDIS_CONNECTED) {
    const raw = await redis.get(`sess:${token}`);
    return raw ? JSON.parse(raw) : null;
  }
  return sessions.get(token) || null;
}

// ------------------------------------------------------
// 4) EMAIL HELPERS (Resend)
// ------------------------------------------------------
function buildAccessEmailHtml({ customerEmail, links }) {
  const items = links
    .map(
      (l) => `
        <li style="margin: 10px 0;">
          <div style="font-weight:600;">${escapeHtml(l.name)}</div>
          <a href="${escapeHtml(l.url)}" style="color:#6b46c1;">Abrir mi lectura</a>
        </li>
      `
    )
    .join("");

  return `
  <div style="font-family:Arial,sans-serif;background:#f6f6fb;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #eee;">
      <div style="padding:20px 22px;background:#1b1036;color:#fff;">
        <h2 style="margin:0;font-size:18px;">Acceso a tu lectura 🔮</h2>
        <div style="opacity:.9;font-size:13px;margin-top:6px;">${escapeHtml(customerEmail)}</div>
      </div>
      <div style="padding:22px;">
        <p style="margin-top:0;">Gracias por tu compra ✨</p>
        <p>Aquí tienes el acceso a tu lectura:</p>
        <ul style="padding-left:18px;margin:14px 0;">
          ${items}
        </ul>
        <p style="color:#666;font-size:13px;margin-top:18px;">
          Si tienes cualquier problema, responde a este email y te ayudamos.
        </p>
      </div>
    </div>
  </div>`;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ------------------------------------------------------
// 5) RUTAS API
// ------------------------------------------------------
app.get("/", (req, res) => {
  res.send("API de Tarot Activa ✅");
});

// ---- (A) Endpoint de prueba para navegador ----
app.get("/api/shopify/order-paid", (req, res) => {
  res.status(200).json({
    ok: true,
    message: "Este endpoint es POST. Shopify debe llamarlo como webhook (order paid).",
  });
});

// ---- (B) Webhook real: Shopify Order Paid → Email 1 ----
app.post("/api/shopify/order-paid", async (req, res) => {
  try {
    const order = req.body || {};
    const email = (order.email || "").toString().trim();
    const order_id = order.id;

    if (!email || !order_id) {
      return res.status(400).json({ ok: false, error: "missing_email_or_order_id" });
    }

    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
      return res.status(500).json({ ok: false, error: "missing_resend_env" });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const links = [];

    for (const item of order.line_items || []) {
      const variant_id = String(item.variant_id || "");
      const cfg = VARIANT_CONFIG[variant_id];
      if (!cfg) continue;

      const token = crypto.randomBytes(24).toString("hex");

      await setSession(token, {
        ...cfg,
        order_id,
        email,
        used: false,
      });

      const base = cfg.manual
        ? "https://eltarotdelaruedadelafortuna.com/pages/premium"
        : "https://eltarotdelaruedadelafortuna.com/pages/lectura";

      links.push({
        name: cfg.productName,
        url: `${base}?token=${token}`,
      });
    }

    if (links.length === 0) {
      // No rompemos el webhook si el pedido no es de lecturas reconocidas
      return res.status(200).json({ ok: true, note: "no_matching_variants" });
    }

    const subject = "Tu acceso a la lectura 🔮";
    const html = buildAccessEmailHtml({ customerEmail: email, links });

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: email,
      subject,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      return res.status(500).json({ ok: false, error: error.message || "resend_failed" });
    }

    return res.status(200).json({ ok: true, messageId: data?.id || null, links: links.length });
  } catch (e) {
    console.error("order-paid error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "server_error" });
  }
});

// ---- Crea link con token (sin enviar email; útil para llamadas internas) ----
app.post("/api/create-link", async (req, res) => {
  const { order_id, email, variant_id } = req.body || {};

  const cfg = VARIANT_CONFIG[String(variant_id)];
  if (!cfg) {
    return res.status(400).json({ error: "Producto no reconocido" });
  }

  const token = crypto.randomBytes(24).toString("hex");

  await setSession(token, {
    ...cfg,
    order_id,
    email,
    used: false,
  });

  const base = cfg.manual
    ? "https://eltarotdelaruedadelafortuna.com/pages/premium"
    : "https://eltarotdelaruedadelafortuna.com/pages/lectura";

  return res.json({
    ok: true,
    link: `${base}?token=${token}`,
  });
});

// ---- Devuelve sesión por token ----
app.get("/api/session", async (req, res) => {
  try {
    const token = (req.query.token || "").toString().trim();

    if (!token) {
      return res.status(400).json({ ok: false, error: "missing_token" });
    }

    const s = await getSession(token);

    if (!s) {
      return res.status(404).json({ ok: false, error: "session_not_found" });
    }

    if (s.used) {
      return res.status(410).json({ ok: false, error: "session_used" });
    }

    return res.json({
      ok: true,
      productName: s.productName,
      deckId: s.deckId || null,
      deckName: s.deckName || null,
      pick: s.pick || null,
      manual: !!s.manual,
      order_id: s.order_id || null,
      email: s.email || null,
    });
  } catch (err) {
    console.error("GET /api/session error:", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ---- Envía cartas a OpenAI para interpretación ----
app.post("/api/submit", async (req, res) => {
  const { token, cards } = req.body || {};

  const s = await getSession(token);
  if (!s || s.used) {
    return res.status(400).json({ error: "Sesión inválida" });
  }

  try {
    const list = (cards || [])
      .map((c) => `${c.name}${c.reversed ? " (Invertida)" : " (Derecha)"}`)
      .join(", ");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Interpreta tirada de tarot: ${list} para el producto ${s.productName}`,
        },
      ],
    });

    s.used = true;
    await setSession(token, s);

    res.json({
      interpretation: completion.choices[0].message.content,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error de interpretación" });
  }
});

// ------------------------------------------------------
// 6) ARRANQUE
// ------------------------------------------------------
const PORT = process.env.PORT || 8080;

(async () => {
  if (redis) {
    try {
      await redis.connect();
      REDIS_CONNECTED = true;
      console.log("Redis conectado ✅");
    } catch (e) {
      console.error("Fallo conexión Redis, usando memoria ⚠️");
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor activo en puerto ${PORT}`);
  });
})();
