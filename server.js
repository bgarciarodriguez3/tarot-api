// server.js
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { OpenAI } = require("openai");
const { createClient } = require("redis");

const app = express();

/* --------------------------------------------------
   MIDDLEWARES
-------------------------------------------------- */
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "1mb" }));

/* --------------------------------------------------
   OPENAI
-------------------------------------------------- */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

/* --------------------------------------------------
   HELPERS
-------------------------------------------------- */
function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function firstValue(v) {
  if (Array.isArray(v)) return v[0] || "";
  return v || "";
}

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

/* --------------------------------------------------
   PRODUCT CONFIG
-------------------------------------------------- */
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

  // PREMIUM MANUAL
  "52458382459217": {
    productName:
      "Mentoría de Claridad Total: Análisis de 10 Preguntas + Plan de Acción",
    manual: true,
  },
  "52570216857937": {
    productName: "Tarot del Amor Premium: Encuentra a tu Alma Gemela",
    manual: true,
  },
};

/* --------------------------------------------------
   DECKS & CARDS (resumido)
-------------------------------------------------- */
const dorsos = {
  arcanos_mayores: "arcanos_mayores_Dorso_tarot_normal.png",
  angeles: "Angel_Dorso_tarot_de_los_angeles.png",
  semilla_estelar: "Semilla_estelar_Dorso_Semilla_Estelar_ok.png",
};

const arcanosMayoresCards = [
  { id: "loco", name: "El Loco", image: "arcanos_mayores_El_loco.png" },
  { id: "mago", name: "El Mago", image: "arcanos_mayores_El_Mago.png" },
  { id: "sacerdotisa", name: "La Sacerdotisa", image: "arcanos_mayores_La_Sacerdotisa.png" },
];

const angelesCards = [
  { id: "miguel", name: "Arcángel Miguel", image: "Angel_Angel_Arcangel_Miguel.png" },
];

const semillaEstelarCards = [
  { id: "llamado", name: "El Llamado Estelar", image: "Semilla_estelar_Llamado_Estelar.png" },
];

function getDeckCards(deckId) {
  if (deckId === "arcanos_mayores")
    return { cards: arcanosMayoresCards, backImage: dorsos.arcanos_mayores };
  if (deckId === "angeles")
    return { cards: angelesCards, backImage: dorsos.angeles };
  if (deckId === "semilla_estelar")
    return { cards: semillaEstelarCards, backImage: dorsos.semilla_estelar };
  return null;
}

/* --------------------------------------------------
   SESSIONS (Redis optional)
-------------------------------------------------- */
const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 24;

const redis = process.env.REDIS_URL
  ? createClient({ url: process.env.REDIS_URL })
  : null;

let REDIS_CONNECTED = false;

if (redis) {
  redis.on("error", (err) => console.error("Redis error", err));
  redis.connect().then(() => {
    REDIS_CONNECTED = true;
    console.log("Redis conectado");
  });
}

async function getSession(token) {
  if (redis && REDIS_CONNECTED) {
    const v = await redis.get(`sess:${token}`);
    return v ? JSON.parse(v) : null;
  }
  return sessions.get(token);
}

async function setSession(token, data) {
  if (redis && REDIS_CONNECTED) {
    await redis.set(`sess:${token}`, JSON.stringify(data));
  } else {
    sessions.set(token, data);
  }
}

/* --------------------------------------------------
   ROUTES
-------------------------------------------------- */
app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.post("/api/create-link", async (req, res) => {
  const body = req.body || {};
  const order_id = firstValue(body.order_id);
  const email = firstValue(body.email);
  const variant_id = firstValue(body.variant_id);
  const productName = firstValue(body.productName);

  let cfg = VARIANT_CONFIG[String(variant_id)];
  if (!cfg && productName) {
    const p = normalize(productName);
    if (p.includes("mentoria")) cfg = VARIANT_CONFIG["52458382459217"];
    if (p.includes("alma gemela")) cfg = VARIANT_CONFIG["52570216857937"];
  }

  if (!cfg) {
    return res.status(400).json({ ok: false, error: "Producto no reconocido" });
  }

  const token = makeToken();
  const session = {
    order_id,
    email,
    productName: cfg.productName,
    manual: !!cfg.manual,
    deckId: cfg.deckId || null,
    pick: cfg.pick || 0,
    createdAt: Date.now(),
  };

  await setSession(token, session);

  const base = cfg.manual
    ? "https://eltarotdelaruedadelafortuna.com/pages/premium"
    : "https://eltarotdelaruedadelafortuna.com/pages/lectura";

  res.json({
    ok: true,
    link: `${base}?token=${token}`,
    manual: !!cfg.manual,
  });
});

app.get("/api/session", async (req, res) => {
  const token = req.query.token;
  const s = await getSession(token);
  if (!s) return res.status(404).json({ error: "Token inválido" });
  res.json(s);
});

/* --------------------------------------------------
   START SERVER
-------------------------------------------------- */
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});
