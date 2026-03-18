async function sendResultEmail(session) {
  try {
    if (!session || !session.email) {
      console.log("No email, skipping send");
      return;
    }

    const reading = session.reading
      ? [
          session.reading.introduccion || "",
          session.reading.significado_general || "",
          session.reading.amor ? "\n💗 Amor\n" + session.reading.amor : "",
          session.reading.trabajo_proposito ? "\n💫 Propósito\n" + session.reading.trabajo_proposito : "",
          session.reading.consejo_espiritual ? "\n🕊 Consejo espiritual\n" + session.reading.consejo_espiritual : "",
          session.reading.consejo_especial ? "\n✨ Consejo estelar\n" + session.reading.consejo_especial : "",
          session.reading.afirmacion ? "\n🌞 Afirmación\n" + session.reading.afirmacion : "",
          session.reading.ritual ? "\n🕯 Ritual\n" + session.reading.ritual : "",
          session.reading.cierre ? "\n🌟 Cierre\n" + session.reading.cierre : ""
        ]
          .filter(Boolean)
          .join("\n\n")
      : (session.interpretation || "");

    // ✨ EMAIL PREMIUM (ANTI-GEMINI)
    const html = `
    <div style="font-family: Georgia, serif; line-height:1.7; color:#222; max-width:600px; margin:auto;">

      <p>Querida alma,</p>

      <p>Tu lectura ya ha llegado a ti.</p>

      <p>No es casualidad que estés aquí ahora.<br>
      Las cartas que elegiste han respondido a tu energía en este momento exacto.</p>

      <p>Este mensaje no es genérico.<br>
      Es un reflejo de lo que se está moviendo dentro de ti.</p>

      <p>Tómate un instante.<br>
      Respira.</p>

      <p>Y permite que cada palabra encuentre su lugar en ti.</p>

      <p style="text-align:center; font-size:18px;">✨</p>

      <div style="
        background:#fafafa;
        padding:18px;
        border-radius:14px;
        border:1px solid rgba(0,0,0,0.06);
        white-space:pre-line;
        font-size:15px;
      ">
        ${reading}
      </div>

      <p style="text-align:center; font-size:18px;">✨</p>

      <p>Confía en lo que sientes al leerlo.<br>
      Ahí está la verdadera respuesta.</p>

      <p style="margin-top:24px;">
        Con luz,<br>
        <strong>El Tarot de la Rueda de la Fortuna</strong>
      </p>

    </div>
    `;

    await transporter.sendMail({
      from: `"Tarot de la Rueda de la Fortuna" <${process.env.EMAIL_FROM}>`,
      to: session.email,
      subject: "✨ Tu lectura ya te estaba esperando…",
      html
    });

    console.log("Email sent to:", session.email);

  } catch (err) {
    console.error("Email send error:", err);
  }
}
