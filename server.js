require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const fs = require("fs")
const path = require("path")
const Database = require("better-sqlite3")
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
    deckSize: 12,
    pagePath: "/pages/mensaje-de-los-angeles-tirada-de-4-cartas"
  },
  "10495993446737": {
    name: "Camino de la Semilla Estelar",
    deck: "semilla_estelar",
    pick: 5,
    deckSize: 22,
    pagePath: "/pages/camino-de-la-semilla-estelar-tirada-de-5-cartas"
  },
  "10493383082321": {
    name: "Lectura Profunda: Análisis Completo",
    deck: "arcanos_mayores",
    pick: 12,
    deckSize: 22,
    pagePath: "/pages/arcanos-mayores-tirada-personalizada"
  },
  "10493369745745": {
    name: "Tres Puertas del Destino",
    deck: "arcanos_mayores",
    pick: 3,
    deckSize: 22,
    pagePath: "/pages/arcanos-mayores-tirada-personalizada"
  }
}

const PREMIUM_PRODUCTS = new Set([])

const decksCache = new Map()

const DB_PATH = path.join(__dirname, "data", "tarot.sqlite")
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma("journal_mode = WAL")

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  line_item_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  deck_id TEXT NOT NULL,
  max_cards INTEGER NOT NULL,
  deck_size INTEGER NOT NULL,
  page_path TEXT,
  email TEXT,
  status TEXT NOT NULL,
  access_email_sent INTEGER NOT NULL DEFAULT 0,
  result_email_sent INTEGER NOT NULL DEFAULT 0,
  selected_card_ids TEXT,
  selected_cards_json TEXT,
  interpretation TEXT,
  reading_json TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS processed_webhooks (
  webhook_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
`)

function generateToken(orderId, lineItemId, productId, unitIndex = 0) {
  return [
    String(orderId || "").trim(),
    String(lineItemId || "").trim(),
    String(productId || "").trim(),
    String(unitIndex || 0).trim()
  ].join("-")
}

function parseCompositeToken(token) {
  const raw = String(token || "").trim()
  const parts = raw.split("-")

  if (parts.length < 4) return null

  const unitIndex = parts[parts.length - 1]
  const productId = parts[parts.length - 2]
  const lineItemId = parts[parts.length - 3]
  const orderId = parts.slice(0, parts.length - 3).join("-")

  if (!orderId || !lineItemId || !productId) return null
  if (!/^\d+$/.test(String(unitIndex))) return null

  return {
    orderId: String(orderId),
    lineItemId: String(lineItemId),
    productId: String(productId),
    unitIndex: Number(unitIndex || 0)
  }
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

function safeDbJsonParse(value, fallback) {
  if (value === null || value === undefined) return fallback

  if (typeof value !== "string") {
    return value
  }

  const trimmed = value.trim()
  if (!trimmed) return fallback

  try {
    return JSON.parse(trimmed)
  } catch (error) {
    console.error("DB JSON PARSE ERROR:", {
      value: trimmed.slice(0, 200),
      error: error.message
    })
    return fallback
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

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.error("DECK JSON PARSE ERROR:", {
      deckName,
      filePath,
      firstChars: raw.slice(0, 200),
      error: error.message
    })
    throw error
  }

  if (!Array.isArray(parsed.cards)) {
    throw new Error(`El mazo ${deckName} no tiene un campo cards válido`)
  }

  decksCache.set(deckName, parsed)
  return parsed
}

function normalizeCardValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function getImageFilename(url) {
  const raw = String(url || "").trim()
  if (!raw) return ""
  try {
    const clean = raw.split("?")[0]
    const parts = clean.split("/")
    return parts[parts.length - 1] || ""
  } catch (_error) {
    return ""
  }
}

function parseBooleanLike(value) {
  if (typeof value === "boolean") return value
  const normalized = String(value || "").trim().toLowerCase()
  return ["1", "true", "si", "sí", "yes", "invertida", "reversed"].includes(normalized)
}

function sanitizeIncomingCard(inputCard) {
  if (typeof inputCard === "string" || typeof inputCard === "number") {
    return {
      id: String(inputCard).trim(),
      name: "",
      image: "",
      reversed: false,
      position: 0
    }
  }

  if (inputCard && typeof inputCard === "object") {
    return {
      id: String(
        inputCard.id ||
        inputCard.cardId ||
        inputCard.slug ||
        ""
      ).trim(),
      name: String(
        inputCard.name ||
        inputCard.title ||
        inputCard.cardName ||
        ""
      ).trim(),
      image: String(
        inputCard.image ||
        inputCard.url ||
        inputCard.src ||
        ""
      ).trim(),
      reversed: parseBooleanLike(
        inputCard.reversed ??
        inputCard.invertida ??
        inputCard.isReversed
      ),
      position: Number(inputCard.position || inputCard.index || 0) || 0
    }
  }

  return null
}

function cardCandidateKeys(card) {
  return [
    card?.id,
    card?.slug,
    card?.name,
    card?.title,
    card?.arcano,
    card?.image,
    getImageFilename(card?.image || "")
  ]
    .filter(Boolean)
    .map(normalizeCardValue)
    .filter(Boolean)
}

function resolveCardFromDeck(deck, inputCard) {
  if (!deck || !Array.isArray(deck.cards)) return null

  const sanitized = sanitizeIncomingCard(inputCard)
  if (!sanitized) return null

  const inputKeys = [
    sanitized.id,
    sanitized.name,
    sanitized.image,
    getImageFilename(sanitized.image)
  ]
    .filter(Boolean)
    .map(normalizeCardValue)
    .filter(Boolean)

  if (!inputKeys.length) return null

  const found = deck.cards.find((card) => {
    const deckKeys = cardCandidateKeys(card)
    return inputKeys.some((key) => deckKeys.includes(key))
  })

  if (!found) return null

  return {
    ...found,
    reversed: Boolean(sanitized.reversed),
    invertida: Boolean(sanitized.reversed),
    position: sanitized.position || 0
  }
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
      slug: card.slug || card.id,
      name: card.name || card.title || card.id,
      title: card.title || card.name || card.id,
      image: card.image || ""
    }))
  }
}

function readingUrl(session) {
  const pagePath = session.pagePath || "/pages/lectura"
  return `${STORE_URL}${pagePath}?token=${encodeURIComponent(session.token)}`
}

function buildAccessEmailText(session) {
  const url = readingUrl(session)

  return [
    "Querida alma,",
    "",
    "Tu acceso a la lectura ya está preparado.",
    "",
    "Pulsa este enlace para entrar en tu tapete:",
    url,
    "",
    "Con luz,",
    "El Tarot de la Rueda de la Fortuna"
  ].join("\n")
}

function buildAccessEmailHtml(session) {
  const url = readingUrl(session)

  return `
    <div style="margin:0;padding:0;background:#f6f1e7;">
      <div style="max-width:680px;margin:0 auto;padding:32px 18px;">
        <div style="background:linear-gradient(180deg,#1a1330 0%,#241845 100%);border-radius:28px;padding:1px;box-shadow:0 20px 60px rgba(0,0,0,0.18);">
          <div style="background:linear-gradient(180deg,#fcf7ef 0%,#f7f1e6 100%);border-radius:27px;padding:36px 28px;color:#2b2238;font-family:Georgia, 'Times New Roman', serif;">

            <div style="text-align:center;margin-bottom:22px;">
              <div style="display:inline-block;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8b6b2f;border:1px solid rgba(139,107,47,0.28);border-radius:999px;padding:8px 14px;background:rgba(255,255,255,0.55);">
                Tu acceso ya está listo
              </div>
            </div>

            <div style="text-align:center;margin-bottom:20px;">
              <div style="font-size:30px;line-height:1;color:#8b6b2f;">✦</div>
              <h1 style="margin:10px 0 8px;font-size:30px;line-height:1.2;font-weight:normal;color:#241845;">
                Accede a tu destino
              </h1>
              <p style="margin:0;font-size:15px;color:#6d5a7b;line-height:1.7;">
                Tu lectura te está esperando
              </p>
            </div>

            <div style="width:72px;height:1px;background:linear-gradient(90deg,transparent,#c6a45a,transparent);margin:22px auto 28px;"></div>

            <p style="margin:0 0 16px;font-size:17px;line-height:1.8;">Querida alma,</p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
              Tu acceso a la lectura ya está preparado.
            </p>

            <p style="margin:0 0 22px;font-size:16px;line-height:1.85;">
              Cuando estés lista, entra en tu tapete y deja que el mensaje se revele.
            </p>

            <div style="text-align:center;margin:28px 0;">
              <a
                href="${url}"
                style="display:inline-block;background:#241845;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:bold;"
              >
                Accede a tu destino
              </a>
            </div>

            <p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#6d5a7b;text-align:center;">
              Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
              <span style="word-break:break-all;">${url}</span>
            </p>

            <div style="width:72px;height:1px;background:linear-gradient(90deg,transparent,#c6a45a,transparent);margin:28px auto 24px;"></div>

            <p style="margin:0;text-align:center;font-size:16px;line-height:1.8;color:#5a4968;">
              Con luz,
            </p>

            <p style="margin:6px 0 0;text-align:center;font-size:18px;line-height:1.6;color:#241845;">
              <strong>El Tarot de la Rueda de la Fortuna</strong>
            </p>

          </div>
        </div>
      </div>
    </div>
  `
}

function buildResultEmailText(session) {
  const reading = session.reading || {}

  const content = [
    reading.introduccion || "",
    reading.significado_general || "",
    reading.amor ? "💗 Amor\n" + reading.amor : "",
    reading.trabajo_proposito ? "💫 Propósito\n" + reading.trabajo_proposito : "",
    reading.consejo_espiritual ? "🕊 Consejo espiritual\n" + reading.consejo_espiritual : "",
    reading.consejo_especial ? "✨ Consejo estelar\n" + reading.consejo_especial : "",
    reading.afirmacion ? "🌞 Afirmación\n" + reading.afirmacion : "",
    reading.ritual ? "🕯 Ritual\n" + reading.ritual : "",
    reading.cierre ? "🌟 Cierre\n" + reading.cierre : ""
  ]
    .filter(Boolean)
    .join("\n\n")

  return [
    "Querida alma,",
    "",
    "Tu lectura ya ha llegado a ti.",
    "",
    "No es casualidad que este mensaje haya encontrado tu camino.",
    "Las cartas elegidas han respondido a tu energía en este momento exacto.",
    "",
    "Respira.",
    "Lee despacio.",
    "Permite que cada palabra encuentre su lugar en ti.",
    "",
    "✨",
    "",
    content,
    "",
    "✨",
    "",
    "Confía en lo que sientes al leerlo.",
    "Ahí está la verdadera respuesta.",
    "",
    "Con luz,",
    "El Tarot de la Rueda de la Fortuna"
  ].join("\n")
}

function buildResultEmailHtml(session) {
  const reading = session.reading || {}

  const content = [
    reading.introduccion || "",
    reading.significado_general || "",
    reading.amor ? "💗 Amor\n" + reading.amor : "",
    reading.trabajo_proposito ? "💫 Propósito\n" + reading.trabajo_proposito : "",
    reading.consejo_espiritual ? "🕊 Consejo espiritual\n" + reading.consejo_espiritual : "",
    reading.consejo_especial ? "✨ Consejo estelar\n" + reading.consejo_especial : "",
    reading.afirmacion ? "🌞 Afirmación\n" + reading.afirmacion : "",
    reading.ritual ? "🕯 Ritual\n" + reading.ritual : "",
    reading.cierre ? "🌟 Cierre\n" + reading.cierre : ""
  ]
    .filter(Boolean)
    .join("\n\n")

  return `
    <div style="margin:0;padding:0;background:#f6f1e7;">
      <div style="max-width:680px;margin:0 auto;padding:32px 18px;">
        <div style="background:linear-gradient(180deg,#1a1330 0%,#241845 100%);border-radius:28px;padding:1px;box-shadow:0 20px 60px rgba(0,0,0,0.18);">
          <div style="background:linear-gradient(180deg,#fcf7ef 0%,#f7f1e6 100%);border-radius:27px;padding:36px 28px;color:#2b2238;font-family:Georgia, 'Times New Roman', serif;">

            <div style="text-align:center;margin-bottom:22px;">
              <div style="display:inline-block;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8b6b2f;border:1px solid rgba(139,107,47,0.28);border-radius:999px;padding:8px 14px;background:rgba(255,255,255,0.55);">
                Mensaje ritualizado para ti
              </div>
            </div>

            <div style="text-align:center;margin-bottom:20px;">
              <div style="font-size:30px;line-height:1;color:#8b6b2f;">✦</div>
              <h1 style="margin:10px 0 8px;font-size:30px;line-height:1.2;font-weight:normal;color:#241845;">
                Tu lectura ya ha llegado
              </h1>
              <p style="margin:0;font-size:15px;color:#6d5a7b;line-height:1.7;">
                Un mensaje revelado para este momento de tu camino
              </p>
            </div>

            <div style="width:72px;height:1px;background:linear-gradient(90deg,transparent,#c6a45a,transparent);margin:22px auto 28px;"></div>

            <p style="margin:0 0 16px;font-size:17px;line-height:1.8;">
              Querida alma,
            </p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
              Tu lectura ya ha llegado a ti.
            </p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
              No es casualidad que este mensaje haya encontrado tu camino.<br>
              Las cartas elegidas han respondido a tu energía en este momento exacto.
            </p>

            <p style="margin:0 0 18px;font-size:16px;line-height:1.85;">
              Respira.<br>
              Lee despacio.<br>
              Permite que cada palabra encuentre su lugar en ti.
            </p>

            <div style="text-align:center;font-size:20px;color:#8b6b2f;margin:18px 0 20px;">
              ✨
            </div>

            <div style="
              white-space:pre-line;
              font-size:16px;
              line-height:1.9;
              color:#2f243c;
              margin:0 0 20px;
            ">${content}</div>

            <div style="text-align:center;font-size:20px;color:#8b6b2f;margin:8px 0 18px;">
              ✨
            </div>

            <p style="margin:0 0 12px;font-size:16px;line-height:1.85;">
              Confía en lo que sientes al leerlo.<br>
              Ahí está la verdadera respuesta.
            </p>

            <div style="width:72px;height:1px;background:linear-gradient(90deg,transparent,#c6a45a,transparent);margin:28px auto 24px;"></div>

            <p style="margin:0;text-align:center;font-size:16px;line-height:1.8;color:#5a4968;">
              Con luz,
            </p>

            <p style="margin:6px 0 0;text-align:center;font-size:18px;line-height:1.6;color:#241845;">
              <strong>El Tarot de la Rueda de la Fortuna</strong>
            </p>

          </div>
        </div>
      </div>
    </div>
  `
}

function rowToSession(row) {
  if (!row) return null

  return {
    token: row.token,
    orderId: row.order_id,
    lineItemId: row.line_item_id,
    productId: row.product_id,
    productName: row.product_name,
    deckId: row.deck_id,
    deck: row.deck_id,
    pagePath: row.page_path || "",
    pick: Number(row.max_cards),
    maxCards: Number(row.max_cards),
    deckSize: Number(row.deck_size),
    email: row.email || "",
    status: row.status,
    accessEmailSent: Boolean(row.access_email_sent),
    resultEmailSent: Boolean(row.result_email_sent),
    selectedCardIds: safeDbJsonParse(row.selected_card_ids, []),
    selectedCards: safeDbJsonParse(row.selected_cards_json, []),
    interpretation: row.interpretation || "",
    reading: safeDbJsonParse(row.reading_json, null),
    createdAt: row.created_at,
    completedAt: row.completed_at || null,
    readingDone: row.status === "completed"
  }
}

function getSessionByToken(token) {
  const tokenStr = String(token || "").trim()

  if (!tokenStr) return null

  const directRow = db
    .prepare("SELECT * FROM sessions WHERE token = ?")
    .get(tokenStr)

  if (directRow) {
    return rowToSession(directRow)
  }

  const composite = parseCompositeToken(tokenStr)

  if (composite) {
    const fallbackRows = db
      .prepare(`
        SELECT *
        FROM sessions
        WHERE order_id = ?
          AND line_item_id = ?
          AND product_id = ?
        ORDER BY created_at ASC
      `)
      .all(composite.orderId, composite.lineItemId, composite.productId)

    if (fallbackRows && fallbackRows.length) {
      const row = fallbackRows[composite.unitIndex] || fallbackRows[0]
      return rowToSession(row)
    }
  }

  return null
}

function saveSession(session) {
  db.prepare(`
    INSERT INTO sessions (
      token, order_id, line_item_id, product_id, product_name,
      deck_id, max_cards, deck_size, page_path, email, status,
      access_email_sent, result_email_sent, selected_card_ids, selected_cards_json,
      interpretation, reading_json, created_at, completed_at
    ) VALUES (
      @token, @order_id, @line_item_id, @product_id, @product_name,
      @deck_id, @max_cards, @deck_size, @page_path, @email, @status,
      @access_email_sent, @result_email_sent, @selected_card_ids, @selected_cards_json,
      @interpretation, @reading_json, @created_at, @completed_at
    )
    ON CONFLICT(token) DO UPDATE SET
      order_id = excluded.order_id,
      line_item_id = excluded.line_item_id,
      product_id = excluded.product_id,
      product_name = excluded.product_name,
      deck_id = excluded.deck_id,
      max_cards = excluded.max_cards,
      deck_size = excluded.deck_size,
      page_path = excluded.page_path,
      email = excluded.email,
      status = excluded.status,
      access_email_sent = excluded.access_email_sent,
      result_email_sent = excluded.result_email_sent,
      selected_card_ids = excluded.selected_card_ids,
      selected_cards_json = excluded.selected_cards_json,
      interpretation = excluded.interpretation,
      reading_json = excluded.reading_json,
      created_at = excluded.created_at,
      completed_at = excluded.completed_at
  `).run({
    token: session.token,
    order_id: session.orderId,
    line_item_id: session.lineItemId,
    product_id: session.productId,
    product_name: session.productName,
    deck_id: session.deckId,
    max_cards: Number(session.maxCards || session.pick || 3),
    deck_size: Number(session.deckSize || 0),
    page_path: session.pagePath || "",
    email: session.email || "",
    status: session.status || "pending_selection",
    access_email_sent: session.accessEmailSent ? 1 : 0,
    result_email_sent: session.resultEmailSent ? 1 : 0,
    selected_card_ids: JSON.stringify(session.selectedCardIds || []),
    selected_cards_json: JSON.stringify(session.selectedCards || []),
    interpretation: session.interpretation || "",
    reading_json: session.reading ? JSON.stringify(session.reading) : null,
    created_at: session.createdAt || new Date().toISOString(),
    completed_at: session.completedAt || null
  })
}

function isWebhookProcessed(webhookId) {
  const row = db
    .prepare("SELECT webhook_id FROM processed_webhooks WHERE webhook_id = ?")
    .get(String(webhookId))

  return Boolean(row)
}

function markWebhookProcessed(webhookId) {
  db.prepare(`
    INSERT OR IGNORE INTO processed_webhooks (webhook_id, created_at)
    VALUES (?, ?)
  `).run(String(webhookId), new Date().toISOString())
}

async function sendAccessEmail(session) {
  if (!session.email) {
    throw new Error("La sesión no tiene email")
  }

  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("Falta RESEND_FROM_EMAIL en variables de entorno")
  }

  if (session.accessEmailSent) {
    console.log("EMAIL ACCESO: ya enviado para token", session.token)
    return { already: true }
  }

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: session.email,
    subject: `✨ Accede a tu destino`,
    text: buildAccessEmailText(session),
    html: buildAccessEmailHtml(session)
  })

  if (result?.error) {
    console.error("RESEND ACCESS ERROR:", result.error)
    throw new Error(`Resend error: ${result.error.message || "error desconocido"}`)
  }

  session.accessEmailSent = true
  saveSession(session)

  console.log("RESEND ACCESS OK:", result)
  return result
}

async function sendResultEmail(session) {
  if (!session.email) {
    throw new Error("La sesión no tiene email")
  }

  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("Falta RESEND_FROM_EMAIL en variables de entorno")
  }

  if (!session.reading) {
    throw new Error("No hay lectura generada")
  }

  if (session.resultEmailSent) {
    console.log("EMAIL RESULTADO: ya enviado para token", session.token)
    return { already: true }
  }

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: session.email,
    subject: "✨ Tu lectura ya te estaba esperando…",
    text: buildResultEmailText(session),
    html: buildResultEmailHtml(session)
  })

  if (result?.error) {
    console.error("RESEND RESULT ERROR:", result.error)
    throw new Error(`Resend error: ${result.error.message || "error desconocido"}`)
  }

  session.resultEmailSent = true
  saveSession(session)

  console.log("RESEND RESULT OK:", result)
  return result
}

function randomStyle(deck) {
  const styles = {
    arcanos_mayores: ["místico", "profundo", "espiritual", "simbólico", "ceremonial"],
    semilla_estelar: ["cósmico", "luminoso", "estelar", "expansivo", "vibracional"],
    angeles: ["amoroso", "sanador", "angelical", "suave", "protector"]
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
  } catch (_error) {
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

function sectionsFromPlainText(text) {
  const cleaned = String(text || "").trim()

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

async function generateAIReading(productName, deck, pick, cardsData) {
  const style = randomStyle(deck)

  const deckTone =
    deck === "angeles"
      ? "angelical, amoroso, protector, luminoso"
      : deck === "semilla_estelar"
      ? "cósmico, álmico, expansivo, vibracional"
      : "místico, profundo, simbólico, introspectivo"

  const specialSection = getSpecialSectionTitle(deck)

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
      const special = getCardField(c, [
        "consejo_corazon",
        "consejo_angelical",
        "consejo_estelar",
        "special_advice"
      ])
      const reversed = getCardField(c, ["invertida", "reversed"])

      return `
Carta ${index + 1}: ${cardName}
Palabras clave: ${keywords}
Significado general: ${general}
Amor: ${love}
Trabajo o propósito: ${work}
Consejo espiritual: ${advice}
Consejo especial: ${special}
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
- Cambia el estilo de redacción en cada lectura para evitar repeticiones entre compras distintas.
- Si un campo no existe en la carta, créalo de forma coherente a partir del significado general.
- La lectura debe sentirse única y premium.
`

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

  const fallbackReading = sectionsFromPlainText(text)

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

  if (productId && PREMIUM_PRODUCTS.has(productId)) {
    return { productId, config: null, matchedBy: "premium_product_id" }
  }

  if (variantId && PREMIUM_PRODUCTS.has(variantId)) {
    return { productId: variantId, config: null, matchedBy: "premium_variant_id" }
  }

  return null
}

function createSession({ orderId, lineItemId, productId, email, unitIndex = 0 }) {
  const config = PRODUCTS[String(productId)]

  if (!config) {
    throw new Error(`Producto no configurado: ${productId}`)
  }

  const token = generateToken(orderId, lineItemId, productId, unitIndex)
  const existing = getSessionByToken(token)

  if (existing) {
    if (email && !existing.email) {
      existing.email = email
      saveSession(existing)
    }
    return existing
  }

  const session = {
    token,
    orderId: String(orderId),
    lineItemId: String(lineItemId),
    productId: String(productId),
    productName: config.name,
    deckId: config.deck,
    deck: config.deck,
    pagePath: config.pagePath || "/pages/lectura",
    pick: config.pick,
    maxCards: config.pick,
    deckSize: config.deckSize,
    email: email || "",
    status: "pending_selection",
    accessEmailSent: false,
    resultEmailSent: false,
    selectedCardIds: [],
    selectedCards: [],
    interpretation: "",
    reading: null,
    createdAt: new Date().toISOString(),
    completedAt: null
  }

  saveSession(session)
  return session
}

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "tarot-api",
    version: "production-sqlite-v4-card-resolution-patched-jsonsafe-v2"
  })
})

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true
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

    const session = getSessionByToken(String(token))

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
      pagePath: session.pagePath || "",
      email: session.email || "",
      status: session.status,
      selectedCards: session.selectedCards || [],
      interpretation: session.interpretation || "",
      reading: session.reading || null,
      readingDone: session.status === "completed"
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

    console.log("=== SUBMIT REQUEST ===")
    console.log("BODY:", JSON.stringify(req.body, null, 2))

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

    const session = getSessionByToken(String(token))

    if (!session) {
      return res.status(404).json({
        ok: false,
        error: "Sesión no encontrada"
      })
    }

    if (!Array.isArray(session.selectedCardIds)) session.selectedCardIds = []
    if (!Array.isArray(session.selectedCards)) session.selectedCards = []
    if (session.reading && typeof session.reading !== "object") session.reading = null

    if (session.status === "completed" && session.reading) {
      return res.json({
        ok: true,
        alreadyCompleted: true,
        reading: session.reading,
        interpretation: session.interpretation || "",
        cards: session.selectedCards || []
      })
    }

    if (session.status === "processing") {
      return res.status(409).json({
        ok: false,
        error: "La lectura ya se está procesando"
      })
    }

    const normalizedInputs = cards
      .map((c) => sanitizeIncomingCard(c))
      .filter(Boolean)

    const uniqueInputs = []
    const seen = new Set()

    for (const item of normalizedInputs) {
      const identityKey = [
        normalizeCardValue(item.id),
        normalizeCardValue(item.name),
        normalizeCardValue(getImageFilename(item.image)),
        item.reversed ? "rev" : "upright"
      ].join("|")

      if (!seen.has(identityKey)) {
        seen.add(identityKey)
        uniqueInputs.push(item)
      }
    }

    if (uniqueInputs.length !== Number(session.pick)) {
      return res.status(400).json({
        ok: false,
        error: \`Debes elegir exactamente \${session.pick} cartas\`
      })
    }

    const deck = loadDeck(session.deckId)

    const resolutionDebug = []
    const selectedCards = []

    for (const item of uniqueInputs) {
      const resolved = resolveCardFromDeck(deck, item)

      resolutionDebug.push({
        incoming: item,
        resolved: resolved
          ? {
              id: resolved.id,
              name: resolved.name || resolved.title || "",
              image: resolved.image || "",
              reversed: Boolean(resolved.reversed)
            }
          : null
      })

      if (resolved) {
        selectedCards.push(resolved)
      }
    }

    if (selectedCards.length !== Number(session.pick)) {
      console.error("CARD RESOLUTION ERROR:", {
        deckId: session.deckId,
        expectedPick: session.pick,
        received: uniqueInputs,
        resolutionDebug,
        resolvedCount: selectedCards.length,
        availableCards: deck.cards.map((card) => ({
          id: card.id,
          slug: card.slug || "",
          name: card.name || card.title || "",
          image: card.image || ""
        }))
      })

      return res.status(400).json({
        ok: false,
        error: "No se pudieron resolver todas las cartas elegidas"
      })
    }

    session.status = "processing"
    session.selectedCardIds = selectedCards.map((card) => String(card.id))
    session.selectedCards = selectedCards
    saveSession(session)

    const aiResult = await generateAIReading(
      session.productName,
      session.deckId,
      session.pick,
      selectedCards
    )

    session.interpretation = aiResult.interpretation
    session.reading = aiResult.reading
    session.status = "completed"
    session.completedAt = new Date().toISOString()
    saveSession(session)

    if (session.email) {
      try {
        await sendResultEmail(session)
      } catch (emailError) {
        console.error("RESULT EMAIL ERROR:", emailError)
      }
    }

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

    const session = getSessionByToken(String(token))

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
      orderId = \`debug-order-\${Date.now()}\`,
      lineItemId = \`debug-line-\${Date.now()}\`,
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
      session,
      url: readingUrl(session)
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
    if (webhookId && isWebhookProcessed(webhookId)) {
      console.log("WEBHOOK DUPLICADO IGNORADO:", webhookId)
      return res.status(200).json({
        ok: true,
        duplicate: true
      })
    }

    if (webhookId) {
      markWebhookProcessed(webhookId)
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
      console.log("⛔ Pedido ignorado por financial_status:", financialStatus)
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "order_not_paid"
      })
    }

    let processedCount = 0
    let skippedPremium = 0
    const created = []

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

      if (!found.config) {
        skippedPremium += Number(item.quantity || 1)
        console.log("Producto premium detectado, fuera de flujo automático:", {
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
          try {
            await sendAccessEmail(session)
          } catch (emailError) {
            console.error("ACCESS EMAIL ERROR:", emailError)
          }
        }

        created.push({
          token: session.token,
          url: readingUrl(session),
          productId: session.productId,
          productName: session.productName
        })

        processedCount += 1
      }
    }

    return res.status(200).json({
      ok: true,
      processedCount,
      skippedPremium,
      created
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
  console.log(\`server running on port \${PORT}\`)
})
