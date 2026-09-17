"use strict";
/* Single-moderator auth: a scrypt-hashed password on disk, plus an in-memory
   session table. Sessions die with the process, which is the right trade for
   one admin — a restart simply means logging in again. */

const crypto = require("crypto");
const fs = require("fs");
const { ADMIN } = require("./paths");

const SESSION_MS = 12 * 60 * 60 * 1000;
const COOKIE = "qurama_session";
const sessions = new Map();

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, s, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return { salt: s, hash: hash };
}

function savePassword(password) {
  const rec = hashPassword(password);
  fs.writeFileSync(ADMIN, JSON.stringify(rec, null, 2), { mode: 0o600 });
}

function isConfigured() {
  return fs.existsSync(ADMIN);
}

function verify(password) {
  if (!isConfigured()) return false;
  let rec;
  try { rec = JSON.parse(fs.readFileSync(ADMIN, "utf8")); } catch (_) { return false; }
  const candidate = hashPassword(password, rec.salt);
  const a = Buffer.from(candidate.hash, "hex");
  const b = Buffer.from(rec.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createSession() {
  const id = crypto.randomBytes(32).toString("hex");
  const csrf = crypto.randomBytes(24).toString("hex");
  sessions.set(id, { csrf: csrf, expires: Date.now() + SESSION_MS });
  return { id: id, csrf: csrf };
}

function readCookie(req) {
  const header = req.headers.cookie || "";
  const found = header.split(";").map(function (c) { return c.trim(); })
    .find(function (c) { return c.startsWith(COOKIE + "="); });
  return found ? decodeURIComponent(found.slice(COOKIE.length + 1)) : null;
}

function getSession(req) {
  const id = readCookie(req);
  if (!id) return null;
  const s = sessions.get(id);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(id); return null; }
  return Object.assign({ id: id }, s);
}

function destroySession(req) {
  const id = readCookie(req);
  if (id) sessions.delete(id);
}

/* Gate for every admin route. State-changing requests must also echo the
   session's CSRF token in a header — a cross-site form post cannot do that,
   and SameSite=Strict on the cookie stops it reaching us in the first place. */
function requireAdmin(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ ok: false, error: "not_signed_in" });
  if (req.method !== "GET" && req.get("x-qurama-csrf") !== session.csrf) {
    return res.status(403).json({ ok: false, error: "bad_csrf" });
  }
  req.session = session;
  next();
}

function cookieOptions(secure) {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: !!secure,
    path: "/",
    maxAge: SESSION_MS,
  };
}

module.exports = {
  COOKIE, savePassword, isConfigured, verify,
  createSession, getSession, destroySession, requireAdmin, cookieOptions,
};
