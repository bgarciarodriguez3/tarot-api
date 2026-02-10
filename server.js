/**
 * server.js — Tarot API (Railway)
 * - Weekly refresh via CRON (Vercel -> Railway)
 * - Generates weekly meanings for each card in each deck using OpenAI
 * - Stores results in Redis keyed by "week start (Monday)"
 */

import express from "express";
import cors from "cors";
import Redis from "ioredis";
import OpenAI from "openai";
import pLimit from "p-limit";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// -------------------- ENV --------------------
const {
  PORT = 3000,
  CRON_SECRET,
  OPENAI_API_KEY,
  OPENAI_MODEL = "gpt-4o-mini",
  REDIS_URL
} = process.env;

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
}
if (!REDIS_URL) {
  console.error("Missing REDIS_URL");
}

// -------------------- CLIENTS --------------------
const redis = new Redis(REDIS_URL, {
  // Railway/Upstash friendly settings
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true
});

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// -------------------- CARD LISTS --------------------
// ⚠️ Pon aquí TODAS las cartas reales de cada baraja.
// (He incluido las que me diste en la conversación para Ángeles, Arcanos, Semilla.)
const DECKS = {
  angeles: [
    "Angel_Arcangel_Rafael",
    "Angel_Angel_de_la_Guarda",
    "Angel_Angel_de_la_Abundancia",
    "Angel_Arcangel_Chamuel",
    "Angel_Arcangel_Gabriel",
    "Angel_Arcangel_Uriel",
    "Angel_Angel_del_Tiempo_Divino",
    "Angel_Arcangel_Jofiel",
    "Angel_Angel_de_los_Suenos",
    "Angel_Angel_Arcangel_Miguel",
    "Angel_Angel_del_Nuevo_Comienzo",
    "Angel_Arcangel_Zadkiel"
  ],

  arcanos_mayores: [
    "arcanos_mayores_La_Sacerdotisa",
    "arcanos_mayores_El_Ermitano",
    "arcanos_mayores_La_Luna",
    "arcanos_mayores_El_Colgado",
    "arcanos_mayores_La_Muerte",
    "arcanos_mayores_Los_Enamorados",
    "arcanos_mayores_La_Emperatriz",
    "arcanos_mayores_El_Sol",
    "arcanos_mayores_La_Templanza",
    "arcanos_mayores_El_Carro",
    "arcanos_mayores_El_Emperador",
    "arcanos_mayores_El_mundo",
    "arcanos_mayores_El_Sumo_Sacerdote",
    "arcanos_mayores_El_Juicio",
    "arcanos_mayores_La_Rueda_De_La_Fortuna",
    "arcanos_mayores_La_Justicia",
    "arcanos_mayores_La_Estrella",
    "arcanos_mayores_La_Torre",
    "arcanos_mayores_El_Diablo",
    "arcanos_mayores_El_Mago",
    "arcanos_mayores_La_fuerza",
    "arcanos_mayores_El_loco"
  ],

  semilla_estelar: [
    "Semilla_estelar_El_Llamado_de_la_Noche",
    "Semilla_estelar_Mision_de_Alma",
    "Semilla_estelar_Memorias_de_Otras_Vidas",
    "Semilla_estelar_Rayo_Dorado",
    "Semilla_estelar_Codigos_de_Luz",
    "Semilla_estelar_Reconexion_con_el_Corazon",
    "Semilla_estelar_Portal_de_Encarnacion",
    "Semilla_estelar_Origen_Galactico",
    "Semilla_estelar_Puente_entre_Mundos",
    "Semilla_estelar_Consejo_de_Guias",
    "Semilla_estelar_Semilla_del_Coraje",
    "Semilla_estelar_Luz_en_la_Sombra",
    "Semilla_estelar_Hogar_en_la_Estrella",
    "Semilla_estelar_Santuario_Interior",
    "Semilla_estelar_Contrato_Almico",
    "Semilla_estelar_Guardianes_del_Umbral",
    "Semilla_estelar_Alianza_con_la_Tierra",
    "Semilla_estelar_Sincronias_del_Universo",
    "Semilla_estelar_Renacimiento_Estelar",
    "Semilla_estelar_Destino_Cuantico",
    "Semilla_estelar_Llamado_Estelar",
    "Semilla_estelarTribu_del_Alma"
  ]
};

// -------------------- HELPERS --------------------
function isAuthorizedCron(req) {
  const headerSecret = req.get("x-cron-secret");
  const querySecret = req.query?.secret;

  if (!CRON_SECRET) return false;
  return headerSecret === CRON_SECRET || querySecret === CRON_SECRET;
}

// Monday-based week key, stable for the whole week
function getWeekStartISO(date = new Date()) {
  // Use UTC to avoid timezone surprises
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diffToMonday = (day === 0 ? -6 : 1 - day); // move to Monday
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function weeklyKey(weekISO) {
  return `weekly:${weekISO}`;
}

function cardKey(weekISO, deck, cardId) {
  return `${weeklyKey(weekISO)}:${deck}:${cardId}`;
}

function deckKey(weekISO, deck) {
  return `${weeklyKey(weekISO)}:${deck}`;
}

function assertDeck(deck) {
  if (!DECKS[deck]) {
    const e = new Error(`Deck inválido: ${deck}`);
    e.status = 400;
    throw e;
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Sometimes models wrap JSON in ```json ... ```
    const cleaned = String(text)
      .trim()
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();
    return JSON.parse(cleaned);
  }
}

function normalizeReading(obj, { deck, cardId, weekISO }) {
  const required = [
    "titulo",
    "significado",
    "amor",
    "trabajo",
    "consejo_espiritual",
    "consejo_angelical",
    "afirmacion",
    "ritual",
    "invertida"
  ];

  const out = { ...obj };

  // Ensure required keys exist as strings
  for (const k of required) {
    if (typeof out[k] !== "string") out[k] = out[k] == null ? "" : String(out[k]);
  }

  // Attach meta
  out.meta = {
    deck,
    card_id: cardId,
    week_start: weekISO,
    model: OPENAI_MODEL,
    generated_at: new Date().toISOString()
  };

  return out;
}

async function generateReadingForCard({ deck, cardId, weekISO }) {
  // Prompting: force strict JSON, Spanish, and required structure
  const system = `
Eres una IA que escribe interpretaciones de cartas de tarot/ángeles en español.
Debes responder SOLO con JSON válido (sin markdown, sin texto extra).
El JSON debe tener exactamente estas claves:
titulo, significado, amor, trabajo, consejo_espiritual, consejo_angelical, afirmacion, ritual, invertida
Todas deben ser strings.
Tono: espiritual, claro, cálido, sin alarmismo, sin predicciones absolutas.
Longitud: cada campo 2-5 frases (afirmacion 1 frase; ritual 2-4 pasos).
No uses emojis.
`;

  const user = `
Genera la interpretación SEMANAL para:
- Baraja: ${deck}
- Carta (ID): ${cardId}
- Semana (comienza lunes): ${weekISO}

Devuelve el JSON EXACTO con las claves indicadas.
`;

  const res = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.8,
    messages: [
      { role: "system", content: system.trim() },
      { role: "user", content: user.trim() }
    ]
  });

  const text = res.choices?.[0]?.message?.content ?? "";
  const parsed = safeJsonParse(text);
  return normalizeReading(parsed, { deck, cardId, weekISO });
}

async function withRetry(fn, { retries = 3, baseMs = 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      const wait = baseMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function ensureRedisConnected() {
  if (redis.status !== "ready") {
    await redis.connect();
  }
}

// -------------------- ROUTES --------------------

// Health
app.get("/health", async (_req, res) => {
  try {
    await ensureRedisConnected();
    await redis.ping();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/**
 * CRON endpoint
 * POST /cron/weekly-refresh
 * Header: x-cron-secret: <CRON_SECRET>
 * (or /cron/weekly-refresh?secret=...)
 */
app.post("/cron/weekly-refresh", async (req, res) => {
  try {
    if (!isAuthorizedCron(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized cron" });
    }

    await ensureRedisConnected();

    const weekISO = getWeekStartISO(new Date());
    const rootKey = weeklyKey(weekISO);

    // Optional: skip if already generated
    const already = await redis.get(`${rootKey}:__done`);
    if (already === "1") {
      return res.json({ ok: true, week_start: weekISO, skipped: true });
    }

    // Concurrency limit (tune to avoid rate limits)
    const limit = pLimit(4); // 4 parallel calls (safe). You can set 2-6 depending on quotas.
    const tasks = [];

    for (const deck of Object.keys(DECKS)) {
      for (const cardId of DECKS[deck]) {
        tasks.push(
          limit(async () => {
            const ck = cardKey(weekISO, deck, cardId);

            const reading = await withRetry(
              async () => {
                // if exists, skip (idempotent)
                const exists = await redis.exists(ck);
                if (exists) return null;

                return await generateReadingForCard({ deck, cardId, weekISO });
              },
              { retries: 3, baseMs: 700 }
            );

            if (!reading) return { deck, cardId, skipped: true };

            // Store card data
            await redis.set(ck, JSON.stringify(reading));

            // Also store in a deck hash for quick fetch
            await redis.hset(deckKey(weekISO, deck), cardId, JSON.stringify(reading));

            return { deck, cardId, skipped: false };
          })
        );
      }
    }

    const results = await Promise.allSettled(tasks);

    const summary = {
      total: results.length,
      ok: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length
    };

    // Mark week done + set TTL (e.g., 14 days)
    await redis.set(`${rootKey}:__done`, "1");
    await redis.expire(`${rootKey}:__done`, 60 * 60 * 24 * 14);

    // Set TTL for all keys in this week (optional)
    // Note: scanning is expensive; we rely on stable weekly keys and optionally a background cleanup.
    // If you want TTL per card, set expire when saving:
    // await redis.expire(ck, 60*60*24*14); and same for deckKey hash.

    res.json({
      ok: true,
      week_start: weekISO,
      summary
    });
  } catch (e) {
    console.error("weekly-refresh error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/**
 * Get weekly reading for a single card
 * GET /weekly/:deck/:cardId
 */
app.get("/weekly/:deck/:cardId", async (req, res) => {
  try {
    await ensureRedisConnected();

    const { deck, cardId } = req.params;
    assertDeck(deck);

    const weekISO = getWeekStartISO(new Date());
    const ck = cardKey(weekISO, deck, cardId);

    const raw = await redis.get(ck);
    if (!raw) {
      return res.status(404).json({
        ok: false,
        error: "Not found (weekly content not generated yet)"
      });
    }

    res.json({ ok: true, week_start: weekISO, data: JSON.parse(raw) });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: String(e?.message || e) });
  }
});

/**
 * Get all weekly readings for a deck
 * GET /weekly/:deck
 */
app.get("/weekly/:deck", async (req, res) => {
  try {
    await ensureRedisConnected();

    const { deck } = req.params;
    assertDeck(deck);

    const weekISO = getWeekStartISO(new Date());
    const dk = deckKey(weekISO, deck);

    const hash = await redis.hgetall(dk);
    const out = {};

    for (const [cardId, val] of Object.entries(hash)) {
      try {
        out[cardId] = JSON.parse(val);
      } catch {
        out[cardId] = val;
      }
    }

    // If empty, return 404 to signal cron not run yet
    if (Object.keys(out).length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Not found (weekly content not generated yet)"
      });
    }

    res.json({ ok: true, week_start: weekISO, deck, data: out });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Error fallback
app.use((err, _req, res, _next) => {
  console.error("Unhandled:", err);
  res.status(err.status || 500).json({ ok: false, error: String(err?.message || err) });
});

// -------------------- START --------------------
app.listen(PORT, () => {
  console.log(`Tarot API listening on :${PORT}`);
});
