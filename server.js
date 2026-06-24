const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

loadEnv(path.join(__dirname, ".env"));

const port = Number(process.env.PORT || 3000);
const publicDir = __dirname;

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

async function handleLeaderboard(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    sendJson(res, 500, { error: "Missing Supabase environment variables." });
    return;
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  if (req.method === "GET") {
    console.log("[leaderboard] GET");
    const url = new URL("/rest/v1/leaderboard", supabaseUrl);
    url.searchParams.set("select", "id,name,time_str,score,errors,created_at");
    url.searchParams.set("order", "score.asc");
    url.searchParams.set("limit", "20");

    const response = await fetch(url, { headers });
    const data = await response.json();
    console.log(`[leaderboard] GET -> ${response.status}`);
    sendJson(res, response.status, data);
    return;
  }

  if (req.method === "POST") {
    console.log("[leaderboard] POST");
    const { name, time_str, score, errors } = await readBody(req);
    const cleanName = typeof name === "string" ? name.trim().slice(0, 50) : "";
    const cleanTime = typeof time_str === "string" ? time_str.trim().slice(0, 20) : "";
    console.log("[leaderboard] payload", {
      hasName: Boolean(cleanName),
      time_str,
      score,
      scoreType: typeof score,
      errors,
      errorsType: typeof errors,
    });

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
      console.error("[leaderboard] POST -> 400 Invalid payload");
      sendJson(res, 400, { error: "Invalid leaderboard payload." });
      return;
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
      console.error("[leaderboard] POST Supabase request failed", error);
      sendJson(res, 502, { error: "Supabase request failed." });
      return;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[leaderboard] POST -> ${response.status}`, errorText);
      sendJson(res, response.status, { error: errorText });
      return;
    }

    console.log(`[leaderboard] POST -> ${response.status}`);
    sendJson(res, 201, { ok: true });
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
}

function serveStatic(req, res) {
  const reqUrl = new URL(req.url, `http://localhost:${port}`);
  let filePath = decodeURIComponent(reqUrl.pathname);
  if (filePath === "/") filePath = "/home.html";

  const fullPath = path.normalize(path.join(publicDir, filePath));
  if (!fullPath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(fullPath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const type = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
    }[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/leaderboard")) {
    handleLeaderboard(req, res).catch((error) => {
      console.error(error);
      sendJson(res, 500, { error: "Internal server error." });
    });
    return;
  }

  serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`Local server running at http://localhost:${port}`);
});
