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
const arcanosMayoresCards = [
  { id: "0", name: "El Loco", image: "arcanos_mayores_El_loco.PNG", upright: { general: "Salto de fe." }, reversed: { general: "Imprudencia." } },
  { id: "1", name: "El Mago", image: "arcanos_mayores_El_Mago.PNG", upright: { general: "Poder creativo." }, reversed: { general: "Manipulación." } },
  { id: "2", name: "La Sacerdotisa", image: "arcanos_mayores_La_Sacerdotisa.PNG", upright: { general: "Intuición." }, reversed: { general: "Secretos." } },
  { id: "3", name: "La Emperatriz", image: "arcanos_mayores_La_Emperatriz.PNG", upright: { general: "Abundancia." }, reversed: { general: "Bloqueo." } },
  { id: "4", name: "El Emperador", image: "arcanos_mayores_El_Emperador.PNG", upright: { general: "Estructura." }, reversed: { general: "Rigidez." } },
  { id: "5", name: "El Sumo Sacerdote", image: "arcanos_mayores_El_Sumo_Sacerdote.PNG", upright: { general: "Sabiduría." }, reversed: { general: "Dogma." } },
  { id: "6", name: "Los Enamorados", image: "arcanos_mayores_Los_Enamorados.PNG", upright: { general: "Elecciones." }, reversed: { general: "Dudas." } },
  { id: "7", name: "El Carro", image: "arcanos_mayores_El_Carro.PNG", upright: { general: "Victoria." }, reversed: { general: "Falta de control." } },
  { id: "8", name: "La Justicia", image: "arcanos_mayores_La_Justicia.PNG", upright: { general: "Equilibrio." }, reversed: { general: "Injusticia." } },
  { id: "9", name: "El Ermitaño", image: "arcanos_mayores_El_Ermitano.PNG", upright: { general: "Introspección." }, reversed: { general: "Aislamiento." } },
  { id: "10", name: "La Rueda de la Fortuna", image: "arcanos_mayores_La_Rueda_De_La_Fortuna.PNG", upright: { general: "Cambio." }, reversed: { general: "Resistencia." } },
  { id: "11", name: "La Fuerza", image: "arcanos_mayores_La_fuerza.PNG", upright: { general: "Coraje." }, reversed: { general: "Debilidad." } },
  { id: "12", name: "El Colgado", image: "arcanos_mayores_El_Colgado.PNG", upright: { general: "Perspectiva." }, reversed: { general: "Estancamiento." } },
  { id: "13", name: "La Muerte", image: "arcanos_mayores_La_Muerte.PNG", upright: { general: "Renovación." }, reversed: { general: "Apego." } },
  { id: "14", name: "La Templanza", image: "arcanos_mayores_La_Templanza.PNG", upright: { general: "Moderación." }, reversed: { general: "Exceso." } },
  { id: "15", name: "El Diablo", image: "arcanos_mayores_El_Diablo.PNG", upright: { general: "Sombras." }, reversed: { general: "Liberación." } },
  { id: "16", name: "La Torre", image: "arcanos_mayores_La_Torre.PNG", upright: { general: "Revelación." }, reversed: { general: "Crisis." } },
  { id: "17", name: "La Estrella", image: "arcanos_mayores_La_Estrella.PNG", upright: { general: "Esperanza." }, reversed: { general: "Desaliento." } },
  { id: "18", name: "La Luna", image: "arcanos_mayores_La_Luna.PNG", upright: { general: "Misterio." }, reversed: { general: "Confusión." } },
  { id: "19", name: "El Sol", image: "arcanos_mayores_El_Sol.PNG", upright: { general: "Claridad." }, reversed: { general: "Tristeza." } },
  { id: "20", name: "El Juicio", image: "arcanos_mayores_El_Juicio.PNG", upright: { general: "Despertar." }, reversed: { general: "Duda." } },
  { id: "21", name: "El Mundo", image: "arcanos_mayores_El_mundo.PNG", upright: { general: "Plenitud." }, reversed: { general: "Pendiente." } }
];

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

const semillaEstelarCards = [
  { id: "1", name: "Consejo de Guías", image: "Semilla_estelar_Consejo_de_Guias.PNG", upright: { general: "Guía." }, reversed: { general: "Ruido." } },
  { id: "2", name: "Hogar Estelar", image: "Semilla_estelar_Hogar_Estelar.PNG", upright: { general: "Origen." }, reversed: { general: "Exilio." } },
  { id: "3", name: "Activación ADN", image: "Semilla_estelar_Activacion_ADN.PNG", upright: { general: "Evolución." }, reversed: { general: "Parón." } },
  { id: "4", name: "El Llamado", image: "Semilla_estelar_El_Llamado.PNG", upright: { general: "Misión." }, reversed: { general: "Duda." } },
  { id: "5", name: "Linaje de Luz", image: "Semilla_estelar_Linaje_de_Luz.PNG", upright: { general: "Herencia." }, reversed: { general: "Olvido." } },
  { id: "6", name: "Misión de Vida", image: "Semilla_estelar_Mision_de_Vida.PNG", upright: { general: "Propósito." }, reversed: { general: "Caos." } },
  { id: "7", name: "Conexión Cósmica", image: "Semilla_estelar_Conexion_Cosmica.PNG", upright: { general: "Unidad." }, reversed: { general: "Ego." } },
  { id: "8", name: "Sabiduría Ancestral", image: "Semilla_estelar_Sabiduria_Ancestral.PNG", upright: { general: "Poder." }, reversed: { general: "Miedo." } },
  { id: "9", name: "Despertar Colectivo", image: "Semilla_estelar_Despertar_Colectivo.PNG", upright: { general: "Unión." }, reversed: { general: "Odio." } },
  { id: "10", name: "Frecuencia Vibratoria", image: "Semilla_estelar_Frecuencia_Vibratoria.PNG", upright: { general: "Luz." }, reversed: { general: "Densidad." } },
  { id: "11", name: "Sincronicidad", image: "Semilla_estelar_Sincronicidad.PNG", upright: { general: "Magia." }, reversed: { general: "Azar." } },
  { id: "12", name: "Portal de Luz", image: "Semilla_estelar_Portal_de_Luz.PNG", upright: { general: "Paso." }, reversed: { general: "Bloqueo." } },
  { id: "13", name: "Sanación Galáctica", image: "Semilla_estelar_Sanacion_Galactica.PNG", upright: { general: "Salud." }, reversed: { general: "Herida." } },
  { id: "14", name: "Geometría Sagrada", image: "Semilla_estelar_Geometria_Sagrada.PNG", upright: { general: "Orden." }, reversed: { general: "Ruido." } },
  { id: "15", name: "Akasha", image: "Semilla_estelar_Akasha.PNG", upright: { general: "Verdad." }, reversed: { general: "Mentira." } },
  { id: "16", name: "Unidad", image: "Semilla_estelar_Unidad.PNG", upright: { general: "Amor." }, reversed: { general: "Juicio." } },
  { id: "17", name: "Amor Incondicional", image: "Semilla_estelar_Amor_Incondicional.PNG", upright: { general: "Paz." }, reversed: { general: "Ira." } },
  { id: "18", name: "Manifestación", image: "Semilla_estelar_Manifestacion.PNG", upright: { general: "Creación." }, reversed: { general: "Fracaso." } },
  { id: "19", name: "Abundancia Infinita", image: "Semilla_estelar_Abundancia_Infinita.PNG", upright: { general: "Flujo." }, reversed: { general: "Cierre." } },
  { id: "20", name: "Paz Profunda", image: "Semilla_estelar_Paz_Profunda.PNG", upright: { general: "Calma." }, reversed: { general: "Tormenta." } },
  { id: "21", name: "Libertad", image: "Semilla_estelar_Libertad.PNG", upright: { general: "Vuelo." }, reversed: { general: "Cárcel." } },
  { id: "22", name: "Ascensión", image: "Semilla_estelar_Ascension.PNG", upright: { general: "Luz." }, reversed: { general: "Oscuridad." } }
];

// --- 4. RUTAS DE LA API ---

app.get('/', (req, res) => res.send('API de Tarot Activa'));

app.get('/api/decks', (req, res) => res.json(DECKS));

app.get('/api/cards/:deckId', (req, res) => {
  const { deckId } = req.params;
  let cards = [];
  let backImage = "";

  if (deckId === 'arcanos_mayores') {
    cards = arcanosMayoresCards;
    backImage = dorsos.arcanosMayores;
  } else if (deckId === 'angeles') {
    cards = angelesCards;
    backImage = dorsos.angeles;
  } else if (deckId === 'semilla_estelar') {
    cards = semillaEstelarCards;
    backImage = dorsos.semillaEstelar;
  }

  res.json({ cards, backImage });
});

// --- 5. INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
