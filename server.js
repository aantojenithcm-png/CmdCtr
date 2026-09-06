// Zero-dependency Node.js backend for the Unified Response prototype.
// Serves the static front-end from /public and a small JSON REST API,
// plus a Server-Sent Events stream so every open dashboard updates live
// when any other client triggers or resolves an incident.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const auth = require("./lib/auth");
const store = require("./lib/store");
const { DEPARTMENTS, EMERGENCY_TYPES, publicIncidentView } = require("./lib/data");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

// ---------- SSE subscriber registry ----------
const sseClients = new Set();

function broadcastChange() {
  const payload = `event: changed\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`;
  for (const res of sseClients) {
    res.write(payload);
  }
}

// ---------- Simple in-memory rate limit for the public citizen report endpoint ----------
const lastReportByIp = new Map();
const REPORT_COOLDOWN_MS = 10_000;

// ---------- Helpers ----------
function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(data);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 1e6) req.destroy(); // 1MB guard
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function requireAuth(req, res) {
  const token = auth.getBearerToken(req);
  const payload = auth.verify(token);
  if (!payload) {
    sendJson(res, 401, { error: "Unauthorized. Log in and include the token as: Authorization: Bearer <token>" });
    return null;
  }
  return payload; // { sub, role, iat, exp }
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === "/" ? "/index.html" : pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, "");
  const fullPath = path.join(PUBLIC_DIR, filePath);
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

// ---------- Route handlers ----------
async function handleApi(req, res, pathname) {
  const method = req.method;

  // Public: department directory (names/icons only, not internal feature lists)
  if (method === "GET" && pathname === "/api/departments") {
    return sendJson(res, 200, DEPARTMENTS.map(({ id, name, icon }) => ({ id, name, icon })));
  }

  // Auth required: a department's own full feature list (self or command only)
  const fullMatch = pathname.match(/^\/api\/departments\/([a-z]+)\/full$/);
  if (method === "GET" && fullMatch) {
    const user = requireAuth(req, res);
    if (!user) return;
    const deptId = fullMatch[1];
    if (user.role !== "command" && user.role !== deptId) {
      return sendJson(res, 403, { error: "Forbidden: you can only view your own department's full access." });
    }
    const dept = DEPARTMENTS.find(d => d.id === deptId);
    if (!dept) return sendJson(res, 404, { error: "Unknown department" });
    return sendJson(res, 200, dept);
  }

  // Public: routing rulebook (policy metadata, not sensitive)
  if (method === "GET" && pathname === "/api/emergency-types") {
    return sendJson(res, 200, EMERGENCY_TYPES);
  }

  // Public: citizen-safe filtered incident view
  if (method === "GET" && pathname === "/api/incidents/active/public") {
    return sendJson(res, 200, publicIncidentView(store.getActiveIncident()));
  }

  // Auth required: full incident detail (command + any department)
  if (method === "GET" && pathname === "/api/incidents/active") {
    const user = requireAuth(req, res);
    if (!user) return;
    return sendJson(res, 200, store.getActiveIncident());
  }

  // Auth required: event log (command + any department)
  if (method === "GET" && pathname === "/api/log") {
    const user = requireAuth(req, res);
    if (!user) return;
    return sendJson(res, 200, store.getLog());
  }

  // Login
  if (method === "POST" && pathname === "/api/auth/login") {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body" });
    }
    const { username, password } = body;
    const user = store.getUser(username);
    if (!user || !auth.verifyPassword(password || "", user.salt, user.hash)) {
      return sendJson(res, 401, { error: "Invalid username or password" });
    }
    const token = auth.issueToken({ username: user.username, role: user.role });
    return sendJson(res, 200, { token, role: user.role });
  }

  // Command triggers a classified emergency (any type)
  if (method === "POST" && pathname === "/api/incidents/trigger") {
    const user = requireAuth(req, res);
    if (!user) return;
    if (user.role !== "command") {
      return sendJson(res, 403, { error: "Forbidden: only the command centre can classify and trigger events." });
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body" });
    }
    const type = EMERGENCY_TYPES.find(t => t.id === body.typeId);
    if (!type) return sendJson(res, 400, { error: "Unknown emergency type" });
    const incident = createIncident(type, "command");
    return sendJson(res, 200, incident);
  }

  // Citizen SOS — always classified as "medical", no auth, rate-limited per IP
  if (method === "POST" && pathname === "/api/incidents/report") {
    const ip = req.socket.remoteAddress || "unknown";
    const last = lastReportByIp.get(ip) || 0;
    if (Date.now() - last < REPORT_COOLDOWN_MS) {
      return sendJson(res, 429, { error: "Please wait before reporting again." });
    }
    lastReportByIp.set(ip, Date.now());
    const type = EMERGENCY_TYPES.find(t => t.id === "medical");
    const incident = createIncident(type, "citizen");
    return sendJson(res, 200, publicIncidentView(incident));
  }

  // Command resolves the active incident
  if (method === "POST" && pathname === "/api/incidents/resolve") {
    const user = requireAuth(req, res);
    if (!user) return;
    if (user.role !== "command") {
      return sendJson(res, 403, { error: "Forbidden: only the command centre can resolve incidents." });
    }
    store.resolveActiveIncident();
    store.addLog({ id: `resolve-${Date.now()}`, text: "Incident marked resolved", time: new Date().toLocaleTimeString() });
    broadcastChange();
    return sendJson(res, 200, { ok: true });
  }

  // Live update stream
  if (method === "GET" && pathname === "/api/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write("retry: 2000\n\n");
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function createIncident(type, createdBy) {
  const s = store.load();
  const id = `INC-${1000 + s.incidents.length}`;
  const time = new Date().toLocaleTimeString();
  const incident = {
    id, typeId: type.id, label: type.label, severity: type.severity,
    routes: type.routes, time, status: "active", createdBy,
  };
  store.addIncident(incident);
  store.addLog({
    id: `${id}-log`,
    text: `${type.label} classified — routed to ${type.routes.length} departments${createdBy === "citizen" ? " (citizen-reported)" : ""}`,
    time,
  });
  broadcastChange();
  return incident;
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  if (pathname.startsWith("/api/")) {
    try {
      await handleApi(req, res, pathname);
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: "Internal server error" });
    }
    return;
  }

  serveStatic(req, res, pathname);
});

store.load(); // ensure demo accounts are seeded before first request
server.listen(PORT, () => {
  console.log(`Unified Response server running at http://localhost:${PORT}`);
});
