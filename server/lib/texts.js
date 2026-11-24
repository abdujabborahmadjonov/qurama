"use strict";
/* Site text overrides, edited from /superadmin → Texts.

   The defaults live in site/assets/js/i18n.js. Anything saved here replaces
   the matching key, per language, and reaches every page through the
   generated /assets/js/config.js. Rows: { id: "<i18n key>", en, uz }. */

const { admin, configured } = require("./supabase");

const KEY_RX = /^[a-z][a-z0-9_.-]{0,80}$/i;
const TTL = 30 * 1000;
let cache = null, cachedAt = 0;

async function all() {
  if (!configured()) return { en: {}, uz: {} };
  if (cache && Date.now() - cachedAt < TTL) return cache;
  const { data, error } = await admin().from("site_texts").select("id,en,uz").limit(2000);
  if (error) { cache = { en: {}, uz: {} }; cachedAt = Date.now(); throw error; }
  const out = { en: {}, uz: {} };
  (data || []).forEach(function (r) {
    if (r.en) out.en[r.id] = r.en;
    if (r.uz) out.uz[r.id] = r.uz;
  });
  cache = out; cachedAt = Date.now();
  return out;
}

/* changes: [{ key, en, uz }]. An empty string for both languages removes the
   override, so the default text comes back. */
async function save(changes) {
  const upserts = [], removals = [];
  changes.slice(0, 500).forEach(function (c) {
    if (!c || !KEY_RX.test(String(c.key || ""))) return;
    const en = String(c.en == null ? "" : c.en).slice(0, 8000);
    const uz = String(c.uz == null ? "" : c.uz).slice(0, 8000);
    if (!en && !uz) removals.push(c.key);
    else upserts.push({ id: c.key, en: en, uz: uz, updated_at: new Date().toISOString() });
  });
  if (upserts.length) {
    const { error } = await admin().from("site_texts").upsert(upserts);
    if (error) throw error;
  }
  for (const key of removals) {
    const { error } = await admin().from("site_texts").delete().eq("id", key);
    if (error) throw error;
  }
  cache = null;
  return { saved: upserts.length, reset: removals.length };
}

module.exports = { all, save };
