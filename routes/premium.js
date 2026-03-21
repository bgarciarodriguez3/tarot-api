const express = require("express")
const crypto = require("crypto")
const { Resend } = require("resend")

const router = express.Router()

const resend = new Resend(process.env.RESEND_API_KEY)

const PREMIUM_PRODUCTS = {
  "10496141754705": {
    name: "Tu Camino, Tu Destino y Tus Decisiones – Mentoría",
    type: "claridad",
    formUrl: "https://forms.gle/9m6P5m3pBZ4BEybf9"
  },
  "10523108966737": {
    name: "Claridad en tus Relaciones y tu Camino Sentimental",
    type: "amor",
    formUrl: "https://forms.gle/z7Yqenb3VsrAVjij9"
  },
  "10667662606673": {
    name: "Nuevos Comienzos, Liderazgo y Economía Personal – Consulta Premium",
    type: "proposito",
    formUrl: "https://forms.gle/AyAm7JACnZCoXNsy7"
  }
}

const PREMIUM_EMAIL_FOOTER = `
  <div style="margin-top:30px;text-align:center;">

    <p style="font-size:18px;line-height:1.6;color:#241845;margin:0;">
      <strong>El Equipo de Expertos Premium del Tarot de la Rueda de la Fortuna</strong>
    </p>

    <div style="margin:14px 0;">
      <img
        src="https://cdn.shopify.com/s/files/1/0989/4694/1265/files/firma_transparente.png?v=1772104449"
        alt="La Rueda de la Fortuna"
        style="max-width:220px;width:100%;height:auto;display:inline-block;opacity:0.95;"
      />
    </div>

    <p style="margin:8px 0;font-size:14px;color:#5a4968;">
      📧 contactopremium@laruedadelafortuna.com
    </p>

    <p style="margin:4px 0 20px;font-size:14px;color:#5a4968;">
      🌐 www.laruedadelafortuna.com
    </p>

    <div style="margin-top:20px;padding-top:20px;border-top:1px solid rgba(0,0,0,0.08);font-size:12px;color:#7a6a85;line-height:1.7;text-align:left;">

      <p><strong>Aviso legal:</strong></p>

      <p>
        Este servicio corresponde a un producto digital personalizado. De acuerdo con el artículo 103 del Real Decreto Legislativo 1/2007, al tratarse de contenido digital y servicios personalizados, no es posible ejercer el derecho de desistimiento una vez iniciado el proceso.
      </p>

      <p>
        El servicio está destinado exclusivamente a personas mayores de 18 años.
      </p>

      <p>
        Las interpretaciones de tarot se ofrecen con fines de orientación personal y entretenimiento y no sustituyen asesoramiento profesional médico, legal, psicológico o financiero.
      </p>

      <p>
        Al completar el formulario y utilizar el servicio aceptas estas condiciones.
      </p>

      <p>
        Este correo es informativo y no admite respuesta.
      </p>

    </div>
  </div>
`

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function normalizePremiumPurchasePayload(body = {}) {
  return {
    orderId: body.orderId || body.shopifyOrderId || null,
    orderName: body.orderName || null,
    email: String(body.email || "").trim(),
    customerName: String(body.customerName || body.name || "").trim(),
    language: body.language || "es",
    products: Array.isArray(body.products) ? body.products : []
  }
}

function normalizePremiumSubmitPayload(body = {}) {
  return {
    submissionId:
      body.submissionId ||
      body.responseId ||
      body.formResponseId ||
      crypto.randomUUID(),

    orderId: body.orderId || body.shopifyOrderId || null,
    orderName: body.orderName || null,
    productId: body.productId || null,
    productTitle: body.productTitle || null,
    productType: body.productType || "premium_mentoria",
    spreadType: body.spreadType || "premium_mentoria",

    email: String(body.email || "").trim(),
    customerName: String(body.customerName || body.name || "").trim(),
    language: body.language || "es",

    formId: body.formId || null,
    formName: body.formName || null,
    submittedAt: body.submittedAt || new Date().toISOString(),

    focusArea: body.focusArea || "",
    mainQuestion: body.mainQuestion || "",
    context: body.context || "",
    currentSituation: body.currentSituation || "",
    blockages: body.blockages || "",
    desiredOutcome: body.desiredOutcome || "",
    background: body.background || "",
    urgencyLevel: body.urgencyLevel || "",
    extraNotes: body.extraNotes || "",

    answers: body.answers || {},
    rawForm: body.rawForm || body
  }
}

function validatePremiumPurchasePayload(payload) {
  const errors = []

  if (!payload.email) errors.push("email is required")
  if (!Array.isArray(payload.products) || payload.products.length === 0) {
    errors.push("products is required")
  }

  return {
    ok: errors.length === 0,
    errors
  }
}

function validatePremiumSubmitPayload(payload) {
  const errors = []

  if (!payload.email) errors.push("email is required")

  return {
    ok: errors.length === 0,
    errors
  }
}

function getPremiumProductsFromPayload(products = []) {
  return products
    .map((item) => {
      const productId = String(item.productId || item.id || item.product_id || "").trim()
      return {
        productId,
        quantity: Number(item.quantity || 1),
        config: PREMIUM_PRODUCTS[productId] || null
      }
    })
    .filter((item) => item.productId && item.config)
}

function buildPremiumFormsBlock(products) {
  return products
    .map((item) => {
      return `
        <div style="margin:0 0 18px;padding:18px;border:1px solid rgba(139,107,47,0.18);border-radius:18px;background:rgba(255,255,255,0.55);">
          <h3 style="margin:0 0 10px;font-size:22px;line-height:1.35;color:#241845;font-weight:normal;">
            ${escapeHtml(item.config.name)}
          </h3>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.8;color:#4a3d56;">
            Inicia tu consulta personalizada compartiendo tu situación con nosotros. Solo así podremos preparar un análisis profundo y totalmente personalizado para tu caso.
          </p>
          <div style="text-align:center;margin:18px 0 6px;">
            <a
              href="${item.config.formUrl}"
              style="display:inline-block;background:#241845;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:bold;"
            >
              Abrir formulario
            </a>
          </div>
          <p style="margin:12px 0 0;font-size:13px;line-height:1.7;color:#6d5a7b;text-align:center;">
            Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
            <span style="word-break:break-all;">${item.config.formUrl}</span>
          </p>
        </div>
      `
    })
    .join("")
}

function buildPremiumFormEmailText({ customerName, products }) {
  const lines = [
    `Hola${customerName ? ` ${customerName}` : ""},`,
    "",
    "Muchísimas gracias por confiar en nuestro maravilloso Equipo Premium.",
    "Inicia tu experiencia personalizada proporcionando los detalles necesarios para que nuestra interpretación sea un reflejo fiel de tu camino. Tu claridad comienza aquí.",
    ""
  ]

  for (const item of products) {
    lines.push(`${item.config.name}: ${item.config.formUrl}`)
  }

  lines.push("")
  lines.push("Una vez hayamos recibido tu formulario, nuestro Equipo de Expertos Premium se sumergirá en tu caso para que tu interpretación personalizada te sea revelada en un plazo máximo de 48 horas laborables.")
  lines.push("")
  lines.push("El Equipo de Expertos Premium del Tarot de la Rueda de la Fortuna")
  lines.push("contactopremium@laruedadelafortuna.com")
  lines.push("www.laruedadelafortuna.com")

  return lines.join("\n")
}

function buildPremiumFormEmailHtml({ customerName, products }) {
  const formsBlock = buildPremiumFormsBlock(products)

  return `
    <div style="margin:0;padding:0;background:#f6f1e7;">
      <div style="max-width:720px;margin:0 auto;padding:32px 18px;">
        <div style="background:linear-gradient(180deg,#1a1330 0%,#241845 100%);border-radius:28px;padding:1px;box-shadow:0 20px 60px rgba(0,0,0,0.18);">
          <div style="background:linear-gradient(180deg,#fcf7ef 0%,#f7f1e6 100%);border-radius:27px;padding:36px 28px;color:#2b2238;font-family:Georgia, 'Times New Roman', serif;">

            <div style="text-align:center;margin-bottom:22px;">
              <div style="display:inline-block;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8b6b2f;border:1px solid rgba(139,107,47,0.28);border-radius:999px;padding:8px 14px;background:rgba(255,255,255,0.55);">
                Servicio Premium Personalizado
              </div>
            </div>

            <div style="text-align:center;margin-bottom:20px;">
              <div style="font-size:30px;line-height:1;color:#8b6b2f;">✦</div>
              <h1 style="margin:10px 0 8px;font-size:30px;line-height:1.2;font-weight:normal;color:#241845;">
                Muchísimas gracias por confiar en nosotros
              </h1>
              <p style="margin:0;font-size:15px;color:#6d5a7b;line-height:1.7;">
                Vamos a sumergirnos en una experiencia única, profunda y premium, totalmente personalizada para ti
              </p>
            </div>

            <div style="width:72px;height:1px;background:linear-gradient(90deg,transparent,#c6a45a,transparent);margin:22px auto 28px;"></div>

            <p style="margin:0 0 16px;font-size:17px;line-height:1.8;">
              Hola${customerName ? ` ${escapeHtml(customerName)}` : ""},
            </p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
              Muchísimas gracias por elegir una de nuestras Mentorías Premium. Para poder estudiar tu situación con la profundidad, el mimo y la dedicación que merece, necesitamos que completes tu formulario personal.
            </p>

            <p style="margin:0 0 22px;font-size:16px;line-height:1.85;">
              Cada consulta es un universo único. Nos sumergimos en tu energía de manera individualizada, dedicando a tu camino el tiempo y la profundidad que solo tú mereces. Todo el proceso será tratado por el Equipo de Expertos Premium de <strong>El Tarot de la Rueda de la Fortuna</strong>. Sabemos que cuando alguien solicita una mentoría premium, no está buscando una respuesta cualquiera, sino una guía hecha con presencia, sensibilidad y dedicación real.
            </p>

            ${formsBlock}

            <p style="margin:18px 0 0;font-size:16px;line-height:1.85;">
              Tratamos tu historia como el universo que es. Cada consulta se estudia con una mirada atenta y personalizada, garantizando una interpretación hecha a tu medida.
            </p>

            ${PREMIUM_EMAIL_FOOTER}

          </div>
        </div>
      </div>
    </div>
  `
}

function buildPremiumReceivedEmailText({ customerName }) {
  return [
    `Hola${customerName ? ` ${customerName}` : ""},`,
    "",
    "Te confirmamos que hemos recibido correctamente tu Formulario Premium.",
    "El Equipo de Expertos Premium de El Tarot de la Rueda de la Fortuna ya está estudiando tu caso de forma individual, cuidadosa y totalmente personalizada.",
    "",
    "Recibirás tu respuesta en un plazo máximo de 48 horas laborables.",
    "",
    "El Equipo de Expertos Premium del Tarot de la Rueda de la Fortuna",
    "contactopremium@laruedadelafortuna.com",
    "www.laruedadelafortuna.com"
  ].join("\n")
}

function buildPremiumReceivedEmailHtml({ customerName }) {
  return `
    <div style="margin:0;padding:0;background:#f6f1e7;">
      <div style="max-width:720px;margin:0 auto;padding:32px 18px;">
        <div style="background:linear-gradient(180deg,#1a1330 0%,#241845 100%);border-radius:28px;padding:1px;box-shadow:0 20px 60px rgba(0,0,0,0.18);">
          <div style="background:linear-gradient(180deg,#fcf7ef 0%,#f7f1e6 100%);border-radius:27px;padding:36px 28px;color:#2b2238;font-family:Georgia, 'Times New Roman', serif;">

            <div style="text-align:center;margin-bottom:22px;">
              <div style="display:inline-block;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8b6b2f;border:1px solid rgba(139,107,47,0.28);border-radius:999px;padding:8px 14px;background:rgba(255,255,255,0.55);">
                Formulario recibido
              </div>
            </div>

            <div style="text-align:center;margin-bottom:20px;">
              <div style="font-size:30px;line-height:1;color:#8b6b2f;">✦</div>
              <h1 style="margin:10px 0 8px;font-size:30px;line-height:1.2;font-weight:normal;color:#241845;">
                Ya estamos trabajando en tu caso
              </h1>
              <p style="margin:0;font-size:15px;color:#6d5a7b;line-height:1.7;">
                Nuestro Equipo de Expertos Premium ya ha recibido tus indicaciones
              </p>
            </div>

            <div style="width:72px;height:1px;background:linear-gradient(90deg,transparent,#c6a45a,transparent);margin:22px auto 28px;"></div>

            <p style="margin:0 0 16px;font-size:17px;line-height:1.8;">
              Hola${customerName ? ` ${escapeHtml(customerName)}` : ""},
            </p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
              Te confirmamos que hemos recibido correctamente tu Formulario Premium.
            </p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
              El Equipo de Expertos Premium de <strong>El Tarot de la Rueda de la Fortuna</strong> ya está trabajando tu caso de forma individual, cuidadosa y totalmente personalizada.
            </p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
              Cada respuesta premium se prepara con atención real, revisando tu situación con profundidad para ofrecerte una orientación clara, seria y hecha para ti.
            </p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
              Recibirás tu respuesta en un plazo máximo de <strong>48 horas laborables</strong>.
            </p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
              Muchísimas gracias de nuevo por confiar en nosotros. Te mandamos un fuerte abrazo.
            </p>

            ${PREMIUM_EMAIL_FOOTER}

          </div>
        </div>
      </div>
    </div>
  `
}

async function sendPremiumFormEmail({ email, customerName, products }) {
  if (!email) throw new Error("Falta email")
  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("Falta RESEND_FROM_EMAIL en variables de entorno")
  }

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: "✨ Hemos preparado tu acceso premium",
    text: buildPremiumFormEmailText({ customerName, products }),
    html: buildPremiumFormEmailHtml({ customerName, products })
  })

  if (result?.error) {
    console.error("PREMIUM FORM EMAIL ERROR:", result.error)
    throw new Error(`Resend error: ${result.error.message || "error desconocido"}`)
  }

  return result
}

async function sendPremiumReceivedEmail({ email, customerName }) {
  if (!email) throw new Error("Falta email")
  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("Falta RESEND_FROM_EMAIL en variables de entorno")
  }

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: "✨ Hemos recibido tu formulario premium",
    text: buildPremiumReceivedEmailText({ customerName }),
    html: buildPremiumReceivedEmailHtml({ customerName })
  })

  if (result?.error) {
    console.error("PREMIUM RECEIVED EMAIL ERROR:", result.error)
    throw new Error(`Resend error: ${result.error.message || "error desconocido"}`)
  }

  return result
}

router.post("/purchase", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"]

    if (!apiKey || apiKey !== process.env.PREMIUM_API_KEY) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized"
      })
    }

    const payload = normalizePremiumPurchasePayload(req.body)
    const validation = validatePremiumPurchasePayload(payload)

    if (!validation.ok) {
      return res.status(400).json({
        ok: false,
        error: "Invalid payload",
        details: validation.errors
      })
    }

    const premiumProducts = getPremiumProductsFromPayload(payload.products)

    if (!premiumProducts.length) {
      return res.status(400).json({
        ok: false,
        error: "No premium products found in payload"
      })
    }

    await sendPremiumFormEmail({
      email: payload.email,
      customerName: payload.customerName,
      products: premiumProducts
    })

    return res.status(200).json({
      ok: true,
      mode: "premium_purchase",
      email: payload.email,
      customerName: payload.customerName,
      sentProducts: premiumProducts.map((item) => ({
        productId: item.productId,
        name: item.config.name,
        type: item.config.type,
        formUrl: item.config.formUrl
      }))
    })
  } catch (error) {
    console.error("PREMIUM PURCHASE ERROR:", error)
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      message: error.message || "Unknown error"
    })
  }
})

router.post("/submit", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"]

    if (!apiKey || apiKey !== process.env.PREMIUM_API_KEY) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized"
      })
    }

    const payload = normalizePremiumSubmitPayload(req.body)
    const validation = validatePremiumSubmitPayload(payload)

    if (!validation.ok) {
      return res.status(400).json({
        ok: false,
        error: "Invalid payload",
        details: validation.errors
      })
    }

    await sendPremiumReceivedEmail({
      email: payload.email,
      customerName: payload.customerName
    })

    return res.status(200).json({
      ok: true,
      mode: "premium_received",
      submissionId: payload.submissionId,
      orderId: payload.orderId || null,
      orderName: payload.orderName || null,
      email: payload.email,
      customerName: payload.customerName || null,
      productId: payload.productId || null,
      productTitle: payload.productTitle || null,
      productType: payload.productType,
      spreadType: payload.spreadType || null,
      receivedAt: new Date().toISOString(),
      message: "Formulario recibido correctamente"
    })
  } catch (error) {
    console.error("PREMIUM SUBMIT ERROR:", error)
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      message: error.message || "Unknown error"
    })
  }
})

module.exports = router
