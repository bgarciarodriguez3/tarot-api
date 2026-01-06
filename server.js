const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

// --- CONFIGURACIÓN DE CORS ---
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

// Almacén temporal de sesiones (Tokens)
const sessions = new Map();

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
      const deckKey = raw.deckId || path.basename(file, ".json");
      DECKS[deckKey] = raw;
    } catch (e) { 
      console.error("Error cargando el archivo " + file + ": ", e); 
    }
  });
}
loadDecks();

// --- RUTAS DE LA API ---

// 1. Diagnóstico principal (Ayuda a despertar la API)
app.get("/", (req, res) => res.json({ ok: true, message: "API Tarot Lista" }));

// 2. ENDPOINT PARA ZAPIER (Crea el token que buscas)
app.post("/create-link", (req, res) => {
  const { order_id, email, product_id } = req.body;

  if (!order_id || !email) {
    return res.status(400).json({ ok: false, error: "Faltan datos (order_id o email)" });
  }

  // Generamos el Token único
  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  // Guardamos la sesión
  sessions.set(token, {
    order_id,
    email,
    product_id,
    status: "pending",
    createdAt: Date.now()
  });

  // Enviamos respuesta a Zapier
  res.json({
    ok: true,
    token: token,
    link: `https://eltarotdelaruedadelafortuna.com/pages/acceso-tarot-seguro?t=${token}`
  });
});

// 3. VALIDACIÓN PARA SHOPIFY (Quita el error de "Pedido no verificado")
app.get("/validate-token", (req, res) => {
  const { t } = req.query;
  const session = sessions.get(t);

  if (session) {
    res.json({ ok: true, session });
  } else {
    res.status(403).json({ ok: false, error: "Token no válido o expirado" });
  }
});

// 4. Ruta de lectura de cartas (Ajustada para usar con el token)
app.post("/tarot/reading", (req, res) => {
  const { productId } = req.body;
  const deck = DECKS[productId] || DECKS["10495993446737"]; // Semilla Estelar por defecto
  
  if (!deck) {
    return res.status(404).json({ ok: false, error: "Mazo no encontrado en el servidor" });
  }

  res.json({
    ok: true,
    reading: deck.cards,
    back: deck.backImage || "back.jpg"
  });
});

app.listen(PORT, () => {
  console.log("Servidor corriendo exitosamente en el puerto: " + PORT);
});
