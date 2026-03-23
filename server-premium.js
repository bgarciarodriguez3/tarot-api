require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const fs = require("fs")
const path = require("path")
const Database = require("better-sqlite3")
const { Resend } = require("resend")

const app = express()
const resend = new Resend(process.env.RESEND_API_KEY)

app.use(cors())
app.use("/api/premium/shopify/order-paid", express.raw({ type: "application/json" }))
app.use(express.json())

const INTERNAL_EMAIL = "contactopremium@laruedadelafortuna.com"

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

const DB_PATH = path.join(__dirname, "data", "tarot-premium.sqlite")
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma("journal_mode = WAL")

db.exec(`
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
  access_email_sent INTEGER DEFAULT 0,
  received_email_sent INTEGER DEFAULT 0,
  internal_email_sent INTEGER DEFAULT 0,
  created_at TEXT,
  form_submitted_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS premium_form_submissions (
  id TEXT PRIMARY KEY,
  premium_request_id TEXT,
  order_id TEXT,
  email TEXT,
  product_name TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS premium_processed_webhooks (
  webhook_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
`)

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
    return { productId, config: PREMIUM_PRODUCTS[productId], matchedBy: "product_id" }
  }

  if (variantId && PREMIUM_PRODUCTS[variantId]) {
    return { productId: variantId, config: PREMIUM_PRODUCTS[variantId], matchedBy: "variant_id" }
  }

  return null
}

function isWebhookProcessed(webhookId) {
  if (!webhookId) return false

  const row = db
    .prepare("SELECT webhook_id FROM premium_processed_webhooks WHERE webhook_id = ?")
    .get(String(webhookId))

  return Boolean(row)
}

function markWebhookProcessed(webhookId) {
  if (!webhookId) return

  db.prepare(`
    INSERT OR IGNORE INTO premium_processed_webhooks (webhook_id, created_at)
    VALUES (?, ?)
  `).run(String(webhookId), new Date().toISOString())
}

function getPremiumRequestById(id) {
  return db
    .prepare("SELECT * FROM premium_requests WHERE id = ?")
    .get(String(id))
}

function createPremiumRequest({ orderId, lineItemId, productId, email, customerName = "", unitIndex = 0 }) {
  const config = PREMIUM_PRODUCTS[String(productId)]

  if (!config) {
    throw new Error(`Producto premium no configurado: ${productId}`)
  }

  const id = createPremiumId(orderId, lineItemId, productId, unitIndex)
  const existing = getPremiumRequestById(id)

  if (existing) {
    if (email && !existing.email) {
      db.prepare(`
        UPDATE premium_requests
        SET email = ?
        WHERE id = ?
      `).run(String(email), id)
    }

    if (customerName && !existing.customer_name) {
      db.prepare(`
        UPDATE premium_requests
        SET customer_name = ?
        WHERE id = ?
      `).run(String(customerName), id)
    }

    return db.prepare("SELECT * FROM premium_requests WHERE id = ?").get(id)
  }

  const record = {
    id,
    order_id: String(orderId || ""),
    line_item_id: String(lineItemId || ""),
    product_id: String(productId || ""),
    product_name: config.name,
    premium_type: config.type,
    form_url: config.formUrl,
    customer_name: String(customerName || ""),
    email: String(email || ""),
    status: "pending_form",
    access_email_sent: 0,
    received_email_sent: 0,
    internal_email_sent: 0,
    created_at: new Date().toISOString(),
    form_submitted_at: null,
    completed_at: null
  }

  db.prepare(`
    INSERT INTO premium_requests (
      id, order_id, line_item_id, product_id, product_name, premium_type,
      form_url, customer_name, email, status, access_email_sent,
      received_email_sent, internal_email_sent, created_at, form_submitted_at, completed_at
    ) VALUES (
      @id, @order_id, @line_item_id, @product_id, @product_name, @premium_type,
      @form_url, @customer_name, @email, @status, @access_email_sent,
      @received_email_sent, @internal_email_sent, @created_at, @form_submitted_at, @completed_at
    )
  `).run(record)

  return db.prepare("SELECT * FROM premium_requests WHERE id = ?").get(id)
}

// ==============================
// EMAIL TEMPLATES
// ==============================

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

  if (record.access_email_sent) {
    console.log("EMAIL ACCESO PREMIUM: ya enviado para", record.id)
    return { already: true }
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

  db.prepare(`
    UPDATE premium_requests
    SET access_email_sent = 1
    WHERE id = ?
  `).run(record.id)

  console.log("RESEND ACCESS PREMIUM OK:", result)
  return result
}

async function sendClientConfirmationEmail(payload, requestRecord) {
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
      customerName: payload.customerName || requestRecord?.customer_name || ""
    }),
    html: buildClientConfirmationHtml({
      customerName: payload.customerName || requestRecord?.customer_name || ""
    })
  })

  if (result?.error) {
    console.error("RESEND CLIENT CONFIRMATION ERROR:", result.error)
    throw new Error(result.error.message || "Error enviando confirmación al cliente")
  }

  if (requestRecord?.id) {
    db.prepare(`
      UPDATE premium_requests
      SET received_email_sent = 1
      WHERE id = ?
    `).run(requestRecord.id)
  }

  console.log("RESEND CLIENT CONFIRMATION OK:", result)
  return result
}

async function sendInternalAlertEmail(payload, requestRecord) {
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

  if (requestRecord?.id) {
    db.prepare(`
      UPDATE premium_requests
      SET internal_email_sent = 1
      WHERE id = ?
    `).run(requestRecord.id)
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

function findRequestForSubmittedForm(payload) {
  if (payload.orderId && payload.email) {
    const row = db.prepare(`
      SELECT *
      FROM premium_requests
      WHERE order_id = ? AND email = ?
      ORDER BY created_at DESC
    `).get(String(payload.orderId), String(payload.email))

    if (row) return row
  }

  if (payload.email && payload.productId) {
    const row = db.prepare(`
      SELECT *
      FROM premium_requests
      WHERE email = ? AND product_id = ?
      ORDER BY created_at DESC
    `).get(String(payload.email), String(payload.productId))

    if (row) return row
  }

  if (payload.email && payload.productName) {
    const row = db.prepare(`
      SELECT *
      FROM premium_requests
      WHERE email = ? AND product_name = ?
      ORDER BY created_at DESC
    `).get(String(payload.email), String(payload.productName))

    if (row) return row
  }

  return null
}

// ==============================
// ROUTES
// ==============================

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "tarot-premium",
    version: "premium-v1"
  })
})

app.get("/api/health", (_req, res) => {
  res.json({ ok: true })
})

app.get("/favicon.ico", (_req, res) => {
  res.status(204).end()
})

app.post("/api/premium/shopify/order-paid", async (req, res) => {
  try {
    console.log("=== PREMIUM WEBHOOK SHOPIFY RECIBIDO ===")

    if (!verifyShopify(req)) {
      console.error("PREMIUM SHOPIFY WEBHOOK INVALID HMAC")
      return res.status(401).send("invalid")
    }

    const webhookId = String(req.get("X-Shopify-Webhook-Id") || "")
    if (webhookId && isWebhookProcessed(webhookId)) {
      console.log("PREMIUM WEBHOOK DUPLICADO IGNORADO:", webhookId)
      return res.status(200).json({
        ok: true,
        duplicate: true
      })
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

    let processedCount = 0
    const created = []

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
        const record = createPremiumRequest({
          orderId: String(order.id),
          lineItemId: String(item.id),
          productId: found.productId,
          email,
          customerName,
          unitIndex: i
        })

        if (!record.access_email_sent && record.email) {
          try {
            await sendAccessEmail(record)
          } catch (emailError) {
            console.error("ACCESS PREMIUM EMAIL ERROR:", emailError)
          }
        }

        created.push({
          id: record.id,
          orderId: record.order_id,
          productId: record.product_id,
          productName: record.product_name,
          formUrl: record.form_url
        })

        processedCount += 1
      }
    }

    if (webhookId) {
      markWebhookProcessed(webhookId)
    }

    return res.status(200).json({
      ok: true,
      processedCount,
      created
    })
  } catch (error) {
    console.error("PREMIUM SHOPIFY ORDER PAID ERROR:", error)
    return res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

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

    const requestRecord = findRequestForSubmittedForm(payload)

    db.prepare(`
      INSERT INTO premium_form_submissions (
        id, premium_request_id, order_id, email, product_name, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.submissionId,
      requestRecord?.id || null,
      payload.orderId || null,
      payload.email || null,
      payload.productName || requestRecord?.product_name || null,
      JSON.stringify(payload),
      new Date().toISOString()
    )

    if (requestRecord?.id) {
      db.prepare(`
        UPDATE premium_requests
        SET
          status = ?,
          customer_name = CASE
            WHEN customer_name IS NULL OR customer_name = '' THEN ?
            ELSE customer_name
          END,
          form_submitted_at = ?
        WHERE id = ?
      `).run(
        "form_submitted",
        payload.customerName || "",
        new Date().toISOString(),
        requestRecord.id
      )
    }

    try {
      await sendInternalAlertEmail(payload, requestRecord)
    } catch (internalError) {
      console.error("INTERNAL ALERT SEND ERROR:", internalError)
    }

    try {
      await sendClientConfirmationEmail(payload, requestRecord)
    } catch (clientError) {
      console.error("CLIENT CONFIRMATION SEND ERROR:", clientError)
    }

    return res.status(200).json({
      ok: true,
      matchedRequestId: requestRecord?.id || null
    })
  } catch (error) {
    console.error("PREMIUM FORM SUBMITTED ERROR:", error)
    return res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

// ==============================
// START SERVER
// ==============================

const PORT = process.env.PORT || 8080

console.log("PORT FINAL:", PORT)

app.listen(PORT, "0.0.0.0", () => {
  console.log("premium server running on port", PORT)
})
