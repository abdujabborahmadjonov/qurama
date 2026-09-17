"use strict";
/* Qurama — static site + contributor uploads + a private moderation queue.

   Shape of the thing:
     public   GET  /                     the site
              POST /api/submissions      a contributor sends an essay (.docx)
     private  GET  /admin                moderation queue (password)
              *    /api/admin/*          queue actions

   Nothing a contributor sends is public until a moderator approves it. Original
   uploads and contact details live under data/, which is never served. */

const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");

const auth = require("./lib/auth");
const countries = require("./lib/countries");
const docx = require("./lib/docx");
const publisher = require("./lib/publish");
const store = require("./lib/store");
const { SITE, UPLOADS } = require("./lib/paths");

const PORT = Number(process.env.PORT) || 3000;
const BEHIND_HTTPS = process.env.QURAMA_HTTPS === "1";
const MAX_BYTES = 10 * 1024 * 1024;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

store.ensureDirs();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", BEHIND_HTTPS ? 1 : false);

app.use(function (req, res, next) {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("X-Frame-Options", "DENY");
  next();
});

/* ---------------------------------------------------------------- uploads -- */

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

function UploadError(code) { this.code = code; this.name = "UploadError"; }
UploadError.prototype = Object.create(Error.prototype);

// A .docx is a zip; every real one starts "PK\x03\x04". Catches a renamed file
// before it ever reaches the parser.
function looksLikeZip(buf) {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

// Crude but sufficient: a handful of submissions per address per hour.
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

function clean(value, max) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max || 500);
}

app.post("/api/submissions", function (req, res) {
  upload.single("essay")(req, res, async function (err) {
    if (err) {
      const code = err.code === "LIMIT_FILE_SIZE" ? "too_large"
        : err.code === "not_docx" ? "not_docx" : "upload_failed";
      return res.status(400).json({ ok: false, error: code });
    }
    try {
      if (rateLimited(req.ip)) {
        return res.status(429).json({ ok: false, error: "too_many" });
      }

      const body = req.body || {};
      if (body.consent !== "yes") {
        return res.status(400).json({ ok: false, error: "consent_required" });
      }

      const country = countries.CODES.includes(body.country) ? body.country : "";
      const meta = {
        name: clean(body.name, 120),
        email: clean(body.email, 200),
        country: country,
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
        // We name the file ourselves. The contributor's filename is kept as a
        // label only and never touches the filesystem.
        stored = crypto.randomUUID() + ".docx";
        fs.writeFileSync(path.join(UPLOADS, stored), file.buffer, { mode: 0o600 });
      } else if (!meta.note) {
        return res.status(400).json({ ok: false, error: "nothing_sent" });
      }

      const record = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        status: "pending",
        meta: meta,
        file: file ? {
          storedName: stored,
          originalName: clean(file.originalname, 200),
          size: file.size,
        } : null,
        html: converted ? converted.html : "",
        words: converted ? converted.words : 0,
        warnings: converted ? converted.warnings : [],
      };

      await store.add(record);
      res.json({ ok: true, reference: record.id.slice(0, 8) });
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

app.get("/api/admin/session", function (req, res) {
  const s = auth.getSession(req);
  res.json({ ok: true, signedIn: !!s, configured: auth.isConfigured(), csrf: s ? s.csrf : null });
});

app.post("/api/admin/login", function (req, res) {
  const password = (req.body && req.body.password) || "";
  if (!auth.isConfigured()) {
    return res.status(503).json({ ok: false, error: "no_password_set" });
  }
  if (!auth.verify(password)) {
    return res.status(401).json({ ok: false, error: "wrong_password" });
  }
  const session = auth.createSession();
  res.cookie(auth.COOKIE, session.id, auth.cookieOptions(BEHIND_HTTPS));
  res.json({ ok: true, csrf: session.csrf });
});

app.post("/api/admin/logout", function (req, res) {
  auth.destroySession(req);
  res.clearCookie(auth.COOKIE, auth.cookieOptions(BEHIND_HTTPS));
  res.json({ ok: true });
});

app.get("/api/admin/submissions", auth.requireAdmin, function (req, res) {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, submissions: store.readAll(), countries: countries.COUNTRIES, themes: countries.THEMES });
});

app.get("/api/admin/submissions/:id/file", auth.requireAdmin, function (req, res) {
  const rec = store.get(req.params.id);
  if (!rec || !rec.file) return res.status(404).json({ ok: false, error: "not_found" });
  const safe = path.basename(rec.file.storedName);
  res.set("Content-Type", DOCX_MIME);
  res.set("Content-Disposition", 'attachment; filename="' + safe + '"');
  res.sendFile(path.join(UPLOADS, safe));
});

app.post("/api/admin/submissions/:id/publish", auth.requireAdmin, async function (req, res) {
  const rec = store.get(req.params.id);
  if (!rec) return res.status(404).json({ ok: false, error: "not_found" });

  const b = req.body || {};
  if (!countries.CODES.includes(b.country)) return res.status(400).json({ ok: false, error: "bad_country" });
  if (!countries.THEMES.includes(b.theme)) return res.status(400).json({ ok: false, error: "bad_theme" });
  const titleEn = clean(b.titleEn, 160);
  if (!titleEn) return res.status(400).json({ ok: false, error: "title_required" });

  const decision = {
    country: b.country,
    theme: b.theme,
    byline: clean(b.byline, 120),
    noindex: !!b.noindex,
    en: { title: titleEn, teaser: clean(b.teaserEn, 400) },
    uz: { title: clean(b.titleUz, 160) || titleEn, teaser: clean(b.teaserUz, 400) || clean(b.teaserEn, 400) },
  };

  try {
    const entry = publisher.publish(rec, decision);
    await store.update(rec.id, { status: "published", slug: entry.slug, publishedAt: entry.publishedAt });
    res.json({ ok: true, entry: entry });
  } catch (e) {
    console.error("publish failed:", e.message);
    res.status(500).json({ ok: false, error: "publish_failed" });
  }
});

app.post("/api/admin/submissions/:id/unpublish", auth.requireAdmin, async function (req, res) {
  publisher.unpublish(req.params.id);
  await store.update(req.params.id, { status: "pending", slug: null, publishedAt: null });
  res.json({ ok: true });
});

app.post("/api/admin/submissions/:id/hold", auth.requireAdmin, async function (req, res) {
  await store.update(req.params.id, { status: "held" });
  res.json({ ok: true });
});

/* Permanent: removes the record and the original upload. This is how the
   right of withdrawal in the ethics policy is actually honoured. */
app.delete("/api/admin/submissions/:id", auth.requireAdmin, async function (req, res) {
  publisher.unpublish(req.params.id);
  await store.remove(req.params.id);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------- site -- */

app.use(express.static(SITE, {
  dotfiles: "deny",
  extensions: ["html"],
  index: "index.html",
}));

app.use(function (req, res) {
  res.status(404).sendFile(path.join(SITE, "404.html"), function (err) {
    if (err) res.status(404).type("txt").send("Not found");
  });
});

app.listen(PORT, function () {
  console.log("Qurama running on http://localhost:" + PORT);
  console.log("Moderation queue: http://localhost:" + PORT + "/admin");
  if (!auth.isConfigured()) {
    console.log("\n  No moderator password set yet. Run:  npm run set-password\n");
  }
});
