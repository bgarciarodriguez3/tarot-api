require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const { Resend } = require("resend")

const app = express()
app.use(cors())
app.use(express.json())

// ==============================
// CONFIG
// ==============================

const resend = new Resend(process.env.RESEND_API_KEY)

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby2K07SGICgJZ0JzxbmMz3LMrTBnb3PN6MvXVyA88FWLiNXMaM-OCK__oA6bMRUC032/exec"

// ==============================
// FORMULARIOS POR PRODUCTO
// ==============================

const FORMS = {
  mentoria: "https://forms.gle/UFFju3qX5tKaatkQ6",
  amor: "https://forms.gle/UFFju3qX5tKaatkQ6",
  dinero: "https://forms.gle/UFFju3qX5tKaatkQ6"
}

// ==============================
// BOTÓN PREMIUM ULTRA VISIBLE
// ==============================

function premiumButton(url) {
  return `
  <div style="text-align:center;margin:40px 0;">
    <a href="${url}" target="_blank"
      style="
        display:inline-block;
        padding:22px 40px;
        font-size:20px;
        font-weight:bold;
        color:#fff;
        background:linear-gradient(135deg,#7b5cff,#c6a45a);
        border-radius:50px;
        text-decoration:none;
        box-shadow:0 10px 25px rgba(0,0,0,0.3);
        animation:pulse 1.5s infinite;
      ">
      ✨ COMPLETAR FORMULARIO PREMIUM ✨
    </a>
  </div>

  <style>
    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }
  </style>
  `
}

// ==============================
// EMAIL PREMIUM
// ==============================

async function sendEmail({ to, name, type }) {
  const formUrl = FORMS[type] || FORMS.mentoria

  await resend.emails.send({
    from: "Premium Tarot <contactopremium@eltarotdelaruedadelafortuna.com>",
    to,
    subject: "✨ Tu consulta premium — siguiente paso",
    html: `
      <div style="font-family:Arial;padding:20px;max-width:600px;margin:auto;">
        <h2 style="text-align:center;">🔮 Consulta Premium</h2>

        <p>Hola ${name || ""},</p>

        <p>Para comenzar tu consulta, completa el formulario:</p>

        ${premiumButton(formUrl)}

        <p style="text-align:center;font-size:14px;color:#777;">
          Tiempo estimado: 48h
        </p>
      </div>
    `
  })
}

// ==============================
// API FORM SUBMITTED (CRM)
// ==============================

app.post("/api/premium/form-submitted", async (req, res) => {
  try {
    console.log("DATA:", req.body)

    // Guardar en Google Sheets (CRM)
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(req.body),
      headers: { "Content-Type": "application/json" }
    })

    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ==============================
// TEST EMAIL
// ==============================

app.get("/test-email", async (req, res) => {
  await sendEmail({
    to: "bgarciarodriguez3@gmail.com",
    name: "Miriam",
    type: "mentoria"
  })

  res.send("EMAIL ENVIADO 🚀")
})

// ==============================
// ROOT
// ==============================

app.get("*", (req, res) => {
  res.send("🔥 PREMIUM API RUNNING")
})

// ==============================
// START
// ==============================

const PORT = process.env.PORT || 8080

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on", PORT)
})
