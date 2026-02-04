// lib/weekly-reading.js
const OpenAI = require("openai");
const { getRedis } = require("./redis-client");

// Semana en formato YYYY-WW (ISO week aprox)
function getYearWeekUTC(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Jueves decide la semana ISO
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const yyyy = d.getUTCFullYear();
  const ww = String(weekNo).padStart(2, "0");
  return `${yyyy}-${ww}`;
}

function buildPrompt({ productId, cards }) {
  // cards = [{name, meaning, reversed:boolean}]
  const list = cards
    .map((c, i) => {
      const inv = c.reversed ? " (INVERTIDA)" : "";
      return `${i + 1}. ${c.name}${inv} — significado corto: ${c.meaning || "—"}`;
    })
    .join("\n");

  return `
Eres una experta en tarot angelical y canalización.
Quiero un TEXTO LARGO, profundo y muy bonito, en ESPAÑOL, con el estilo EXACTO de este ejemplo:
- Empieza cada carta con un título con emoji + Nombre de la carta + tema (ej: 💚 Arcángel Rafael - Sanación)
- Secciones fijas por carta:
  🔮 SIGNIFICADO GENERAL
  ❤️ AMOR
  💼 TRABAJO / PROPÓSITO
  🌌 CONSEJO ESPIRITUAL
  ✨ CONSEJO ANGELICAL
  🌈 AFIRMACIÓN
  🔥 RITUAL – (tema)
  CARTA INVERTIDA (solo si esa carta está invertida)
- Tono: espiritual, cálido, poético, muy claro, sin sonar “robot”.
- Longitud: parecido al ejemplo que te he dado (largo de verdad), no corto.
- No uses viñetas excesivas; usa párrafos y separadores como en el ejemplo.

Contexto:
Producto/mazo: ${productId}
Cartas (12) y cuál está invertida:
${list}

Entrega:
- Devuélveme el texto completo para LAS 12 CARTAS, una detrás de otra, separadas por una línea:
________________________________________
- Si una carta está invertida, añade al final de su bloque el apartado "CARTA INVERTIDA" con 3-5 frases.

Importante:
- No inventes nombres de cartas: usa los que te doy.
- Usa los significados cortos como base, pero expándelos mucho.
`;
}

async function getWeeklyReading({ productId, cards }) {
  const week = getYearWeekUTC();
  const invertedIndex = cards.findIndex((c) => c.reversed === true);

  // clave semanal: depende de semana + orden de cartas + cuál invertida
  const signature = cards.map((c) => `${c.id || c.name}:${c.reversed ? 1 : 0}`).join("|");
  const key = `weekly_reading:${productId}:${week}:${invertedIndex}:${signature}`;

  const redis = getRedis();
  const cached = await redis.get(key);
  if (cached) return { week, text: cached, cached: true };

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = buildPrompt({ productId, cards });

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.85,
    messages: [
      { role: "system", content: "Escribes lecturas de tarot angelical en español, cálidas y profundas." },
      { role: "user", content: prompt },
    ],
  });

  const text = completion.choices?.[0]?.message?.content?.trim() || "";

  // Guardamos 9 días (por si cambias de semana y hay desfase de zona horaria)
  await redis.set(key, text, { EX: 60 * 60 * 24 * 9 });

  return { week, text, cached: false };
}

module.exports = { getWeeklyReading };
