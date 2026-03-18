async function sendAccessEmail(session) {
  if (!session.email) {
    throw new Error("La sesión no tiene email");
  }

  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("Falta RESEND_FROM_EMAIL en variables de entorno");
  }

  if (session.accessEmailSent) {
    console.log("EMAIL ACCESO: ya enviado para token", session.token);
    return { already: true };
  }

  const url = readingUrl(session);

  const text = [
    "Querida alma,",
    "",
    "Tu acceso a la lectura ya está listo.",
    "",
    "Pulsa este enlace para entrar en tu tapete:",
    url,
    "",
    "Con luz,",
    "El Tarot de la Rueda de la Fortuna"
  ].join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#f6f1e7;">
      <div style="max-width:680px;margin:0 auto;padding:32px 18px;">
        <div style="background:linear-gradient(180deg,#1a1330 0%,#241845 100%);border-radius:28px;padding:1px;box-shadow:0 20px 60px rgba(0,0,0,0.18);">
          <div style="background:linear-gradient(180deg,#fcf7ef 0%,#f7f1e6 100%);border-radius:27px;padding:36px 28px;color:#2b2238;font-family:Georgia, 'Times New Roman', serif;">

            <div style="text-align:center;margin-bottom:22px;">
              <div style="display:inline-block;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8b6b2f;border:1px solid rgba(139,107,47,0.28);border-radius:999px;padding:8px 14px;background:rgba(255,255,255,0.55);">
                Tu acceso ya está listo
              </div>
            </div>

            <div style="text-align:center;margin-bottom:20px;">
              <div style="font-size:30px;line-height:1;color:#8b6b2f;">✦</div>
              <h1 style="margin:10px 0 8px;font-size:30px;line-height:1.2;font-weight:normal;color:#241845;">
                Accede a tu destino
              </h1>
              <p style="margin:0;font-size:15px;color:#6d5a7b;line-height:1.7;">
                Tu lectura te está esperando
              </p>
            </div>

            <div style="width:72px;height:1px;background:linear-gradient(90deg,transparent,#c6a45a,transparent);margin:22px auto 28px;"></div>

            <p style="margin:0 0 16px;font-size:17px;line-height:1.8;">Querida alma,</p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
              Tu acceso a la lectura ya está preparado.
            </p>

            <p style="margin:0 0 22px;font-size:16px;line-height:1.85;">
              Cuando estés lista, entra en tu tapete y deja que el mensaje se revele.
            </p>

            <div style="text-align:center;margin:28px 0;">
              <a
                href="${url}"
                style="display:inline-block;background:#241845;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:bold;"
              >
                Accede a tu destino
              </a>
            </div>

            <p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#6d5a7b;text-align:center;">
              Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
              <span style="word-break:break-all;">${url}</span>
            </p>

            <div style="width:72px;height:1px;background:linear-gradient(90deg,transparent,#c6a45a,transparent);margin:28px auto 24px;"></div>

            <p style="margin:0;text-align:center;font-size:16px;line-height:1.8;color:#5a4968;">
              Con luz,
            </p>

            <p style="margin:6px 0 0;text-align:center;font-size:18px;line-height:1.6;color:#241845;">
              <strong>El Tarot de la Rueda de la Fortuna</strong>
            </p>

          </div>
        </div>
      </div>
    </div>
  `;

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: session.email,
    subject: "✨ Accede a tu destino",
    text,
    html
  });

  if (result && result.error) {
    console.error("RESEND ACCESS ERROR:", result.error);
    throw new Error(`Resend error: ${result.error.message || "error desconocido"}`);
  }

  session.accessEmailSent = true;
  saveSession(session);

  console.log("RESEND ACCESS OK:", result);
  return result;
}
