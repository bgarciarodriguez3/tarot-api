// --- CONFIGURACIÓN DE DORSOS ---
const dorsos = {
  arcanosMayores: "arcanos_mayores_Dorso_tarot_normal.PNG", //
  angeles: "Angel_Dorso_tarot_de_los_angeles.PNG", //
  semillaEstelar: "Semilla_estelar_Dorso_Semilla_Estelar_ok.PNG" //
};

// --- MAZO 1: ARCANOS MAYORES (22 CARTAS) ---
const arcanosMayoresCards = [
  { id: "0", name: "El Loco", image: "arcanos_mayores_El_loco.PNG", upright: { general: "Salto de fe y nuevos comienzos.", heartAdvice: "Ama sin miedo al pasado." }, reversed: { general: "Imprudencia o miedo al cambio." } },
  { id: "1", name: "El Mago", image: "arcanos_mayores_El_Mago.PNG", upright: { general: "Poder de manifestación y recursos.", heartAdvice: "Usa tu comunicación para crear amor." }, reversed: { general: "Talento desperdiciado o manipulación." } },
  { id: "2", name: "La Sacerdotisa", image: "arcanos_mayores_La_Sacerdotisa.PNG", upright: { general: "Intuición y misterios revelados.", heartAdvice: "Escucha tu voz interior en el amor." }, reversed: { general: "Desconexión espiritual." } },
  { id: "3", name: "La Emperatriz", image: "arcanos_mayores_La_Emperatriz.PNG", upright: { general: "Abundancia y fertilidad creativa.", heartAdvice: "Nutre tu amor propio primero." }, reversed: { general: "Bloqueo creativo o carencia." } },
  { id: "4", name: "El Emperador", image: "arcanos_mayores_El_Emperador.PNG", upright: { general: "Estructura y autoridad interna.", heartAdvice: "Establece límites sanos." }, reversed: { general: "Rigidez o falta de control." } },
  { id: "5", name: "El Sumo Sacerdote", image: "arcanos_mayores_El_Sumo_Sacerdote.PNG", upright: { general: "Sabiduría y valores compartidos.", heartAdvice: "Busca conexiones con propósito." }, reversed: { general: "Rebeldía o dogmas limitantes." } },
  { id: "6", name: "Los Enamorados", image: "arcanos_mayores_Los_Enamorados.PNG", upright: { general: "Elecciones del corazón y alineación.", heartAdvice: "Elige desde el alma." }, reversed: { general: "Conflicto en decisiones." } },
  { id: "7", name: "El Carro", image: "arcanos_mayores_El_Carro.PNG", upright: { general: "Victoria y avance decidido.", heartAdvice: "Dirige tus emociones con firmeza." }, reversed: { general: "Falta de dirección." } },
  { id: "8", name: "La Justicia", image: "arcanos_mayores_La_Justicia.PNG", upright: { general: "Equilibrio y verdad.", heartAdvice: "Honestidad absoluta en el vínculo." }, reversed: { general: "Desequilibrio o injusticia." } },
  { id: "9", name: "El Ermitaño", image: "arcanos_mayores_El_Ermitano.PNG", upright: { general: "Introspección y guía interior.", heartAdvice: "Conócete en soledad." }, reversed: { general: "Aislamiento o miedo a mirar dentro." } },
  { id: "10", name: "La Rueda de la Fortuna", image: "arcanos_mayores_La_Rueda_De_La_Fortuna.PNG", upright: { general: "Ciclos y cambios de destino.", heartAdvice: "Acepta los giros del amor." }, reversed: { general: "Resistencia al movimiento." } },
  { id: "11", name: "La Fuerza", image: "arcanos_mayores_La_fuerza.PNG", upright: { general: "Coraje y compasión.", heartAdvice: "Domina tus miedos con suavidad." }, reversed: { general: "Inseguridad o impulsividad." } },
  { id: "12", name: "El Colgado", image: "arcanos_mayores_El_Colgado.PNG", upright: { general: "Pausa y nueva perspectiva.", heartAdvice: "Suelta el control del resultado." }, reversed: { general: "Estancamiento o victimismo." } },
  { id: "13", name: "La Muerte", image: "arcanos_mayores_La_Muerte.PNG", upright: { general: "Transformación y finales necesarios.", heartAdvice: "Deja morir lo que ya no sirve." }, reversed: { general: "Apego al pasado." } },
  { id: "14", name: "La Templanza", image: "arcanos_mayores_La_Templanza.PNG", upright: { general: "Moderación y paz.", heartAdvice: "Busca el punto medio en la pareja." }, reversed: { general: "Desequilibrio emocional." } },
  { id: "15", name: "El Diablo", image: "arcanos_mayores_El_Diablo.PNG", upright: { general: "Ataduras y reconocimiento de sombras.", heartAdvice: "Libérate de dependencias." }, reversed: { general: "Liberación de cadenas." } },
  { id: "16", name: "La Torre", image: "arcanos_mayores_La_Torre.PNG", upright: { general: "Ruptura de lo falso.", heartAdvice: "Construye sobre bases reales." }, reversed: { general: "Cambio evitado." } },
  { id: "17", name: "La Estrella", image: "arcanos_mayores_La_Estrella.PNG", upright: { general: "Esperanza y sanación.", heartAdvice: "Tu vulnerabilidad es tu luz." }, reversed: { general: "Pérdida de fe." } },
  { id: "18", name: "La Luna", image: "arcanos_mayores_La_Luna.PNG", upright: { general: "Intuición y miedos ocultos.", heartAdvice: "Distingue entre miedo y realidad." }, reversed: { general: "Confusión o autoengaño." } },
  { id: "19", name: "El Sol", image: "arcanos_mayores_El_Sol.PNG", upright: { general: "Éxito, alegría y brillo.", heartAdvice: "Disfruta el amor con pureza." }, reversed: { general: "Alegría bloqueada." } },
  { id: "20", name: "El Juicio", image: "arcanos_mayores_El_Juicio.PNG", upright: { general: "Despertar y perdón.", heartAdvice: "Renovación afectiva profunda." }, reversed: { general: "Autojuicio severo." } },
  { id: "21", name: "El Mundo", image: "arcanos_mayores_El_mundo.PNG", upright: { general: "Plenitud y cierre de ciclo.", heartAdvice: "Has aprendido la lección." }, reversed: { general: "Ciclo incompleto." } }
];

// --- MAZO 2: TAROT DE LOS ÁNGELES (12 CARTAS SELECCIONADAS) ---
const angelesCards = [
  { id: "jofiel", name: "Arcángel Jofiel", image: "Angel_Arcangel_Jofiel.PNG", upright: { general: "Armonía mental y belleza.", ritual: "Ordena tu escritorio con intención.", affirmation: "La paz habita en mí." }, reversed: { general: "Caos o ansiedad." } },
  { id: "guarda", name: "Ángel de la Guarda", image: "Angel_Angel_de_la_Guarda.PNG", upright: { general: "Cuidado constante.", ritual: "Visualiza luz blanca envolviéndote.", affirmation: "Nunca camino sola." }, reversed: { general: "Soledad percibida." } },
  { id: "abundancia", name: "Ángel de la Abundancia", image: "Angel_Angel_de_la_Abundancia.PNG", upright: { general: "Prosperidad infinita.", ritual: "Sostén una moneda bajo luz solar.", affirmation: "Merezco recibir." }, reversed: { general: "Miedo a la carencia." } },
  { id: "suenos", name: "Ángel de los Sueños", image: "Angel_Angel_de_los_Sueños.PNG", upright: { general: "Guía nocturna.", ritual: "Bebe agua antes de dormir.", affirmation: "Mis sueños me guían." }, reversed: { general: "Intuición dormida." } },
  { id: "nuevo_comienzo", name: "Ángel del Nuevo Comienzo", image: "Angel_Angel_del_Nuevo_Comienzo.PNG", upright: { general: "Renacimiento.", ritual: "Escribe y rompe tus miedos.", affirmation: "Hoy renazco en luz." }, reversed: { general: "Resistencia al cambio." } },
  { id: "tiempo_divino", name: "Ángel del Tiempo Divino", image: "Angel_Angel_del_Tiempo_Divino.PNG", upright: { general: "Sincronía perfecta.", ritual: "Acepta el presente en silencio.", affirmation: "Todo llega a tiempo." }, reversed: { general: "Impaciencia." } },
  { id: "zadkiel", name: "Arcángel Zadkiel", image: "Angel_Arcangel_Zadkiel.PNG", upright: { general: "Transmutación.", ritual: "Enciende una vela violeta.", affirmation: "Yo transmuto mi dolor." }, reversed: { general: "Rencor oculto." } },
  { id: "chamuel", name: "Arcángel Chamuel", image: "Angel_Arcangel_Chamuel.PNG", upright: { general: "Amor y autoestima.", ritual: "Cuarzo rosa en el corazón.", affirmation: "Soy digna de amor." }, reversed: { general: "Desequilibrio afectivo." } },
  { id: "uriel", name: "Arcángel Uriel", image: "Angel_Arcangel_Uriel.PNG", upright: { general: "Claridad mental.", ritual: "Vela amarilla para respuestas.", affirmation: "Veo la verdad." }, reversed: { general: "Confusión." } },
  { id: "rafael", name: "Arcángel Rafael", image: "Angel_Arcangel_Rafael.PNG", upright: { general: "Sanación total.", ritual: "Visualiza luz verde esmeralda.", affirmation: "Mi cuerpo se sana." }, reversed: { general: "Negación de heridas." } },
  { id: "gabriel", name: "Arcángel Gabriel", image: "Angel_Arcangel_Gabriel.PNG", upright: { general: "Mensajes divinos.", ritual: "Escritura automática.", affirmation: "Escucho mi alma." }, reversed: { general: "Bloqueo de expresión." } },
  { id: "miguel", name: "Arcángel Miguel", image: "Angel_Angel_Arcangel_Miguel.PNG", upright: { general: "Protección y fuerza.", ritual: "Visualiza alas azules.", affirmation: "Estoy protegida." }, reversed: { general: "Inseguridad." } }
];

// --- MAZO 3: SEMILLA ESTELAR (22 CARTAS COMPLETAS CON RITUALES) ---
const semillaEstelarCards = [
  { id: "1", name: "Consejo de Guías", image: "Semilla_estelar_Consejo_de_Guias.PNG", upright: { general: "Guía directa.", ritual: "Pide una señal antes de dormir.", affirmation: "Mis guías me hablan." }, reversed: { general: "Interferencia." } },
  { id: "2", name: "Hogar Estelar", image: "Semilla_estelar_Hogar_Estelar.PNG", upright: { general: "Pertenencia cósmica.", ritual: "Mira las estrellas en silencio.", affirmation: "El universo es mi hogar." }, reversed: { general: "Nostalgia." } },
  { id: "3", name: "Activación ADN", image: "Semilla_estelar_Activacion_ADN.PNG", upright: { general: "Evolución celular.", ritual: "Bebe agua solarizada.", affirmation: "Mi ADN se ilumina." }, reversed: { general: "Fatiga espiritual." } },
  { id: "4", name: "El Llamado", image: "Semilla_estelar_El_Llamado.PNG", upright: { general: "Propósito activo.", ritual: "Camina descalza en la tierra.", affirmation: "Respondo a mi llamado." }, reversed: { general: "Duda de misión." } },
  { id: "5", name: "Linaje de Luz", image: "Semilla_estelar_Linaje_de_Luz.PNG", upright: { general: "Herencia espiritual.", ritual: "Honra a tus ancestros de luz.", affirmation: "Soy portadora de luz." }, reversed: { general: "Carga kármica." } },
  { id: "6", name: "Misión de Vida", image: "Semilla_estelar_Mision_de_Vida.PNG", upright: { general: "Acción consciente.", ritual: "Define tu meta principal hoy.", affirmation: "Vivo con propósito." }, reversed: { general: "Desorientación." } },
  { id: "7", name: "Conexión Cósmica", image: "Semilla_estelar_Conexion_Cosmica.PNG", upright: { general: "Unidad galáctica.", ritual: "Medita bajo la luna.", affirmation: "Soy una con el cosmos." }, reversed: { general: "Aislamiento." } },
  { id: "8", name: "Sabiduría Ancestral", image: "Semilla_estelar_Sabiduria_Ancestral.PNG", upright: { general: "Conocimiento antiguo.", ritual: "Lee un texto sagrado.", affirmation: "La sabiduría fluye en mí." }, reversed: { general: "Olvido." } },
  { id: "9", name: "Despertar Colectivo", image: "Semilla_estelar_Despertar_Colectivo.PNG", upright: { general: "Conciencia grupal.", ritual: "Envía luz al planeta.", affirmation: "Somos uno." }, reversed: { general: "Egoísmo." } },
  { id: "10", name: "Frecuencia Vibratoria", image: "Semilla_estelar_Frecuencia_Vibratoria.PNG", upright: { general: "Elevación energética.", ritual: "Escucha cuencos tibetanos.", affirmation: "Vibro en amor alto." }, reversed: { general: "Densidad." } },
  { id: "11", name: "Sincronicidad", image: "Semilla_estelar_Sincronicidad.PNG", upright: { general: "Magia cotidiana.", ritual: "Anota las señales del día.", affirmation: "La magia me rodea." }, reversed: { general: "Incredulidad." } },
  { id: "12", name: "Portal de Luz", image: "Semilla_estelar_Portal_de_Luz.PNG", upright: { general: "Oportunidad sagrada.", ritual: "Atraviesa una puerta con intención.", affirmation: "Entro en mi nueva vida." }, reversed: { general: "Oportunidad perdida." } },
  { id: "13", name: "Sanación Galáctica", image: "Semilla_estelar_Sanacion_Galactica.PNG", upright: { general: "Cura multidimensional.", ritual: "Imagina luz azul eléctrico.", affirmation: "Sano en todo nivel." }, reversed: { general: "Dolor antiguo." } },
  { id: "14", name: "Geometría Sagrada", image: "Semilla_estelar_Geometria_Sagrada.PNG", upright: { general: "Orden divino.", ritual: "Dibuja un círculo perfecto.", affirmation: "Mi vida está en orden." }, reversed: { general: "Caos estructural." } },
  { id: "15", name: "Akasha", image: "Semilla_estelar_Akasha.PNG", upright: { general: "Registros del alma.", ritual: "Pregunta al silencio.", affirmation: "Recuerdo mi verdad." }, reversed: { general: "Miedo a la verdad." } },
  { id: "16", name: "Unidad", image: "Semilla_estelar_Unidad.PNG", upright: { general: "Integración total.", ritual: "Abraza a un ser querido.", affirmation: "Soy parte del todo." }, reversed: { general: "Separación." } },
  { id: "17", name: "Amor Incondicional", image: "Semilla_estelar_Amor_Incondicional.PNG", upright: { general: "Afecto sin límites.", ritual: "Sonríe a un extraño.", affirmation: "Amo sin condiciones." }, reversed: { general: "Juicio." } },
  { id: "18", name: "Manifestación", image: "Semilla_estelar_Manifestacion.PNG", upright: { general: "Creación de realidad.", ritual: "Haz un vision board.", affirmation: "Yo creo mi realidad." }, reversed: { general: "Frustración." } },
  { id: "19", name: "Abundancia Infinita", image: "Semilla_estelar_Abundancia_Infinita.PNG", upright: { general: "Riqueza del alma.", ritual: "Agradece 10 cosas hoy.", affirmation: "Tengo todo lo que necesito." }, reversed: { general: "Avaricia." } },
  { id: "20", name: "Paz Profunda", image: "Semilla_estelar_Paz_Profunda.PNG", upright: { general: "Calma del vacío.", ritual: "Haz 5 minutos de silencio.", affirmation: "Mi centro es paz." }, reversed: { general: "Ruido mental." } },
  { id: "21", name: "Libertad", image: "Semilla_estelar_Libertad.PNG", upright: { general: "Expansión del ser.", ritual: "Baila sin música.", affirmation: "Soy libre de elegir." }, reversed: { general: "Opresión." } },
  { id: "22", name: "Ascensión", image: "Semilla_estelar_Ascension.PNG", upright: { general: "Elevación final.", ritual: "Imagina que vuelas.", affirmation: "Me elevo en conciencia." }, reversed: { general: "Apego material." } }
];

module.exports = {
  arcanosMayoresCards,
  angelesCards,
  semillaEstelarCards,
  dorsos
};
