"use strict";
/* Two clients, on purpose.

   admin()  — the service role key. Bypasses row level security, so it can read
              submissions and write entries. This key must never reach a browser.
   public() — the anon key. Subject to RLS, so it can only read published
              entries. Safe to expose; the site uses the same key directly.

   Both are created lazily so the app can boot (and serve the static site)
   before Supabase is configured. */

const { createClient } = require("@supabase/supabase-js");

const URL = process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

const BUCKET = "essays";

let adminClient = null;
let publicClient = null;

function configured() {
  return Boolean(URL && SERVICE_KEY);
}

function admin() {
  if (!configured()) {
    const err = new Error("Supabase is not configured");
    err.code = "not_configured";
    throw err;
  }
  if (!adminClient) {
    adminClient = createClient(URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

function anon() {
  if (!URL || !ANON_KEY) {
    const err = new Error("Supabase anon key is not configured");
    err.code = "not_configured";
    throw err;
  }
  if (!publicClient) {
    publicClient = createClient(URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return publicClient;
}

module.exports = { admin, anon, configured, BUCKET, URL, ANON_KEY };
