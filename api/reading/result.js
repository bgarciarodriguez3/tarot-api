export default async function handler(req, res) {
  // ✅ CORS (Shopify -> Vercel)
  res.setHeader("Access-Control-Allow-Origin", "*");
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

    // ✅ MOCK (para que Shopify pinte imágenes ya)
    // IMPORTANTE: Cambia estas URLs por las reales cuando las tengas en Shopify CDN o donde sea.
    const mockImages = [
      "https://via.placeholder.com/800x1200.png?text=ANGEL+1",
      "https://via.placeholder.com/800x1200.png?text=ANGEL+2",
      "https://via.placeholder.com/800x1200.png?text=ANGEL+3",
      "https://via.placeholder.com/800x1200.png?text=ANGEL+4",
    ];

    const cards = selected_cards.map((id, idx) => ({
      id,
      name: id.replaceAll("_", " "),
      reversed: false,
      meaning: `Mensaje de prueba para ${id}. (Aquí irá el significado real desde Airtable)`,
      image_url: mockImages[idx] || mockImages[0],
    }));

    return res.status(200).json({
      ok: true,
      product,
      deck_id: "angeles_12",
      order_id,
      line_item_id,
      cards,
      final_message: "✅ Lectura generada (modo test).",
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message || "Internal error" });
  }
}
