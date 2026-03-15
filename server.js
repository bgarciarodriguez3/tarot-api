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

// IMPORTANTE:
// esta ruta necesita raw body para verificar HMAC de Shopify
app.use("/api/shopify/order-paid", express.raw({ type: "application/json" }))

// el resto de rutas usan JSON normal
app.use(express.json())

const STORE_URL =
  process.env.STORE_URL || "https://eltarotdelaruedadelafortuna.com"

const PRODUCTS = {
  "10496012616017": {
    name: "Mensaje de los Ángeles",
    deck: "angeles",
    spread: 4
  },
  "10495993446737": {
    name: "Camino de la Semilla Estelar",
    deck: "semilla_estelar",
    spread: 5
  },
  "10493383082321": {
    name: "Lectura Profunda: Análisis Completo",
    deck: "arcanos_mayores",
    spread: 12
  },
  "10493369745745": {
    name: "Tres Puertas del Destino",
    deck: "arcanos_mayores",
    spread: 3
  }
}

// OJO: esto es memoria temporal.
// Si Railway reinicia, se pierde.
// Para pruebas vale, pero luego habrá que moverlo a base de datos.
const readings = new Map()
const decksCache = new Map()

function generateKey(orderId, lineItemId, productId) {
  return `${orderId}-${lineItemId}-${productId}`
}

function verifyShopify(req) {
  const hmac = req.get("X-Shopify-Hmac-Sha256")

  if (!hmac) {
    console.error("SHOPIFY HMAC ERROR: falta header X-Shopify-Hmac-Sha256")
    return false
  }

  if (!Buffer.isBuffer(req.body)) {
    console.error("SHOPIFY HMAC ERROR: req.body no es Buffer")
    return false
  }

  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || ""

  const digest = crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest("base64")

  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(digest))
  } catch (error) {
    console.error("SHOPIFY HMAC ERROR:", error)
    return false
  }
}

function loadDeck(deckName) {
  if (decksCache.has(deckName)) {
    return decksCache.get(deckName)
  }

  const filePath = path.join(__dirname, "data", "decks", `${deckName}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el mazo: ${deckName} en ${filePath}`)
  }

  const raw = fs.readFileSync(filePath, "utf8")
  const parsed = JSON.parse(raw)

  if (!parsed.cards || !Array.isArray(parsed.cards)) {
    throw new Error(`El mazo ${deckName} no tiene un campo cards válido`)
  }

  decksCache.set(deckName, parsed)
  return parsed
}

function shuffleArray(array) {
  const arr = [...array]

  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }

  return arr
}

function pickRandomCards(deckName, spread) {
  const deck = loadDeck(deckName)

  if (deck.cards.length < spread) {
    throw new Error(
      `El mazo ${deckName} no tiene suficientes cartas. Tiene ${deck.cards.length} y necesitas ${spread}`
    )
  }

  return shuffleArray(deck.cards).slice(0, spread)
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

  const cardsNames = (reading.cardsData || [])
    .map(card => card.name || card.nombre || card.id || "Carta")
    .join(", ")

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

      <p><strong>Cartas:</strong> ${cardsNames}</p>
      <hr style="margin:24px 0;border:none;border-top:1px solid #ddd;" />
      <div style="white-space:pre-line;">${reading.interpretation}</div>
    </div>
  `
}

async function sendReadingEmail(reading) {
  if (!reading.email) {
    throw new Error("La lectura no tiene email")
  }

  console.log("RESEND: enviando email a", reading.email)

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: reading.email,
    subject: `Tu lectura está lista: ${reading.product}`,
    html: buildEmailHtml(reading)
  })

  console.log("RESEND OK:", result)

  reading.sent = true
  readings.set(reading.key, reading)

  return result
}

function getCardField(card, possibleKeys) {
  for (const key of possibleKeys) {
    if (card[key] !== undefined && card[key] !== null && String(card[key]).trim() !== "") {
      return String(card[key]).trim()
    }
  }
  return ""
}

async function generateAIReading(productName, deck, spread, cardsData) {
  const style = randomStyle(deck)

  const cardsText = cardsData
    .map((c, index) => {
      const cardName = getCardField(c, ["name", "nombre", "title", "id"])
      const general = getCardField(c, [
        "significado_general",
        "meaning_general",
        "descripcion",
        "description",
        "general"
      ])
      const love = getCardField(c, ["amor", "love"])
      const work = getCardField(c, ["trabajo_proposito", "trabajo", "work", "purpose"])
      const advice = getCardField(c, [
        "consejo_espiritual",
        "spiritual_advice",
        "consejo",
        "advice"
      ])
      const reversed = getCardField(c, ["invertida", "reversed"])

      return `
Carta ${index + 1}: ${cardName}
Significado general: ${general}
Amor: ${love}
Trabajo o propósito: ${work}
Consejo espiritual: ${advice}
Invertida: ${reversed}
`
    })
    .join("\n")

  const prompt = `
Eres una tarotista espiritual profesional.

Debes escribir una interpretación ORIGINAL en español.

Producto: ${productName}
Cantidad de cartas: ${spread}
Mazo: ${deck}
Estilo: ${style}

Información base de las cartas:
${cardsText}

Instrucciones:
- Escribe una lectura espiritual cálida, profunda y humana.
- No uses listas ni numeración.
- No repitas frases hechas.
- Haz que suene personalizada.
- Incluye una introducción breve, desarrollo y cierre.
- Usa la información base sin copiarla literalmente.
- No inventes cartas que no estén aquí.
`

  console.log("OPENAI: generando lectura para", productName)

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: prompt
  })

  const text = (response.output_text || "").trim()

  if (!text) {
    throw new Error("OpenAI devolvió una respuesta vacía")
  }

  console.log("OPENAI OK: lectura generada")

  return text
}

function findProductConfigFromLineItem(item) {
  const productId = item?.product_id ? String(item.product_id) : null
  const variantId = item?.variant_id ? String(item.variant_id) : null

  if (productId && PRODUCTS[productId]) {
    return { productId, config: PRODUCTS[productId], matchedBy: "product_id" }
  }

  if (variantId && PRODUCTS[variantId]) {
    return { productId: variantId, config: PRODUCTS[variantId], matchedBy: "variant_id" }
  }

  return null
}

async function createReading({ orderId, lineItemId, productId, email }) {
  const config = PRODUCTS[String(productId)]

  if (!config) {
    throw new Error(`Producto no configurado: ${productId}`)
  }

  const key = generateKey(orderId, lineItemId, productId)

  if (readings.has(key)) {
    console.log("READING: ya existía", key)
    return {
      repeated: true,
      reading: readings.get(key)
    }
  }

  const cardsData = pickRandomCards(config.deck, config.spread)

  if (cardsData.length !== config.spread) {
    throw new Error(`No se pudieron seleccionar todas las cartas del mazo ${config.deck}`)
  }

  const cards = cardsData.map(card => card.id || card.name || card.nombre || "sin_id")

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

  console.log("READING OK:", {
    key,
    product: reading.product,
    email: reading.email,
    cards: reading.cards
  })

  return {
    repeated: false,
    reading
  }
}

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

app.post("/api/reading/result", async (req, res) => {
  try {
    const { orderId, lineItemId, productId, email } = req.body

    console.log("POST /api/reading/result BODY:", req.body)

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

app.post("/api/shopify/order-paid", async (req, res) => {
  try {
    console.log("=== WEBHOOK SHOPIFY RECIBIDO ===")
    console.log("Headers Shopify:", req.headers)

    if (!verifyShopify(req)) {
      console.error("SHOPIFY WEBHOOK INVALID HMAC")
      return res.status(401).send("invalid")
    }

    const order = JSON.parse(req.body.toString("utf8"))

    console.log("Body del pedido:", JSON.stringify(order, null, 2))

    const email = order.email || order.contact_email || ""
    const financialStatus = String(order.financial_status || "").toLowerCase()

    console.log("ORDER INFO:", {
      orderId: order.id,
      orderName: order.name,
      email,
      financialStatus,
      itemsCount: Array.isArray(order.line_items) ? order.line_items.length : 0
    })

    if (financialStatus !== "paid") {
      console.log("Pedido recibido pero no pagado todavía:", {
        orderId: order.id,
        financialStatus
      })

      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "order_not_paid"
      })
    }

    let processedCount = 0

    for (const item of order.line_items || []) {
      console.log("LINE ITEM:", {
        id: item.id,
        title: item.title,
        product_id: item.product_id,
        variant_id: item.variant_id,
        sku: item.sku,
        quantity: item.quantity
      })

      const found = findProductConfigFromLineItem(item)

      if (!found) {
        console.log("Producto no configurado para este item:", {
          title: item.title,
          product_id: item.product_id,
          variant_id: item.variant_id,
          configuredProductKeys: Object.keys(PRODUCTS)
        })
        continue
      }

      console.log("Producto detectado:", {
        matchedBy: found.matchedBy,
        productId: found.productId,
        productName: found.config.name
      })

      const result = await createReading({
        orderId: String(order.id),
        lineItemId: String(item.id),
        productId: found.productId,
        email
      })

      const reading = result.reading

      if (!reading.sent && reading.email) {
        await sendReadingEmail(reading)
      } else {
        console.log("Email no enviado:", {
          sent: reading.sent,
          hasEmail: Boolean(reading.email)
        })
      }

      processedCount += 1
    }

    console.log("WEBHOOK SHOPIFY OK:", {
      orderId: order.id,
      processedCount
    })

    return res.status(200).json({
      ok: true,
      processedCount
    })
  } catch (error) {
    console.error("SHOPIFY ORDER PAID ERROR:", error)
    return res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

const PORT = Number(process.env.PORT) || 8080

app.listen(PORT, "0.0.0.0", () => {
  console.log(`server running on port ${PORT}`)
})
