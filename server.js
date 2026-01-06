const express = require("express");
const cors = require("cors");
const { OpenAI } = require("openai");

const app = express();
app.use(express.json());

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

// --- CONFIGURACIÓN DE OPENAI ---
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Almacenamiento temporal de sesiones (en memoria)
const sessions = new Map();

// --- RUTA 1: CREAR ENLACE DE ACCESO (Para Zapier) ---
app.post("/create-link", (req, res) => {
    const { order_id, email, product_id } = req.body;

    if (!order_id || !email) {
        return res.status(400).json({ ok: false, error: "Faltan datos (order_id o email)" });
    }

    const token = Math.random().toString(36).substring(2, 15);
    
    sessions.set(token, {
        order_id,
        email,
        product_id,
        createdAt: Date.now()
    });

    const link = `https://eltarotdelaruedadelafortuna.com/pages/acceso-tarot-seguro?t=${token}`;
    res.json({ ok: true, token, link });
});

// --- RUTA 2: VALIDAR TOKEN (Para Shopify) ---
app.get("/validate-token", (req, res) => {
    const token = req.query.t;
    const session = sessions.get(token);

    if (session) {
        res.json({ ok: true, session });
    } else {
        res.json({ ok: false, error: "Token no válido o expirado" });
    }
});

// --- RUTA 3: GENERAR LECTURA CON IA ---
app.post("/submit-selection", async (req, res) => {
    const { token, cartas } = req.body;
    const session = sessions.get(token);

    if (!session) {
        return res.status(403).json({ ok: false, error: "Sesión expirada o no válida" });
    }

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: "Eres una experta tarotista mística y empática. Realiza una interpretación profunda y sanadora basada en las cartas elegidas. Usa un lenguaje poético pero claro." 
                },
                { 
                    role: "user", 
                    content: `He elegido estas cartas: ${cartas.join(", ")}. Por favor, genera mi lectura personalizada.` 
                }
            ],
        });

        const lecturaGenerada = completion.choices[0].message.content;

        // Aquí podrías añadir el código para enviar el email automáticamente
        console.log(`Lectura generada con éxito para ${session.email}`);

        res.json({ 
            ok: true, 
            lectura: lecturaGenerada,
            email: session.email 
        });

    } catch (error) {
        console.error("Error con OpenAI:", error);
        res.status(500).json({ ok: false, error: "No se pudo generar la lectura" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
