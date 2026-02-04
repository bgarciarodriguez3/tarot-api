// api/products/[productId]/spread.js
const { getDeckForProduct } = require("../../../lib/getDeckForProduct");
const { getRedis } = require("../../../lib/redis-client");

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

    // ✅ IMPORTANTE: getRedis() es async con node-redis v5
    const redis = await getRedis();

    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, 60 * 60 * 24 * 2); // 2 días
    }

    if (count > 8) {
      return res.status(429).json({
        ok: false,
        error: "dail
