import express from "express";
import cors from "cors";
import crypto from "crypto";
import Redis from "ioredis";

const app = express();
app.use(cors());

// Necesario para verificar Shopify HMAC: guardamos rawBody
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

const redis = new Redis(process.env.REDIS_URL);
const SHOPIFY_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

function verifyShopifyHmac(rawBody, hmacHeader) {
  const digest = crypto
    .createHmac("sha256", SHOPIFY_SECRET)
    .update(rawBody)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(hmacHeader || "")
    );
  } catch {
    return false;
  }
}

function randomToken() {
  return crypto.randomBytes(16).toString("hex");
}

function normalizeOrderNumber(order) {
  return (
    String(order?.order_number || "").trim() ||
    String(order?.name || "").replace("#", "").trim()
  );
}

/**
 * ✅ DETECCIÓN ROBUSTA: SOLO por product_id exacto
 * (los títulos pueden cambiar o contener palabras comunes)
 */
function detectCfgFromOrder(order) {
  const items = Array.isArray(order?.line_items) ? order.line_items : [];

  const productIds = new Set(
    items
      .map((li) => String(li?.product_id || "").trim())
      .filter(Boolean)
  );

  // === PRODUCTOS AUTOMATIZADOS (los tuyos) ===
  // Mensaje de los Ángeles (4 cartas) - producto 10496012616017
  if (productIds.has("10496012616017")) {
    return {
      productName: "Mensaje de los Ángeles (4 cartas)",
      deckId: "angeles",
      pick: 4,
      manual: false,
    };
  }

  // Camino de la Semilla Estelar (5 cartas) - producto 10495993446737
  if (productIds.has("10495993446737")) {
    return {
      productName: "Camino de la Semilla Estelar (5 cartas)",
      deckId: "semilla_estelar",
      pick: 5,
      manual: false,
    };
  }

  // Lectura Profunda (12 cartas) - producto 10493383082321
  if (productIds.has("10493383082321")) {
    return {
      productName: "Lectura Profunda: Análisis Completo (12 cartas)",
      deckId: "arcanos_mayores",
      pick: 12,
      manual: false,
    };
  }

  // Tres Puertas del Destino (3 cartas) - producto 10493369745745
  if (productIds.has("10493369745745")) {
    return {
      productName: "Tres Puertas del Destino (3 cartas)",
      deckId: "arcanos_mayores",
      pick: 3,
      manual: false,
    };
  }

  // === PREMIUM / MANUAL (fallback por título) ===
  // Si quieres, luego lo hacemos también por IDs exactos.
  const titles = items.map((li) => String(li?.title || "").toLowerCase()).join(" | ");
  if (titles.includes("premium") || titles.includes("mentoría") || titles.includes("mentoria")) {
    return {
      productName: "Servicio Premium",
      deckId: null,
      pick: null,
      manual: true,
    };
  }

  // Fallback seguro (si no se detecta nada)
  return {
    productName: "Tu lectura (3 cartas)",
    deckId: "arcanos_mayores",
    pick: 3,
    manual: false,
  };
}

// ----------------------------
// HEALTH
// ----------------------------
app.get("/", (req, res) => {
  res.send("API de Tarot en funcionamiento ✅");
});

// ----------------------------
// GET /api/token  (tu API ya lo tiene y devuelve "Falta pedido")
// ----------------------------
app.get("/api/token", async (req, res) => {
  try {
    const order = String(req.query.order || "").trim();
    if (!order) return res.status(400).json({ error: "Falta pedido" });

    const token = await redis.get(`order:${order}:token`);
    if (!token) return res.status(404).json({ error: "Pedido no encontrado" });

    return res.json({ token });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ----------------------------
// GET /api/session?token=xxxx
// ----------------------------
app.get("/api/session", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return res.status(400).json({ error: "Missing token" });

    const raw = await redis.get(`token:${token}:session`);
    if (!raw) return res.status(404).json({ error: "Session not found" });

    return res.json(JSON.parse(raw));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ----------------------------
// ✅ WEBHOOK SHOPIFY: Order Paid
// POST /api/shopify/order-paid
// ----------------------------
app.post("/api/shopify/order-paid", async (req, res) => {
  try {
    if (!SHOPIFY_SECRET) return res.status(500).send("Missing SHOPIFY_WEBHOOK_SECRET");

    const hmac = req.get("X-Shopify-Hmac-Sha256");
    const rawBody = req.rawBody;

    if (!rawBody) return res.status(400).send("Missing rawBody");
    if (!verifyShopifyHmac(rawBody, hmac)) return res.status(401).send("Invalid HMAC");

    const order = req.body;
    const orderNumber = normalizeOrderNumber(order);
    if (!orderNumber) return res.status(400).send("Missing order number");

    const cfg = detectCfgFromOrder(order);

    const token = randomToken();
    const session = {
      token,
      manual: cfg.manual,
      productName: cfg.productName,
      deckId: cfg.deckId,
      pick: cfg.pick,
      createdAt: Date.now(),
    };

    const ttl = 60 * 60 * 24 * 180; // 180 días
    await redis.set(`order:${orderNumber}:token`, token, "EX", ttl);
    await redis.set(`token:${token}:session`, JSON.stringify(session), "EX", ttl);

    return res.status(200).json({ ok: true, orderNumber, pick: cfg.pick, deckId: cfg.deckId });
  } catch (e) {
    return res.status(500).send(e.message);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server running on port", PORT));
