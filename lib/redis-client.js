// lib/redis-client.js (ESM)
import Redis from "ioredis";

let redis = null;

export function getRedis() {
  if (redis) return redis;

  const url = (process.env.REDIS_URL || "").trim();
  if (!url) throw new Error("Missing REDIS_URL");

  redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });

  redis.on("error", (err) => {
    console.error("Redis error:", err?.message || err);
  });

  return redis;
}
