export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Método no permitido" });

  const { product, order_id, line_item_id, selected_cards } = req.body || {};

  if (!product) return res.status(400).json({ ok: false, error: "Missing product" });
  if (!order_id || !line_item_id) return res.status(400).json({ ok: false, error: "Missing order_id or line_item_id" });
  if (!Array.isArray(selected_cards) || selected_cards.length !== 4) {
    return res.status(400).json({ ok: false, error: "selected_cards must be 4" });
  }

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

  // ✅ Textos largos (de ejemplo). Sustituye por tus significados reales cuando quieras.
  const MEANING_MAP = Object.fromEntries(Object.keys(IMAGE_MAP).map(id => ([
    id,
    `Este ángel te recuerda que no estás sola y que la guía llega en el momento perfecto.\n\nObserva qué parte de ti pide calma, qué decisión necesita claridad y qué paso pequeño puedes dar hoy. Confía en tu intuición, pide ayuda si la necesitas y avanza con suavidad.\n\nAfirmación: “Estoy acompañada y camino con fe.”`
  ])));

  const cards = selected_cards.map((id) => ({
    id,
    name: id.replaceAll("_", " "),
    meaning: MEANING_MAP[id] || "Recibe este mensaje con calma y confía en tu guía interior.",
    image_url: IMAGE_MAP[id] || "",
    reversed: false
  }));

  return res.status(200).json({
    ok: true,
    product,
    order_id,
    line_item_id,
    cards,
    final_message:
      "Mensaje final:\n\nConfía en el proceso. Hoy se te pide paciencia, claridad y un paso firme. Respira, escucha y actúa desde el amor."
  });
}
