"use strict";
/* The Qurama application.

   Exported as an Express app rather than started here, so the same code runs
   as a long-lived process (Livops, a VPS, local development) and as a
   serverless function (Vercel, via api/index.js).

   Public   GET  /                      the site
            GET  /essays/:slug          a published story, rendered from the database
            POST /api/submissions       a contributor sends an essay
   Private  GET  /admin                 moderation queue
            *    /api/admin/*           queue actions, bearer token required
*/

const express = require("express");
const multer = require("multer");
const path = require("path");

const auth = require("./lib/auth");
const countries = require("./lib/countries");
const docx = require("./lib/docx");
const publisher = require("./lib/publish");
const render = require("./lib/render");
const store = require("./lib/store");
const supabase = require("./lib/supabase");
const { SITE } = require("./lib/paths");

const MAX_BYTES = 10 * 1024 * 1024;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(function (req, res, next) {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("X-Frame-Options", "DENY");
  next();
});

function clean(value, max) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max || 500);
}

/* ---------------------------------------------------------------- uploads -- */

function UploadError(code) { this.code = code; this.name = "UploadError"; }
UploadError.prototype = Object.create(Error.prototype);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 20 },
  fileFilter: function (req, file, cb) {
    const okExt = path.extname(file.originalname || "").toLowerCase() === ".docx";
    const okMime = file.mimetype === DOCX_MIME;
    if (!okExt || !okMime) return cb(new UploadError("not_docx"));
    cb(null, true);
  },
});

// A .docx is a zip; every real one starts "PK\x03\x04".
function looksLikeZip(buf) {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

// Best-effort throttle. On a serverless host each instance keeps its own map,
// so this slows a flood rather than stopping one; Supabase and the file size
// limit are the real backstops.
const recent = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const hits = (recent.get(ip) || []).filter(function (t) { return now - t < hour; });
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 5000) recent.clear();
  return hits.length > 5;
}

app.post("/api/submissions", function (req, res) {
  upload.single("essay")(req, res, async function (err) {
    if (err) {
      const code = err.code === "LIMIT_FILE_SIZE" ? "too_large"
        : err.code === "not_docx" ? "not_docx" : "upload_failed";
      return res.status(400).json({ ok: false, error: code });
    }
    try {
      if (!supabase.configured()) {
        return res.status(503).json({ ok: false, error: "not_configured" });
      }
      if (rateLimited(req.ip)) {
        return res.status(429).json({ ok: false, error: "too_many" });
      }

      const body = req.body || {};
      if (body.consent !== "yes") {
        return res.status(400).json({ ok: false, error: "consent_required" });
      }

      const meta = {
        name: clean(body.name, 120),
        email: clean(body.email, 200),
        country: countries.CODES.includes(body.country) ? body.country : "",
        language: clean(body.language, 60),
        note: clean(body.about, 4000),
      };

      const file = req.file;
      let converted = null;
      let stored = null;

      if (file) {
        if (!looksLikeZip(file.buffer)) {
          return res.status(400).json({ ok: false, error: "not_docx" });
        }
        try {
          converted = await docx.convert(file.buffer);
        } catch (_) {
          return res.status(400).json({ ok: false, error: "unreadable" });
        }
        if (!converted.text) {
          return res.status(400).json({ ok: false, error: "empty_document" });
        }
        stored = await store.uploadFile(file.buffer, DOCX_MIME);
      } else if (!meta.note) {
        return res.status(400).json({ ok: false, error: "nothing_sent" });
      }

      const saved = await store.add({
        meta: meta,
        file: file ? { path: stored, originalName: clean(file.originalname, 200), size: file.size } : null,
        html: converted ? converted.html : "",
        words: converted ? converted.words : 0,
        warnings: converted ? converted.warnings : [],
      });

      res.json({ ok: true, reference: String(saved.id).slice(0, 8) });
    } catch (e) {
      console.error("submission failed:", e.message);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  });
});

/* ------------------------------------------------------------------ admin -- */

app.use(express.json({ limit: "256kb" }));

app.get("/admin", function (req, res) {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "admin", "index.html"));
});

// Public configuration for the admin page: the anon key is meant to be public,
// and row level security is what actually protects the data.
app.get("/api/config", function (req, res) {
  res.set("Cache-Control", "no-store");
  res.json({
    ok: true,
    supabaseUrl: supabase.URL || null,
    supabaseAnonKey: supabase.ANON_KEY || null,
    configured: supabase.configured() && auth.isConfigured(),
  });
});

app.get("/api/admin/session", function (req, res) {
  auth.identify(req).then(function (user) {
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, signedIn: !!user, email: user ? user.email : null });
  });
});

app.get("/api/admin/submissions", auth.requireAdmin, async function (req, res) {
  try {
    res.set("Cache-Control", "no-store");
    const [submissions, entries] = await Promise.all([store.readAll(), publisher.listEntries()]);
    const bySlug = {};
    entries.forEach(function (e) { bySlug[e.id] = e.slug; });
    submissions.forEach(function (s) { s.slug = bySlug[s.id] || null; });
    res.json({ ok: true, submissions: submissions, countries: countries.COUNTRIES, themes: countries.THEMES });
  } catch (e) {
    console.error("queue failed:", e.message);
    res.status(500).json({ ok: false, error: "queue_failed" });
  }
});

// A short-lived signed URL, so the original never becomes publicly addressable.
app.get("/api/admin/submissions/:id/file", auth.requireAdmin, async function (req, res) {
  try {
    const rec = await store.get(req.params.id);
    if (!rec || !rec.file) return res.status(404).json({ ok: false, error: "not_found" });
    const url = await store.signedUrl(rec.file.path, 60);
    res.json({ ok: true, url: url });
  } catch (e) {
    res.status(500).json({ ok: false, error: "signing_failed" });
  }
});

app.post("/api/admin/submissions/:id/publish", auth.requireAdmin, async function (req, res) {
  try {
    const rec = await store.get(req.params.id);
    if (!rec) return res.status(404).json({ ok: false, error: "not_found" });

    const b = req.body || {};
    if (!countries.CODES.includes(b.country)) return res.status(400).json({ ok: false, error: "bad_country" });
    if (!countries.THEMES.includes(b.theme)) return res.status(400).json({ ok: false, error: "bad_theme" });
    const titleEn = clean(b.titleEn, 160);
    if (!titleEn) return res.status(400).json({ ok: false, error: "title_required" });
    if (!rec.html) return res.status(400).json({ ok: false, error: "nothing_to_publish" });

    const entry = await publisher.publish(rec, {
      country: b.country,
      theme: b.theme,
      byline: clean(b.byline, 120),
      noindex: !!b.noindex,
      en: { title: titleEn, teaser: clean(b.teaserEn, 400) },
      uz: { title: clean(b.titleUz, 160), teaser: clean(b.teaserUz, 400) },
    });
    res.json({ ok: true, entry: entry });
  } catch (e) {
    console.error("publish failed:", e.message);
    res.status(500).json({ ok: false, error: "publish_failed" });
  }
});

app.post("/api/admin/submissions/:id/unpublish", auth.requireAdmin, async function (req, res) {
  try {
    await publisher.unpublish(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "unpublish_failed" });
  }
});

app.post("/api/admin/submissions/:id/hold", auth.requireAdmin, async function (req, res) {
  try {
    await store.setStatus(req.params.id, "held");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "hold_failed" });
  }
});

/* Permanent: the storage object, the submission and, by cascade, the published
   entry. This is how the right of withdrawal is actually honoured. */
app.delete("/api/admin/submissions/:id", auth.requireAdmin, async function (req, res) {
  try {
    await store.remove(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error("delete failed:", e.message);
    res.status(500).json({ ok: false, error: "delete_failed" });
  }
});

/* ----------------------------------------------------------------- essays -- */

app.get("/essays/:slug", async function (req, res, next) {
  const slug = String(req.params.slug || "").replace(/\.html$/, "");
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return next();
  try {
    const entry = await publisher.bySlug(slug);
    if (!entry) return next();
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=600");
    res.send(render.essayPage(entry));
  } catch (e) {
    console.error("essay render failed:", e.message);
    next();
  }
});

/* ------------------------------------------------------------------- site -- */

// Generated rather than committed, so deployment keys live only in the
// environment. The anon key is public by design; RLS is the protection.
app.get("/assets/js/config.js", function (req, res) {
  res.type("application/javascript");
  res.set("Cache-Control", "no-store");
  res.send("window.QURAMA_CONFIG = " + JSON.stringify({
    supabaseUrl: supabase.URL || null,
    supabaseAnonKey: supabase.ANON_KEY || null,
  }) + ";\n");
});


app.use(express.static(SITE, { dotfiles: "deny", extensions: ["html"], index: "index.html" }));

app.use(function (req, res) {
  res.status(404).sendFile(path.join(SITE, "404.html"), function (err) {
    if (err) res.status(404).type("txt").send("Not found");
  });
});

module.exports = app;
