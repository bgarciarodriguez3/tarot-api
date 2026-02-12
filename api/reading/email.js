import { Resend } from "resend";

function sendJson(res, status, data) {
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
        ? `<p style="margin:14px 0 0;font-size:13px;opacity:.8;">Enviado desde: ${escapeHtml(safeSite)}</p>`
        : ""
    }
  </div>`;
}

export default async function handler(req, res) {
  // ===== CORS SIEMPRE =====
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  // Preflight
  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed. Use POST." });
  }

  try {
    // Variables
    const apiKey = process.env.RESEND_API_KEY;
    const emailFrom = process.env.EMAIL_FROM;

    if (!apiKey) return sendJson(res, 500, { ok: false, error: "Missing RESEND_API_KEY." });
    if (!emailFrom) return sendJson(res, 500, { ok: false, error: "Missing EMAIL_FROM." });

    // Body seguro
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    const to = String(body.to || "").trim();
    if (!to) return sendJson(res, 400, { ok: false, error: "Missing 'to'." });

    const subject = String(body.subject || "Tu lectura").trim();
    const siteUrl = String(body.siteUrl || "").trim();

    const readingRaw = body.reading ?? "";
    const textRaw = body.text ?? "";

    // Normaliza el texto de lectura
    let readingText = "";
    if (typeof textRaw === "string" && textRaw.trim()) {
      readingText = textRaw.trim();
    } else if (typeof readingRaw === "string") {
      readingText = readingRaw.trim();
    } else if (readingRaw && typeof readingRaw === "object") {
      const title = readingRaw.title || readingRaw.titulo || "";
      const short = readingRaw.short || readingRaw.shortText || readingRaw.summary || "";
      const long = readingRaw.long || readingRaw.longText || readingRaw.full || "";
      readingText = [title, short, long].filter(Boolean).join("\n\n").trim();

      if (!readingText) {
        try { readingText = JSON.stringify(readingRaw, null, 2); }
        catch { readingText = "[Lectura]"; }
      }
    }

    if (!readingText) {
      return sendJson(res, 400, { ok: false, error: "Missing 'reading' or 'text'." });
    }

    // Crea Resend dentro (evita crash al cargar)
    const resend = new Resend(apiKey);

    const html = buildEmailHtml({ subject, readingText, siteUrl });

    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to,
      subject,
      html
    });

    if (error) {
      console.error("Resend error:", error);
      return sendJson(res, 500, { ok: false, error: error.message || "Resend send failed." });
    }

    return sendJson(res, 200, { ok: true, id: data?.id || null });
  } catch (e) {
    console.error("Email handler error:", e);
    return sendJson(res, 500, { ok: false, error: e?.message || "Failed to send email." });
  }
}
