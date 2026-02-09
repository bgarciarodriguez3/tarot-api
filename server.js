/**
 * server.js - tarot-api
 * Railway + Express + Resend (Shopify webhook / test endpoint)
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Resend } = require("resend");

const app = express();

// ====== Middlewares (ANTES de rutas) ======
app.set("trust proxy", 1);
app.use(cors());

// Guardamos el raw body (útil para Shopify/HMAC si algún día lo validas)
app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf?.toString("utf8");
    },
  })
);

// Por si viene como form-urlencoded
app.use(express.urlencoded({ extended: true }));

// Si por alguna razón llega como texto
app.use(express.text({ type: ["text/*"], limit: "2mb" }));

// ====== Config ======
const PORT = process.env.PORT || 8080;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// ====== Health check ======
app.get("/", (_req, res) => {
  res.status(200).send("API de Tarot Activa ✅");
});

// ====== Helper: normaliza body si llegó como texto ======
function normalizeBody(req) {
  // Si express.json funcionó, req.body será objeto
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    return req.body;
  }

  // Si llegó como texto (express.text), intentamos parsear a JSON
  if (typeof req.body === "string" && req.body.trim().length > 0) {
    try {
      return JSON.parse(req.body);
    } catch (_e) {
      // no es JSON válido
      return { _rawTextBody: req.body };
    }
  }

  return {};
}

// ====== Shopify webhook / test endpoint ======
app.post("/api/shopify/order-paid", async (req, res) => {
  try {
    const parsedBody = normalizeBody(req);

    // Mezclamos query + body
    const src = { ...(req.query || {}), ...(parsedBody || {}) };

    // Email: variantes comunes
    const email =
      src.email ||
      src.customer_email ||
      src.customerEmail ||
      src?.customer?.email ||
      null;

    // Order ID: Shopify suele mandar "id" (del pedido)
    let orderId =
      src.order_id ??
      src.orderId ??
      src.orderID ??
      src.id ??
      src?.order?.id ??
      src?.order?.order_id ??
      null;

    // Normalizamos orderId a string/number simple
    if (orderId && typeof orderId === "object") {
      orderId = orderId.id || null;
    }

    if (!email || !orderId) {
      console.log("[DEBUG] Missing fields", {
        contentType: req.headers["content-type"],
        query: req.query,
        body: req.body,
        parsedBody,
        rawBody: req.rawBody,
      });

      return res.status(400).json({
        ok: false,
        error: "missing_email_or_order_id",
        accepted: "email + (order_id | orderId | id)",
        got: {
          contentType: req.headers["content-type"],
          query: req.query,
          body: req.body,
          parsedBody,
        },
      });
    }

    // Si no están configuradas las variables de Resend, solo confirmamos
    if (!RESEND_API_KEY || !EMAIL_FROM || !resend) {
      console.warn(
        "[WARN] RESEND_API_KEY o EMAIL_FROM no están configuradas. No envío email."
      );
      return res.json({
        ok: true,
        email,
        orderId,
        sent: false,
        reason: "missing_resend_env",
      });
    }

    // Enviar email con Resend
    const subject = `Pedido pagado: ${orderId}`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>✅ Pedido pagado</h2>
        <p>Hemos recibido el pago del pedido <b>#${orderId}</b>.</p>
        <p>Email del cliente: <b>${email}</b></p>
        <p>Gracias 💜</p>
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
      resendId: result?.data?.id || null,
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
