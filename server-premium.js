require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const { Resend } = require("resend")
const { Pool } = require("pg")

const app = express()

// Inicialización de Resend (Asegúrate que RESEND_API_KEY esté en Railway)
const resend = new Resend(process.env.RESEND_API_KEY)

app.use(cors())
// IMPORTANTE: Mantenemos el raw para la verificación de Shopify
app.use("/api/premium/shopify/order-paid", express.raw({ type: "application/json" }))
app.use(express.json())

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

// ==============================
// DB INIT
// ==============================
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
    CREATE TABLE IF NOT EXISTS premium_processed_webhooks (
      webhook_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );
  `)
  console.log("✅ Postgres tables ready")
}

// ==============================
// HELPERS & EMAILS (Se mantienen igual tus funciones de build)
// ==============================
function verifyShopify(req) {
  const hmac = req.get("X-Shopify-Hmac-Sha256")
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || ""
  if (!hmac || !req.body) return false
  const digest = crypto.createHmac("sha256", secret).update(req.body).digest("base64")
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(digest))
}

async function sendAccessEmail(record) {
  if (!record.email || !process.env.RESEND_FROM_EMAIL) return
  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: record.email,
    subject: "✨ Accede a tu destino",
    html: buildAccessEmailHtml(record)
  })
  if (!result.error) {
    await pool.query("UPDATE premium_requests SET access_email_sent = 1 WHERE id = $1", [record.id])
  }
}

// ... (Aquí irían tus funciones buildAccessEmailHtml, etc. que ya tienes) ...

// ==============================
// RUTAS CORREGIDAS
// ==============================

app.post("/api/premium/shopify/order-paid", async (req, res) => {
  try {
    console.log("📩 WEBHOOK RECIBIDO")

    // 1. Verificación rápida de seguridad
    if (!verifyShopify(req)) {
      console.error("❌ HMAC INVALIDO")
      return res.status(401).send("Unauthorized")
    }

    // 2. Responder a Shopify YA para evitar el Error 502 / Timeout
    res.status(200).json({ ok: true, message: "Processing started" })

    // 3. Procesar el resto en "background"
    const webhookId = req.get("X-Shopify-Webhook-Id")
    const bodyString = req.body.toString("utf8")
    const order = JSON.parse(bodyString)

    console.log(`📦 Procesando Pedido #${order.name} (${order.id})`)

    if (order.financial_status !== "paid") return

    for (const item of order.line_items || []) {
      const productId = String(item.product_id)
      const config = PREMIUM_PRODUCTS[productId]

      if (config) {
        const quantity = Number(item.quantity || 1)
        for (let i = 0; i < quantity; i++) {
          const recordId = `premium-${order.id}-${item.id}-${i}`
          
          // Crear registro en DB
          await pool.query(`
            INSERT INTO premium_requests (id, order_id, email, product_name, form_url, status, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO NOTHING
          `, [recordId, String(order.id), order.email, config.name, config.formUrl, 'pending', new Date().toISOString()])

          // Enviar Email
          console.log(`📧 Enviando email de acceso a: ${order.email}`)
          const record = { id: recordId, email: order.email, form_url: config.formUrl }
          await sendAccessEmail(record)
        }
      }
    }
    console.log("✅ Proceso de pedido finalizado con éxito")

  } catch (error) {
    console.error("🔥 ERROR CRÍTICO EN WEBHOOK:", error.message)
    // No enviamos res.status porque ya respondimos arriba
  }
})

// ... (El resto de tus rutas como form-submitted se mantienen igual) ...

const PORT = process.env.PORT || 8080
async function start() {
  try {
    await initDb()
    app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor en puerto ${PORT}`))
  } catch (e) {
    console.error("No se pudo iniciar el servidor:", e)
  }
}
start()
