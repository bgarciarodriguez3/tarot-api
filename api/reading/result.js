export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const body = req.body || {};
    const cards = Array.isArray(body.cards) ? body.cards : [];
    const deck = String(body.deck || body.deck_key || "").trim();
    const product = String(body.product || body.product_handle || "").trim();
    const spread = Number.isFinite(Number(body.spread)) ? Number(body.spread) : null;

    // ✅ Mapa de "cuántas cartas" por producto (handles Shopify)
    // Ajusta/añade aquí TODOS tus productos automatizados
    const PRODUCT_SPREAD = {
      // Ángeles (4)
      "mensaje-de-los-angeles": 4,
      "mensaje-de-los-angeles-tirada-de-4-cartas": 4,

      // Arcanos (3 y 12)
      "lectura-de-claridad-rapida-3-cartas": 3,
      "lectura-profunda-analisis-completo-12-cartas": 12,

      // (si luego pones Semilla 5)
      "camino-de-la-semilla-estelar": 5
    };

    // ✅ Determinar el número de cartas esperado
    // Prioridad: spread (URL) -> product handle -> default 4
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

    // ==========
    // A PARTIR DE AQUÍ: tu generación de lectura
    // ==========
    // Si tú ya tienes aquí OpenAI / prompts / lógica, ponla aquí.
    // Abajo dejo un "fallback" para que SIEMPRE devuelva short + long.

    const cardNames = cards.map((c) => c.id || c.name || c.title || "Carta").join(", ");

    // ✅ Fallback (si no tienes IA conectada todavía)
    // Si ya tienes IA, reemplaza estas 2 variables por la respuesta real.
    const shortText = `Lectura rápida (${expected} cartas): ${cardNames}.`;
    const longText =
      `Lectura completa (${expected} cartas)\n\n` +
      `Cartas: ${cardNames}\n\n` +
      `Mensaje: Estás en un punto de definición. Observa qué patrón se repite y decide desde la claridad, no desde la prisa.\n\n` +
      `Consejo: anota lo que sentiste al elegir cada carta y qué área de tu vida te recordó.`;

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
