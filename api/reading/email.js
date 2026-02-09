import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  // CORS (Shopify / navegador)
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

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

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const to = (body?.to || "").toString().trim();
  const reading = (body?.reading || "").toString();
  const siteUrl = (body?.siteUrl || "").toString();

  if (!to) return json(res, 400, { ok: false, error: "Missing 'to'." });
  if (!reading) return json(res, 400, { ok: false, error: "Missing 'reading'." });

  const subject = body?.subject?.toString()?.trim() || "Tu lectura";

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
      return json(res, 500, { ok: false, error: error.message || "Resend send failed." });
    }

    return json(res, 200, { ok: true, id: data?.id || null });
  } catch (e) {
    console.error("Resend send error:", e);
    return json(res, 500, { ok: false, error: e?.message || "Failed to send email." });
  }
}
