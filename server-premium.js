require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const { Pool } = require("pg")

const app = express()
app.use(cors())
app.use(express.json({ limit: "2mb" }))

// ==============================
// LOGS (CLAVE PARA DEBUG)
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
      order_id TEXT,
      email TEXT,
      product_name TEXT,
      premium_type TEXT,
      payload_json TEXT,
      created_at TEXT
    );
  `)

  console.log("Postgres ready")
}

// ==============================
// HEALTH CHECK (🔥 CLAVE)
// ==============================

app.get("/", (req, res) => {
  res.send("premium alive")
})

// ==============================
// TEST ENDPOINT
// ==============================

app.get("/health", (req, res) => {
  res.json({ ok: true })
})

// ==============================
// WEBHOOK
// ==============================

app.post("/api/premium/form-submitted", async (req, res) => {
  try {
    console.log("BODY:", req.body)

    const email = req.body.email || ""

    if (!email) {
      return res.status(400).json({ error: "missing email" })
    }

    await pool.query(
      `INSERT INTO premium_form_submissions
      (id, order_id, email, product_name, premium_type, payload_json, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT DO NOTHING`,
      [
        crypto.randomUUID(),
        req.body.orderId || "",
        email,
        req.body.productName || "",
        req.body.premiumType || "",
        JSON.stringify(req.body),
        new Date().toISOString()
      ]
    )

    res.json({ ok: true })
  } catch (err) {
    console.error("ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

// ==============================
// START (🔥 MUY IMPORTANTE)
// ==============================

const PORT = process.env.PORT || 8080

initDb().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log("premium server running on port", PORT)
  })
})
