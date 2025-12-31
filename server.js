const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// =========================
// CONFIG
// =========================

// Probabilidad de que una tirada tenga cartas invertidas
const REVERSED_READING_PROB = 0.3; // 30%

// Máximo de cartas invertidas por tirada
const MAX_REVERSED_PER_READING = 3;

// Carpeta donde están tus JSON de barajas
const DECKS_DIR = path.join(__dirname, "data", "decks");

// Mapeo de productos Shopify verificado con tus enlaces reales
const PRODUCTS = {
  // Tres Puertas del Destino (3 Cartas)
  "10493369745745": { deckId: "arcanos_mayores", cards: 3 },

  // Mensaje de los Ángeles ✨ Lectura Angelical Premium de 4 Cartas
  "10496012616017": { deckId: "angeles", cards: 4 },

  // Camino de la Semilla Estelar (5 Cartas)
  "10495993446737": { deckId: "semilla_estelar", cards: 5 },

  // Lectura Profunda: Análisis Completo (12 Cartas)
  "10493383082321": { deckId: "arcanos_mayores", cards: 12 },
};

// =========================
// HELPERS
// =========================

function safeReadJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function deckPath(deckId) {
  return path.join(DECKS_DIR, `${deckId}.json`);
}

function loadDeck(deckId) {
  const p = deckPath(deckId);
  if (!fs.existsSync(p)) return null;
  return safeReadJson(p);
}

// Inferencia por texto mejorada para Semilla Estelar y Ángeles
function inferDeckIdFromText(text = "") {
  const p = (text || "").toLowerCase();

  if (p.includes("ángel") || p.includes("angel")) return "angeles";
  if (p.includes("semilla") || p.includes("estelar")) return "semilla_estelar";
  if (p.includes("arcano") || p.includes("destino") || p.includes("profunda"))
    return "arcanos_mayores";

  return null;
}

function resolveDeck({ productId, deckId, productTitle }) {
  if (deckId && typeof deckId === "string") return deckId;

  if (productId && PRODUCTS[String(productId)]?.deckId) {
    return PRODUCTS[String(productId)].deckId;
  }

  const inferred = inferDeckIdFromText(productTitle || "");
  if (inferred) return inferred;

  return null;
}

function expectedCardsFromProduct(productId) {
  if (!productId) return null;
  return PRODUCTS[String(productId)]?.cards ?? null;
}

function pickReversedIndexes(total) {
  const hasReversed = Math.random() < REVERSED_READING_PROB;
  if (!hasReversed) return new Set();

  const maxReversed = Math.min(MAX_REVERSED_PER_READING, total);
  const reversedCount = 1 + Math.floor(Math.random() * maxReversed);

  const idxs = new Set();
  while (idxs.size < reversedCount) {
    idxs.add(Math.floor(Math.random() * total));
  }
  return idxs;
}

// =========================
// ROUTES
// =========================

app.get("/", (req, res) => {
  res.json({ ok: true, name: "tarot-api" });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/decks/:deckId", (req, res) => {
  const { deckId } = req.params;
  const deck = loadDeck(deckId);

  if (!deck) {
    return res.status(404).json({ error: "Deck no encontrado", deckId });
  }

  return res.json(deck);
});

app.post("/tarot/reading", (req, res) => {
  try {
    const { productId, productTitle, deckId, selectedCards } = req.body || {};

    if (!Array.isArray(selectedCards) || selectedCards.length === 0) {
      return res.status(400).json({
        error: "selectedCards debe ser un array con al menos 1 carta",
      });
    }

    const resolvedDeckId = resolveDeck({ productId, deckId, productTitle });
    if (!resolvedDeckId) {
      return res.status(400).json({
        error: "No pude determinar la baraja.",
      });
    }

    const expected = expectedCardsFromProduct(productId);
    if (expected && selectedCards.length !== expected) {
      return res.status(400).json({
        error: `Para este producto se esperan ${expected} cartas`,
        expectedCards: expected,
        receivedCards: selectedCards.length,
      });
    }

    const deck = loadDeck(resolvedDeckId);
    if (!deck) {
      return res.status(404).json({
        error: "Deck no encontrado",
        deckId: resolvedDeckId,
      });
    }

    const reversedIndexes = pickReversedIndexes(selectedCards.length);

    const reading = selectedCards.map((cardId, index) => {
      const card = (deck.cards || []).find((c) => c.id === cardId) || null;
      const isReversed = reversedIndexes.has(index);

      return {
        position: index + 1,
        cardId,
        reversed: isReversed,
        card,
        meaning: isReversed
          ? (card?.reversed || `Interpretación invertida de ${cardId}`)
          : (card?.upright || `Interpretación directa de ${cardId}`),
      };
    });

    return res.json({
      ok: true,
      deckId: resolvedDeckId,
      back: deck.back || null,
      reading,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error interno" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tarot API running on port ${PORT}`));
