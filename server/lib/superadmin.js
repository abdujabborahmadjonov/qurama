"use strict";
/* The super-admin: one account, signed in with a username and password,
   that can manage the photo gallery and also use the moderation queue.

   The password is compared against QURAMA_SUPERADMIN_PASSWORD. If that is not
   set, the default below applies — change it in the host's environment
   settings as soon as the site is live, because this repository is public.

   A successful sign-in returns a signed token (HMAC-SHA256, 12 hours) that the
   browser sends as `Authorization: Bearer sa.<payload>.<signature>`. */

const crypto = require("crypto");

const DEFAULT_PASSWORD = "charoscharos";
const TTL_MS = 12 * 60 * 60 * 1000;

function username() {
  return (process.env.QURAMA_SUPERADMIN_USER || "superadmin").trim().toLowerCase();
}
function password() {
  return process.env.QURAMA_SUPERADMIN_PASSWORD || DEFAULT_PASSWORD;
}
function usingDefault() {
  return !process.env.QURAMA_SUPERADMIN_PASSWORD;
}

let ephemeral = null;
function secret() {
  const s = process.env.QURAMA_SESSION_SECRET ||
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (s) return "qurama-sa:" + s;
  // No configured secret: tokens survive only as long as this process.
  if (!ephemeral) ephemeral = crypto.randomBytes(32).toString("hex");
  return ephemeral;
}

function sameText(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function sign(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function issue() {
  const payload = Buffer.from(JSON.stringify({ u: username(), exp: Date.now() + TTL_MS })).toString("base64url");
  return "sa." + payload + "." + sign(payload);
}

function verify(token) {
  if (!token || token.indexOf("sa.") !== 0) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  if (!sameText(sign(parts[1]), parts[2])) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!data.exp || data.exp < Date.now()) return null;
    return { email: data.u, super: true };
  } catch (_) {
    return null;
  }
}

/* A failed sign-in costs the address one of ten tries per 15 minutes. */
const attempts = new Map();
function locked(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter(function (t) { return now - t < 15 * 60 * 1000; });
  attempts.set(ip, list);
  if (attempts.size > 5000) attempts.clear();
  return list.length >= 10;
}
function fail(ip) {
  const list = attempts.get(ip) || [];
  list.push(Date.now());
  attempts.set(ip, list);
}

function login(user, pass, ip) {
  if (locked(ip)) return { ok: false, error: "too_many" };
  const okUser = sameText(String(user || "").trim().toLowerCase(), username());
  const okPass = sameText(String(pass || ""), password());
  if (!okUser || !okPass) { fail(ip); return { ok: false, error: "bad_credentials" }; }
  attempts.delete(ip);
  return { ok: true, token: issue(), user: username() };
}

function bearer(req) {
  const header = req.get ? req.get("authorization") : req.headers.authorization;
  if (!header || !/^Bearer /i.test(header)) return null;
  return header.slice(7).trim() || null;
}

function identify(req) { return verify(bearer(req)); }

function requireSuper(req, res, next) {
  const user = identify(req);
  if (!user) return res.status(401).json({ ok: false, error: "not_signed_in" });
  req.user = user;
  next();
}

module.exports = { login, verify, identify, requireSuper, usingDefault, username };
