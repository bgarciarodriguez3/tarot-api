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
app.use("/api/shopify/order-paid", express.raw({ type: "application/json" }))
app.use(express.json())

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

const readings = new Map()

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

  if (!hmac) {
    return false
  }

  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(req.body)
    .digest("base64")

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmac),
      Buffer.from(digest)
    )
  } catch (error) {
    return false
  }
}

function loadDeck(deckName) {
  const filePath = path.join(__dirname, "data", `${deckName}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el archivo del mazo: ${deckName}.json`)
  }

  const raw = fs.readFileSync(filePath, "utf8")
  return JSON.parse(raw)
}

function getCardsData(deckName, selectedIds) {
  const deck = loadDeck(deckName)

  if (!deck.cards || !Array.isArray(deck.cards)) {
    throw new Error(`El mazo ${deckName} no tiene un array válido de cards`)
  }

  return selectedIds
    .map((id) => deck.cards.find((card) => Number(card.id) === Number(id)))
    .filter(Boolean)
}

function getRandomStyle(deckName) {
  const stylesByDeck = {
    arcanos_mayores: [
      "místico y profundo",
      "intuitivo y simbólico",
      "espiritual y revelador",
      "sereno y transformador"
    ],
    semilla_estelar: [
      "cósmico y luminoso",
      "espiritual y suave",
      "íntimo y expansivo",
      "poético y estelar"
    ],
    angeles: [
      "amoroso y canalizado",
      "suave y sanador",
      "luminoso y compasivo",
      "angelical y reconfortante"
    ]
  }

  const styles = stylesByDeck[deckName] || [
    "espiritual y cálido",
    "místico y humano"
  ]

  return styles[Math.floor(Math.random() * styles.length)]
}

function normalizeCardForPrompt(deckName, card, index) {
  const baseLines = [
    `Carta ${index + 1}: ${card.name || ""}`
  ]

  if (card.subtitle) {
    baseLines.push(`Subtítulo: ${card.subtitle}`)
  }

  if (Array.isArray(card.keywords) && card.keywords.length > 0) {
    baseLines.push(`Palabras clave: ${card.keywords.join(", ")}`)
  }

  if (card.significado_general) {
    baseLines.push(`Significado general: ${card.significado_general}`)
  }

  if (Array.isArray(card.psicologico) && card.psicologico.length > 0) {
    baseLines.push(`Psicológico: ${card.psicologico.join(", ")}`)
  }

  if (card.amor) {
    baseLines.push(`Amor: ${card.amor}`)
  }

  if (card.trabajo_proposito) {
    baseLines.push(`Trabajo o propósito: ${card.trabajo_proposito}`)
  }

  if (card.consejo_espiritual) {
    baseLines.push(`Consejo espiritual: ${card.consejo_espiritual}`)
  }

  if (card.consejo_corazon) {
    baseLines.push(`Consejo del corazón: ${card.consejo_corazon}`)
  }

  if (card.consejo_estelar) {
    baseLines.push(`Consejo estelar: ${card.consejo_estelar}`)
  }

  if (card.consejo_angelical) {
    baseLines.push(`Consejo angelical: ${card.consejo_angelical}`)
  }

  if (card.afirmacion) {
    baseLines.push(`Afirmación: ${card.afirmacion}`)
  }

  if (card.invertida) {
    baseLines.push(`Significado invertido: ${card.invertida}`)
  }

  if (card.energia) {
    baseLines.push(`Energía: ${card.energia}`)
  }

  if (card.elemento) {
    baseLines.push(`Elemento: ${card.elemento}`)
  }

  if (card.chakra) {
    baseLines.push(`Chakra: ${card.chakra}`)
  }

  if (card.vibracion) {
    baseLines.push(`Vibración: ${card.vibracion}`)
  }

  if (card.rayo) {
    baseLines.push(`Rayo: ${card.rayo}`)
  }

  if (card.numerologia !== undefined && card.numerologia !== null) {
    baseLines.push(`Numerología: ${card.numerologia}`)
  }

  return baseLines.join("\n")
}

async function generateAIReading({ productName, deckName, spreadCount, cardsData }) {
  const style = getRandomStyle(deckName)

  const cardsBlock = cardsData
    .map((card, index) => normalizeCardForPrompt(deckName, card, index))
    .join("\n\n")

  const deckContext = {
    arcanos_mayores: "Este mazo habla con profundidad simbólica, psicológica y espiritual.",
    semilla_estelar: "Este mazo habla desde la misión del alma, la memoria estelar y la expansión interior.",
    angeles: "Este mazo habla desde la guía angelical, la sanación del corazón y la luz espiritual."
  }

  const prompt = `
Eres una tarotista y canalizadora espiritual profesional.

Tu tarea es escribir una lectura ORIGINAL en español para una clienta de tarot.
La lectura debe sonar humana, elegante, cálida y profunda.
No uses frases genéricas vacías.
No repitas fórmulas hechas.
No inventes cartas que no aparecen.
No contradigas la información base de las cartas.
No pongas listas ni viñetas en la respuesta final.
No escribas títulos tipo "Carta 1", "Carta 2" en la respuesta final.
Haz que la lectura se sienta nueva y distinta.
Mantén coherencia real con el mazo.

Contexto del mazo:
${deckContext[deckName] || "Lectura espiritual e intuitiva."}

Producto:
${productName}

Cantidad de cartas:
${spreadCount}

Tono deseado:
${style}

Información base de las cartas:
${cardsBlock}

Escribe la respuesta en este formato:
- Un inicio breve y envolvente de 2 o 3 frases.
- Una interpretación completa de la tirada en varios párrafos fluidos.
- Un cierre final con orientación espiritual práctica.
`

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: prompt
  })

  return (response.output_text || "").trim()
}

function buildEmailHtml(reading) {
  return `
  <div style="font-family:Arial,sans-serif;line-height:1.7;color:#222;max-width:720px;margin:0 auto;padding:24px;">
    <h1 style="font-size:28px;margin-bottom:8px;">Tu lectura está lista</h1>
    <p style="margin-top:0;"><strong>${reading.product}</strong></p>
    <p><strong>Mazo:</strong> ${reading.deck}</p>
    <p><strong>Cartas:</strong> ${reading.cardNames.join(", ")}</p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #ddd;" />
    <div style="white-space:pre-line;font-size:16px;">${reading.interpretation}</div>
  </div>
  `
}

async function createReading(orderId, lineItemId, productId, email) {
  const config = PRODUCTS[productId]

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

  const interpretation = await generateAIReading({
    productName: config.name,
    deckName: config.deck,
    spreadCount: config.spread,
    cardsData
  })

  const reading = {
    key,
    email,
    productId,
    product: config.name,
    deck: config.deck,
    spread: config.spread,
    cards,
    cardNames: cardsData.map((card) => card.name),
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
    console.error("SESSION ERROR", error)
    return res.status(500).json({
      ok: false,
      error: "Error interno"
    })
  }
})

app.post("/api/reading/result", async (req, res) => {
  try {
    const { orderId, lineItemId, productId, email } = req.body
    const config = PRODUCTS[String(productId)]

    if (!orderId || !lineItemId || !productId) {
      return res.status(400).json({
        ok: false,
        error: "Faltan datos requeridos"
      })
    }

    if (!config) {
      return res.status(400).json({
        ok: false,
        error: "Producto inválido"
      })
    }

    const result = await createReading(
      String(orderId),
      String(lineItemId),
      String(productId),
      email || ""
    )

    return res.json({
      ok: true,
      repeated: result.repeated,
      reading: result.reading
    })
  } catch (error) {
    console.error("READING RESULT ERROR", error)
    return res.status(500).json({
      ok: false,
      error: error.message || "Error interno"
    })
  }
})

app.post("/api/reading/email", async (req, res) => {
  try {
    const { key } = req.body
    const reading = readings.get(key)

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

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: reading.email,
      subject: `Tu lectura está lista: ${reading.product}`,
      html: buildEmailHtml(reading)
    })

    reading.sent = true
    readings.set(key, reading)

    return res.json({
      ok: true
    })
  } catch (error) {
    console.error("READING EMAIL ERROR", error)
    return res.status(500).json({
      ok: false,
      error: error.message || "Error interno"
    })
  }
})

app.post("/api/shopify/order-paid", async (req, res) => {
  try {
    if (!verifyShopify(req)) {
      return res.status(401).send("invalid")
    }

    const order = JSON.parse(req.body.toString())
    const email = order.email || order.contact_email || ""

    for (const item of order.line_items || []) {
      const productId = String(item.product_id)
      const config = PRODUCTS[productId]

      if (!config) {
        continue
      }

      const result = await createReading(
        String(order.id),
        String(item.id),
        productId,
        email
      )

      const reading = result.reading

      if (!reading.sent && reading.email) {
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL,
          to: reading.email,
          subject: `Tu lectura está lista: ${reading.product}`,
          html: buildEmailHtml(reading)
        })

        reading.sent = true
        readings.set(reading.key, reading)
      }
    }

    return res.json({
      ok: true
    })
  } catch (error) {
    console.error("SHOPIFY WEBHOOK ERROR", error)
    return res.status(500).json({
      ok: false,
      error: error.message || "Error interno"
    })
  }
})

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "tarot-api"
  })
})

app.listen(process.env.PORT || 3000, () => {
  console.log("server running")
})
