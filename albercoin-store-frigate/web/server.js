const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || process.env.APP_PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || "/data";
const SETTINGS_FILE = path.join(DATA_DIR, "frigate-settings.env");
const LOG_FILE = path.join(DATA_DIR, "frigate.log");

const fields = {
  FRIGATE_COMPUTE_BACKEND: { type: "enum", values: ["AUTO", "CPU", "GPU"], default: "CPU" },
  FRIGATE_BATCH_SIZE: { type: "int", min: 10000, max: 1000000, default: "300000" },
  FRIGATE_DB_THREADS: { type: "int", min: 1, max: 64, default: "4" },
  FRIGATE_MEMORY_LIMIT: { type: "size", default: "8GB" },
  FRIGATE_CACHE_SIZE: { type: "size", default: "10M" },
  FRIGATE_RPC_TIMEOUT: { type: "int", min: 5, max: 600, default: "60" },
  FRIGATE_RPC_BATCH_SIZE: { type: "int", min: 1, max: 1000, default: "100" },
  FRIGATE_MAX_LABELS: { type: "int", min: 1, max: 1000, default: "10" },
  FRIGATE_MAX_SUBSCRIPTIONS: { type: "int", min: 1, max: 10000, default: "100" },
  FRIGATE_START_HEIGHT: { type: "optionalInt", min: 0, max: 10000000, default: "" },
};

function defaults() {
  return Object.fromEntries(Object.entries(fields).map(([key, meta]) => [key, meta.default]));
}

function parseEnv(content) {
  const settings = defaults();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && fields[match[1]]) settings[match[1]] = match[2];
  }
  return settings;
}

function readSettings() {
  try {
    return parseEnv(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return defaults();
  }
}

function validate(settings) {
  const clean = {};
  for (const [key, meta] of Object.entries(fields)) {
    const raw = String(settings[key] ?? meta.default).trim();
    if (meta.type === "enum") {
      if (!meta.values.includes(raw)) throw new Error(`${key} must be ${meta.values.join(", ")}`);
      clean[key] = raw;
    } else if (meta.type === "int" || meta.type === "optionalInt") {
      if (meta.type === "optionalInt" && raw === "") {
        clean[key] = "";
        continue;
      }
      if (!/^\d+$/.test(raw)) throw new Error(`${key} must be a whole number`);
      const value = Number(raw);
      if (value < meta.min || value > meta.max) throw new Error(`${key} is outside the allowed range`);
      clean[key] = String(value);
    } else if (meta.type === "size") {
      if (!/^\d+(K|M|G|KB|MB|GB)$/i.test(raw)) throw new Error(`${key} must look like 512MB, 8GB or 10M`);
      clean[key] = raw.toUpperCase();
    }
  }
  return clean;
}

function writeSettings(settings) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const clean = validate(settings);
  const content = Object.keys(fields).map((key) => `${key}=${clean[key]}`).join("\n") + "\n";
  fs.writeFileSync(SETTINGS_FILE, content, { mode: 0o644 });
  return clean;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function serveStatic(res, file, type) {
  fs.readFile(path.join(__dirname, file), (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/") return serveStatic(res, "index.html", "text/html; charset=utf-8");
    if (req.method === "GET" && url.pathname === "/styles.css") return serveStatic(res, "styles.css", "text/css; charset=utf-8");
    if (req.method === "GET" && url.pathname === "/app.js") return serveStatic(res, "app.js", "application/javascript; charset=utf-8");
    if (req.method === "GET" && url.pathname === "/icon.png") {
      fs.createReadStream("/usr/share/nginx/html/icon.png").on("error", () => res.writeHead(404).end()).pipe(res);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/settings") {
      return sendJson(res, 200, {
        settings: readSettings(),
        version: process.env.FRIGATE_VERSION || "",
        torAddress: process.env.FRIGATE_TOR_ADDRESS || "",
      });
    }
    if (req.method === "POST" && url.pathname === "/api/settings") {
      const body = JSON.parse(await collectBody(req) || "{}");
      return sendJson(res, 200, { settings: writeSettings(body), restartRequired: true });
    }
    if (req.method === "GET" && url.pathname === "/api/log") {
      let log = "";
      try {
        log = fs.readFileSync(LOG_FILE, "utf8").slice(-60000);
      } catch {}
      return sendJson(res, 200, { log });
    }
    res.writeHead(404);
    res.end("Not found");
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
});

server.listen(PORT, "0.0.0.0");
