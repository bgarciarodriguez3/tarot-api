/**
 * server.js - tarot-api
 * Railway + Express + Resend (Shopify webhook / test endpoint)
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Resend } = require("resend");

const app = express();

// ====== Middlewares (IMPORTANTE: ANTES de rutas) ======
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true })); // para x-www-form-urlencoded

// ====== Config ======
const PORT = process.env.PORT || 8080;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;

// Resend client (solo si hay key)
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// ====== Health check ======
app.get("/", (_req, res) => {
  res.status(200).send("API de Tarot Activa ✅");
});

// ====== Shopify webhook / test endpoint ======
app.post("/api/shopify/order-paid", async (req, res) => {
  try {
    // Acepta body o querystring (por si pruebas desde navegador)
    const src = { ...(req.query || {}), ...(req.body || {}) };

    // Email: distintas variantes
    const email =
      src.email ||
      src.customer_email ||
      src.customerEmail ||
      (src.customer && src.customer.email) ||
      null;

    // OrderId: distintas variantes
    const orderId =
      src.order_id ||
      src.orderId ||
      src.orderID ||
      src.id ||
      src.order ||
      (src.order && src.order.id) ||
      null;

    if (!email || !orderId) {
      return res.status(400).json({
        ok: false,
        error: "missing_email_or_order_id",
        hint: "Envía JSON con { email, orderId } o { email, order_id }",
        got: { query: req.query, body: req.body },
      });
    }

    // Si no están configuradas las variables de Resend, solo confirmamos
    if (!RESEND_API_KEY || !EMAIL_FROM) {
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
      resend: result,
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
