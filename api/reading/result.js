// /api/reading/result.js

import fetch from "node-fetch";

function setCors(res) {
  // Si quieres, puedes cambiar "*" por tu dominio exacto:
  // https://eltarotdelaruedadelafortuna.com
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

async function airtableFetchCards({ deckId, cardIds }) {
  const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_PAT;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const CARDS_TABLE = process.env.AIRTABLE_CARDS_TABLE || "Cards";

  if (!AIRTABLE_API_KEY) throw new Error("Missing AIRTABLE_API_KEY / AIRTABLE_PAT");
  if (!AIRTABLE_BASE_ID) throw new Error("Missing AIRTABLE_BASE_ID");

  // Airtable filterByFormula: AND(deck_id="angeles_12", OR(card_id="...", card_id="..."))
  const orPart = cardIds.map((id) => `({card_id}="${id}")`).join(",");
  const formula = `AND({deck_id}="${deckId}", OR(${orPart}))`;

  const url =
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(CARDS_TABLE)}` +
    `?filterByFormula=${encodeURIComponent(formula)}`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });

  const j = await r.json();
  if (!r.ok) {
    const msg = j?.error?.message || j?.message || JSON.stringify(j);
    throw new Error("Airtable error: " + msg);
  }

  const records = j.records || [];
  const byCardId = new Map(
    records.map((rec) => [rec.fields?.card_id, rec.fields])
  );

  // Devuelve en el mismo orden en que el cliente seleccionó
  return cardIds.map((id) => {
    const f = byCardId.get(id);
    if (!f) return null;

    return {
      id,
      // En tu Airtable tienes "meaning" como nombre corto (con emoji).
      // Si tuvieras un campo "name", cámbialo aquí.
      name: f.meaning || id,
      meaning: f.long_meaning || f.meaning_long || f.description_long || f.meaning || "",
      image: f.image_url || "",
      back_image: f.back_image_url || "",
    };
  }).filter(Boolean);
}

function addReversals(cards, { probability = 0.2 } = {}) {
  // “de vez en cuando invertida”
  return cards.map((c) => {
    const reversed = Math.random() < probability;
    if (!reversed) return { ...c, reversed: false };

    // Si algún día añades un campo en Airtable tipo "meaning_reversed",
    // aquí lo puedes usar. Por ahora añadimos un bloque invertido.
    const extra =
      "\n\nCARTA INVERTIDA\nEsta carta invertida señala bloqueos, resistencias o un mensaje que pide integrar con paciencia. Observa qué emoción o patrón te está frenando y cómo puedes alinearte de nuevo.";

    return {
      ...c,
      reversed: true,
      meaning: (c.meaning || "") + extra,
    };
  });
}

// Mapea product -> deck_id real en Airtable
function resolveDeckId(product) {
  // En tu caso: “angeles” usa el deck_id "angeles_12"
  // Si luego añades más productos, amplía el mapping.
  const map = {
    angeles: "angeles_12",
  };
  return map[product] || product; // fallback: si mandas "angeles_12" ya directo
}

export default async function handler(req, res) {
  setCors(res);

  // ✅ Responder preflight CORS
  if (req.method === "OPTIONS") {
    return res.status(200).send("ok");
  }

  // (Opcional) healthcheck
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, hint: "Use POST with JSON body" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { product, order_id, line_item_id, selected_cards } = req.body || {};

    if (!product) return res.status(400).json({ ok: false, error: "Missing product" });
    if (!order_id) return res.status(400).json({ ok: false, error: "Missing order_id" });
    if (!line_item_id) return res.status(400).json({ ok: false, error: "Missing line_item_id" });
    if (!Array.isArray(selected_cards)) {
      return res.status(400).json({ ok: false, error: "selected_cards must be an array" });
    }
    if (selected_cards.length !== 4) {
      return res.status(400).json({ ok: false, error: "You must select exactly 4 cards" });
    }

    const deckId = resolveDeckId(product);

    // 1) Leer cartas desde Airtable
    let cards = await airtableFetchCards({ deckId, cardIds: selected_cards });

    if (!cards.length) {
      return res.status(404).json({ ok: false, error: "Cards not found in Airtable for this deck" });
    }

    // 2) Invertidas (probabilidad configurable)
    const p = Number(process.env.REVERSED_PROBABILITY || "0.2");
    cards = addReversals(cards, { probability: isNaN(p) ? 0.2 : p });

    // 3) Mensaje final (simple, para empezar)
    const final_message =
      "RESUMEN FINAL\nRespira hondo. Estas cartas te invitan a observar tu situación con honestidad, confiar en tu guía interna y dar un paso pequeño pero firme. Quédate con el mensaje que más resuene y llévalo a una acción concreta esta semana.";

    return res.status(200).json({
      ok: true,
      product,
      deck_id: deckId,
      order_id,
      line_item_id,
      cards,
      final_message,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
}
