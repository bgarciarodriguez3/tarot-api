export default async function handler(req, res) {
  // CORS para Shopify
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { product, order_id, line_item_id, selected_cards } = req.body || {};

    if (!Array.isArray(selected_cards) || selected_cards.length !== 4) {
      return res.status(400).json({ ok: false, error: "Invalid selected_cards" });
    }

    // 🔮 MAPA REAL DE TUS CARTAS (IDs → imágenes Shopify)
    const IMAGE_MAP = {
      Angel_Angel_de_la_Abundancia: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_de_la_Abundancia.png?v=1766518209",
      Angel_Angel_de_la_Guarda: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_de_la_Guarda.png?v=1766518235",
      Angel_Angel_de_los_Suenos: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_de_los_Suenos.png?v=1766518057",
      Angel_Angel_del_Nuevo_Comienzo: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_del_Nuevo_Comienzo.png?v=1766517962",
      Angel_Angel_del_Tiempo_Divino: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_del_Tiempo_Divino.png?v=1766518123",
      Angel_Arcangel_Chamuel: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Chamuel.png?v=1766518190",
      Angel_Arcangel_Gabriel: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Gabriel.png?v=1766518175",
      Angel_Arcangel_Jofiel: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Jofiel.png?v=1766518078",
      Angel_Angel_Arcangel_Miguel: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_Arcangel_Miguel.png?v=1766518039",
      Angel_Arcangel_Rafael: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Rafael.png?v=1766517900",
      Angel_Arcangel_Uriel: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Uriel.png?v=1766518157",
      Angel_Arcangel_Zadkiel: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Zadkiel.png?v=1766517937"
    };

    const cards = selected_cards.map((id) => ({
      id,
      name: id.replaceAll("_", " "),
      meaning: "Este es el mensaje que los ángeles tienen para ti en este momento.",
      image_url: IMAGE_MAP[id] || "",
      reversed: false
    }));

    return res.status(200).json({
      ok: true,
      product,
      order_id,
      line_item_id,
      cards,
      final_message: "✨ Confía: los ángeles te acompañan en este proceso."
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
}
