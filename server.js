const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

/**
 * HEALTH CHECK
 */
app.get("/", (req, res) => {
  res.json({ ok: true, message: "tarot-api running" });
});

/**
 * CONFIGURACIÓN DE PRODUCTOS
 */
const PRODUCTS = {
  angeles_4: {
    name: "Mensaje de los Ángeles",
    deck: "angeles",
    deckSize: 12,
    cardsRequired: 4,
  },
  semilla_5: {
    name: "Camino de la Semilla Estelar",
    deck: "semilla_estelar",
    deckSize: 12,
    cardsRequired: 5,
  },
  destino_3: {
    name: "Tres Puertas del Destino",
    deck: "arcanos_mayores",
    deckSize: 22,
    cardsRequired: 3,
  },
  profunda_12: {
    name: "Lectura Profunda",
    deck: "arcanos_mayores",
    deckSize: 22,
    cardsRequired: 12,
  },
};

/**
 * ENDPOINT PRINCIPAL DE TAROT
 */
app.post("/tarot/reading", (req, res) => {
  const { productId, selectedCards } = req.body;

  if (!productId || !Array.isArray(selectedCards)) {
    return res.status(400).json({
      ok: false,
      error: "productId y selectedCards son obligatorios",
    });
  }

  const product = PRODUCTS[productId];

  if (!product) {
    return res.status(400).json({
      ok: false,
      error: "Producto no válido",
    });
  }

  if (selectedCards.length !== product.cardsRequired) {
    return res.status(400).json({
      ok: false,
      error: `Este producto requiere ${product.cardsRequired} cartas`,
    });
  }

  // ⚠️ Aquí luego conectaremos la IA
  const reading = selectedCards.map((card, index) => ({
    position: index + 1,
    card,
    meaning: `Interpretación simbólica de ${card}`,
  }));

  res.json({
    ok: true,
    product: product.name,
    deck: product.deck,
    cards: reading,
    message: "Lectura generada correctamente",
  });
});

/**
 * START SERVER
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
