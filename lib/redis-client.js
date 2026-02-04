// lib/redis-client.js  (CommonJS)

const { createClient } = require("redis");

let client = null;
let connecting = null;

async function getRedis() {
  const url = process.env.REDIS_URL;

  // Si no hay Redis configurado, no rompemos la API:
  if (!url) return null;

  if (!client) {
    client = createClient({ url });

    client.on("error", (err) => {
      console.error("Redis error:", err);
    });
  }

  // Evitar conectar muchas veces en paralelo
  if (!connecting) {
    connecting = client.connect().catch((e) => {
      console.error("Redis connect failed:", e);
      connecting = null;
      client = null;
      return null;
    });
  }

  await connecting;

  // Si falló la conexión:
  if (!client) return null;

  return client;
}

module.exports = { getRedis };
