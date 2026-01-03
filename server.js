// server.js (CommonJS compatible con tu package.json)
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Definición de rutas de carpetas según tu estructura de GitHub
const DECKS_DIR = path.join(__dirname, "data", "decks");
const IMAGES_DIR = path.join(__dirname, "data", "decks", "images");

// CONFIGURACIÓN DE IMÁGENES: Esto permite que las fotos sean visibles en la web
if (fs.existsSync(IMAGES_DIR)) {
    app.use("/images", express.static(IMAGES_DIR));
    console.log(`✅ Carpeta de imágenes vinculada: ${IMAGES_DIR}`);
} else {
    console.error(`❌ ERROR: No se encuentra la carpeta de imágenes en: ${IMAGES_DIR}`);
}

/* -------------------- helpers -------------------- */
function safeReadJSON(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function slugify(str = "") {
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeDeck(deckRaw, fallbackId) {
  const deckId =
    deckRaw.deckId ||
    deckRaw.deck_id ||
    fallbackId ||
    slugify(deckRaw.deckName || deckRaw.deck_name || deckRaw.name);

  const deckName = deckRaw.deckName || deckRaw.deck_name || deckRaw.name || deckId;
  const language = deckRaw.language || "es";
  const version = deckRaw.version || "1.0.0";
  const back = deckRaw.back || deckRaw.cardBack || deckRaw.card_back || null;

  const cardsRaw = Array.isArray(deckRaw.cards) ? deckRaw.cards : [];

  const cards = cardsRaw.map((c, idx) => {
    const id =
      c.id ||
      c.cardId ||
      c.card_id ||
      `${deckId}_${String(idx + 1).padStart(3, "0")}`;

    const name = c.name || c.title || id;
    const slug = c.slug || slugify(name);
    const image = c.image || c.img || null;

    const up = c.upright || {};
    const rv = c.reversed || {};

    const upright = {
      general: up.general || up.significado_general || "",
      love: up.love || up.amor || "",
      work: up.work || up.trabajo_proposito || "",
      spiritualAdvice: up.spiritualAdvice || up.consejo_espiritual || up.spiritual || "",
      angelAdvice: up.angelAdvice || "",
      affirmation: up.affirmation || "",
      ritual: up.ritual || ""
    };

    const reversed = {
      meaning: (typeof rv === "string" ? rv : rv.meaning) || rv.significado || ""
    };

    return { id, name, slug, image, upright, reversed };
  });

  return { deckId, deckName, language, version, back, cards };
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* -------------------- load decks -------------------- */
let DECKS = {}; 

function loadDecks() {
  DECKS = {};
  if (!fs.existsSync(DECKS_DIR)) {
    console.error(`❌ DECKS_DIR no existe: ${DECKS_DIR}`);
    return;
  }

  const files = fs.readdirSync(DECKS_DIR).filter((f) => f.toLowerCase().endsWith(".json"));

  for (const file of files) {
    const filePath = path.join(DECKS_DIR, file);
    try {
      const raw = safeReadJSON(filePath);
      const fallbackId = path.basename(file, ".json");
      const deck = normalizeDeck(raw, fallbackId);
      DECKS[deck.deckId] = deck;
      console.log(`✅ Deck cargado: ${deck.deckId} (${deck.cards.length} cartas)`);
    } catch (err) {
      console.error(`❌ Error cargando ${file}:`, err.message);
    }
  }
}

loadDecks();

/* -------------------- routes -------------------- */
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Tarot API online",
    endpoints: {
      images: "/images/nombre_archivo.jpg",
      decks: "/api/decks",
      cards: "/api/decks/:deckId/cards"
    }
  });
});

app.get("/api/decks", (req, res) => {
  const list = Object.values(DECKS).map((d) => ({
    deckId: d.deckId,
    deckName: d.deckName,
    cardsCount: d.cards.length
  }));
  res.json(list);
});

app.get("/api/decks/:deckId/cards", (req, res) => {
  const deck = DECKS[req.params.deckId];
  if (!deck) return res.status(404).json({ error: "Deck no encontrado" });
  res.json(deck.cards);
});

app.post("/api/reload", (req, res) => {
  loadDecks();
  res.json({ ok: true, decks: Object.keys(DECKS) });
});

/* -------------------- start -------------------- */
app.listen(PORT, () => {
  console.log(`🚀 Servidor listo en puerto ${PORT}`);
});
