# Qurama

A digital archive of Central Asian immigrant women's untold stories in Canada —
Kazakhstan, Kyrgyzstan, Tajikistan, Turkmenistan, Uzbekistan and Afghanistan.

*Qurama* is the Central Asian patchwork technique: scraps from different households
and decades pieced into one covering, with the seams left as part of the design.

---

## How it fits together

| Part | What it does |
|---|---|
| `site/` | The public pages. Plain HTML, CSS and JS — no build step, no framework. |
| `server/` | An Express app: the submissions API, the moderation queue, and essay pages rendered from the database. |
| Supabase | Postgres for submissions and published entries, Storage for the original `.docx` files, Auth for moderator sign-in. |

The app is deliberately portable: `server/app.js` exports the Express app, and
`server/index.js` (long-lived process) and `api/index.js` (serverless) are both
thin wrappers around it. The same code runs on Livops, a VPS, or Vercel.

```
site/
  index.html          home
  about.html          who we are · the name · manifesto · six countries · ethics
  context.html        short original history of the region, with sources
  stories.html        the archive, filtered by country / theme / format
  share.html          how contributing works + the upload form
  resources.html      community organisations · publications
  assets/css/style.css   lapis / terracotta / steppe gold, light and dark
  assets/js/i18n.js      every visible string, English + Uzbek
  assets/js/config.js    placeholder; the server generates the real one
  assets/js/data.js      placeholder entries, shown only until real ones exist
  assets/js/main.js      language switch, filtering, reading aids, uploads
  assets/img/country/    original ornament, one motif per country
  assets/img/flags/      national flags from Wikimedia Commons (public domain)
  assets/img/craft/      craft photographs + CREDITS.md (attribution is required)
server/
  app.js              the application
  index.js            long-lived entry point (Livops, VPS, local)
  admin/index.html    the moderation queue
  lib/                supabase clients, store, auth, docx, publish, render
api/index.js          serverless entry point (Vercel)
supabase/schema.sql   run this once in the Supabase SQL editor
test/                 end-to-end tests against a fake Supabase
```

---

## Setting it up

### 1. Supabase

Create a project at [supabase.com](https://supabase.com). **Choose the Canada
region (`ca-central-1`).** Contributors are in Canada, and it is the answer you
want when someone asks where her account is stored.

Then:

1. **SQL Editor → New query** → paste all of `supabase/schema.sql` → Run.
   This creates both tables, turns on row level security, and makes the private
   `essays` storage bucket.
2. **Authentication → Providers → Email** → turn **off** "Enable sign-ups".
   Nobody should be able to create an account in this project but you.
3. **Authentication → Users → Add user** → your email and a strong password,
   with "Auto Confirm User" ticked. This is your moderator login.
4. **Project Settings → API** → copy the project URL, the `anon` key and the
   `service_role` key.

### 2. Local

```bash
cp .env.example .env     # then fill in the four values
npm install
npm start                # http://localhost:3000
```

The queue is at `/admin`.

```bash
npm test                 # 30 end-to-end tests, no Supabase project needed
npm run demo             # the site with a few stories already in it
```

`npm run demo` runs the app against a local fake Supabase seeded with a handful
of published stories and one submission waiting in the queue. Nothing touches a
real project and nothing is saved. It is how to look at the site, or work on the
front end, before the Supabase project exists. The queue signs in with
`moderator@example.org` / `demo-password-1234`.

---

## Deploying

Set the same four environment variables either way:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | your project URL |
| `SUPABASE_ANON_KEY` | the `anon` key — public by design |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key — **server only, never commit** |
| `QURAMA_MODERATORS` | your email address, comma-separated if more than one |

### Livops (livops.uz)

Livops runs a normal long-lived Node process, which is the simpler fit, and it
takes payment in so'm through Payme or Click — no foreign card.

1. Push this repository to GitHub.
2. Connect it in the Livops dashboard and pick this repo.
3. Add the four environment variables.
4. Start command: `npm start`. It reads `PORT` from the environment.

### Vercel

`vercel.json` routes every request into `api/index.js`, which is the same
Express app.

1. Import the repository at vercel.com.
2. Add the four environment variables (Production *and* Preview).
3. Deploy. No build command and no output directory are needed.

Note that Vercel's free tier forbids commercial use and needs a foreign card.

Either way, **run it over HTTPS**. Contributors are sending personal accounts
through that form.

---

## How a story gets published

1. A contributor fills in `share.html` and optionally attaches a `.docx`.
2. The server checks consent, then the file's extension, MIME type *and* zip
   magic bytes, converts it, and strips everything outside an allow-list of
   tags. The original goes to the private storage bucket under a name we
   generate — never the contributor's filename. The row is `pending`.
3. Nothing is public at this point. The `submissions` table has row level
   security on with no policy at all, so the public key can read nothing from it.
4. You sign in at `/admin`, read the converted text, write the title and teaser
   in both languages, pick country and theme, and publish.
5. That copies the essay into `entries`, which is the only table a browser can
   read. The page appears at `/essays/<slug>`.
6. **Take down** removes the entry and the page but keeps the submission.
   **Delete permanently** erases the row, the uploaded file and the published
   page. That is how the right of withdrawal on the ethics page is honoured.

---

## Editing

- **Header or footer** — edit `site/index.html`, then `python3 tools/sync-partials.py`.
  Essay pages pull the same blocks at render time, so they update by themselves.
- **Any visible string** — `assets/js/i18n.js`, keyed by `data-i18n` in the markup.
  Adding Kazakh, Kyrgyz, Tajik, Turkmen or Dari means copying the `uz` block,
  translating it, and adding the code to `LANGS`.

---

## Before it goes live

- Replace `hello@example.org` throughout.
- Have the ethics and consent text in `about.html` reviewed by someone with
  research ethics experience. It is a draft written for the project, not a
  vetted policy.
- Delete the placeholder entries in `assets/js/data.js`. They hide themselves
  once real stories exist, but they should not ship.
- Decide who besides you can read the Supabase project, and what happens to the
  archive if you stop running it. Contributors are trusting the project, not a
  person.
- Turn on Supabase's automatic backups.
- If the `service_role` key is ever exposed, rotate it in Project Settings → API.

## A choice you should know about

The Afghanistan flag on the site is the **2013–2021 tricolour**, not the flag of
the government in place since August 2021. That is the flag most of the diaspora
uses, including many of the women this archive is for. It is a political choice
and it is reversible in one file — see `site/assets/img/flags/CREDITS.md`.

## Images

Everything in `site/assets/img/` is either drawn for the project or downloaded
from Wikimedia Commons under a licence permitting reuse. `tools/fetch-craft-images.py`
re-fetches the craft photographs and rewrites their credits.

Two rules if you add more:

1. **Objects, not people.** On this site a photograph of a woman reads as a
   contributor. Using a stranger's portrait would be untrue and unfair to her.
2. **The credits block under the craft grid is a licence condition**, not
   decoration. CC BY and CC BY-SA require attribution. Do not remove it.

## Still to do
- Kazakh, Kyrgyz, Tajik, Turkmen and Dari translations
- A real map of Central Asia; the current one is a stylised tile layout
- Email notification when something arrives in the queue
