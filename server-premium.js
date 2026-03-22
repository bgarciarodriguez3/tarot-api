require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const fs = require("fs")
const path = require("path")
const Database = require("better-sqlite3")
const { Resend } = require("resend")

const { PREMIUM_PRODUCTS } = require("./config/premium-products")

const app = express()

const resend = new Resend(process.env.RESEND_API_KEY)

app.use(cors())
app.use("/api/premium/shopify/order-paid", express.raw({ type: "application/json" }))
app.use(express.json())

// ==============================
// DATABASE (SEPARADA)
// ==============================

const DB_PATH = path.join(__dirname, "data", "tarot-premium.sqlite")
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma("journal_mode = WAL")

db.exec(`
CREATE TABLE IF NOT EXISTS premium_requests (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  line_item_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  premium_type TEXT NOT NULL,
  form_url TEXT NOT NULL,
  customer_name TEXT,
  email TEXT NOT NULL,
  status TEXT NOT NULL,
  access_email_sent INTEGER NOT NULL DEFAULT 0,
  received_email_sent INTEGER NOT NULL DEFAULT 0,
  form_submitted_at TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS premium_form_submissions (
  id TEXT PRIMARY KEY,
  premium_request_id TEXT NOT NULL,
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
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || ""

  const digest = crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest("base64")

  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(digest))
  } catch {
    return false
  }
}

function createPremiumId(orderId, lineItemId, productId, unitIndex = 0) {
  return [
    "premium",
    orderId,
    lineItemId,
    productId,
    unitIndex
  ].join("-")
}

function findPremium(item) {
  const productId = String(item.product_id || "")
  const variantId = String(item.variant_id || "")

  if (PREMIUM_PRODUCTS[productId]) {
    return { productId, config: PREMIUM_PRODUCTS[productId] }
  }

  if (PREMIUM_PRODUCTS[variantId]) {
    return { productId: variantId, config: PREMIUM_PRODUCTS[variantId] }
  }

  return null
}

// ==============================
// EMAILS
// ==============================

async function sendPremiumAccessEmail(record) {
  if (!record.email) return

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: record.email,
    subject: "✨ Accede a tu mentoría premium",
    html: `
      <div style="font-family:Georgia,serif;padding:30px;">
        <h2>Tu espacio premium ya está preparado</h2>
        <p>Haz clic para completar tu formulario:</p>
        <a href="${record.form_url}" style="background:#241845;color:#fff;padding:12px 20px;border-radius:20px;text-decoration:none;">
          Accede a tu destino
        </a>
      </div>
    `
  })

  return result
}

async function sendPremiumReceivedEmail(record) {
  if (!record.email) return

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: record.email,
    subject: "✨ Hemos recibido tu formulario",
    html: `
      <div style="font-family:Georgia,serif;padding:30px;">
        <h2>Hemos recibido tu formulario</h2>
        <p>Tu mentoría será preparada con cuidado.</p>
        <p>La recibirás en un plazo de <strong>48h laborables</strong>.</p>
      </div>
    `
  })

  return result
}

// ==============================
// WEBHOOK SHOPIFY (PREMIUM)
// ==============================

app.post("/api/premium/shopify/order-paid", async (req, res) => {
  try {
    if (!verifyShopify(req)) {
      return res.status(401).send("invalid")
    }

    const order = JSON.parse(req.body.toString("utf8"))
    const email = order.email || ""

    for (const item of order.line_items || []) {
      const found = findPremium(item)
      if (!found) continue

      const id = createPremiumId(order.id, item.id, found.productId)

      const record = {
        id,
        order_id: String(order.id),
        line_item_id: String(item.id),
        product_id: found.productId,
        product_name: found.config.name,
        premium_type: found.config.type,
        form_url: found.config.formUrl,
        customer_name: "",
        email,
        status: "pending_form",
        access_email_sent: 0,
        received_email_sent: 0,
        created_at: new Date().toISOString()
      }

      db.prepare(`
        INSERT OR IGNORE INTO premium_requests (
          id, order_id, line_item_id, product_id, product_name,
          premium_type, form_url, customer_name, email, status,
          access_email_sent, received_email_sent, created_at
        ) VALUES (
          @id, @order_id, @line_item_id, @product_id, @product_name,
          @premium_type, @form_url, @customer_name, @email, @status,
          @access_email_sent, @received_email_sent, @created_at
        )
      `).run(record)

      await sendPremiumAccessEmail(record)
    }

    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false })
  }
})

// ==============================
// FORM SUBMITTED
// ==============================

app.post("/api/premium/form-submitted", async (req, res) => {
  try {
    const { orderId, email } = req.body

    const record = db.prepare(`
      SELECT * FROM premium_requests
      WHERE order_id = ? AND email = ?
      ORDER BY created_at DESC
    `).get(orderId, email)

    if (!record) {
      return res.status(404).json({ ok: false })
    }

    db.prepare(`
      UPDATE premium_requests
      SET status = ?, form_submitted_at = ?
      WHERE id = ?
    `).run("form_submitted", new Date().toISOString(), record.id)

    await sendPremiumReceivedEmail(record)

    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false })
  }
})

// ==============================
// HEALTH
// ==============================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "premium-server"
  })
})

// ==============================
// START SERVER
// ==============================

const PORT = Number(process.env.PREMIUM_PORT) || 8081

app.listen(PORT, "0.0.0.0", () => {
  console.log(`premium server running on port ${PORT}`)
})
