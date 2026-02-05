// api/reading/result.js

import crypto from "crypto";
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const {
      product,          // "angeles"
      order_id,         // Shopify order id
      line_item_id,     // Shopify line item id
      selected_cards    // array de 4 IDs de cartas
    } = req.body;

    if (!product || !order_id || !line_item_id || !Array.isArray(selected_cards)) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    if (selected_cards.length !== 4) {
      return res.status(400).json({ ok: false, error: "You must select exactly 4 cards" });
    }

    // ===============================
    // 1️⃣ Obtener textos largos (Airtable)
    // ===============================
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_TABLE = process.env.AIRTABLE_CARDS_TABLE || "Cards";

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return res.status(500).json({ ok: false, error: "Airtable not configured" });
    }

    const cards = [];

    for (const cardId of selected_cards) {
      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE}?filterByFormula={id}='${cardId}'`;

      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        },
      });

      const data = await r.json();
      if (!data.records || !data.records.length) {
        return res.status(404).json({ ok: false, error: `Card not found: ${cardId}` });
      }

      cards.push(data.records[0].fields);
    }

    // ===============================
    // 2️⃣ Calcular cartas invertidas (20 %, determinista)
    // ===============================
    const weekSeed = new Date().toISOString().slice(0, 10); // yyyy-mm-dd

    const finalCards = cards.map((card) => {
      const seed = `${order_id}-${line_item_id}-${card.id}-${weekSeed}`;
      const hash = crypto.createHash("sha256").update(seed).digest("hex");
      const reversed = parseInt(hash.slice(0, 2), 16) % 5 === 0; // ~20 %

      return {
        id: card.id,
        name: card.name,
        image: card.image,
        reversed,
        text: reversed ? card.meaning_reversed : card.meaning,
      };
    });

    // ===============================
    // 3️⃣ Resumen final con OpenAI
    // ===============================
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: "OpenAI not configured" });
    }

    const prompt = `
Eres un lector espiritual experto.
Integra estas 4 cartas del Tarot de los Ángeles en un mensaje final claro,
amoroso y profundo para el consultante.

Cartas:
${finalCards.map(c => `- ${c.name}${c.reversed ? " (invertida)" : ""}`).join("\n")}

Mensaje final:
`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
      }),
    });

    const openaiData = await openaiRes.json();
    const final_message =
      openaiData.choices?.[0]?.message?.content || "";

    // ===============================
    // 4️⃣ Respuesta final al cliente
    // ===============================
    return res.status(200).json({
      ok: true,
      product,
      order_id,
      cards: finalCards,
      final_message,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
}
