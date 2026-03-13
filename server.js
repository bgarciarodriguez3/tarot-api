const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const dotenv = require("dotenv");
const { Resend } = require("resend");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors());

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

const sessions = new Map();
const readings = new Map();

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function verifyShopifyWebhook(req) {
  try {
    const hmacHeader = req.get("X-Shopify-Hmac-Sha256");

    if (!hmacHeader) {
      console.error("No viene X-Shopify-Hmac-Sha256");
      return false;
    }

    if (!req.rawBody) {
      console.error("req.rawBody no existe");
      return false;
    }

    if (!process.env.SHOPIFY_WEBHOOK_SECRET) {
      console.error("SHOPIFY_WEBHOOK_SECRET no está definido");
      return false;
    }

    const digest = crypto
      .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
      .update(req.rawBody)
      .digest("base64");

    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(hmacHeader)
    );
  } catch (error) {
    console.error("Error verificando firma Shopify:", error);
    return false;
  }
}

function buildIntroEmailHtml({ customerName, spreadUrl }) {
  return `
    <div style="font-family: Arial, sans-serif;">
      <h2>Tu tirada está lista</h2>
      <p>Hola ${customerName || "bella alma"},</p>
      <p>Puedes acceder a tu tirada desde aquí:</p>
      <p>
        <a href="${spreadUrl}" style="padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:8px;">
          Abrir tirada
        </a>
      </p>
      <p>${spreadUrl}</p>
    </div>
  `;
}

function buildReadingEmailHtml({ customerName, spreadName, cards, interpretation }) {
  const cardsHtml = cards
    .map(
      (card, i) => `
        <li>
          <strong>Carta ${i + 1}:</strong> ${card.name}
          ${card.position ? " — " + card.position : ""}
          ${card.reversed ? " (invertida)" : ""}
        </li>
      `
    )
    .join("");

  return `
    <div style="font-family: Arial;">
      <h2>Tu lectura de tarot</h2>
      <p>Hola ${customerName}</p>

      <h3>${spreadName}</h3>

      <ul>
        ${cardsHtml}
      </ul>

      <h3>Interpretación</h3>

      <div style="white-space:pre-line;background:#fafafa;padding:15px;border-radius:8px">
      ${interpretation}
      </div>
    </div>
  `;
}

async function sendIntroEmail({ to, customerName, token }) {
  const spreadUrl = `${process.env.SHOPIFY_SUCCESS_URL}?token=${token}`;

  return await resend.emails.send({
    from: process.env.RESEND_FROM,
    to,
    subject: "Tu tirada de tarot está lista",
    html: buildIntroEmailHtml({ customerName, spreadUrl }),
  });
}

async function sendReadingEmail({ to, customerName, spreadName, cards, interpretation }) {
  return await resend.emails.send({
    from: process.env.RESEND_FROM,
    to,
    subject: "Tu lectura de tarot",
    html: buildReadingEmailHtml({
      customerName,
      spreadName,
      cards,
      interpretation,
    }),
  });
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "tarot-backend-railway",
  });
});

app.get("/api/session", (req, res) => {
  try {
    const token = req.query.token;

    if (!token) {
      return res.status(400).json({ ok: false, error: "token_required" });
    }

    const session = sessions.get(token);

    if (!session) {
      return res.status(404).json({ ok: false, error: "session_not_found" });
    }

    return res.json({ ok: true, session });
  } catch (error) {
    console.error("Error en /api/session", error);

    res.status(500).json({
      ok: false,
      error: "internal_error",
    });
  }
});

app.post("/api/shopify/order-paid", async (req, res) => {
  try {
    console.log("=== WEBHOOK /api/shopify/order-paid ===");

    console.log("Headers:", req.headers);

    console.log("Body recibido:", JSON.stringify(req.body, null, 2));

    const valid = verifyShopifyWebhook(req);

    console.log("Firma válida:", valid);

    if (!valid) {
      return res.status(401).json({
        ok: false,
        error: "invalid_webhook_signature",
      });
    }

    const order = req.body;

    const orderId = String(order.id || "");

    const customerEmail = order.email || order.contact_email || "";

    const customerName =
      order.customer?.first_name ||
      order.billing_address?.first_name ||
      "Cliente";

    console.log("orderId:", orderId);
    console.log("customerEmail:", customerEmail);

    if (!orderId || !customerEmail) {
      return res.status(400).json({
        ok: false,
        error: "missing_order_id_or_email",
      });
    }

    const existingSession = Array.from(sessions.values()).find(
      (s) => s.orderId === orderId
    );

    if (existingSession) {
      console.log("Sesion ya existente");

      return res.json({
        ok: true,
        alreadyExists: true,
        token: existingSession.token,
      });
    }

    const token = generateToken();

    const session = {
      token,
      orderId,
      customerEmail,
      customerName,
      createdAt: new Date().toISOString(),
      emailSent: false,
    };

    sessions.set(token, session);

    console.log("Sesion creada:", token);

    console.log("Enviando email inicial...");

    const emailResult = await sendIntroEmail({
      to: customerEmail,
      customerName,
      token,
    });

    console.log("Resultado resend:", emailResult);

    return res.json({
      ok: true,
      token,
    });
  } catch (error) {
    console.error("ERROR EN WEBHOOK");

    console.error(error);

    res.status(500).json({
      ok: false,
      error: "internal_error",
      message: error.message,
    });
  }
});

app.post("/api/reading/result", async (req, res) => {
  try {
    const { token, spreadName, cards, interpretation } = req.body;

    const session = sessions.get(token);

    if (!session) {
      return res.status(404).json({
        ok: false,
        error: "session_not_found",
      });
    }

    if (session.emailSent) {
      return res.json({
        ok: true,
        alreadySent: true,
      });
    }

    const reading = {
      token,
      spreadName,
      cards,
      interpretation,
      createdAt: new Date().toISOString(),
    };

    readings.set(token, reading);

    await sendReadingEmail({
      to: session.customerEmail,
      customerName: session.customerName,
      spreadName,
      cards,
      interpretation,
    });

    session.emailSent = true;

    sessions.set(token, session);

    res.json({
      ok: true,
      emailed: true,
    });
  } catch (error) {
    console.error("Error en /api/reading/result", error);

    res.status(500).json({
      ok: false,
      error: "internal_error",
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});
