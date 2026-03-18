async function sendResultEmail(session) {
  if (!session.email) {
    throw new Error("La sesión no tiene email")
  }

  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("Falta RESEND_FROM_EMAIL en variables de entorno")
  }

  if (!session.reading) {
    throw new Error("No hay lectura generada")
  }

  if (session.resultEmailSent) {
    console.log("EMAIL RESULTADO: ya enviado para token", session.token)
    return { already: true }
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
    .join("\n\n")

  const text = [
    "Querida alma,",
    "",
    "Tu lectura ya ha llegado a ti.",
    "",
    "No es casualidad que estés aquí ahora.",
    "Las cartas que elegiste han respondido a tu energía en este momento exacto.",
    "",
    "Este mensaje no es genérico.",
    "Es un reflejo de lo que se está moviendo dentro de ti.",
    "",
    "Tómate un instante.",
    "Respira.",
    "",
    "Y permite que cada palabra encuentre su lugar en ti.",
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
  ].join("\n")

  const html = `
    <div style="font-family: Georgia, serif; line-height:1.7; color:#222; max-width:600px; margin:0 auto; padding:24px;">
      <p>Querida alma,</p>

      <p>Tu lectura ya ha llegado a ti.</p>

      <p>
        No es casualidad que estés aquí ahora.<br>
        Las cartas que elegiste han respondido a tu energía en este momento exacto.
      </p>

      <p>
        Este mensaje no es genérico.<br>
        Es un reflejo de lo que se está moviendo dentro de ti.
      </p>

      <p>
        Tómate un instante.<br>
        Respira.
      </p>

      <p>Y permite que cada palabra encuentre su lugar en ti.</p>

      <p style="text-align:center; font-size:18px;">✨</p>

      <div style="
        background:#fafafa;
        padding:18px;
        border-radius:14px;
        border:1px solid rgba(0,0,0,0.06);
        white-space:pre-line;
        font-size:15px;
      ">${reading}</div>

      <p style="text-align:center; font-size:18px;">✨</p>

      <p>
        Confía en lo que sientes al leerlo.<br>
        Ahí está la verdadera respuesta.
      </p>

      <p style="margin-top:24px;">
        Con luz,<br>
        <strong>El Tarot de la Rueda de la Fortuna</strong>
      </p>
    </div>
  `

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: session.email,
    subject: "✨ Tu lectura ya te estaba esperando…",
    text,
    html
  })

  if (result?.error) {
    console.error("RESEND RESULT ERROR:", result.error)
    throw new Error(`Resend error: ${result.error.message || "error desconocido"}`)
  }

  session.resultEmailSent = true
  saveSession(session)

  console.log("RESEND RESULT OK:", result)
  return result
}
