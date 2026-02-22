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
const CRON_SECRET = process.env.CRON_SECRET;

/* =====================================================
   UTILIDADES
===================================================== */

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

/* =====================================================
   CONFIG PRODUCTOS AUTOMATIZADOS
===================================================== */

function detectCfgFromProductIds(productIds) {

  if (productIds.has("10496012616017")) {
    return { productName: "Mensaje de los Ángeles (4 cartas)", deckId: "angeles", pick: 4, manual: false };
  }

  if (productIds.has("10495993446737")) {
    return { productName: "Camino de la Semilla Estelar (5 cartas)", deckId: "semilla_estelar", pick: 5, manual: false };
  }

  if (productIds.has("10493383082321")) {
    return { productName: "Lectura Profunda (12 cartas)", deckId: "arcanos_mayores", pick: 12, manual: false };
  }

  if (productIds.has("10493369745745")) {
    return { productName: "Tres Puertas del Destino (3 cartas)", deckId: "arcanos_mayores", pick: 3, manual: false };
  }

  return { productName: "Tu lectura (3 cartas)", deckId: "arcanos_mayores", pick: 3, manual: false };
}

function detectCfgFromOrder(order) {
  const items = Array.isArray(order?.line_items) ? order.line_items : [];
  const productIds = new Set(
    items.map(li => String(li?.product_id || "").trim()).filter(Boolean)
  );
  return detectCfgFromProductIds(productIds);
}

/* =====================================================
   HEALTH
===================================================== */

app.get("/", (req, res) => {
  res.send("API de Tarot en funcionamiento ✅");
});

/* =====================================================
   TOKEN
===================================================== */

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

/* =====================================================
   WEBHOOK SHOPIFY
===================================================== */

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

    const ttl = 60 * 60 * 24 * 180;

    await redis.set(`order:${orderNumber}:token`, token, "EX", ttl);
    await redis.set(`token:${token}:session`, JSON.stringify(session), "EX", ttl);

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).send(e.message);
  }
});

/* =====================================================
   ✅ CRON WEEKLY REFRESH (LLAMADO DESDE VERCEL)
===================================================== */

app.post("/cron/weekly-refresh", async (req, res) => {
  try {
    const secret = String(req.query.secret || "");

    if (!CRON_SECRET) {
      return res.status(500).json({ ok: false, error: "Missing CRON_SECRET" });
    }

    if (secret !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    console.log("🔥 Ejecutando weekly refresh...");

    // 👉 AQUÍ irá la lógica real que actualiza las descripciones
    // Por ahora dejamos confirmación de ejecución

    return res.json({
      ok: true,
      message: "Weekly refresh ejecutado correctamente",
      at: new Date().toISOString()
    });

  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: String(e?.message || e)
    });
  }
});

/* =====================================================
   ADMIN
===================================================== */

app.get("/api/admin/clear-order", async (req, res) => {
  try {
    const secret = String(req.query.secret || "");
    const order = String(req.query.order || "").trim();

    if (!ADMIN_SECRET) return res.status(500).json({ error: "Missing ADMIN_SECRET" });
    if (secret !== ADMIN_SECRET) return res.status(401).json({ error: "Unauthorized" });
    if (!order) return res.status(400).json({ error: "Missing order" });

    const token = await redis.get(`order:${order}:token`);
    if (token) await redis.del(`token:${token}:session`);
    await redis.del(`order:${order}:token`);

    return res.json({ ok: true });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/* =====================================================
   START SERVER
===================================================== */

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server running on port", PORT));
