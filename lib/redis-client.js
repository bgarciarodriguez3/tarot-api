// lib/redis-client.js
const { createClient } = require("redis");

let client;
let connecting;

function getRedisUrl() {
  // Upstash via Vercel suele dar REDIS_URL o KV_URL
  return process.env.REDIS_URL || process.env.KV_URL;
}

async function getRedis() {
  const url = getRedisUrl();
  if (!url) throw new Error("Missing REDIS_URL (or KV_URL) env var");

  if (client) return client;

  if (!connecting) {
    client = createClient({ url });

    client.on("error", (err) => {
      console.error("Redis Client Error", err);
    });

    connecting = client.connect().catch((e) => {
      // si falla, resetea para reintentar en la siguiente llamada
      client = undefined;
      connecting = undefined;
      throw e;
    });
  }

  await connecting;
  return client;
}

module.exports = { getRedis };
