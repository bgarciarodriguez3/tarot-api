// api/products/[productId]/spread.js
const { getDeckForProduct } = require('../../../lib/airtable-utils');
const fs = require('fs');
const path = require('path');

function seededRand(seed) {
  let a = seed >>> 0;
  return function() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(array, seed) {
  const arr = array.slice();
  const rand = seed !== undefined ? seededRand(seed) : Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = async (req, res) => {
  try {
    // productId viene del nombre de la carpeta dinámica [productId]
    const productId = req.query && (req.query.productId || req.query.product_id);
    if (!productId) {
      return res.status(400).json({ ok: false, error: 'Missing productId' });
    }

    // obtén deck (usa Airtable + fallback local dentro de lib)
    const deck = await getDeckForProduct(productId);
    if (!deck) {
      return res.status(404).json({ ok: false, error: `Deck not found for product ${productId}` });
    }

    const cards = Array.isArray(deck.cards) ? deck.cards.slice() : [];
    if (cards.length < 4) {
      return res.status(500).json({ ok: false, error: 'Deck has insufficient cards' });
    }

    const positions = [
      { pos: 1, name: 'Mensaje del Ángel' },
      { pos: 2, name: 'Guía / Apoyo' },
      { pos: 3, name: 'Bloqueo / Lección' },
      { pos: 4, name: 'Acción a tomar' }
    ];

    const seedParam = req.query && req.query.seed;
    const seed = seedParam ? parseInt(seedParam, 10) : undefined;

    const shuffled = shuffle(cards, seed);
    const drawn = shuffled.slice(0, positions.length);

    const result = positions.map((p, i) => ({
      position: p.name,
      positionIndex: p.pos,
      card: drawn[i]
    }));

    return res.status(200).json({
      ok: true,
      product_id: productId,
      spread: 'angeles_4',
      deck: { slug: deck.deck_id || deck.slug || 'angeles', name: deck.name },
      seed: seed || null,
      timestamp: new Date().toISOString(),
      result
    });
  } catch (err) {
    console.error('Product spread error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error', details: err.message });
  }
};

