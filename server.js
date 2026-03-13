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
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

const sessions = new Map();
const readings = new Map();

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function verifyShopifyWebhook(req) {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  if (!hmacHeader) return false;

  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(hmacHeader)
    );
  } catch (error) {
    return false;
  }
}

function buildIntroEmailHtml({ customerName, spreadUrl }) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
      <h2>Tu tirada está lista para comenzar</h2>
      <p>Hola ${customerName || "bella alma"},</p>
      <p>Gracias por tu compra. Ya puedes acceder a tu tirada desde este enlace:</p>
      <p>
        <a href="${spreadUrl}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:8px;">
          Abrir mi tirada
        </a>
      </p>
      <p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
      <p>${spreadUrl}</p>
      <hr />
      <p style="font-size: 12px; color: #666;">Este enlace es personal y está asociado a tu compra.</p>
    </div>
  `;
}

function buildReadingEmailHtml({ customerName, spreadName, cards, interpretation }) {
  const cardsHtml = Array.isArray(cards)
    ? cards.map((card, index) => {
        return `
          <li style="margin-bottom: 8px;">
            <strong>Carta ${index + 1}:</strong> ${card.name || "Sin nombre"}
            ${card.position ? ` — <em>${card.position}</em>` : ""}
            ${card.reversed ? " (invertida)" : ""}
          </li>
        `;
      }).join("")
    : "";

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #111;">
      <h2>Tu lectura de tarot</h2>
      <p>Hola ${customerName || "bella alma"},</p>
      <p>Tu lectura ya ha sido completada. Aquí tienes el resultado:</p>

      <h3>Tapete / Tirada</h3>
      <p>${spreadName || "Tirada personalizada"}</p>

      <h3>Cartas</h3>
      <ul>
        ${cardsHtml}
      </ul>

      <h3>Interpretación</h3>
      <div style="white-space: pre-line; background: #fafafa; border: 1px solid #eee; padding: 16px; border-radius: 10px;">
        ${interpretation || ""}
      </div>

      <hr />
      <p style="font-size: 12px; color: #666;">
        Gracias por confiar en esta lectura.
      </p>
    </div>
  `;
}

async function sendIntroEmail({ to, customerName, token }) {
  const spreadUrl = `${process.env.SHOPIFY_SUCCESS_URL}?token=${token}`;

  return resend.emails.send({
    from: process.env.RESEND_FROM,
    to,
    subject: "Tu tirada de tarot ya está disponible",
    html: buildIntroEmailHtml({ customerName, spreadUrl })
  });
}

async function sendReadingEmail({ to, customerName, spreadName, cards, interpretation }) {
  return resend.emails.send({
    from: process.env.RESEND_FROM,
    to,
    subject: "Tu lectura de tarot",
    html: buildReadingEmailHtml({
      customerName,
      spreadName,
      cards,
      interpretation
    })
  });
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "tarot-backend-railway"
  });
});

app.post("/api/shopify/order-paid", async (req, res) => {
  try {
    const valid = verifyShopifyWebhook(req);

    if (!valid) {
      return res.status(401).json({
        ok: false,
        error: "invalid_webhook_signature"
      });
    }

    const order = req.body;

    const orderId = String(order.id || "");
    const customerEmail = order.email || order.contact_email || "";
    const customerName =
      order.customer?.first_name ||
      order.billing_address?.first_name ||
      "Cliente";

    if (!orderId || !customerEmail) {
      return res.status(400).json({
        ok: false,
        error: "missing_order_id_or_email"
      });
    }

    const existingSession = Array.from(sessions.values()).find(
      (session) => session.orderId === orderId
    );

    if (existingSession) {
      return res.json({
        ok: true,
        alreadyExists: true,
        token: existingSession.token
      });
    }

    const token = generateToken();

    const session = {
      token,
      orderId,
      customerEmail,
      customerName,
      status: "created",
      emailSent: false,
      emailSentAt: null,
      readingCompletedAt: null,
      createdAt: new Date().toISOString()
    };

    sessions.set(token, session);

    await sendIntroEmail({
      to: customerEmail,
      customerName,
      token
    });

    return res.json({
      ok: true,
      token
    });
  } catch (error) {
    console.error("Error en /api/shopify/order-paid:", error);
    return res.status(500).json({
      ok: false,
      error: "internal_error"
    });
  }
});

app.get("/api/session", (req, res) => {
  try {
    const token = req.query.token;

    if (!token) {
      return res.status(400).json({
        ok: false,
        error: "token_required"
      });
    }

    const session = sessions.get(token);

    if (!session) {
      return res.status(404).json({
        ok: false,
        error: "session_not_found"
      });
    }

    return res.json({
      ok: true,
      session: {
        token: session.token,
        orderId: session.orderId,
        customerEmail: session.customerEmail,
        customerName: session.customerName,
        status: session.status,
        emailSent: session.emailSent,
        emailSentAt: session.emailSentAt,
        readingCompletedAt: session.readingCompletedAt,
        createdAt: session.createdAt
      }
    });
  } catch (error) {
    console.error("Error en /api/session:", error);
    return res.status(500).json({
      ok: false,
      error: "internal_error"
    });
  }
});

app.post("/api/reading/result", async (req, res) => {
  try {
    const {
      token,
      spreadName,
      cards,
      interpretation
    } = req.body;

    if (!token) {
      return res.status(400).json({
        ok: false,
        error: "token_required"
      });
    }

    const session = sessions.get(token);

    if (!session) {
      return res.status(404).json({
        ok: false,
        error: "session_not_found"
      });
    }

    if (session.emailSent) {
      return res.json({
        ok: true,
        alreadySent: true,
        message: "La lectura ya fue enviada anteriormente"
      });
    }

    if (!Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "cards_required"
      });
    }

    if (!interpretation || typeof interpretation !== "string") {
      return res.status(400).json({
        ok: false,
        error: "interpretation_required"
      });
    }

    const reading = {
      token,
      orderId: session.orderId,
      customerEmail: session.customerEmail,
      customerName: session.customerName,
      spreadName: spreadName || "Tirada personalizada",
      cards,
      interpretation,
      createdAt: new Date().toISOString()
    };

    readings.set(token, reading);

    await sendReadingEmail({
      to: reading.customerEmail,
      customerName: reading.customerName,
      spreadName: reading.spreadName,
      cards: reading.cards,
      interpretation: reading.interpretation
    });

    session.status = "completed";
    session.emailSent = true;
    session.emailSentAt = new Date().toISOString();
    session.readingCompletedAt = new Date().toISOString();

    sessions.set(token, session);

    return res.json({
      ok: true,
      emailed: true
    });
  } catch (error) {
    console.error("Error en /api/reading/result:", error);
    return res.status(500).json({
      ok: false,
      error: "internal_error"
    });
  }
});

app.post("/api/reading/email", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        ok: false,
        error: "token_required"
      });
    }

    const session = sessions.get(token);
    const reading = readings.get(token);

    if (!session) {
      return res.status(404).json({
        ok: false,
        error: "session_not_found"
      });
    }

    if (!reading) {
      return res.status(404).json({
        ok: false,
        error: "reading_not_found"
      });
    }

    await sendReadingEmail({
      to: reading.customerEmail,
      customerName: reading.customerName,
      spreadName: reading.spreadName,
      cards: reading.cards,
      interpretation: reading.interpretation
    });

    session.emailSent = true;
    session.emailSentAt = new Date().toISOString();
    sessions.set(token, session);

    return res.json({
      ok: true,
      resent: true
    });
  } catch (error) {
    console.error("Error en /api/reading/email:", error);
    return res.status(500).json({
      ok: false,
      error: "internal_error"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});
