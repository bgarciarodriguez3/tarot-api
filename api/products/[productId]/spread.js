// pages/api/products/[productId]/spread.js

export default async function handler(req, res) {
  try {
    const { productId } = req.query;

    const baseId = process.env.AIRTABLE_BASE_ID;
    const apiKey = process.env.AIRTABLE_API_KEY; // <-- asegúrate de tenerla en Vercel

    if (!baseId) {
      return res.status(500).json({ ok: false, error: "Missing AIRTABLE_BASE_ID env var" });
    }
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: "Missing AIRTABLE_API_KEY env var" });
    }

    const tableName = "Cards";

    // En tu base, deck_id y product_id parecen ser el mismo slug (ej: "angeles_12")
    // Filtramos por cualquiera de los dos para que funcione aunque uno falte.
    const formula = `OR({deck_id}='${productId}', {product_id}='${productId}')`;

    const url =
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}` +
      `?pageSize=100` +
      `&filterByFormula=${encodeURIComponent(formula)}`;

    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const text = await r.text();
    if (!r.ok) {
      return res.status(500).json({
        ok: false,
        error: "Internal server error",
        details: `Airtable error (${r.status}): ${text}`,
      });
    }

    const data = JSON.parse(text);
    const records = Array.isArray(data.records) ? data.records : [];

    // Normaliza a nuestro formato
    const cards = records
      .map((rec) => {
        const f = rec.fields || {};

        const card_id = (f.card_id || "").toString().trim();
        const meaning = (f.meaning || "").toString();
        const image = (f.image_url || "").toString().trim();

        // Intento de sacar un "name" decente:
        // 1) si existe f.name úsalo
        // 2) si no, intenta sacarlo del inicio de meaning (antes de "—" / "-" / "–")
        // 3) si no, fallback al card_id "bonito"
        const nameFromMeaning = (() => {
          const firstLine = meaning.split("\n")[0] || "";
          // quita emojis comunes al inicio
          const cleaned = firstLine.replace(/^[^\p{L}\p{N}]*/u, "").trim();
          const parts = cleaned.split(/—|–|-|\u2014/).map((s) => s.trim());
          if (parts[0] && parts[0].length >= 3) return parts[0];
          return "";
        })();

        const fallbackNameFromId = (() => {
          if (!card_id) return "";
          const pretty = card_id
            .replace(/^Angel_?/i, "")
            .replace(/^Arcangel_?/i, "")
            .replace(/_/g, " ")
            .trim();
          // Si termina quedando algo tipo "del Tiempo Divino", capitaliza primera
          return pretty ? pretty[0].toUpperCase() + pretty.slice(1) : card_id;
        })();

        const name = (f.name || nameFromMeaning || fallbackNameFromId || card_id || "Carta").toString();

        return {
          id: card_id || rec.id,
          name,
          meaning,
          image,
          reversed: false, // aquí NO forzamos invertidas
        };
      })
      // quita filas vacías si alguna viniera rara
      .filter((c) => c.id || c.name || c.image || c.meaning);

    // Si por algún motivo Airtable devuelve más, aquí te aseguras que son 12
    // (siempre que tu baraja sea de 12)
    // Puedes quitarlo si más adelante hay barajas grandes.
    const deckCards = cards.slice(0, 12);

    return res.status(200).json({
      ok: true,
      product_id: productId,
      spread: productId,
      deck: { slug: productId, name: productId },
      timestamp: new Date().toISOString(),
      cards: deckCards,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      details: err?.message || String(err),
    });
  }
}
