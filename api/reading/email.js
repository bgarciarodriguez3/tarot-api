import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/* ============================================================
   CORS
============================================================ */

function setCors(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  const reqHeaders = req.headers["access-control-request-headers"];
  res.setHeader(
    "Access-Control-Allow-Headers",
    reqHeaders ? String(reqHeaders) : "Content-Type, Authorization"
  );

  res.setHeader("Access-Control-Max-Age", "86400");
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

/* ============================================================
   CONFIG 3 BARAJAS + 4 PRODUCTOS
============================================================ */

const PRODUCT_CONFIG = [
  {
    match: ["tres-puertas", "puertas-del-destino", "10493369745745"],
    deck: "arcanos_mayores",
    spread: 3,
    subject: "Tres Puertas del Destino — Tu lectura",
  },
  {
    match: ["mensaje-de-los-angeles", "10496012616017"],
    deck: "angeles",
    spread: 4,
    subject: "Mensaje de los Ángeles — Tu lectura",
  },
  {
    match: ["camino-de-la-semilla", "10495993446737"],
    deck: "semilla_estelar",
    spread: 5,
    subject: "Camino de la Semilla Estelar — Tu lectura",
  },
  {
    match: ["lectura-profunda", "analisis-completo", "10493383082321"],
    deck: "arcanos_mayores",
    spread: 12,
    subject: "Lectura Profunda — Tu lectura",
  },
];

function detectProductConfig(body) {
  const raw = String(body.product || "").toLowerCase();
  for (const cfg of PRODUCT_CONFIG) {
    for (const m of cfg.match) {
      if (raw.includes(String(m).toLowerCase())) return cfg;
    }
  }
  return null;
}

/* ============================================================
   FALLBACK SIMPLE (SIN SEMANA NI NOMBRE EXTERNO)
============================================================ */

function buildFallbackText({ cards }) {
  const lines = [];

  cards.forEach((card) => {
    if (card.description) {
      lines.push(card.description);
      lines.push("");
    }
  });

  return lines.join("\n").trim();
}

/* ============================================================
   PLANTILLA EMAIL CON DESCARGO LEGAL
============================================================ */

function buildEmailHtml({ subject, text }) {
  const safe = String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; line-height:1.6; color:#111;">

    <h2 style="margin:0 0 20px; font-weight:600;">
      ${subject}
    </h2>

    <div style="
      background:#f6f6f6;
      padding:18px;
      border-radius:16px;
      font-size:14px;
      white-space:pre-wrap;
    ">
      ${safe}
    </div>

    <div style="margin:40px 0 20px; border-top:1px solid #e5e5e5;"></div>

    <div style="
      font-size:9px;
      color:#777;
      line-height:1.6;
    ">
      <strong>DESCARGO DE RESPONSABILIDAD</strong><br><br>

      Las lecturas de tarot y oráculo ofrecidas bajo el nombre comercial Tarot de la Rueda de la Fortuna tienen un carácter espiritual, orientativo y de entretenimiento.<br><br>

      La información, interpretaciones y mensajes proporcionados a través de este servicio no constituyen hechos objetivos ni predicciones garantizadas.<br><br>

      En ningún caso sustituyen asesoramiento médico, psicológico, legal, financiero ni profesional de ningún tipo.<br><br>

      Este servicio no está dirigido a menores de edad.<br><br>

      El usuario comprende y acepta que cualquier decisión que tome a partir de la información recibida es de su exclusiva responsabilidad.<br><br>

      Al utilizar este sitio web y sus servicios, el usuario acepta expresamente este descargo de responsabilidad.
    </div>

  </div>
  `;
}

/* ============================================================
   HANDLER
============================================================ */

export default async function handler(req, res) {
  try {
    setCors(req, res);

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }

    if (req.method !== "POST") {
      return json(res, 405, { ok: false, error: "Method not allowed." });
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const to = String(body.to || "").trim();
    if (!to) return json(res, 400, { ok: false, error: "Missing 'to'." });

    const productCfg = detectProductConfig(body);

    const subject =
      body.subject ||
      productCfg?.subject ||
      "Tu lectura";

    // PRIORIDAD TOTAL: usar texto completo que manda Shopify
    let text = body.text?.trim();

    if (!text) {
      const cards = Array.isArray(body.cards) ? body.cards : [];
      if (cards.length) {
        text = buildFallbackText({ cards });
      }
    }

    if (!text) {
      return json(res, 400, { ok: false, error: "Missing reading content." });
    }

    const html = buildEmailHtml({ subject, text });

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    });

    if (error) {
      console.error(error);
      return json(res, 500, { ok: false, error: error.message });
    }

    return json(res, 200, { ok: true, id: data?.id || null });

  } catch (e) {
    console.error(e);
    return json(res, 500, { ok: false, error: e.message });
  }
}
