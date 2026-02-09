const Airtable = require("airtable");

/**
 * Configuración de Airtable
 * Necesita estas variables de entorno:
 *
 * AIRTABLE_API_KEY
 * AIRTABLE_BASE_ID
 * AIRTABLE_TABLE_NAME
 */

let base = null;

function getBase() {
  if (base) return base;

  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
    console.warn("Airtable no configurado (faltan variables de entorno)");
    return null;
  }

  Airtable.configure({
    apiKey: process.env.AIRTABLE_API_KEY,
  });

  base = Airtable.base(process.env.AIRTABLE_BASE_ID);
  return base;
}

/**
 * Guarda una tirada en Airtable
 */
async function saveReading({
  productId,
  spread,
  cards,
  clientEmail = null,
  invertedCard = null,
}) {
  const baseInstance = getBase();
  if (!baseInstance) return null;

  const tableName = process.env.AIRTABLE_TABLE_NAME || "Lecturas";

  try {
    await baseInstance(tableName).create([
      {
        fields: {
          product_id: productId,
          spread: spread,
          cards: JSON.stringify(cards),
          inverted_card: invertedCard || "",
          email: clientEmail || "",
          created_at: new Date().toISOString(),
        },
      },
    ]);

    return true;
  } catch (error) {
    console.error("Error guardando lectura en Airtable:", error);
    return null;
  }
}

module.exports = {
  saveReading,
};
