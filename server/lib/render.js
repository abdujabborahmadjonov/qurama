"use strict";
/* Rendering a published essay.

   The header and footer come out of site/index.html at render time, so editing
   the nav in one place still updates every essay — the same arrangement the
   static pages use through tools/sync-partials.py. */

const fs = require("fs");
const path = require("path");
const { SITE } = require("./paths");
const countries = require("./countries");

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

let cache = null;
function partials() {
  // Cached because on a serverless host this file is read on every cold start.
  if (cache) return cache;
  const index = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
  const grab = function (name) {
    const m = index.match(new RegExp("<!-- #include: " + name + " -->[\\s\\S]*?<!-- /include -->"));
    if (!m) throw new Error("could not find the '" + name + "' block in index.html");
    // Essays are served from /essays/<slug>, one level deeper than the pages.
    return m[0].replace(/(href|src)="(?!https?:|mailto:|#|\/)/g, '$1="../');
  };
  cache = { header: grab("header"), footer: grab("footer") };
  return cache;
}

function essayPage(entry) {
  const p = partials();
  const title = escapeHtml(entry.title_en);
  const teaser = escapeHtml(entry.teaser_en || "");
  const country = escapeHtml(countries.name(entry.country, "en"));
  const byline = entry.byline ? escapeHtml(entry.byline) : "";
  const date = entry.published_at ? escapeHtml(String(entry.published_at).slice(0, 10)) : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Qurama</title>
<meta name="description" content="${teaser}">
<meta name="robots" content="${entry.noindex ? "noindex, nofollow" : "index, follow"}">
<link rel="icon" href="../assets/img/logo.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/style.css">
</head>
<body data-entry-id="${escapeHtml(entry.id)}">
<a class="skip-link" href="#main">Skip to content</a>
<div class="reading-progress" aria-hidden="true"></div>
<div class="ikat-edge ikat-edge--left" aria-hidden="true"></div>
<div class="ikat-edge ikat-edge--right" aria-hidden="true"></div>
${p.header}
<main id="main">
  <article class="section">
    <div class="wrap">
      <p class="eyebrow">${country}</p>
      <h1 class="essay__title">${title}</h1>
      <p class="lede">${teaser}</p>
      <p class="essay__byline">${byline ? "Told by " + byline : "Told anonymously"}${date ? " · " + date : ""}</p>

      <div class="essay-layout">
        <aside><nav class="toc" id="toc" aria-label="On this page"></nav></aside>
        <div class="essay__body prose">
${entry.html}
        </div>
      </div>

      <p class="note essay__rights">This story remains the property of the person who told it.
        It is published here with their consent, and it can be withdrawn at any time —
        <a href="../share.html">get in touch</a>.</p>
      <div class="btn-row"><a class="btn btn--ghost" href="../stories.html">Back to the archive</a></div>

      <section class="related" hidden>
        <h2 data-i18n="essay.related">More from the archive</h2>
        <div class="grid grid--3" id="related-grid"></div>
      </section>
    </div>
  </article>
</main>
${p.footer}
<script src="../assets/js/config.js"></script>
<script src="../assets/js/i18n.js"></script>
<script src="../assets/js/data.js"></script>
<script src="../assets/js/main.js"></script>
</body>
</html>
`;
}

module.exports = { essayPage, escapeHtml };
