// api/admin/refresh-meanings.js
import { kvSetJson } from "../../lib/kv.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-2024-08-06";

// Tu baraja de Ángeles (IDs exactos)
const ANGELS_IDS = [
  "Angel_Angel_de_la_Abundancia",
  "Angel_Angel_de_la_Guarda",
  "Angel_Angel_de_los_Suenos",
  "Angel_Angel_del_Nuevo_Comienzo",
  "Angel_Angel_del_Tiempo_Divino",
  "Angel_Arcangel_Chamuel",
  "Angel_Arcangel_Gabriel",
  "Angel_Arcangel_Jofiel",
  "Angel_Angel_Arcangel_Miguel",
  "Angel_Arcangel_Rafael",
  "Angel_Arcangel_Uriel",
  "Angel_Arcangel_Zadkiel"
];

const KV_KEY = "meanings:angeles:weekly_v1";

// Seguridad simple para que NO pueda llamarlo cualquiera:
// crea en Vercel una env var: ADMIN_REFRESH_TOKEN (una contraseña larga)
// y para ejecutar manualmente: /api/admin/refresh-meanings?token=TU_TOKEN
const ADMIN_REFRESH_TOKEN = process.env.ADMIN_REFRESH_TOKEN;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, status, body) {
  cors(res);
  res.status(status).json(body);
}

async function callOpenAIForMeanings() {
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  // Schema: devuelve { meanings: { <id>: "<texto largo>" } }
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      meanings: {
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(
          ANGELS_IDS.map((id) => [id, { type: "string" }])
        ),
        required: ANGELS_IDS
      }
    },
    required: ["meanings"]
  };

  const prompt = `
Eres una tarotista de ángeles para una tienda española.
Genera 12 textos LARGOS (120–220 palabras cada uno) en español, uno por cada carta, con tono cálido y espiritual pero concreto.
Reglas:
- No menciones “IA”, “OpenAI”, “modelo”, “prompt”.
- No uses listas numeradas. 1–2 párrafos por carta.
- Incluye consejo práctico y mensaje emocional.
- No repitas frases entre cartas.
- NO incluyas comillas ni markdown.
Devuelve SOLO el JSON que cumpla el schema.

IDs:
${ANGELS_IDS.join("\n")}
`.trim();

  // Responses API: POST /v1/responses :contentReference[oaicite:1]{index=1}
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt,
      // Structured Outputs via text.format json_schema :contentReference[oaicite:2]{index=2}
      text: {
        format: {
          type: "json_schema",
          strict: true,
          schema
        }
      }
    })
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`OpenAI error ${resp.status}: ${txt}`);
  }

  const data = await resp.json();

  // Extraemos el JSON: normalmente viene como output_text cuando es texto
  // Aquí, como forzamos JSON schema, el texto devuelto será JSON.
  const outputText = data.output_text || "";
  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error("OpenAI did not return valid JSON in output_text");
  }

  if (!parsed || !parsed.meanings) throw new Error("Invalid OpenAI JSON shape");
  return parsed.meanings;
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  // Permite que Vercel Cron llame sin token, pero si lo llamas manual, exige token
  // (si pones ADMIN_REFRESH_TOKEN)
  const token = req.query?.token;

  if (ADMIN_REFRESH_TOKEN) {
    // Si hay token configurado, exigimos que coincida SIEMPRE
    if (token !== ADMIN_REFRESH_TOKEN) {
      return json(res, 401, { ok: false, error: "Unauthorized" });
    }
  }

  try {
    const meanings = await callOpenAIForMeanings();

    const payload = {
      ok: true,
      updated_at: new Date().toISOString(),
      meanings
    };

    await kvSetJson(KV_KEY, payload);

    return json(res, 200, {
      ok: true,
      saved_key: KV_KEY,
      updated_at: payload.updated_at
    });
  } catch (e) {
    console.error(e);
    return json(res, 500, { ok: false, error: e.message || "Internal error" });
  }
}
