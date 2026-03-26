require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const { Pool } = require("pg")
const fetch = require("node-fetch")

const app = express()
app.use(cors())
app.use(express.json({ limit: "2mb" }))

// ==============================
// DB
// ==============================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false }
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

function detectPremiumType(text = "") {
  const t = text.toLowerCase()

  if (t.includes("mentoria")) return "mentoria"
  if (t.includes("amor")) return "amor"
  if (t.includes("dinero")) return "dinero"

  return "general"
}

// ==============================
// BOTÓN PREMIUM (EMAIL)
// ==============================

function buildPremiumButton(url) {
  return `
  <div style="text-align:center;margin:50px 0;">
    <a href="${url}" target="_blank"
      style="
        display:inline-block;
        padding:20px 40px;
        font-size:20px;
        font-weight:800;
        color:#ffffff;
        text-decoration:none;
        border-radius:999px;
        background:linear-gradient(135deg,#6b46ff,#d4af37);
        box-shadow:0 10px 30px rgba(0,0,0,0.3);
      ">
      ✨ COMPLETAR FORMULARIO PREMIUM
    </a>
    <div style="margin-top:10px;font-size:13px;color:#777;">
      Accede aquí para iniciar tu consulta personalizada
    </div>
  </div>
  `
}

// ==============================
// HEALTH CHECK
// ==============================

app.get("/", (_req, res) => {
  res.send("premium vivo")
})

// ==============================
// WEBHOOK FORMULARIO
// ==============================

app.post("/api/premium/form-submitted", async (req, res) => {
  try {
    const body = req.body

    const payload = {
      id: crypto.randomUUID(),
      email: body.email || "",
      orderId: body.orderId || "",
      productName: body.productName || "",
      premiumType: detectPremiumType(body.productName || ""),
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

    // 🔥 ENVIAR A GOOGLE SHEETS
    await fetch(process.env.GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    console.log("FORM GUARDADO Y ENVIADO:", payload)

    res.json({ ok: true })

  } catch (err) {
    console.error("ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

// ==============================
// START
// ==============================

const PORT = process.env.PORT || 8080

initDb().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log("🚀 premium server running on", PORT)
  })
})
