// api/reading/result.js

const ALLOWED_ORIGIN = "https://eltarotdelaruedadelafortuna.com";

/**
 * TEXTOS FIJOS (opcional)
 * Si dejas short/long/affirmation vacíos, NO se mostrarán.
 * Si long está vacío, se generará con IA (cambia cada lunes).
 */
const CARD_TEXTS = {
  "angeles_1": { title: "Ángel 1", short: "", long: "", affirmation: "" },
  "angeles_2": { title: "Ángel 2", short: "", long: "", affirmation: "" },
  "angeles_3": { title: "Ángel 3", short: "", long: "", affirmation: "" },
  "angeles_4": { title: "Ángel 4", short: "", long: "", affirmation: "" },
  "angeles_5": { title: "Ángel 5", short: "", long: "", affirmation: "" },
  "angeles_6": { title: "Ángel 6", short: "", long: "", affirmation: "" },
  "angeles_7": { title: "Ángel 7", short: "", long: "", affirmation: "" },
  "angeles_8": { title: "Ángel 8", short: "", long: "", affirmation: "" },
  "angeles_9": { title: "Ángel 9", short: "", long: "", affirmation: "" },
  "angeles_10": { title: "Ángel 10", short: "", long: "", affirmation: "" },
  "angeles_11": { title: "Ángel 11", short: "", long: "", affirmation: "" },
  "angeles_12": { title: "Ángel de la Abundancia", short: "", long: "", affirmation: "" }
};

// Cache en memoria por semana (si Vercel reinicia, puede regenerar dentro de esa semana)
const weeklyCache = globalThis.__WEEKLY_AI_CACHE__ || (globalThis.__WEEKLY_AI_CACHE__ = {});

/**
 * Devuelve una clave semanal que cambia cada lunes (zona horaria Madrid).
 * Formato: YYYY-MM-DD (lunes de esa semana)
 */
function getWeekKeyMadrid() {
  // Obtenemos fecha "local" Madrid sin librerías
  const now = new Date();
  const madridStr = now.toLocaleString("en-CA", { timeZone: "Europe/Madrid" }); // "YYYY-MM-DD, HH:MM:SS"
  const [datePart] = madridStr.split(","); // "YYYY-MM-DD"
  const madridDate = new Date(datePart + "T00:00:00"); // medianoche local aproximada

  // día de la semana: 0 domingo, 1 lunes...
  const day = madridDate.getDay();
  // queremos lunes como inicio:
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = new Date(madridDate);
  monday.setDate(madridDate.getDate() + diffToMonday);

  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function cleanStr(v) {
  return String(v || "").trim();
}

function buildPrompt({ cardId, cardTitle }) {
  return `
Eres una tarotista angelical experta. Escribe un TEXTO LARGO (120-180 palabras) en español neutro, cálido y espiritual,
para una lectura de "Mensaje de los Ángeles". Debe sonar humano, inspirador, sin prometer curación ni cosas médicas.
No uses listas. No uses emojis. No menciones "IA", "OpenAI" ni "modelo".

Carta:
- id: ${cardId}
- título: ${cardTitle}

Estructura:
1) Interpretación principal (2-3 frases)
2) Consejo práctico (2-3 frases)
3) Cierre empoderador (1-2 frases)

Devuelve SOLO el texto, sin comillas.
`.trim();
}

async function generateLongWithAI({ cardId, cardTitle }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Fallback si no hay clave: texto genérico
    return `Esta carta trae un mensaje de calma y dirección interior. Respira, escucha lo que tu intuición te viene señalando y da un paso pequeño, pero real, hacia lo que te hace bien. No necesitas resolverlo todo hoy: solo ordenar tu energía, elegir con honestidad y sostenerte con cariño. Confía en tu proceso, porque incluso lo que parece lento está construyendo un cambio profundo.`;
  }

  // Usamos Chat Completions por compatibilidad
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.9,
      messages: [
        { role: "system", content: "Responde con textos espirituales y seguros." },
        { role: "user", content: buildPrompt({ cardId, cardTitle }) }
      ]
    })
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${resp.status}: ${txt.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  return cleanStr(content);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed. Use POST." });
  }

  try {
    const body = req.body || {};
    const cards = body.cards;

    if (!Array.isArray(cards) || cards.length !== 4) {
      return res.status(400).json({ ok: false, error: "Debes enviar exactamente 4 cartas." });
    }

    const weekKey = getWeekKeyMadrid();
    if (!weeklyCache[weekKey]) weeklyCache[weekKey] = {};

    const results = [];
    for (let i = 0; i < cards.length; i++) {
      const id = String(cards[i] || "").trim();
      const fixed = CARD_TEXTS[id] || {};
      const title = cleanStr(fixed.title) || `Carta ${i + 1}`;

      // 1) short fijo (si existe)
      const short = cleanStr(fixed.short);

      // 2) long: fijo si existe; si no, IA semanal
      let long = cleanStr(fixed.long);
      if (!long) {
        if (weeklyCache[weekKey][id]) {
          long = weeklyCache[weekKey][id];
        } else {
          const aiLong = await generateLongWithAI({ cardId: id, cardTitle: title });
          weeklyCache[weekKey][id] = aiLong;
          long = aiLong;
        }
      }

      // 3) afirmación fija (si existe)
      const affirmation = cleanStr(fixed.affirmation);

      // ✅ Opción B: NO incluir campos vacíos
      const out = { id, title };
      if (short) out.short = short;
      if (long) out.long = long;
      if (affirmation) out.affirmation = affirmation;

      results.push(out);
    }

    return res.status(200).json({ ok: true, weekKey, results });
  } catch (e) {
    console.error("reading/result error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal error" });
  }
}
