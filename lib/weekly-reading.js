// lib/weekly-reading.js
const OpenAI = require("openai");
const { getRedis } = require("./redis-client");

// Semana ISO simple (año-semana)
function weekKeyUTC(d = new Date()) {
  // jueves define la semana ISO
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  const yyyy = date.getUTCFullYear();
  return `${yyyy}-W${String(weekNo).padStart(2, "0")}`;
}

function buildPrompt({ card, reversed }) {
  const baseName = card?.name || "Carta";
  const short = card?.meaning || "";

  return `
Eres una experta en lecturas angelicales en español. 
Devuelve un texto MUY LARGO (mínimo 1200 palabras aprox), con secciones y emojis como el ejemplo.

Carta: ${baseName}
Significado corto (referencia): ${short}
Estado: ${reversed ? "INVERTIDA" : "NORMAL"}

Estructura obligatoria (con títulos):
- 💚 <Nombre> - <tema>
- 🔮 SIGNIFICADO GENERAL
- ❤️ AMOR
- 💼 TRABAJO / PROPÓSITO
- 🌌 CONSEJO ESPIRITUAL
- ✨ CONSEJO ANGELICAL
- 🌈 AFIRMACIÓN
- 🔥 RITUAL – (tema)
- Si es invertida: incluye al final un bloque "CARTA INVERTIDA" y explícalo (si no es invertida, NO incluyas ese bloque)

Importante:
- No menciones "OpenAI" ni que eres una IA.
- Estilo cálido, espiritual, profundo y muy detallado.
`;
}

async function getWeeklyLongMeaningForCard({ productId, card, reversed }) {
  const redis = getRedis(); // requiere REDIS_URL / KV_URL configurado
  const wk = weekKeyUTC();
  const cardId = card?.id || card?.name || "card";
  const key = `weekly:${productId}:${wk}:${cardId}:${reversed ? "rev" : "up"}`;

  // 1) cache
  const cached = await redis.get(key);
  if (cached) return cached;

  // 2) generar con OpenAI
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // fallback: si no hay OpenAI, devolvemos el meaning corto para no romper
    return card?.meaning || "";
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const client = new OpenAI({ apiKey });

  const prompt = buildPrompt({ card, reversed });

  const resp = await client.chat.completions.create({
    model,
    temperature: 0.8,
    messages: [
      { role: "system", content: "Escribe lecturas angelicales profundas y hermosas." },
      { role: "user", content: prompt },
    ],
  });

  const text = resp?.choices?.[0]?.message?.content?.trim() || (card?.meaning || "");

  // 3) guardar 9 días (por si cambia algo; pero esencialmente es semanal)
  await redis.set(key, text);
  await redis.expire(key, 60 * 60 * 24 * 9);

  return text;
}

module.exports = { getWeeklyLongMeaningForCard };
