const resp = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: OPENAI_MODEL,
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "angel_meanings_weekly",   // 👈 ESTA LÍNEA ES LA CLAVE
        strict: true,
        schema
      }
    }
  })
});
