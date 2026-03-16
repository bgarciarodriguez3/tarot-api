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

function getSpecialSectionTitle(deck) {
  if (deck === "angeles") return "CONSEJO ANGELICAL"
  if (deck === "semilla_estelar") return "CONSEJO ESTELAR"
  return "CONSEJO DEL CORAZÓN"
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch (error) {
    return null
  }
}

function normalizeReadingObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return null
  }

  const reading = {
    introduccion: String(obj.introduccion || "").trim(),
    significado_general: String(obj.significado_general || "").trim(),
    amor: String(obj.amor || "").trim(),
    trabajo_proposito: String(obj.trabajo_proposito || "").trim(),
    consejo_espiritual: String(obj.consejo_espiritual || "").trim(),
    consejo_especial: String(obj.consejo_especial || "").trim(),
    afirmacion: String(obj.afirmacion || "").trim(),
    ritual: String(obj.ritual || "").trim(),
    cierre: String(obj.cierre || "").trim()
  }

  const allFilled = Object.values(reading).every((value) => value.length > 0)
  return allFilled ? reading : null
}

function sectionsFromPlainText(text, deck) {
  const cleaned = String(text || "").trim()

  const titles = [
    "INTRODUCCIÓN",
    "SIGNIFICADO GENERAL",
    "AMOR",
    "TRABAJO / PROPÓSITO",
    "CONSEJO ESPIRITUAL",
    getSpecialSectionTitle(deck),
    "AFIRMACIÓN",
    "RITUAL",
    "CIERRE"
  ]

  const result = {
    introduccion: "",
    significado_general: "",
    amor: "",
    trabajo_proposito: "",
    consejo_espiritual: "",
    consejo_especial: "",
    afirmacion: "",
    ritual: "",
    cierre: ""
  }

  const mapping = {
    "INTRODUCCIÓN": "introduccion",
    "SIGNIFICADO GENERAL": "significado_general",
    "AMOR": "amor",
    "TRABAJO / PROPÓSITO": "trabajo_proposito",
    "CONSEJO ESPIRITUAL": "consejo_espiritual",
    [getSpecialSectionTitle(deck)]: "consejo_especial",
    "AFIRMACIÓN": "afirmacion",
    "RITUAL": "ritual",
    "CIERRE": "cierre"
  }

  const escaped = titles
    .map((title) => title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")

  const regex = new RegExp(`(?:^|\\n)(${escaped})\\s*\\n`, "g")
  const matches = [...cleaned.matchAll(regex)]

  if (!matches.length) {
    return {
      introduccion: cleaned,
      significado_general: cleaned,
      amor: cleaned,
      trabajo_proposito: cleaned,
      consejo_espiritual: cleaned,
      consejo_especial: cleaned,
      afirmacion: "Estoy preparada para recibir con amor la guía que el universo pone en mi camino.",
      ritual: "Enciende una vela blanca, respira profundamente tres veces y relee esta lectura con la mano en el corazón.",
      cierre: cleaned
    }
  }

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i]
    const title = current[1]
    const start = current.index + current[0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : cleaned.length
    const content = cleaned.slice(start, end).trim()
    const key = mapping[title]

    if (key) {
      result[key] = content
    }
  }

  if (!result.afirmacion) {
    result.afirmacion = "Estoy preparada para recibir con amor la guía que el universo pone en mi camino."
  }

  if (!result.ritual) {
    result.ritual = "Enciende una vela blanca, respira profundamente tres veces y relee esta lectura con la mano en el corazón."
  }

  return result
}

async function generateAIReading(productName, deck, pick, cardsData) {
  const style = randomStyle(deck)

  const deckTone =
    deck === "angeles"
      ? "angelical, amoroso, protector, luminoso"
      : deck === "semilla_estelar"
      ? "cósmico, álmico, expansivo, vibracional"
      : "místico, profundo, simbólico, introspectivo"

  const specialSection =
    deck === "angeles"
      ? "CONSEJO ANGELICAL"
      : deck === "semilla_estelar"
      ? "CONSEJO ESTELAR"
      : "CONSEJO DEL CORAZÓN"

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

Devuelve EXCLUSIVAMENTE un JSON válido con esta estructura exacta:

{
  "introduccion": "string",
  "significado_general": "string",
  "amor": "string",
  "trabajo_proposito": "string",
  "consejo_espiritual": "string",
  "consejo_especial": "string",
  "afirmacion": "string",
  "ritual": "string",
  "cierre": "string"
}

Reglas:
- No devuelvas markdown.
- No devuelvas texto fuera del JSON.
- "consejo_especial" corresponde a la sección "${specialSection}".
- La afirmación debe ir en primera persona.
- El ritual debe ser sencillo, bonito y fácil de hacer en casa.
- No uses listas con viñetas.
- No copies literalmente el texto base.
- Usa el contenido base de las cartas como fundamento.
- Si un campo no existe en la carta, créalo de forma coherente a partir del significado general.
- La lectura debe sentirse única y premium.
`

  console.log("OPENAI: generando lectura para", productName)

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: prompt
  })

  const text = (response.output_text || "").trim()

  if (!text) {
    throw new Error("OpenAI devolvió una respuesta vacía")
  }

  const parsed = safeJsonParse(text)
  const normalized = normalizeReadingObject(parsed)

  if (normalized) {
    console.log("OPENAI OK: lectura estructurada generada")
    return {
      reading: normalized,
      interpretation: `
INTRODUCCIÓN
${normalized.introduccion}

SIGNIFICADO GENERAL
${normalized.significado_general}

AMOR
${normalized.amor}

TRABAJO / PROPÓSITO
${normalized.trabajo_proposito}

CONSEJO ESPIRITUAL
${normalized.consejo_espiritual}

${specialSection}
${normalized.consejo_especial}

AFIRMACIÓN
${normalized.afirmacion}

RITUAL
${normalized.ritual}

CIERRE
${normalized.cierre}
`.trim()
    }
  }

  console.log("OPENAI: respuesta no vino en JSON perfecto, intentando rescatar texto")
  const fallbackReading = sectionsFromPlainText(text, deck)

  return {
    reading: fallbackReading,
    interpretation: text
  }
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
    deck: config.deck,
    pick: config.pick,
    maxCards: config.pick,
    deckSize: config.deckSize,
    email: email || "",
    status: "pending_selection",
    accessEmailSent: false,
    selectedCardIds: [],
    selectedCards: [],
    interpretation: "",
    reading: null,
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
    version: "session-cards-submit-v2"
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
    version: "session-cards-submit-v2"
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
      deck: session.deck || session.deckId,
      deckId: session.deckId,
      maxCards: Number(session.maxCards || session.pick || 3),
      pick: Number(session.pick || session.maxCards || 3),
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

    if (session.status === "completed" && session.reading) {
      return res.json({
        ok: true,
        alreadyCompleted: true,
        reading: session.reading,
        interpretation: session.interpretation || "",
        cards: session.selectedCards || []
      })
    }

    const normalizedCardIds = cards.map((c) => {
      if (typeof c === "string" || typeof c === "number") {
        return String(c)
      }
      if (c && (typeof c.id === "string" || typeof c.id === "number")) {
        return String(c.id)
      }
      return null
    }).filter(Boolean)

    const uniqueIds = [...new Set(normalizedCardIds)]

    if (uniqueIds.length !== Number(session.pick)) {
      return res.status(400).json({
        ok: false,
        error: `Debes elegir exactamente ${session.pick} cartas`
      })
    }

    const deck = loadDeck(session.deckId)

    const selectedCards = uniqueIds
      .map((id) => deck.cards.find((card) => String(card.id) === String(id)))
      .filter(Boolean)

    if (selectedCards.length !== Number(session.pick)) {
      return res.status(400).json({
        ok: false,
        error: "No se pudieron resolver todas las cartas elegidas"
      })
    }

    session.status = "processing"
    session.selectedCardIds = uniqueIds
    session.selectedCards = selectedCards
    sessions.set(session.token, session)

    const aiResult = await generateAIReading(
      session.productName,
      session.deckId,
      session.pick,
      selectedCards
    )

    session.interpretation = aiResult.interpretation
    session.reading = aiResult.reading
    session.status = "completed"
    sessions.set(session.token, session)

    return res.json({
      ok: true,
      reading: session.reading,
      interpretation: session.interpretation,
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
        interpretation: session.interpretation || "",
        sections: session.reading || null
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

app.post("/api/debug/create-session", (req, res) => {
  try {
    const {
      productId = "10496012616017",
      email = "",
      orderId = `debug-order-${Date.now()}`,
      lineItemId = `debug-line-${Date.now()}`,
      unitIndex = 0
    } = req.body || {}

    const session = createSession({
      orderId: String(orderId),
      lineItemId: String(lineItemId),
      productId: String(productId),
      email,
      unitIndex: Number(unitIndex || 0)
    })

    return res.json({
      ok: true,
      session
    })
  } catch (error) {
    console.error("DEBUG CREATE SESSION ERROR:", error)
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
