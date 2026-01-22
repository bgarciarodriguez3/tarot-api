// server.js
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { OpenAI } = require("openai");
const { createClient } = require("redis");

const app = express();

/* ------------------------------------------------------
   0) MIDDLEWARES
------------------------------------------------------ */
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

/* ------------------------------------------------------
   1) OPENAI
------------------------------------------------------ */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ------------------------------------------------------
   HELPERS
------------------------------------------------------ */
function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function firstValue(v) {
  if (Array.isArray(v)) return v[0];
  return v ?? "";
}

/* ------------------------------------------------------
   2) CONFIG DE PRODUCTOS TAROT (NORMALES)
------------------------------------------------------ */
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
    productName: "Mensaje de los Ángeles ✨",
    deckId: "angeles",
    deckName: "Tarot de los Ángeles",
    pick: 4,
  },

  "52443409383761": {
    productName: "Lectura Profunda (12 Cartas)",
    deckId: "arcanos_mayores",
    deckName: "Tarot Arcanos Mayores",
    pick: 12,
  },
};

/* ------------------------------------------------------
   3) PRODUCTOS PREMIUM MANUALES (SIN TAROT)
------------------------------------------------------ */
const PREMIUM_MANUAL = {
  // Mentoría
  "52458382459217": {
    productName:
      "Mentoría de Claridad Total: Análisis de 10 Preguntas + Plan de Acción",
    manual: true,
    type: "mentoria",
  },

  // Tarot del Amor Premium
  "52570216857937": {
    productName: "Tarot del Amor Premium: Encuentra a tu Alma Gemela",
    manual: true,
    type: "amor_premium",
  },
};

/* ------------------------------------------------------
   4) SESIONES (MEMORIA / REDIS)
------------------------------------------------------ */
const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 24;

const redis = process.env.REDIS_URL
  ? createClient({ url: process.env.REDIS_URL })
  : null;

let REDIS_CONNECTED = false;

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

async function getSession(token) {
  if (redis && REDIS_CONNECTED) {
    const raw = await redis.get(`sess:${token}`);
    return raw ? JSON.parse(raw) : null;
  }
  return sessions.get(token);
}

async function setSession(token, data) {
  if (redis && REDIS_CONNECTED) {
    await redis.set(`sess:${token}`, JSON.stringify(data), { EX: 86400 });
  } else {
    sessions.set(token, data);
  }
}

/* ------------------------------------------------------
   5) RUTAS
------------------------------------------------------ */
app.get("/", (_, res) => res.send("API de Tarot Activa ✅"));

app.get("/api/health", (_, res) => {
  res.json({
    ok: true,
    redis: Boolean(redis),
    redis_connected: REDIS_CONNECTED,
    sesiones_en_memoria: sessions.size,
    time: new Date().toISOString(),
  });
});

/* ------------------------------------------------------
   (A) ZAPIER → CREATE LINK
------------------------------------------------------ */
app.post("/api/create-link", async (req, res) => {
  const body = req.body || {};

  const order_id = firstValue(body.order_id).toString();
  const email = firstValue(body.email).toString();
  const variant_id = firstValue(body.variant_id).toString();
  const productName = firstValue(body.productName).toString();

  if (!order_id || !email || !variant_id) {
    return res.status(400).json({
      ok: false,
      error: "Faltan datos obligatorios",
      received: body,
    });
  }

  /* -------- 1️⃣ PRODUCTOS PREMIUM -------- */
  if (PREMIUM_MANUAL[variant_id]) {
    const token = makeToken();

    await setSession(token, {
      order_id,
      email,
      variant_id,
      productName: PREMIUM_MANUAL[variant_id].productName,
      manual: true,
      type: PREMIUM_MANUAL[variant_id].type,
      createdAt: Date.now(),
      used: false,
    });

    const link =
      "https://eltarotdelaruedadelafortuna.com/pages/lectura?token=" + token;

    return res.json({
      ok: true,
      link,
      token,
      manual: true,
      productName: PREMIUM_MANUAL[variant_id].productName,
    });
  }

  /* -------- 2️⃣ PRODUCTOS TAROT NORMALES -------- */
  const cfg = VARIANT_CONFIG[variant_id];

  if (!cfg) {
    return res.status(400).json({
      ok: false,
      error: "Variant no reconocido",
      variant_id,
      productName,
    });
  }

  const token = makeToken();

  await setSession(token, {
    order_id,
    email,
    variant_id,
    productName: cfg.productName,
    deckId: cfg.deckId,
    deckName: cfg.deckName,
    pick: cfg.pick,
    createdAt: Date.now(),
    used: false,
  });

  const link =
    "https://eltarotdelaruedadelafortuna.com/pages/lectura?token=" + token;

  res.json({
    ok: true,
    link,
    token,
    productName: cfg.productName,
    deckName: cfg.deckName,
    pick: cfg.pick,
  });
});

/* ------------------------------------------------------
   (B) VALIDAR SESIÓN
------------------------------------------------------ */
app.get("/api/session", async (req, res) => {
  const token = req.query.token;
  const s = await getSession(token);

  if (!s) return res.status(404).json({ error: "Token inválido" });
  if (s.used) return res.status(409).json({ error: "Token ya usado" });

  res.json(s);
});

/* ------------------------------------------------------
   6) SERVER (RAILWAY)
------------------------------------------------------ */
const PORT = Number(process.env.PORT || 8080);

(async () => {
  try {
    if (redis) {
      await redis.connect();
      REDIS_CONNECTED = true;
      console.log("Redis conectado ✅");
    } else {
      console.log("Redis no configurado, usando memoria ⚠️");
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Servidor activo en puerto ${PORT}`);
    });
  } catch (err) {
    console.error("Error al iniciar:", err);
  }
})();
