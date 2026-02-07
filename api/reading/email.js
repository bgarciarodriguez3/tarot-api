import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { email, reading } = req.body;

    if (!email || !reading) {
      return res.status(400).json({ ok: false, error: "Missing data" });
    }

    const html = `
      <div style="font-family: Arial, sans-serif; line-height:1.6; color:#111">
        <h2>✨ Tu mensaje de los Ángeles ✨</h2>
        ${reading
          .map(
            (r, i) => `
              <h3>${i + 1}. ${r.title}</h3>
              <p>${r.long}</p>
            `
          )
          .join("")}
        <hr>
        <p style="font-size:12px;color:#666">
          El Tarot de la Rueda de la Fortuna
        </p>
      </div>
    `;

    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "🌟 Tu mensaje de los Ángeles",
      html,
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Email failed" });
  }
}
