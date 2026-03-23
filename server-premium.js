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
  access_email_sent INTEGER,
  created_at TEXT
);
`)

// ================== EMAILS ==================

function buildAccessEmailText(record) {
  return `
Querida alma,

Tu portal de sabiduría personalizada ya está abierto.

Para comenzar, necesitamos que nos cuentes tu situación con calma y desde el corazón.

Accede aquí a tu formulario:
${record.form_url}

En cuanto lo recibamos, comenzaremos a preparar tu guía completamente personalizada.

Un abrazo de luz,
Equipo Premium
`
}

function buildAccessEmailHtml(record) {
  return `
  <div style="font-family:Georgia;padding:20px">
    <h2>✨ Tu acceso está listo</h2>
    <p>Querida alma,</p>
    <p>Ya puedes acceder a tu formulario y comenzar tu proceso.</p>
    <a href="${record.form_url}" style="padding:12px 20px;background:#241845;color:white;border-radius:20px;text-decoration:none;">
      Accede a tu destino
    </a>
  </div>
  `
}

// ================== SHOPIFY ==================

function verifyShopify(req) {
  const hmac = req.get("X-Shopify-Hmac-Sha256")
  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(req.body)
    .digest("base64")

  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(digest))
}

function createPremiumRequest({ orderId, lineItemId, productId, email }) {
  const config = PREMIUM_PRODUCTS[productId]

  const id = `premium-${orderId}-${lineItemId}-${productId}`

  db.prepare(`
    INSERT OR IGNORE INTO premium_requests (
      id, order_id, line_item_id, product_id,
      product_name, premium_type, form_url,
      email, status, access_email_sent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    orderId,
    lineItemId,
    productId,
    config.name,
    config.type,
    config.formUrl,
    email,
    "pending_form",
    0,
    new Date().toISOString()
  )

  return db.prepare("SELECT * FROM premium_requests WHERE id = ?").get(id)
}

// ================== ROUTES ==================

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "premium" })
})

app.get("/api/health", (_req, res) => {
  res.json({ ok: true })
})

app.post("/api/premium/shopify/order-paid", async (req, res) => {
  try {
    if (!verifyShopify(req)) {
      return res.status(401).send("invalid")
    }

    const order = JSON.parse(req.body.toString("utf8"))
    const email = order.email

    for (const item of order.line_items) {
      const config = PREMIUM_PRODUCTS[String(item.product_id)]

      if (!config) continue

      const record = createPremiumRequest({
        orderId: order.id,
        lineItemId: item.id,
        productId: item.product_id,
        email
      })

      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: email,
        subject: "✨ Accede a tu destino",
        text: buildAccessEmailText(record),
        html: buildAccessEmailHtml(record)
      })
    }

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
})

// ================== FORM ==================

app.post("/api/premium/form-submitted", async (req, res) => {
  const payload = req.body

  console.log("FORM RECIBIDO:", payload)

  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: INTERNAL_EMAIL,
      subject: "🔥 Nuevo formulario premium",
      text: JSON.stringify(payload, null, 2)
    })

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: payload.email,
      subject: "✨ Hemos recibido tu formulario",
      text: `
Querida alma,

Hemos recibido tu formulario correctamente.

En un plazo máximo de 48h laborables recibirás tu lectura completamente personalizada.

Un abrazo de luz.
`
    })

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
})

// ================== PORT (FIX RAILWAY) ==================

console.log("PORT ENV:", process.env.PORT)

const PORT = process.env.PORT

app.listen(PORT, "0.0.0.0", () => {
  console.log("premium server running on port", PORT)
})
