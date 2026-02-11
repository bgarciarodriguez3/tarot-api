import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildEmailHtml({ subject, readingText, siteUrl }) {
  const safeSubject = escapeHtml(subject || "Tu lectura");
  const safeReading = escapeHtml(readingText || "");
  const safeSite = siteUrl ? String(siteUrl) : "";

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.45;color:#111;">
    <h2 style="margin:0 0 12px;">${safeSubject}</h2>

    <div style="white-space:pre-wrap;background:#fafafa;border:1px solid #eee;padding:14px;border-radius:12px;">
      ${safeReading}
    </div>

    ${
      safeSite
        ? `<p style="margin:14px 0 0;font-size:13px;opacity:.8;">Enviado desde: ${escapeHtml(
            safeSite
          )}</p>`
        : ""
    }
  </div>`;
}

export default async function handler(req, res) {
  // ===== CORS (Shopify / navegador) =====
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed. Use POST." });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;
  if (!apiKey) return json(res, 500, { ok: false, error: "Missing RESEND_API_KEY." });
  if (!emailFrom) return json(res, 500, { ok: false, error: "Missing EMAIL_FROM." });

  // Body seguro
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const to = String(body.to || "").trim();
  if (!to) return json(res, 400, { ok: false, error: "Missing 'to'." });

  // reading puede ser objeto o string
  const readingRaw = body.reading ?? "";
  const textRaw = body.text ?? ""; // si tu frontend ya manda un texto listo, lo usamos

  // Subject opcional
  const subject = String(body.subject || "Tu lectura").trim();

  // siteUrl opcional
  const siteUrl = String(body.siteUrl || "").trim();

  // Normalizamos readingText
  let readingText = "";

  if (typeof textRaw === "string" && textRaw.trim()) {
    readingText = textRaw.trim();
  } else if (typeof readingRaw === "string") {
    readingText = readingRaw.trim();
  } else if (readingRaw && typeof readingRaw === "object") {
    // intenta sacar campos típicos
    const short = readingRaw.short || readingRaw.shortText || readingRaw.summary || "";
    const long = readingRaw.long || readingRaw.longText || readingRaw.full || "";
    const title = readingRaw.title || readingRaw.titulo || "";

    readingText = [title, short, long].filter(Boolean).join("\n\n").trim();

    // fallback: stringify bonito
    if (!readingText) {
      try {
        readingText = JSON.stringify(readingRaw, null, 2);
      } catch {
        readingText = "[Lectura]";
      }
    }
  }

  if (!readingText) {
    return json(res, 400, { ok: false, error: "Missing 'reading' or 'text'." });
  }

  const html = buildEmailHtml({ subject, readingText, siteUrl });

  try {
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
    console.error("Resend send error:", e);
    return json(res, 500, { ok: false, error: e?.message || "Failed to send email." });
  }
}
