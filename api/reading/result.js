export default async function handler(req, res) {
  try {
    // ====== CORS ======
    const origin = req.headers.origin || "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");

    // Preflight
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const body = req.body || {};
    const cards = Array.isArray(body.cards) ? body.cards : [];

    const spreadRaw = body.spread;
    const spread = Number.isFinite(Number(spreadRaw)) ? Number(spreadRaw) : null;

    const deck = String(body.deck || body.deck_key || "").trim();
    const product = String(body.product || body.product_handle || "").trim();

    // Ajusta handles reales si quieres
    const PRODUCT_SPREAD = {
      "mensaje-de-los-angeles": 4,
      "lectura-de-claridad-rapida-3-cartas": 3,
      "lectura-profunda-analisis-completo-12-cartas": 12,
      "camino-de-la-semilla-estelar": 5
    };

    // spread por URL manda (es lo que envía tu JS)
    const expected =
      (spread && spread > 0 ? spread : null) ??
      PRODUCT_SPREAD[product] ??
      4;

    if (cards.length !== expected) {
      return res.status(400).json({
        ok: false,
        error: `Debes enviar exactamente ${expected} cartas.`,
        expected,
        got: cards.length,
        deck,
        product,
        spread
      });
    }

    const names = cards
      .map((c) => c.card_id || c.id || c.name || c.title || "Carta")
      .join(", ");

    const shortText = `Lectura (${expected} cartas): ${names}.`;
    const longText =
      `LECTURA COMPLETA (${expected} cartas)\n\n` +
      `Cartas: ${names}\n\n` +
      `Mensaje: Este es un momento de claridad y decisión. Observa qué tema se repite y actúa desde la calma.\n\n` +
      `Consejo: escribe qué sentiste al elegir cada carta y qué área de tu vida te recordó.`;

    return res.status(200).json({
      ok: true,
      deck,
      product,
      spread: expected,
      cards,
      short: shortText,
      long: longText
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "Server error",
      detail: e?.message || String(e)
    });
  }
}
