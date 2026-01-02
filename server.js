// server.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/* -------------------- setup -------------------- */
const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
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

// Normaliza deck + cartas a un formato único
function normalizeDeck(deckRaw, fallbackId) {
  const deckId = deckRaw.deckId || deckRaw.deck_id || fallbackId || slugify(deckRaw.deckName || deckRaw.deck_name || deckRaw.name);
  const deckName = deckRaw.deckName || deckRaw.deck_name || deckRaw.name || deckId;
  const language = deckRaw.language || "es";
  const version = deckRaw.version || "1.0.0";
  const back = deckRaw.back || deckRaw.cardBack || deckRaw.card_back || null;

  const cardsRaw = Array.isArray(deckRaw.cards) ? deckRaw.cards : [];

  const cards = cardsRaw.map((c, idx) => {
    const id = c.id || c.cardId || c.card_id || `${deckId}_${String(idx + 1).padStart(3, "0")}`;
    const name = c.name || c.title || id;
    const slug = c.slug || slugify(name);
    const image = c.image || c.img || null;

    // Soporta ambos mundos: (upright.general/love/work/spiritualAdvice/angelAdvice/affirmation/ritual)
    // y (upright.significado_general/amor/trabajo_proposito/consejo_espiritual)
    const up = c.upright || {};
    const rv = c.reversed || {};

    const upright = {
      general:
        up.general ||
        up.significado_general ||
        "",
      love:
        up.love ||
        up.amor ||
        "",
      work:
        up.work ||
        up.trabajo_proposito ||
        "",
      spiritualAdvice:
        up.spiritualAdvice ||
        up.consejo_espiritual ||
        up.spiritual ||
        "",
      angelAdvice:
        up.angelAdvice || "",
      affirmation:
        up.affirmation || "",
      ritual:
        up.ritual || ""
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
let DECKS = {}; // { deckId: normalizedDeck }

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
    endpoints: {
      decks: "/api/decks",
      deck: "/api/decks/:deckId",
      cards: "/api/decks/:deckId/cards",
      card: "/api/decks/:deckId/cards/:cardId",
      random: "/api/random?deckId=angeles"
    }
  });
});

// Lista decks
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

// Deck completo
app.get("/api/decks/:deckId", (req, res) => {
  const deck = DECKS[req.params.deckId];
  if (!deck) return res.status(404).json({ error: "Deck no encontrado" });
  res.json(deck);
});

// Solo cartas de un deck
app.get("/api/decks/:deckId/cards", (req, res) => {
  const deck = DECKS[req.params.deckId];
  if (!deck) return res.status(404).json({ error: "Deck no encontrado" });
  res.json(deck.cards);
});

// Carta concreta
app.get("/api/decks/:deckId/cards/:cardId", (req, res) => {
  const deck = DECKS[req.params.deckId];
  if (!deck) return res.status(404).json({ error: "Deck no encontrado" });

  const card = deck.cards.find((c) => c.id === req.params.cardId || c.slug === req.params.cardId);
  if (!card) return res.status(404).json({ error: "Carta no encontrada" });

  res.json(card);
});

// Random card (de un deck o global)
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

  const allCards = Object.values(DECKS).flatMap((d) =>
    d.cards.map((c) => ({ deckId: d.deckId, deckName: d.deckName, card: c }))
  );

  if (!allCards.length) return res.status(500).json({ error: "No hay cartas cargadas" });

  res.json(pickRandom(allCards));
});

// Reload decks (opcional, útil en dev)
app.post("/api/reload", (req, res) => {
  loadDecks();
  res.json({ ok: true, decks: Object.keys(DECKS) });
});

/* -------------------- start -------------------- */
app.listen(PORT, () => {
  console.log(`🚀 API escuchando en http://localhost:${PORT}`);
  console.log(`📁 Leyendo decks de: ${DECKS_DIR}`);
});
