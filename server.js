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

const STORE_URL =
  process.env.STORE_URL || "https://eltarotdelaruedadelafortuna.com"

const PRODUCTS = {
  "10496012616017": {
    name: "Mensaje de los Ángeles",
    deck: "angeles",
    pick: 4,
    deckSize: 12
  },
  "10495993446737": {
    name: "Camino de la Semilla Estelar",
    deck: "semilla_estelar",
    pick: 5,
    deckSize: 22
  },
  "10493383082321": {
    name: "Lectura Profunda: Análisis Completo",
    deck: "arcanos_mayores",
    pick: 12,
    deckSize: 22
  },
  "10493369745745": {
    name: "Tres Puertas del Destino",
    deck: "arcanos_mayores",
    pick: 3,
    deckSize: 22
  }
}

const sessions = new Map()
const processedWebhooks = new Set()
const decksCache = new Map()

function generateToken(orderId, lineItemId, productId, unitIndex = 0) {
  return `${orderId}-${lineItemId}-${productId}-${unitIndex}`
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

  if (!Array.isArray(parsed.cards)) {
    throw new Error(`El mazo ${deckName} no tiene un campo cards válido`)
  }

  decksCache.set(deckName, parsed)
  return parsed
}

function getPublicDeck(deckName) {
  const deck = loadDeck(deckName)

  return {
    deck: deck.deck,
    title: deck.title,
    total_cards: deck.total_cards,
    color: deck.color || "#b08d57",
    cards: deck.cards.map((card) => ({
      id: card.id,
      name: card.name,
      image: card.image || ""
    }))
  }
}

function readingUrl(token) {
  return `${STORE_URL}/pages/lectura?token=${encodeURIComponent(token)}`
}

function buildAccessEmailHtml(session) {
  const url = readingUrl(session.token)

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.7;color:#222;max-width:700px;margin:0 auto;padding:24px;">
      <h2 style="margin-bottom:8px;">${session.productName}</h2>
      <p style="margin-top:0;">
        Tu lectura ya está disponible. Entra desde el botón de abajo para acceder a tu tapete y descubrir tu mensaje.
      </p>

      <p style="margin:24px 0;">
        <a
          href="${url}"
          style="display:inline-block;background:#000000;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:8px;font-weight:bold;"
        >
          Acceder a tu lectura
        </a>
      </p>
    </div>
  `
}

async function sendAccessEmail(session) {
  if (!session.email) {
    throw new Error("La sesión no tiene email")
  }

  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("Falta RESEND_FROM_EMAIL en variables de entorno")
  }

  if (session.accessEmailSent) {
    console.log("EMAIL: ya enviado para token", session.token)
    return { already: true }
  }

  console.log("RESEND: enviando email de acceso a", session.email)

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: session.email,
    subject: `Tu lectura está lista: ${session.productName}`,
    html: buildAccessEmailHtml(session)
  })

  if (result?.error) {
    console.error("RESEND ERROR:", result.error)
    throw new Error(`Resend error: ${result.error.message || "error desconocido"}`)
  }

  session.accessEmailSent = true
  sessions.set(session.token, session)

  console.log("RESEND OK:", result)
  return result
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

function getCardField(card, possibleKeys) {
  for (const key of possibleKeys) {
    if (
      card[key] !== undefined &&
      card[key] !== null &&
      String(card[key]).trim() !== ""
    ) {
      return String(card[key]).trim()
    }
  }
  return ""
}

async function generateAIReading(productName, deck, pick, cardsData) {
  const style = randomStyle(deck)

  const deckTone =
    deck === "angeles"
      ? "angelical, amoroso, protector, luminoso"
      : deck === "semilla_estelar"
      ? "cósmico, álmico, expansivo, vibracional"
      : "místico, profundo, simbólico, introspectivo"

  const cardsText = cardsData
    .map((c, index) => {
      const cardName = getCardField(c, ["name", "nombre", "title", "id"])
      const keywords = Array.isArray(c.keywords) ? c.keywords.join(", ") : ""
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
      const heart = getCardField(c, ["consejo_corazon"])
      const reversed = getCardField(c, ["invertida", "reversed"])

      return `
Carta ${index + 1}: ${cardName}
Palabras clave: ${keywords}
Significado general: ${general}
Amor: ${love}
Trabajo o propósito: ${work}
Consejo espiritual: ${advice}
Consejo del corazón: ${heart}
Invertida: ${reversed}
`
    })
    .join("\n")

  const prompt = `
Eres una tarotista espiritual profesional.

Escribe en español una lectura ceremonial, cálida, profunda y elegante.

Producto: ${productName}
Cantidad de cartas elegidas: ${pick}
Mazo: ${deck}
Tono del mazo: ${deckTone}
Estilo: ${style}

Información base de las cartas:
${cardsText}

Devuelve la lectura con ESTA ESTRUCTURA EXACTA y en este orden:

INTRODUCCIÓN
Un párrafo breve y emocional que abra la lectura.

SIGNIFICADO GENERAL
Un desarrollo amplio conectando todas las cartas entre sí.

AMOR
Interpretación enfocada al plano amoroso y emocional.

TRABAJO / PROPÓSITO
Interpretación enfocada al trabajo, misión, vocación o camino vital.

CONSEJO ESPIRITUAL
Consejo profundo y claro para la persona.

${
  deck === "angeles"
    ? "CONSEJO ANGELICAL\nUn mensaje breve, amoroso y elevado de los ángeles."
    : deck === "semilla_estelar"
    ? "CONSEJO ESTELAR\nUn mensaje breve, cósmico y álmico."
    : "CONSEJO DEL CORAZÓN\nUn mensaje íntimo y emocional."
}

AFIRMACIÓN
Una afirmación breve y poderosa en primera persona.

RITUAL
Un ritual sencillo, bonito y fácil de hacer en casa.

CIERRE
Un párrafo final inspirador.

Reglas:
- No uses listas con viñetas.
- Sí puedes usar títulos de sección en mayúsculas.
- No repitas frases hechas.
- No copies literalmente el texto base.
- Usa el contenido base de las cartas como fundamento.
- Si un campo no existe en la carta, créalo de forma coherente a partir del significado general.
- La lectura debe sentirse única y premium.
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

function createSession({ orderId, lineItemId, productId, email, unitIndex = 0 }) {
  const config = PRODUCTS[String(productId)]

  if (!config) {
    throw new Error(`Producto no configurado: ${productId}`)
  }

  const token = generateToken(orderId, lineItemId, productId, unitIndex)

  if (sessions.has(token)) {
    console.log("SESSION: ya existía", token)
    return sessions.get(token)
  }

  const session = {
    token,
    orderId: String(orderId),
    lineItemId: String(lineItemId),
    productId: String(productId),
    productName: config.name,
    deckId: config.deck,
    pick: config.pick,
    deckSize: config.deckSize,
    email: email || "",
    status: "pending_selection",
    accessEmailSent: false,
    selectedCardIds: [],
    selectedCards: [],
    interpretation: "",
    createdAt: new Date().toISOString()
  }

  sessions.set(token, session)

  console.log("SESSION OK:", {
    token,
    productName: session.productName,
    deckId: session.deckId,
    pick: session.pick,
    email: session.email
  })

  return session
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "tarot-api",
    version: "session-cards-submit-v1"
  })
})

app.get("/api/health", (req, res) => {
  res.json({
    ok: true
  })
})

app.get("/api/test-nuevo", (req, res) => {
  res.json({
    ok: true,
    nuevo: true,
    version: "session-cards-submit-v1"
  })
})

app.get("/api/session", (req, res) => {
  try {
    const { token } = req.query

    if (!token) {
      return res.status(400).json({
        ok: false,
        error: "Falta token"
      })
    }

    const session = sessions.get(String(token))

    if (!session) {
      return res.status(404).json({
        ok: false,
        error: "Sesión no encontrada"
      })
    }

    return res.json({
      ok: true,
      token: session.token,
      productName: session.productName,
      deckId: session.deckId,
      pick: session.pick,
      deckSize: session.deckSize,
      status: session.status,
      interpretation: session.interpretation || ""
    })
  } catch (error) {
    console.error("SESSION GET ERROR:", error)
    return res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

app.get("/api/cards/:deckId", (req, res) => {
  try {
    const deckId = String(req.params.deckId || "")

    if (!deckId) {
      return res.status(400).json({
        ok: false,
        error: "Falta deckId"
      })
    }

    const deck = getPublicDeck(deckId)

    return res.json({
      ok: true,
      ...deck
    })
  } catch (error) {
    console.error("CARDS GET ERROR:", error)
    return res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

app.post("/api/submit", async (req, res) => {
  try {
    const { token, cards } = req.body

    if (!token) {
      return res.status(400).json({
        ok: false,
        error: "Falta token"
      })
    }

    if (!Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "Faltan cartas seleccionadas"
      })
    }

    const session = sessions.get(String(token))

    if (!session) {
      return res.status(404).json({
        ok: false,
        error: "Sesión no encontrada"
      })
    }

    if (session.status === "completed" && session.interpretation) {
      return res.json({
        ok: true,
        alreadyCompleted: true,
        interpretation: session.interpretation
      })
    }

    if (cards.length !== Number(session.pick)) {
      return res.status(400).json({
        ok: false,
        error: `Debes elegir exactamente ${session.pick} cartas`
      })
    }

    const deck = loadDeck(session.deckId)

    const selectedIds = cards.map((c) => c.id)
    const selectedCards = selectedIds
      .map((id) => deck.cards.find((card) => String(card.id) === String(id)))
      .filter(Boolean)

    if (selectedCards.length !== session.pick) {
      return res.status(400).json({
        ok: false,
        error: "No se pudieron resolver todas las cartas elegidas"
      })
    }

    session.status = "processing"
    session.selectedCardIds = selectedIds
    session.selectedCards = selectedCards
    sessions.set(session.token, session)

    const interpretation = await generateAIReading(
      session.productName,
      session.deckId,
      session.pick,
      selectedCards
    )

    session.interpretation = interpretation
    session.status = "completed"
    sessions.set(session.token, session)

    return res.json({
      ok: true,
      interpretation,
      cards: selectedCards
    })
  } catch (error) {
    console.error("SUBMIT ERROR:", error)
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

    const session = sessions.get(String(token))

    if (!session) {
      return res.status(404).json({
        ok: false,
        error: "Lectura no encontrada"
      })
    }

    return res.json({
      ok: true,
      reading: {
        token: session.token,
        product: session.productName,
        deck: session.deckId,
        spread: session.pick,
        status: session.status,
        cardsData: session.selectedCards || [],
        interpretation: session.interpretation || ""
      }
    })
  } catch (error) {
    console.error("READING GET ERROR:", error)
    return res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

app.post("/api/shopify/order-paid", async (req, res) => {
  try {
    console.log("=== WEBHOOK SHOPIFY RECIBIDO ===")

    if (!verifyShopify(req)) {
      console.error("SHOPIFY WEBHOOK INVALID HMAC")
      return res.status(401).send("invalid")
    }

    const webhookId = String(req.get("X-Shopify-Webhook-Id") || "")
    if (webhookId && processedWebhooks.has(webhookId)) {
      console.log("WEBHOOK DUPLICADO IGNORADO:", webhookId)
      return res.status(200).json({
        ok: true,
        duplicate: true
      })
    }

    if (webhookId) {
      processedWebhooks.add(webhookId)
    }

    const order = JSON.parse(req.body.toString("utf8"))

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
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "order_not_paid"
      })
    }

    let processedCount = 0

    for (const item of order.line_items || []) {
      const found = findProductConfigFromLineItem(item)

      if (!found) {
        console.log("Producto no configurado:", {
          title: item.title,
          product_id: item.product_id,
          variant_id: item.variant_id
        })
        continue
      }

      const quantity = Number(item.quantity || 1)

      for (let i = 0; i < quantity; i += 1) {
        const session = createSession({
          orderId: String(order.id),
          lineItemId: String(item.id),
          productId: found.productId,
          email,
          unitIndex: i
        })

        if (!session.accessEmailSent && session.email) {
          await sendAccessEmail(session)
        }

        processedCount += 1
      }
    }

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
