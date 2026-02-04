// api/products/[productId]/spread.js

const { getDeckForProduct } = require("../../../lib/getDeckForProduct");
const { redisIncr, redisExpire } = require("../../../lib/redis-client");
const { getWeeklyReading } = require("../../../lib/weekly-reading");

// ===== helpers =====
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

// ===== handler =====
module.exports = async (req, res) => {
  try {
    // 1️⃣ productId
    const productId = req.query && (req.query.productId || req.query.product_id);
    if (!productId) {
      return res.status(400).json({ ok: false, error: "Missing productId" });
    }

    // 2️⃣ límite 8 tiradas/día por IP
    const ip = getIP(req);
    const day = yyyymmdd();
    const limitKey = `${productId}:${ip}:${day}`;

    const count = await redisIncr(limitKey);
    if (count === 1) {
      // 2 días por seguridad
      await redisExpire(limitKey, 60 * 60 * 24 * 2);
    }

    if (count > 8) {
      return res.status(429).json({
        ok: false,
        error: "daily_limit_reached",
        limit: { maxPerDay: 8, usedToday: count - 1 },
      });
    }

    // 3️⃣ obtener mazo
    const deck = getDeckForProduct(productId);
    if (!deck || !Array.isArray(deck.cards)) {
      return res.status(404).json({
        ok: false,
        error: `Deck not found for product ${productId}`,
      });
    }

    if (deck.cards.length !== 12) {
      return res.status(500).json({
        ok: false,
        error: "invalid_deck",
        details: "Deck must have exactly 12 cards",
      });
    }

    // 4️⃣ barajar y sacar 12
    const shuffled = shuffle(deck.cards);
    const spread = shuffled.slice(0, 12);

    // 5️⃣ solo 1 carta invertida
    const reversedIndex = Math.floor(Math.random() * spread.length);
    const cards = spread.map((c, idx) => ({
      ...c,
      reversed: idx === reversedIndex,
    }));

    // 6️⃣ IA semanal (NO rompe la tirada si falla)
    let reading = {
      kind: "weekly_ai",
      week: null,
      cached: null,
      text: null,
    };

    try {
      const weekly = await getWeeklyReading({ productId, cards });
      reading.week = weekly.week;
      reading.cached = weekly.cached;
      reading.text = weekly.text;
    } catch (err) {
      console.error("Weekly reading error:", err);
      // seguimos sin texto largo
    }

    // 7️⃣ respuesta final
    return res.status(200).json({
      ok: true,
      product_id: productId,
      spread: "angeles_12",
      deck: {
        slug: deck.deck_id || productId,
        name: deck.name || productId,
      },
      meta: {
        usedToday: count,
        maxPerDay: 8,
        reversedIndex,
      },
      timestamp: new Date().toISOString(),
      cards,
      reading,
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
