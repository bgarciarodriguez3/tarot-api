// /api/reading/result.js
import fetch from "node-fetch";

const ALLOWED_ORIGIN = process.env.SHOPIFY_ORIGIN || "*";

// Ajusta estos nombres a tus env vars reales
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
// Si tú la tienes como AIRTABLE_TABLE_CARDS, cámbiala aquí:
const AIRTABLE_CARDS_TABLE = process.env.AIRTABLE_CARDS_TABLE || process.env.AIRTABLE_TABLE_CARDS || "Cards";

function airtableUrl(path) {
  return `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_CARDS_TABLE)}${path}`;
}

async function airtableFetch(path) {
  const res = await fetch(airtableUrl(path), {
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Airtable error: ${res.status} ${txt}`);
  }
  return res.json();
}

// Probabilidad de invertida (0.2 = 20%)
function isReversed() {
  return Math.random() < 0.2;
}

export default async function handler(req, res) {
  // -------------------------
  // CORS
  // -------------------------
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const {
      product,        // "angeles"
      order_id,
      line_item_id,
      selected_cards, // ["Angel_Arcangel_Rafael", ...] (4)
      test_mode = false, // opcional
    } = req.body || {};

    if (!product || !order_id || !line_item_id || !Array.isArray(selected_cards) || selected_cards.length !== 4) {
      return res.status(400).json({ ok: false, error: "Datos incompletos o inválidos" });
    }

    // En producción aquí luego validamos pedido real (Shopify).
    // En test_mode permitimos pasar.
    if (!test_mode && (String(order_id).startsWith("TEST") || String(line_item_id).startsWith("TEST"))) {
      return res.status(401).json({ ok: false, error: "Pedido inválido (modo producción)" });
    }

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_CARDS_TABLE) {
      return res.status(500).json({ ok: false, error: "Faltan variables de entorno de Airtable" });
    }

    // -------------------------
    // Traer cartas por ID desde Airtable
    // -------------------------
    // IMPORTANTE: aquí asumimos que en Airtable existe un campo "id"
    // con valores EXACTOS como: Angel_Arcangel_Rafael, etc.
    // Y campos:
    // - name
    // - meaning_long
    // - meaning_long_reversed (opcional)
    // - meaning_short (opcional)
    //
    // Si tus campos se llaman distinto, dime cómo están y lo adapto.
    const cards = [];

    for (const cardId of selected_cards) {
      const formula = `({id} = "${String(cardId).replace(/"/g, '\\"')}")`;
      const data = await airtableFetch(`?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`);

      if (!data.records || !data.records.length) {
        throw new Error(`Carta no encontrada en Airtable: ${cardId}`);
      }

      const f = data.records[0].fields || {};
      const reversed = isReversed();

      const name = f.name || f.Nombre || cardId;

      const normalLong = f.meaning_long || f.significado_largo || f.meaning || "";
      const reversedLong =
        f.meaning_long_reversed ||
        f.significado_largo_invertida ||
        f.reversed_meaning ||
        "";

      const meaning_long = reversed && reversedLong ? reversedLong : normalLong;

      cards.push({
        id: cardId,
        name,
        reversed,
        meaning_long,
        meaning_short: f.meaning_short || f.significado_corto || "",
      });
    }

    // -------------------------
    // Mensaje final (por ahora fijo)
    // Luego lo cambiamos por OpenAI + “semana”
    // -------------------------
    const final_message =
      "Tu tirada te habla de guía, protección y claridad. Confía en el ritmo divino: estás exactamente donde necesitas estar.";

    return res.status(200).json({
      ok: true,
      product,
      order_id,
      line_item_id,
      cards,
      final_message,
    });
  } catch (err) {
    console.error("❌ reading/result:", err);
    return res.status(500).json({ ok: false, error: err.message || "Error interno" });
  }
}
