import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function setCors(req, res) {
  const origin = req.headers.origin || "*";

  // CORS headers (SIEMPRE)
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  // Permite EXACTAMENTE los headers que pide el navegador
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
  const safe = String(text || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; line-height:1.5;">
      <h2 style="margin:0 0 12px;">${String(subject || "Tu lectura")}</h2>
      <pre style="white-space:pre-wrap; background:#f6f6f6; padding:12px; border-radius:12px;">${safe}</pre>
    </div>
  `;
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

    // Acepta varias formas: reading (objeto o string) o text
    const subject = String(body.subject || "Tu lectura").trim();

    const text =
      (typeof body.text === "string" && body.text.trim()) ||
      (body.reading ? (typeof body.reading === "string" ? body.reading : JSON.stringify(body.reading, null, 2)) : "");

    if (!text) return json(res, 400, { ok: false, error: "Missing 'text' or 'reading'." });

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
    // IMPORTANTÍSIMO: incluso en error devolvemos CORS
    try { setCors(req, res); } catch {}
    console.error("Email handler error:", e);
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
}
