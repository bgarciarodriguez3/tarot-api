export default async function handler(req, res) {
  // 🔒 Solo permitimos POST
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed. Use POST."
    });
  }

  try {
    const { cards, product_id, test } = req.body || {};

    // 🧪 Validaciones básicas
    if (!Array.isArray(cards) || cards.length !== 4) {
      return res.status(400).json({
        ok: false,
        error: "Debes enviar exactamente 4 cartas."
      });
    }

    // 🔐 En producción podrías validar compra aquí
    // if (!test && !product_id) { ... }

    // 🔮 Ejemplo de lectura (puedes cambiar textos luego)
    const results = cards.map((id, index) => ({
      id,
      title: `Carta ${index + 1}`,
      short: `Mensaje breve para ${id}.`,
      long: `Este es el mensaje completo de la carta ${id}. 
Los ángeles te invitan a confiar, soltar el miedo y avanzar con serenidad.`,
      affirmation: `Confío en el proceso de mi vida.`
    }));

    // ✅ Respuesta correcta
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
