// lib/airtable-utils.js
// Helpers para leer Decks/Products/Cards desde Airtable + fallback local
const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');

// Env vars esperadas
const BASE = process.env.AIRTABLE_BASE_ID;
const PAT = process.env.AIRTABLE_PAT;
const DECKS_TABLE = process.env.AIRTABLE_DECKS_TABLE || 'Decks';
const PRODUCTS_TABLE = process.env.AIRTABLE_PRODUCTS_TABLE || 'Products';
const CARDS_TABLE = process.env.AIRTABLE_CARDS_TABLE || 'Cards';

if (!BASE || !PAT) {
  console.warn('Airtable env vars missing: AIRTABLE_BASE_ID or AIRTABLE_PAT');
}

// Simple cache en memoria
const cache = new Map();
const TTL = 1000 * 60 * 2; // 2 minutos
function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > TTL) { cache.delete(key); return null; }
  return e.value;
}
function cacheSet(key, value) { cache.set(key, { value, ts: Date.now() }); }

async function airtableFetch(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${PAT}` }});
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Airtable error ${res.status}: ${txt}`);
  }
  return res.json();
}

// Product lookup
async function findProductByProductId(productId) {
  const k = `product:${productId}`;
  const c = cacheGet(k);
  if (c) return c;
  const filter = `filterByFormula={product_id}='${productId}'`;
  const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(PRODUCTS_TABLE)}?${filter}&maxRecords=1`;
  const json = await airtableFetch(url);
  const rec = (json.records && json.records[0]) || null;
  cacheSet(k, rec);
  return rec;
}

// Fetch cards from Cards table by deck_id
async function fetchCardsByDeckId(deckId) {
  const k = `cardsByDeck:${deckId}`;
  const c = cacheGet(k);
  if (c) return c;
  const table = CARDS_TABLE;
  const filter = `filterByFormula={deck_id}='${deckId}'`;
  const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}?${filter}&maxRecords=100`;
  const json = await airtableFetch(url);
  const recs = json.records || [];
  const cards = recs.map(r => {
    const f = r.fields || {};
    return {
      id: f.card_id || r.id,
      name: f.card || f.name || '',
      meaning: f.notes || f.meaning || '',
      image: f.image_url || (f.attachments && f.attachments[0] && f.attachments[0].url) || ''
    };
  });
  cacheSet(k, cards);
  return cards;
}

// Local deck loader (data/decks/{name}.json)
async function loadLocalDeckByName(name) {
  if (!name) return null;
  const tryNames = [name];
  const noSuffix = name.replace(/_\d+$/, '');
  if (noSuffix !== name) tryNames.push(noSuffix);
  for (const n of tryNames) {
    const p = path.join(process.cwd(), 'data', 'decks', `${n}.json`);
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        const deckObj = JSON.parse(raw);
        const cards = Array.isArray(deckObj.cards) ? deckObj.cards : [];
        return {
          deck_id: deckObj.deck_id || deckObj.slug || n,
          name: deckObj.name || n,
          description: deckObj.description || '',
          cards,
          raw: deckObj
        };
      }
    } catch (err) {
      console.warn('Error reading local deck file', p, err.message);
    }
  }
  return null;
}

// Find deck by deckId with Airtable -> local fallback -> cards table fallback
async function findDeckByDeckId(deckId) {
  if (!deckId) return null;
  const k = `deck:${deckId}`;
  const cached = cacheGet(k);
  if (cached) return cached;

  // 1) Try Airtable Decks table by deck_id
  try {
    const filter = `filterByFormula={deck_id}='${deckId}'`;
    const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(DECKS_TABLE)}?${filter}&maxRecords=1`;
    const json = await airtableFetch(url);
    const rec = (json.records && json.records[0]) || null;
    if (rec) {
      const fields = rec.fields || {};
      let cards = [];
      if (fields.cards_json) {
        try { cards = typeof fields.cards_json === 'string' ? JSON.parse(fields.cards_json) : fields.cards_json; }
        catch(e){ cards = []; }
      } else if (fields.Cards && Array.isArray(fields.Cards) && fields.Cards.length) {
        const recordIds = fields.Cards;
        const cardsArr = [];
        for (const rid of recordIds) {
          const urlRec = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(CARDS_TABLE)}/${rid}`;
          try {
            const recCard = await airtableFetch(urlRec);
            const f = recCard.fields || {};
            cardsArr.push({
              id: f.card_id || recCard.id,
              name: f.card || f.name || '',
              meaning: f.notes || f.meaning || '',
              image: f.image_url || (f.attachments && f.attachments[0] && f.attachments[0].url) || ''
            });
          } catch(e) {}
        }
        cards = cardsArr;
      }
      const deck = {
        deck_id: fields.deck_id || rec.id,
        name: fields.name || '',
        description: fields.description || '',
        cards,
        raw: fields
      };
      cacheSet(k, deck);
      return deck;
    }
  } catch (err) {
    console.warn('Airtable decks fetch failed', err.message);
  }

  // 2) Local fallback
  try {
    const local = await loadLocalDeckByName(deckId);
    if (local) { cacheSet(k, local); return local; }
  } catch (err) {
    console.warn('Local deck load failed', err.message);
  }

  // 3) cards table fallback
  try {
    const cards = await fetchCardsByDeckId(deckId);
    if (cards && cards.length) {
      const deckObj = { deck_id: deckId, name: deckId, description: '', cards, raw: {} };
      cacheSet(k, deckObj);
      return deckObj;
    }
  } catch (err) {
    console.warn('Fetch cards by deck id failed', err.message);
  }

  cacheSet(k, null);
  return null;
}

// get deck for product
async function getDeckForProduct(productId) {
  const prodRec = await findProductByProductId(productId);
  if (!prodRec) return null;
  const f = prodRec.fields || {};

  let deckId = f.deck_id || f.deck || null;

  if (Array.isArray(deckId) && deckId.length === 1) {
    const deckRecordId = deckId[0];
    try {
      const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(DECKS_TABLE)}/${deckRecordId}`;
      const rec = await airtableFetch(url);
      const fields = rec.fields || {};
      let cards = [];
      if (fields.cards_json) {
        try { cards = JSON.parse(fields.cards_json); } catch(e){ cards = []; }
      } else {
        if (fields.Cards && Array.isArray(fields.Cards) && fields.Cards.length) {
          const cardsArr = [];
          for (const rid of fields.Cards) {
            try {
              const cardRec = await airtableFetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(CARDS_TABLE)}/${rid}`);
              const ff = cardRec.fields || {};
              cardsArr.push({
                id: ff.card_id || cardRec.id,
                name: ff.card || ff.name || '',
                meaning: ff.notes || ff.meaning || '',
                image: ff.image_url || (ff.attachments && ff.attachments[0] && ff.attachments[0].url) || ''
              });
            } catch(e) {}
          }
          cards = cardsArr;
        }
      }
      return { deck_id: fields.deck_id || rec.id, name: fields.name, description: fields.description, cards, raw: fields };
    } catch(e) {}
  }

  if (!deckId) return null;
  return findDeckByDeckId(deckId);
}

module.exports = { getDeckForProduct, findDeckByDeckId, findProductByProductId };

