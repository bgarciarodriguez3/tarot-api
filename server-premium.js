require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const { Resend } = require("resend")
const { Pool } = require("pg")

const app = express()
app.use(cors())

// ==============================
// LOGS GLOBALES (CLAVE)
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
// CONFIG
// ==============================

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

// ==============================
// PRODUCTOS
// ==============================

const PREMIUM_PRODUCTS = {
  "10496141754705": {
    name: "Mentoría",
    type: "mentoria"
  },
  "10523108966737": {
    name: "Amor",
    type: "amor"
  },
  "10667662606673": {
    name: "Dinero",
    type: "dinero"
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
      email TEXT,
      premium_type TEXT,
      status TEXT,
      created_at TEXT
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS premium_form_submissions (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      email TEXT,
      premium_type TEXT,
      payload_json TEXT,
      created_at TEXT
    );
  `)

  console.log("Postgres tables ready")
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

function detectPremiumType(input = "") {
  const text = normalizeText(input)

  if (text.includes("mentoria")) return "mentoria"
  if (text.includes("amor")) return "amor"
  if (text.includes("dinero")) return "dinero"

  return ""
}

// ==============================
// MIDDLEWARE
// ==============================

app.use(express.json({ limit: "2mb" }))

// 🔥 IMPORTANTE → evita que Railway mate el servidor
app.get("/", (req, res) => {
  res.send("premium alive")
})

// ==============================
// ROUTE PRINCIPAL
// ==============================

app.post("/api/premium/form-submitted", async (req, res) => {
  try {
    console.log("BODY:", req.body)

    const email = req.body.email || ""
    const orderId = req.body.orderId || ""
    const premiumType = detectPremiumType(req.body.productName || "")

    if (!email) {
      return res.status(400).json({ error: "missing email" })
    }

    await pool.query(
      `INSERT INTO premium_form_submissions
      (id, order_id, email, premium_type, payload_json, created_at)
      VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        crypto.randomUUID(),
        orderId,
        email,
        premiumType,
        JSON.stringify(req.body),
        new Date().toISOString()
      ]
    )

    console.log("✅ FORM GUARDADO")

    res.json({ ok: true })
  } catch (err) {
    console.error("FORM ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

// ==============================
// START
// ==============================

const PORT = process.env.PORT || 8080

initDb().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log("premium server running on port", PORT)
  })
})
