require("dotenv").config()

const express = require("express")
const cors = require("cors")
const path = require("path")
const { Resend } = require("resend")

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, "public")))

// ==============================
// CONFIG
// ==============================

const resend = new Resend(process.env.RESEND_API_KEY)

const GOOGLE_SCRIPT_URL =
  process.env.GOOGLE_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycby2K07SGICgJZ0JzxbmMz3LMrTBnb3PN6MvXVyA88FWLiNXMaM-OCK__oA6bMRUC032/exec"

// ==============================
// FORMULARIOS POR PRODUCTO
// ==============================

const FORMS = {
  mentoria: "https://forms.gle/Ygg9kMnmm3CvSSd88",
  amor: "https://forms.gle/z7Yqenb3VsrAVjij9",
  dinero: "https://forms.gle/jknaRNDVqEivuu4M8"
}

// ==============================
// CONFIG PREMIUM POR TIPO
// ==============================

const PREMIUM_CONFIG = {
  mentoria: {
    productName: "Mentoría Premium",
    subject: "✨ Tu consulta premium de mentoría — siguiente paso"
  },
  amor: {
    productName: "Consulta Amor",
    subject: "💖 Tu consulta premium de amor — siguiente paso"
  },
  dinero: {
    productName: "Consulta Dinero",
    subject: "💰 Tu consulta premium de dinero — siguiente paso"
  }
}

// ==============================
// HELPERS
// ==============================

function sanitize(value = "") {
  return String(value).trim()
}

function isValidEmail(email = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function getPremiumType(type = "") {
  const normalized = sanitize(type).toLowerCase()
  return ["mentoria", "amor", "dinero"].includes(normalized)
    ? normalized
    : "mentoria"
}

function getPremiumConfig(type = "") {
  const premiumType = getPremiumType(type)
  return PREMIUM_CONFIG[premiumType]
}

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
        ">
        ✨ COMPLETAR FORMULARIO PREMIUM ✨
      </a>
    </div>
  `
}

async function saveLeadToSheets(payload) {
  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })

  const rawText = await response.text()

  let parsed = {}
  try {
    parsed = JSON.parse(rawText)
  } catch {
    parsed = { raw: rawText }
  }

  if (!response.ok) {
    throw new Error(`Google Sheets HTTP ${response.status}`)
  }

  if (parsed.success === false) {
    throw new Error(parsed.message || "Google Sheets devolvió error")
  }

  return parsed
}

async function sendPremiumEmail({ to, name, type }) {
  const premiumType = getPremiumType(type)
  const config = getPremiumConfig(premiumType)
  const formUrl = FORMS[premiumType]

  return resend.emails.send({
    from:
      process.env.RESEND_FROM ||
      "Premium Tarot <contactopremium@eltarotdelaruedadelafortuna.com>",
    to,
    subject: config.subject,
    html: `
      <div style="font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:auto;color:#222;">
        <h2 style="text-align:center;">🔮 Consulta Premium</h2>

        <p>Hola ${name || ""},</p>

        <p>Gracias por tu interés en <strong>${config.productName}</strong>.</p>

        <p>Para continuar con tu proceso premium, completa este formulario específico:</p>

        ${premiumButton(formUrl)}

        <p style="text-align:center;font-size:14px;color:#777;">
          Tiempo estimado de respuesta: 24–48h
        </p>

        <p style="margin-top:30px;">
          Con cariño,<br>
          <strong>Equipo Premium</strong>
        </p>
      </div>
    `
  })
}

// ==============================
// API FORM SUBMITTED
// ==============================

app.post("/api/premium/form-submitted", async (req, res) => {
  try {
    const customerName = sanitize(req.body.customerName)
    const email = sanitize(req.body.email).toLowerCase()
    const premiumType = getPremiumType(req.body.premiumType)
    const message = sanitize(req.body.message)
    const config = getPremiumConfig(premiumType)

    if (!customerName) {
      return res.status(400).json({
        success: false,
        message: "customerName es obligatorio"
      })
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "email no es válido"
      })
    }

    if (!message || message.length < 10) {
      return res.status(400).json({
        success: false,
        message: "message debe tener al menos 10 caracteres"
      })
    }

    const payload = {
      customerName,
      email,
      premiumType,
      productName: config.productName,
      message,
      source: sanitize(req.body.source || "railway-premium-form"),
      formVersion: sanitize(req.body.formVersion || "v1"),
      pageUrl: sanitize(req.body.pageUrl || ""),
      userAgent: sanitize(req.body.userAgent || req.headers["user-agent"] || ""),
      submittedAt: req.body.submittedAt || new Date().toISOString(),
      receivedAt: new Date().toISOString()
    }

    console.log("🔥 PREMIUM FORM DATA:", payload)

    let savedToSheets = false
    let emailSent = false
    let sheetsError = null
    let emailError = null

    try {
      await saveLeadToSheets(payload)
      savedToSheets = true
    } catch (err) {
      sheetsError = err.message
      console.error("❌ SHEETS ERROR:", err.message)
    }

    try {
      await sendPremiumEmail({
        to: email,
        name: customerName,
        type: premiumType
      })
      emailSent = true
    } catch (err) {
      emailError = err.message
      console.error("❌ EMAIL ERROR:", err.message)
    }

    if (!savedToSheets && !emailSent) {
      return res.status(500).json({
        success: false,
        message: "No se pudo guardar ni enviar el email",
        savedToSheets,
        emailSent,
        sheetsError,
        emailError
      })
    }

    return res.status(200).json({
      success: true,
      message: "Consulta registrada correctamente",
      savedToSheets,
      emailSent,
      sheetsError,
      emailError
    })
  } catch (err) {
    console.error("❌ PREMIUM API ERROR:", err)
    return res.status(500).json({
      success: false,
      message: err.message || "Error interno del servidor"
    })
  }
})

// ==============================
// TEST EMAIL
// ==============================

app.get("/test-email", async (req, res) => {
  try {
    const result = await sendPremiumEmail({
      to: "bgarciarodriguez3@gmail.com",
      name: "Miriam",
      type: "mentoria"
    })

    res.status(200).json({
      success: true,
      message: "Email enviado",
      result
    })
  } catch (err) {
    console.error("❌ TEST EMAIL ERROR:", err)
    res.status(500).json({
      success: false,
      message: err.message
    })
  }
})

// ==============================
// ROOT
// ==============================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "form-premium.html"))
})

// ==============================
// START
// ==============================

const PORT = process.env.PORT || 8080

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Premium server running on", PORT)
})
