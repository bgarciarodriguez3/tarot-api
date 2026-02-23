// server.js (ESM) ✅ para "type":"module"

import express from "express";
import cors from "cors";
import crypto from "crypto";
import Redis from "ioredis";
import fs from "fs/promises";
import path from "path";
import { getWeeklyLongMeaningForCard } from "./lib/weekly-reading.js";

const app = express();
app.use(cors());

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

/* =====================================================
   REDIS SEGURO (Upstash TLS + username/password explícitos)
===================================================== */
function buildRedis() {
  const raw = (process.env.REDIS_URL || "").trim();
  if (!raw) throw new Error("Missing REDIS_URL");

  const cleaned = raw.replace(/^"+|"+$/g, "").replace(/^'+|'+$/g, "");
  const u = new URL(cleaned);

  const host = u.hostname;
  const port = Number(u.port || 6379);
  const username = decodeURIComponent(u.username || "default");
  const password = decodeURIComponent(u.password || "");

  const redis = new Redis({
    host,
    port,
    username,
    password,
    tls: { servername: host },
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  redis.on("connect", () => console.log("✅ Redis connect"));
  redis.on("ready", () => console.log("✅ Redis ready"));
  redis.on("error", (err) =>
    console.error("❌ Redis error:", err?.message || err)
  );

  return redis;
}

const redis = buildRedis();

/* =====================================================
   DEBUG ENDPOINTS (TEMPORALES)
===================================================== */
app.get("/debug/redis-url", (req, res) => {
  const raw = process.env.REDIS_URL || "";
  res.json({
    exists: !!raw,
    startsWith: raw.slice(0, 25),
    endsWith: raw.slice(-25),
    length: raw.length,
  });
});

app.get("/debug/redis-parse", (req, res) => {
  try {
    const u = new URL(process.env.REDIS_URL);
    res.json({
      protocol: u.protocol,
      username: u.username,
      host: u.hostname,
      port: u.port,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/health/redis", async (req, res) => {
  try {
    const pong = await redis.ping();
    res.json({ ok: true, pong });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* =====================================================
   ENV
===================================================== */
const SHOPIFY_WEBHOOK_SECRET = (process.env.SHOPIFY_WEBHOOK_SECRET || "").trim();
const ADMIN_SECRET = (process.env.ADMIN_SECRET || "").trim();
const CRON_SECRET = (process.env.CRON_SECRET || "").trim();
const SHOPIFY_STORE_DOMAIN = (process.env.SHOPIFY_STORE_DOMAIN || "").trim();
const SHOPIFY_ADMIN_TOKEN = (process.env.SHOPIFY_ADMIN_TOKEN || "").trim();
const SHOPIFY_API_VERSION = (process.env.SHOPIFY_API_VERSION || "2024-07").trim();

/* =====================================================
   RUTA BASE
===================================================== */
app.get("/", (req, res) =>
  res.send("API de Tarot en funcionamiento ✅")
);

/* =====================================================
   RESTO DE TU CÓDIGO (sin cambios funcionales)
===================================================== */

// --- Aquí va TODO tu código original tal cual ---
// (helpers, loadDeck, Shopify, cron, admin, etc.)
// No hace falta tocar nada más.

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log("🚀 Server running on port", PORT)
);
