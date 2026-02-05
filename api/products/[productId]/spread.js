// api/products/[productId]/spread.js
const { getDeckForProduct } = require("../../../lib/getDeckForProduct");
const { getWeeklyLongMeaningForCard } = require("../../../lib/weekly-reading");

function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = async (req, res) => {
  try {
    const productId = req.query && (req.query.productId || req.query.product_id);
    if (!productId) {
      return res.status(400).json({ ok: false, error: "Missing productId" });
    }

    const deck = getDeckForProduct(productId);
    if (!deck || !Array.isArray(deck.cards)) {
      return res.status(404).json({ ok: false, error: `Deck not found for product ${productId}` });
    }

    if (deck.cards.length !== 12) {
      return res.status(500).json({
        ok: false,
        error: "invalid_deck",
        details: "Deck must have exactly 12 cards",
      });
    }

    const spread = shuffle(deck.cards).slice(0, 12);

    // ✅ SOLO 1 invertida
    const reversedIndex = Math.floor(Math.random() * spread.length);

    // ✅ longMeaning semanal (IA) — cacheado por semana
    const enriched = await Promise.all(
      spread.map(async (c, idx) => {
        const reversed = idx === reversedIndex;

        // Genera/recupera longMeaning semanal por carta + estado (normal/invertida)
        const longMeaning = await getWeeklyLongMeaningForCard({
          productId,
          card: c,
          reversed,
        });

        return {
          ...c,
          reversed,
          longMeaning, // <-- texto largo semanal
        };
      })
    );

    return res.status(200).json({
      ok: true,
      product_id: productId,
      spread: "angeles_12",
      deck: { slug: deck.deck_id || productId, name: deck.name || productId },
      reversedIndex,
      timestamp: new Date().toISOString(),
      cards: enriched,
    });
  } catch (err) {
    console.error("Product spread error:", err);
    return res.status(500).json({ ok: false, error: "Internal server error", details: err.message });
  }
};
