const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

// --- CONFIGURACIÓN DE CORS ---
// Permite que tu tienda Shopify se comunique con este servidor
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

// Configuración de rutas de archivos
const IMAGES_PATH = path.join(__dirname, "data", "decks", "images");
const DECKS_DIR = path.join(__dirname, "data", "decks");

// Servir imágenes públicamente
app.use("/images", express.static(IMAGES_PATH));

/* --- Lógica de carga de Mazos (Decks) --- */
let DECKS = {};
function loadDecks() {
  DECKS = {};
  if (!fs.existsSync(DECKS_DIR)) {
    console.log("Carpeta de mazos no encontrada");
    return;
  }
  const files = fs.readdirSync(DECKS_DIR).filter(f => f.endsWith(".json"));
  files.forEach(file => {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, file), "utf8"));
      // Registramos el mazo por su ID o nombre de archivo
      const deckKey = raw.deckId || path.basename(file, ".json");
      DECKS[deckKey] = raw;
    } catch (e) { 
      console.error("Error cargando el archivo " + file + ": ", e); 
    }
  });
}
loadDecks();

// --- RUTAS DE LA API ---

// 1. Diagnóstico principal
app.get("/", (req, res) => res.json({ ok: true, message: "API Tarot Lista" }));

// 2. Diagnóstico de imágenes
app.get("/debug-images", (req, res) => {
  if (fs.existsSync(IMAGES_PATH)) {
    const files = fs.readdirSync(IMAGES_PATH);
    res.json({ status: "Carpeta encontrada", total_fotos: files.length, archivos: files });
  } else {
    res.status(404).json({ status: "Carpeta NO encontrada" });
  }
});

// 3. Ruta de lectura de cartas (La que usa Shopify)
app.post("/tarot/reading", (req, res) => {
  const { productId } = req.body;
  
  // Buscamos el mazo correspondiente al producto o usamos Semilla Estelar por defecto
  const deck = DECKS[productId] || DECKS["10495993446737"];
  
  if (!deck) {
    return res.status(404).json({ ok: false, error: "Mazo no encontrado en el servidor" });
  }

  // Entregamos la lectura directamente. 
  // La validación de seguridad ya la hizo Zapier al verificar el pago.
  res.json({
    ok: true,
    reading: deck.cards,
    back: deck.backImage || "back.jpg"
  });
});

app.listen(PORT, () => {
  console.log("Servidor corriendo exitosamente en el puerto: " + PORT);
});
