export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const body = req.body || {};
    const cards = Array.isArray(body.cards) ? body.cards : [];
    const spreadRaw = body.spread;
    const spread = Number.isFinite(Number(spreadRaw)) ? Number(spreadRaw) : null;

    const deck = String(body.deck || body.deck_key || "").trim();
    const product = String(body.product || body.product_handle || "").trim();

    // ✅ Ajusta aquí tus handles reales
    const PRODUCT_SPREAD = {
      // Ángeles (4)
      "mensaje-de-los-angeles": 4,

      // Arcanos (3 / 12)
      "lectura-de-claridad-rapida-3-cartas": 3,
      "lectura-profunda-analisis-completo-12-cartas": 12,

      // Semilla (si aplica)
      "camino-de-la-semilla-estelar": 5
    };

    // ✅ Determina cuántas cartas se esperan
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

    // ====== Resultado mínimo estable (para que NO salga vacío nunca) ======
    const names = cards.map((c) => c.card_id || c.id || c.name || c.title || "Carta").join(", ");

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
