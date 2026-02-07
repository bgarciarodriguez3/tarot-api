import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildEmailHtml({ reading, toEmail, siteUrl }) {
  const title = "Tu lectura — Mensaje de los Ángeles (4 cartas)";

  const cardsHtml = (reading || [])
    .map((c, i) => {
      const name = escapeHtml(c.title || c.name || c.id || `Carta ${i + 1}`);
      const long = escapeHtml(c.long || c.texto_largo || "");
      return `
        <div style="margin:0 0 18px;padding:16px;border:1px solid #e9e9e9;border-radius:12px;background:#fff;">
          <div style="font-size:14px;color:#888;margin:0 0 6px;">${i + 1}.</div>
          <div style="font-size:18px;font-weight:700;margin:0 0 10px;color:#111;">${name}</div>
          <div style="font-size:15px;line-height:1.55;color:#222;white-space:pre-wrap;">${long}</div>
        </div>
      `;
    })
    .join("");

  return `
  <div style="background:#f7f7f7;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:720px;margin:0 auto;">
      <div style="padding:18px 18px 0;">
        <div style="font-size:22px;font-weight:800;color:#111;margin:0 0 6px;">${title}</div>
        <div style="font-size:14px;color:#666;margin:0 0 18px;">
          Gracias por confiar en El Tarot de la Rueda de la Fortuna.
        </div>
      </div>

      ${cardsHtml}

      <div style="font-size:12px;color:#777;padding:8px 18px 0;">
        Enviado a <b>${escapeHtml(toEmail)}</b>
      </div>

      <div style="font-size:12px;color:#888;padding:18px;">
        ${siteUrl ? `Web: <a href="${escapeHtml(siteUrl)}" style="color:#666;">${escapeHtml(siteUrl)}</a>` : ""}
      </div>
    </div>
  </div>
  `;
}

export default async function handler(req, res) {
  // CORS (por si lo llamas desde Shopify)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed. Use POST." });

  if (!process.env.RESEND_API_KEY) {
    return json(res, 500, { ok: false, error: "Missing RESEND_API_KEY in environment variables." });
  }
  if (!process.env.EMAIL_FROM) {
    return json(res, 500, { ok: false, error: "Missing EMAIL_FROM in environment variables." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const to = String(body?.to || "").trim();
  const reading = Array.isArray(body?.reading) ? body.reading : [];
  const siteUrl =
    String(process.env.SITE_URL || "").trim() ||
    String(req.headers?.origin || "").trim() ||
    "";

  if (!to) return json(res, 400, { ok: false, error: "Missing 'to' email." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json(res, 400, { ok: false, error: "Invalid email." });
  if (!reading.length) return json(res, 400, { ok: false, error: "Missing 'reading' array." });

  const subject = "Tu lectura de los Ángeles (4 cartas)";
  const html = buildEmailHtml({ reading, toEmail: to, siteUrl });

  try {
    const sent = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    });

    return json(res, 200, { ok: true, id: sent?.id || null });
  } catch (e) {
    console.error("Resend send error:", e);
    return json(res, 500, { ok: false, error: e?.message || "Failed to send email." });
  }
}
