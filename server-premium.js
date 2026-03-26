require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const { Pool } = require("pg")
const fetch = require("node-fetch")
const { Resend } = require("resend")

const app = express()
app.use(cors())
app.use(express.json({ limit: "2mb" }))

const resend = new Resend(process.env.RESEND_API_KEY)

// ✅ TU GOOGLE SCRIPT
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby2K07SGICgJZ0JzxbmMz3LMrTBnb3PN6MvXVyA88FWLiNXMaM-OCK__oA6bMRUC032/exec"

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
}

// ==============================
// DETECTAR TIPO (FIJO Y ROBUSTO)
// ==============================

function detectPremiumType(text = "") {
  const t = text.toLowerCase()

  if (t.includes("amor")) return "amor"
  if (t.includes("dinero")) return "dinero"
  if (t.includes("mentoria")) return "mentoria"

  return "mentoria" // fallback seguro
}

// ==============================
// FORMULARIOS
// ==============================

function getFormUrl(type) {
  if (type === "mentoria") return "https://forms.gle/UFFju3qX5tKaatkQ6"
  if (type === "amor") return "https://forms.gle/z7Yqenb3VsrAVjij9"
  if (type === "dinero") return "https://forms.gle/AyAm7JACnZCoXNsy7"

  return "https://forms.gle/UFFju3qX5tKaatkQ6"
}

// ==============================
// EMAIL PREMIUM (BOTÓN REAL)
// ==============================

function buildEmail(formUrl) {
  return `
    <div style="font-family:Arial;text-align:center;padding:30px;">
      
      <h1 style="font-size:28px;">Tu consulta premium 🔮</h1>

      <p style="font-size:18px;">
        Completa el formulario para iniciar tu lectura personalizada
      </p>

      <a href="${formUrl}" 
         style="
           display:inline-block;
           margin-top:30px;
           padding:22px 40px;
           font-size:22px;
           font-weight:900;
           color:white;
           text-decoration:none;
           border-radius:999px;
           background:linear-gradient(135deg,#6b46ff,#d4af37);
           box-shadow:0 10px 40px rgba(0,0,0,0.4);
         ">
        👉 IR AL FORMULARIO
      </a>

      <p style="margin-top:20px;color:#666;">
        Tiempo estimado: 24-48h
      </p>

    </div>
  `
}

// ==============================
// ROUTE PRINCIPAL
// ==============================

app.post("/api/premium/form-submitted", async (req, res) => {
  try {
    const body = req.body

    const premiumType = detectPremiumType(body.productName || "")

    const payload = {
      id: crypto.randomUUID(),
      email: body.email,
      orderId: body.orderId,
      productName: body.productName,
      premiumType: premiumType,
      createdAt: new Date().toISOString()
    }

    if (!payload.email) {
      return res.status(400).json({ error: "missing email" })
    }

    // 💾 DB
    await pool.query(
      `INSERT INTO premium_form_submissions
      (id, email, order_id, product_name, premium_type, payload_json, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        payload.id,
        payload.email,
        payload.orderId,
        payload.productName,
        payload.premiumType,
        JSON.stringify(payload),
        payload.createdAt
      ]
    )

    // 📊 GOOGLE SHEETS
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    // 📧 EMAIL
    const formUrl = getFormUrl(premiumType)

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: payload.email,
      subject: "🔮 Accede a tu consulta premium",
      html: buildEmail(formUrl)
    })

    console.log("OK:", payload)

    res.json({ ok: true })

  } catch (err) {
    console.error(err)
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
