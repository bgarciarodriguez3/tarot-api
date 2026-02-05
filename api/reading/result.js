export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { product, order_id, line_item_id, selected_cards } = req.body;

  if (!selected_cards || selected_cards.length !== 4) {
    return res.status(400).json({ ok: false, error: "Invalid cards" });
  }

  // 🔮 MOCK temporal (luego lo conectamos a Airtable)
  const cards = selected_cards.map(id => ({
    id,
    name: id.replaceAll("_", " "),
    meaning: "Este es un mensaje de prueba para esta carta.",
    image_url: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Dorso_tarot_de_los_angeles.jpg"
  }));

  return res.status(200).json({
    ok: true,
    cards,
    final_message: "Confía: el mensaje llega en el momento perfecto ✨"
  });
}
