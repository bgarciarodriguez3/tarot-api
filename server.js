async function sendResultEmail(session) {
  if (!session.email) {
    throw new Error("La sesión no tiene email");
  }

  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("Falta RESEND_FROM_EMAIL en variables de entorno");
  }

  if (!session.reading) {
    throw new Error("No hay lectura generada");
  }

  if (session.resultEmailSent) {
    console.log("EMAIL RESULTADO: ya enviado para token", session.token);
    return { already: true };
  }

  const reading = [
    session.reading.introduccion || "",
    session.reading.significado_general || "",
    session.reading.amor ? "💗 Amor\n" + session.reading.amor : "",
    session.reading.trabajo_proposito ? "💫 Propósito\n" + session.reading.trabajo_proposito : "",
    session.reading.consejo_espiritual ? "🕊 Consejo espiritual\n" + session.reading.consejo_espiritual : "",
    session.reading.consejo_especial ? "✨ Consejo estelar\n" + session.reading.consejo_especial : "",
    session.reading.afirmacion ? "🌞 Afirmación\n" + session.reading.afirmacion : "",
    session.reading.ritual ? "🕯 Ritual\n" + session.reading.ritual : "",
    session.reading.cierre ? "🌟 Cierre\n" + session.reading.cierre : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  const text = [
    "Querida alma,",
    "",
    "Tu lectura ya ha llegado a ti.",
    "",
    "No es casualidad que este mensaje haya encontrado tu camino.",
    "Las cartas elegidas han respondido a tu energía en este momento exacto.",
    "",
    "Respira.",
    "Lee despacio.",
    "Permite que cada palabra encuentre su lugar en ti.",
    "",
    "✨",
    "",
    reading,
    "",
    "✨",
    "",
    "Confía en lo que sientes al leerlo.",
    "Ahí está la verdadera respuesta.",
    "",
    "Con luz,",
    "El Tarot de la Rueda de la Fortuna"
  ].join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#f6f1e7;">
      <div style="max-width:680px;margin:0 auto;padding:32px 18px;">
        <div style="
          background:linear-gradient(180deg,#1a1330 0%,#241845 100%);
          border-radius:28px;
          padding:1px;
          box-shadow:0 20px 60px rgba(0,0,0,0.18);
        ">
          <div style="
            background:linear-gradient(180deg,#fcf7ef 0%,#f7f1e6 100%);
            border-radius:27px;
            padding:36px 28px;
            color:#2b2238;
            font-family:Georgia, 'Times New Roman', serif;
          ">

            <div style="text-align:center;margin-bottom:22px;">
              <div style="
                display:inline-block;
                font-size:12px;
                letter-spacing:3px;
                text-transform:uppercase;
                color:#8b6b2f;
                border:1px solid rgba(139,107,47,0.28);
                border-radius:999px;
                padding:8px 14px;
                background:rgba(255,255,255,0.55);
              ">
                Mensaje ritualizado para ti
              </div>
            </div>

            <div style="text-align:center;margin-bottom:20px;">
              <div style="font-size:30px;line-height:1;color:#8b6b2f;">✦</div>
              <h1 style="
                margin:10px 0 8px;
                font-size:30px;
                line-height:1.2;
                font-weight:normal;
                color:#241845;
              ">
                Tu lectura ya ha llegado
              </h1>
              <p style="
                margin:0;
                font-size:15px;
                color:#6d5a7b;
                line-height:1.7;
              ">
                Un mensaje revelado para este momento de tu camino
              </p>
            </div>

            <div style="
              width:72px;
              height:1px;
              background:linear-gradient(90deg,transparent,#c6a45a,transparent);
              margin:22px auto 28px;
            "></div>

            <p style="margin:0 0 16px;font-size:17px;line-height:1.8;">
              Querida alma,
            </p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
              Tu lectura ya ha llegado a ti.
            </p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.85;">
              No es casualidad que este mensaje haya encontrado tu camino.<br>
              Las cartas elegidas han respondido a tu energía en este momento exacto.
            </p>

            <p style="margin:0 0 18px;font-size:16px;line-height:1.85;">
              Respira.<br>
              Lee despacio.<br>
              Permite que cada palabra encuentre su lugar en ti.
            </p>

            <div style="text-align:center;font-size:20px;color:#8b6b2f;margin:18px 0 20px;">
              ✨
            </div>

            <!-- SIN RECUADRO / SIN CAJA -->
            <div style="
              white-space:pre-line;
              font-size:16px;
              line-height:1.9;
              color:#2f243c;
              margin:0 0 20px;
            ">${reading}</div>

            <div style="text-align:center;font-size:20px;color:#8b6b2f;margin:8px 0 18px;">
              ✨
            </div>

            <p style="margin:0 0 12px;font-size:16px;line-height:1.85;">
              Confía en lo que sientes al leerlo.<br>
              Ahí está la verdadera respuesta.
            </p>

            <div style="
              width:72px;
              height:1px;
              background:linear-gradient(90deg,transparent,#c6a45a,transparent);
              margin:28px auto 24px;
            "></div>

            <p style="
              margin:0;
              text-align:center;
              font-size:16px;
              line-height:1.8;
              color:#5a4968;
            ">
              Con luz,
            </p>

            <p style="
              margin:6px 0 0;
              text-align:center;
              font-size:18px;
              line-height:1.6;
              color:#241845;
            ">
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
    subject: "✨ Tu lectura ya te estaba esperando…",
    text,
    html
  });

  if (result && result.error) {
    console.error("RESEND RESULT ERROR:", result.error);
    throw new Error(`Resend error: ${result.error.message || "error desconocido"}`);
  }

  session.resultEmailSent = true;
  saveSession(session);

  console.log("RESEND RESULT OK:", result);
  return result;
}
