const express = require("express");
const crypto = require("crypto");
const OpenAI = require("openai");

const router = express.Router();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

router.post("/submit", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== process.env.PREMIUM_API_KEY) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
    }

    const payload = normalizePayload(req.body);
    const validation = validatePayload(payload);

    if (!validation.ok) {
      return res.status(400).json({
        ok: false,
        error: "Invalid payload",
        details: validation.errors,
      });
    }

    const prompt = buildPremiumPrompt(payload);

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: PREMIUM_SYSTEM_PROMPT,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt,
            },
          ],
        },
      ],
      max_output_tokens: 2200,
    });

    const premiumReading = extractText(response);

    const result = {
      ok: true,
      mode: "premium",
      submissionId: payload.submissionId,
      orderId: payload.orderId || null,
      email: payload.email,
      customerName: payload.customerName || null,
      productType: payload.productType,
      spreadType: payload.spreadType || null,
      generatedAt: new Date().toISOString(),
      answer: premiumReading,
      meta: {
        formId: payload.formId || null,
        formName: payload.formName || null,
      },
    };

    // Guarda en tu BD si quieres:
    // await savePremiumReading(result);

    // Hook para tu sistema actual de emails
    // Sustituye esta función por tu implementacion real
    await sendPremiumResultEmail(result);

    return res.status(200).json(result);
  } catch (error) {
    console.error("PREMIUM_SUBMIT_ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      message: error.message || "Unknown error",
    });
  }
});

function normalizePayload(body = {}) {
  return {
    submissionId:
      body.submissionId ||
      body.responseId ||
      body.formResponseId ||
      crypto.randomUUID(),

    orderId: body.orderId || body.shopifyOrderId || null,
    orderName: body.orderName || null,
    productId: body.productId || null,
    productTitle: body.productTitle || null,
    productType: body.productType || "premium_mentoria",
    spreadType: body.spreadType || "premium_mentoria",

    email: body.email || "",
    customerName: body.customerName || body.name || "",
    language: body.language || "es",

    formId: body.formId || null,
    formName: body.formName || null,
    submittedAt: body.submittedAt || new Date().toISOString(),

    focusArea: body.focusArea || "",
    mainQuestion: body.mainQuestion || "",
    context: body.context || "",
    currentSituation: body.currentSituation || "",
    blockages: body.blockages || "",
    desiredOutcome: body.desiredOutcome || "",
    background: body.background || "",
    urgencyLevel: body.urgencyLevel || "",
    extraNotes: body.extraNotes || "",

    answers: body.answers || {},
    rawForm: body.rawForm || body,
  };
}

function validatePayload(payload) {
  const errors = [];

  if (!payload.email) errors.push("email is required");
  if (!payload.mainQuestion) errors.push("mainQuestion is required");
  if (!payload.context && !payload.currentSituation) {
    errors.push("context or currentSituation is required");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function buildPremiumPrompt(data) {
  const answerLines = Object.entries(data.answers || {})
    .map(([key, value]) => `- ${key}: ${stringifyValue(value)}`)
    .join("\n");

  return `
Genera una mentoría premium personalizada en español a partir de los siguientes datos del cliente.

DATOS DEL CLIENTE
- Nombre: ${data.customerName || "No indicado"}
- Email: ${data.email}
- Tipo de producto: ${data.productType}
- Tipo de lectura: ${data.spreadType}
- Pedido Shopify: ${data.orderId || "No indicado"}
- Fecha de envío del formulario: ${data.submittedAt}
- Idioma: ${data.language}

FORMULARIO
- Área de enfoque: ${data.focusArea || "No indicada"}
- Pregunta principal: ${data.mainQuestion || "No indicada"}
- Situación actual: ${data.currentSituation || "No indicada"}
- Contexto adicional: ${data.context || "No indicado"}
- Bloqueos: ${data.blockages || "No indicados"}
- Resultado deseado: ${data.desiredOutcome || "No indicado"}
- Historia previa / antecedentes: ${data.background || "No indicados"}
- Nivel de urgencia: ${data.urgencyLevel || "No indicado"}
- Notas extra: ${data.extraNotes || "No indicadas"}

RESPUESTAS COMPLETAS DEL FORMULARIO
${answerLines || "- Sin respuestas estructuradas adicionales"}

INSTRUCCIONES
1. Escribe una respuesta premium profunda, cálida, clara y muy personalizada.
2. No hagas una lectura superficial: prioriza análisis, patrones, contradicciones internas, bloqueos y oportunidades reales.
3. Debe sentirse como una mentoría intuitiva y estratégica, no como texto genérico.
4. Usa tono humano, cercano y elegante.
5. No menciones OpenAI, IA, modelo, prompt ni automatización.
6. No inventes datos fuera de lo que el cliente ha compartido.
7. Si falta información, trabaja con prudencia y dilo de forma natural.
8. Cierra con acciones concretas y útiles.
9. Evita frases vacías y repetitivas.
10. Responde en HTML simple, apto para email.

ESTRUCTURA OBLIGATORIA EN HTML
<h2>Lectura Premium Personalizada</h2>
<p>Introducción breve y personalizada</p>

<h3>Lo que está ocurriendo en el fondo</h3>
<p>Análisis profundo</p>

<h3>Bloqueos y patrones que se repiten</h3>
<p>Análisis específico</p>

<h3>Lo que ahora mismo necesita ver con claridad</h3>
<p>Insight central</p>

<h3>Camino más alineado para avanzar</h3>
<p>Orientación práctica y emocional</p>

<h3>Pasos concretos para los próximos días</h3>
<ul>
  <li>Paso 1</li>
  <li>Paso 2</li>
  <li>Paso 3</li>
  <li>Paso 4</li>
</ul>

<h3>Cierre</h3>
<p>Cierre cálido, potente y personalizado</p>
`.trim();
}

function stringifyValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

function extractText(response) {
  if (response.output_text) return response.output_text;

  try {
    return response.output
      .flatMap(item => item.content || [])
      .filter(c => c.type === "output_text")
      .map(c => c.text)
      .join("\n")
      .trim();
  } catch (e) {
    return "";
  }
}

const PREMIUM_SYSTEM_PROMPT = `
Eres una mentora intuitiva y estratégica especializada en lecturas premium profundamente personalizadas.

Tu estilo:
- profundo
- cálido
- lúcido
- nada genérico
- emocionalmente inteligente
- honesto pero compasivo
- orientado a claridad y transformación real

Reglas:
- Nunca suenes automática ni mecánica.
- Nunca repitas ideas con otras palabras.
- No uses clichés vacíos.
- No moralices.
- No prometas resultados absolutos.
- No diagnostiques salud mental ni des consejos legales o médicos.
- Si el cliente muestra confusión, ayúdale a ordenar prioridades.
- Si el cliente muestra dolor emocional, responde con contención y claridad.
- Prioriza precisión, personalización y profundidad psicológica.
`;

async function sendPremiumResultEmail(result) {
  // INTEGRA AQUÍ tu función real de email.
  // Ejemplo:
  // return await sendEmail({
  //   to: result.email,
  //   subject: "Tu mentoría premium ya está lista",
  //   html: premiumEmailTemplate(result),
  // });

  console.log("EMAIL_READY_FOR_SEND:", {
    to: result.email,
    subject: "Tu mentoría premium ya está lista",
  });

  return true;
}

module.exports = router;
