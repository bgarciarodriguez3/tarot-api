export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Seguridad por token
  const ADMIN_REFRESH_TOKEN = process.env.ADMIN_REFRESH_TOKEN;
  const token = req.query?.token;

  if (ADMIN_REFRESH_TOKEN && token !== ADMIN_REFRESH_TOKEN) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    // Env vars necesarias
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

    if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
    if (!KV_REST_API_URL) throw new Error("Missing KV_REST_API_URL");
    if (!KV_REST_API_TOKEN) throw new Error("Missing KV_REST_API_TOKEN");

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

    // JSON schema (con name obligatorio)
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
Genera 12 textos LARGOS (120–220 palabras cada uno) en español, uno por cada carta.
Reglas:
- No menciones IA/OpenAI/modelos/prompts.
- 1–2 párrafos por carta, sin listas numeradas.
- Consejo práctico + mensaje emocional.
- No repitas frases entre cartas.
- Sin comillas, sin markdown.
Devuelve SOLO JSON válido.

IDs:
${ANGELS_IDS.join("\n")}
`.trim();

    // 1) OpenAI: generar meanings
    const oaiResp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "angel_meanings_weekly",
            strict: true,
            schema
          }
        }
      })
    });

    const oaiText = await oaiResp.text();
    if (!oaiResp.ok) {
      throw new Error(`OpenAI error ${oaiResp.status}: ${oaiText}`);
    }

    let oaiJson;
    try {
      oaiJson = JSON.parse(oaiText);
    } catch {
      throw new Error("OpenAI response is not JSON");
    }

    const outputText = oaiJson.output_text;
    if (!outputText) throw new Error("OpenAI missing output_text");

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new Error("OpenAI output_text is not valid JSON");
    }

    if (!parsed?.meanings) throw new Error("Invalid meanings JSON from OpenAI");

    // 2) Guardar en KV
    const KV_KEY = "meanings:angeles:weekly_v1";
    const payload = {
      updated_at: new Date().toISOString(),
      meanings: parsed.meanings
    };

    const kvSetResp = await fetch(`${KV_REST_API_URL}/set/${encodeURIComponent(KV_KEY)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ value: JSON.stringify(payload) })
    });

    const kvSetText = await kvSetResp.text();
    if (!kvSetResp.ok) {
      throw new Error(`KV set failed ${kvSetResp.status}: ${kvSetText}`);
    }

    return res.status(200).json({
      ok: true,
      saved_key: KV_KEY,
      updated_at: payload.updated_at
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message || "Internal error" });
  }
}
0
