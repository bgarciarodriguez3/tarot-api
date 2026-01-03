const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Buscamos la carpeta de imágenes en la ruta exacta de tu GitHub: /data/decks/images
const IMAGES_PATH = path.join(__dirname, "data", "decks", "images");

// Servir imágenes con el prefijo /images
app.use("/images", express.static(IMAGES_PATH));

// Ruta de diagnóstico para que TÚ veas si el servidor encuentra las fotos
app.get("/debug-images", (req, res) => {
  if (fs.existsSync(IMAGES_PATH)) {
    const files = fs.readdirSync(IMAGES_PATH);
    res.json({ status: "Carpeta encontrada", ruta: IMAGES_PATH, total_fotos: files.length, archivos: files });
  } else {
    res.status(404).json({ status: "Carpeta NO encontrada", ruta: IMAGES_PATH });
  }
});

const DECKS_DIR = path.join(__dirname, "data", "decks");

/* --- Lógica de carga de Decks (Mantener igual que antes) --- */
let DECKS = {};
function loadDecks() {
  DECKS = {};
  if (!fs.existsSync(DECKS_DIR)) return;
  const files = fs.readdirSync(DECKS_DIR).filter(f => f.endsWith(".json"));
  files.forEach(file => {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, file), "utf8"));
      DECKS[raw.deckId || path.basename(file, ".json")] = raw;
    } catch (e) { console.error("Error en " + file); }
  });
}
loadDecks();

app.get("/", (req, res) => res.json({ ok: true, message: "API Tarot Lista" }));
app.get("/api/decks/:deckId/cards", (req, res) => {
  const deck = DECKS[req.params.deckId];
  if (!deck) return res.status(404).json({ error: "No encontrado" });
  res.json(deck.cards || deck);
});

app.listen(PORT, () => console.log("Puerto: " + PORT));
