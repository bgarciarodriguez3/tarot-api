const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// --- 1. CONFIGURACIÓN DE MAZOS ---
const DECKS = [
  { deckId: "arcanos_mayores", deckName: "Tarot Arcanos Mayores" },
  { deckId: "angeles", deckName: "Tarot de los Ángeles" },
  { deckId: "semilla_estelar", deckName: "Tarot Semilla Estelar" }
];

// --- 2. CONFIGURACIÓN DE DORSOS ---
const dorsos = {
  arcanosMayores: "arcanos_mayores_Dorso_tarot_normal.PNG",
  angeles: "Angel_Dorso_tarot_de_los_angeles.PNG",
  semillaEstelar: "Semilla_estelar_Dorso_Semilla_Estelar_ok.PNG"
};

// --- 3. BASE DE DATOS DE CARTAS ---
const angelesCards = [
  { id: "jofiel", name: "Arcángel Jofiel", image: "Angel_Arcangel_Jofiel.PNG", upright: { general: "Armonía mental y belleza." }, reversed: { general: "Caos o ansiedad." } },
  { id: "miguel", name: "Arcángel Miguel", image: "Angel_Angel_Arcangel_Miguel.PNG", upright: { general: "Protección y fuerza." }, reversed: { general: "Inseguridad." } },
  { id: "rafael", name: "Arcángel Rafael", image: "Angel_Arcangel_Rafael.PNG", upright: { general: "Sanación total." }, reversed: { general: "Negación de heridas." } },
  { id: "gabriel", name: "Arcángel Gabriel", image: "Angel_Arcangel_Gabriel.PNG", upright: { general: "Mensajes divinos." }, reversed: { general: "Bloqueo de expresión." } },
  { id: "chamuel", name: "Arcángel Chamuel", image: "Angel_Arcangel_Chamuel.PNG", upright: { general: "Amor y autoestima." }, reversed: { general: "Desequilibrio afectivo." } },
  { id: "uriel", name: "Arcángel Uriel", image: "Angel_Arcangel_Uriel.PNG", upright: { general: "Claridad mental." }, reversed: { general: "Confusión." } },
  { id: "zadkiel", name: "Arcángel Zadkiel", image: "Angel_Arcangel_Zadkiel.PNG", upright: { general: "Transmutación." }, reversed: { general: "Rencor oculto." } },
  { id: "guarda", name: "Ángel de la Guarda", image: "Angel_Angel_de_la_Guarda.PNG", upright: { general: "Cuidado constante." }, reversed: { general: "Soledad." } },
  { id: "abundancia", name: "Ángel de la Abundancia", image: "Angel_Angel_de_la_Abundancia.PNG", upright: { general: "Prosperidad infinita." }, reversed: { general: "Miedo a la carencia." } },
  { id: "suenos", name: "Ángel de los Sueños", image: "Angel_Angel_de_los_Sueños.PNG", upright: { general: "Guía nocturna." }, reversed: { general: "Intuición dormida." } },
  { id: "nuevo_comienzo", name: "Ángel del Nuevo Comienzo", image: "Angel_Angel_del_Nuevo_Comienzo.PNG", upright: { general: "Renacimiento." }, reversed: { general: "Resistencia al cambio." } },
  { id: "tiempo_divino", name: "Ángel del Tiempo Divino", image: "Angel_Angel_del_Tiempo_Divino.PNG", upright: { general: "Sincronía perfecta." }, reversed: { general: "Impaciencia." } }
];

// --- 4. RUTAS DE LA API ---
app.get('/api/decks', (req, res) => {
  res.json(DECKS);
});

app.get('/api/cards/:deckId', (req, res) => {
  const { deckId } = req.params;
  let cards = [];
  let backImage = "";

  if (deckId === 'arcanos_mayores') {
    backImage = dorsos.arcanosMayores;
  } else if (deckId === 'angeles') {
    cards = angelesCards;
    backImage = dorsos.angeles;
  }

  res.json({ cards, backImage });
});

// --- 5. INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
