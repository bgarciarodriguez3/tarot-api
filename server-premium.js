app.post("/api/premium/shopify/order-paid", (req, res) => {
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

    if (!Buffer.isBuffer(req.body)) {
      console.log("PREMIUM WEBHOOK: body no es Buffer")
      return res.status(400).json({ ok: false, error: "invalid raw body" })
    }

    const rawBody = req.body.toString("utf8")
    const order = JSON.parse(rawBody)

    console.log("=== PREMIUM WEBHOOK RECIBIDO ===")
    console.log("WEBHOOK ID:", webhookId)
    console.log("ORDER ID:", order?.id)
    console.log("ORDER NAME:", order?.name)
    console.log("ORDER EMAIL:", order?.email || order?.contact_email || "")
    console.log("LINE ITEMS COUNT:", Array.isArray(order?.line_items) ? order.line_items.length : 0)

    // Responder rápido a Shopify
    res.status(200).json({ ok: true })

    // Procesar después de responder
    setImmediate(async () => {
      try {
        const email = order.email || order.contact_email || ""

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

            if (!record.email) {
              console.log("NO SE ENVÍA EMAIL: order sin email")
              continue
            }

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

        if (webhookId) {
          markPremiumWebhookProcessed(webhookId)
        }

        console.log("PREMIUM WEBHOOK PROCESADO OK:", webhookId)
      } catch (error) {
        console.error("PREMIUM WEBHOOK ASYNC ERROR:", error)
      }
    })
  } catch (error) {
    console.error("PREMIUM WEBHOOK ERROR:", error)
    return res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})
