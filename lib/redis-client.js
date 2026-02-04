// lib/redis-client.js
const { createClient } = require("redis");

let _client = null;

function assertEnv() {
  // Vercel suele usar REDIS_URL o KV_URL según proveedor.
  // Usa el que tengas configurado. Prioridad: REDIS_URL -> KV_URL.
  const url = process.env.REDIS_URL || process.env.KV_URL;
  if (!url) {
    throw new Error("Missing REDIS_URL (or KV_URL) env var");
  }
  return url;
}

async function connectOnce(client) {
  if (client.isOpen) return;
  await client.connect();
}

function getRedis() {
  if (_client) return _client;

  const url = assertEnv();

  _client = createClient({
    url,
  });

  _client.on("error", (err) => {
    console.error("Redis Client Error", err);
  });

  // ⚠️ IMPORTANTE:
  // NO hacemos await aquí (porque este archivo se importa en runtime serverless).
  // Conectamos "lazy" antes de cada uso desde el código que llame.
  return _client;
}

// Helpers seguros para serverless
async function redisIncr(key) {
  const c = getRedis();
  await connectOnce(c);
  return await c.incr(key);
}

async function redisExpire(key, seconds) {
  const c = getRedis();
  await connectOnce(c);
  return await c.expire(key, seconds);
}

async function redisGet(key) {
  const c = getRedis();
  await connectOnce(c);
  return await c.get(key);
}

async function redisSet(key, value, opts) {
  const c = getRedis();
  await connectOnce(c);
  if (opts?.EX) {
    return await c.set(key, value, { EX: opts.EX });
  }
  return await c.set(key, value);
}

module.exports = {
  getRedis,
  redisIncr,
  redisExpire,
  redisGet,
  redisSet,
};
