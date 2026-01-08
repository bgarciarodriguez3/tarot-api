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

// --- 2. CONFIGURACIÓN DE DORSOS (REVERSOS) ---
const dorsos = {
  arcanosMayores: "arcanos_mayores_Dorso_tarot_normal.PNG", //
  angeles: "Angel_Dorso_tarot_de_los_angeles.PNG", //
  semillaEstelar: "Semilla_estelar_Dorso_Semilla_Estelar_ok.PNG" //
};

// --- 3. BASE DE DATOS: ARCANOS MAYORES (22 CARTAS) ---
const arcanosMayoresCards = [
  { id: "0", name: "El Loco", image: "arcanos_mayores_El_loco.PNG", upright: { general: "Salto de fe y nuevos comienzos.", heartAdvice: "Ama sin miedo al pasado." }, reversed: { general: "Imprudencia o miedo al cambio." } },
  { id: "1", name: "El Mago", image: "arcanos_mayores_El_Mago.PNG", upright: { general: "Poder de manifestación.", heartAdvice: "Usa tu comunicación para crear amor." }, reversed: { general: "Talento desperdiciado." } },
  { id: "2", name: "La Sacerdotisa", image: "arcanos_mayores_La_Sacerdotisa.PNG", upright: { general: "Intuición y misterios.", heartAdvice: "Escucha tu voz interior." }, reversed: { general: "Desconexión espiritual." } },
  { id: "3", name: "La Emperatriz", image: "arcanos_mayores_La_Emperatriz.PNG", upright: { general: "Abundancia y fertilidad.", heartAdvice: "Nutre tu amor propio." }, reversed: { general: "Bloqueo creativo." } },
  { id: "4", name: "El Emperador", image: "arcanos_mayores_El_Emperador.PNG", upright: { general: "Estructura y autoridad.", heartAdvice: "Establece límites sanos." }, reversed: { general: "Rigidez." } },
  { id: "5", name: "El Sumo Sacerdote", image: "arcanos_mayores_El_Sumo_Sacerdote.PNG", upright: { general: "Sabiduría y valores.", heartAdvice: "Busca conexiones con propósito." }, reversed: { general: "Dogmas limitantes." } },
  { id: "6", name: "Los Enamorados", image: "arcanos_mayores_Los_Enamorados.PNG", upright: { general: "Elecciones del corazón.", heartAdvice: "Elige desde el alma." }, reversed: { general: "Conflicto en decisiones." } },
  { id: "7", name: "El Carro", image: "arcanos_mayores_El_Carro.PNG", upright: { general: "Victoria y avance.", heartAdvice: "Dirige tus emociones con firmeza." }, reversed: { general: "Falta de dirección." } },
  { id: "8", name: "La Justicia", image: "arcanos_mayores_La_Justicia.PNG", upright: { general: "Equilibrio y verdad.", heartAdvice: "Honestidad absoluta." }, reversed: { general: "Desequilibrio." } },
  { id: "9", name: "El Ermitaño", image: "arcanos_mayores_El_Ermitano.PNG", upright: { general: "Introspección.", heartAdvice: "Conócete en soledad." }, reversed: { general: "Aislamiento." } },
  { id: "10", name: "La Rueda de la Fortuna", image: "arcanos_mayores_La_Rueda_De_La_Fortuna.PNG", upright: { general: "Ciclos y destino.", heartAdvice: "Acepta los giros del amor." }, reversed: { general: "Resistencia al cambio." } },
  { id: "11", name: "La Fuerza", image: "arcanos_mayores_La_fuerza.PNG", upright: { general: "Coraje y compasión.", heartAdvice: "Domina tus miedos con suavidad." }, reversed: { general: "Inseguridad." } },
  { id: "12", name: "El Colgado", image: "arcanos_mayores_El_Colgado.PNG", upright: { general: "Pausa y perspectiva.", heartAdvice: "Suelta el control." }, reversed: { general: "Estancamiento." } },
  { id: "13", name: "La Muerte", image: "arcanos_mayores_La_Muerte.PNG", upright: { general: "Transformación profunda.", heartAdvice: "Deja morir lo viejo." }, reversed: { general: "Apego al pasado." } },
  { id: "14", name: "La Templanza", image: "arcanos_mayores_La_Templanza.PNG", upright: { general: "Moderación y paz.", heartAdvice: "Busca el punto medio." }, reversed: { general: "Desequilibrio." } },
  { id: "15", name: "El Diablo", image: "arcanos_mayores_El_Diablo.PNG", upright: { general: "Ataduras y sombras.", heartAdvice: "Libérate de dependencias." }, reversed: { general: "Liberación." } },
  { id: "16", name: "La Torre", image: "arcanos_mayores_La_Torre.PNG", upright: { general: "Ruptura de lo falso.", heartAdvice: "Construye sobre la verdad." }, reversed: { general: "Cambio evitado." } },
  { id: "17", name: "La Estrella", image: "arcanos_mayores_La_Estrella.PNG", upright: { general: "Esperanza y sanación.", heartAdvice: "Tu vulnerabilidad es tu luz." }, reversed: { general: "Pérdida de fe." } },
  { id: "18", name: "La Luna", image: "arcanos_mayores_La_Luna.PNG", upright: { general: "Intuición y miedos.", heartAdvice: "Distingue miedo de realidad." }, reversed: { general: "Confusión." } },
  { id: "19", name: "El Sol", image: "arcanos_mayores_El_Sol.PNG", upright: { general: "Éxito y alegría.", heartAdvice: "Disfruta con pureza." }, reversed: { general: "Felicidad bloqueada." } },
  { id: "20", name: "El Juicio", image: "arcanos_mayores_El_Juicio.PNG", upright: { general: "Despertar y perdón.", heartAdvice: "Renovación profunda." }, reversed: { general: "Autojuicio." } },
  { id: "21", name: "El Mundo", image: "arcanos_mayores_El_mundo.PNG", upright: { general: "Plenitud y cierre.", heartAdvice: "Has aprendido la lección." }, reversed: { general: "Ciclo pendiente." } }
];

// --- 4. BASE DE DATOS: ÁNGELES (12 CARTAS) ---
const angelesCards = [
  { id: "jofiel", name: "Arcángel Jofiel", image: "Angel_Arcangel_Jofiel.PNG", upright: { general: "Armonía y belleza.", ritual: "Ordena un espacio con calma.", affirmation: "Mi mente es paz." }, reversed: { general: "Caos mental." } },
  { id: "guarda", name: "Ángel de la Guarda", image: "Angel_Angel_de_la_Guarda.PNG", upright: { general: "Protección constante.", ritual: "Abrazo de luz blanca.", affirmation: "Nunca camino sola." }, reversed: { general: "Soledad." } },
  { id: "abundancia", name: "Ángel de la Abundancia", image: "Angel_Angel_de_la_Abundancia.PNG", upright: { general: "Prosperidad.", ritual: "Moneda bajo luz solar.", affirmation: "Merezco abundancia." }, reversed: { general: "Carencia." } },
  { id: "suenos", name: "Ángel de los Sueños", image: "Angel_Angel_de_los_Sueños.PNG", upright: { general: "Mensajes nocturnos.", ritual: "Vaso de agua en la mesita.", affirmation: "Mis sueños me guían." }, reversed: { general: "Intuición dormida." } },
  { id: "nuevo_comienzo", name: "Ángel del Nuevo Comienzo", image: "Angel_Angel_del_Nuevo_Comienzo.PNG", upright: { general: "Renacer.", ritual: "Escribe y quema miedos.", affirmation: "Hoy es un nuevo inicio." }, reversed: { general: "Estancamiento." } },
  { id: "tiempo_divino", name: "Ángel del Tiempo Divino", image: "Angel_Angel_del_Tiempo_Divino.PNG", upright: { general: "Sincronía.", ritual: "Acepta el presente.", affirmation: "Confío en el ritmo divino." }, reversed: { general: "Impaciencia." } },
  { id: "zadkiel", name: "Arcángel Zadkiel", image: "Angel_Arcangel_Zadkiel.PNG", upright: { general: "Transmutación.", ritual: "Enciende una vela violeta.", affirmation: "Suelto mi pasado." }, reversed: { general: "Rencor oculto." } },
  { id: "chamuel", name: "Arcángel Chamuel", image: "Angel_Arcangel_Chamuel.PNG", upright: { general: "Amor y autoestima.", ritual: "Cuarzo rosa en el pecho.", affirmation: "Soy amor puro." }, reversed: { general: "Desequilibrio afectivo." } },
  { id: "uriel", name: "Arcángel Uriel", image: "Angel_Arcangel_Uriel.PNG", upright: { general: "Claridad mental.", ritual: "Vela amarilla para luz.", affirmation: "Veo la verdad clara." }, reversed: { general: "Confusión." } },
  { id: "rafael", name: "Arcángel Rafael", image: "Angel_Arcangel_Rafael.PNG", upright: { general: "Sanación.", ritual: "Visualiza luz verde.", affirmation: "Mi alma se restaura." }, reversed: { general: "Negación de heridas." } },
  { id: "gabriel", name: "Arcángel Gabriel", image: "Angel_Arcangel_Gabriel.PNG", upright: { general: "Comunicación.", ritual: "Escribe tu verdad.", affirmation: "Mi voz es luz divina." }, reversed: { general: "Silencio forzado." } },
  { id: "miguel", name: "Arcángel Miguel", image: "Angel_Angel_Arcangel_Miguel.PNG", upright: { general: "Protección y fuerza.", ritual: "Visualiza alas azules.", affirmation: "Estoy protegida." }, reversed: { general: "Miedo e inseguridad." } }
];

// --- 5. BASE DE DATOS: SEMILLA ESTELAR (22 CARTAS) ---
const semillaEstelarCards = [
  { id: "1", name: "Consejo de Guías", image: "Semilla_estelar_Consejo_de_Guias.PNG", upright: { general: "Guía cósmica.", ritual: "Pregunta al cielo.", affirmation: "Escucho mis guías." }, reversed: { general: "Interferencia." } },
  { id: "2", name: "Hogar Estelar", image: "Semilla_estelar_Hogar_Estelar.PNG", upright: { general: "Origen galáctico.", ritual: "Mira las estrellas.", affirmation: "Vengo de la luz." }, reversed: { general: "Nostalgia." } },
  { id: "3", name: "Activación ADN", image: "Semilla_estelar_Activacion_ADN.PNG", upright: { general: "Evolución.", ritual: "Bebe agua pura.", affirmation: "Mi ADN se activa." }, reversed: { general: "Fatiga espiritual." } },
  { id: "4", name: "El Llamado", image: "Semilla_estelar_El_Llamado.PNG", upright: { general: "Misión activa.", ritual: "Pies en la tierra.", affirmation: "Sigo mi llamado." }, reversed: { general: "Duda." } },
  { id: "5", name: "Linaje de Luz", image: "Semilla_estelar_Linaje_de_Luz.PNG", upright: { general: "Herencia.", ritual: "Honra ancestros.", affirmation: "Soy luz ancestral." }, reversed: { general: "Karma." } },
  { id: "6", name: "Misión de Vida", image: "Semilla_estelar_Mision_de_Vida.PNG", upright: { general: "Propósito.", ritual: "Define tu meta.", affirmation: "Vivo mi misión." }, reversed: { general: "Desorientación." } },
  { id: "7", name: "Conexión Cósmica", image: "Semilla_estelar_Conexion_Cosmica.PNG", upright: { general: "Unidad.", ritual: "Medita.", affirmation: "Soy una con el todo." }, reversed: { general: "Separación." } },
  { id: "8", name: "Sabiduría Ancestral", image: "Semilla_estelar_Sabiduria_Ancestral.PNG", upright: { general: "Memoria antigua.", ritual: "Lee sabiduría.", affirmation: "Recuerdo mi saber." }, reversed: { general: "Olvido." } },
  { id: "9", name: "Despertar Colectivo", image: "Semilla_estelar_Despertar_Colectivo.PNG", upright: { general: "Ascensión.", ritual: "Envía luz al mundo.", affirmation: "Despertamos juntos." }, reversed: { general: "Ego." } },
  { id: "10", name: "Frecuencia Vibratoria", image: "Semilla_estelar_Frecuencia_Vibratoria.PNG", upright: { general: "Vibración.", ritual: "Usa cuencos.", affirmation: "Mi frecuencia sube." }, reversed: { general: "Densidad." } },
  { id: "11", name: "Sincronicidad", image: "Semilla_estelar_Sincronicidad.PNG", upright: { general: "Señales.", ritual: "Anota señales.", affirmation: "Atraigo magia." }, reversed: { general: "Caos." } },
  { id: "12", name: "Portal de Luz", image: "Semilla_estelar_Portal_de_Luz.PNG", upright: { general: "Tránsito.", ritual: "Cruza un portal.", affirmation: "Entro a la luz." }, reversed: { general: "Retraso." } },
  { id: "13", name: "Sanación Galáctica", image: "Semilla_estelar_Sanacion_Galactica.PNG", upright: { general: "Cura cósmica.", ritual: "Visualiza azul.", affirmation: "Sano multidimensionalmente." }, reversed: { general: "Dolor." } },
  { id: "14", name: "Geometría Sagrada", image: "Semilla_estelar_Geometria_Sagrada.PNG", upright: { general: "Orden.", ritual: "Dibuja mandalas.", affirmation: "Mi vida es divina." }, reversed: { general: "Desorden." } },
  { id: "15", name: "Akasha", image: "Semilla_estelar_Akasha.PNG", upright: { general: "Registros.", ritual: "Pregunta al alma.", affirmation: "Mi historia es sagrada." }, reversed: { general: "Confusión." } },
  { id: "16", name: "Unidad", image: "Semilla_estelar_Unidad.PNG", upright: { general: "Integración.", ritual: "Abraza fuerte.", affirmation: "Todo es uno." }, reversed: { general: "Soledad." } },
  { id: "17", name: "Amor Incondicional", image: "Semilla_estelar_Amor_Incondicional.PNG", upright: { general: "Afecto.", ritual: "Sonríe hoy.", affirmation: "Amo sin límites." }, reversed: { general: "Juicio." } },
  { id: "18", name: "Manifestación", image: "Semilla_estelar_Manifestacion.PNG", upright: { general: "Creación.", ritual: "Visualiza metas.", affirmation: "Yo creo mi mundo." }, reversed: { general: "Frustración." } },
  { id: "19", name: "Abundancia Infinita", image: "Semilla_estelar_Abundancia_Infinita.PNG", upright: { general: "Riqueza.", ritual: "Agradece.", affirmation: "Todo fluye a mí." }, reversed: { general: "Carencia." } },
  { id: "20", name: "Paz Profunda", image: "Semilla_estelar_Paz_Profunda.PNG", upright: { general: "Calma.", ritual: "Respira hondo.", affirmation: "Mi centro es paz." }, reversed: { general: "Ruido." } },
  { id: "21", name: "Libertad", image: "Semilla_estelar_Libertad.PNG", upright: { general: "Expansión.", ritual: "Baila libre.", affirmation: "Soy libre de ser." }, reversed: { general: "Límites." } },
  { id: "22", name: "Ascensión", image: "Semilla_estelar_Ascension.PNG", upright: { general: "Elevación.", ritual: "Visualiza alas.", affirmation: "Me elevo ahora." }, reversed: { general: "Gravedad." } }
];

// --- 6. RUTAS DE LA API ---

app.get('/api/decks', (req, res) => {
  res.json(DECKS);
});

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

// Inicio en puerto 8080 para Railway
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});
