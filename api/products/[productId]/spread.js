// api/products/[productId]/spread.js
// ✅ Sin Redis / Sin KV / Sin límites diarios
// ✅ Devuelve 12 cartas para que el cliente elija 4 en el frontend

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const productId = Array.isArray(req.query.productId)
      ? req.query.productId[0]
      : req.query.productId;

    if (!productId) {
      return res.status(400).json({ ok: false, error: "Missing productId" });
    }

    const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_CARDS_TABLE = process.env.AIRTABLE_CARDS_TABLE;

    if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID || !AIRTABLE_CARDS_TABLE) {
      return res.status(500).json({
        ok: false,
        error: "Missing Airtable env vars",
        details:
          "Required: AIRTABLE_PAT, AIRTABLE_BASE_ID, AIRTABLE_CARDS_TABLE",
      });
    }

    // En tu caso, productId suele ser el slug del mazo (ej: "angeles_12")
    const deckSlug = productId;

    // 1) Traer todas las cartas del mazo desde Airtable
    const records = await airtableFetchAll({
      pat: AIRTABLE_PAT,
      baseId: AIRTABLE_BASE_ID,
      table: AIRTABLE_CARDS_TABLE,
      // ✅ Filtro robusto: intenta varias columnas habituales
      // Ajusta el nombre de campo si tu Airtable usa otro.
      filterByFormula: buildDeckFilter(deckSlug),
    });

    const cards = records
      .map((r) => normalizeCard(r))
      .filter((c) => c && c.name);

    if (!cards.length) {
      return res.status(404).json({
        ok: false,
        error: "No cards found for deck",
        details:
          "Revisa el filterByFormula (campo deck/slug) y el nombre de la tabla AIRTABLE_CARDS_TABLE.",
      });
    }

    // 2) Barajar y asegurar 12
    const shuffled = shuffle([...cards]);

    // Si tu mazo tiene más de 12, devolvemos 12.
    // Si tiene exactamente 12, devolverá las 12.
    // Si tiene menos de 12, devolvemos error (porque es tirada de 12).
    if (shuffled.length < 12) {
      return res.status(500).json({
        ok: false,
        error: "Deck has less than 12 cards",
        details: `Found ${shuffled.length} cards for deck "${deckSlug}"`,
      });
    }

    const spread12 = shuffled.slice(0, 12).map((c) => ({
      ...c,
      reversed: false, // ✅ NO forzamos invertidas
    }));

    return res.status(200).json({
      ok: true,
      product_id: deckSlug,
      spread: deckSlug,
      deck: { slug: deckSlug, name: deckSlug },
      timestamp: new Date().toISOString(),
      cards: spread12,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      details: err?.message || String(err),
    });
  }
};

/* -------------------- Helpers -------------------- */

function buildDeckFilter(deckSlug) {
  // ✅ Intenta varios nombres de campo típicos para asociar carta->mazo.
  // Si sabes cuál es EXACTO en tu Airtable, deja solo uno y listo.
  // OJO: Airtable formula string needs quotes escaped.
  const s = String(deckSlug).replace(/"/g, '\\"');

  // Campos posibles:
  // - {deck_slug} = "angeles_12"
  // - {deck} = "angeles_12"
  // - {deckId} = "angeles_12"
  // - {productId} = "angeles_12"
  // - {slug} en Cards si guardas el deck ahí
  return `OR(
    {deck_slug}="${s}",
    {deck}="${s}",
    {deckId}="${s}",
    {productId}="${s}",
    {deckSlug}="${s}"
  )`;
}

async function airtableFetchAll({ pat, baseId, table, filterByFormula }) {
  const out = [];
  let offset = undefined;

  while (true) {
    const url = new URL(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`
    );

    // Puedes subir el pageSize si quieres
    url.searchParams.set("pageSize", "100");

    if (filterByFormula) {
      url.searchParams.set("filterByFormula", filterByFormula);
    }

    if (offset) {
      url.searchParams.set("offset", offset);
    }

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
    });

    if (!resp.ok) {
      const txt = await safeText(resp);
      throw new Error(
        `Airtable error (${resp.status}): ${txt || resp.statusText}`
      );
    }

    const data = await resp.json();
    if (Array.isArray(data.records)) out.push(...data.records);

    if (!data.offset) break;
    offset = data.offset;
  }

  return out;
}

function normalizeCard(record) {
  const f = record?.fields || {};

  // ✅ Mapeo flexible, porque en Airtable puedes tener nombres distintos
  const id =
    f.id ||
    f.card_id ||
    f.cardId ||
    record.id || // Airtable record id si no hay otro
    undefined;

  const name = (f.name || f.nombre || "").toString().trim();

  const meaning = (f.meaning || f.significado || f.text || f.descripcion || "")
    .toString()
    .trim();

  // Airtable puede devolver imágenes como:
  // - string URL
  // - array attachments [{url: "..."}]
  const rawImage = f.image || f.img || f.image_url || f.imageUrl || f.imagen;
  let image = "";

  if (typeof rawImage === "string") {
    image = rawImage.trim();
  } else if (Array.isArray(rawImage) && rawImage[0]?.url) {
    image = String(rawImage[0].url).trim();
  }

  // ✅ OJO: NO usamos encodeURI aquí. El frontend lo puede hacer.
  // Si quieres “curar” espacios, mejor reemplazar espacios por %20:
  image = image.replace(/ /g, "%20");

  return {
    id,
    name,
    meaning,
    image,
    reversed: false,
  };
}

function shuffle(arr) {
  // Fisher-Yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

async function safeText(resp) {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}
