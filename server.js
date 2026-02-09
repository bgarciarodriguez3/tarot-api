import express from "express";
import crypto from "crypto";
import cors from "cors";
import jwt from "jsonwebtoken";
import { Resend } from "resend";

const app = express();

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Config
 * ─────────────────────────────────────────────────────────────────────────────
 */
const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_FROM = process.env.EMAIL_FROM;
const READING_BASE_URL = process.env.READING_BASE_URL;

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "48h";

// Dominio de tu tienda (para CORS)
const SHOP_DOMAIN =
  process.env.SHOP_DOMAIN || "https://eltarotdelaruedadelafortuna.com";

// Detección premium (opcionales)
const PREMIUM_KEYWORDS = (process.env.PREMIUM_KEYWORDS || "premium")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const PREMIUM_SKUS = (process.env.PREMIUM_SKUS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const PREMIUM_MESSAGE =
  process.env.PREMIUM_MESSAGE ||
  "En 48h laborables recibirás tu lectura; yo (Miriam) te la enviaré.";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Middleware
 * ─────────────────────────────────────────────────────────────────────────────
 */

// JSON para APIs normales (NO para webhook)
app.use(express.json());

// CORS para que tu página Shopify pueda llamar a /api/...
app.use(
  cors({
    origin: SHOP_DOMAIN,
    methods: ["GET", "POST", "OPTIONS"],
  })
);

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Helpers
 * ─────────────────────────────────────────────────────────────────────────────
 */
function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isPremiumItem(item) {
  const title = (item?.title || "").toLowerCase();
  const sku = (item?.sku || "").toLowerCase();

  const bySku = sku && PREMIUM_SKUS.includes(sku);
  const byKeyword = PREMIUM_KEYWORDS.some((kw) => kw && title.includes(kw));

  return Boolean(bySku || byKeyword);
}

function signReadingToken(payload) {
  if (!JWT_SECRET) throw new Error("Missing JWT_SECRET");
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyReadingToken(token) {
  if (!JWT_SECRET) throw new Error("Missing JWT_SECRET");
  return jwt.verify(token, JWT_SECRET);
}

function buildReadingLink({ orderId, email, lineItemId, sku }) {
  if (!READING_BASE_URL) return null;

  const token = signReadingToken({
    orderId,
    email,
    lineItemId,
    sku,
  });

  const url = new URL(READING_BASE_URL);
  url.searchParams.set("token", token);

  return url.toString();
}

function buildEmailHtml({ customerName, automatedItems, premiumItems, orderName }) {
  const hasAutomated = automatedItems.length > 0;
  const hasPremium = premiumItems.length > 0;

  const greetingName = customerName ? `, ${escapeHtml(customerName)}` : "";
  const orderLine = orderName ? `<p><b>Pedido:</b> ${escapeHtml(orderName)}</p>` : "";

  const automatedSection = hasAutomated
    ? `
      <h2>🔮 Lecturas automatizadas</h2>
      <p>Haz clic en tu(s) enlace(s) para realizar la lectura:</p>
      <ul>
        ${automatedItems
          .map(
            (it) => `
          <li>
            <b>${escapeHtml(it.title || "Lectura")}</b>
            ${it.quantity > 1 ? ` (x${it.quantity})` : ""}
            <br/>
            <a href="${escapeHtml(it.link)}">Abrir lectura</a>
          </li>
        `
          )
          .join("")}
      </ul>
    `
    : "";

  const premiumSection = hasPremium
    ? `
      <h2>✨ Lecturas premium</h2>
      <p>${escapeHtml(PREMIUM_MESSAGE)}</p>
      <ul>
        ${premiumItems
          .map(
            (it) => `
          <li>
            <b>${escapeHtml(it.title || "Lectura premium")}</b>
            ${it.quantity > 1 ? ` (x${it.quantity})` : ""}
          </li>
        `
          )
          .join("")}
      </ul>
    `
    : "";

  const fallback =
    !hasAutomated && !hasPremium
      ? `<p>Hemos recibido tu compra. Si necesitas ayuda, responde a este email.</p>`
      : "";

  return `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.5;">
      <p>Hola${greetingName} 👋</p>
      ${orderLine}
      ${automatedSection}
      ${premiumSection}
      ${fallback}
      <hr/>
      <p style="color:#555;">Con cariño,<br/>Miriam</p>
    </div>
  `;
}

/**
 * Verificación HMAC de Shopify para webhooks.
 * IMPORTANTÍSIMO: el body debe ser RAW exactamente.
 */
function verifyShopifyHmac(rawBodyBuffer, hmacHeader) {
  if (!SHOPIFY_WEBHOOK_SECRET) {
    return { ok: false, error: "Missing SHOPIFY_WEBHOOK_SECRET" };
  }
  if (!hmacHeader) {
    return { ok: false, error: "Missing X-Shopify-Hmac-Sha256" };
  }

  const digest = crypto
    .createHmac("sha256", SHOPIFY_WEBHOOK_SECRET)
    .update(rawBodyBuffer)
    .digest("base64");

  const safeEqual =
    digest.length === hmacHeader.length &&
    crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));

  return safeEqual ? { ok: true } : { ok: false, error: "Invalid HMAC" };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Routes
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Healthcheck
app.get("/health", (req, res) => res.status(200).send("ok"));

/**
 * Validación del token desde la página Shopify:
 * GET /api/reading/validate?token=...
 */
app.get("/api/reading/validate", (req, res) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(400).json({ ok: false, error: "Missing token" });

    const decoded = verifyReadingToken(token);
    return res.json({ ok: true, decoded });
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Invalid/expired token" });
  }
});

/**
 * Webhook Shopify (order paid)
 * IMPORTANT: usamos express.raw SOLO en esta ruta.
 */
app.post(
  "/webhooks/shopify/order-paid",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
      const check = verifyShopifyHmac(req.body, hmacHeader);

      if (!check.ok) {
        return res.status(401).send(check.error);
      }

      let payload;
      try {
        payload = JSON.parse(req.body.toString("utf8"));
      } catch {
        return res.status(400).send("Invalid JSON");
      }

      const email =
        payload?.email ||
        payload?.customer?.email ||
        payload?.contact_email ||
        null;

      if (!email) {
        console.warn("Order without email. order_id:", payload?.id);
        return res.status(200).send("No email; acknowledged");
      }

      if (!EMAIL_FROM) return res.status(500).send("Missing EMAIL_FROM");
      if (!process.env.RESEND_API_KEY) return res.status(500).send("Missing RESEND_API_KEY");
      if (!READING_BASE_URL) return res.status(500).send("Missing READING_BASE_URL");
      if (!JWT_SECRET) return res.status(500).send("Missing JWT_SECRET");

      const customerName =
        payload?.customer?.first_name ||
        payload?.billing_address?.first_name ||
        "";

      const orderId = payload?.id;
      const orderName = payload?.name; // e.g. "#1234"

      const lineItems = Array.isArray(payload?.line_items) ? payload.line_items : [];

      const premiumItems = [];
      const automatedItems = [];

      for (const item of lineItems) {
        const premium = isPremiumItem(item);

        const base = {
          title: item?.title,
          sku: item?.sku,
          quantity: item?.quantity || 1,
          lineItemId: item?.id,
        };

        if (premium) {
          premiumItems.push(base);
        } else {
          const link = buildReadingLink({
            orderId,
            email,
            lineItemId: item?.id,
            sku: item?.sku,
          });

          automatedItems.push({ ...base, link });
        }
      }

      const subjectParts = [];
      if (automatedItems.length) subjectParts.push("Tu(s) lectura(s) automatizada(s)");
      if (premiumItems.length) subjectParts.push("Tu lectura premium");
      const subject =
        subjectParts.length > 0
          ? `${subjectParts.join(" + ")} – El Tarot de la Rueda de la Fortuna`
          : `Tu compra – El Tarot de la Rueda de la Fortuna`;

      const html = buildEmailHtml({
        customerName,
        automatedItems,
        premiumItems,
        orderName,
      });

      await resend.emails.send({
        from: EMAIL_FROM,
        to: email,
        subject,
        html,
      });

      return res.status(200).send("OK");
    } catch (err) {
      console.error("Webhook error:", err);
      // Acknowledge to avoid Shopify retry storm
      return res.status(200).send("Failed but acknowledged");
    }
  }
);

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Start
 * ─────────────────────────────────────────────────────────────────────────────
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
