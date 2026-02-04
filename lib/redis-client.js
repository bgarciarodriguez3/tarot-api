const Redis = require("ioredis");

let redis = null;

function getRedis() {
  if (redis) return redis;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("Missing REDIS_URL env var");
  }

  redis = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });

  return redis;
}

module.exports = { getRedis };
