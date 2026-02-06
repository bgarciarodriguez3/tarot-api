import nodemailer from "nodemailer";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { to, subject, html } = req.body || {};
    if (!to) return res.status(400).json({ ok: false, error: "Missing to" });
    if (!subject) return res.status(400).json({ ok: false, error: "Missing subject" });
    if (!html) return res.status(400).json({ ok: false, error: "Missing html" });

    const GMAIL_USER = process.env.GMAIL_USER;
    const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

    if (!GMAIL_USER) throw new Error("Missing GMAIL_USER");
    if (!GMAIL_APP_PASSWORD) throw new Error("Missing GMAIL_APP_PASSWORD");

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD
      }
    });

    await transporter.sendMail({
      from: `El Tarot de la Rueda de la Fortuna <${GMAIL_USER}>`,
      to,
      subject,
      html
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message || "Internal error" });
  }
}
