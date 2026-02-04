// api/products/[productId]/spread.js
const mod = require("../../../lib/getDeckForProduct");
const getDeckForProduct = mod.getDeckForProduct || mod; // ✅ robusto

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
    const cards = deck && Array.isArray(deck.cards) ? deck.cards : null;

    // Para angeles_12 devolvemos 12, si no, devolvemos 4
    const want12 = productId === "angeles_12";
    const takeN = want12 ? 12 : 4;

    if (!cards || cards.length < takeN) {
      return res.status(500).json({
        ok: false,
        error: "Deck has insufficient cards",
        details: `Need ${takeN} cards`,
      });
    }

    const spread = shuffle(cards).slice(0, takeN);

    // ✅ SOLO 1 invertida
    const reversedIndex = Math.floor(Math.random() * spread.length);
    const spreadWithReversed = spread.map((c, idx) => ({
      ...c,
      reversed: idx === reversedIndex,
    }));

    return res.status(200).json({
      ok: true,
      product_id: productId,
      spread: want12 ? "angeles_12" : "angeles_4",
      deck: { slug: deck.deck_id || productId, name: deck.name || productId },
      timestamp: new Date().toISOString(),
      cards: spreadWithReversed,
    });
  } catch (err) {
    console.error("Product spread error:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      details: err.message,
    });
  }
};
