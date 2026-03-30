require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const { Resend } = require("resend")

const app = express()
const resend = new Resend(process.env.RESEND_API_KEY)

const INTERNAL_EMAIL = "contactopremium@eltarotdelaruedadelafortuna.com"

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbx1pGPa9aI15JAdPG1n4UMhPduLUY5u407NKzuV9VicwqNYXdd9rN403t6uwHNCFYf1/exec"

// ==============================
// CONFIG PRODUCTOS PREMIUM
// ==============================

const PREMIUM_PRODUCTS = {
  "10496141754705": {
    name: "Tu Camino, Tu Destino y Tus Decisiones – Mentoría",
    type: "camino_destino_decisiones",
    formUrl:
      "https://docs.google.com/forms/d/e/1FAIpQLSfdbkM9YVksES5t_LcbshESiNpzbpuFIGRcGLayIHAJzT7wig/viewform"
  },
  "10523108966737": {
    name: "Claridad en tus Relaciones y tu Camino Sentimental",
    type: "relaciones_sentimental",
    formUrl:
      "https://docs.google.com/forms/d/e/1FAIpQLSdSVenjU1wO7Pt3eC6jfX9gKWoAFA427B8fZzW8L7t2nOzUsA/viewform"
  },
  "10667662606673": {
    name: "Nuevos Comienzos, Liderazgo y Economía Personal – Consulta Premium",
    type: "liderazgo_economia_personal",
    formUrl:
      "https://docs.google.com/forms/d/e/1FAIpQLSeKjcH-DDTdU7R7f_r7sCtkjPsnqnwfKyIQOCuFtgIOEjHWLg/viewform"
  }
}

// ==============================
// MIDDLEWARES
// ==============================

app.use(cors())

app.get("/favicon.ico", (_req, res) => {
  res.status(204).end()
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
    headers: { "Content-Type": "application/json" },
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

  if (result?.error) throw new Error(result.error.message)
}

// ==============================
// ROUTES
// ==============================

app.use(express.json())

app.post("/api/premium/form-submitted", async (req, res) => {
  try {
    const payload = req.body

    await saveToGoogleSheets(payload)
    await sendAccessEmail(payload)

    return res.json({ ok: true })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ ok: false })
  }
})

// ==============================
// START SERVER
// ==============================

const PORT = process.env.PORT || 8080

app.listen(PORT, () => {
  console.log("premium server running on port", PORT)
})
