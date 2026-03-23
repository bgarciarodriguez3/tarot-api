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

// 🔥 IMPORTANTE: raw SOLO para Shopify
app.use("/api/premium/shopify/order-paid", express.raw({ type: "*/*" }))

app.use(express.json())

// ==============================
// DATABASE
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

  if (!hmac || !secret || !Buffer.isBuffer(req.body)) {
    console.log("[HMAC] invalid setup")
    return false
  }

  const digest = crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest("base64")

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmac, "utf8"),
      Buffer.from(digest, "utf8")
    )
  } catch {
    return false
  }
}

function findPremium(item) {
  const productId = String(item?.product_id || "")
  const variantId = String(item?.variant_id || "")

  if (PREMIUM_PRODUCTS[productId]) {
    return { productId, config: PREMIUM_PRODUCTS[productId] }
  }

  if (PREMIUM_PRODUCTS[variantId]) {
    return { productId: variantId, config: PREMIUM_PRODUCTS[variantId] }
  }

  return null
}

function isProcessed(id) {
  return db
    .prepare("SELECT webhook_id FROM premium_processed_webhooks WHERE webhook_id = ?")
    .get(id)
}

function markProcessed(id) {
  db.prepare(`
    INSERT OR IGNORE INTO premium_processed_webhooks (webhook_id, created_at)
    VALUES (?, ?)
  `).run(id, new Date().toISOString())
}

// ==============================
// EMAIL
// ==============================

async function sendPremiumEmail(record) {
  if (!record.email) {
    console.log("[EMAIL] no email")
    return
  }

  console.log("[EMAIL] sending to:", record.email)

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: record.email,
    subject: "✨ Accede a tu mentoría premium",
    html: `
      <h2>Accede a tu experiencia premium</h2>
      <p>Haz clic aquí:</p>
      <a href="${record.form_url}">${record.form_url}</a>
    `
  })

  console.log("[EMAIL RESULT]", result)
}

// ==============================
// WEBHOOK SHOPIFY
// ==============================

app.post("/api/premium/shopify/order-paid", (req, res) => {
  console.log("🔥 WEBHOOK HIT")

  try {
    if (!verifyShopify(req)) {
      console.log("❌ INVALID HMAC")
      return res.sendStatus(401)
    }

    const webhookId = req.get("X-Shopify-Webhook-Id") || ""

    if (webhookId && isProcessed(webhookId)) {
      console.log("⚠️ DUPLICATE")
      return res.sendStatus(200)
    }

    const raw = req.body.toString("utf8")
    const order = JSON.parse(raw)

    console.log("ORDER ID:", order.id)

    // 🚀 RESPONDER YA (evita 502)
    res.sendStatus(200)

    // 🔥 Procesar después
    setImmediate(async () => {
      try {
        const email = order.email || order.contact_email || ""

        for (const item of order.line_items || []) {
          const found = findPremium(item)

          if (!found) {
            console.log("NO PREMIUM MATCH")
            continue
          }

          const record = {
            id: `${order.id}-${item.id}`,
            order_id: String(order.id),
            line_item_id: String(item.id),
            product_id: found.productId,
            product_name: found.config.name,
            premium_type: found.config.type,
            form_url: found.config.formUrl,
            email,
            status: "pending",
            created_at: new Date().toISOString()
          }

          db.prepare(`
            INSERT OR IGNORE INTO premium_requests (
              id, order_id, line_item_id, product_id,
              product_name, premium_type, form_url,
              email, status, created_at
            ) VALUES (
              @id, @order_id, @line_item_id, @product_id,
              @product_name, @premium_type, @form_url,
              @email, @status, @created_at
            )
          `).run(record)

          await sendPremiumEmail(record)
        }

        if (webhookId) markProcessed(webhookId)

        console.log("✅ WEBHOOK DONE")
      } catch (err) {
        console.error("ASYNC ERROR:", err)
      }
    })
  } catch (err) {
    console.error("ERROR:", err)
    return res.sendStatus(500)
  }
})

// ==============================
// FORM SUBMIT
// ==============================

app.post("/api/premium/form-submitted", async (req, res) => {
  try {
    console.log("FORM RECEIVED", req.body)
    return res.json({ ok: true })
  } catch (err) {
    console.error(err)
    return res.sendStatus(500)
  }
})

// ==============================
// HEALTH
// ==============================

app.get("/", (_req, res) => {
  res.send("OK")
})

app.get("/ping", (_req, res) => {
  console.log("PING HIT")
  res.send("pong")
})

// ==============================
// START SERVER (🔥 FIX RAILWAY)
// ==============================

const PORT = process.env.PORT || 8080

console.log("PORT ENV:", process.env.PORT)
console.log("USING PORT:", PORT)

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 server running on port ${PORT}`)
})
