const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

// --- CONFIGURACIÓN DE CORS ACTUALIZADA ---
app.use(cors({
  origin: [
    "https://eltarotdelaruedadelafortuna.com",
    "https://www.eltarotdelaruedadelafortuna.com",
    "https://el-tarot-de-la-rueda-de-la-fortuna.myshopify.com"
  ],
  methods: ["GET", "POST"],
  credentials: true
}));

app.use(express.json());

const PORT = process.env.PORT || 3000;

// Carpeta de imágenes
const IMAGES_PATH = path.join(__dirname, "data", "decks", "images");
app.use("/images", express.static(IMAGES_PATH));

// Ruta de diagnóstico
app.get("/debug-images", (req, res) => {
  if (fs.existsSync(IMAGES_PATH)) {
    const files = fs.readdirSync(IMAGES_PATH);
    res.json({ status: "Carpeta encontrada", ruta: IMAGES_PATH, total_fotos: files.length, archivos: files });
  } else {
    res.status(404).json({ status: "Carpeta NO encontrada", ruta: IMAGES_PATH });
  }
});

const DECKS_DIR = path.join(__dirname, "data", "decks");

/* --- Lógica de carga de Decks --- */
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

// NUEVA RUTA: Para compatibilidad con tu script de Shopify (si usa POST /tarot/reading)
app.post("/tarot/reading", (req, res) => {
  const { productId } = req.body;
  const deck = DECKS[productId] || DECKS["10495993446737"]; // Fallback al mazo por defecto
  
  if (!deck) return res.status(404).json({ ok: false, error: "Mazo no encontrado" });
  
  res.json({
    ok: true,
    reading: deck.cards,
    back: deck.backImage || "back.jpg" // Asegúrate de tener este campo en tu JSON
  });
});

app.listen(PORT, () => console.log("Servidor corriendo en puerto: " + PORT));
