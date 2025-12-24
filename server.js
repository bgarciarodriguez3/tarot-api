const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// =========================
// CONFIG (ajusta si quieres)
// =========================

// Probabilidad de que una TIRADA tenga cartas invertidas
const REVERSED_READING_PROB = 0.3; // 30%

// Máximo de cartas invertidas por tirada
const MAX_REVERSED_PER_READING = 3;

// Carpeta donde están tus JSON de barajas
const DECKS_DIR = path.join(__dirname, "data", "decks");

// Si tienes productId en Shopify, puedes mapearlo aquí.
// Si no lo rellenas, el server intentará inferir deckId a partir del productId.
const PRODUCTS = {
  // EJEMPLOS (ajusta a tus IDs reales si quieres):
  // "angeles_4": { deckId: "angeles" },
  // "semilla_5": { deckId: "semilla_estelar" },
  // "arcanos_3": { deckId: "arcanos_mayores" },
};

// =========================
// Helpers
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

function inferDeckIdFromProductId(productId = "") {
  const p = (productId || "").toLowerCase();
  if (p.includes("angel")) return "angeles";
  if (p.includes("semilla")) return "semilla_estelar";
  if (p.includes("arcano")) return "arcanos_mayores";
  return null;
}

function resolveDeckId({ productId, deckId }) {
  // 1) Si viene deckId explícito, se usa
  if (deckId && typeof deckId === "string") return deckId;

  // 2) Si productId está en PRODUCTS
  if (productId && PRODUCTS[productId]?.deckId) return PRODUCTS[productId].deckId;

  // 3) Inferencia por texto del productId
  const inferred = inferDeckIdFromProductId(productId);
  if (inferred) return inferred;

  return null;
}

function pickReversedIndexes(total) {
  // 70%: ninguna invertida
  const hasReversed = Math.random() < REVERSED_READING_PROB;
  if (!hasReversed) return new Set();

  const maxReversed = Math.min(MAX_REVERSED_PER_READING, total);
  const reversedCount = 1 + Math.floor(Math.random() * maxReversed); // 1..maxReversed

  const idxs = new Set();
  while (idxs.size < reversedCount) {
    idxs.add(Math.floor(Math.random() * total));
  }
  return idxs;
}

// =========================
// Routes
// =========================

app.get("/", (req, res) => {
  res.json({ ok: true, name: "tarot-api" });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ✅ GET /decks/:deckId  -> devuelve el JSON de la baraja
app.get("/decks/:deckId", (req, res) => {
  const { deckId } = req.params;
  const deck = loadDeck(deckId);

  if (!deck) {
    return res.status(404).json({ error: "Deck no encontrado", deckId });
  }

  return res.json(deck);
});

// ✅ POST /tarot/reading
// Body recomendado:
// {
//   "productId": "angeles_4",
//   "selectedCards": ["Angel_Arcangel_Rafael", "..."]
// }
// Opcionalmente puedes mandar:
// { "deckId": "angeles" }  // si no usas productId
app.post("/tarot/reading", (req, res) => {
  try {
    const { productId, deckId, selectedCards } = req.body || {};

    if (!Array.isArray(selectedCards) || selectedCards.length === 0) {
      return res.status(400).json({
        error: "selectedCards debe ser un array con al menos 1 carta",
      });
    }

    // Resolver deckId
    const resolvedDeckId = resolveDeckId({ productId, deckId });
    if (!resolvedDeckId) {
      return res.status(400).json({
        error:
          "No pude determinar la baraja. Envía deckId o configura PRODUCTS para ese productId.",
        productId,
        deckId,
      });
    }

    // Cargar baraja
    const deck = loadDeck(resolvedDeckId);
    if (!deck) {
      return res.status(404).json({
        error: "Deck no encontrado",
        deckId: resolvedDeckId,
      });
    }

    // Validar duplicados
    const duplicates = selectedCards.filter(
      (c, i) => selectedCards.indexOf(c) !== i
    );
    if (duplicates.length > 0) {
      return res.status(400).json({
        error: "No se permiten cartas repetidas",
        duplicates: Array.from(new Set(duplicates)),
      });
    }

    // Validar que las cartas existen en la baraja
    const validIds = new Set((deck.cards || []).map((c) => c.id));
    const invalid = selectedCards.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      return res.status(400).json({
        error: "Hay cartas inválidas para esta baraja",
        deckId: resolvedDeckId,
        invalidCards: invalid,
      });
    }

    // Cartas invertidas: 30% por tirada, máx 3
    const reversedIndexes = pickReversedIndexes(selectedCards.length);

    // Construir respuesta
    const reading = selectedCards.map((cardId, index) => {
      const isReversed = reversedIndexes.has(index);
      return {
        position: index + 1,
        cardId,
        reversed: isReversed,
        meaning: isReversed
          ? `Interpretación invertida de ${cardId}`
          : `Interpretación directa de ${cardId}`,
      };
    });

    return res.json({
      ok: true,
      deckId: resolvedDeckId,
      productId: productId || null,
      back: deck.back,
      reading,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error interno" });
  }
});

// =========================
// Start
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tarot API running on port ${PORT}`));
