// Simple JSON-file persistence. Good enough for a model project's demo
// data volume; swap for a real database (Postgres/SQLite) for production.

const fs = require("fs");
const path = require("path");
const { hashPassword } = require("./auth");
const { DEPARTMENTS } = require("./data");

const STORE_PATH = path.join(__dirname, "..", "data", "store.json");
const DEMO_PASSWORD = "password123";

function seed() {
  const users = [{ username: "command", role: "command", ...hashPassword(DEMO_PASSWORD) }];
  for (const dept of DEPARTMENTS) {
    users.push({ username: dept.id, role: dept.id, ...hashPassword(DEMO_PASSWORD) });
  }
  return { users, incidents: [], log: [] };
}

let state = null;

function load() {
  if (state) return state;
  if (fs.existsSync(STORE_PATH)) {
    try {
      state = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
      return state;
    } catch {
      // fall through to reseed on corrupt file
    }
  }
  state = seed();
  save();
  console.log(`Seeded demo accounts (username = role id, password = "${DEMO_PASSWORD}") in ${STORE_PATH}`);
  return state;
}

function save() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2));
}

function getUser(username) {
  return load().users.find(u => u.username === username) || null;
}

function getActiveIncident() {
  return load().incidents.find(i => i.status === "active") || null;
}

function addIncident(incident) {
  const s = load();
  s.incidents = s.incidents.map(i => (i.status === "active" ? { ...i, status: "resolved" } : i));
  s.incidents.unshift(incident);
  save();
}

function resolveActiveIncident() {
  const s = load();
  s.incidents = s.incidents.map(i => (i.status === "active" ? { ...i, status: "resolved" } : i));
  save();
}

function addLog(entry) {
  const s = load();
  s.log.unshift(entry);
  save();
}

function getLog() {
  return load().log;
}

module.exports = { load, save, getUser, getActiveIncident, addIncident, resolveActiveIncident, addLog, getLog };
