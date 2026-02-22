import express from "express";
import cors from "cors";
import crypto from "crypto";
import Redis from "ioredis";

const app = express();
app.use(cors());

// Guardar rawBody para verificar HMAC Shopify
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

const redis = new Redis(process.env.REDIS_URL);

const SHOPIFY_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

// ✅ Añadido para CRON (Railway)
const CRON_SECRET = process.env.CRON_SECRET;

// ----------------------------
// Helpers
// ----------------------------
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
 * ✅ DETECCIÓN POR PRODUCT_ID EXACTO (tus 4 productos)
 */
function detectCfgFromProductIds(productIds) {
  // Mensaje de los Ángeles (4)
  if (productIds.has("10496012616017")) {
    return {
      productName: "Mensaje de los Ángeles (4 cartas)",
      deckId: "angeles",
      pick: 4,
      manual: false,
    };
  }

  // Semilla Estelar (5)
  if (productIds.has("10495993446737")) {
    return {
      productName: "Camino de la Semilla Estelar (5 cartas)",
      deckId: "semilla_estelar",
      pick: 5,
      manual: false,
    };
  }

  // Lectura Profunda (12)
  if (productIds.has("10493383082321")) {
    return {
      productName: "Lectura Profunda: Análisis Completo (12 cartas)",
      deckId: "arcanos_mayores",
      pick: 12,
      manual: false,
    };
  }

  // Tres Puertas (3)
  if (productIds.has("10493369745745")) {
    return {
      productName: "Tres Puertas del Destino (3 cartas)",
      deckId: "arcanos_mayores",
      pick: 3,
      manual: false,
    };
  }

  // Fallback seguro
  return {
    productName: "Tu lectura (3 cartas)",
    deckId: "arcanos_mayores",
    pick: 3,
    manual: false,
  };
}

function detectCfgFromOrder(order) {
  const items = Array.isArray(order?.line_items) ? order.line_items : [];
  const productIds = new Set(
    items.map((li) => String(li?.product_id || "").trim()).filter(Boolean)
  );

  return detectCfgFromProductIds(productIds);
}

// ✅ helper cron secret
function isCronAuthorized(req) {
  const q = String(req.query.secret || "").trim();
  const h = String(req.get("x-cron-secret") || "").trim();
  return Boolean(CRON_SECRET) && (q === CRON_SECRET || h === CRON_SECRET);
}

// =====================================================
// ✅ TU LÓGICA DE REFRESH SEMANAL VA AQUÍ
// =====================================================
async function runWeeklyRefresh() {
  /**
   * Aquí es donde debe ir la lógica real que:
   * - calcula nuevas descripciones
   * - actualiza los 4 productos en Shopify
   *
   * Si ya tienes esa lógica en otro archivo (por ejemplo lib/products.js),
   * impórtala y ejecútala aquí.
   *
   * Ejemplo:
   *   const result = await refreshFourProducts();
   *   return result;
   */

  // Placeholder seguro:
  return {
    message: "Cron ejecutado (placeholder). Conecta aquí tu lógica de update Shopify.",
    updated: 0,
  };
}

// ----------------------------
// HEALTH
// ----------------------------
app.get("/", (req, res) => {
  res.send("API de Tarot en funcionamiento ✅");
});

// ----------------------------
// ✅ CRON (Railway) - FIX del 404
// URL esperada: /cron/weekly-refresh?secret=XXX
// Método: POST (Vercel hace POST) pero también permitimos GET para test en navegador
// ----------------------------
app.all("/cron/weekly-refresh", async (req, res) => {
  try {
    if (!CRON_SECRET) {
      return res.status(500).json({ ok: false, error: "Missing CRON_SECRET in Railway env" });
    }

    if (!isCronAuthorized(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized cron" });
    }

    // Permitimos GET y POST (Vercel usa POST)
    if (req.method !== "POST" && req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const result = await runWeeklyRefresh();

    return res.status(200).json({
      ok: true,
      route: "/cron/weekly-refresh",
      method: req.method,
      result,
      ts: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ----------------------------
// GET /api/token?order=1063
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

    // OJO: esto sobreescribe el mapping del order si existía
    await redis.set(`order:${orderNumber}:token`, token, "EX", ttl);
    await redis.set(`token:${token}:session`, JSON.stringify(session), "EX", ttl);

    return res.status(200).json({ ok: true, orderNumber, pick: cfg.pick, deckId: cfg.deckId });
  } catch (e) {
    return res.status(500).send(e.message);
  }
});

// =====================================================
// ✅ ADMIN: borrar pedido viejo (para regenerar / limpiar)
// GET /api/admin/clear-order?secret=XXX&order=1063
// =====================================================
app.get("/api/admin/clear-order", async (req, res) => {
  try {
    const secret = String(req.query.secret || "");
    const order = String(req.query.order || "").trim();
    if (!ADMIN_SECRET) return res.status(500).json({ error: "Missing ADMIN_SECRET" });
    if (secret !== ADMIN_SECRET) return res.status(401).json({ error: "Unauthorized" });
    if (!order) return res.status(400).json({ error: "Missing order" });

    const token = await redis.get(`order:${order}:token`);
    if (token) {
      await redis.del(`token:${token}:session`);
    }
    await redis.del(`order:${order}:token`);

    return res.json({ ok: true, clearedOrder: order, clearedToken: token || null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// =====================================================
// ✅ ADMIN: reconstruir sesión manualmente para un pedido
// GET /api/admin/rebuild-order?secret=XXX&order=1063&product_id=10493369745745
// =====================================================
app.get("/api/admin/rebuild-order", async (req, res) => {
  try {
    const secret = String(req.query.secret || "");
    const order = String(req.query.order || "").trim();
    const productId = String(req.query.product_id || "").trim();

    if (!ADMIN_SECRET) return res.status(500).json({ error: "Missing ADMIN_SECRET" });
    if (secret !== ADMIN_SECRET) return res.status(401).json({ error: "Unauthorized" });
    if (!order) return res.status(400).json({ error: "Missing order" });
    if (!productId) return res.status(400).json({ error: "Missing product_id" });

    const cfg = detectCfgFromProductIds(new Set([productId]));
    const token = randomToken();

    const session = {
      token,
      manual: cfg.manual,
      productName: cfg.productName,
      deckId: cfg.deckId,
      pick: cfg.pick,
      createdAt: Date.now(),
      rebuilt: true,
      rebuiltFromProductId: productId,
    };

    const ttl = 60 * 60 * 24 * 180;
    await redis.set(`order:${order}:token`, token, "EX", ttl);
    await redis.set(`token:${token}:session`, JSON.stringify(session), "EX", ttl);

    return res.json({ ok: true, orderNumber: order, token, pick: cfg.pick, deckId: cfg.deckId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server running on port", PORT));
