function json(res, status, data, extraHeaders = {}) {
  Object.entries(extraHeaders).forEach(([k, v]) => res.setHeader(k, v));
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  };
}

export default async function handler(req, res) {
  try {
    const cors = corsHeaders();
    Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));

    // Preflight
    if (req.method === "OPTIONS") {
      return json(res, 200, { ok: true }, cors);
    }

    if (req.method !== "POST") {
      return json(res, 405, { ok: false, error: "Method not allowed" }, cors);
    }

    // Body seguro
    let body = req.body || {};
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const cards = Array.isArray(body.cards) ? body.cards : [];
    const spreadRaw = body.spread;
    const spreadNum = Number(spreadRaw);
    const spread = Number.isFinite(spreadNum) ? spreadNum : null;

    const deck = String(body.deck || body.deck_key || "").trim();
    const product = String(body.product || body.product_handle || "").trim();

    // ✅ Ajusta handles reales si lo necesitas
    const PRODUCT_SPREAD = {
      "mensaje-de-los-angeles": 4,
      "lectura-de-claridad-rapida-3-cartas": 3,
      "lectura-profunda-analisis-completo-12-cartas": 12,
      "camino-de-la-semilla-estelar": 5,
    };

    // spread manda si viene (lo envía tu JS)
    const expected =
      (spread && spread > 0 ? spread : null) ??
      PRODUCT_SPREAD[product] ??
      4;

    if (cards.length !== expected) {
      return json(
        res,
        400,
        {
          ok: false,
          error: `Debes enviar exactamente ${expected} cartas.`,
          expected,
          got: cards.length,
          deck,
          product,
          spread,
        },
        cors
      );
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

    return json(
      res,
      200,
      {
        ok: true,
        deck,
        product,
        spread: expected,
        cards,
        short: shortText,
        long: longText,
      },
      cors
    );
  } catch (e) {
    const cors = corsHeaders();
    Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
    return json(
      res,
      500,
      { ok: false, error: "Server error", detail: e?.message || String(e) },
      cors
    );
  }
}
