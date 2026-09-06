// Minimal auth built entirely on Node's built-in `crypto` module — no
// `jsonwebtoken` or `bcrypt` dependency. This is deliberately simple and
// meant for a model/demo project. For a real deployment, swap this for a
// vetted library (jsonwebtoken + bcrypt/argon2) and a real user store.

const crypto = require("crypto");

// Regenerated every time the server restarts, which means all existing
// tokens are invalidated on restart. Set AUTH_SECRET in the environment
// for a stable secret across restarts.
const SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString("hex");

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(input) {
  input = input.replace(/-/g, "+").replace(/_/g, "/");
  while (input.length % 4) input += "=";
  return Buffer.from(input, "base64").toString("utf8");
}

function sign(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const headerPart = base64url(JSON.stringify(header));
  const payloadPart = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", SECRET).update(`${headerPart}.${payloadPart}`).digest();
  const signaturePart = base64url(signature);
  return `${headerPart}.${payloadPart}.${signaturePart}`;
}

function verify(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;
  const expected = base64url(
    crypto.createHmac("sha256", SECRET).update(`${headerPart}.${payloadPart}`).digest()
  );
  const a = Buffer.from(signaturePart);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(base64urlDecode(payloadPart));
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

function issueToken({ username, role }) {
  const now = Date.now();
  return sign({ sub: username, role, iat: now, exp: now + TOKEN_TTL_MS });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const attempt = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(attempt, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getBearerToken(req) {
  const header = req.headers["authorization"] || "";
  const match = header.match(/^Bearer (.+)$/i);
  return match ? match[1] : null;
}

module.exports = { issueToken, verify, hashPassword, verifyPassword, getBearerToken };
