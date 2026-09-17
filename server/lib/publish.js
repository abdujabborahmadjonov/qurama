"use strict";
/* Approving a submission, and taking one down again. */

const { admin } = require("./supabase");
const store = require("./store");

function slugify(title) {
  const base = String(title)
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʻ']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "essay";
}

async function uniqueSlug(title, ownId) {
  const base = slugify(title);
  const { data, error } = await admin().from("entries").select("slug, id").like("slug", base + "%");
  if (error) throw error;
  const taken = new Set((data || [])
    .filter(function (r) { return r.id !== ownId; })
    .map(function (r) { return r.slug; }));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(base + "-" + n)) n += 1;
  return base + "-" + n;
}

async function publish(submission, decision) {
  const slug = await uniqueSlug(decision.en.title, submission.id);

  const row = {
    id: submission.id,
    slug: slug,
    country: decision.country,
    theme: decision.theme,
    format: "text",
    byline: decision.byline || "",
    noindex: !!decision.noindex,
    published_at: new Date().toISOString(),
    title_en: decision.en.title,
    teaser_en: decision.en.teaser || "",
    title_uz: decision.uz.title || decision.en.title,
    teaser_uz: decision.uz.teaser || decision.en.teaser || "",
    html: submission.html || "",
  };

  const { data, error } = await admin().from("entries").upsert(row).select().single();
  if (error) throw error;
  await store.setStatus(submission.id, "published");
  return data;
}

async function unpublish(id) {
  const { error } = await admin().from("entries").delete().eq("id", id);
  if (error) throw error;
  await store.setStatus(id, "pending");
}

async function bySlug(slug) {
  const { data, error } = await admin().from("entries").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data;
}

async function listEntries() {
  const { data, error } = await admin()
    .from("entries")
    .select("*")
    .order("published_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

module.exports = { publish, unpublish, bySlug, listEntries, slugify };
