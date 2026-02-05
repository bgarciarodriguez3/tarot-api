import Airtable from "airtable";

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY,
}).base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  const { productId } = req.query;

  if (!productId) {
    return res.status(400).json({
      ok: false,
      error: "Missing productId",
    });
  }

  try {
    // 👉 Leemos TODAS las cartas del producto (12)
    const records = await base("Cards")
      .select({
        filterByFormula: `{product_id} = "${productId}"`,
      })
      .all();

    if (!records.length) {
      return res.status(404).json({
        ok: false,
        error: "No cards found for this product",
      });
    }

    const cards = records.map((r) => {
      const f = r.fields;

      return {
        id: f.card_id || r.id,
        name: f.name || f.card_id || "Sin nombre",
        meaning: f.meaning || "",
        image: f.image || f.image_url || "",
        reversed: false, // 👈 NO forzamos cartas invertidas
      };
    });

    return res.status(200).json({
      ok: true,
      product_id: productId,
      deck_id: records[0].fields.deck_id,
      cards,
    });
  } catch (err) {
    console.error("SPREAD ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      details: err.message,
    });
  }
}
