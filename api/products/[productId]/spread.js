// api/products/[productId]/spread.js
const { getDeckForProduct } = require("../../../lib/getDeckForProduct");
const { getRedis } = require("../../../lib/redis-client");
const { getWeeklyReading } = require("../../../lib/weekly-reading");

function yyyymmdd() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function getIP(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  if (Array.isArray(xf) && xf[0]) return xf[0];
  return req.socket?.remoteAddress || "unknown";
}

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

    // ✅ límite 8/día por IP
    const ip = getIP(req);
    const day = yyyymmdd();
    const key = `${productId}:${ip}:${day}`;

    const redis = getRedis();
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60 * 60 * 24 * 2);
    if (count > 8) {
      return res.status(429).json({
        ok: false,
        error: "daily_limit_reached",
        limit: { maxPerDay: 8, usedToday: count - 1 },
      });
    }

    // ✅ deck desde JSON
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

    // ✅ 12 cartas
    const shuffled = shuffle(deck.cards);
    const spread = shuffled.slice(0, 12);

    // ✅ SOLO 1 invertida
    const reversedIndex = Math.floor(Math.random() * spread.length);
    const cards = spread.map((c, idx) => ({
      ...c,
      reversed: idx === reversedIndex,
    }));

    // ✅ IA semanal (texto largo) – se cachea en Redis
    // Si algo falla con OpenAI, devolvemos igual las cartas (sin romper la tirada).
    let reading_long = null;
    let reading_week = null;
    let reading_cached = null;

    try {
      const weekly = await getWeeklyReading({ productId, cards });
      reading_long = weekly.text;
      reading_week = weekly.week;
      reading_cached = weekly.cached;
    } catch (e) {
      // no rompemos la API por la IA
      reading_long = null;
      reading_week = null;
      reading_cached = null;
    }

    return res.status(200).json({
      ok: true,
      product_id: productId,
      spread: "angeles_12",
      deck: { slug: deck.deck_id || productId, name: deck.name || productId },
      meta: { usedToday: count, maxPerDay: 8, reversedIndex },
      timestamp: new Date().toISOString(),
      cards,
      reading: {
        kind: "weekly_ai",
        week: reading_week,
        cached: reading_cached,
        text: reading_long,
      },
    });
  } catch (err) {
    console.error("Product spread error:", err);
    return res.status(500).json({ ok: false, error: "Internal server error", details: err.message });
  }
};
