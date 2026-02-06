export default async function handler(req, res) {
  // ✅ Cambia esto si quieres permitir varios dominios
  const ALLOWED_ORIGIN = "https://eltarotdelaruedadelafortuna.com";

  // 🔧 CORS headers (SIEMPRE)
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // ✅ Responder preflight (MUY IMPORTANTE)
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // 🔒 Solo POST
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed. Use POST."
    });
  }

  try {
    const { cards, product_id, test } = req.body || {};

    if (!Array.isArray(cards) || cards.length !== 4) {
      return res.status(400).json({
        ok: false,
        error: "Debes enviar exactamente 4 cartas."
      });
    }

    // ✅ Lectura demo (cambia textos luego)
    const results = cards.map((id, index) => ({
      id,
      title: `Carta ${index + 1}`,
      short: `Mensaje breve para ${id}.`,
      long:
        `Este es el mensaje completo de la carta ${id}.\n` +
        `Los ángeles te invitan a confiar, soltar el miedo y avanzar con serenidad.`,
      affirmation: `Confío en el proceso de mi vida.`
    }));

    return res.status(200).json({
      ok: true,
      results
    });
  } catch (err) {
    console.error("API reading error:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
}
