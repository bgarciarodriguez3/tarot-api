export default async function handler(req, res) {
  const CRON_SECRET = process.env.CRON_SECRET;
  const RAILWAY_CRON_URL = process.env.RAILWAY_CRON_URL;

  if (!CRON_SECRET || !RAILWAY_CRON_URL) {
    return res.status(500).json({
      ok: false,
      error: "Missing env vars"
    });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const url = `${RAILWAY_CRON_URL}?secret=${encodeURIComponent(CRON_SECRET)}`;

    const r = await fetch(url, { method: "POST" });
    const data = await r.json().catch(() => ({}));

    return res.status(r.ok ? 200 : 500).json({
      ok: r.ok,
      railway: data
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: String(e?.message || e)
    });
  }
}
