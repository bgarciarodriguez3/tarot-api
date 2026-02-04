import { createClient } from "redis";

let client;
let connecting;

export async function getRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!client) {
    client = createClient({ url });
    client.on("error", (err) => console.error("Redis error:", err));
  }

  if (!connecting) {
    connecting = client.connect().catch((e) => {
      console.error("Redis connect failed:", e);
      return null;
    });
  }

  await connecting;
  return client;
}
