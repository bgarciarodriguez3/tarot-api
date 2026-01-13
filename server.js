// server.js
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { OpenAI } = require("openai");

const app = express();

// ------------------------------------------------------
// 0) MIDDLEWARES
// ------------------------------------------------------
app.use(
  cors({
    origin: true, // permite Shopify + pruebas (puedes restringir luego)
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
// 2) CONFIG MAZOS / PRODUCTOS (TUS VARIANT ID)
// ------------------------------------------------------
const VARIANT_CONFIG = {
  // 3 cartas - Arcanos Mayores (22)
  "52443282112849": {
    productName: "Lectura de Claridad Rápida (3 cartas)",
    deckId: "arcanos_mayores",
    deckName: "Tarot Arcanos Mayores",
    pick: 3,
  },

  // 5 cartas - Semilla Estelar (22)
  "52457830154577": {
    productName: "Camino de la Semilla Estelar (5 cartas)",
    deckId: "semilla_estelar",
    deckName: "Tarot Semilla Estelar",
    pick: 5,
  },

  // 4 cartas - Ángeles (12)
  "52457929867601": {
    productName: "Mensaje de los Ángeles (4 cartas)",
    deckId: "angeles",
    deckName: "Tarot de los Ángeles",
    pick: 4,
  },

  // 12 cartas - Arcanos Mayores (22)
  "52443409383761": {
    productName: "Lectura Profunda: Análisis Completo (12 cartas)",
    deckId: "arcanos_mayores",
    deckName: "Tarot Arcanos Mayores",
    pick: 12,
  },
};

// Lista de mazos para UI
const DECKS = [
  { deckId: "arcanos_mayores", deckName: "Tarot Arcanos Mayores" },
  { deckId: "angeles", deckName: "Tarot de los Ángeles" },
  { deckId: "semilla_estelar", deckName: "Tarot Semilla Estelar" },
];

// Dorsos (imágenes en tu Shopify Files)
const dorsos = {
  arcanos_mayores: "arcanos_mayores_Dorso_tarot_normal.PNG",
  angeles: "Angel_Dorso_tarot_de_los_angeles.PNG",
  semilla_estelar: "Semilla_estelar_Dorso_Semilla_Estelar_ok.PNG",
};

// ------------------------------------------------------
// 3) CARTAS
//    IMPORTANTE: rellena arcanosMayoresCards y semillaEstelarCards
//    Puedes añadir "meaning" si quieres mostrar texto en Shopify.
// ------------------------------------------------------
const angelesCards = [
  { id: "jofiel", name: "Arcángel Jofiel", image: "Angel_Arcangel_Jofiel.PNG", meaning: "" },
  { id: "guarda", name: "Ángel de la Guarda", image: "Angel_Angel_de_la_Guarda.PNG", meaning: "" },
  { id: "abundancia", name: "Ángel de la Abundancia", image: "Angel_Angel_de_la_Abundancia.PNG", meaning: "" },
  { id: "suenos", name: "Ángel de los Sueños", image: "Angel_Angel_de_los_Sueños.PNG", meaning: "" },
  { id: "nuevo_comienzo", name: "Ángel del Nuevo Comienzo", image: "Angel_Angel_del_Nuevo_Comienzo.PNG", meaning: "" },
  { id: "tiempo_divino", name: "Ángel del Tiempo Divino", image: "Angel_Angel_del_Tiempo_Divino.PNG", meaning: "" },
  { id: "zadkiel", name: "Arcángel Zadkiel", image: "Angel_Arcangel_Zadkiel.PNG", meaning: "" },
  { id: "chamuel", name: "Arcángel Chamuel", image: "Angel_Arcangel_Chamuel.PNG", meaning: "" },
  { id: "uriel", name: "Arcángel Uriel", image: "Angel_Arcangel_Uriel.PNG", meaning: "" },
  { id: "rafael", name: "Arcángel Rafael", image: "Angel_Arcangel_Rafael.PNG", meaning: "" },
  { id: "gabriel", name: "Arcángel Gabriel", image: "Angel_Arcangel_Gabriel.PNG", meaning: "" },
  { id: "miguel", name: "Arcángel Miguel", image: "Angel_Angel_Arcangel_Miguel.PNG", meaning: "" },
];

// TODO: Rellena con tus 22 cartas reales (mínimo para que no falle)
const arcanosMayoresCards = [
  // Ejemplo:
  // { id:"loco", name:"El Loco", image:"Arcanos_El_Loco.PNG", meaning:"..." },
];

const semillaEstelarCards = [
  // Ejemplo:
  // { id:"origen", name:"Origen Estelar", image:"Semilla_Origen.PNG", meaning:"..." },
];

function getDeckCards(deckId) {
  if (deckId === "angeles") return { cards: angelesCards, backImage: dorsos.angeles };
  if (deckId === "arcanos_mayores") return { cards: arcanosMayoresCards, backImage: dorsos.arcanos_mayores };
  if (deckId === "semilla_estelar") return { cards: semillaEstelarCards, backImage: dorsos.semilla_estelar };
  return null;
}

// ------------------------------------------------------
// 4) SESIONES / TOKENS (EN MEMORIA)
// ------------------------------------------------------
const sessions = new Map();
// sessions.set(token, { order_id, email, variant_id, deckId, deckName, pick, createdAt, used, productName })

const SESSION_TTL_MS = 1000 * 60 * 60 * 24; // 24h

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function cleanupOldSessions() {
  const now = Date.now();
  for (const [token, s] of sessions.entries()) {
    if (!s?.createdAt || now - s.createdAt > SESSION_TTL_MS) sessions.delete(token);
  }
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
// 5) RUTAS
// ------------------------------------------------------
app.get("/", (req, res) => res.send("API de Tarot Activa ✅"));

app.get("/api/health", (req, res) => {
  cleanupOldSessions();
  res.json({
    ok: true,
    sessions_in_memory: sessions.size,
    time: new Date().toISOString(),
  });
});

// Lista mazos
app.get("/api/decks", (req, res) => res.json(DECKS));

// Cartas por mazo (para que tu front pueda pintar dorsos y elegir)
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
// ------------------------------------------------------
app.post("/api/create-link", (req, res) => {
  cleanupOldSessions();

  const { order_id, email, variant_id } = req.body || {};
  if (!order_id || !email || !variant_id) {
    return res.status(400).json({ error: "Faltan campos: order_id, email, variant_id" });
  }

  const cfg = VARIANT_CONFIG[String(variant_id)];
  if (!cfg) {
    return res.status(400).json({ error: "variant_id no reconocido / no configurado" });
  }

  const token = makeToken();
  sessions.set(token, {
    order_id: String(order_id),
    email: String(email),
    variant_id: String(variant_id),
    deckId: cfg.deckId,
    deckName: cfg.deckName,
    pick: cfg.pick,
    productName: cfg.productName,
    createdAt: Date.now(),
    used: false,
  });

  const baseClientUrl =
    process.env.CLIENT_BASE_URL || "https://eltarotdelaruedadelafortuna.com/pages/lectura";
  const link = `${baseClientUrl}?token=${token}`;

  res.json({ link, token });
});

// ------------------------------------------------------
// (B) CLIENTE: validar token y obtener configuración
// ------------------------------------------------------
app.get("/api/session", (req, res) => {
  cleanupOldSessions();

  const token = String(req.query.token || "").trim();
  if (!token) return res.status(400).json({ error: "Falta token" });

  const s = sessions.get(token);
  if (!s) return res.status(404).json({ error: "Token inválido o expirado" });
  if (s.used) return res.status(409).json({ error: "Este enlace ya fue usado" });

  const deck = getDeckCards(s.deckId);
  if (!deck) return res.status(500).json({ error: "Deck no disponible en servidor" });

  if (!Array.isArray(deck.cards) || deck.cards.length === 0) {
    return res.status(500).json({ error: "Deck sin cartas configuradas", deckId: s.deckId });
  }

  res.json({
    order_id: s.order_id,
    email: s.email,
    productName: s.productName,
    deckId: s.deckId,
    deckName: s.deckName,
    pick: s.pick,
    backImage: deck.backImage,
  });
});

// ------------------------------------------------------
// (C) CLIENTE: enviar cartas elegidas, interpretar, y marcar sesión usada
// ------------------------------------------------------
app.post("/api/submit", async (req, res) => {
  cleanupOldSessions();

  const { token, cards } = req.body || {};
  if (!token) return res.status(400).json({ error: "Falta token" });

  const s = sessions.get(String(token));
  if (!s) return res.status(404).json({ error: "Token inválido o expirado" });
  if (s.used) return res.status(409).json({ error: "Este enlace ya fue usado" });

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
    sessions.set(String(token), s);

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
//    Si tu front llama a:
//    GET /reading?token=XXX&deck=angeles
//    o GET /api/reading?token=XXX&deck=angeles
//    esto devuelve cards directamente y NO rompe.
// ------------------------------------------------------
function handleLegacyReading(req, res) {
  cleanupOldSessions();

  const token = String(req.query.token || "").trim();
  const requestedDeck = String(req.query.deck || "").trim(); // opcional

  if (!token) return res.status(400).send("Falta token");

  const s = sessions.get(token);
  if (!s) return res.status(404).send("Token inválido o expirado");
  if (s.used) return res.status(409).send("Este enlace ya fue usado");

  // Seguridad: el deck REAL es el del producto comprado
  const deckId = s.deckId;

  // Si te interesa permitir cambiar deck por query, cambia esto (no recomendado)
  // const deckId = requestedDeck || s.deckId;

  const deck = getDeckCards(deckId);
  if (!deck) return res.status(500).send("Deck no disponible");

  if (!Array.isArray(deck.cards) || deck.cards.length === 0) {
    return res.status(500).send("Deck sin cartas configuradas");
  }

  const picked = pickRandom(deck.cards, s.pick);

  // Formato compatible con tu JS anterior: { cards: [...] }
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
// 7) SERVER
// ------------------------------------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => console.log(`Servidor activo en puerto ${PORT}`));
