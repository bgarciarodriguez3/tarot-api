const ALLOWED_ORIGIN = "https://eltarotdelaruedadelafortuna.com";

const CARD_TEXTS = {
  "angeles_1": {
    title: "Ángel 1",
    short: "Mensaje breve del Ángel 1.",
    long: "Este es el mensaje completo del Ángel 1.\nLos ángeles te guían con amor.",
    affirmation: "Confío en la guía divina."
  },
  "angeles_2": {
    title: "Ángel 2",
    short: "Mensaje breve del Ángel 2.",
    long: "Este es el mensaje completo del Ángel 2.",
    affirmation: "Estoy protegido/a."
  },
  "angeles_3": { title: "Ángel 3", short: "", long: "", affirmation: "" },
  "angeles_4": { title: "Ángel 4", short: "", long: "", affirmation: "" },
  "angeles_5": { title: "Ángel 5", short: "", long: "", affirmation: "" },
  "angeles_6": { title: "Ángel 6", short: "", long: "", affirmation: "" },
  "angeles_7": { title: "Ángel 7", short: "", long: "", affirmation: "" },
  "angeles_8": { title: "Ángel 8", short: "", long: "", affirmation: "" },
  "angeles_9": { title: "Ángel 9", short: "", long: "", affirmation: "" },
  "angeles_10": { title: "Ángel 10", short: "", long: "", affirmation: "" },
  "angeles_11": { title: "Ángel 11", short: "", long: "", affirmation: "" },
  "angeles_12": {
    title: "Ángel de la Abundancia",
    short: "Mensaje breve para ángeles_12.",
    long: "Este es el mensaje completo de la carta ángeles_12.\nConfía y avanza con serenidad.",
    affirmation: "La abundancia fluye hacia mí."
  }
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Use POST" });
  }

  const { cards, test } = req.body || {};
  if (!Array.isArray(cards) || cards.length !== 4) {
    return res.status(400).json({ ok: false, error: "Se requieren 4 cartas" });
  }

  const results = cards.map((id, i) => {
    const t = CARD_TEXTS[id] || {};
    return {
      id,
      title: t.title || `Carta ${i + 1}`,
      short: t.short || "",
      long: t.long || "",
      affirmation: t.affirmation || ""
    };
  });

  res.status(200).json({ ok: true, test: !!test, results });
}
