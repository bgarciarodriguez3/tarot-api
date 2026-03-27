require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const { Resend } = require("resend")

const app = express()
const resend = new Resend(process.env.RESEND_API_KEY)

const INTERNAL_EMAIL = "contactopremium@laruedadelafortuna.com"

// ==============================
// CONFIG PRODUCTOS PREMIUM
// ==============================

const PREMIUM_PRODUCTS = {
  "10496141754705": {
    name: "Tu Camino, Tu Destino y Tus Decisiones – Mentoría",
    type: "camino_destino_decisiones",
    formUrl: "https://forms.gle/9m6P5m3pBZ4BEybf9"
  },
  "10523108966737": {
    name: "Claridad en tus Relaciones y tu Camino Sentimental",
    type: "relaciones_sentimental",
    formUrl: "https://forms.gle/z7Yqenb3VsrAVjij9"
  },
  "10667662606673": {
    name: "Nuevos Comienzos, Liderazgo y Economía Personal – Consulta Premium",
    type: "liderazgo_economia_personal",
    formUrl: "https://forms.gle/AyAm7JACnZCoXNsy7"
  }
}

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || ""

// ==============================
// MIDDLEWARES
// ==============================

app.use(cors())

app.get("/favicon.ico", (_req, res) => {
  res.status(204).end()
})

// ==============================
// HELPERS
// ==============================

function verifyShopify(req) {
  const hmac = req.get("X-Shopify-Hmac-Sha256")

  if (!hmac) {
    console.error("SHOPIFY HMAC ERROR: falta header X-Shopify-Hmac-Sha256")
    return false
  }

  if (!Buffer.isBuffer(req.body)) {
    console.error("SHOPIFY HMAC ERROR: req.body no es Buffer")
    return false
  }

  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || ""

  if (!secret) {
    console.error("SHOPIFY HMAC ERROR: falta SHOPIFY_WEBHOOK_SECRET")
    return false
  }

  const digest = crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest("base64")

  try {
    const hmacBuffer = Buffer.from(hmac, "utf8")
    const digestBuffer = Buffer.from(digest, "utf8")

    if (hmacBuffer.length !== digestBuffer.length) {
      console.error("SHOPIFY HMAC ERROR: length mismatch")
      return false
    }

    return crypto.timingSafeEqual(hmacBuffer, digestBuffer)
  } catch (error) {
    console.error("SHOPIFY HMAC ERROR:", error)
    return false
  }
}

function findPremiumConfigFromLineItem(item) {
  const productId = item?.product_id ? String(item.product_id) : null
  const variantId = item?.variant_id ? String(item.variant_id) : null

  if (productId && PREMIUM_PRODUCTS[productId]) {
    return {
      productId,
      config: PREMIUM_PRODUCTS[productId],
      matchedBy: "product_id"
    }
  }

  if (variantId && PREMIUM_PRODUCTS[variantId]) {
    return {
      productId: variantId,
      config: PREMIUM_PRODUCTS[variantId],
      matchedBy: "variant_id"
    }
  }

  return null
}

function buildAccessEmailText(record) {
  return [
    "Querida alma,",
    "",
    "Tu portal de sabiduría personalizada ya está abierto para que, cuando estés lista, nos compartas tus dudas e inquietudes.",
    "",
    "Para comenzar a descubrir las revelaciones que el Universo guarda para ti, necesitamos conocer tu situación con el cariño y el respeto que merece.",
    "",
    "Accede aquí a tu Portal de Sabiduría:",
    record.form_url,
    "",
    "En cuanto recibamos la hoja de ruta de tu momento actual, nos pondremos en sintonía con tu brújula estelar para prepararte un mapa totalmente personalizado.",
    "",
    "Un fuerte abrazo de luz,",
    "Equipo de Expertos Premium Tarot de La Rueda de la Fortuna",
    "contactopremium@laruedadelafortuna.com",
    "www.laruedadelafortuna.com"
  ].join("\n")
}

function buildAccessEmailHtml(record) {
  return `
    <div style="margin:0;padding:0;background:#f6f1e7;">
      <div style="max-width:680px;margin:0 auto;padding:32px 18px;">
        <div style="background:linear-gradient(180deg,#1a1330 0%,#241845 100%);border-radius:28px;padding:1px;box-shadow:0 20px 60px rgba(0,0,0,0.18);">
          <div style="background:linear-gradient(180deg,#fcf7ef 0%,#f7f1e6 100%);border-radius:27px;padding:36px 28px;color:#2b2238;font-family:Georgia, 'Times New Roman', serif;">

            <div style="text-align:center;margin-bottom:22px;">
              <div style="display:inline-block;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8b6b2f;border:1px solid rgba(139,107,47,0.28);border-radius:999px;padding:8px 14px;background:rgba(255,255,255,0.55);">
                Tus mensajes cósmicos ya están listos
              </div>
            </div>

            <div style="text-align:center;margin-bottom:20px;">
              <div style="font-size:30px;line-height:1;color:#8b6b2f;">✦</div>
              <h1 style="margin:10px 0 8px;font-size:30px;line-height:1.2;font-weight:normal;color:#241845;">
                Accede a tu destino
              </h1>
              <p style="margin:0;font-size:15px;color:#6d5a7b;line-height:1.7;">
                Tu destino, revelado.
              </p>
            </div>

            <div style="width:72px;height:1px;background:linear-gradient(90deg,transparent,#c6a45a,transparent);margin:22px auto 28px;"></div>

            <p style="margin:0 0 16px;font-size:17px;line-height:1.8;">
              Querida alma,
            </p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
              Tu portal de sabiduría personalizada ya está abierto.
            </p>

            <p style="margin:0 0 22px;font-size:16px;line-height:1.85;">
              Para poder explorar los mapas de tu destino necesitamos conocer tus dudas e inquietudes.
            </p>

            <p style="margin:0 0 22px;font-size:16px;line-height:1.85;">
              Será un espacio íntimo y confidencial para que nos cuentes lo que sientes y podamos prepararte una senda totalmente personalizada para tu camino.
            </p>

            <div style="text-align:center;margin:28px 0;">
              <a
                href="${record.form_url}"
                style="display:inline-block;background:#241845;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:bold;"
              >
                Accede a tu destino
              </a>
            </div>

            <p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#6d5a7b;text-align:center;">
              Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
              <span style="word-break:break-all;">${record.form_url}</span>
            </p>

            <div style="width:72px;height:1px;background:linear-gradient(90deg,transparent,#c6a45a,transparent);margin:28px auto 24px;"></div>

            <p style="margin:0;text-align:center;font-size:16px;line-height:1.8;color:#5a4968;">
              Un fuerte abrazo de luz,
            </p>

            <p style="margin:6px 0 0;text-align:center;font-size:18px;line-height:1.6;color:#241845;">
              <strong>Equipo de Expertos Premium El Tarot de La Rueda de la Fortuna</strong>
            </p>

            <div style="text-align:center;margin:16px 0 10px;">
              <img
                src="https://cdn.shopify.com/s/files/1/0989/4694/1265/files/firma_transparente.png?v=1772104449"
                alt="La Rueda de la Fortuna"
                style="max-width:220px;width:100%;height:auto;display:inline-block;"
              >
            </div>

            <p style="margin:8px 0;text-align:center;font-size:14px;color:#5a4968;">
              📧 contactopremium@laruedadelafortuna.com
            </p>

            <p style="margin:4px 0 0;text-align:center;font-size:14px;color:#5a4968;">
              🌐 www.laruedadelafortuna.com
            </p>

          </div>
        </div>
      </div>
    </div>
  `
}

function buildClientConfirmationText({ customerName }) {
  return [
    `Querida alma${customerName ? ` ${customerName}` : ""},`,
    "",
    "Hemos sintonizado con tu mensaje. Tu viaje de transformación ha comenzado.",
    "",
    "Gracias por abrir este espacio y compartirnos tus vivencias.",
    "",
    "Desde este instante nos sumergimos en tu energía para tejer una guía que es solo tuya, creada con el rigor y la delicadeza que tu alma requiere.",
    "",
    "Damos comienzo a tu claridad personalizada. El tiempo máximo para recibir tus mensajes cósmicos es de 48 horas laborables.",
    "",
    "Un fuerte abrazo de luz,",
    "Equipo de Expertos Premium Tarot de La Rueda de la Fortuna",
    "contactopremium@laruedadelafortuna.com",
    "www.laruedadelafortuna.com"
  ].join("\n")
}

function buildClientConfirmationHtml({ customerName }) {
  return `
    <div style="margin:0;padding:0;background:#f6f1e7;">
      <div style="max-width:680px;margin:0 auto;padding:32px 18px;">
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
                A partir de este momento, tu historia es nuestra prioridad
              </h1>
              <p style="margin:0;font-size:15px;color:#6d5a7b;line-height:1.7;">
                Tus dudas pasan a ser nuestro enfoque de canalización.
              </p>
            </div>

            <div style="width:72px;height:1px;background:linear-gradient(90deg,transparent,#c6a45a,transparent);margin:22px auto 28px;"></div>

            <p style="margin:0 0 16px;font-size:17px;line-height:1.8;">
              Querida alma${customerName ? ` ${customerName}` : ""},
            </p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
              La conexión se ha establecido. Tu energía ya está en nuestras manos.
            </p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
              Gracias por compartir tu frecuencia con nosotras. Iniciamos un proceso de canalización hecho a medida para que cada revelación surja con la claridad que solo la presencia total puede ofrecer.
            </p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
              Tu historia ya está en nuestras manos y la cuidaremos con mucho amor. La descifraremos en un tiempo máximo de <strong>48 horas laborables</strong>.
            </p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
              Queremos que sientas que esta experiencia está cuidada de principio a fin, y eso empieza por tratar tu historia con la atención que merece.
            </p>

            <div style="width:72px;height:1px;background:linear-gradient(90deg,transparent,#c6a45a,transparent);margin:28px auto 24px;"></div>

            <p style="margin:0;text-align:center;font-size:16px;line-height:1.8;color:#5a4968;">
              Un fuerte abrazo de luz,
            </p>

            <p style="margin:6px 0 0;text-align:center;font-size:18px;line-height:1.6;color:#241845;">
              <strong>Equipo de Expertos Premium Tarot de La Rueda de la Fortuna</strong>
            </p>

            <div style="text-align:center;margin:16px 0 10px;">
              <img
                src="https://cdn.shopify.com/s/files/1/0989/4694/1265/files/firma_transparente.png?v=1772104449"
                alt="La Rueda de la Fortuna"
                style="max-width:220px;width:100%;height:auto;display:inline-block;"
              >
            </div>

            <p style="margin:8px 0;text-align:center;font-size:14px;color:#5a4968;">
              📧 contactopremium@laruedadelafortuna.com
            </p>

            <p style="margin:4px 0 0;text-align:center;font-size:14px;color:#5a4968;">
              🌐 www.laruedadelafortuna.com
            </p>

          </div>
        </div>
      </div>
    </div>
  `
}

function buildInternalAlertText(payload) {
  return [
    "Nuevo formulario premium recibido",
    "",
    `Email cliente: ${payload.email || ""}`,
    `Order ID: ${payload.orderId || ""}`,
    `Nombre cliente: ${payload.customerName || ""}`,
    `Producto: ${payload.productName || ""}`,
    `Fecha envío: ${payload.submittedAt || new Date().toISOString()}`,
    "",
    "Payload completo:",
    JSON.stringify(payload, null, 2)
  ].join("\n")
}

function buildInternalAlertHtml(payload) {
  const pretty = JSON.stringify(payload, null, 2)

  return `
    <div style="font-family:Arial,sans-serif;color:#1f1f1f;">
      <h2>Nuevo formulario premium recibido</h2>
      <p><strong>Email cliente:</strong> ${payload.email || ""}</p>
      <p><strong>Order ID:</strong> ${payload.orderId || ""}</p>
      <p><strong>Nombre cliente:</strong> ${payload.customerName || ""}</p>
      <p><strong>Producto:</strong> ${payload.productName || ""}</p>
      <p><strong>Fecha envío:</strong> ${payload.submittedAt || new Date().toISOString()}</p>
      <pre style="white-space:pre-wrap;background:#f7f7f7;padding:16px;border-radius:8px;">${pretty}</pre>
    </div>
  `
}

async function saveToGoogleSheets(payload) {
  if (!GOOGLE_SCRIPT_URL) {
    console.log("GOOGLE_SCRIPT_URL no configurada, se omite guardado en Sheets")
    return { skipped: true }
  }

  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })

  const text = await response.text()

  let parsed = {}
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = { raw: text }
  }

  if (!response.ok) {
    throw new Error(`Google Sheets HTTP ${response.status}`)
  }

  if (parsed.success === false) {
    throw new Error(parsed.message || "Google Sheets devolvió error")
  }

  return parsed
}

// ==============================
// EMAIL SENDERS
// ==============================

async function sendAccessEmail(record) {
  if (!record.email) {
    throw new Error("El premium request no tiene email")
  }

  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("Falta RESEND_FROM_EMAIL en variables de entorno")
  }

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: record.email,
    subject: "✨ Accede a tu destino",
    text: buildAccessEmailText(record),
    html: buildAccessEmailHtml(record)
  })

  if (result?.error) {
    console.error("RESEND ACCESS PREMIUM ERROR:", result.error)
    throw new Error(result.error.message || "Error enviando email de acceso premium")
  }

  console.log("RESEND ACCESS PREMIUM OK:", result)
  return result
}

async function sendClientConfirmationEmail(payload) {
  if (!payload.email) {
    throw new Error("Falta email del cliente")
  }

  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("Falta RESEND_FROM_EMAIL en variables de entorno")
  }

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: payload.email,
    subject: "✨ Hemos recibido tu formulario premium",
    text: buildClientConfirmationText({
      customerName: payload.customerName || ""
    }),
    html: buildClientConfirmationHtml({
      customerName: payload.customerName || ""
    })
  })

  if (result?.error) {
    console.error("RESEND CLIENT CONFIRMATION ERROR:", result.error)
    throw new Error(result.error.message || "Error enviando confirmación al cliente")
  }

  console.log("RESEND CLIENT CONFIRMATION OK:", result)
  return result
}

async function sendInternalAlertEmail(payload) {
  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("Falta RESEND_FROM_EMAIL en variables de entorno")
  }

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: INTERNAL_EMAIL,
    subject: "🔥 Nuevo formulario premium recibido",
    text: buildInternalAlertText(payload),
    html: buildInternalAlertHtml(payload)
  })

  if (result?.error) {
    console.error("RESEND INTERNAL ALERT ERROR:", result.error)
    throw new Error(result.error.message || "Error enviando aviso interno")
  }

  console.log("RESEND INTERNAL ALERT OK:", result)
  return result
}

// ==============================
// FORM HELPERS
// ==============================

function normalizeFormPayload(body = {}) {
  return {
    submissionId:
      body.submissionId ||
      body.responseId ||
      body.formResponseId ||
      crypto.randomUUID(),

    orderId: body.orderId || body.shopifyOrderId || "",
    email: String(body.email || "").trim(),
    customerName: String(body.customerName || body.name || "").trim(),
    productId: String(body.productId || "").trim(),
    productName: String(
      body.productName ||
      body.productTitle ||
      body.tipo ||
      body.tipoConsulta ||
      ""
    ).trim(),
    submittedAt: body.submittedAt || new Date().toISOString(),
    answers: body.answers || {},
    rawForm: body.rawForm || body
  }
}

// ==============================
// ROUTES
// ==============================

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "tarot-premium",
    version: "premium-v3-no-postgres"
  })
})

app.get("/api/health", (_req, res) => {
  res.json({ ok: true })
})

// ------------------------------
// SHOPIFY WEBHOOK PREMIUM
// body raw SOLO aquí
// ------------------------------

app.post(
  "/api/premium/shopify/order-paid",
  express.raw({ type: "application/json", limit: "2mb" }),
  async (req, res) => {
    try {
      console.log("=== PREMIUM WEBHOOK SHOPIFY RECIBIDO ===")

      if (!verifyShopify(req)) {
        console.error("PREMIUM SHOPIFY WEBHOOK INVALID HMAC")
        return res.status(401).send("invalid")
      }

      const order = JSON.parse(req.body.toString("utf8"))

      const email = String(order.email || order.contact_email || "").trim()
      const customerName = String(
        order?.customer?.first_name ||
        order?.billing_address?.first_name ||
        ""
      ).trim()

      const financialStatus = String(order.financial_status || "").toLowerCase()

      console.log("PREMIUM ORDER INFO:", {
        orderId: order.id,
        orderName: order.name,
        email,
        financialStatus,
        itemsCount: Array.isArray(order.line_items) ? order.line_items.length : 0
      })

      if (financialStatus !== "paid") {
        console.log("⛔ Pedido premium ignorado por financial_status:", financialStatus)
        return res.status(200).json({
          ok: true,
          skipped: true,
          reason: "order_not_paid"
        })
      }

      const createdRecords = []

      for (const item of order.line_items || []) {
        const found = findPremiumConfigFromLineItem(item)

        if (!found || !found.config) {
          console.log("Producto premium no configurado:", {
            title: item.title,
            product_id: item.product_id,
            variant_id: item.variant_id
          })
          continue
        }

        const quantity = Number(item.quantity || 1)

        for (let i = 0; i < quantity; i += 1) {
          createdRecords.push({
            id: crypto.randomUUID(),
            order_id: String(order.id || ""),
            line_item_id: String(item.id || ""),
            product_id: String(found.productId || ""),
            product_name: found.config.name,
            premium_type: found.config.type,
            form_url: found.config.formUrl,
            customer_name: customerName,
            email
          })
        }
      }

      res.status(200).json({
        ok: true,
        processedCount: createdRecords.length,
        created: createdRecords.map((record) => ({
          id: record.id,
          orderId: record.order_id,
          productId: record.product_id,
          productName: record.product_name,
          formUrl: record.form_url
        }))
      })

      for (const record of createdRecords) {
        if (!record.email) continue

        try {
          await sendAccessEmail(record)
        } catch (emailError) {
          console.error("ACCESS PREMIUM EMAIL ERROR:", emailError)
        }

        try {
          await saveToGoogleSheets({
            eventType: "premium_order_paid",
            premiumRequestId: record.id,
            orderId: record.order_id,
            lineItemId: record.line_item_id,
            productId: record.product_id,
            productName: record.product_name,
            premiumType: record.premium_type,
            formUrl: record.form_url,
            customerName: record.customer_name,
            email: record.email,
            createdAt: new Date().toISOString()
          })
        } catch (sheetError) {
          console.error("SHEETS SAVE ORDER PAID ERROR:", sheetError)
        }
      }
    } catch (error) {
      console.error("PREMIUM SHOPIFY ORDER PAID ERROR:", error)
      return res.status(500).json({
        ok: false,
        error: error.message
      })
    }
  }
)

// ------------------------------
// JSON parser para el resto
// ------------------------------

app.use(express.json({ limit: "2mb" }))

app.post("/api/premium/form-submitted", async (req, res) => {
  try {
    const payload = normalizeFormPayload(req.body)

    console.log("=== PREMIUM FORM SUBMITTED ===")
    console.log("BODY:", JSON.stringify(payload, null, 2))

    if (!payload.email) {
      return res.status(400).json({
        ok: false,
        error: "Falta email"
      })
    }

    try {
      await saveToGoogleSheets({
        eventType: "premium_form_submitted",
        ...payload
      })
    } catch (sheetError) {
      console.error("SHEETS SAVE FORM ERROR:", sheetError)
    }

    try {
      await sendInternalAlertEmail(payload)
    } catch (internalError) {
      console.error("INTERNAL ALERT SEND ERROR:", internalError)
    }

    try {
      await sendClientConfirmationEmail(payload)
    } catch (clientError) {
      console.error("CLIENT CONFIRMATION SEND ERROR:", clientError)
    }

    return res.status(200).json({
      ok: true,
      success: true
    })
  } catch (error) {
    console.error("PREMIUM FORM SUBMITTED ERROR:", error)
    return res.status(500).json({
      ok: false,
      success: false,
      error: error.message
    })
  }
})

// ==============================
// START SERVER
// ==============================

const PORT = process.env.PORT || 8080

function startServer() {
  try {
    console.log("PORT FINAL:", PORT)

    app.listen(PORT, "0.0.0.0", () => {
      console.log("premium server running on port", PORT)
    })
  } catch (error) {
    console.error("SERVER START ERROR:", error)
    process.exit(1)
  }
}

startServer()
