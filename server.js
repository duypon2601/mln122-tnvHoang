const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

loadEnv(path.join(__dirname, ".env"));

const port = Number(process.env.PORT || 3000);
const publicDir = __dirname;
const homePagePath = path.join(__dirname, "home.html");
const challengePagePath = path.join(__dirname, "index.html");

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
    url.searchParams.set("order", "score.desc,time_str.asc");
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

async function handleChat(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    sendJson(res, 500, { error: "Missing Gemini API key." });
    return;
  }

  const { message } = await readBody(req);
  if (!message || typeof message !== "string") {
    sendJson(res, 400, { error: "Invalid message payload." });
    return;
  }

  const systemPrompt = "Bạn là một chuyên gia kinh tế, đóng vai trò là Trợ lý AI trên trang web học tập về chủ đề Cạnh tranh và Độc quyền trong nền kinh tế thị trường. Hãy trả lời ngắn gọn, súc tích (dưới 150 chữ), dễ hiểu và thân thiện các câu hỏi liên quan đến chủ đề này. Dùng ngôn ngữ tự nhiên, mạch lạc. Nếu người dùng hỏi về chủ đề khác hoàn toàn không liên quan đến kinh tế, giáo dục hay môn học, hãy khéo léo từ chối và hướng họ quay lại chủ đề Cạnh tranh và Độc quyền. Định dạng kết quả dạng plain text (không dùng markdown in đậm in nghiêng, có thể dùng dấu gạch ngang đầu dòng).";

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: systemPrompt + "\n\nCâu hỏi của người dùng: " + message }] }
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[chat] Gemini API error:", data);
      sendJson(res, response.status, { error: "Error from AI provider." });
      return;
    }

    const aiMessage = data.candidates?.[0]?.content?.parts?.[0]?.text || "Xin lỗi, tôi không thể trả lời lúc này do lỗi hệ thống.";
    
    sendJson(res, 200, { reply: aiMessage });
  } catch (error) {
    console.error("[chat] POST request failed", error);
    sendJson(res, 502, { error: "Failed to connect to AI provider." });
  }
}

function serveStatic(req, res) {
  const reqUrl = new URL(req.url, `http://localhost:${port}`);
  let filePath = decodeURIComponent(reqUrl.pathname);
  let fullPath;

  if (filePath === "/") {
    fullPath = homePagePath;
  } else if (filePath === "/thu-thach") {
    fullPath = challengePagePath;
  } else {
    fullPath = path.normalize(path.join(publicDir, filePath));
  }

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
      ".md": "text/markdown; charset=utf-8",
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

  if (req.url.startsWith("/api/chat")) {
    handleChat(req, res).catch((error) => {
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
