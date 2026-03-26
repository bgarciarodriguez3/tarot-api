const express = require("express")
const fetch = require("node-fetch")
const nodemailer = require("nodemailer")

const app = express()
app.use(express.json())

// ==============================
// CONFIG
// ==============================

const PORT = process.env.PORT || 8080

// 👉 TU GOOGLE SCRIPT
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby2K07SGICgJZ0JzxbmMz3LMrTBnb3PN6MvXVyA88FWLiNXMaM-OCK__oA6bMRUC032/exec"

// 👉 FORMULARIO (puedes cambiar dinámico después)
const FORM_URL = "https://forms.gle/UFFju3qX5tKaatkQ6"

// 👉 EMAIL CONFIG (GMAIL)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

// ==============================
// HEALTH CHECK
// ==============================

app.get("/", (req, res) => {
  res.send("premium vivo 🚀")
})

// ==============================
// ENVÍO FORMULARIO (CORE)
// ==============================

app.post("/api/premium/form-submitted", async (req, res) => {
  try {
    const { productName, premiumType, email } = req.body

    if (!email) {
      return res.status(400).json({ error: "Email requerido" })
    }

    // ==========================
    // 1. ENVIAR A GOOGLE SHEETS
    // ==========================
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        productName,
        premiumType,
        status: "Pendiente",
        timestamp: new Date().toISOString()
      })
    })

    // ==========================
    // 2. EMAIL PREMIUM (🔥 BOTÓN)
    // ==========================

    const htmlEmail = `
      <h2 style="text-align:center;">Tu Consulta Premium: siguiente paso</h2>

      <p>Gracias de corazón 💙 por confiar en nosotros.</p>

      <p>
      Para comenzar tu análisis necesitamos que completes el formulario.
      En cuanto lo recibamos, empezaremos tu consulta personalizada.
      </p>

      <div style="text-align:center; margin:40px 0;">
        <a href="${FORM_URL}"
           style="
             background: linear-gradient(135deg, #d4af37, #f5d06f);
             color: #000;
             padding: 20px 40px;
             font-size: 20px;
             font-weight: bold;
             text-decoration: none;
             border-radius: 14px;
             display: inline-block;
             box-shadow: 0 6px 20px rgba(0,0,0,0.3);
           ">
           ✨ COMPLETAR FORMULARIO PREMIUM ✨
        </a>
      </div>

      <p style="text-align:center;">
      Recibirás tu mentoría en un plazo máximo de <b>48 horas</b>.
      </p>

      <p style="text-align:center;">
      Un fuerte abrazo,<br>
      Equipo Premium Tarot
      </p>
    `

    await transporter.sendMail({
      from: `"Tarot Premium" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "✨ Completa tu consulta Premium",
      html: htmlEmail
    })

    // ==========================
    // 3. RESPUESTA API
    // ==========================
    res.json({ ok: true })

  } catch (err) {
    console.error("ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

// ==============================
// START SERVER
// ==============================

app.listen(PORT, "0.0.0.0", () => {
  console.log("🔥 Premium server corriendo en puerto", PORT)
})
