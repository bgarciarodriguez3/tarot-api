require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const fs = require("fs")
const path = require("path")
const { Resend } = require("resend")
const OpenAI = require("openai")

const app = express()

const resend = new Resend(process.env.RESEND_API_KEY)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

/* ---------------- MIDDLEWARE ---------------- */

app.use(cors())
app.use("/api/shopify/order-paid", express.raw({ type: "application/json" }))
app.use(express.json())

/* ---------------- CONFIG ---------------- */

const STORE_URL = process.env.STORE_URL || "https://eltarotdelaruedadelafortuna.com"

const PRODUCTS = {
  "10496012616017": {
    name: "Mensaje de los Ángeles",
    deck: "angeles",
    spread: 4,
    deckSize: 12
  },

  "10495993446737": {
    name: "Camino de la Semilla Estelar",
    deck: "semilla_estelar",
    spread: 5,
    deckSize: 22
  },

  "10493383082321": {
    name: "Lectura Profunda: Análisis Completo",
    deck: "arcanos_mayores",
    spread: 12,
    deckSize: 22
  },

  "10493369745745": {
    name: "Tres Puertas del Destino",
    deck: "arcanos_mayores",
    spread: 3,
    deckSize: 22
  }
}

/* ---------------- ALMACÉN TEMPORAL ---------------- */
/* NOTA: esto se pierde si Railway reinicia. Luego lo pasamos a Redis. */

const readings = new Map()

/* ---------------- UTILIDADES ---------------- */

function generateKey(orderId, lineItemId, productId) {
  return `${orderId}-${lineItemId}-${productId}`
}

function randomCards(deckSize, spread) {
  const numbers = Array.from({ length: deckSize }, (_, i) => i + 1)
  const cards = []

  while (cards.length < spread) {
    const index = Math.floor(Math.random() * numbers.length)
    cards.push(numbers.splice(index, 1)[0])
  }

  return cards
}

function verifyShopify(req) {
  const hmac = req.get("X-Shopify-Hmac-Sha256")

  if (!hmac) return false
  if (!Buffer.isBuffer(req.body)) return false

  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET || "")
    .update(req.body)
    .digest("base64")

  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(digest))
  } catch {
    return false
  }
}

function loadDeck(deckName) {
  const filePath = path.join(__dirname, "data", "decks", `${deckName}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el mazo: ${deckName}`)
  }

  const raw = fs.readFileSync(filePath, "utf8")
  return JSON.parse(raw)
}

function getCardsData(deckName, ids) {
  const deck = loadDeck(deckName)

  if (!deck.cards || !Array.isArray(deck.cards)) {
    throw new Error(`El mazo ${deckName} no tiene cards válido`)
  }

  return ids
    .map(id => deck.cards.find(card => Number(card.id) === Number(id)))
    .filter(Boolean)
}

function randomStyle(deck) {
  const styles = {
    arcanos_mayores: ["místico", "profundo", "espiritual", "simbólico"],
    semilla_estelar: ["cósmico", "luminoso", "estelar", "expansivo"],
    angeles: ["amoroso", "sanador", "angelical", "suave"]
  }

  const arr = styles[deck] || ["espiritual"]
  return arr[Math.floor(Math.random() * arr.length)]
}

function readingUrl(key) {
  return `${STORE_URL}/pages/lectura?token=${encodeURIComponent(key)}`
}

function buildEmailHtml(reading) {
  const url = readingUrl(reading.key)

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.7;color:#222;max-width:700px;margin:0 auto;padding:24px;">
      <h2 style="margin-bottom:8px;">${reading.product}</h2>
      <p style="margin-top:0;">Tu lectura ya está disponible.</p>

      <p style="margin:24px 0;">
        <a
          href="${url}"
          style="display:inline-block;background:#b08d57;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:8px;font-weight:bold;"
        >
          Acceder a tu lectura
        </a>
      </p>

      <p><strong>Cartas:</strong> ${reading.cards.join(", ")}</p>
      <hr style="margin:24px 0;border:none;border-top:1px solid #ddd;" />
      <div style="white-space:pre-line;">${reading.interpretation}</div>
    </div>
  `
}

async function sendReadingEmail(reading) {
  if (!reading.email) {
    throw new Error("La lectura no tiene email")
  }

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: reading.email,
    subject: `Tu lectura está lista: ${reading.product}`,
    html: buildEmailHtml(reading)
  })

  reading.sent = true
  readings.set(reading.key, reading)
}

async function generateAIReading(productName, deck, spread, cardsData) {
  const style = randomStyle(deck)

  const cardsText = cardsData.map(c => `
Carta: ${c.name || ""}
Significado general: ${c.significado_general || ""}
Amor: ${c.amor || ""}
Trabajo o propósito: ${c.trabajo_proposito || ""}
Consejo espiritual: ${c.consejo_espiritual || ""}
Invertida: ${c.invertida || ""}
`).join("\n")

  const prompt = `
Eres una tarotista espiritual profesional.

Debes escribir una interpretación ORIGINAL en español.

Producto: ${productName}
Cantidad de cartas: ${spread}
Mazo: ${deck}
Estilo: ${style}

Información base de las cartas:
${cardsText}

Escribe una lectura espiritual cálida, profunda, humana y bien redactada.
No uses listas.
No repitas frases hechas.
Haz que suene personalizada.
Incluye una introducción breve, desarrollo y cierre.
`

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: prompt
  })

  return (response.output_text || "").trim()
}

async function createReading({ orderId, lineItemId, productId, email }) {
  const config = PRODUCTS[String(productId)]

  if (!config) {
    throw new Error("Producto no configurado")
  }

  const key = generateKey(orderId, lineItemId, productId)

  if (readings.has(key)) {
    return {
      repeated: true,
      reading: readings.get(key)
    }
  }

  const cards = randomCards(config.deckSize, config.spread)
  const cardsData = getCardsData(config.deck, cards)

  if (cardsData.length !== config.spread) {
    throw new Error(`No se pudieron cargar todas las cartas del mazo ${config.deck}`)
  }

  const interpretation = await generateAIReading(
    config.name,
    config.deck,
    config.spread,
    cardsData
  )

  const reading = {
    key,
    orderId: String(orderId),
    lineItemId: String(lineItemId),
    productId: String(productId),
    product: config.name,
    deck: config.deck,
    spread: config.spread,
    email: email || "",
    cards,
    cardsData,
    interpretation,
    sent: false,
    createdAt: new Date().toISOString()
  }

  readings.set(key, reading)

  return {
    repeated: false,
    reading
  }
}

/* ---------------- RUTAS BASE ---------------- */

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "tarot-api"
  })
})

app.get("/api/health", (req, res) => {
  res.json({
    ok: true
  })
})

/* ---------------- SESSION ---------------- */

app.post("/api/session", (req, res) => {
  try {
    const { productId } = req.body
    const config = PRODUCTS[String(productId)]

    if (!config) {
      return res.status(400).json({
        ok: false,
        error: "Producto no configurado"
      })
    }

    return res.json({
      ok: true,
      spread: config.spread,
      deck: config.deck,
      deckSize: config.deckSize,
      productName: config.name
    })
  } catch (error) {
    console.error("SESSION ERROR:", error)
    return res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

/* ---------------- CREAR LECTURA MANUAL ---------------- */

app.post("/api/reading/result", async (req, res) => {
  try {
    const { orderId, lineItemId, productId, email } = req.body

    if (!orderId || !lineItemId || !productId) {
      return res.status(400).json({
        ok: false,
        error: "Faltan datos obligatorios"
      })
    }

    const result = await createReading({
      orderId: String(orderId),
      lineItemId: String(lineItemId),
      productId: String(productId),
      email: email || ""
    })

    return res.json({
      ok: true,
      repeated: result.repeated,
      reading: result.reading
    })
  } catch (error) {
    console.error("READING RESULT ERROR:", error)
    return res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

/* ---------------- RECUPERAR LECTURA POR TOKEN ---------------- */

app.get("/api/reading/result", (req, res) => {
  try {
    const { token } = req.query

    if (!token) {
      return res.status(400).json({
        ok: false,
        error: "Falta token"
      })
    }

    const reading = readings.get(String(token))

    if (!reading) {
      return res.status(404).json({
        ok: false,
        error: "Lectura no encontrada"
      })
    }

    return res.json({
      ok: true,
      reading
    })
  } catch (error) {
    console.error("READING GET ERROR:", error)
    return res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

/* ---------------- ENVIAR EMAIL MANUAL ---------------- */

app.post("/api/reading/email", async (req, res) => {
  try {
    const { key } = req.body
    const reading = readings.get(String(key))

    if (!reading) {
      return res.status(404).json({
        ok: false,
        error: "Lectura no encontrada"
      })
    }

    if (reading.sent) {
      return res.json({
        ok: true,
        already: true
      })
    }

    await sendReadingEmail(reading)

    return res.json({
      ok: true
    })
  } catch (error) {
    console.error("READING EMAIL ERROR:", error)
    return res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

/* ---------------- WEBHOOK SHOPIFY ---------------- */

app.post("/api/shopify/order-paid", async (req, res) => {
  try {
    if (!verifyShopify(req)) {
      return res.status(401).send("invalid")
    }

    const order = JSON.parse(req.body.toString("utf8"))
    const email = order.email || order.contact_email || ""

    for (const item of order.line_items || []) {
      const productId = String(item.product_id)
      const config = PRODUCTS[productId]

      if (!config) continue

      const result = await createReading({
        orderId: String(order.id),
        lineItemId: String(item.id),
        productId,
        email
      })

      const reading = result.reading

      if (!reading.sent && reading.email) {
        await sendReadingEmail(reading)
      }
    }

    return res.status(200).json({
      ok: true
    })
  } catch (error) {
    console.error("SHOPIFY ORDER PAID ERROR:", error)
    return res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

/* ---------------- SERVER ---------------- */

const PORT = Number(process.env.PORT) || 8080

app.listen(PORT, "0.0.0.0", () => {
  console.log(`server running on port ${PORT}`)
})
