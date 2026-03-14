const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Resend } = require("resend");

const app = express();
const PORT = 8080;

app.use(cors());
app.use(
  express.json({
    limit: "2mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);

const resend = new Resend(process.env.RESEND_API_KEY);

const sessions = new Map();
const readings = new Map();

const PRODUCT_CONFIGS = {
  "10496012616017": {
    productId: "10496012616017",
    deckId: "angeles",
    pick: 4,
    label: "Mensaje de los Ángeles ✨ Lectura Angelical de tirada de 4 Cartas",
    emailSubject: "✨ Tu lectura del Oráculo de los Ángeles",
    positions: [
      "🌤 Energía actual",
      "✨ Portal de transformación",
      "👼 Consejo angelical",
      "✨ Resultado de la semana"
    ]
  },
  "10495993446737": {
    productId: "10495993446737",
    deckId: "semilla_estelar",
    pick: 5,
    label: "Camino de la Semilla Estelar",
    emailSubject: "✨ Tu lectura de la Semilla Estelar",
    positions: [
      "🌌 Origen del llamado",
      "⭐ Carta clave",
      "🛸 Memoria que despierta",
      "🪐 Consejo de tus guías",
      "✨ Próximo portal"
    ]
  },
  "10493383082321": {
    productId: "10493383082321",
    deckId: "arcanos_mayores",
    pick: 12,
    label: "Lectura Profunda: Análisis Completo",
    emailSubject: "🔮 Tu Lectura Profunda",
    positions: [
      "1. Situación actual",
      "2. Energía oculta",
      "3. Origen del conflicto",
      "4. Don o recurso",
      "5. Bloqueo",
      "6. Influencia externa",
      "7. Aprendizaje",
      "8. Acción recomendada",
      "9. Evolución inmediata",
      "10. Resultado probable",
      "11. Integración espiritual",
      "12. Síntesis final"
    ]
  },
  "10493369745745": {
    productId: "10493369745745",
    deckId: "arcanos_mayores",
    pick: 3,
    label: "Tres Puertas del Destino",
    emailSubject: "✨ Tres Puertas del Destino",
    positions: [
      "🚪 Primera puerta",
      "🚪 Segunda puerta",
      "🚪 Tercera puerta"
    ]
  }
};

function safeStr(v) {
  return v === null || v === undefined ? "" : String(v);
}

function cleanStr(v) {
  return safeStr(v).trim();
}

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function normalizeCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.map((card, index) => ({
    id: cleanStr(card.id),
    name: cleanStr(card.name) || `Carta ${index + 1}`,
    inverted: !!card.inverted,
    description: cleanStr(card.description),
    is_key: !!card.is_key
  }));
}

function verifyShopifyWebhook(req) {
  const secret = cleanStr(process.env.SHOPIFY_WEBHOOK_SECRET);

  if (!secret) {
    return true;
  }

  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  if (!hmacHeader || !req.rawBody) {
    return false;
  }

  const digest = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch (_) {
    return false;
  }
}

function detectProductConfig(order) {
  const firstItem =
    Array.isArray(order.line_items) && order.line_items.length > 0
      ? order.line_items[0]
      : null;

  const productId = cleanStr(firstItem && firstItem.product_id);

  if (productId && PRODUCT_CONFIGS[productId]) {
    return PRODUCT_CONFIGS[productId];
  }

  const title = cleanStr(firstItem && firstItem.title).toLowerCase();

  if (title.includes("ángeles") || title.includes("angeles")) {
    return PRODUCT_CONFIGS["10496012616017"];
  }
  if (title.includes("semilla")) {
    return PRODUCT_CONFIGS["10495993446737"];
  }
  if (title.includes("profunda") || title.includes("análisis completo") || title.includes("analisis completo")) {
    return PRODUCT_CONFIGS["10493383082321"];
  }
  if (title.includes("tres puertas")) {
    return PRODUCT_CONFIGS["10493369745745"];
  }

  return PRODUCT_CONFIGS["10493369745745"];
}

function getConfigByDeckAndSpread(deckId, spread) {
  const found = Object.values(PRODUCT_CONFIGS).find(
    (cfg) => cfg.deckId === deckId && cfg.pick === Number(spread)
  );
  return found || null;
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
      <p>Si el botón no funciona, copia este enlace:</p>
      <p>${readingUrl}</p>
    </div>
  `;
}

function buildReadingEmailHtml({ customerName, reading, config, cards }) {
  const cardsHtml = normalizeCards(cards)
    .map((card, index) => {
      const position = config.positions[index] || `Carta ${index + 1}`;
      const descriptionHtml = card.description
        ? `<div style="white-space:pre-line;margin-top:6px;">${card.description}</div>`
        : "";
      return `
        <div style="border:1px solid rgba(0,0,0,.08);border-radius:14px;padding:14px;margin:0 0 12px;background:#fff;">
          <div style="font-weight:800;">${position}</div>
          <div style="margin-top:4px;">${card.name}${card.inverted ? " (invertida)" : ""}</div>
          ${descriptionHtml}
        </div>
      `;
    })
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111; background:#f7f7fa; padding:20px;">
      <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:20px;padding:20px;border:1px solid rgba(0,0,0,.06);">
        <h2 style="margin-top:0;">${reading.title || config.label}</h2>
        <p>Hola ${customerName || "bella alma"},</p>

        <h3>Mensaje general</h3>
        <div style="white-space:pre-line;background:#f7f7fa;padding:14px;border-radius:12px;border:1px solid rgba(0,0,0,.06);">
          ${reading.short || ""}
        </div>

        <h3 style="margin-top:18px;">Profundización</h3>
        <div style="white-space:pre-line;background:#fff7e8;padding:14px;border-radius:12px;border:1px solid rgba(218,165,32,.18);">
          ${reading.long || ""}
        </div>

        <h3 style="margin-top:18px;">Tus cartas</h3>
        ${cardsHtml}
      </div>
    </div>
  `;
}

function generateReading(cards, config, productName) {
  const normalized = normalizeCards(cards);

  const title = productName
    ? `✨ ${productName}`
    : `✨ ${config.label}`;

  if (!normalized.length) {
    return {
      title,
      short: "La lectura se ha generado, pero no se recibieron cartas válidas.",
      long: "No se pudieron procesar las cartas seleccionadas."
    };
  }

  const names = normalized.map((c) => `${c.name}${c.inverted ? " (invertida)" : ""}`);

  const short =
    `${config.label}: las cartas ${names.join(", ")} muestran una secuencia de guía y revelación. ` +
    `Esta tirada de ${config.pick} cartas abre un mapa simbólico para comprender tu momento actual.`;

  const long = normalized
    .map((card, index) => {
      const position = config.positions[index] || `Carta ${index + 1}`;

      if (index === 1) {
        return `${position}: ${card.name}${card.inverted ? " (invertida)" : ""} actúa como eje central de la lectura y marca el aprendizaje más importante del proceso.`;
      }

      return `${position}: ${card.name}${card.inverted ? " (invertida)" : ""} aporta una capa de comprensión sobre esta tirada y amplía el mensaje general.`;
    })
    .join("\n\n");

  return {
    title,
    short,
    long:
      `${long}\n\n✨ Mensaje final:\n` +
      `Permite que esta lectura se asiente dentro de ti. Observa lo que resuena, lo que se repite y lo que te pide una acción consciente.`
  };
}

async function sendAccessEmail({ to, customerName, token, productName, orderNumber }) {
  const readingUrl =
    `${process.env.SHOPIFY_SUCCESS_URL}?token=${encodeURIComponent(token)}` +
    `&order=${encodeURIComponent(orderNumber || "")}`;

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

async function sendAutomaticReadingEmail({ to, customerName, reading, config, cards }) {
  const html = buildReadingEmailHtml({
    customerName,
    reading,
    config,
    cards
  });

  const text = [
    reading.title || config.label,
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
    subject: config.emailSubject,
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
    const token = cleanStr(req.query.token);

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

    const reading = readings.get(token);

    return res.json({
      ok: true,
      token: session.token,
      orderId: session.orderId,
      orderNumber: session.orderNumber,
      productId: session.productId,
      productName: session.productName,
      deckId: session.deckId,
      pick: session.pick,
      email: session.customerEmail,
      customerEmail: session.customerEmail,
      customerName: session.customerName,
      status: session.status,
      emailSent: !!session.emailSent,
      createdAt: session.createdAt,
      readingDone: !!reading,
      reading: reading || null
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
    if (!verifyShopifyWebhook(req)) {
      return res.status(401).json({
        ok: false,
        error: "invalid_webhook_signature"
      });
    }

    const order = req.body || {};
    console.log("Webhook recibido");
    console.log(JSON.stringify(order, null, 2));

    const firstItem =
      Array.isArray(order.line_items) && order.line_items.length > 0
        ? order.line_items[0]
        : null;

    const config = detectProductConfig(order);

    const orderId = cleanStr(order.id);
    const orderNumber = cleanStr(order.name || order.order_number || order.id);
    const productId = cleanStr(firstItem && firstItem.product_id);
    const productName =
      cleanStr(firstItem && firstItem.title) || config.label;

    const customerEmail = cleanStr(order.email || order.contact_email);
    const customerName =
      cleanStr(order.customer && order.customer.first_name) ||
      cleanStr(order.billing_address && order.billing_address.first_name) ||
      "Cliente";

    if (!orderId || !customerEmail) {
      return res.status(400).json({
        ok: false,
        error: "missing_order_id_or_email"
      });
    }

    const existingSession = Array.from(sessions.values()).find(
      (s) => s.orderId === orderId
    );

    if (existingSession) {
      const reading = readings.get(existingSession.token);
      return res.json({
        ok: true,
        alreadyExists: true,
        token: existingSession.token,
        orderNumber: existingSession.orderNumber,
        productId: existingSession.productId,
        productName: existingSession.productName,
        deckId: existingSession.deckId,
        pick: existingSession.pick,
        readingDone: !!reading
      });
    }

    const token = generateToken();

    const session = {
      token,
      orderId,
      orderNumber,
      productId,
      productName,
      deckId: config.deckId,
      pick: config.pick,
      customerEmail,
      customerName,
      status: "created",
      emailSent: false,
      createdAt: new Date().toISOString()
    };

    sessions.set(token, session);

    let accessEmailSent = false;
    try {
      await sendAccessEmail({
        to: customerEmail,
        customerName,
        token,
        productName,
        orderNumber
      });
      accessEmailSent = true;
    } catch (emailError) {
      console.error("Error enviando email de acceso:", emailError);
    }

    return res.json({
      ok: true,
      token,
      orderNumber,
      productId,
      productName,
      deckId: config.deckId,
      pick: config.pick,
      accessEmailSent
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
    const token = cleanStr(req.body.token);
    const deckId = cleanStr(req.body.deck);
    const spread = Number(req.body.spread);
    const product = cleanStr(req.body.product);
    const orderNumber = cleanStr(req.body.order);
    const cards = normalizeCards(req.body.cards);

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

    if (deckId && deckId !== session.deckId) {
      return res.status(400).json({
        ok: false,
        error: "invalid_deck"
      });
    }

    if (spread && spread !== Number(session.pick)) {
      return res.status(400).json({
        ok: false,
        error: "invalid_spread"
      });
    }

    const config =
      getConfigByDeckAndSpread(session.deckId, session.pick) ||
      detectProductConfig({
        line_items: [{ title: session.productName, product_id: session.productId }]
      });

    const reading = generateReading(cards, config, session.productName || product);

    const readingRecord = {
      title: reading.title,
      short: reading.short,
      long: reading.long,
      cards,
      deckId: session.deckId,
      spread: session.pick,
      orderNumber: orderNumber || session.orderNumber,
      createdAt: new Date().toISOString()
    };

    readings.set(token, readingRecord);

    let emailed = false;

    if (!session.emailSent && session.customerEmail) {
      try {
        await sendAutomaticReadingEmail({
          to: session.customerEmail,
          customerName: session.customerName,
          reading: readingRecord,
          config,
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
      title: readingRecord.title,
      short: readingRecord.short,
      long: readingRecord.long,
      cards,
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
    const to = cleanStr(req.body.to);
    const token = cleanStr(req.body.token);
    const subject = cleanStr(req.body.subject) || "Tu lectura";
    const text = safeStr(req.body.text);
    const html = safeStr(req.body.html);
    const force = !!req.body.force;

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

    if (session.emailSent && !force) {
      return res.json({
        ok: true,
        alreadySent: true
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

    session.emailSent = true;
    sessions.set(token, session);

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
