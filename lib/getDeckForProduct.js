import fs from "fs";
import path from "path";

export function getDeckForProduct(product) {
  const map = {
    angeles_12: "angeles.json",
  };

  const file = map[product];
  if (!file) {
    throw new Error(`Unknown product: ${product}`);
  }

  const filePath = path.join(process.cwd(), "data", "decks", file);
  const raw = fs.readFileSync(filePath, "utf-8");
  const deck = JSON.parse(raw);

  if (!Array.isArray(deck) && !Array.isArray(deck?.cards)) {
    throw new Error(`Invalid deck format in ${file}`);
  }

  return Array.isArray(deck) ? deck : deck.cards;
}
