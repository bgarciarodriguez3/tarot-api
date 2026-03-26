require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const { Pool } = require("pg")

const app = express()
app.use(cors())
app.use(express.json({ limit: "2mb" }))

// ==============================
// LOGS (CLAVE)
// ==============================

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

// ==============================
// DB
// ==============================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false }
})

pool.on("error", (error) => {
  console.error("POSTGRES ERROR:", error)
})

// ==============================
// INIT DB
// ==============================

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS premium_form_submissions (
      id TEXT PRIMARY KEY,
      email TEXT,
      order_id TEXT,
      product_name TEXT,
      premium_type TEXT,
      payload_json TEXT,
      created_at TEXT
    );
  `)

  console.log("DB READY")
}

// ==============================
// HELPERS
// ==============================

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function detectPremiumType(text = "") {
  const t = normalizeText(text)

  if (t.includes("mentoria")) return "mentoria"
  if (t.includes("amor")) return "amor"
  if (t.includes("dinero")) return "dinero"

  return "general"
}

// ==============================
// BOTÓN PREMIUM 🔥
// ==============================

function buildPremiumButton(url) {
  return `
  <div style="text-align:center;margin:40px 0;">
    <a href="${url}" target="_blank"
      style="
        display:inline-block;
        padding:18px 36px;
        font-size:18px;
        font-weight:700;
        color:#fff;
        text-decoration:none;
        border-radius:999px;
        background:linear-gradient(135deg,#7b5cff,#c6a45a);
        box-shadow:0 8px 25px rgba(123,92,255,0.4);
      ">
      ✨ ACCEDER A TU CONSULTA PREMIUM
    </a>
  </div>
  `
}

// ==============================
// HEALTH CHECK (MUY IMPORTANTE)
// ==============================

app.get("/", (_req, res) => {
  res.send("premium vivo")
})

// ==============================
// WEBHOOK FORM
// ==============================

app.post("/api/premium/form-submitted", async (req, res) => {
  try {
    console.log("BODY:", req.body)

    const body = req.body

    const payload = {
      id: body.submissionId || crypto.randomUUID(),
      email: body.email || "",
      orderId: body.orderId || "",
      productName: body.productName || "",
      premiumType: detectPremiumType(
        body.premiumType || body.productName || ""
      ),
      createdAt: new Date().toISOString(),
      raw: body
    }

    if (!payload.email) {
      return res.status(400).json({ error: "missing email" })
    }

    // GUARDAR EN DB
    await pool.query(
      `INSERT INTO premium_form_submissions
      (id, email, order_id, product_name, premium_type, payload_json, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT DO NOTHING`,
      [
        payload.id,
        payload.email,
        payload.orderId,
        payload.productName,
        payload.premiumType,
        JSON.stringify(payload.raw),
        payload.createdAt
      ]
    )

    // LOG CLARO 🔥
    console.log("FORM GUARDADO:", payload.email, payload.premiumType)

    // 👉 AQUÍ LUEGO PODEMOS METER EMAIL AUTOMÁTICO

    res.json({ ok: true })

  } catch (err) {
    console.error("ERROR FORM:", err)
    res.status(500).json({ error: err.message })
  }
})

// ==============================
// START SERVER (IMPORTANTE)
// ==============================

const PORT = process.env.PORT || 8080

initDb().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log("🚀 premium server running on", PORT)
  })
})
