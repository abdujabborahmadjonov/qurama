"use strict";
/* The photo gallery: photo essays and travel photographs, filed under one of
   five countries. Posts live in the `gallery_posts` table; the image files in
   the public `gallery` storage bucket. Every write goes through the server
   with the service role key. */

const crypto = require("crypto");
const { admin, URL } = require("./supabase");

const BUCKET = "gallery";
const COUNTRIES = ["kz", "kg", "uz", "tj", "tm"];
const KINDS = ["essay", "travel"];
const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function publicUrl(path) {
  return URL + "/storage/v1/object/public/" + BUCKET + "/" + path.split("/").map(encodeURIComponent).join("/");
}

function decorate(row) {
  if (!row) return null;
  const photos = Array.isArray(row.photos) ? row.photos : [];
  return Object.assign({}, row, {
    photos: photos.map(function (p) { return Object.assign({}, p, { url: publicUrl(p.path) }); }),
    cover_url: photos.length ? publicUrl((photos[row.cover || 0] || photos[0]).path) : null,
  });
}

async function list(opts) {
  let q = admin().from("gallery_posts").select("*").order("published_at", { ascending: false }).limit(500);
  if (!(opts && opts.all)) q = q.eq("published", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(decorate);
}

async function get(id) {
  const { data, error } = await admin().from("gallery_posts").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return decorate(data);
}

async function save(id, fields) {
  const row = Object.assign({}, fields, { updated_at: new Date().toISOString() });
  if (id) {
    const { data, error } = await admin().from("gallery_posts").update(row).eq("id", id).select().single();
    if (error) throw error;
    return decorate(data);
  }
  row.published_at = new Date().toISOString();
  const { data, error } = await admin().from("gallery_posts").insert(row).select().single();
  if (error) throw error;
  return decorate(data);
}

async function remove(id) {
  const post = await get(id);
  if (!post) return null;
  const paths = post.photos.map(function (p) { return p.path; });
  if (paths.length) await admin().storage.from(BUCKET).remove(paths);
  const { error } = await admin().from("gallery_posts").delete().eq("id", id);
  if (error) throw error;
  return post;
}

async function uploadImage(buffer, contentType) {
  const ext = IMAGE_TYPES[contentType];
  if (!ext) throw Object.assign(new Error("bad image type"), { code: "not_image" });
  const path = new Date().toISOString().slice(0, 7) + "/" + crypto.randomUUID() + "." + ext;
  const { error } = await admin().storage.from(BUCKET).upload(path, buffer, { contentType: contentType, upsert: false });
  if (error) throw error;
  return { path: path, url: publicUrl(path) };
}

async function removeImages(paths) {
  if (paths && paths.length) await admin().storage.from(BUCKET).remove(paths);
}

module.exports = { BUCKET, COUNTRIES, KINDS, IMAGE_TYPES, list, get, save, remove, uploadImage, removeImages, publicUrl };
