# Qurama

A digital archive of Central Asian immigrant women's untold stories in Canada —
Kazakhstan, Kyrgyzstan, Tajikistan, Turkmenistan, Uzbekistan and Afghanistan.

*Qurama* is the Central Asian patchwork technique: scraps from different households
and decades pieced into one covering, with the seams left as part of the design.

## Running it

```bash
npm install
npm run set-password    # sets the moderator password (once)
npm start               # http://localhost:3000
```

The static site alone (no uploads, no moderation) also works with any file server:

```bash
python3 -m http.server 8123 --directory site
```

## What's here

```
site/                     the public site — plain HTML, CSS and JS, no build step
  index.html              home
  about.html              who we are · the name · manifesto · six countries · ethics
  context.html            short original history of the region, with sources
  stories.html            the archive, filtered by country / theme / format
  share.html              how contributing works + the upload form
  resources.html          community organisations · publications
  essays/                 GENERATED — one page per published story
  assets/css/style.css    design system: lapis / terracotta / steppe gold, light + dark
  assets/js/i18n.js       every visible string, English + Uzbek
  assets/js/data.js       placeholder entries, shown only until a real one is published
  assets/js/entries.js    GENERATED — the published archive index
  assets/img/country/     original ornament, one motif per country
server/
  index.js                static site + submissions API + moderation queue
  admin/index.html        the queue itself (password-protected)
  lib/docx.js             .docx → sanitised HTML
  lib/publish.js          approved submission → essay page + archive entry
  lib/auth.js             scrypt password, sessions, CSRF
  lib/store.js            JSON store with atomic writes
data/                     PRIVATE, git-ignored: uploads, contact details, password hash
tools/sync-partials.py    copies header/footer from index.html into the other pages
```

## How a story gets published

1. A contributor fills in `share.html` and optionally attaches a `.docx`.
2. The server checks consent, file type (extension, MIME *and* zip magic bytes) and
   size, converts the document, strips everything but an allow-list of tags, and files
   it as `pending`. The original lands in `data/uploads/` under a name we generate.
3. Nothing is public at this point.
4. A moderator signs in at `/admin`, reads the converted text, writes the title and
   teaser in both languages, picks country and theme, and publishes.
5. That writes `site/essays/<slug>.html` and rewrites `site/assets/js/entries.js`.
   Real entries automatically replace the placeholder cards across the site.
6. **Take down** un-publishes; **Delete permanently** also erases the original upload.
   That is how the right of withdrawal in the ethics policy is actually honoured.

## Editing

- **Header or footer** — edit `site/index.html`, then `python3 tools/sync-partials.py`.
- **Any visible string** — `assets/js/i18n.js`, keyed by `data-i18n` in the markup.
  Adding Kazakh, Kyrgyz, Tajik, Turkmen or Dari means copying the `uz` block,
  translating it, and adding the code to `LANGS`.
- **Never edit** `essays/*.html` or `entries.js` by hand — publishing rewrites them.

## Before this goes live

- `data/` must not be committed or served. The `.gitignore` covers it; check your host.
- Set `QURAMA_HTTPS=1` in production so the session cookie is marked `Secure`.
  Run it behind HTTPS — contributors are sending personal accounts over this form.
- Replace `hello@example.org` throughout.
- Have the ethics and consent text in `about.html` reviewed by someone with research
  ethics experience before collection starts. It is my draft, not a vetted policy.
- Decide where uploads are backed up, and who besides you can read `data/`.
- The placeholder entries in `data.js` disappear on first real publish, but delete
  them before launch anyway.

## Still to do

- Photography (see the note in the project history — licensing needs checking)
- Kazakh, Kyrgyz, Tajik, Turkmen and Dari translations
- A real map of Central Asia; the current one is a stylised tile layout
- Email notification when something lands in the queue
