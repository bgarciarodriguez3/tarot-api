// api/products/[productId]/spread.js
export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const { productId } = req.query;

    // ✅ Airtable envs (acepta AIRTABLE_PAT o AIRTABLE_API_KEY)
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY;
    const AIRTABLE_CARDS_TABLE = process.env.AIRTABLE_CARDS_TABLE || "Cards";

    if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) {
      return res.status(500).json({
        ok: false,
        error: "Missing Airtable env vars",
        details: "Necesitas AIRTABLE_BASE_ID y AIRTABLE_PAT (o AIRTABLE_API_KEY).",
      });
    }

    // ✅ En tu Airtable tienes deck_id y product_id. Probamos ambos.
    // Nota: Airtable requiere llaves {campo}
    const filterByFormula = `OR({deck_id}='${escapeAirtable(productId)}',{product_id}='${escapeAirtable(
      productId
    )}')`;

    const records = await airtableListAll({
      baseId: AIRTABLE_BASE_ID,
      table: AIRTABLE_CARDS_TABLE,
      token: AIRTABLE_TOKEN,
      filterByFormula,
    });

    if (!records.length) {
      return res.status(404).json({
        ok: false,
        error: "No cards found",
        details: `No encontré cartas en Airtable para productId=${productId}. Revisa deck_id/product_id.`,
      });
    }

    // ✅ Normaliza a lo que necesita el front
    const cards = records
      .map((r) => normalizeCard(r))
      .filter(Boolean);

    // Deben ser 12 (baraja completa)
    if (cards.length < 12) {
      // No lo rompemos, pero avisamos
      // (mejor ver en logs si falta alguna)
      console.warn(`[spread] Solo tengo ${cards.length} cartas para ${productId}`);
    }

    // ✅ Barajar (orden aleatorio)
    shuffleInPlace(cards);

    return res.status(200).json({
      ok: true,
      productId,
      spread: productId,
      deck: { slug: productId, name: productId },
      timestamp: new Date().toISOString(),
      cards: cards.map((c) => ({ ...c, reversed: false })), // ✅ sin forzar invertidas
      meta: { count: cards.length },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      details: err?.message || String(err),
    });
  }
}

/* ---------------- helpers ---------------- */

function escapeAirtable(str) {
  // Airtable formula string: escapamos comillas simples
  return String(str || "").replace(/'/g, "\\'");
}

async function airtableListAll({ baseId, table, token, filterByFormula }) {
  const out = [];
  let offset = undefined;

  // Airtable REST API: GET /v0/{baseId}/{table}?filterByFormula=...&offset=...
  // (vamos paginando hasta traer todo)
  for (let guard = 0; guard < 20; guard++) {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("filterByFormula", filterByFormula);
    if (offset) url.searchParams.set("offset", offset);

    const r = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await r.json();
    if (!r.ok) {
      throw new Error(`Airtable error (${r.status}): ${JSON.stringify(data)}`);
    }

    if (Array.isArray(data.records)) out.push(...data.records);

    offset = data.offset;
    if (!offset) break;
  }

  return out;
}

function normalizeCard(record) {
  const f = record?.fields || {};

  // Campos que tú tienes:
  // - card_id
  // - meaning
  // - image_url
  // (puede que también tengas "name" en otras vistas; lo soportamos)
  const rawId = (f.card_id || f.id || "").toString().trim();
  const rawMeaning = (f.meaning || "").toString().trim();
  const rawImg = (f.image_url || f.image || f.img || "").toString().trim();

  // ✅ Normaliza MIGUEL (tu base muestra algo tipo Angel_Angel_Arcangel_Miguel)
  // Lo dejamos como id estándar:
  const fixedId = rawId
    .replace(/^Angel_Angel_/, "Angel_")
    .replace(/^Angel_Arcangel_Miguel$/i, "Angel_Arcangel_Miguel")
    .replace(/^Angel_Angel_Arcangel_Miguel$/i, "Angel_Arcangel_Miguel");

  // Nombre:
  // 1) si hay name explícito, úsalo
  // 2) si no, intenta sacarlo del meaning (antes del guion largo)
  // 3) si no, deriva del card_id
  const name =
    (f.name && String(f.name).trim()) ||
    nameFromMeaning(rawMeaning) ||
    nameFromCardId(fixedId);

  // Validación mínima
  if (!name) return null;

  return {
    id: fixedId || undefined,
    name,
    meaning: rawMeaning || undefined,
    image: rawImg || undefined,
    reversed: false,
  };
}

function nameFromMeaning(meaning) {
  // Ejemplos: "🌱 Ángel de la Abundancia – Prosperidad ..."
  // o "Arcángel Miguel Protección ..."
  if (!meaning) return "";

  // Quitamos emojis al principio
  const cleaned = meaning.replace(/^[^\p{L}\p{N}]*/u, "").trim();

  // Cortamos por " – " o " - "
  const parts = cleaned.split(/ – | - /);
  const candidate = (parts[0] || "").trim();

  // Si es demasiado largo, no lo usamos
  if (!candidate || candidate.length > 60) return "";

  // Caso especial: si empieza por "Arcángel Miguel", devolvemos "Miguel"
  if (/^Arcángel\s+Miguel\b/i.test(candidate)) return "Miguel";

  return candidate;
}

function nameFromCardId(cardId) {
  if (!cardId) return "";

  // Casos especiales
  if (/Miguel/i.test(cardId)) return "Miguel";

  // Quitamos prefijos y formateamos
  let s = cardId
    .replace(/^Angel_/, "")
    .replace(/^Arcangel_/, "")
    .replace(/^Angel_Arcangel_/, "")
    .replace(/_/g, " ")
    .trim();

  // "Angel del Tiempo Divino" etc
  // Ponemos mayúscula inicial de cada palabra
  s = s
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return s;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
