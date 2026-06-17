export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: "Missing Supabase environment variables." });
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  if (req.method === "GET") {
    const url = new URL("/rest/v1/leaderboard", supabaseUrl);
    url.searchParams.set("select", "id,name,time_str,score,errors,created_at");
    url.searchParams.set("order", "score.asc");
    url.searchParams.set("limit", "20");

    const response = await fetch(url, { headers });
    const data = await response.json();

    return res.status(response.status).json(data);
  }

  if (req.method === "POST") {
    const { name, time_str, score, errors } = req.body || {};

    const cleanName = typeof name === "string" ? name.trim().slice(0, 50) : "";
    const cleanTime = typeof time_str === "string" ? time_str.trim().slice(0, 20) : "";

    if (
      typeof name !== "string" ||
      typeof time_str !== "string" ||
      !Number.isInteger(score) ||
      !Number.isInteger(errors) ||
      score < 0 ||
      errors < 0 ||
      !cleanName ||
      !cleanTime
    ) {
      return res.status(400).json({ error: "Invalid leaderboard payload." });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response;

    try {
      response = await fetch(new URL("/rest/v1/leaderboard", supabaseUrl), {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=minimal",
        },
        signal: controller.signal,
        body: JSON.stringify({
          name: cleanName,
          time_str: cleanTime,
          score,
          errors,
        }),
      });
    } catch (error) {
      return res.status(502).json({ error: "Supabase request failed." });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: await response.text() });
    }

    return res.status(201).json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "POST", "OPTIONS"]);
  return res.status(405).json({ error: "Method not allowed." });
}
