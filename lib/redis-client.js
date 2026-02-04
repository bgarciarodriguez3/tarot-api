import { createClient } from "redis";

let client;
let connecting;

/**
 * Devuelve un cliente Redis conectado (singleton)
 * Usa la variable de entorno REDIS_URL
 */
export async function getRedis() {
  if (!process.env.REDIS_URL) {
    console.warn("REDIS_URL no configurada");
    return null;
  }

  if (!client) {
    client = createClient({
      url: process.env.REDIS_URL,
    });

    client.on("error", (err) => {
      console.error("Redis error:", err);
    });
  }

  if (!connecting) {
    connecting = client.connect().catch((err) => {
      console.error("Redis connect failed:", err);
      return null;
    });
  }

  await connecting;
  return client;
}
