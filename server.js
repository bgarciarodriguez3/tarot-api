// server.js
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { OpenAI } = require("openai");

// ✅ Redis
const { createClient } = require("redis");

const app = express();

// ------------------------------------------------------
// 0) MIDDLEWARES
// ------------------------------------------------------
app.use(
  cors({
    origin: true, // Shopify + pruebas
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "1mb" }));

// ------------------------------------------------------
// 1) OPENAI
// ------------------------------------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ------------------------------------------------------
// Helpers
// ------------------------------------------------------
function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function firstValue(v) {
  if (Array.isArray(v)) return v.length ? v[0] : "";
  if (v == null) return "";
  return String(v);
}

// ------------------------------------------------------
// 2) CONFIG PRODUCTOS (VARIANT ID)
// ------------------------------------------------------
/**
 * TIPOS:
 * - normal: genera tirada automática (deckId + pick)
 * - manual: producto premium, lo respondes tú (NO hay tirada)
 */
const VARIANT_CONFIG = {
  // 3 cartas - Arcanos Mayores (22)
  "52443282112849": {
    type: "normal",
    productName: "Tres Puertas del Destino (3 Cartas).",
    deckId: "arcanos_mayores",
    deckName: "Tarot Arcanos Mayores",
    pick: 3,
  },

  // 5 cartas - Semilla Estelar (22)
  "52457830154577": {
    type: "normal",
    productName: "Camino de la Semilla Estelar (5 Cartas)",
    deckId: "semilla_estelar",
    deckName: "Tarot Semilla Estelar",
    pick: 5,
  },

  // 4 cartas - Ángeles (12)
  "52457929867601": {
    type: "normal",
    productName: "Mensaje de los Ángeles ✨ Lectura Angelical Premium de 4 Cartas",
    deckId: "angeles",
    deckName: "Tarot de los Ángeles",
    pick: 4,
  },

  // 12 cartas - Arcanos Mayores (22)
  "52443409383761": {
    type: "normal",
    productName: "Lectura Profunda: Análisis Completo (12 Cartas)",
    deckId: "arcanos_mayores",
    deckName: "Tarot Arcanos Mayores",
    pick: 12,
  },

  // ✅ PREMIUM (MANUAL) - Mentoría
  // (según tu debug: variant_id = 52458382459217)
  "52458382459217": {
    type: "manual",
    productName: "Mentoría de Claridad Total: Análisis de 10 Preguntas + Plan de Acción",
  },

  // ✅ PREMIUM (MANUAL) - Tarot del Amor Premium
  "52570216857937": {
    type: "manual",
    productName: "Tarot del Amor Premium: Encuentra a tu Alma Gemela",
  },
};

// Lista mazos para UI (opcional)
const DECKS = [
  { deckId: "arcanos_mayores", deckName: "Tarot Arcanos Mayores" },
  { deckId: "angeles", deckName: "Tarot de los Ángeles" },
  { deckId: "semilla_estelar", deckName: "Tarot Semilla Estelar" },
];

// Dorsos (NOMBRES EXACTOS en Shopify Files)
const dorsos = {
  arcanos_mayores: "arcanos_mayores_Dorso_tarot_normal.png",
  angeles: "Angel_Dorso_tarot_de_los_angeles.png",
  semilla_estelar: "Semilla_estelar_Dorso_Semilla_Estelar_ok.png",
};

// ------------------------------------------------------
// 3) CARTAS (NOMBRES EXACTOS Shopify Files)
// ------------------------------------------------------

// Ángeles (12)
const angelesCards = [
  { id: "rafael", name: "Arcángel Rafael", image: "Angel_Arcangel_Rafael.png", meaning: "" },
  { id: "guarda", name: "Ángel de la Guarda", image: "Angel_Angel_de_la_Guarda.png", meaning: "" },
  { id: "abundancia", name: "Ángel de la Abundancia", image: "Angel_Angel_de_la_Abundancia.png", meaning: "" },

  { id: "chamuel", name: "ArcángelùmgetUd", image: "Angel_Arcangel_Chamuel.png", meaning: "" },
  { id: "gabriel", name: "Arcángel Gabriel", image: "Angel_Arcangel_Gabriel.png", meaning: "" },
  { id: "uriel", name: "Arcángel Uriel", image: "Angel_Arcangel_Uriel.png", meaning: "" },

  { id: "tiempo_divino", name: "Ángel del Tiempo Divino", image: "Angel_Angel_del_Tiempo_Divino.png", meaning: "" },
  { id: "jofiel", name: "Arcángel Jofiel", image: "Angel_Arcangel_Jofiel.png", meaning: "" },
  { id: "suenos", name: "Ángel de los Sueños", image: "Angel_Angel_de_los_Suenos.png", meaning: "" },

  { id: "miguel", name: "Arcángel Miguel", image: "Angel_Angel_Arcangel_Miguel.png", meaning: "" },
  { id: "nuevo_comienzo", name: "Ángel del Nuevo Comienzo", image: "Angel_Angel_del_Nuevo_Comienzo.png", meaning: "" },
  { id: "zadkiel", name: "Arcángel Zadkiel", image: "Angel_Arcangel_Zadkiel.png", meaning: "" },
];

// Arcanos Mayores (22)
const arcanosMayoresCards = [
  { id: "sacerdotisa", name: "La Sacerdotisa", image: "arcanos_mayores_La_Sacerdotisa.png", meaning: "" },
  { id: "ermitano", name: "El Ermitaño", image: "arcanos_mayores_El_Ermitano.png", meaning: "" },
  { id: "luna", name: "La Luna", image: "arcanos_mayores_La_Luna.png", meaning: "" },
  { id: "colgado", name: "El Colgado", image: "arcanos_mayores_El_Colgado.png", meaning: "" },
  { id: "muerte", name: "La Muerte", image: "arcanos_mayores_La_Muerte.png", meaning: "" },
  { id: "enamorados", name: "Los Enamorados", image: "arcanos_mayores_Los_Enamorados.png", meaning: "" },
  { id: "emperatriz", name: "La Emperatriz", image: "arcanos_mayores_La_Emperatriz.png", meaning: "" },
  { id: "sol", name: "El Sol", image: "arcanos_mayores_El_Sol.png", meaning: "" },
  { id: "templanza", name: "La Templanza", image: "arcanos_mayores_La_Templanza.png", meaning: "" },
  { id: "carro", name: "El Carro", image: "arcanos_mayores_El_Carro.png", meaning: "" },
  { id: "emperador", name: "El Emperador", image: "arcanos_mayores_El_Emperador.png", meaning: "" },
  { id: "mundo", name: "El Mundo", image: "arcanos_mayores_El_mundo.png", meaning: "" },
  { id: "sumo_sacerdote", name: "El Sumo Sacerdote", image: "arcanos_mayores_El_Sumo_Sacerdote.png", meaning: "" },
  { id: "juicio", name: "El Juicio", image: "arcanos_mayores_El_Juicio.png", meaning: "" },
  { id: "rueda_fortuna", name: "La Rueda de la Fortuna", image: "arcanos_mayores_La_Rueda_De_La_Fortuna.png", meaning: "" },
  { id: "justicia", name: "La Justicia", image: "arcanos_mayores_La_Justicia.png", meaning: "" },
  { id: "estrella", name: "La Estrella", image: "arcanos_mayores_La_Estrella.png", meaning: "" },
  { id: "torre", name: "La Torre", image: "arcanos_mayores_La_Torre.png", meaning: "" },
  { id: "diablo", name: "El Diablo", image: "arcanos_mayores_El_Diablo.png", meaning: "" },
  { id: "mago", name: "El Mago", image: "arcanos_mayores_El_Mago.png", meaning: "" },
  { id: "fuerza", name: "La Fuerza", image: "arcanos_mayores_La_fuerza.png", meaning: "" },
  { id: "loco", name: "El Loco", image: "arcanos_mayores_El_loco.png", meaning: "" },
];

// Semilla Estelar (22)
const semillaEstelarCards = [
  { id: "llamado_noche", name: "El Llamado de la Noche", image: "Semilla_estelar_El_Llamado_de_la_Noche.png", meaning: "" },
  { id: "mision_alma", name: "Misión de Alma", image: "Semilla_estelar_Mision_de_Alma.png", meaning: "" },
  { id: "memorias_otras_vidas", name: "Memorias de Otras Vidas", image: "Semilla_estelar_Memorias_de_Otras_Vidas.png", meaning: "" },
  { id: "rayo_dorado", name: "Rayo Dorado", image: "Semilla_estelar_Rayo_Dorado.png", meaning: "" },
  { id: "codigos_luz", name: "Códigos de Luz", image: "Semilla_estelar_Codigos_de_Luz.png", meaning: "" },
  { id: "reconexion_corazon", name: "Reconexión con el Corazón", image: "Semilla_estelar_Reconexion_con_el_Corazon.png", meaning: "" },
  { id: "portal_encarnacion", name: "Portal de Encarnación", image: "Semilla_estelar_Portal_de_Encarnacion.png", meaning: "" },
  { id: "origen_galactico", name: "Origen Galáctico", image: "Semilla_estelar_Origen_Galactico.png", meaning: "" },
  { id: "puente_entre_mundos", name: "Puente entre Mundos", image: "Semilla_estelar_Puente_entre_Mundos.png", meaning: "" },
  { id: "consejo_guias", name: "Consejo de Guías", image: "Semilla_estelar_Consejo_de_Guias.png", meaning: "" },
  { id: "semilla_coraje", name: "Semilla del Coraje", image: "Semilla_estelar_Semilla_del_Coraje.png", meaning: "" },
  { id: "luz_sombra", name: "Luz en la Sombra", image: "Semilla_estelar_Luz_en_la_Sombra.png", meaning: "" },
  { id: "hogar_estrella", name: "Hogar en la Estrella", image: "Semilla_estelar_Hogar_en_la_Estrella.png", meaning: "" },
  { id: "santuario_interior", name: "Santuario Interior", image: "Semilla_estelar_Santuario_Interior.png", meaning: "" },
  { id: "contrato_almico", name: "Contrato Álmico", image: "Semilla_estelar_Contrato_Almico.png", meaning: "" },
  { id: "guardianes_umbral", name: "Guardianes del Umbral", image: "Semilla_estelar_Guardianes_del_Umbral.png", meaning: "" },
  { id: "sincronias_universo", name: "Sincronías del Universo", image: "Semilla_estelar_Sincronias_del_Universo.png", meaning: "" },
  { id: "renacimiento_estelar", name: "Renacimiento Estelar", image: "Semilla_estelar_Renacimiento_Estelar.png", meaning: "" },
  { id: "destino_cuantico", name: "Destino Cuántico", image: "Semilla_estelar_Destino_Cuantico.png", meaning: "" },
  { id: "llamado_estelar", name: "Llamado Estelar", image: "Semilla_estelar_Llamado_Estelar.png", meaning: "" },
  { id: "tribu_alma", name: "Tribu del Alma", image: "Semilla_estelarTribu_del_Alma.png", meaning: "" },
  { id: "alianza_tierra", name: "Alianza con la Tierra", image: "Semilla_estelar_Alianza_con_la_Tierra.png", meaning: "" },
];

function getDeckCards(deckId) {
  if (deckId === "angeles") return { cards: angelesCards, backImage: dorsos.angeles };
  if (deckId === "arcanos_mayores") return { cards: arcanosMayoresCards, backImage: dorsos.arcanos_mayores };
  if (deckId === "semilla_estelar") return { cards: semillaEstelarCards, backImage: dorsos.semilla_estelar };
  return null;
}

// ------------------------------------------------------
// 4) SESIONES / TOKENS
//    ✅ Redis si REDIS_URL está definido
//    ✅ Fallback a memoria si no
// ------------------------------------------------------
const sessions = new Map(); // fallback local
const SESSION_TTL_SEC = 60 * 60 * 24; // 24h
const SESSION_TTL_MS = 1000 * SESSION_TTL_SEC;

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

// Redis client (solo conecta si hay REDIS_URL)
const redis = process.env.REDIS_URL ? createClient({ url: process.env.REDIS_URL }) : null;
let REDIS_CONNECTED = false;

if (redis) {
  redis.on("error", (err) => console.error("Redis error:", err));
}

// En Redis no hace falta cleanup: el TTL lo hace solo.
// En memoria sí limpiamos.
function cleanupOldSessionsMemoryOnly() {
  if (redis && REDIS_CONNECTED) return;
  const now = Date.now();
  for (const [token, s] of sessions.entries()) {
    if (!s?.createdAt || now - s.createdAt > SESSION_TTL_MS) sessions.delete(token);
  }
}

async function getSession(token) {
  if (redis && REDIS_CONNECTED) {
    const raw = await redis.get(`sess:${token}`);
    return raw ? JSON.parse(raw) : null;
  }
  return sessions.get(token) || null;
}

async function setSession(token, obj) {
  if (redis && REDIS_CONNECTED) {
    await redis.set(`sess:${token}`, JSON.stringify(obj), { EX: SESSION_TTL_SEC });
    return;
  }
  sessions.set(token, obj);
}

async function delSession(token) {
  if (redis && REDIS_CONNECTED) {
    await redis.del(`sess:${token}`);
    return;
  }
  sessions.delete(token);
}

// idempotencia: idKey -> token
async function getTokenByIdKey(idKey) {
  if (redis && REDIS_CONNECTED) {
    return await redis.get(`idk:${idKey}`);
  }
  for (const [t, s] of sessions.entries()) {
    if (s?.idKey === idKey && !s?.used) return t;
  }
  return null;
}

async function setTokenByIdKey(idKey, token) {
  if (redis && REDIS_CONNECTED) {
    await redis.set(`idk:${idKey}`, token, { EX: SESSION_TTL_SEC });
  }
}

// Conteo aproximado (solo para /api/health)
async function countSessionsInMemory() {
  return sessions.size;
}

function pickRandom(arr, n) {
  const a = Array.isArray(arr) ? [...arr] : [];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, n));
}

// ------------------------------------------------------
// 4.1) DEBUG: último body recibido por /api/create-link
// ------------------------------------------------------
let LAST_CREATE_LINK = null;

// Fallback por nombre si no llega variant_id (modo “a prueba de Zapier”)
function mapProductNameToCfg(productNameRaw) {
  const p = normalize(productNameRaw);

  // ✅ PREMIUM manual
  if (p.includes("mentoria") || p.includes("mentor\u00eda") || p.includes("claridad total")) {
    return {
      type: "manual",
      productName: "Mentoría de Claridad Total: Análisis de 10 Preguntas + Plan de Acción",
    };
  }
  if (p.includes("tarot del amor premium") || (p.includes("alma gemela") && p.includes("premium"))) {
    return {
      type: "manual",
      productName: "Tarot del Amor Premium: Encuentra a tu Alma Gemela",
    };
  }

  // Normal (tarot automático)
  if (p.includes("tres puertas")) {
    return {
      type: "normal",
      productName: "Tres Puertas del Destino (3 Cartas).",
      deckId: "arcanos_mayores",
      deckName: "Tarot Arcanos Mayores",
      pick: 3,
    };
  }

  if (p.includes("lectura profunda") || p.includes("analisis completo") || p.includes("análisis completo")) {
    return {
      type: "normal",
      productName: "Lectura Profunda: Análisis Completo (12 Cartas)",
      deckId: "arcanos_mayores",
      deckName: "Tarot Arcanos Mayores",
      pick: 12,
    };
  }

  if (p.includes("semilla estelar")) {
    return {
      type: "normal",
      productName: "Camino de la Semilla Estelar (5 Cartas)",
      deckId: "semilla_estelar",
      deckName: "Tarot Semilla Estelar",
      pick: 5,
    };
  }

  if (p.includes("angeles") || p.includes("ángeles") || p.includes("angelical")) {
    return {
      type: "normal",
      productName: "Mensaje de los Ángeles ✨ Lectura Angelical Premium de 4 Cartas",
      deckId: "angeles",
      deckName: "Tarot de los Ángeles",
      pick: 4,
    };
  }

  return null;
}

// ------------------------------------------------------
// 5) RUTAS
// ------------------------------------------------------
app.get("/", (req, res) => res.send("API de Tarot Activa ✅"));

app.get("/api/health", async (req, res) => {
  cleanupOldSessionsMemoryOnly();

  res.json({
    ok: true,
    redis: Boolean(redis),
    redis_connected: REDIS_CONNECTED,
    sesiones_en_memoria: await countSessionsInMemory(),
    time: new Date().toISOString(),
  });
});

// Debug: ver qué está enviando Zapier realmente
app.get("/api/debug/last-create-link", (req, res) => {
  res.json({
    last: LAST_CREATE_LINK,
    time: new Date().toISOString(),
  });
});

// Lista mazos
app.get("/api/decks", (req, res) => res.json(DECKS));

// Cartas por mazo
app.get("/api/cards/:deckId", (req, res) => {
  const { deckId } = req.params;
  const deck = getDeckCards(deckId);
  if (!deck) return res.status(404).json({ error: "deckId no válido" });

  if (!Array.isArray(deck.cards) || deck.cards.length === 0) {
    return res.status(500).json({
      error: "Este mazo no tiene cartas configuradas en el servidor",
      deckId,
    });
  }

  res.json(deck);
});

// ------------------------------------------------------
// (A) ZAPIER: crear link tras pago
//     ✅ MULTIPRODUCTO + IDEMPOTENCIA + PREMIUM MANUAL
// ------------------------------------------------------
app.post("/api/create-link", async (req, res) => {
  cleanupOldSessionsMemoryOnly();

  // ✅ Si defines ZAPIER_SECRET en Railway, esto protege el endpoint.
  // (Si no lo defines aún, no bloquea tus pruebas.)
  if (process.env.ZAPIER_SECRET) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${process.env.ZAPIER_SECRET}`) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
  }

  const body = req.body || {};
  LAST_CREATE_LINK = { receivedAt: new Date().toISOString(), body };

  const order_id = firstValue(body.order_id || body.orderId || body.order || "").trim();
  const email = firstValue(body.email || body.customer_email || body.customerEmail || "").trim();

  const variant_id = firstValue(
    body.variant_id ??
      body.variantId ??
      body.variant ??
      body.variantID ??
      body["line_items.variant_id"] ??
      body["lineItemsVariantId"] ??
      ""
  ).trim();

  const productName = firstValue(
    body.productName ||
      body.product ||
      body.title ||
      body.product_title ||
      body.line_item_title ||
      body.lineItemTitle ||
      ""
  ).trim();

  // ✅ Validación mínima
  const missing = [];
  if (!order_id) missing.push("order_id");
  if (!email) missing.push("email");
  if (!variant_id && !productName) missing.push("variant_id o productName");
  if (missing.length) {
    return res.status(400).json({
      ok: false,
      error: `Faltan campos obligatorios: ${missing.join(", ")}`,
      received: { order_id, email, variant_id, productName },
    });
  }

  // 1) Por variant_id
  let cfg = null;
  if (variant_id) cfg = VARIANT_CONFIG[String(variant_id)] || null;

  // 2) Fallback por nombre
  if (!cfg && productName) {
    cfg = mapProductNameToCfg(productName);

    // fallback extra: compara exacto con productName en config
    if (!cfg) {
      const pn = normalize(productName);
      for (const k of Object.keys(VARIANT_CONFIG)) {
        const c = VARIANT_CONFIG[k];
        if (normalize(c.productName) === pn) {
          cfg = c;
          break;
        }
      }
    }
  }

  if (!cfg) {
    return res.status(400).json({
      ok: false,
      error: "No puedo mapear el producto (variant_id no reconocido y productName no coincide)",
      received: { order_id, email, variant_id, productName },
    });
  }

  // ✅ Si es manual, no validamos mazos/cartas
  const isManual = cfg.type === "manual";

  // Validación extra SOLO para productos normales
  if (!isManual) {
    const deck = getDeckCards(cfg.deckId);
    if (!deck || !Array.isArray(deck.cards) || deck.cards.length === 0) {
      return res.status(500).json({
        ok: false,
        error: "Deck sin cartas configuradas en el servidor",
        deckId: cfg.deckId,
      });
    }
    if (deck.cards.length < cfg.pick) {
      return res.status(500).json({
        ok: false,
        error: `Deck con pocas cartas para esta tirada (tiene ${deck.cards.length}, necesita ${cfg.pick})`,
        deckId: cfg.deckId,
      });
    }
  }

  // ✅ Idempotencia: un enlace por (order_id + producto)
  const idKey = `${String(order_id)}:${String(variant_id || normalize(productName))}`;

  let existingToken = await getTokenByIdKey(idKey);
  const token = existingToken || makeToken();

  if (!existingToken) {
    const sessionObj = {
      idKey,
      order_id: String(order_id),
      email: String(email),
      variant_id: variant_id ? String(variant_id) : null,
      productName: cfg.productName || productName || "Producto",
      type: cfg.type || "normal",
      // normal:
      deckId: isManual ? null : cfg.deckId,
      deckName: isManual ? null : cfg.deckName,
      pick: isManual ? 0 : cfg.pick,
      // meta:
      createdAt: Date.now(),
      used: false,
    };

    await setSession(token, sessionObj);
    await setTokenByIdKey(idKey, token);
  }

  const baseClientUrl =
    process.env.CLIENT_BASE_URL || "https://eltarotdelaruedadelafortuna.com/pages/lectura";

  // Si quieres una página distinta para premium manual:
  // en Railway puedes añadir MANUAL_BASE_URL (opcional)
  const manualBaseUrl = process.env.MANUAL_BASE_URL || process.env.CLIENT_BASE_URL_MANUAL || baseClientUrl;

  const link = `${(isManual ? manualBaseUrl : baseClientUrl)}?token=${token}`;

  return res.json({
    ok: true,
    link,
    token,
    mapped: {
      productName: cfg.productName || productName || null,
      type: cfg.type || "normal",
      deckId: isManual ? null : cfg.deckId,
      deckName: isManual ? null : cfg.deckName,
      pick: isManual ? 0 : cfg.pick,
      variant_id: variant_id || null,
    },
  });
});

// ------------------------------------------------------
// (B) CLIENTE: validar token y obtener configuración
// ------------------------------------------------------
app.get("/api/session", async (req, res) => {
  cleanupOldSessionsMemoryOnly();

  const token = String(req.query.token || "").trim();
  if (!token) return res.status(400).json({ error: "Falta token" });

  const s = await getSession(token);
  if (!s) return res.status(404).json({ error: "Token inválido o expirado" });
  if (s.used) return res.status(409).json({ error: "Este enlace ya fue usado" });

  // ✅ Premium manual
  if (s.type === "manual") {
    return res.json({
      order_id: s.order_id,
      email: s.email,
      productName: s.productName,
      type: "manual",
      message: "Producto premium manual: la lectura la realiza Miriam y se enviará por email.",
    });
  }

  const deck = getDeckCards(s.deckId);
  if (!deck) return res.status(500).json({ error: "Deck no disponible en servidor" });

  if (!Array.isArray(deck.cards) || deck.cards.length === 0) {
    return res.status(500).json({ error: "Deck sin cartas configuradas", deckId: s.deckId });
  }

  res.json({
    order_id: s.order_id,
    email: s.email,
    productName: s.productName,
    type: "normal",
    deckId: s.deckId,
    deckName: s.deckName,
    pick: s.pick,
    backImage: deck.backImage,
  });
});

// ------------------------------------------------------
// (C) CLIENTE: enviar cartas, interpretar, y marcar sesión usada
// ------------------------------------------------------
app.post("/api/submit", async (req, res) => {
  cleanupOldSessionsMemoryOnly();

  const { token, cards } = req.body || {};
  if (!token) return res.status(400).json({ error: "Falta token" });

  const s = await getSession(String(token));
  if (!s) return res.status(404).json({ error: "Token inválido o expirado" });
  if (s.used) return res.status(409).json({ error: "Este enlace ya fue usado" });

  // ✅ Premium manual: no hay submit
  if (s.type === "manual") {
    return res.status(400).json({
      error: "Este producto es premium manual y no requiere selección de cartas.",
      productName: s.productName,
    });
  }

  if (!Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: "cards debe ser un array con al menos 1 carta" });
  }
  if (cards.length !== s.pick) {
    return res.status(400).json({ error: `Debes seleccionar exactamente ${s.pick} cartas` });
  }

  try {
    const list = cards
      .map((c) => {
        const name = c?.name || c?.id || "Carta";
        const rev = c?.reversed ? " (Invertida)" : " (Derecha)";
        return `${name}${rev}`;
      })
      .join(", ");

    const prompt = `Actúa como una experta en tarot y guía espiritual.
Producto: "${s.productName}".
He realizado una tirada con el mazo "${s.deckName}".
Las cartas elegidas son: ${list}.
Por favor, proporciona una interpretación holística, amorosa y profunda para quien consulta.
Estructura: (1) Mensaje general, (2) Lectura carta a carta, (3) Consejo final.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 700,
    });

    const interpretation =
      completion.choices?.[0]?.message?.content || "No se pudo generar la interpretación.";

    s.used = true;
    await setSession(String(token), s);

    res.json({
      email: s.email,
      order_id: s.order_id,
      productName: s.productName,
      deckName: s.deckName,
      interpretation,
    });
  } catch (error) {
    console.error("Error en OpenAI:", error);
    res.status(500).json({ error: "Hubo un error al generar la interpretación. Intenta de nuevo." });
  }
});

// ------------------------------------------------------
// 6) COMPATIBILIDAD (para tu Shopify anterior)
// ------------------------------------------------------
async function handleLegacyReading(req, res) {
  cleanupOldSessionsMemoryOnly();

  const token = String(req.query.token || "").trim();
  if (!token) return res.status(400).send("Falta token");

  const s = await getSession(token);
  if (!s) return res.status(404).send("Token inválido o expirado");
  if (s.used) return res.status(409).send("Este enlace ya fue usado");

  // ✅ Premium manual: no hay lectura legacy
  if (s.type === "manual") {
    return res.status(400).send("Producto premium manual: no hay lectura automática.");
  }

  const deckId = s.deckId;
  const deck = getDeckCards(deckId);
  if (!deck) return res.status(500).send("Deck no disponible");
  if (!Array.isArray(deck.cards) || deck.cards.length === 0) {
    return res.status(500).send("Deck sin cartas configuradas");
  }

  const picked = pickRandom(deck.cards, s.pick);

  res.json({
    deckId,
    deckName: s.deckName,
    pick: s.pick,
    backImage: deck.backImage,
    cards: picked.map((c) => ({
      id: c.id,
      name: c.name,
      image: c.image,
      meaning: c.meaning || "",
    })),
  });
}

app.get("/reading", handleLegacyReading);
app.get("/api/reading", handleLegacyReading);

// ------------------------------------------------------
// 7) SERVER (Redis opcional + PORT Railway)
// ------------------------------------------------------
const PORT = Number(process.env.PORT || 8080);

(async () => {
  try {
    if (redis) {
      await redis.connect();
      REDIS_CONNECTED = true;
      console.log("Redis conectado ✅");
    } else {
      console.log("REDIS_URL no configurado; usando sesiones en memoria ⚠️");
    }

    app.listen(PORT, "0.0.0.0", () => console.log(`Servidor activo en puerto ${PORT}`));
  } catch (err) {
    console.error("Error al iniciar servidor:", err);
    // Si Redis falla, arrancamos igual en modo memoria (para no tumbar el servicio)
    REDIS_CONNECTED = false;
    console.log("Arrancando en modo memoria por fallo de Redis ⚠️");

    app.listen(PORT, "0.0.0.0", () => console.log(`Servidor activo en puerto ${PORT}`));
  }
})();
