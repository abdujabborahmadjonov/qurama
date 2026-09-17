"use strict";
/* End-to-end tests: real Express app, real supabase-js client, fake Supabase.
   Run with:  npm test  */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { create } = require("./fake-supabase");

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log("  ok   " + name); }
  catch (e) { failed += 1; console.log("  FAIL " + name + "\n       " + e.message); }
}

/* ---- a real .docx, built here so the test has no fixtures to carry ---- */
function makeDocx(paragraphs) {
  const esc = function (s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };
  const body = paragraphs.map(function (p) {
    const style = p.style ? '<w:pPr><w:pStyle w:val="' + p.style + '"/></w:pPr>' : "";
    return "<w:p>" + style + "<w:r><w:t xml:space=\"preserve\">" + esc(p.text) + "</w:t></w:r></w:p>";
  }).join("");
  const files = {
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      body + "</w:body></w:document>",
  };

  // minimal zip writer (stored + deflate), so no zip dependency is needed
  const chunks = [], central = [];
  let offset = 0;
  Object.keys(files).forEach(function (name) {
    const data = Buffer.from(files[name], "utf8");
    const deflated = zlib.deflateRawSync(data);
    const crc = require("zlib").crc32 ? require("zlib").crc32(data) : crc32(data);
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, deflated);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0, 8); dir.writeUInt16LE(8, 10); dir.writeUInt16LE(0, 12); dir.writeUInt16LE(0, 14);
    dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(deflated.length, 20); dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28); dir.writeUInt16LE(0, 30); dir.writeUInt16LE(0, 32);
    dir.writeUInt16LE(0, 34); dir.writeUInt16LE(0, 36); dir.writeUInt32LE(0, 38); dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);
    offset += local.length + nameBuf.length + deflated.length;
  });
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([Buffer.concat(chunks), centralBuf, end]);
}

let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[i] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/* ------------------------------------------------------------------ run -- */

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function main() {
  const fake = create();
  await new Promise(function (r) { fake.server.listen(0, r); });
  const fakePort = fake.server.address().port;

  fake.addUser("moderator@example.org", "a-long-enough-password");
  fake.addUser("stranger@example.org", "a-long-enough-password");

  process.env.SUPABASE_URL = "http://127.0.0.1:" + fakePort;
  process.env.SUPABASE_ANON_KEY = "anon-key-for-tests";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key-for-tests";
  process.env.QURAMA_MODERATORS = "moderator@example.org";

  const app = require("../server/app");
  const server = app.listen(0);
  await new Promise(function (r) { server.on("listening", r); });
  const base = "http://127.0.0.1:" + server.address().port;

  const essay = makeDocx([
    { text: "The light goes at four", style: "Heading1" },
    { text: "The first thing nobody warns you about is the light." },
    { text: "What my mother said", style: "Heading2" },
    { text: "She said: the cold you can dress for." },
  ]);

  const submit = async function (fields, file) {
    const form = new FormData();
    Object.keys(fields).forEach(function (k) { form.set(k, fields[k]); });
    if (file) form.set("essay", new Blob([file.buffer], { type: file.type }), file.name);
    const res = await fetch(base + "/api/submissions", { method: "POST", body: form });
    return { status: res.status, body: await res.json() };
  };

  console.log("\nsubmissions");

  await test("rejects a submission without consent", async function () {
    const r = await submit({ consent: "no", about: "hello" });
    assert.strictEqual(r.body.error, "consent_required");
  });

  await test("rejects a file that is not a .docx", async function () {
    const r = await submit({ consent: "yes" },
      { buffer: Buffer.from("not a zip at all"), type: DOCX, name: "essay.docx" });
    assert.strictEqual(r.body.error, "not_docx");
  });

  await test("rejects an empty submission", async function () {
    const r = await submit({ consent: "yes" });
    assert.strictEqual(r.body.error, "nothing_sent");
  });

  let reference = null;
  await test("accepts a real .docx and stores it", async function () {
    const r = await submit(
      { consent: "yes", name: "Test Contributor", email: "her@example.org", country: "af", about: "A first attempt." },
      { buffer: essay, type: DOCX, name: "my story.docx" });
    assert.strictEqual(r.body.ok, true, JSON.stringify(r.body));
    reference = r.body.reference;
    assert.strictEqual(fake.db.submissions.length, 1);
    assert.strictEqual(fake.storage.size, 1, "the original should be in storage");
  });

  await test("converts headings below the page title", async function () {
    const row = fake.db.submissions[0];
    assert.ok(row.html.indexOf("<h2>The light goes at four</h2>") !== -1, row.html);
    assert.ok(row.html.indexOf("<h3>What my mother said</h3>") !== -1, row.html);
    assert.ok(row.html.indexOf("<h1>") === -1, "no h1 may survive");
  });

  await test("keeps the contributor's filename out of the storage path", async function () {
    const key = Array.from(fake.storage.keys())[0];
    assert.ok(key.indexOf("my story") === -1, key);
    assert.ok(/^essays\/\d{4}-\d{2}\/[0-9a-f-]{36}\.docx$/.test(key), key);
  });

  await test("stores the submission as pending, never published", async function () {
    assert.strictEqual(fake.db.submissions[0].status, "pending");
    assert.strictEqual(fake.db.entries.length, 0);
  });

  console.log("\nauthentication");

  const signIn = async function (email, password) {
    const res = await fetch(process.env.SUPABASE_URL + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_ANON_KEY },
      body: JSON.stringify({ email: email, password: password }),
    });
    const out = await res.json();
    return out.access_token || null;
  };

  await test("the queue is closed without a token", async function () {
    const res = await fetch(base + "/api/admin/submissions");
    assert.strictEqual(res.status, 401);
  });

  await test("a bad token is refused", async function () {
    const res = await fetch(base + "/api/admin/submissions", { headers: { Authorization: "Bearer nonsense" } });
    assert.strictEqual(res.status, 401);
  });

  let strangerToken = null;
  await test("a real account that is not a moderator is refused", async function () {
    strangerToken = await signIn("stranger@example.org", "a-long-enough-password");
    assert.ok(strangerToken, "the stranger should be able to sign in to Supabase");
    const res = await fetch(base + "/api/admin/submissions", { headers: { Authorization: "Bearer " + strangerToken } });
    assert.strictEqual(res.status, 401, "signing in is not the same as being a moderator");
  });

  let token = null;
  await test("a moderator gets the queue", async function () {
    token = await signIn("moderator@example.org", "a-long-enough-password");
    const res = await fetch(base + "/api/admin/submissions", { headers: { Authorization: "Bearer " + token } });
    const out = await res.json();
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.submissions.length, 1);
    assert.strictEqual(out.submissions[0].meta.email, "her@example.org");
  });

  const asModerator = function (url, options) {
    const o = Object.assign({ headers: {} }, options || {});
    o.headers.Authorization = "Bearer " + token;
    if (o.body) o.headers["Content-Type"] = "application/json";
    return fetch(base + url, o);
  };

  console.log("\npublishing");

  let id = null;
  await test("publishes an approved submission", async function () {
    id = fake.db.submissions[0].id;
    const res = await asModerator("/api/admin/submissions/" + id + "/publish", {
      method: "POST",
      body: JSON.stringify({
        country: "af", theme: "identity",
        titleEn: "The light goes at four", teaserEn: "On the first winter.",
        titleUz: "Soat to‘rtda yorug‘lik ketadi", teaserUz: "Birinchi qish haqida.",
        byline: "",
      }),
    });
    const out = await res.json();
    assert.strictEqual(out.ok, true, JSON.stringify(out));
    assert.strictEqual(out.entry.slug, "the-light-goes-at-four");
    assert.strictEqual(fake.db.entries.length, 1);
    assert.strictEqual(fake.db.submissions[0].status, "published");
  });

  await test("refuses an unknown country or theme", async function () {
    const bad = await asModerator("/api/admin/submissions/" + id + "/publish", {
      method: "POST",
      body: JSON.stringify({ country: "xx", theme: "identity", titleEn: "x" }),
    });
    assert.strictEqual((await bad.json()).error, "bad_country");
    const bad2 = await asModerator("/api/admin/submissions/" + id + "/publish", {
      method: "POST",
      body: JSON.stringify({ country: "af", theme: "not-a-theme", titleEn: "x" }),
    });
    assert.strictEqual((await bad2.json()).error, "bad_theme");
  });

  await test("serves the published essay", async function () {
    const res = await fetch(base + "/essays/the-light-goes-at-four");
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.indexOf("<h1 class=\"essay__title\">The light goes at four</h1>") !== -1);
    assert.ok(html.indexOf("The first thing nobody warns you about") !== -1);
    assert.ok(html.indexOf("../assets/css/style.css") !== -1, "asset paths adjusted for depth");
    assert.ok(html.indexOf("reading-progress") !== -1, "reading aids present");
  });

  await test("an unknown slug is a 404, not an error", async function () {
    const res = await fetch(base + "/essays/no-such-story");
    assert.strictEqual(res.status, 404);
  });

  await test("rejects a slug that tries to escape", async function () {
    const res = await fetch(base + "/essays/..%2f..%2fpackage.json");
    assert.ok(res.status === 404, "status was " + res.status);
  });

  await test("gives a second story a distinct slug", async function () {
    await submit({ consent: "yes", country: "uz" }, { buffer: essay, type: DOCX, name: "b.docx" });
    const second = fake.db.submissions.find(function (s) { return s.status === "pending"; });
    const res = await asModerator("/api/admin/submissions/" + second.id + "/publish", {
      method: "POST",
      body: JSON.stringify({ country: "uz", theme: "regions", titleEn: "The light goes at four" }),
    });
    const out = await res.json();
    assert.strictEqual(out.entry.slug, "the-light-goes-at-four-2", JSON.stringify(out));
  });

  console.log("\nprivacy and withdrawal");

  await test("the public archive query exposes no contact details", async function () {
    const res = await fetch(process.env.SUPABASE_URL +
      "/rest/v1/entries?select=id,slug,country,theme,format,byline,published_at,title_en,teaser_en,title_uz,teaser_uz&order=published_at.desc",
      { headers: { apikey: process.env.SUPABASE_ANON_KEY } });
    const rows = await res.json();
    assert.strictEqual(rows.length, 2);
    const text = JSON.stringify(rows);
    assert.ok(text.indexOf("her@example.org") === -1, "an email reached the public query");
    assert.ok(text.indexOf("Test Contributor") === -1, "a contributor name reached the public query");
  });

  await test("the original file is only reachable through a signed link", async function () {
    const res = await asModerator("/api/admin/submissions/" + id + "/file");
    const out = await res.json();
    assert.strictEqual(out.ok, true);
    assert.ok(out.url.indexOf("token=") !== -1, out.url);
  });

  await test("taking a story down removes it but keeps the submission", async function () {
    const res = await asModerator("/api/admin/submissions/" + id + "/unpublish", { method: "POST" });
    assert.strictEqual((await res.json()).ok, true);
    assert.strictEqual(fake.db.entries.length, 1, "only the other story remains");
    assert.strictEqual(fake.db.submissions.find(function (s) { return s.id === id; }).status, "pending");
    const page = await fetch(base + "/essays/the-light-goes-at-four");
    assert.strictEqual(page.status, 404, "the page must stop resolving");
  });

  await test("permanent deletion erases the row, the file and the entry", async function () {
    const before = fake.storage.size;
    const res = await asModerator("/api/admin/submissions/" + id, { method: "DELETE" });
    assert.strictEqual((await res.json()).ok, true);
    assert.strictEqual(fake.db.submissions.some(function (s) { return s.id === id; }), false);
    assert.strictEqual(fake.storage.size, before - 1, "the uploaded file should be gone");
  });

  await test("a stranger cannot delete anything", async function () {
    const remaining = fake.db.submissions[0].id;
    const res = await fetch(base + "/api/admin/submissions/" + remaining, {
      method: "DELETE", headers: { Authorization: "Bearer " + strangerToken },
    });
    assert.strictEqual(res.status, 401);
    assert.ok(fake.db.submissions.some(function (s) { return s.id === remaining; }));
  });

  console.log("\nthe site itself");

  for (const p of ["/", "/about.html", "/context.html", "/stories.html", "/share.html", "/resources.html", "/admin"]) {
    await test("serves " + p, async function () {
      const res = await fetch(base + p);
      assert.strictEqual(res.status, 200);
    });
  }

  await test("the service role key never reaches the browser", async function () {
    const cfg = await (await fetch(base + "/api/config")).json();
    assert.strictEqual(cfg.supabaseAnonKey, process.env.SUPABASE_ANON_KEY);
    const js = await (await fetch(base + "/assets/js/config.js")).text();
    assert.ok(js.indexOf(process.env.SUPABASE_SERVICE_ROLE_KEY) === -1, "service key leaked into config.js");
    assert.ok(JSON.stringify(cfg).indexOf(process.env.SUPABASE_SERVICE_ROLE_KEY) === -1, "service key leaked into /api/config");
  });

  server.close();
  fake.server.close();

  console.log("\n" + passed + " passed, " + failed + " failed\n");
  process.exit(failed ? 1 : 0);
}

main().catch(function (e) { console.error(e); process.exit(1); });
