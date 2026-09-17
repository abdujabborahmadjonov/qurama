"use strict";
/* Submissions, stored in Supabase.

   Every function here uses the service role client, so these must only ever be
   called from server code. */

const crypto = require("crypto");
const { admin, BUCKET } = require("./supabase");

function rowToRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    meta: {
      name: row.name || "",
      email: row.email || "",
      country: row.country || "",
      language: row.language || "",
      note: row.note || "",
    },
    file: row.file_path
      ? { path: row.file_path, originalName: row.file_original_name, size: row.file_size }
      : null,
    html: row.html || "",
    words: row.words || 0,
    warnings: row.warnings || [],
  };
}

async function add(input) {
  const { data, error } = await admin()
    .from("submissions")
    .insert({
      status: "pending",
      name: input.meta.name || null,
      email: input.meta.email || null,
      country: input.meta.country || null,
      language: input.meta.language || null,
      note: input.meta.note || null,
      file_path: input.file ? input.file.path : null,
      file_original_name: input.file ? input.file.originalName : null,
      file_size: input.file ? input.file.size : null,
      html: input.html || "",
      words: input.words || 0,
      warnings: input.warnings || [],
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

async function readAll() {
  const { data, error } = await admin()
    .from("submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []).map(rowToRecord);
}

async function get(id) {
  const { data, error } = await admin().from("submissions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return rowToRecord(data);
}

async function setStatus(id, status) {
  const { error } = await admin().from("submissions").update({ status: status }).eq("id", id);
  if (error) throw error;
}

/* Permanent deletion: the storage object first, then the row. The entries row
   goes with it through the foreign key's ON DELETE CASCADE. */
async function remove(id) {
  const record = await get(id);
  if (!record) return null;
  if (record.file && record.file.path) {
    await admin().storage.from(BUCKET).remove([record.file.path]);
  }
  const { error } = await admin().from("submissions").delete().eq("id", id);
  if (error) throw error;
  return record;
}

async function uploadFile(buffer, contentType) {
  // We choose the object name. The contributor's filename is kept only as a
  // label in the database, so it never reaches a path.
  const path = new Date().toISOString().slice(0, 7) + "/" + crypto.randomUUID() + ".docx";
  const { error } = await admin().storage.from(BUCKET).upload(path, buffer, {
    contentType: contentType,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

async function signedUrl(path, seconds) {
  const { data, error } = await admin()
    .storage.from(BUCKET)
    .createSignedUrl(path, seconds || 60);
  if (error) throw error;
  return data.signedUrl;
}

module.exports = { add, readAll, get, setStatus, remove, uploadFile, signedUrl };
