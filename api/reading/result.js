export default async function handler(req, res) {
  // ✅ CORS (Shopify -> Vercel)
  res.setHeader("Access-Control-Allow-Origin", "*"); // si quieres más estricto, luego lo cambiamos
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // ✅ Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ✅ Solo POST
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { product, order_id, line_item_id, selected_cards } = req.body || {};

    if (!product) {
      return res.status(400).json({ ok: false, error: "Missing product" });
    }
    if (!order_id || !line_item_id) {
      return res.status(400).json({ ok: false, error: "Missing order_id or line_item_id" });
    }
    if (!Array.isArray(selected_cards) || selected_cards.length !== 4) {
      return res.status(400).json({ ok: false, error: "selected_cards must be an array of 4" });
    }

    // ✅ MOCK TEMPORAL para comprobar que el front recibe cartas + significado
    // Luego lo conectamos a Airtable real
    const cards = selected_cards.map((id, idx) => ({
      id,
      name: id.replaceAll("_", " "),
      reversed: false,
      meaning: `Mensaje de prueba para la carta ${idx + 1}. (Luego vendrá el significado real desde Airtable)`,
      image_url:
        "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Dorso_tarot_de_los_angeles.jpg",
    }));

    return res.status(200).json({
      ok: true,
      product,
      deck_id: "angeles_12",
      order_id,
      line_item_id,
      cards,
      final_message: "✅ API OK (modo test). Ahora ya debería pintarte la lectura en Shopify.",
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message || "Internal error" });
  }
}
