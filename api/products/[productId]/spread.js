// pages/api/products/[productId]/spread.js

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const productId = String(req.query.productId || "").trim();
    if (!productId) {
      return res.status(400).json({ ok: false, error: "Missing productId" });
    }

    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const TABLE = process.env.AIRTABLE_TABLE_CARDS || "Cards"; // tu tabla se llama "Cards"

    if (!AIRTABLE_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing AIRTABLE_API_KEY in environment variables",
      });
    }

    if (!AIRTABLE_BASE_ID) {
      return res.status(500).json({
        ok: false,
        error: "Missing AIRTABLE_BASE_ID in environment variables",
      });
    }

    // En tu Airtable existen: product_id y deck_id.
    // Probamos primero por product_id. Si no devuelve, probamos por deck_id.
    const records =
      (await fetchCards({
        baseId: AIRTABLE_BASE_ID,
        apiKey: AIRTABLE_API_KEY,
        table: TABLE,
        filterByFormula: `{product_id}="${escapeAirtableValue(productId)}"`,
      })) ||
      [];

    const recordsFallback =
      records.length > 0
        ? records
        : (await fetchCards({
            baseId: AIRTABLE_BASE_ID,
            apiKey: AIRTABLE_API_KEY,
            table: TABLE,
            filterByFormula: `{deck_id}="${escapeAirtableValue(productId)}"`,
          })) || [];

    const normalized = recordsFallback.map((r) => {
      const f = r.fields || {};

      // Tus columnas: card_id, meaning, image_url
      const rawCardId = String(f.card_id || r.id || "").trim();
      const rawMeaning = typeof f.meaning === "string" ? f.meaning : "";
      const rawImage = typeof f.image_url === "string" ? f.image_url.trim() : "";

      // Si existiera un campo name, lo usamos; si no, lo inferimos desde card_id
      const name =
        (typeof f.name === "string" && f.name.trim()) ||
        inferNameFromCardId(rawCardId) ||
        rawCardId ||
        "Carta";

      return {
        id: rawCardId || r.id,
        name,
        meaning: rawMeaning,
        image: rawImage,
        reversed: false, // 👈 NO forzamos invertidas aquí (el cliente decide si gira o no)
      };
    });

    // Si no hay 12, devolvemos igual lo que haya pero con aviso útil
    if (normalized.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "No cards found for this productId",
        details:
          'Revisa que en Airtable (Cards) haya filas con product_id="' +
          productId +
          '" (o deck_id) y que existan columnas: card_id, meaning, image_url.',
      });
    }

    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json({
      ok: true,
      productId,
      spread: productId,
      cards: normalized,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      details: err?.message || String(err),
    });
  }
}

async function fetchCards({ baseId, apiKey, table, filterByFormula }) {
  const url =
    `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}` +
    `?pageSize=100&filterByFormula=${encodeURIComponent(filterByFormula)}`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const data = await r.json();
  if (!r.ok) {
    // Airtable devuelve "error" con message/type normalmente
    const msg =
      data?.error?.message ||
      data?.error ||
      data?.message ||
      "Airtable request failed";
    throw new Error(`Airtable error (${r.status}): ${msg}`);
  }

  return Array.isArray(data.records) ? data.records : [];
}

function escapeAirtableValue(s) {
  // Airtable strings usan comillas dobles; escapamos comillas internas
  return String(s).replace(/"/g, '\\"');
}

function inferNameFromCardId(cardId) {
  // Ej: Angel_Angel_Arcangel_Miguel -> Miguel
  // Ej: Angel_Arcangel_Gabriel -> Gabriel
  if (!cardId) return "";

  const parts = String(cardId).split("_").filter(Boolean);
  if (parts.length === 0) return "";

  // último token suele ser el nombre
  const last = parts[parts.length - 1];

  // arreglitos cosméticos
  const pretty = last
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return pretty ? pretty : "";
}
