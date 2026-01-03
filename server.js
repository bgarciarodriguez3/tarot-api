// server.js (CommonJS compatible con tu package.json)
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// --- ESTA ES LA LÍNEA NUEVA PARA LAS IMÁGENES ---
// Permite acceder a data/decks/images a través de la URL /images
app.use("/images", express.static(path.join(__dirname, "data", "decks", "images")));
// ------------------------------------------------

const PORT = process.env.PORT || 3000;
// Asegúrate de que tus .json están en /data/decks
const DECKS_DIR = process.env.DECKS_DIR || path.join(__dirname, "data", "decks");

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
      meaning:
        (typeof rv === "string" ? rv : rv.meaning) ||
        rv.significado ||
        rv.reversed ||
        ""
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

  const files = fs
    .readdirSync(DECKS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".json"));

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
    decksDir: DECKS_DIR,
    endpoints: {
      decks: "/api/decks",
      deck: "/api/decks/:deckId",
      cards: "/api/decks/:deckId/cards",
      card: "/api/decks/:deckId/cards/:cardId",
      random: "/api/random?deckId=angeles",
      reload: "POST /api/reload"
    }
  });
});

app.get("/api/decks", (req, res) => {
  const list = Object.values(DECKS).map((d) => ({
    deckId: d.deckId,
    deckName: d.deckName,
    language: d.language,
    version: d.version,
    back: d.back,
    cardsCount: d.cards.length
  }));
  res.json(list);
});

app.get("/api/decks/:deckId", (req, res) => {
  const deck = DECKS[req.params.deckId];
  if (!deck) return res.status(404).json({ error: "Deck no encontrado" });
  res.json(deck);
});

app.get("/api/decks/:deckId/cards", (req, res) => {
  const deck = DECKS[req.params.deckId];
  if (!deck) return res.status(404).json({ error: "Deck no encontrado" });
  res.json(deck.cards);
});

app.get("/api/decks/:deckId/cards/:cardId", (req, res) => {
  const deck = DECKS[req.params.deckId];
  if (!deck) return res.status(404).json({ error: "Deck no encontrado" });

  const key = req.params.cardId;
  const card = deck.cards.find((c) => c.id === key || c.slug === key);

  if (!card) return res.status(404).json({ error: "Carta no encontrada" });
  res.json(card);
});

app.get("/api/random", (req, res) => {
  const { deckId } = req.query;

  if (deckId) {
    const deck = DECKS[deckId];
    if (!deck) return res.status(404).json({ error: "Deck no encontrado" });
    return res.json({
      deckId: deck.deckId,
      deckName: deck.deckName,
      card: pickRandom(deck.cards)
    });
  }

  const all = Object.values(DECKS).flatMap((d) =>
    d.cards.map((c) => ({ deckId: d.deckId, deckName: d.deckName, card: c }))
  );

  if (!all.length) return res.status(500).json({ error: "No hay cartas cargadas" });
  res.json(pickRandom(all));
});

app.post("/api/reload", (req, res) => {
  loadDecks();
  res.json({ ok: true, decks: Object.keys(DECKS) });
});

/* -------------------- start -------------------- */
app.listen(PORT, () => {
  console.log(`🚀 API escuchando en http://localhost:${PORT}`);
  console.log(`📁 Leyendo decks de: ${DECKS_DIR}`);
});
