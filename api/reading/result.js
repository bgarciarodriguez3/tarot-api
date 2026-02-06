// api/reading/result.js
import { kvGetJson } from "../../lib/kv.js";

const KV_KEY = "meanings:angeles:weekly_v1";

const IMAGES = {
  Dorso_ANGELES: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Dorso_tarot_de_los_angeles.png?v=1766518255",

  Angel_Arcangel_Rafael: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Rafael.png?v=1766517900",
  Angel_Angel_de_la_Guarda: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_de_la_Guarda.png?v=1766518235",
  Angel_Angel_de_la_Abundancia: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_de_la_Abundancia.png?v=1766518209",
  Angel_Arcangel_Chamuel: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Chamuel.png?v=1766518190",
  Angel_Arcangel_Gabriel: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Gabriel.png?v=1766518175",
  Angel_Arcangel_Uriel: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Uriel.png?v=1766518157",
  Angel_Angel_del_Tiempo_Divino: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_del_Tiempo_Divino.png?v=1766518123",
  Angel_Arcangel_Jofiel: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Jofiel.png?v=1766518078",
  Angel_Angel_de_los_Suenos: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_de_los_Suenos.png?v=1766518057",
  Angel_Angel_Arcangel_Miguel: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_Arcangel_Miguel.png?v=1766518039",
  Angel_Angel_del_Nuevo_Comienzo: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_del_Nuevo_Comienzo.png?v=1766517962",
  Angel_Arcangel_Zadkiel: "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Zadkiel.png?v=1766517937"
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function cleanName(id) {
  // Angel_Angel_de_la_Abundancia -> Angel Angel de la Abundancia
  return String(id || "").replaceAll("_", " ").trim();
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { product, order_id, line_item_id, selected_cards } = req.body || {};

    if (!product) return res.status(400).json({ ok: false, error: "Missing product" });
    if (!order_id || !line_item_id) return res.status(400).json({ ok: false, error: "Missing order_id or line_item_id" });
    if (!Array.isArray(selected_cards) || selected_cards.length !== 4) {
      return res.status(400).json({ ok: false, error: "selected_cards must be an array of 4" });
    }

    // Traemos los textos largos “de esta semana” desde KV
    const weekly = await kvGetJson(KV_KEY);
    const meanings = weekly?.meanings || {};

    const cards = selected_cards.map((id) => {
      const meaning_long = meanings[id] || "Mensaje largo no disponible todavía (se regenerará el lunes).";
      const image_url = IMAGES[id] || IMAGES.Dorso_ANGELES;

      return {
        id,
        name: cleanName(id),
        meaning: meaning_long,
        image_url
      };
    });

    return res.status(200).json({
      ok: true,
      product,
      order_id,
      line_item_id,
      deck_id: "angeles_12",
      weekly_updated_at: weekly?.updated_at || null,
      cards,
      final_message: "✨ Tu mensaje está listo."
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message || "Internal error" });
  }
}
