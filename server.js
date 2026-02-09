/**
 * server.js - tarot-api
 * Railway + Express + Resend (Shopify webhook)
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Resend } = require("resend");

const app = express();

// ====== Middlewares ======
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ====== Config ======
const PORT = process.env.PORT || 8080;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM; // Ej: El Tarot de la Rueda de la Fortuna <hola@eltarotdelaruedadelafortuna.com>
const READING_BASE_URL = process.env.READING_BASE_URL; // Ej: https://eltarotdelaruedadelafortuna.com/lectura

// Cómo detectar premium
// 1) Por keywords en el título (separadas por coma), ej: "premium,mentoría,amor premium"
const PREMIUM_KEYWORDS = (process.env.PREMIUM_KEYWORDS || "premium")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// 2) Por SKU exacto (separados por coma), ej: "PREM-001,PREM-LOVE"
const PREMIUM_SKUS = (process.env.PREMIUM_SKUS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Mensaje premium (editable)
const PREMIUM_MESSAGE =
  process.env.PREMIUM_MESSAGE ||
  "🕯️ Gracias por tu confianza. En un máximo de 48 horas laborables recibirás tu lectura premium. Yo (Miriam) seré la responsable de prepararla y enviártela por email.";

// Resend client
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// ====== Health check ======
app.get("/", (_req, res) => {
  res.status(200).send("API de Tarot Activa ✅");
});

// ====== Helpers ======
function pickEmail(src) {
  return (
    src.email ||
    src.customer_email ||
    src.customerEmail ||
    (src.customer && src.customer.email) ||
    null
  );
}

function pickOrderId(src) {
  return (
    src.order_id ||
    src.orderId ||
    src.orderID ||
    src.id ||
    (src.order && src.order.id) ||
    null
  );
}

function normalizeLineItems(src) {
  // Shopify normalmente manda line_items en el body del webhook del pedido
  const items = src.line_items || (src.order && src.order.line_items) || [];
  if (!Array.isArray(items)) return [];
  return items.map((it) => ({
    title: (it.title || it.name || "").toString(),
    quantity: Number(it.quantity || 1),
    sku: (it.sku || "").toString(),
    variant_id: it.variant_id || null,
    product_id: it.product_id || null,
  }));
}

function isPremiumItem(item) {
  const title = (item.title || "").toLowerCase();
  const sku = (item.sku || "").toLowerCase();

  const bySku = sku && PREMIUM_SKUS.includes(sku);
  const byKeyword =
    title && PREMIUM_KEYWORDS.some((kw) => kw && title.includes(kw));

  return Boolean(bySku || byKeyword);
}

function buildAutomatedLinks({ email, orderId, automatedItems }) {
  // Un enlace por item (si prefieres 1 solo enlace general, lo cambio)
  if (!READING_BASE_URL) return [];

  return automatedItems.map((item, idx) => {
    const qs = new URLSearchParams({
      email,
      orderId: String(orderId),
      item: item.title,
      sku: item.sku || "",
      n: String(idx + 1),
    });

    return {
      title: item.title,
      quantity: item.quantity,
      url: `${READING_BASE_URL}?${qs.toString()}`,
    };
  });
}

// ====== Shopify endpoint ======
app.post("/api/shopify/order-paid", async (req, res) => {
  try {
    const src = { ...(req.query || {}), ...(req.body || {}) };

    const email = pickEmail(src);
    const orderId = pickOrderId(src);
    const lineItems = normalizeLineItems(src);

    if (!email || !orderId) {
      return res.status(400).json({
        ok: false,
        error: "missing_email_or_order_id",
        hint: "Envía JSON con { email, orderId } o webhook de Shopify con customer.email e id",
        got: { query: req.query, body: req.body },
      });
    }

    // Si no vienen items, igual funciona, solo mandará email básico
    const premiumItems = lineItems.filter(isPremiumItem);
    const automatedItems = lineItems.filter((it) => !isPremiumItem(it));

    const links = buildAutomatedLinks({ email, orderId, automatedItems });

    // Si Resend no está listo, devolvemos ok sin enviar
    if (!RESEND_API_KEY || !EMAIL_FROM) {
      console.warn("[WARN] Falta RESEND_API_KEY o EMAIL_FROM. No envío email.");
      return res.json({
        ok: true,
        email,
        orderId,
        sent: false,
        reason: "missing_resend_env",
        counts: {
          totalItems: lineItems.length,
          automated: automatedItems.length,
          premium: premiumItems.length,
        },
      });
    }

    // ====== Construir email ======
    const subject = `✅ Gracias por tu compra (Pedido ${orderId})`;

    const automatedSection =
      automatedItems.length > 0
        ? `
          <h3>🔮 Lecturas automatizadas</h3>
          <p>Para generar tu lectura, entra en el/los enlace(s) de abajo:</p>
          <ul>
            ${links.length > 0
              ? links
                  .map(
                    (l) => `
                    <li>
                      <b>${l.title}</b> (x${l.quantity})<br/>
                      <a href="${l.url}">${l.url}</a>
                    </li>`
                  )
                  .join("")
              : `<li><b>${automatedItems
                  .map((it) => `${it.title} (x${it.quantity})`)
                  .join(", ")}</b><br/>
                  <i>Falta configurar READING_BASE_URL para generar enlaces.</i>
                </li>`}
          </ul>
        `
        : "";

    const premiumSection =
      premiumItems.length > 0
        ? `
          <h3>✨ Lecturas premium</h3>
          <p>Has comprado:</p>
          <ul>
            ${premiumItems
              .map(
                (it) => `<li><b>${it.title}</b> (x${it.quantity})</li>`
              )
              .join("")}
          </ul>
          <p>${PREMIUM_MESSAGE}</p>
        `
        : "";

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Gracias por tu compra 💜</h2>
        <p>Pedido: <b>${orderId}</b></p>
        ${automatedSection}
        ${premiumSection}
        <hr/>
        <p style="font-size: 12px; color: #666;">
          Si necesitas ayuda, responde a este correo.
        </p>
      </div>
    `;

    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject,
      html,
    });

    console.log("[RESEND] Email enviado:", result?.data?.id || result);

    return res.json({
      ok: true,
      email,
      orderId,
      sent: true,
      resend: result,
      counts: {
        totalItems: lineItems.length,
        automated: automatedItems.length,
        premium: premiumItems.length,
      },
    });
  } catch (err) {
    console.error("[ERROR] /api/shopify/order-paid:", err);
    return res.status(500).json({
      ok: false,
      error: "server_error",
      details: String(err?.message || err),
    });
  }
});

// ====== Start server ======
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
