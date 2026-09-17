"use strict";
/* .docx -> clean HTML.

   Contributors' files are untrusted input, so conversion is done by mammoth
   (which reads only the document body and ignores macros, embedded objects and
   external references) and the result is then passed through an allow-list
   sanitiser. Nothing from the file reaches a page un-filtered. */

const mammoth = require("mammoth");

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "em", "u", "sup", "sub",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "blockquote",
  "table", "thead", "tbody", "tr", "td", "th",
]);

// Word's own heading styles map onto the page's heading scale. h1 is reserved
// for the essay title, so document headings start one level down.
const STYLE_MAP = [
  // Match on the human style name (needs the document's styles.xml) *and* on
  // the raw style id, so headings survive even in documents exported by tools
  // that omit the styles part.
  "p[style-name='Title'] => h2:fresh",
  "p[style-name='Heading 1'] => h2:fresh",
  "p[style-name='Heading 2'] => h3:fresh",
  "p[style-name='Heading 3'] => h4:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote:fresh",
  "p[style-id='Title'] => h2:fresh",
  "p[style-id='Heading1'] => h2:fresh",
  "p[style-id='Heading2'] => h3:fresh",
  "p[style-id='Heading3'] => h4:fresh",
  "p[style-id='Quote'] => blockquote:fresh",
  "p[style-id='IntenseQuote'] => blockquote:fresh",
];

function sanitize(html) {
  // drop whole dangerous elements including their contents
  let out = html.replace(/<(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\/\1>/gi, "");
  out = out.replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "");

  // images: mammoth inlines them as data: URIs. We do not publish uploaded
  // images — they can carry metadata and we have not asked consent for them.
  out = out.replace(/<img\b[^>]*>/gi, "");

  // rewrite every remaining tag through the allow-list, dropping all attributes
  out = out.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, function (match, tag) {
    const name = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    return match[1] === "/" ? "</" + name + ">" : "<" + name + ">";
  });

  // The page already has one <h1> — the essay title. Whatever the document
  // called its headings, push them all down a level so the page keeps a single
  // top-level heading and a sane outline for screen readers.
  out = out.replace(/<(\/?)h([1-5])>/gi, function (_m, slash, level) {
    return "<" + slash + "h" + (Number(level) + 1) + ">";
  });

  return out.replace(/(?:\s*<p>\s*<\/p>\s*)+/gi, "\n").trim();
}

async function convert(buffer) {
  const result = await mammoth.convertToHtml(
    { buffer: buffer },
    { styleMap: STYLE_MAP, convertImage: function () { return []; } }
  );
  const html = sanitize(result.value || "");
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return {
    html: html,
    text: text,
    words: text ? text.split(" ").length : 0,
    // mammoth reports unsupported styles etc.; useful for the moderator to see
    warnings: (result.messages || []).map(function (m) { return m.message; }).slice(0, 25),
  };
}

module.exports = { convert, sanitize };
