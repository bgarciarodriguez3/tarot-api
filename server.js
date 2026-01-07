const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// --- 1. CONFIGURACIÓN DE MAZOS ---
const DECKS = [
  {
    deckId: "semilla_estelar",
    deckName: "Tarot Semilla Estelar"
  }
];

// --- 2. BASE DE DATOS DE CARTAS (22 Cartas Únicas) ---
const semillaEstelarCards = [
  {
    id: "alianza_tierra",
    name: "Alianza con la tierra",
    image: "Semilla_estelar_Alianza_con_la_Tierra.jpg",
    upright: {
      general: "Elegiste encarnar en este planeta por una razón sagrada. La Tierra te llamó para formar parte de su proceso evolutivo.",
      spiritualAdvice: "Abre tus pies a la tierra. Regresa al presente; allí está todo lo que necesitas."
    },
    reversed: {
      general: "Desarraigo o dificultad para materializar la espiritualidad.",
      spiritualAdvice: "Regresa a lo simple y lo cotidiano para recuperar tu anclaje."
    }
  },
  {
    id: "codigos_luz",
    name: "Códigos de Luz",
    image: "Semilla_estelar_Códigos_de_Luz.jpg",
    upright: {
      general: "Transmisión directa de energía para despertar tu ADN espiritual. Estás recibiendo una actualización vibratoria.",
      spiritualAdvice: "No bloquees la energía tratando de comprenderla. Los Códigos de Luz se integran en silencio."
    },
    reversed: {
      general: "Bloqueos energéticos o saturación espiritual.",
      spiritualAdvice: "Integra lo que ya has recibido antes de seguir expandiendo tu energía."
    }
  },
  {
    id: "consejo_guias",
    name: "Consejo de Guías",
    image: "Semilla_estelar_Consejo_de_Guías.jpg",
    upright: {
      general: "Seres de luz se acercan para darte orientación y protección. No estás tomando este camino sol@.",
      spiritualAdvice: "Haz silencio para escuchar la voz de tu alma; tus guías hablan a través de corazonadas."
    },
    reversed: {
      general: "Desconfianza en la guía espiritual o dependencia de opiniones externas.",
      spiritualAdvice: "La guía sigue presente. Confía en lo que sientes para reabrir el canal."
    }
  },
  {
    id: "contrato_almico",
    name: "Contrato Álmico",
    image: "Semilla_estelar_Contrato_Álmico.jpg",
    upright: {
      general: "Acuerdos sagrados establecidos antes de encarnar. Indica encuentros predestinados y aprendizajes cruciales.",
      spiritualAdvice: "No luches contra tu camino. Tu alma eligió lo que mejor servía a su expansión."
    },
    reversed: {
      general: "Vínculos kármicos no comprendidos o acuerdos pendientes de sanar.",
      spiritualAdvice: "Es momento de cerrar pactos antiguos para poder avanzar."
    }
  },
  {
    id: "destino_cuantico",
    name: "Destino Cuántico",
    image: "Semilla_estelar_Destino_Cuántico.jpg",
    upright: {
      general: "Revela el potencial más elevado de tu alma. Emocionalmente, esta carta indica una alineación profunda con tu propósito.",
      spiritualAdvice: "El universo te invita a tomar decisiones más elevadas. Tu alma ya conoce el camino."
    },
    reversed: {
      general: "Negación del mundo interior o miedo a los procesos inconscientes.",
      spiritualAdvice: "Presta atención a los mensajes que llegan en el silencio."
    }
  },
  {
    id: "llamado_noche",
    name: "El Llamado de la Noche",
    image: "Semilla_estelar_El_Llamado_de_la_Noche.jpg",
    upright: {
      general: "Tus sentidos internos se despiertan. Invitación a territorios sutiles del alma y sueños lúcidos.",
      spiritualAdvice: "No ignores los mensajes nocturnos. Confía en lo que sientes cuando todo está en calma."
    },
    reversed: {
      general: "Rechazo de los procesos inconscientes o miedo al silencio.",
      spiritualAdvice: "La noche trae mensajes que aún no quieres escuchar; búscalos en la quietud."
    }
  },
  {
    id: "guardianes_umbral",
    name: "Guardianes del Umbral",
    image: "Semilla_estelar_Guardianes_del_Umbral.jpg",
    upright: {
      general: "Custodios de portales sagrados. Estás frente a un umbral donde tu alma dará un salto cuántico.",
      spiritualAdvice: "Los guardianes piden coherencia entre alma, mente y acción. Estás lista para cruzar."
    },
    reversed: {
      general: "Resistencia a enfrentar pruebas necesarias o miedo a la transformación.",
      spiritualAdvice: "El umbral no es castigo, sino iniciación. Suelta el peso antiguo."
    }
  },
  {
    id: "hogar_estrella",
    name: "Hogar en la Estrella",
    image: "Semilla_estelar_Hogar_en_la_Estrella.jpg",
    upright: {
      general: "Energía del origen de tu alma. Reconexión con raíces cósmicas y tu familia galáctica.",
      spiritualAdvice: "Tu hogar vive dentro de ti. Reconoce tu origen pero honra tu misión en la Tierra."
    },
    reversed: {
      general: "Nostalgia paralizante o sensación de desarraigo.",
      spiritualAdvice: "Te invita a crear raíces internas aquí y ahora."
    }
  },
  {
    id: "llamado_estelar",
    name: "Llamado Estelar",
    image: "Semilla_estelar_Llamado_Estelar.jpg",
    upright: {
      general: "Vibración que despierta tu memoria más antigua. Comunicación sutil de tus guías.",
      spiritualAdvice: "No necesitas entenderlo todo. Solo di: 'Estoy lista' y permite que tu guía interior hable."
    },
    reversed: {
      general: "Evasión del llamado interior o miedo a escuchar la voz del alma.",
      spiritualAdvice: "El mensaje sigue llegando aunque no se quiera atender. Haz una pausa y escucha."
    }
  },
  {
    id: "luz_sombra",
    name: "Luz en la Sombra",
    image: "Semilla_estelar_Luz_en_la_Sombra.jpg",
    upright: {
      general: "Momento alquímico para mirar lo oculto con amor. Tu sombra guarda un don.",
      spiritualAdvice: "No huyas de lo que duele: escúchalo. Permite que la luz entre en lo más profundo."
    },
    reversed: {
      general: "Negación de aspectos internos o miedo a mirar la propia sombra.",
      spiritualAdvice: "La luz no desaparece, pero necesita atravesar lo que se evita para integrar tu ser."
    }
  },
  {
    id: "memorias_otras_vidas",
    name: "Memorias de Otras Vidas",
    image: "Semilla_estelar_Memorias_de_Otras_Vidas.jpg",
    upright: {
      general: "Apertura de tu campo akáshico para acceder a dones de encarnaciones pasadas.",
      spiritualAdvice: "Confía en tus sensaciones e intuiciones. Las memorias se recuerdan con el alma."
    },
    reversed: {
      general: "Patrones repetitivos no comprendidos o heridas antiguas.",
      spiritualAdvice: "Toma conciencia para liberar esas cargas y patrones que ya no sirven."
    }
  },
  {
    id: "mision_alma",
    name: "Misión de Alma",
    image: "Semilla_estelar_Misión_de_Alma.jpg",
    upright: {
      general: "Representa el propósito profundo por el cual encarnaste. No es una tarea, es una brújula.",
      spiritualAdvice: "Tu misión no necesita ser descubierta, sino recordada. Observa lo que enciende tu corazón."
    },
    reversed: {
      general: "Confusión vocacional o desconexión del propósito.",
      spiritualAdvice: "La misión sigue activa aunque ahora no se perciba. Escucha para reconectar."
    }
  },
  {
    id: "origen_galactico",
    name: "Origen Galáctico",
    image: "Semilla_estelar_Origen_Galáctico.jpg",
    upright: {
      general: "Despierta la memoria antigua de tu existencia. Antes de ser humano, fuiste luz.",
      spiritualAdvice: "Abraza tu rareza y sensibilidad como dones. Tu origen vive en tu ADN energético."
    },
    reversed: {
      general: "Negación de la propia sensibilidad o rechazo de la diferencia.",
      spiritualAdvice: "Atiende a la confusión sobre tu identidad profunda y acepta la vastedad de tu alma."
    }
  },
  {
    id: "portal_encarnacion",
    name: "Portal de Encarnación",
    image: "Semilla_estelar_Portal_de_Encarnación.jpg",
    upright: {
      general: "Representa el instante en que tu alma cruzó hacia la materia.",
      spiritualAdvice: "Honra tu camino, incluso las partes difíciles. Todo tiene sentido desde el alma."
    },
    reversed: {
      general: "Dificultad para integrar lo espiritual con lo humano.",
      spiritualAdvice: "Recuerda por qué viniste y acepta tu camino humano plenamente."
    }
  },
  {
    id: "puente_mundos",
    name: "Puente entre Mundos",
    image: "Semilla_estelar_Puente_entre_Mundos.jpg",
    upright: {
      general: "Capacidad innata para moverte entre planos. Eres un canal entre la materia y la luz.",
      spiritualAdvice: "No temas a lo que percibes. Tu alma recuerda su naturaleza multidimensional."
    },
    reversed: {
      general: "Escapismo o desconexión del cuerpo.",
      spiritualAdvice: "Enraízate para poder canalizar sin perder tu centro."
    }
  },
  {
    id: "rayo_dorado",
    name: "Rayo Dorado",
    image: "Semilla_estelar_Rayo_Dorado.jpg",
    upright: {
      general: "Representa la iluminación y soberanía del alma. Es la chispa divina de tu poder interno.",
      spiritualAdvice: "Suelta la culpa por brillar. Tu luz es conciencia; permite que ilumine todo."
    },
    reversed: {
      general: "Desvalorización personal o duda sobre el propio brillo.",
      spiritualAdvice: "Reclama tu lugar. Disuelve las viejas narrativas de inseguridad."
    }
  },
  {
    id: "reconexion_corazon",
    name: "Reconexión con el Corazón",
    image: "Semilla_estelar_Reconexión_con_el_Corazón.jpg",
    upright: {
      general: "Retorno a tu centro energético sagrado. Llamado a la suavidad y autenticidad.",
      spiritualAdvice: "Escucha lo que sientes y menos lo que temes. Tu corazón es un portal."
    },
    reversed: {
      general: "Bloqueo emocional o dificultad para expresar emociones.",
      spiritualAdvice: "Abre el corazón con suavidad. Regresa a tu sensibilidad original."
    }
  },
  {
    id: "renacimiento_estelar",
    name: "Renacimiento Estelar",
    image: "Semilla_estelar_Renacimiento_Estelar.jpg",
    upright: {
      general: "Marca un antes y un después. Emocionalmente, señala la liberación de cargas antiguas y un cambio de identidad interna.",
      spiritualAdvice: "Abraza la nueva versión de ti sin nostalgia. Tu alma renace hacia una vibración más pura."
    },
    reversed: {
      general: "Resistencia al cambio profundo o apego al pasado.",
      spiritualAdvice: "El ciclo anterior ya concluyó. Suelta lo viejo para recibir lo nuevo."
    }
  },
  {
    id: "santuario_interior",
    name: "Santuario Interior",
    image: "Semilla_estelar_Santuario_Interior.jpg",
    upright: {
      general: "Representa el templo sagrado dentro de ti. Emocionalmente, habla de la necesidad de descanso, silencio y límites energéticos.",
      spiritualAdvice: "Regresa a tu centro. Detén el ruido mental y entra en la quietud de tu corazón."
    },
    reversed: {
      general: "Dificultad para encontrar paz interna o ruido mental excesivo.",
      spiritualAdvice: "Busca silencio y autocuidado urgente para recargar tu campo áurico."
    }
  },
  {
    id: "semilla_coraje",
    name: "Semilla del Coraje",
    image: "Semilla_estelar_Semilla_del_Coraje.jpg",
    upright: {
      general: "Chispa divina de fuerza plantada en tu alma. Emocionalmente simboliza resiliencia y superación de miedos antiguos.",
      spiritualAdvice: "El coraje aparece cuando actúas. Toma decisiones valientes que honren tu verdad."
    },
    reversed: {
      general: "Desconexión con la fuerza interna o exceso de duda.",
      spiritualAdvice: "No viniste a vivir pequeña. Activa tu poder interior y da el paso."
    }
  },
  {
    id: "sincronias_universo",
    name: "Sincronías del Universo",
    image: "Semilla_estelar_Sincronías_del_Universo.jpg",
    upright: {
      general: "La existencia te habla cuando estás alineada. Emocionalmente señala confianza en la vida e intuición activada.",
      spiritualAdvice: "Nada es casualidad. Presta atención a las señales; el universo confirma que vas por buen camino."
    },
    reversed: {
      general: "Desconexión con las señales o exceso de lógica racional.",
      spiritualAdvice: "Las señales siguen ahí. Suelta el análisis excesivo para poder interpretarlas."
    }
  },
  {
    id: "tribu_alma",
    name: "Tribu del Alma",
    image: "Semilla_estelar_Tribu_del_Alma.jpg",
    upright: {
      general: "Almas que viajan contigo. Emocionalmente representa sentirte comprendida y atraer relaciones alineadas.",
      spiritualAdvice: "Abre tu corazón a nuevas conexiones. Tu misión se expande junto a quienes resuenan con tu luz."
    },
    reversed: {
      general: "Sensación de no pertenecer o aislamiento espiritual.",
      spiritualAdvice: "La tribu existe, pero el miedo al rechazo te impide verla. Permítete ser vista."
    }
  }
];

// --- 3. RUTAS TÉCNICAS ---
app.get("/api/decks", (req, res) => {
  res.json(DECKS);
});

app.get("/api/decks/:id/cards", (req, res) => {
  const deckId = req.params.id;
  if (deckId === "semilla_estelar") {
    res.json(semillaEstelarCards);
  } else {
    res.json([]);
  }
});

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Servidor Semilla Estelar Activo" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});
