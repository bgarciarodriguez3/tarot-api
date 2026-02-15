import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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

// Email simple (evita dependencias raras)
function buildEmailHtml({ subject, text }) {
  const safe = String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; line-height:1.5;">
      <h2 style="margin:0 0 12px;">${String(subject || "Tu lectura")}</h2>
      <pre style="white-space:pre-wrap; background:#f6f6f6; padding:12px; border-radius:12px;">${safe}</pre>
    </div>
  `;
}

/* ==========================
   ✅ Texto semanal por carta
   (cambia cada lunes y es estable toda la semana)
   ========================== */

function getISOWeekKey(d = new Date()) {
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = utc.getUTCDay() || 7; // domingo=7
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum); // jueves
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

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
  const seed = hashStringToInt(seedStr);
  const rand = mulberry32(seed);
  return list[Math.floor(rand() * list.length)];
}

const WEEK_INTROS = [
  "Esta semana el mensaje se enfoca en:",
  "La vibración de la semana te invita a:",
  "Clave energética de la semana:",
  "Esta semana se revela:",
  "Durante estos días conviene:",
  "El aprendizaje de la semana es:",
  "Tu guía semanal señala:",
  "La semana ilumina:"
];

const WEEK_ACTIONS = [
  "actuar con firmeza y calma",
  "ordenar prioridades y simplificar",
  "hablar desde la verdad, sin prisa",
  "cortar con lo que drena energía",
  "escuchar tu intuición y confirmarla",
  "dar un paso valiente pero medido",
  "cerrar ciclos pendientes",
  "elegir lo que te sostiene"
];

const WEEK_WARNINGS = [
  "no caer en impulsos ni decisiones apresuradas",
  "no interpretar desde el miedo",
  "no repetir patrones por nostalgia",
  "no postergar lo esencial",
  "no ceder tu poder por dudas",
  "no cargar con lo que no te corresponde",
  "no autoexigirte de más",
  "no negar lo que sientes"
];

function weeklyDescription(card, spread = "default") {
  const weekKey = getISOWeekKey(new Date());
  const id = String(card?.slug || card?.id || card?.key || card?.name || card?.title || "card");
  const base = String(card?.description || card?.meaning || card?.text || "").trim();

  const intro = seededPick(WEEK_INTROS, `${weekKey}|${spread}|${id}|intro`);
  const action = seededPick(WEEK_ACTIONS, `${weekKey}|${spread}|${id}|action`);
  const warn = seededPick(WEEK_WARNINGS, `${weekKey}|${spread}|${id}|warn`);

  const parts = [];
  if (base) parts.push(base);
  parts.push(`${intro} ${action}.`);
  parts.push(`⚠️ Esta semana evita: ${warn}.`);

  return parts.join("\n\n");
}

function buildReadingTextFromCards({ cards, spread, deckName }) {
  const s = spread || "default";
  const lines = [];

  if (deckName) lines.push(`🔮 ${deckName}`);
  lines.push(`📅 Semana: ${getISOWeekKey(new Date())}`);
  if (spread) lines.push(`🃏 Tirada: ${spread} cartas`);
  lines.push("");

  (cards || []).forEach((card, idx) => {
    const name = card?.name || card?.title || card?.card || `Carta ${idx + 1}`;
    lines.push(`— ${name}`);
    lines.push(weeklyDescription(card, s));
    lines.push("");
  });

  return lines.join("\n").trim();
}

export default async function handler(req, res) {
  try {
    setCors(req, res);

    // Preflight
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }

    if (req.method !== "POST") {
      return json(res, 405, { ok: false, error: "Method not allowed. Use POST." });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const emailFrom = process.env.EMAIL_FROM;
    if (!apiKey) return json(res, 500, { ok: false, error: "Missing RESEND_API_KEY." });
    if (!emailFrom) return json(res, 500, { ok: false, error: "Missing EMAIL_FROM." });

    // Body puede venir como string
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    const to = String(body.to || "").trim();
    if (!to) return json(res, 400, { ok: false, error: "Missing 'to'." });

    const subject = String(body.subject || "Tu lectura").trim();

    // ✅ LÓGICA FINAL:
    // 1) Si viene reading.cards => construimos texto semanal SIEMPRE
    // 2) Si no, usamos text o reading (string/objeto) como fallback
    let text = "";

    if (body.reading && typeof body.reading === "object") {
      const cards =
        body.reading.cards ||
        body.reading.selectedCards ||
        body.reading.results ||
        [];

      const spread = body.reading.spread || body.reading.n || body.spread || "";
      const deckName = body.reading.deckName || body.reading.deck || body.deck || "";

      if (Array.isArray(cards) && cards.length) {
        text = buildReadingTextFromCards({ cards, spread, deckName });
      }
    }

    if (!text) {
      text =
        (typeof body.text === "string" && body.text.trim()) ||
        (body.reading
          ? (typeof body.reading === "string"
              ? body.reading.trim()
              : JSON.stringify(body.reading, null, 2))
          : "");
    }

    if (!text) {
      return json(res, 400, { ok: false, error: "Missing 'reading.cards' or 'text'." });
    }

    const html = buildEmailHtml({ subject, text });

    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      return json(res, 500, { ok: false, error: error.message || "Resend send failed." });
    }

    return json(res, 200, { ok: true, id: data?.id || null });
  } catch (e) {
    try { setCors(req, res); } catch {}
    console.error("Email handler error:", e);
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
}
