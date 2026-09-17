"use strict";
/* Moderator authentication, through Supabase Auth.

   The admin page signs in against Supabase's token endpoint and sends the
   resulting JWT as `Authorization: Bearer …`. The server verifies the token
   with Supabase and then checks the address against an explicit allow-list —
   having an account in the project is not the same as being a moderator.

   Using a bearer header rather than a cookie also means a cross-site form post
   cannot carry the credential, so there is no CSRF token to manage. */

const { admin } = require("./supabase");

function moderators() {
  return (process.env.QURAMA_MODERATORS || "")
    .split(",")
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(Boolean);
}

function bearer(req) {
  const header = req.get ? req.get("authorization") : req.headers.authorization;
  if (!header || !/^Bearer /i.test(header)) return null;
  return header.slice(7).trim() || null;
}

async function identify(req) {
  const token = bearer(req);
  if (!token) return null;
  try {
    const { data, error } = await admin().auth.getUser(token);
    if (error || !data || !data.user) return null;
    const email = (data.user.email || "").toLowerCase();
    const allowed = moderators();
    if (allowed.length === 0) return null;      // fail closed
    if (allowed.indexOf(email) === -1) return null;
    return { id: data.user.id, email: email };
  } catch (_) {
    return null;
  }
}

function requireAdmin(req, res, next) {
  identify(req).then(function (user) {
    if (!user) return res.status(401).json({ ok: false, error: "not_signed_in" });
    req.user = user;
    next();
  }).catch(function () {
    res.status(500).json({ ok: false, error: "auth_unavailable" });
  });
}

function isConfigured() {
  return moderators().length > 0;
}

module.exports = { requireAdmin, identify, isConfigured, moderators };
