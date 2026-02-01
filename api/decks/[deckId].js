// api/decks/[deckId].js

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID;

const DECKS_TABLE = process.env.AIRTABLE_DECKS_TABLE || "Decks";
const CARDS_TABLE = process.env.AIRTABLE_CARDS_TABLE || "Cards";

function escapeFormulaValue(v) {
  return String(v).replace(/"/g, '\\"');
}

async function airtableFetch(path) {
  if (!AIRTABLE_TOKEN) throw new Error("Missing AIRTABLE_TOKEN env var");
  if (!BASE_ID) throw new Error("Missing AIRTABLE_BASE_ID env var");

  const url = `https://api.airtable.com/v0/${BASE_ID}/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Airtable error ${res.status}: ${txt}`);
  }
  return res.json();
}

module.exports = async (req, res) => {
  try {
    // CORS básico (por si llamas desde Shopify)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const deckId = String(req.query.deckId || "").trim();
    if (!deckId) return res.status(400).json({ ok: false, error: "Missing deckId" });

    // 1) Buscar el deck por deck_id (texto)
    const deckFormula = `({deck_id} = "${escapeFormulaValue(deckId)}")`;
    const deckQuery = new URLSearchParams({
      maxRecords: "1",
      filterByFormula: deckFormula,
    });

    const deckData = await airtableFetch(`${encodeURIComponent(DECKS_TABLE)}?${deckQuery.toString()}`);
    const deckRec = deckData.records?.[0];

    if (!deckRec) {
      return res.status(404).json({ ok: false, error: `Deck not found: ${deckId}` });
    }

    const deckRecordId = deckRec.id;

    const back_image_url = deckRec.fields?.back_image_url || "";
    const notes = deckRec.fields?.notes || "";
    const status = deckRec.fields?.status || "";

    // 2) Cartas filtradas por recordId del linked field {deck_id}
    const cardsFormula = `FIND("${escapeFormulaValue(deckRecordId)}", ARRAYJOIN({deck_id}))`;
    const cardsQuery = new URLSearchParams({
      pageSize: "100",
      filterByFormula: cardsFormula,
    });

    const cardsData = await airtableFetch(`${encodeURIComponent(CARDS_TABLE)}?${cardsQuery.toString()}`);

    const cards = (cardsData.records || [])
      .map((r) => ({
        card_id: r.fields?.card_id || "",
        image_url: r.fields?.image_url || "",
        notes: r.fields?.notes || r.fields?.meaning || "",
      }))
      .filter((c) => c.card_id && c.image_url);

    return res.status(200).json({
      ok: true,
      deck: {
        deck_id: deckId,
        back_image_url,
        notes,
        status,
        cards_count: cards.length,
      },
      cards,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
};
