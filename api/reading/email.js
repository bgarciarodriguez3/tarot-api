import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function json(res, status, data, extraHeaders = {}) {
  Object.entries(extraHeaders).forEach(([k, v]) => res.setHeader(k, v));
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  };
}

function buildEmailHtml({ reading, toEmail, siteUrl }) {
  const safe = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const readingText = safe(reading);
  const urlBlock = siteUrl
    ? `<p style="margin:16px 0 0;"><a href="${safe(siteUrl)}">${safe(siteUrl)}</a></p>`
    : "";

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; line-height:1.5; color:#111;">
    <h2 style="margin:0 0 12px;">Tu lectura</h2>
    <pre style="white-space:pre-wrap; background:#f6f6f6; padding:12px; border-radius:12px; border:1px solid #eee;">${readingText}</pre>
    ${urlBlock}
    <p style="margin:16px 0 0; font-size:12px; color:#666;">Enviado a: ${safe(toEmail)}</p>
  </div>
  `;
}

export default async function handler(req, res) {
  const cors = corsHeaders();
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));

  // Preflight (IMPORTANTÍSIMO)
  if (req.method === "OPTIONS") {
    // 200 (mejor que 204 para evitar proxies raros sin headers)
    return json(res, 200, { ok: true }, cors);
  }

  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed. Use POST." }, cors);
  }

  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;
  if (!apiKey) return json(res, 500, { ok: false, error: "Missing RESEND_API_KEY." }, cors);
  if (!emailFrom) return json(res, 500, { ok: false, error: "Missing EMAIL_FROM." }, cors);

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const to = (body?.to || "").toString().trim();
  const subject = (body?.subject || "Tu lectura").toString().trim();
  const siteUrl = (body?.siteUrl || "").toString();

  // reading puede venir como string o como objeto
  let reading = body?.reading;
  if (reading && typeof reading === "object") {
    // Si te mandan {title, short, long} lo convertimos a texto
    const t = reading.title ? `${reading.title}\n\n` : "";
    const s = reading.short ? `${reading.short}\n\n` : "";
    const l = reading.long ? `${reading.long}` : "";
    reading = (t + s + l).trim();
  }
  reading = (reading || body?.text || "").toString().trim();

  if (!to) return json(res, 400, { ok: false, error: "Missing 'to'." }, cors);
  if (!reading) return json(res, 400, { ok: false, error: "Missing 'reading' (or 'text')." }, cors);

  const html = buildEmailHtml({ reading, toEmail: to, siteUrl });

  try {
    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      return json(res, 500, { ok: false, error: error.message || "Resend send failed." }, cors);
    }

    return json(res, 200, { ok: true, id: data?.id || null }, cors);
  } catch (e) {
    console.error("Resend send error:", e);
    return json(res, 500, { ok: false, error: e?.message || "Failed to send email." }, cors);
  }
}
