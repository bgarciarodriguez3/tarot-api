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

app.use(cors())
app.use(express.json())
app.use("/api/shopify/order-paid", express.raw({ type: "application/json" }))

/* ---------------- PRODUCTOS ---------------- */

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

/* ---------------- MEMORIA LECTURAS ---------------- */

const readings = new Map()

function generateKey(orderId, lineItemId, productId) {
  return `${orderId}-${lineItemId}-${productId}`
}

/* ---------------- CARTAS ALEATORIAS ---------------- */

function randomCards(deckSize, spread) {

  const numbers = Array.from({ length: deckSize }, (_, i) => i + 1)

  const cards = []

  while (cards.length < spread) {

    const index = Math.floor(Math.random() * numbers.length)

    cards.push(numbers.splice(index, 1)[0])

  }

  return cards

}

/* ---------------- VERIFICACIÓN SHOPIFY ---------------- */

function verifyShopify(req) {

  const hmac = req.get("X-Shopify-Hmac-Sha256")

  if (!hmac) return false

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

/* ---------------- CARGAR MAZO ---------------- */

function loadDeck(deckName) {

  const filePath = path.join(__dirname, "data", "decks", `${deckName}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el mazo: ${deckName}`)
  }

  const raw = fs.readFileSync(filePath, "utf8")

  return JSON.parse(raw)

}

/* ---------------- OBTENER CARTAS ---------------- */

function getCardsData(deckName, ids) {

  const deck = loadDeck(deckName)

  return ids
    .map(id => deck.cards.find(card => Number(card.id) === Number(id)))
    .filter(Boolean)

}

/* ---------------- ESTILO IA ---------------- */

function randomStyle(deck) {

  const styles = {

    arcanos_mayores: [
      "místico",
      "profundo",
      "espiritual",
      "simbólico"
    ],

    semilla_estelar: [
      "cósmico",
      "luminoso",
      "estelar",
      "expansivo"
    ],

    angeles: [
      "amoroso",
      "sanador",
      "angelical",
      "suave"
    ]

  }

  const arr = styles[deck] || ["espiritual"]

  return arr[Math.floor(Math.random() * arr.length)]

}

/* ---------------- GENERAR LECTURA IA ---------------- */

async function generateAIReading(productName, deck, spread, cardsData) {

  const style = randomStyle(deck)

  const cardsText = cardsData.map(c => `
Carta: ${c.name}
Significado: ${c.significado_general || ""}
Amor: ${c.amor || ""}
Trabajo: ${c.trabajo_proposito || ""}
Consejo: ${c.consejo_espiritual || ""}
`).join("\n")

  const prompt = `
Eres una tarotista espiritual profesional.

Producto: ${productName}
Cartas: ${spread}
Mazo: ${deck}
Estilo: ${style}

Cartas obtenidas:
${cardsText}

Escribe una interpretación espiritual cálida y profunda en español.
No uses listas.
`

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: prompt
  })

  return response.output_text

}

/* ---------------- RUTA PRINCIPAL (EVITA ERROR 502) ---------------- */

app.get("/", (req, res) => {

  res.json({
    ok: true,
    service: "tarot-api"
  })

})

/* ---------------- SESIÓN FRONTEND ---------------- */

app.post("/api/session", (req, res) => {

  const { productId } = req.body

  const config = PRODUCTS[String(productId)]

  if (!config) {

    return res.status(400).json({
      ok: false
    })

  }

  res.json({
    ok: true,
    spread: config.spread,
    deck: config.deck,
    deckSize: config.deckSize
  })

})

/* ---------------- RESULTADO LECTURA ---------------- */

app.post("/api/reading/result", async (req, res) => {

  try {

    const { orderId, lineItemId, productId, email } = req.body

    const config = PRODUCTS[String(productId)]

    if (!config) {
      return res.status(400).json({ ok: false })
    }

    const key = generateKey(orderId, lineItemId, productId)

    if (readings.has(key)) {

      return res.json({
        ok: true,
        repeated: true,
        reading: readings.get(key)
      })

    }

    const cards = randomCards(config.deckSize, config.spread)

    const cardsData = getCardsData(config.deck, cards)

    const interpretation = await generateAIReading(
      config.name,
      config.deck,
      config.spread,
      cardsData
    )

    const reading = {
      key,
      email,
      productId,
      product: config.name,
      deck: config.deck,
      cards,
      interpretation
    }

    readings.set(key, reading)

    res.json({
      ok: true,
      reading
    })

  } catch (error) {

    console.error(error)

    res.status(500).json({
      ok: false,
      error: error.message
    })

  }

})

/* ---------------- ENVÍO EMAIL ---------------- */

app.post("/api/reading/email", async (req, res) => {

  const { key } = req.body

  const reading = readings.get(key)

  if (!reading) {

    return res.status(404).json({
      ok: false
    })

  }

  if (reading.sent) {

    return res.json({
      ok: true,
      already: true
    })

  }

  await resend.emails.send({

    from: process.env.RESEND_FROM_EMAIL,

    to: reading.email,

    subject: "Tu lectura de tarot",

    html: `
    <h2>${reading.product}</h2>
    <p><strong>Cartas:</strong> ${reading.cards.join(", ")}</p>
    <hr>
    <p style="white-space:pre-line;">${reading.interpretation}</p>
    `

  })

  reading.sent = true

  res.json({ ok: true })

})

/* ---------------- WEBHOOK SHOPIFY ---------------- */

app.post("/api/shopify/order-paid", async (req, res) => {

  try {

    if (!verifyShopify(req)) {

      return res.status(401).send("invalid")

    }

    const order = JSON.parse(req.body.toString())

    const email = order.email

    for (const item of order.line_items) {

      const productId = String(item.product_id)

      const config = PRODUCTS[productId]

      if (!config) continue

      const key = generateKey(order.id, item.id, productId)

      if (readings.has(key)) continue

      const cards = randomCards(config.deckSize, config.spread)

      const cardsData = getCardsData(config.deck, cards)

      const interpretation = await generateAIReading(
        config.name,
        config.deck,
        config.spread,
        cardsData
      )

      const reading = {
        key,
        email,
        productId,
        product: config.name,
        deck: config.deck,
        cards,
        interpretation
      }

      readings.set(key, reading)

      await resend.emails.send({

        from: process.env.RESEND_FROM_EMAIL,

        to: email,

        subject: "Tu lectura de tarot",

        html: `
        <h2>${config.name}</h2>
        <p><strong>Cartas:</strong> ${cards.join(", ")}</p>
        <hr>
        <p style="white-space:pre-line;">${interpretation}</p>
        `

      })

    }

    res.json({ ok: true })

  } catch (error) {

    console.error(error)

    res.status(500).json({
      ok: false
    })

  }

})

/* ---------------- SERVER ---------------- */

const PORT = Number(process.env.PORT) || 8080

app.listen(PORT, "0.0.0.0", () => {

  console.log(`server running on port ${PORT}`)

})
