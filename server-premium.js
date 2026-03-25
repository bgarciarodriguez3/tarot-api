require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const { Resend } = require("resend")
const { Pool } = require("pg")

const app = express()
app.use(cors())

process.on("uncaughtException", (error) => {
  console.error("UNCAUGHT EXCEPTION:", error)
})

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason)
})

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

const resend = new Resend(process.env.RESEND_API_KEY)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false }
})

pool.on("error", (error) => {
  console.error("POSTGRES POOL ERROR:", error)
})

const INTERNAL_EMAIL = "contactopremium@laruedadelafortuna.com"

const PREMIUM_PRODUCTS = {
  "10496141754705": {
    name: "Tu Camino, Tu Destino y Tus Decisiones – Mentoría",
    type: "mentoria",
    formUrl: "https://forms.gle/9m6P5m3pBZ4BEybf9"
  },
  "10523108966737": {
    name: "Claridad en tus Relaciones y tu Camino Sentimental",
    type: "amor",
    formUrl: "https://forms.gle/z7Yqenb3VsrAVjij9"
  },
  "10667662606673": {
    name: "Nuevos Comienzos, Liderazgo y Economía Personal – Consulta Premium",
    type: "dinero",
    formUrl: "https://forms.gle/AyAm7JACnZCoXNsy7"
  }
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS premium_requests (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      line_item_id TEXT,
      product_id TEXT,
      product_name TEXT,
      premium_type TEXT,
      form_url TEXT,
      customer_name TEXT,
      email TEXT,
      status TEXT,
      access_email_sent INTEGER NOT NULL DEFAULT 0,
      received_email_sent INTEGER NOT NULL DEFAULT 0,
      internal_email_sent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      form_submitted_at TEXT,
      completed_at TEXT
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS premium_form_submissions (
      id TEXT PRIMARY KEY,
      premium_request_id TEXT,
      order_id TEXT,
      email TEXT,
      product_name TEXT,
      premium_type TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)

  await pool.query(`
    ALTER TABLE premium_form_submissions
    ADD COLUMN IF NOT EXISTS premium_type TEXT
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS premium_processed_webhooks (
      webhook_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );
  `)

  console.log("Postgres tables ready")
}

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function detectPremiumType(input = "") {
  const text = normalizeText(input)

  if (!text) return ""

  if (
    text.includes("mentoria") ||
    text.includes("camino") ||
    text.includes("destino") ||
    text.includes("decisiones")
  ) {
    return "mentoria"
  }

  if (
    text.includes("amor") ||
    text.includes("relaciones") ||
    text.includes("sentimental")
  ) {
    return "amor"
  }

  if (
    text.includes("dinero") ||
    text.includes("economia") ||
    text.includes("liderazgo") ||
    text.includes("nuevos comienzos")
  ) {
    return "dinero"
  }

  return ""
}

function getValueFromAnswers(answers = {}, keys = []) {
  for (const key of keys) {
    const norm = normalizeText(key)

    for (const [k, v] of Object.entries(answers)) {
      if (normalizeText(k).includes(norm)) {
        return String(v || "").trim()
      }
    }
  }

  return ""
}

function verifyShopify(req) {
  const hmac = req.get("X-Shopify-Hmac-Sha256")

  if (!hmac) {
    console.error("SHOPIFY HMAC ERROR: missing header")
    return false
  }

  if (!Buffer.isBuffer(req.body)) {
    console.error("SHOPIFY HMAC ERROR: body is not Buffer")
    return false
  }

  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || ""

  const digest = crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest("base64")

  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(digest))
  } catch (error) {
    console.error("SHOPIFY HMAC ERROR:", error)
    return false
  }
}

function createPremiumId(orderId, lineItemId, productId, unitIndex = 0) {
  return [
    "premium",
    String(orderId || "").trim(),
    String(lineItemId || "").trim(),
    String(productId || "").trim(),
    String(unitIndex || 0).trim()
  ].join("-")
}

function findPremiumConfigFromLineItem(item) {
  const productId = item?.product_id ? String(item.product_id) : null
  const variantId = item?.variant_id ? String(item.variant_id) : null

  if (productId && PREMIUM_PRODUCTS[productId]) {
    return { productId, config: PREMIUM_PRODUCTS[productId] }
  }

  if (variantId && PREMIUM_PRODUCTS[variantId]) {
    return { productId: variantId, config: PREMIUM_PRODUCTS[variantId] }
  }

  return null
}

async function isWebhookProcessed(webhookId) {
  const result = await pool.query(
    "SELECT webhook_id FROM premium_processed_webhooks WHERE webhook_id = $1 LIMIT 1",
    [String(webhookId)]
  )
  return result.rowCount > 0
}

async function markWebhookProcessed(webhookId) {
  await pool.query(
    `
    INSERT INTO premium_processed_webhooks (webhook_id, created_at)
    VALUES ($1, $2)
    ON CONFLICT (webhook_id) DO NOTHING
    `,
    [String(webhookId), new Date().toISOString()]
  )
}

async function getPremiumRequestById(id) {
  const result = await pool.query(
    "SELECT * FROM premium_requests WHERE id = $1 LIMIT 1",
    [String(id)]
  )
  return result.rows[0] || null
}

async function createPremiumRequest({
  orderId,
  lineItemId,
  productId,
  email,
  customerName = "",
  unitIndex = 0
}) {
  const config = PREMIUM_PRODUCTS[String(productId)]

  if (!config) {
    throw new Error(`Producto premium no configurado: ${productId}`)
  }

  const id = createPremiumId(orderId, lineItemId, productId, unitIndex)
  const existing = await getPremiumRequestById(id)

  if (existing) {
    return existing
  }

  await pool.query(
    `
    INSERT INTO premium_requests (
      id, order_id, line_item_id, product_id, product_name, premium_type,
      form_url, customer_name, email, status,
      access_email_sent, received_email_sent, internal_email_sent,
      created_at, form_submitted_at, completed_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10,
      $11, $12, $13,
      $14, $15, $16
    )
    `,
    [
      id,
      String(orderId || ""),
      String(lineItemId || ""),
      String(productId || ""),
      config.name,
      config.type,
      config.formUrl,
      String(customerName || ""),
      String(email || ""),
      "pending_form",
      0,
      0,
      0,
      new Date().toISOString(),
      null,
      null
    ]
  )

  return await getPremiumRequestById(id)
}

function normalizeFormPayload(body = {}) {
  const answers = body.answers || {}

  const email =
    String(body.email || "").trim() ||
    getValueFromAnswers(answers, ["email", "correo", "correo electronico"])

  const orderId =
    String(body.orderId || body.shopifyOrderId || "").trim() ||
    getValueFromAnswers(answers, ["pedido", "numero de pedido", "order id"])

  const productId =
    String(body.productId || "").trim() ||
    getValueFromAnswers(answers, ["product id", "producto id"])

  const productName =
    String(
      body.productName ||
      body.tipoConsulta ||
      body.formName ||
      body.formTitle ||
      body.sourceSheet ||
      ""
    ).trim()

  const premiumType =
    detectPremiumType(body.premiumType) ||
    detectPremiumType(body.tipoConsulta) ||
    detectPremiumType(body.sourceSheet) ||
    detectPremiumType(productName)

  return {
    submissionId: body.submissionId || crypto.randomUUID(),
    orderId,
    email,
    customerName: String(body.customerName || body.name || "").trim(),
    productId,
    productName,
    premiumType,
    submittedAt: body.submittedAt || new Date().toISOString(),
    answers,
    rawForm: body.rawForm || body
  }
}

async function findRequestForSubmittedForm(payload) {
  if (payload.orderId && payload.email && payload.premiumType) {
    const result = await pool.query(
      `
      SELECT *
      FROM premium_requests
      WHERE order_id = $1
        AND email = $2
        AND premium_type = $3
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [payload.orderId, payload.email, payload.premiumType]
    )
    if (result.rows[0]) return result.rows[0]
  }

  if (payload.email && payload.premiumType) {
    const result = await pool.query(
      `
      SELECT *
      FROM premium_requests
      WHERE email = $1
        AND premium_type = $2
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [payload.email, payload.premiumType]
    )
    if (result.rows[0]) return result.rows[0]
  }

  if (payload.email && payload.productId) {
    const result = await pool.query(
      `
      SELECT *
      FROM premium_requests
      WHERE email = $1
        AND product_id = $2
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [payload.email, payload.productId]
    )
    if (result.rows[0]) return result.rows[0]
  }

  return null
}

function buildPremiumButton(url, label = "Completar formulario") {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:30px auto;">
      <tr>
        <td
          align="center"
          style="
            border-radius:999px;
            background:linear-gradient(135deg,#7b5cff 0%,#241845 52%,#c6a45a 100%);
            box-shadow:0 10px 28px rgba(36,24,69,0.32);
          "
        >
          <a
            href="${url}"
            target="_blank"
            style="
              display:inline-block;
              padding:18px 30px;
              font-family:Arial,sans-serif;
              font-size:16px;
              line-height:16px;
              font-weight:700;
              color:#ffffff;
              text-decoration:none;
              border-radius:999px;
              border:1px solid rgba(255,255,255,0.24);
              letter-spacing:0.2px;
            "
          >
            ✨ ${label}
          </a>
        </td>
      </tr>
    </table>
  `
}

function buildAccessEmailText(record) {
  return [
    "Querida alma,",
    "",
    "Gracias por confiar en nosotras.",
    "",
    "Para comenzar tu análisis necesitamos que completes el formulario correspondiente a tu compra.",
    "",
    "Formulario:",
    record.form_url,
    "",
    "Recibirás tu mentoría en un plazo máximo de 48 horas laborables desde la recepción del formulario.",
    "",
    "Un fuerte abrazo,",
    "El equipo de Expertos Premium del Tarot de la Rueda de la Fortuna"
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
                Consulta premium
              </div>
            </div>

            <h1 style="margin:0 0 18px;text-align:center;font-size:30px;line-height:1.25;font-weight:normal;color:#241845;">
              Completa tu formulario personal
            </h1>

            <p style="margin:0 0 14px;font-size:16px;line-height:1.85;">
              Gracias de corazón por confiar en nosotras.
            </p>

            <p style="margin:0 0 14px;font-size:16px;line-height:1.85;">
              Para comenzar tu análisis necesitamos que completes el formulario correspondiente a tu compra.
            </p>

            <p style="margin:0 0 18px;font-size:16px;line-height:1.85;">
              En cuanto recibamos tus respuestas comenzaremos tu consulta Premium completamente personalizada.
            </p>

            ${buildPremiumButton(record.form_url, `Completar formulario — ${record.product_name}`)}

            <p style="margin:18px 0 0;font-size:16px;line-height:1.85;text-align:center;">
              Recibirás tu mentoría en un plazo máximo de <strong>48 horas laborables</strong> desde la recepción del formulario.
            </p>

            <p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#6d5a7b;text-align:center;">
              Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
              <span style="word-break:break-all;">${record.form_url}</span>
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
    "Hemos recibido tu formulario premium correctamente.",
    "",
    "Tu consulta ya está en proceso.",
    "",
    "Un fuerte abrazo,",
    "Equipo Premium Tarot de La Rueda de la Fortuna"
  ].join("\n")
}

function buildClientConfirmationHtml({ customerName }) {
  return `
    <div style="font-family:Arial,sans-serif;color:#1f1f1f;padding:24px;">
      <h2>✨ Hemos recibido tu formulario premium</h2>
      <p>Querida alma${customerName ? ` ${customerName}` : ""},</p>
      <p>Hemos recibido tu formulario correctamente.</p>
      <p>Tu consulta ya está en proceso.</p>
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
    `Tipo: ${payload.premiumType || ""}`,
    `Fecha envío: ${payload.submittedAt || new Date().toISOString()}`,
    "",
    "Payload completo:",
    JSON.stringify(payload, null, 2)
  ].join("\n")
}

async function sendAccessEmail(record) {
  if (!record.email) return
  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("Falta RESEND_FROM_EMAIL")
  }
  if (Number(record.access_email_sent) === 1) return

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: record.email,
    subject: "✨ Completa tu formulario premium",
    text: buildAccessEmailText(record),
    html: buildAccessEmailHtml(record)
  })

  if (result?.error) {
    throw new Error(result.error.message || "Error enviando email de acceso")
  }

  await pool.query(
    "UPDATE premium_requests SET access_email_sent = 1 WHERE id = $1",
    [record.id]
  )
}

async function sendClientConfirmationEmail(payload, requestRecord) {
  if (!payload.email) return
  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("Falta RESEND_FROM_EMAIL")
  }

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: payload.email,
    subject: "✨ Hemos recibido tu formulario premium",
    text: buildClientConfirmationText({
      customerName: payload.customerName || requestRecord?.customer_name || ""
    }),
    html: buildClientConfirmationHtml({
      customerName: payload.customerName || requestRecord?.customer_name || ""
    })
  })

  if (result?.error) {
    throw new Error(result.error.message || "Error enviando confirmación")
  }

  if (requestRecord?.id) {
    await pool.query(
      "UPDATE premium_requests SET received_email_sent = 1 WHERE id = $1",
      [requestRecord.id]
    )
  }
}

async function sendInternalAlertEmail(payload, requestRecord) {
  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("Falta RESEND_FROM_EMAIL")
  }

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: INTERNAL_EMAIL,
    subject: "🔥 Nuevo formulario premium recibido",
    text: buildInternalAlertText(payload),
    html: `<pre>${JSON.stringify(payload, null, 2)}</pre>`
  })

  if (result?.error) {
    throw new Error(result.error.message || "Error enviando aviso interno")
  }

  if (requestRecord?.id) {
    await pool.query(
      "UPDATE premium_requests SET internal_email_sent = 1 WHERE id = $1",
      [requestRecord.id]
    )
  }
}

app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "tarot-premium",
    version: "premium-isolated-v1"
  })
})

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1")
    res.status(200).json({ ok: true })
  } catch (error) {
    console.error("HEALTH ERROR:", error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

app.post(
  "/api/premium/shopify/order-paid",
  express.raw({ type: "*/*", limit: "2mb" }),
  async (req, res) => {
    try {
      console.log("=== PREMIUM WEBHOOK SHOPIFY RECIBIDO ===")

      if (!verifyShopify(req)) {
        return res.status(401).send("invalid")
      }

      const webhookId = String(req.get("X-Shopify-Webhook-Id") || "")
      if (webhookId && await isWebhookProcessed(webhookId)) {
        return res.status(200).json({ ok: true, duplicate: true })
      }

      if (webhookId) {
        await markWebhookProcessed(webhookId)
      }

      const order = JSON.parse(req.body.toString("utf8"))
      const email = String(order.email || order.contact_email || "").trim()
      const customerName = String(
        order?.customer?.first_name ||
        order?.billing_address?.first_name ||
        ""
      ).trim()

      const financialStatus = String(order.financial_status || "").toLowerCase()

      if (financialStatus !== "paid") {
        return res.status(200).json({
          ok: true,
          skipped: true,
          reason: "order_not_paid"
        })
      }

      const created = []

      for (const item of order.line_items || []) {
        const found = findPremiumConfigFromLineItem(item)
        if (!found) continue

        const quantity = Number(item.quantity || 1)

        for (let i = 0; i < quantity; i += 1) {
          const record = await createPremiumRequest({
            orderId: String(order.id),
            lineItemId: String(item.id),
            productId: found.productId,
            email,
            customerName,
            unitIndex: i
          })

          try {
            await sendAccessEmail(record)
          } catch (emailError) {
            console.error("ACCESS EMAIL ERROR:", emailError)
          }

          created.push({
            id: record.id,
            productId: record.product_id,
            productName: record.product_name,
            formUrl: record.form_url
          })
        }
      }

      return res.status(200).json({
        ok: true,
        processedCount: created.length,
        created
      })
    } catch (error) {
      console.error("SHOPIFY ORDER PAID ERROR:", error)
      return res.status(500).json({
        ok: false,
        error: error.message
      })
    }
  }
)

app.use(express.json({ limit: "2mb" }))

app.post("/api/premium/form-submitted", async (req, res) => {
  try {
    console.log("BODY:", JSON.stringify(req.body, null, 2))

    const payload = normalizeFormPayload(req.body)
    console.log("NORMALIZED:", JSON.stringify(payload, null, 2))

    if (!payload.email) {
      return res.status(400).json({ ok: false, error: "missing email" })
    }

    const requestRecord = await findRequestForSubmittedForm(payload)
    console.log("MATCH:", requestRecord?.id || null)

    await pool.query(
      `
      INSERT INTO premium_form_submissions
      (id, premium_request_id, order_id, email, product_name, premium_type, payload_json, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        payload.submissionId,
        requestRecord?.id || null,
        payload.orderId || null,
        payload.email || null,
        payload.productName || null,
        payload.premiumType || null,
        JSON.stringify(payload),
        new Date().toISOString()
      ]
    )

    if (requestRecord?.id) {
      await pool.query(
        `
        UPDATE premium_requests
        SET status = $1,
            form_submitted_at = $2
        WHERE id = $3
        `,
        ["form_submitted", new Date().toISOString(), requestRecord.id]
      )
    }

    try {
      await sendInternalAlertEmail(payload, requestRecord)
    } catch (error) {
      console.error("INTERNAL EMAIL ERROR:", error)
    }

    try {
      await sendClientConfirmationEmail(payload, requestRecord)
    } catch (error) {
      console.error("CLIENT EMAIL ERROR:", error)
    }

    return res.status(200).json({
      ok: true,
      matchedRequestId: requestRecord?.id || null
    })
  } catch (err) {
    console.error("FORM ERROR:", err)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

app.use((error, req, res, next) => {
  console.error("EXPRESS GLOBAL ERROR:", {
    path: req.path,
    method: req.method,
    message: error?.message,
    type: error?.type,
    stack: error?.stack
  })

  if (res.headersSent) {
    return next(error)
  }

  return res.status(error.status || 500).json({
    ok: false,
    error: error.message || "server_error"
  })
})

const PORT = Number(process.env.PORT) || 8080

async function startServer() {
  try {
    await initDb()

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`premium server running on port ${PORT}`)
    })
  } catch (error) {
    console.error("SERVER START ERROR:", error)
    process.exit(1)
  }
}

startServer()
