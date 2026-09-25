require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const path = require("path")
const { Resend } = require("resend")

const app = express()
const resend = new Resend(process.env.RESEND_API_KEY)

const INTERNAL_EMAIL = "contactopremium@laruedadelafortuna.com"

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbx1pGPa9aI15JAdPG1n4UMhPduLUY5u407NKzuV9VicwqNYXdd9rN403t6uwHNCFYf1/exec"

// ==============================
// CONFIG PRODUCTOS PREMIUM
// ==============================

const PREMIUM_PRODUCTS = {
  "10496141754705": {
    name: "10 Preguntas Personalizadas",
    type: "claridad",
    formUrl: "https://forms.gle/pffMmjyoNVjE9B9N6"
  },
  "10523108966737": {
    name: "Amor Premium | Vídeo Personalizado",
    type: "amor",
    formUrl: "https://forms.gle/9dwtYvQvBw39tqCK8"
  },
  "10667662606673": {
    name: "Trabajo y Economía Premium | Vídeo Personalizado",
    type: "proposito",
    formUrl: "https://forms.gle/v25iecbR3KHKf7QZ8"
  }
}

// ==============================
// MIDDLEWARES
// ==============================

app.use(cors())
app.use(express.json())

app.get("/favicon.ico", (_req, res) => {
  res.status(204).end()
})

// ==============================
// FORMULARIO PREMIUM
// ==============================

// Abre el formulario directamente
app.get("/form-premium.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "form-premium.html"))
})

// Si alguien entra directamente en vip.eltarotdelaruedadelafortuna.com
// lo enviamos al formulario
app.get("/", (_req, res) => {
  res.redirect("/form-premium.html")
})

// ==============================
// HELPERS
// ==============================

function buildAccessEmailHtml(record) {
  return `
    <div style="margin:0;padding:0;background:#f6f1e7;">
      <div style="max-width:680px;margin:0 auto;padding:32px 18px;">
        <div style="background:#000;border-radius:999px;padding:2px;text-align:center;box-shadow:0 0 20px rgba(198,164,90,0.4);">

          <a href="${record.form_url}" 
             style="display:inline-block;
                    padding:16px 30px;
                    border-radius:999px;
                    background:#000;
                    color:#c6a45a;
                    font-weight:bold;
                    font-size:16px;
                    text-decoration:none;
                    letter-spacing:1px;
                    box-shadow:0 0 10px rgba(198,164,90,0.6), inset 0 0 6px rgba(198,164,90,0.3);">

            ✨ ACCEDE A TU DESTINO ✨
          </a>

        </div>
      </div>
    </div>
  `
}

// ==============================
// GOOGLE SHEETS
// ==============================

async function saveToGoogleSheets(payload) {
  if (!GOOGLE_SCRIPT_URL) return

  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    throw new Error(`Google Sheets HTTP ${response.status}`)
  }
}

// ==============================
// EMAILS
// ==============================

async function sendAccessEmail(record) {
  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: record.email,
    subject: "✨ Accede a tu destino",
    html: buildAccessEmailHtml(record)
  })

  if (result?.error) {
    throw new Error(result.error.message)
  }
}

// ==============================
// ROUTES API
// ==============================

app.post("/api/premium/form-submitted", async (req, res) => {
  try {
    const payload = req.body

    await saveToGoogleSheets(payload)
    await sendAccessEmail(payload)

    return res.status(200).json({
      ok: true
    })
  } catch (error) {
    console.error("ERROR PREMIUM:", error)

    return res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

// ==============================
// START SERVER
// ==============================

const PORT = process.env.PORT || 8080

app.listen(PORT, () => {
  console.log(`premium server running on port ${PORT}`)
})
