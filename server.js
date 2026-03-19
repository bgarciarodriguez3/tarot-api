function buildResultEmailHtml(session) {
  const reading = session.reading || {}

  const content = [
    reading.introduccion || "",
    reading.significado_general || "",
    reading.amor ? "💗 Amor\n" + reading.amor : "",
    reading.trabajo_proposito ? "💫 Propósito\n" + reading.trabajo_proposito : "",
    reading.consejo_espiritual ? "🕊 Consejo espiritual\n" + reading.consejo_espiritual : "",
    reading.consejo_especial ? "✨ Consejo estelar\n" + reading.consejo_especial : "",
    reading.afirmacion ? "🌞 Afirmación\n" + reading.afirmacion : "",
    reading.ritual ? "🕯 Ritual\n" + reading.ritual : "",
    reading.cierre ? "🌟 Cierre\n" + reading.cierre : ""
  ]
    .filter(Boolean)
    .join("\n\n")

  return `
    <div style="margin:0;padding:0;background:#f6f1e7;">
      <div style="max-width:680px;margin:0 auto;padding:32px 18px;">
        <div style="background:#fcf7ef;border:1px solid #e7dccb;border-radius:24px;padding:36px 28px;color:#2b2238;font-family:Georgia, 'Times New Roman', serif;box-shadow:0 12px 30px rgba(0,0,0,0.08);">

          <div style="text-align:center;margin-bottom:22px;">
            <div style="display:inline-block;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8b6b2f;border:1px solid rgba(139,107,47,0.28);border-radius:999px;padding:8px 14px;background:#fffaf2;">
              Mensaje ritualizado para ti
            </div>
          </div>

          <div style="text-align:center;margin-bottom:20px;">
            <div style="font-size:30px;line-height:1;color:#8b6b2f;">✦</div>
            <h1 style="margin:10px 0 8px;font-size:30px;line-height:1.2;font-weight:normal;color:#241845;">
              Tu lectura ya ha llegado
            </h1>
            <p style="margin:0;font-size:15px;color:#6d5a7b;line-height:1.7;">
              Un mensaje revelado para este momento de tu camino
            </p>
          </div>

          <div style="width:72px;height:1px;background:#c6a45a;margin:22px auto 28px;"></div>

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

          <div style="white-space:pre-line;font-size:16px;line-height:1.9;color:#2f243c;margin:0 0 20px;">
${content}
          </div>

          <div style="text-align:center;font-size:20px;color:#8b6b2f;margin:8px 0 18px;">
            ✨
          </div>

          <p style="margin:0 0 12px;font-size:16px;line-height:1.85;">
            Confía en lo que sientes al leerlo.<br>
            Ahí está la verdadera respuesta.
          </p>

          <div style="width:72px;height:1px;background:#c6a45a;margin:28px auto 24px;"></div>

          <p style="margin:0 0 8px;text-align:center;font-size:16px;line-height:1.8;color:#5a4968;">
            Un fuerte abrazo,
          </p>

          <p style="margin:0;text-align:center;font-size:18px;line-height:1.7;color:#241845;">
            El equipo de Expertos Premium del Tarot de la Rueda de la Fortuna
          </p>

          <div style="text-align:center;margin:18px 0 26px;">
            <img
              src="https://cdn.shopify.com/s/files/1/0989/4694/1265/files/firma_transparente.png?v=1772104449"
              alt="Firma Tarot de la Rueda de la Fortuna"
              style="display:block;margin:0 auto;max-width:220px;width:100%;height:auto;border:0;"
            >
          </div>

          <div style="height:1px;background:#e6dccd;margin:0 auto 20px;max-width:470px;"></div>

          <p style="margin:0 0 18px;text-align:center;font-size:13px;line-height:1.7;color:#7a6a5f;">
            Guarda este email para volver a entrar cuando quieras.
          </p>

          <p style="margin:0 0 12px;text-align:center;font-size:13px;line-height:1.7;color:#7a6a5f;">
            Aviso legal:
          </p>

          <p style="margin:0 0 14px;text-align:center;font-size:13px;line-height:1.75;color:#7a6a5f;">
            Este servicio corresponde a un producto digital personalizado. De acuerdo con el artículo 103 del Real Decreto Legislativo 1/2007, al tratarse de contenido digital y servicios personalizados, no es posible ejercer el derecho de desistimiento una vez iniciado el proceso.
          </p>

          <p style="margin:0 0 14px;text-align:center;font-size:13px;line-height:1.75;color:#7a6a5f;">
            El servicio está destinado exclusivamente a personas mayores de 18 años.
          </p>

          <p style="margin:0 0 14px;text-align:center;font-size:13px;line-height:1.75;color:#7a6a5f;">
            Las interpretaciones de tarot se ofrecen con fines de orientación personal y entretenimiento y no sustituyen asesoramiento profesional médico, legal, psicológico o financiero.
          </p>

          <p style="margin:0 0 14px;text-align:center;font-size:13px;line-height:1.75;color:#7a6a5f;">
            Al completar el formulario y utilizar el servicio aceptas estas condiciones.
          </p>

          <p style="margin:0;text-align:center;font-size:13px;line-height:1.75;color:#7a6a5f;">
            Este correo es informativo y no admite respuesta.
          </p>

        </div>
      </div>
    </div>
  `
}
