require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const fs = require("fs")
const path = require("path")
const Database = require("better-sqlite3")
const { Resend } = require("resend")

const { PREMIUM_PRODUCTS } = require("./config/premium-products")

const app = express()

const resend = new Resend(process.env.RESEND_API_KEY)

app.use(cors())

app.use("/api/premium/shopify/order-paid", express.raw({ type: "*/*" }))

app.use(express.json())

// ==============================
// DATABASE
// ==============================

const DB_PATH = path.join(__dirname, "data", "tarot-premium.sqlite")
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma("journal_mode = WAL")

db.exec(`
CREATE TABLE IF NOT EXISTS premium_requests (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  line_item_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  premium_type TEXT NOT NULL,
  form_url TEXT NOT NULL,
  customer_name TEXT,
  email TEXT NOT NULL,
  status TEXT NOT NULL,
  access_email_sent INTEGER NOT NULL DEFAULT 0,
  received_email_sent INTEGER NOT NULL DEFAULT 0,
  form_submitted_at TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS premium_form_submissions (
  id TEXT PRIMARY KEY,
  premium_request_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS premium_processed_webhooks (
  webhook_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
`)

// ==============================
// HELPERS
// ==============================

function verifyShopify(req) {
  const hmac = req.get("X-Shopify-Hmac-Sha256")

  if (!hmac) {
    console.log("PREMIUM WEBHOOK: falta X-Shopify-Hmac-Sha256")
    return false
  }

  if (!Buffer.isBuffer(req.body)) {
    console.log("PREMIUM WEBHOOK: req.body no es Buffer")
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
    console.log("PREMIUM WEBHOOK HMAC ERROR:", error.message)
    return false
  }
}

function createPremiumId(orderId, lineItemId, productId, unitIndex = 0) {
  return [
    "premium",
    String(orderId || "").trim(),
    String(lineItemId || "").trim(),
    String(productId || "").trim(),
    String(unitIndex || 0).trim()
  ].join("-")
}

function findPremium(item) {
  const productId = String(item?.product_id || "")
  const variantId = String(item?.variant_id || "")

  if (productId && PREMIUM_PRODUCTS[productId]) {
    return { productId, config: PREMIUM_PRODUCTS[productId], matchedBy: "product_id" }
  }

  if (variantId && PREMIUM_PRODUCTS[variantId]) {
    return { productId: variantId, config: PREMIUM_PRODUCTS[variantId], matchedBy: "variant_id" }
  }

  return null
}

function isPremiumWebhookProcessed(webhookId) {
  if (!webhookId) return false

  const row = db
    .prepare("SELECT webhook_id FROM premium_processed_webhooks WHERE webhook_id = ?")
    .get(String(webhookId))

  return Boolean(row)
}

function markPremiumWebhookProcessed(webhookId) {
  if (!webhookId) return

  db.prepare(`
    INSERT OR IGNORE INTO premium_processed_webhooks (webhook_id, created_at)
    VALUES (?, ?)
  `).run(String(webhookId), new Date().toISOString())
}

// ==============================
// EMAILS
// ==============================

async function sendPremiumAccessEmail(record) {
  if (!record.email) {
    console.log("PREMIUM ACCESS EMAIL: no hay email en record")
    return null
  }

  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("Falta RESEND_FROM_EMAIL")
  }

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: record.email,
    subject: "✨ Accede a tu mentoría premium",
    html: `
      <div style="margin:0;padding:0;background:#f6f1e7;">
        <div style="max-width:680px;margin:0 auto;padding:32px 18px;">
          <div style="background:linear-gradient(180deg,#1a1330 0%,#241845 100%);border-radius:28px;padding:1px;box-shadow:0 20px 60px rgba(0,0,0,0.18);">
            <div style="background:linear-gradient(180deg,#fcf7ef 0%,#f7f1e6 100%);border-radius:27px;padding:36px 28px;color:#2b2238;font-family:Georgia, 'Times New Roman', serif;">

              <div style="text-align:center;margin-bottom:22px;">
                <div style="display:inline-block;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8b6b2f;border:1px solid rgba(139,107,47,0.28);border-radius:999px;padding:8px 14px;background:rgba(255,255,255,0.55);">
                  Tu acceso premium ya está listo
                </div>
              </div>

              <div style="text-align:center;margin-bottom:20px;">
                <div style="font-size:30px;line-height:1;color:#8b6b2f;">✦</div>
                <h1 style="margin:10px 0 8px;font-size:30px;line-height:1.2;font-weight:normal;color:#241845;">
                  Accede a tu destino
                </h1>
                <p style="margin:0;font-size:15px;color:#6d5a7b;line-height:1.7;">
                  Tu mentoría premium te está esperando
                </p>
              </div>

              <div style="width:72px;height:1px;background:linear-gradient(90deg,transparent,#c6a45a,transparent);margin:22px auto 28px;"></div>

              <p style="margin:0 0 16px;font-size:17px;line-height:1.8;">
                Querida alma,
              </p>

              <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
                Tu espacio premium ya está preparado.
              </p>

              <p style="margin:0 0 22px;font-size:16px;line-height:1.85;">
                Pulsa el botón y completa tu formulario para que podamos comenzar a preparar tu respuesta personalizada.
              </p>

              <div style="text-align:center;margin:28px 0;">
                <a
                  href="${record.form_url}"
                  style="display:inline-block;background:#241845;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:bold;"
                >
                  Accede a tu destino
                </a>
              </div>

              <p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#6d5a7b;text-align:center;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                <span style="word-break:break-all;">${record.form_url}</span>
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
  })

  console.log("PREMIUM ACCESS EMAIL RESULT:", result)

  if (result?.error) {
    console.error("PREMIUM ACCESS EMAIL ERROR:", result.error)
    throw new Error(result.error.message || "Error enviando email premium")
  }

  return result
}

async function sendPremiumReceivedEmail(record) {
  if (!record.email) {
    console.log("PREMIUM RECEIVED EMAIL: no hay email en record")
    return null
  }

  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("Falta RESEND_FROM_EMAIL")
  }

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: record.email,
    subject: "✨ Hemos recibido tu formulario",
    html: `
      <div style="margin:0;padding:0;background:#f6f1e7;">
        <div style="max-width:680px;margin:0 auto;padding:32px 18px;">
          <div style="background:linear-gradient(180deg,#1a1330 0%,#241845 100%);border-radius:28px;padding:1px;box-shadow:0 20px 60px rgba(0,0,0,0.18);">
            <div style="background:linear-gradient(180deg,#fcf7ef 0%,#f7f1e6 100%);border-radius:27px;padding:36px 28px;color:#2b2238;font-family:Georgia, 'Times New Roman', serif;">

              <div style="text-align:center;margin-bottom:22px;">
                <div style="display:inline-block;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8b6b2f;border:1px solid rgba(139,107,47,0.28);border-radius:999px;padding:8px 14px;background:rgba(255,255,255,0.55);">
                  Formulario recibido
                </div>
              </div>

              <div style="text-align:center;margin-bottom:20px;">
                <div style="font-size:30px;line-height:1;color:#8b6b2f;">✦</div>
                <h1 style="margin:10px 0 8px;font-size:30px;line-height:1.2;font-weight:normal;color:#241845;">
                  Hemos recibido tu formulario
                </h1>
                <p style="margin:0;font-size:15px;color:#6d5a7b;line-height:1.7;">
                  Gracias por confiar en nosotras
                </p>
              </div>

              <div style="width:72px;height:1px;background:linear-gradient(90deg,transparent,#c6a45a,transparent);margin:22px auto 28px;"></div>

              <p style="margin:0 0 16px;font-size:17px;line-height:1.8;">
                Querida alma,
              </p>

              <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
                Hemos recibido correctamente tu formulario.
              </p>

              <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
                Tu respuesta personalizada será preparada con cuidado y profundidad.
              </p>

              <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
                La recibirás en un plazo de <strong>48 horas laborables</strong>.
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
  })

  console.log("PREMIUM RECEIVED EMAIL RESULT:", result)

  if (result?.error) {
    console.error("PREMIUM RECEIVED EMAIL ERROR:", result.error)
    throw new Error(result.error.message || "Error enviando confirmación premium")
  }

  return result
}

// ==============================
// WEBHOOK SHOPIFY (PREMIUM)
// ==============================

app.post("/api/premium/shopify/order-paid", async (req, res) => {
  try {
    if (!verifyShopify(req)) {
      console.log("PREMIUM WEBHOOK INVALID HMAC")
      return res.status(401).send("invalid")
    }

    const webhookId = String(req.get("X-Shopify-Webhook-Id") || "")
    if (webhookId && isPremiumWebhookProcessed(webhookId)) {
      console.log("PREMIUM WEBHOOK DUPLICADO:", webhookId)
      return res.status(200).json({ ok: true, duplicate: true })
    }

    if (webhookId) {
      markPremiumWebhookProcessed(webhookId)
    }

    const order = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body
    const email = order.email || order.contact_email || ""

    console.log("=== PREMIUM WEBHOOK RECIBIDO ===")
    console.log("ORDER ID:", order.id)
    console.log("ORDER NAME:", order.name)
    console.log("ORDER EMAIL:", email)
    console.log("LINE ITEMS:", JSON.stringify(order.line_items || [], null, 2))

    for (const item of order.line_items || []) {
      console.log("ITEM:", {
        title: item.title,
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity
      })

      const found = findPremium(item)
      console.log("PREMIUM FOUND:", found)

      if (!found) {
        console.log("ITEM IGNORADO: no coincide con premium")
        continue
      }

      const quantity = Number(item.quantity || 1)

      for (let i = 0; i < quantity; i += 1) {
        const id = createPremiumId(order.id, item.id, found.productId, i)

        const existing = db.prepare(`
          SELECT id FROM premium_requests
          WHERE id = ?
        `).get(id)

        if (existing) {
          console.log("PREMIUM REQUEST YA EXISTE:", id)
          continue
        }

        const record = {
          id,
          order_id: String(order.id),
          line_item_id: String(item.id),
          product_id: found.productId,
          product_name: found.config.name,
          premium_type: found.config.type,
          form_url: found.config.formUrl,
          customer_name: "",
          email,
          status: "pending_form",
          access_email_sent: 0,
          received_email_sent: 0,
          created_at: new Date().toISOString()
        }

        console.log("RECORD A GUARDAR:", record)

        db.prepare(`
          INSERT INTO premium_requests (
            id, order_id, line_item_id, product_id, product_name,
            premium_type, form_url, customer_name, email, status,
            access_email_sent, received_email_sent, created_at
          ) VALUES (
            @id, @order_id, @line_item_id, @product_id, @product_name,
            @premium_type, @form_url, @customer_name, @email, @status,
            @access_email_sent, @received_email_sent, @created_at
          )
        `).run(record)

        console.log("ENVIANDO EMAIL PREMIUM A:", record.email)

        const emailResult = await sendPremiumAccessEmail(record)

        if (emailResult && !emailResult.error) {
          db.prepare(`
            UPDATE premium_requests
            SET access_email_sent = 1
            WHERE id = ?
          `).run(record.id)

          console.log("EMAIL PREMIUM ENVIADO OK:", record.id)
        }
      }
    }

    return res.json({ ok: true })
  } catch (error) {
    console.error("PREMIUM WEBHOOK ERROR:", error)
    return res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

// ==============================
// FORM SUBMITTED
// ==============================

app.post("/api/premium/form-submitted", async (req, res) => {
  try {
    const { orderId, email } = req.body || {}

    console.log("=== PREMIUM FORM SUBMITTED ===")
    console.log("BODY:", JSON.stringify(req.body || {}, null, 2))

    if (!orderId || !email) {
      return res.status(400).json({
        ok: false,
        error: "Faltan orderId o email"
      })
    }

    const record = db.prepare(`
      SELECT *
      FROM premium_requests
      WHERE order_id = ? AND email = ?
      ORDER BY created_at DESC
    `).get(String(orderId), String(email).trim())

    console.log("PREMIUM REQUEST ENCONTRADO:", record)

    if (!record) {
      return res.status(404).json({
        ok: false,
        error: "Premium request no encontrado"
      })
    }

    db.prepare(`
      INSERT INTO premium_form_submissions (
        id, premium_request_id, payload_json, created_at
      ) VALUES (?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      record.id,
      JSON.stringify(req.body || {}),
      new Date().toISOString()
    )

    db.prepare(`
      UPDATE premium_requests
      SET status = ?, form_submitted_at = ?
      WHERE id = ?
    `).run("form_submitted", new Date().toISOString(), record.id)

    const updated = db.prepare(`
      SELECT *
      FROM premium_requests
      WHERE id = ?
    `).get(record.id)

    if (updated && !updated.received_email_sent) {
      const emailResult = await sendPremiumReceivedEmail(updated)

      if (emailResult && !emailResult.error) {
        db.prepare(`
          UPDATE premium_requests
          SET received_email_sent = 1
          WHERE id = ?
        `).run(updated.id)

        console.log("EMAIL CONFIRMACIÓN FORMULARIO ENVIADO:", updated.id)
      }
    }

    return res.json({ ok: true })
  } catch (error) {
    console.error("PREMIUM FORM SUBMITTED ERROR:", error)
    return res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

// ==============================
// HEALTH
// ==============================

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "premium-server"
  })
})

// ==============================
// START SERVER
// ==============================

const PORT = Number(process.env.PREMIUM_PORT) || Number(process.env.PORT) || 8081

app.listen(PORT, "0.0.0.0", () => {
  console.log(`premium server running on port ${PORT}`)
})
