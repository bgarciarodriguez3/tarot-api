const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Resend } = require("resend");

const app = express();
const PORT = 8080;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const resend = new Resend(process.env.RESEND_API_KEY);

const sessions = new Map();
const readings = new Map();

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function safeStr(v) {
  return v === null || v === undefined ? "" : String(v);
}

function normalizeCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.map((card, index) => ({
    id: safeStr(card.id),
    name: safeStr(card.name) || `Carta ${index + 1}`,
    inverted: !!card.inverted
  }));
}

function getPositionTitle(index) {
  const positions = [
    "🌤 Energía actual",
    "✨ Portal de transformación",
    "👼 Consejo angelical",
    "✨ Resultado de la semana"
  ];
  return positions[index] || `Posición ${index + 1}`;
}

function generateAngelsReading(cards, productName) {
  const cleanCards = normalizeCards(cards);

  const title = productName
    ? `✨ ${productName}`
    : "✨ Tu lectura del Oráculo de los Ángeles";

  if (!cleanCards.length) {
    return {
      title,
      short: "La lectura se ha generado, pero no se recibieron cartas válidas.",
      long: "No se pudieron procesar las cartas seleccionadas. Revisa la tirada e inténtalo de nuevo."
    };
  }

  const names = cleanCards.map((c) => {
    return `${c.name}${c.inverted ? " (invertida)" : ""}`;
  });

  const short =
    `Los ángeles muestran una secuencia de guía a través de ${names.join(", ")}. ` +
    `Esta tirada de 4 cartas señala un momento de conciencia, transformación y apertura espiritual.`;

  const longParts = cleanCards.map((card, index) => {
    const posTitle = getPositionTitle(index);

    let message = "";
    if (index === 0) {
      message =
        `Esta carta marca la energía dominante que te rodea ahora. ${card.name}` +
        (card.inverted
          ? " pide revisar bloqueos emocionales o dudas internas antes de avanzar."
          : " habla de una vibración activa, disponible y receptiva para ti.");
    } else if (index === 1) {
      message =
        `Esta es la carta clave de la tirada. ${card.name}` +
        (card.inverted
          ? " sugiere soltar resistencias, miedos o viejas expectativas para permitir el cambio."
          : " abre un portal de transformación y señala aquello que comienza a alinearse a tu favor.");
    } else if (index === 2) {
      message =
        `Aquí aparece el consejo angelical. ${card.name}` +
        (card.inverted
          ? " recomienda pausa, escucha interior y una revisión consciente de tus pasos."
          : " invita a confiar, pedir señales y sostener tu intención con fe.");
    } else if (index === 3) {
      message =
        `Esta posición muestra el resultado o la energía que se consolida. ${card.name}` +
        (card.inverted
          ? " indica que el desenlace llega, pero requiere paciencia y reajuste."
          : " anuncia una evolución favorable si mantienes claridad, serenidad y apertura.");
    } else {
      message = `${card.name} aporta una capa adicional a la lectura.`;
    }

    return `${posTitle}: ${message}`;
  });

  const long =
    longParts.join("\n\n") +
    `\n\n✨ Mensaje general:\n` +
    `Tu lectura habla de guía, movimiento interior y una apertura sutil pero real. Los ángeles te invitan a escuchar con calma, sostener tu fe y permitir que el proceso revele su sentido paso a paso.`;

  return { title, short, long };
}

function buildAccessEmailHtml({ customerName, readingUrl, productName, orderNumber }) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
      <h2>Tu lectura está lista para comenzar</h2>
      <p>Hola ${customerName || "bella alma"},</p>
      <p>Hemos recibido tu compra correctamente.</p>
      ${productName ? `<p><strong>${productName}</strong></p>` : ""}
      ${orderNumber ? `<p>Pedido: <strong>${orderNumber}</strong></p>` : ""}
      <p>Pulsa aquí para acceder a tu lectura:</p>
      <p>
        <a href="${readingUrl}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:8px;">
          Acceder a mi lectura
        </a>
      </p>
      <p>Si el botón no funciona, copia este enlace en tu navegador:</p>
      <p>${readingUrl}</p>
    </div>
  `;
}

function buildAutomaticReadingEmailHtml({ customerName, reading, cards }) {
  const cardsHtml = normalizeCards(cards)
    .map((card, index) => {
      return `
        <li style="margin-bottom:8px;">
          <strong>${getPositionTitle(index)}:</strong> ${card.name}${card.inverted ? " (invertida)" : ""}
        </li>
      `;
    })
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
      <h2>${reading.title || "Tu lectura del Oráculo de los Ángeles"}</h2>
      <p>Hola ${customerName || "bella alma"},</p>

      <h3>Mensaje general</h3>
      <p style="white-space:pre-line;">${reading.short || ""}</p>

      <h3>Profundización</h3>
      <div style="white-space:pre-line;background:#fafafa;padding:16px;border:1px solid #eee;border-radius:8px;">
        ${reading.long || ""}
      </div>

      <h3 style="margin-top:16px;">Tus cartas</h3>
      <ul>
        ${cardsHtml}
      </ul>
    </div>
  `;
}

async function sendAccessEmail({ to, customerName, token, productName, orderNumber }) {
  const readingUrl = `${process.env.SHOPIFY_SUCCESS_URL}?token=${encodeURIComponent(token)}&order=${encodeURIComponent(orderNumber || "")}`;

  return resend.emails.send({
    from: process.env.RESEND_FROM,
    to,
    subject: "Accede a tu lectura",
    html: buildAccessEmailHtml({
      customerName,
      readingUrl,
      productName,
      orderNumber
    })
  });
}

async function sendAutomaticReadingEmail({ to, customerName, reading, cards }) {
  const html = buildAutomaticReadingEmailHtml({
    customerName,
    reading,
    cards
  });

  const text = [
    reading.title || "Tu lectura del Oráculo de los Ángeles",
    "",
    "Mensaje general:",
    reading.short || "",
    "",
    "Profundización:",
    reading.long || ""
  ].join("\n");

  return resend.emails.send({
    from: process.env.RESEND_FROM,
    to,
    subject: "✨ Tu lectura del Oráculo de los Ángeles",
    html,
    text
  });
}

app.get("/", (req, res) => {
  return res.json({
    ok: true,
    service: "tarot-backend-railway",
    status: "up"
  });
});

app.get("/api/session", (req, res) => {
  try {
    const token = safeStr(req.query.token).trim();

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
      token: session.token,
      orderNumber: session.orderNumber,
      productName: session.productName,
      deckId: session.deckId,
      pick: session.pick,
      customerEmail: session.customerEmail,
      customerName: session.customerName,
      status: session.status,
      emailSent: session.emailSent,
      createdAt: session.createdAt
    });
  } catch (error) {
    console.error("Error en /api/session:", error);
    return res.status(500).json({
      ok: false,
      error: "internal_error"
    });
  }
});

app.post("/api/shopify/order-paid", async (req, res) => {
  try {
    console.log("Webhook recibido");
    console.log(JSON.stringify(req.body, null, 2));

    const order = req.body || {};

    const orderId = safeStr(order.id).trim();
    const orderNumber = safeStr(order.name || order.order_number || order.id).trim();
    const customerEmail = safeStr(order.email || order.contact_email).trim();
    const customerName =
      safeStr(order.customer && order.customer.first_name).trim() ||
      safeStr(order.billing_address && order.billing_address.first_name).trim() ||
      "Cliente";

    const productName =
      Array.isArray(order.line_items) && order.line_items.length > 0
        ? safeStr(order.line_items[0].title).trim() || "Lectura"
        : "Lectura";

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
        token: existingSession.token,
        orderNumber: existingSession.orderNumber,
        productName: existingSession.productName,
        deckId: existingSession.deckId,
        pick: existingSession.pick
      });
    }

    const token = generateToken();

    const session = {
      token,
      orderId,
      orderNumber,
      productName,
      deckId: "angeles",
      pick: 4,
      customerEmail,
      customerName,
      status: "created",
      emailSent: false,
      createdAt: new Date().toISOString()
    };

    sessions.set(token, session);

    let accessEmail = null;
    try {
      accessEmail = await sendAccessEmail({
        to: customerEmail,
        customerName,
        token,
        productName,
        orderNumber
      });
      console.log("Email acceso enviado:", accessEmail);
    } catch (emailError) {
      console.error("Error enviando email de acceso:", emailError);
    }

    return res.json({
      ok: true,
      token,
      orderNumber,
      productName,
      deckId: "angeles",
      pick: 4,
      accessEmailSent: !!accessEmail
    });
  } catch (error) {
    console.error("Error en /api/shopify/order-paid:", error);
    return res.status(500).json({
      ok: false,
      error: "internal_error",
      message: error.message
    });
  }
});

app.post("/api/reading/result", async (req, res) => {
  try {
    const token = safeStr(req.body.token).trim();
    const orderNumber = safeStr(req.body.order).trim();
    const deck = safeStr(req.body.deck).trim();
    const spread = Number(req.body.spread);
    const cards = normalizeCards(req.body.cards);
    const product = safeStr(req.body.product).trim();

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

    if (deck && deck !== "angeles") {
      return res.status(400).json({
        ok: false,
        error: "invalid_deck"
      });
    }

    if (spread && spread !== 4) {
      return res.status(400).json({
        ok: false,
        error: "invalid_spread"
      });
    }

    const reading = generateAngelsReading(cards, session.productName || product);

    readings.set(token, {
      token,
      orderNumber: orderNumber || session.orderNumber,
      deckId: "angeles",
      spread: 4,
      cards,
      title: reading.title,
      short: reading.short,
      long: reading.long,
      createdAt: new Date().toISOString()
    });

    let emailed = false;

    if (!session.emailSent && session.customerEmail) {
      try {
        await sendAutomaticReadingEmail({
          to: session.customerEmail,
          customerName: session.customerName,
          reading,
          cards
        });

        session.emailSent = true;
        session.status = "completed";
        session.completedAt = new Date().toISOString();
        sessions.set(token, session);

        emailed = true;
      } catch (emailError) {
        console.error("Error enviando email automático de lectura:", emailError);
      }
    }

    return res.json({
      ok: true,
      title: reading.title,
      short: reading.short,
      long: reading.long,
      emailed
    });
  } catch (error) {
    console.error("Error en /api/reading/result:", error);
    return res.status(500).json({
      ok: false,
      error: "internal_error",
      message: error.message
    });
  }
});

app.post("/api/reading/email", async (req, res) => {
  try {
    const to = safeStr(req.body.to).trim();
    const token = safeStr(req.body.token).trim();
    const subject = safeStr(req.body.subject).trim() || "Tu lectura";
    const text = safeStr(req.body.text).trim();
    const html = safeStr(req.body.html).trim();

    if (!to) {
      return res.status(400).json({
        ok: false,
        error: "to_required"
      });
    }

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

    const result = await resend.emails.send({
      from: process.env.RESEND_FROM,
      to,
      subject,
      html: html || "<p>Tu lectura está lista.</p>",
      text: text || "Tu lectura está lista."
    });

    console.log("Email manual enviado:", result);

    return res.json({
      ok: true,
      sent: true
    });
  } catch (error) {
    console.error("Error en /api/reading/email:", error);
    return res.status(500).json({
      ok: false,
      error: "internal_error",
      message: error.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});
