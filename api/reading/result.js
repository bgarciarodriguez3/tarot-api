import fetch from "node-fetch";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

const TABLE_CARDS = "Cards";

// CORS helper
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const {
      product,
      order_id,
      line_item_id,
      selected_cards
    } = req.body;

    // Validaciones mínimas
    if (!product || !Array.isArray(selected_cards) || selected_cards.length !== 4) {
      return res.status(400).json({
        ok: false,
        error: "Datos incompletos o cartas inválidas"
      });
    }

    // Solo Tarot de los Ángeles por ahora
    const deck_id = "angeles_12";

    // Construimos filtro Airtable
    const filterFormula = `
      AND(
        {deck_id}='${deck_id}',
        OR(${selected_cards.map(id => `{card_id}='${id}'`).join(",")})
      )
    `;

    const url =
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_CARDS}` +
      `?filterByFormula=${encodeURIComponent(filterFormula)}`;

    const airtableRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`
      }
    });

    const airtableData = await airtableRes.json();

    if (!airtableData.records || !airtableData.records.length) {
      return res.status(404).json({
        ok: false,
        error: "No se encontraron cartas"
      });
    }

    // Formateamos cartas
    const cards = airtableData.records.map(record => {
      const f = record.fields;

      return {
        id: f.card_id,
        name: f.meaning,
        image: f.image_url,
        back_image: f.back_image_url,
        meaning: f.meaning,
        reversed: Math.random() < 0.25 // 25% invertidas
      };
    });

    // Mensaje final (simple pero bonito)
    const final_message = `
Los ángeles han respondido a tu llamada.

Esta tirada no es casual: refleja el estado actual de tu energía
y los mensajes que necesitas integrar ahora mismo.

Lee cada carta con calma.
Permite que el mensaje resuene dentro de ti.
    `.trim();

    return res.status(200).json({
      ok: true,
      product,
      order_id,
      line_item_id,
      cards,
      final_message
    });

  } catch (err) {
    console.error("❌ ERROR reading/result:", err);
    return res.status(500).json({
      ok: false,
      error: "Error interno del servidor"
    });
  }
}
