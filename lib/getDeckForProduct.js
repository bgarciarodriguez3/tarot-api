const fs = require("fs");
const path = require("path");

function getDeckForProduct(productId) {
  const map = {
    angeles_12: "angeles.json",
  };

  const file = map[productId];
  if (!file) throw new Error(`Unknown productId: ${productId}`);

  const filePath = path.join(process.cwd(), "data", "decks", file);
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);

  // soporta: [ ... ] o { cards: [ ... ] }
  const cards = Array.isArray(parsed) ? parsed : parsed?.cards;

  if (!Array.isArray(cards)) {
    throw new Error(`Invalid deck format in ${file}`);
  }

  return {
    deck_id: productId,
    name: productId,
    cards,
  };
}

module.exports = { getDeckForProduct };
