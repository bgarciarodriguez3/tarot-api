export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { product, order_id, line_item_id, selected_cards } = req.body || {};

    if (!product) return res.status(400).json({ ok: false, error: "Missing product" });
    if (!order_id || !line_item_id) {
      return res.status(400).json({ ok: false, error: "Missing order_id or line_item_id" });
    }
    if (!Array.isArray(selected_cards) || selected_cards.length !== 4) {
      return res.status(400).json({ ok: false, error: "selected_cards must be an array of 4" });
    }

    // KV
    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
    const KV_KEY = "significados:angeles:semanal_v1";

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
      return res.status(500).json({ ok: false, error: "Missing KV env vars" });
    }

    const kvGetResp = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent(KV_KEY)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
    });

    const kvJson = await kvGetResp.json().catch(() => null);
    const kvRaw = kvJson?.result || null;

    let weekly = null;
    if (kvRaw) {
      try {
        weekly = JSON.parse(kvRaw);
      } catch {
        weekly = null;
      }
    }

    // En tu refresh se guardó como "meanings"
    const longTexts = weekly?.meanings || weekly?.significados || {};

    // Mapa de imágenes
    const IMAGES = {
      Dorso_ANGELES:
        "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Dorso_tarot_de_los_angeles.png?v=1766518255",

      Angel_Arcangel_Rafael:
        "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Rafael.png?v=1766517900",
      Angel_Angel_de_la_Guarda:
        "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_de_la_Guarda.png?v=1766518235",
      Angel_Angel_de_la_Abundancia:
        "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_de_la_Abundancia.png?v=1766518209",
      Angel_Arcangel_Chamuel:
        "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Chamuel.png?v=1766518190",
      Angel_Arcangel_Gabriel:
        "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Gabriel.png?v=1766518175",
      Angel_Arcangel_Uriel:
        "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Uriel.png?v=1766518157",
      Angel_Angel_del_Tiempo_Divino:
        "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_del_Tiempo_Divino.png?v=1766518123",
      Angel_Arcangel_Jofiel:
        "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Jofiel.png?v=1766518078",
      Angel_Angel_de_los_Suenos:
        "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_de_los_Suenos.png?v=1766518057",
      Angel_Angel_Arcangel_Miguel:
        "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_Arcangel_Miguel.png?v=1766518039",
      Angel_Angel_del_Nuevo_Comienzo:
        "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Angel_del_Nuevo_Comienzo.png?v=1766517962",
      Angel_Arcangel_Zadkiel:
        "https://cdn.shopify.com/s/files/1/0989/4694/1265/files/Angel_Arcangel_Zadkiel.png?v=1766517937"
    };

    const cleanName = (id) => String(id || "").replaceAll("_", " ").trim();

    // ✅ Normaliza lo que venga de Shopify a un ID estándar tipo Angel_Angel_Arcangel_Miguel
    const normalizeId = (raw) => {
      if (!raw) return "";
      let s = String(raw).trim();

      // si viene con espacios, lo convertimos a _
      s = s.replace(/\s+/g, "_");

      // si viene sin prefijo Angel_, se lo ponemos
      if (!s.startsWith("Angel_")) s = "Angel_" + s;

      // arreglar casos típicos:
      // "Angel_Arcangel_Miguel" debería ser "Angel_Angel_Arcangel_Miguel" (según tu lista)
      if (s === "Angel_Arcangel_Miguel") s = "Angel_Angel_Arcangel_Miguel";

      return s;
    };

    // Buscar meaning por varios caminos
    const getMeaning = (rawId) => {
      const id1 = String(rawId || "");
      const id2 = normalizeId(rawId);

      if (longTexts[id1]) return longTexts[id1];
      if (longTexts[id2]) return longTexts[id2];

      // Búsqueda “por nombre” (último recurso)
      const n1 = cleanName(id1).toLowerCase();
      const n2 = cleanName(id2).toLowerCase();
      const keys = Object.keys(longTexts);

      const foundKey = keys.find(k => cleanName(k).toLowerCase() === n1)
        || keys.find(k => cleanName(k).toLowerCase() === n2);

      if (foundKey) return longTexts[foundKey];

      return null;
    };

    const cards = selected_cards.map((rawId) => {
      const id = normalizeId(rawId) || String(rawId || "");
      const meaning = getMeaning(rawId);

      return {
        id,
        name: cleanName(id),
        meaning: meaning || "No se encontró el texto largo para esta carta (revisa los IDs enviados desde Shopify).",
        image_url: IMAGES[id] || IMAGES.Dorso_ANGELES
      };
    });

    // Para depurar rápido SIN mirar logs:
    // devolvemos qué ids llegaron y qué ids se usaron
    return res.status(200).json({
      ok: true,
      product,
      deck_id: "angeles_12",
      order_id,
      line_item_id,
      actualizado_a_las: weekly?.actualizado_a_las || weekly?.updated_at || null,
      debug: {
        selected_cards_raw: selected_cards,
        selected_cards_normalized: selected_cards.map(normalizeId),
        kv_keys_count: Object.keys(longTexts).length
      },
      cards,
      final_message: "✨ Lectura lista."
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message || "Internal error" });
  }
}
