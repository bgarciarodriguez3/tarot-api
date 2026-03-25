require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const { Resend } = require("resend")
const { Pool } = require("pg")

const app = express()
app.use(cors())

// ==============================
// 🔥 FIX 502 → CAPTURAR RAW BODY
// ==============================

app.use((req, res, next) => {
  let data = ""
  req.on("data", chunk => data += chunk)
  req.on("end", () => {
    req.rawBody = data
    next()
  })
})

// ❌ IMPORTANTE: NO usamos express.json()
// app.use(express.json())

// ==============================
// GLOBAL ERROR LOGS
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
      access_email_sent INTEGER DEFAULT 0,
      received_email_sent INTEGER DEFAULT 0,
      internal_email_sent INTEGER DEFAULT 0,
      created_at TEXT,
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
      payload_json TEXT,
      created_at TEXT
    );
  `)

  await pool.query(`
    ALTER TABLE premium_form_submissions
    ADD COLUMN IF NOT EXISTS premium_type TEXT
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

  if (!text) return ""
  if (text.includes("mentoria") || text.includes("camino")) return "mentoria"
  if (text.includes("amor") || text.includes("relaciones")) return "amor"
  if (text.includes("dinero") || text.includes("economia")) return "dinero"

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

function normalizeFormPayload(body = {}) {
  const answers = body.answers || {}

  const email =
    body.email ||
    getValueFromAnswers(answers, ["email", "correo"])

  const orderId =
    body.orderId ||
    getValueFromAnswers(answers, ["pedido"])

  const productName =
    body.productName ||
    body.tipoConsulta ||
    body.sourceSheet ||
    ""

  const premiumType =
    detectPremiumType(body.tipoConsulta) ||
    detectPremiumType(body.sourceSheet) ||
    detectPremiumType(productName)

  return {
    submissionId: body.submissionId || crypto.randomUUID(),
    orderId: String(orderId || "").trim(),
    email: String(email || "").trim(),
    customerName: String(body.customerName || "").trim(),
    productName: String(productName || "").trim(),
    premiumType,
    submittedAt: body.submittedAt || new Date().toISOString(),
    answers,
    rawForm: body
  }
}

// ==============================
// ROUTE (ARREGLADO)
// ==============================

app.post("/api/premium/form-submitted", async (req, res) => {
  try {
    console.log("RAW BODY:", req.rawBody)

    const body = JSON.parse(req.rawBody || "{}")

    const payload = normalizeFormPayload(body)

    console.log("NORMALIZED:", payload)

    if (!payload.email) {
      return res.status(400).json({ error: "missing email" })
    }

    await pool.query(
      `INSERT INTO premium_form_submissions
      (id, order_id, email, product_name, premium_type, payload_json, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT DO NOTHING`,
      [
        payload.submissionId,
        payload.orderId,
        payload.email,
        payload.productName,
        payload.premiumType,
        JSON.stringify(payload),
        new Date().toISOString()
      ]
    )

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
  app.listen(PORT, () => {
    console.log("premium server running on port", PORT)
  })
})
