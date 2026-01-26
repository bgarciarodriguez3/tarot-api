// server.js
"use strict";

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { OpenAI } = require("openai");
const { createClient } = require("redis");

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
// 4) RUTAS API
// ------------------------------------------------------
app.get("/", (req, res) => {
  res.send("API de Tarot Activa ✅");
});

// 👉 CREA EL LINK CON TOKEN (email)
app.post("/api/create-link", async (req, res) => {
  const { order_id, email, variant_id } = req.body;

  const cfg = VARIANT_CONFIG[variant_id];
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

  res.json({
    ok: true,
    link: `${base}?token=${token}`,
  });
});

// 👉 ESTA ES LA RUTA QUE FALTABA (SHOPIFY LA LLAMA)
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

// 👉 ENVÍO DE CARTAS PARA INTERPRETACIÓN
app.post("/api/submit", async (req, res) => {
  const { token, cards } = req.body;

  const s = await getSession(token);
  if (!s || s.used) {
    return res.status(400).json({ error: "Sesión inválida" });
  }

  try {
    const list = cards
      .map(
        (c) =>
          `${c.name}${c.reversed ? " (Invertida)" : " (Derecha)"}`
      )
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
// 5) ARRANQUE
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
