const { createClient } = require("redis");

let client;
let connectingPromise;

async function getRedis() {
  if (client && client.isOpen) return client;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("Missing REDIS_URL env var");
  }

  if (!client) {
    client = createClient({ url });

    client.on("error", (err) => {
      console.error("Redis Client Error:", err);
    });
  }

  if (!client.isOpen) {
    if (!connectingPromise) {
      connectingPromise = client.connect().finally(() => {
        connectingPromise = null;
      });
    }
    await connectingPromise;
  }

  return client;
}

module.exports = { getRedis };
