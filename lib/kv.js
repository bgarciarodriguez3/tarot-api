// lib/kv.js
// KV REST API compatible con Vercel KV / Upstash (se usa con KV_REST_API_URL y KV_REST_API_TOKEN)

const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

function assertKV() {
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    throw new Error("Missing KV_REST_API_URL or KV_REST_API_TOKEN in env");
  }
}

async function kvFetch(path) {
  assertKV();
  const res = await fetch(`${KV_REST_API_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${KV_REST_API_TOKEN}`,
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`KV request failed: ${res.status} ${txt}`);
  }
  return res.json();
}

export async function kvGetJson(key) {
  const data = await kvFetch(`/get/${encodeURIComponent(key)}`);
  // data.result será string o null
  if (!data || data.result == null) return null;
  try {
    return JSON.parse(data.result);
  } catch {
    return null;
  }
}

export async function kvSetJson(key, value) {
  assertKV();
  const payload = JSON.stringify(value);

  // Usamos SET con POST porque el valor puede ser largo
  const res = await fetch(`${KV_REST_API_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value: payload }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`KV set failed: ${res.status} ${txt}`);
  }
  return res.json();
}
