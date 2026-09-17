"use strict";
/* A populated local preview: the fake Supabase from the test suite, seeded
   with a few published stories, plus the real app in front of it.

   Run with:  npm run demo        (http://localhost:3000)

   Nothing here touches a real Supabase project, and nothing is written to
   disk. It exists so the site can be seen working — and so the front end can
   be developed — before the project is set up. */

const crypto = require("crypto");
const { create } = require("./fake-supabase");

const FAKE_PORT = Number(process.env.FAKE_PORT) || 54321;
const PORT = Number(process.env.PORT) || 3000;

const BODY =
  "<p>This is demonstration text standing in for a contributor's essay. It is " +
  "not anyone's story.</p>" +
  "<h2>A section heading</h2>" +
  "<p>Word documents keep their headings, emphasis, lists and quotations. " +
  "Everything else is stripped out before it reaches a page.</p>" +
  "<blockquote>A quotation, carried over from the document's Quote style.</blockquote>" +
  "<h3>A sub-heading</h3>" +
  "<p>The contents rail on the left is built from these headings, whatever the " +
  "contributor happened to call them.</p>";

const SEED = [
  ["af", "identity", "The light goes at four",
   "On the first winter after arriving, and what a mother said about the cold.",
   "Soat to‘rtda yorug‘lik ketadi", "Kelgandan keyingi birinchi qish haqida."],
  ["uz", "info", "What the diploma was worth",
   "Eleven years of training, and the year spent finding out none of it counted here.",
   "Diplom nimaga arzidi", "O‘n bir yillik o‘qish va uning bu yerda sanalmasligi haqida."],
  ["kg", "av", "Three generations, one kitchen",
   "A grandmother, a mother and a daughter, recorded over one afternoon.",
   "Uch avlod, bitta oshxona", "Buvi, ona va qiz — bir tushda yozib olingan suhbat."],
  ["tj", "community", "Who actually helped",
   "Which services were useful, which were not, and what was missing entirely.",
   "Aslida kim yordam berdi", "Qaysi xizmatlar asqotdi va nima yetishmadi."],
];

const fake = create();
fake.server.listen(FAKE_PORT, function () {
  fake.addUser("moderator@example.org", "demo-password-1234");

  process.env.SUPABASE_URL = "http://127.0.0.1:" + FAKE_PORT;
  process.env.SUPABASE_ANON_KEY = "demo-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "demo-service-key";
  process.env.QURAMA_MODERATORS = "moderator@example.org";

  SEED.forEach(function (s, i) {
    const id = crypto.randomUUID();
    const when = new Date(Date.now() - i * 86400000).toISOString();
    fake.db.submissions.push({
      id: id, status: "published", created_at: when,
      name: "Demo contributor", email: "demo@example.org", country: s[0],
      html: BODY, words: 120, warnings: [],
    });
    fake.db.entries.push({
      id: id, slug: s[2].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      country: s[0], theme: s[1], format: "text", byline: "", noindex: true,
      published_at: when,
      title_en: s[2], teaser_en: s[3], title_uz: s[4], teaser_uz: s[5], html: BODY,
    });
  });

  // one waiting in the queue, so /admin has something to show
  fake.db.submissions.push({
    id: crypto.randomUUID(), status: "pending", created_at: new Date().toISOString(),
    name: "Someone new", email: "new@example.org", country: "tm", language: "English",
    note: "I would like to write about my mother's garden.",
    html: BODY, words: 120, warnings: [],
  });

  require("../server/app").listen(PORT, function () {
    console.log("Qurama demo on http://localhost:" + PORT);
    console.log("Moderation queue: http://localhost:" + PORT + "/admin");
    console.log("  sign in with  moderator@example.org  /  demo-password-1234");
    console.log("\nThis is a local fake. No real Supabase project is involved,");
    console.log("and nothing is saved when you stop it.\n");
  });
});
