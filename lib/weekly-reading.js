// lib/weekly-reading.js

const OpenAI = require("openai");
const { redisGet, redisSet } = require("./redis-client");

// ===============================
// Semana en formato YYYY-WW (UTC)
// ===============================
function getYearWeekUTC(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // El jueves define la semana ISO
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const yyyy = d.getUTCFullYear();
  const ww = String(weekNo).padStart(2, "0");
  return `${yyyy}-${ww}`;
}

// ===============================
// Prompt para OpenAI
// ===============================
function buildPrompt({ productId, cards }) {
  const list = cards
    .map((c, i) => {
      const inv = c.reversed ? " (INVERTIDA)" : "";
      return `${i + 1}. ${c.name}${inv} — significado corto: ${c.meaning || "—"}`;
    })
    .join("\n");

  return `
Eres una experta en tarot angelical y canalización.
Quiero un TEXTO LARGO, profundo y muy bonito, en ESPAÑOL, con el estilo EXACTO del ejemplo proporcionado.

Formato obligatorio por carta:
- Título con emoji + Nombre de la carta + tema (ej: 💚 Arcángel Rafael - Sanación)

Secciones fijas:
🔮 SIGNIFICADO GENERAL
❤️ AMOR
💼 TRABAJO / PROPÓSITO
🌌 CONSEJO ESPIRITUAL
✨ CONSEJO ANGELICAL
🌈 AFIRMACIÓN
🔥 RITUAL – (tema)
CARTA INVERTIDA (solo si esa carta está invertida)

Reglas de estilo:
- Tono espiritual, cálido, poético, profundo, claro.
- Texto LARGO (como el ejemplo, no resumido).
- Usa párrafos, no listas secas.
- No suenes robótica.
- Usa separadores visuales como:
________________________________________

Contexto:
Producto / mazo: ${productId}

Cartas (12) y cuál está invertida:
${list}

Entrega:
- Devuélveme el texto COMPLETO para LAS 12 CARTAS.
- Separa cada carta con:
________________________________________
- Si una carta está invertida, añade al final su bloque "CARTA INVERTIDA" con 3–5 frases.
- NO inventes nombres de cartas.
- Usa los significados cortos como base, pero expándelos ampliamente.
`;
}

// ===============================
// Lectura semanal con caché
// ===============================
async function getWeeklyReading({ productId, cards }) {
  const week = getYearWeekUTC();

  // Firma única: orden + invertida
  const invertedIndex = cards.findIndex((c) => c.reversed === true);
  const signature = cards
    .map((c) => `${c.id || c.name}:${c.reversed ? 1 : 0}`)
    .join("|");

  const key = `weekly_reading:${productId}:${week}:${invertedIndex}:${signature}`;

  // 1️⃣ Intentar caché
  const cached = await redisGet(key);
  if (cached) {
    return {
      week,
      text: cached,
      cached: true,
    };
  }

  // 2️⃣ Llamar a OpenAI
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = buildPrompt({ productId, cards });
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.85,
    messages: [
      {
        role: "system",
        content:
          "Escribes lecturas de tarot angelical en español, profundas, cálidas y espirituales.",
      },
      { role: "user", content: prompt },
    ],
  });

  const text =
    completion.choices?.[0]?.message?.content?.trim() || "";

  // 3️⃣ Guardar en Redis (9 días por seguridad)
  await redisSet(key, text, { EX: 60 * 60 * 24 * 9 });

  return {
    week,
    text,
    cached: false,
  };
}

module.exports = {
  getWeeklyReading,
};
