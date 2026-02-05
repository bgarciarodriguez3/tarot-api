// /api/reading/result.js

import crypto from "crypto";
import fetch from "node-fetch";

// ⚠️ Ajusta esto si quieres limitar solo a tu dominio
const ALLOWED_ORIGIN = process.env.SHOPIFY_ORIGIN || "*";

export default async function handler(req, res) {
  // -------------------------
  // CORS (NECESARIO PARA SHOPIFY)
  // -------------------------
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Solo POST
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  try {
    const {
      product,        // "angeles"
      order_id,       // Shopify order id o TEST_ORDER
      line_item_id,   // Shopify line item id o TEST_LINE
      selected_cards, // array de IDs de cartas
    } = req.body;

    // -------------------------
    // VALIDACIONES BÁSICAS
    // -------------------------
    if (
      !product ||
      !order_id ||
      !line_item_id ||
      !Array.isArray(selected_cards) ||
      selected_cards.length !== 4
    ) {
      return res.status(400).json({
        ok: false,
        error: "Datos incompletos o inválidos",
      });
    }

    // -------------------------
    // CARGAR BARAJA (ÁNGELES 12)
    // -------------------------
    const deckRes = await fetch(
      `https://tarot-api-vercel.vercel.app/api/products/angeles_12/spread`
    );

    if (!deckRes.ok) {
      throw new Error("No se pudo cargar la baraja");
    }

    const deckData = await deckRes.json();

    if (!deckData.cards || !Array.isArray(deckData.cards)) {
      throw new Error("Formato de baraja inválido");
    }

    // -------------------------
    // SELECCIONAR CARTAS
    // -------------------------
    const cards = selected_cards.map((cardId) => {
      const baseCard = deckData.cards.find(
        (c) => c.id === cardId
      );

      if (!baseCard) {
        throw new Error(`Carta no encontrada: ${cardId}`);
      }

      // 20% probabilidad de invertida
      const reversed = Math.random() < 0.2;

      return {
        id: baseCard.id,
        name: baseCard.name,
        meaning: reversed && baseCard.reversed_meaning
          ? baseCard.reversed_meaning
          : baseCard.meaning,
        reversed,
      };
    });

    // -------------------------
    // MENSAJE FINAL (IA SIMPLE / PLACEHOLDER)
    // Luego aquí puedes meter OpenAI
    // -------------------------
    const final_message =
      "Los ángeles te recuerdan que confíes en el proceso. Cada carta aparece para guiarte con amor, claridad y propósito. Nada es casual.";

    // -------------------------
    // RESPUESTA FINAL
    // -------------------------
    return res.status(200).json({
      ok: true,
      order_id,
      line_item_id,
      product,
      cards,
      final_message,
    });
  } catch (err) {
    console.error("❌ Error reading/result:", err);

    return res.status(500).json({
      ok: false,
      error: err.message || "Error interno",
    });
  }
}
