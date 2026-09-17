"use strict";
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

module.exports = {
  ROOT,
  SITE: path.join(ROOT, "site"),
  ESSAYS: path.join(ROOT, "site", "essays"),
  ENTRIES_JS: path.join(ROOT, "site", "assets", "js", "entries.js"),
  // Everything under DATA is private. It is never served statically and it is
  // git-ignored: it holds original uploads, contributor contact details and
  // the admin password hash.
  DATA: path.join(ROOT, "data"),
  UPLOADS: path.join(ROOT, "data", "uploads"),
  SUBMISSIONS: path.join(ROOT, "data", "submissions.json"),
  ADMIN: path.join(ROOT, "data", "admin.json"),
};
