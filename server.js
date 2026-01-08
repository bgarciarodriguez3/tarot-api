const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai'); // Necesitas añadir openai a tu package.json
const app = express();

app.use(cors());
app.use(express.json());

// Configuración de OpenAI usando la clave que ya tienes en Railway
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

// --- 3. BASE DE DATOS DE CARTAS (Resumen para el servidor) ---
const angelesCards = [
  { id: "jofiel", name: "Arcángel Jofiel", image: "Angel_Arcangel_Jofiel.PNG", upright: { general: "Armonía." }, reversed: { general: "Caos." } },
  { id: "guarda", name: "Ángel de la Guarda", image: "Angel_Angel_de_la_Guarda.PNG", upright: { general: "Protección." }, reversed: { general: "Soledad." } },
  { id: "abundancia", name: "Ángel de la Abundancia", image: "Angel_Angel_de_la_Abundancia.PNG", upright: { general: "Prosperidad." }, reversed: { general: "Carencia." } },
  { id: "suenos", name: "Ángel de los Sueños", image: "Angel_Angel_de_los_Sueños.PNG", upright: { general: "Guía nocturna." }, reversed: { general: "Pesadillas." } },
  { id: "nuevo_comienzo", name: "Ángel del Nuevo Comienzo", image: "Angel_Angel_del_Nuevo_Comienzo.PNG", upright: { general: "Renacer." }, reversed: { general: "Miedo." } },
  { id: "tiempo_divino", name: "Ángel del Tiempo Divino", image: "Angel_Angel_del_Tiempo_Divino.PNG", upright: { general: "Paciencia." }, reversed: { general: "Prisa." } },
  { id: "zadkiel", name: "Arcángel Zadkiel", image: "Angel_Arcangel_Zadkiel.PNG", upright: { general: "Perdón." }, reversed: { general: "Rencor." } },
  { id: "chamuel", name: "Arcángel Chamuel", image: "Angel_Arcangel_Chamuel.PNG", upright: { general: "Amor." }, reversed: { general: "Odio." } },
  { id: "uriel", name: "Arcángel Uriel", image: "Angel_Arcangel_Uriel.PNG", upright: { general: "Claridad." }, reversed: { general: "Confusión." } },
  { id: "rafael", name: "Arcángel Rafael", image: "Angel_Arcangel_Rafael.PNG", upright: { general: "Sanación." }, reversed: { general: "Dolor." } },
  { id: "gabriel", name: "Arcángel Gabriel", image: "Angel_Arcangel_Gabriel.PNG", upright: { general: "Mensajes." }, reversed: { general: "Silencio." } },
  { id: "miguel", name: "Arcángel Miguel", image: "Angel_Angel_Arcangel_Miguel.PNG", upright: { general: "Fuerza." }, reversed: { general: "Debilidad." } }
];

// (Aquí irían los otros mazos arcanosMayoresCards y semillaEstelarCards que ya tienes)

// --- 4. RUTAS DE LA API ---

app.get('/', (req, res) => res.send('API de Tarot Activa con IA'));

app.get('/api/decks', (req, res) => res.json(DECKS));

app.get('/api/cards/:deckId', (req, res) => {
  const { deckId } = req.params;
  // Lógica de selección de mazos (la que ya tienes funciona bien)
  res.json({ cards: angelesCards, backImage: dorsos.angeles }); 
});

// --- NUEVA RUTA: INTERPRETACIÓN CON IA ---
app.post('/api/interpret', async (req, res) => {
  const { cards, deckName } = req.body;

  try {
    const prompt = `Actúa como una experta en tarot y guía espiritual. 
    He realizado una tirada con el mazo "${deckName}". 
    Las cartas obtenidas son: ${cards.map(c => `${c.name} ${c.reversed ? '(Invertida)' : '(Derecha)'}`).join(', ')}.
    Por favor, proporciona una interpretación holística, amorosa y profunda para quien consulta.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
    });

    res.json({ interpretation: completion.choices[0].message.content });
  } catch (error) {
    console.error("Error en OpenAI:", error);
    res.status(500).json({ interpretation: "Hubo un error al conectar con los astros. Por favor, intenta de nuevo." });
  }
});

// --- 5. INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});
