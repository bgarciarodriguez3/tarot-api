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

// ✅ TU GOOGLE SCRIPT YA CONFIGURADO
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
// DETECTAR TIPO
// ==============================

function detectPremiumType(text = "") {
  const t = text.toLowerCase()

  if (t.includes("mentoria")) return "mentoria"
  if (t.includes("amor")) return "amor"
  if (t.includes("dinero")) return "dinero"

  return "general"
}

// ==============================
// FORMULARIOS DINÁMICOS 🔥
// ==============================

function getFormUrl(type) {
  if (type === "mentoria") return "https://forms.gle/UFFju3qX5tKaatkQ6"
  if (type === "amor") return "https://forms.gle/z7Yqenb3VsrAVjij9"
  if (type === "dinero") return "https://forms.gle/AyAm7JACnZCoXNsy7"

  return "https://forms.gle/UFFju3qX5tKaatkQ6"
}

// ==============================
// BOTÓN PREMIUM 🔥
// ==============================

function buildPremiumButton(url) {
  return `
  <div style="text-align:center;margin:50px 0;">
    <a href="${url}" target="_blank"
      style="
        display:inline-block;
        padding:22px 45px;
        font-size:22px;
        font-weight:900;
        color:#ffffff;
        text-decoration:none;
        border-radius:999px;
        background:linear-gradient(135deg,#6b46ff,#d4af37);
        box-shadow:0 12px 35px rgba(0,0,0,0.4);
      ">
      🔮 COMPLETAR CONSULTA PREMIUM
    </a>
    <div style="margin-top:10px;font-size:13px;color:#888;">
      Accede ahora para iniciar tu lectura personalizada
    </div>
  </div>
  `
}

// ==============================
// HEALTH
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

    // 💾 GUARDAR DB
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

    // 📊 GOOGLE SHEETS
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    // 📧 EMAIL DINÁMICO CON BOTÓN PREMIUM
    const formUrl = getFormUrl(payload.premiumType)

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: payload.email,
      subject: "✨ Completa tu consulta premium",
      html: `
        <div style="font-family:Arial;text-align:center;padding:20px;">
          <h2>Tu consulta premium está lista 🔮</h2>

          <p>
            Completa el formulario para comenzar tu lectura personalizada
          </p>

          ${buildPremiumButton(formUrl)}

          <p style="margin-top:20px;color:#666;">
            Tiempo estimado: 24-48h
          </p>
        </div>
      `
    })

    console.log("TODO OK:", payload)

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
