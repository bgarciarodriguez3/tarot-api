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
   SEMANA ISO EN HORA ESPAÑA
============================================================ */

function getISOWeekKeyMadrid(d = new Date()) {
  const madrid = new Date(
    d.toLocaleString("en-US", { timeZone: "Europe/Madrid" })
  );

  const tmp = new Date(
    madrid.getFullYear(),
    madrid.getMonth(),
    madrid.getDate()
  );

  const dayNum = tmp.getDay() || 7;
  tmp.setDate(tmp.getDate() + 4 - dayNum);

  const yearStart = new Date(tmp.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  const isoYear = tmp.getFullYear();

  return `${isoYear}-W${String(weekNo).padStart(2, "0")}`;
}

/* ============================================================
   PRNG SEMANAL
============================================================ */

function hashStringToInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededPick(list, seedStr) {
  if (!Array.isArray(list) || !list.length) return "";
  const seed = hashStringToInt(seedStr);
  const rand = mulberry32(seed);
  return list[Math.floor(rand() * list.length)];
}

/* ============================================================
   CONFIG 3 BARAJAS + 4 PRODUCTOS
============================================================ */

const PRODUCT_CONFIG = [
  {
    key: "tres_puertas",
    match: ["tres-puertas", "puertas-del-destino", "10493369745745"],
    deck: "arcanos_mayores",
    spread: 3,
    subject: "Tres Puertas del Destino — Tu lectura",
  },
  {
    key: "angeles_4",
    match: ["mensaje-de-los-angeles", "10496012616017"],
    deck: "angeles",
    spread: 4,
    subject: "Mensaje de los Ángeles — Tu lectura",
  },
  {
    key: "semilla_5",
    match: ["camino-de-la-semilla", "10495993446737"],
    deck: "semilla_estelar",
    spread: 5,
    subject: "Camino de la Semilla Estelar — Tu lectura",
  },
  {
    key: "profunda_12",
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
   FALLBACK SEMANAL (SI NO LLEGA body.text)
============================================================ */

const WEEK_INTROS = [
  "Esta semana el mensaje se enfoca en:",
  "La vibración de la semana te invita a:",
  "Clave energética de la semana:",
  "Durante estos días conviene:",
];

const WEEK_ACTIONS = [
  "actuar con firmeza y calma",
  "ordenar prioridades y simplificar",
  "cerrar ciclos pendientes",
  "elegir lo que te sostiene",
];

const WEEK_WARNINGS = [
  "no caer en impulsos",
  "no repetir patrones del pasado",
  "no ceder tu poder por dudas",
  "no cargar con lo que no te corresponde",
];

function weeklyDescription(card, deckKey) {
  const weekKey = getISOWeekKeyMadrid();
  const id = String(card?.id || card?.name || "card");

  const intro = seededPick(WEEK_INTROS, `${weekKey}|${deckKey}|${id}|intro`);
  const action = seededPick(WEEK_ACTIONS, `${weekKey}|${deckKey}|${id}|action`);
  const warn = seededPick(WEEK_WARNINGS, `${weekKey}|${deckKey}|${id}|warn`);

  return `${intro} ${action}.\n\n⚠️ Esta semana evita: ${warn}.`;
}

function buildFallbackText({ cards, deckKey, spread }) {
  const weekKey = getISOWeekKeyMadrid();
  const lines = [];

  if (deckKey) lines.push(`🔮 ${deckKey}`);
  lines.push(`📅 Semana: ${weekKey}`);
  if (spread) lines.push(`🃏 Tirada: ${spread} cartas`);
  lines.push("");

  cards.forEach((card) => {
    lines.push(`— ${card.name || "Carta"}`);
    lines.push(weeklyDescription(card, deckKey));
    lines.push("");
  });

  return lines.join("\n");
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
   HANDLER PRINCIPAL
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

    const deckKey =
      body.deck ||
      productCfg?.deck ||
      "tarot";

    const spread =
      body.spread ||
      productCfg?.spread ||
      "";

    const subject =
      body.subject ||
      productCfg?.subject ||
      "Tu lectura";

    // PRIORIDAD: usar texto completo que viene de Shopify
    let text = body.text?.trim();

    if (!text) {
      const cards = Array.isArray(body.cards) ? body.cards : [];
      if (cards.length) {
        text = buildFallbackText({ cards, deckKey, spread });
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
