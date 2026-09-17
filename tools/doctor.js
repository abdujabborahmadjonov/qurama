"use strict";
/* Checks that a Supabase project is set up the way Qurama needs it.

     npm run doctor

   Reads .env, verifies each requirement in turn, and says exactly what to do
   about anything that is wrong. It only reads; it changes nothing. */

const { createClient } = require("@supabase/supabase-js");

const URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MODERATORS = (process.env.QURAMA_MODERATORS || "")
  .split(",").map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);

const TIMEOUT_MS = Number(process.env.QURAMA_DOCTOR_TIMEOUT || 12000);

let failures = 0;
let warnings = 0;

/* Every check is wrapped in this. The Supabase client retries on its own, so
   an unreachable project or a wrong key would otherwise leave the script
   hanging with no output, which is the least useful thing a doctor can do. */
function within(promise, label) {
  let timer;
  const limit = new Promise(function (_, reject) {
    timer = setTimeout(function () {
      reject(new Error(label + " timed out after " + (TIMEOUT_MS / 1000) + "s"));
    }, TIMEOUT_MS);
  });
  return Promise.race([Promise.resolve(promise), limit])
    .finally(function () { clearTimeout(timer); });
}

// Supabase calls resolve with {error} rather than rejecting; a timeout rejects.
// Normalise both into the same shape so each check reads the same way.
async function attempt(promise, label) {
  try {
    return await within(promise, label);
  } catch (e) {
    return { error: { message: e.message } };
  }
}

function ok(message, detail) {
  console.log("  ok    " + message + (detail ? "  (" + detail + ")" : ""));
}
function bad(message, fix) {
  failures += 1;
  console.log("  FAIL  " + message);
  if (fix) console.log("        -> " + fix);
}
function warn(message, fix) {
  warnings += 1;
  console.log("  warn  " + message);
  if (fix) console.log("        -> " + fix);
}

function done() {
  console.log("");
  if (failures) {
    console.log("  " + failures + " problem(s)" + (warnings ? ", " + warnings + " warning(s)" : "") +
                " - fix the FAIL lines above, then run this again.");
  } else if (warnings) {
    console.log("  Ready, with " + warnings + " warning(s).");
  } else {
    console.log("  Everything checks out. You can deploy.");
  }
  console.log("");
  process.exit(failures ? 1 : 0);
}

async function main() {
  console.log("");
  console.log("Qurama - checking your Supabase project");
  console.log("");

  /* ---------------------------------------------------- configuration ---- */
  console.log("configuration");

  if (!URL) {
    bad("SUPABASE_URL is not set", "copy .env.example to .env and fill it in");
    return done();
  }
  if (/\/rest\/v1/.test(process.env.SUPABASE_URL || "")) {
    bad("SUPABASE_URL contains a REST path",
        "use just the origin, e.g. https://abcdefgh.supabase.co");
  } else {
    ok("SUPABASE_URL", URL);
  }

  if (!PUB) bad("publishable key is not set", "Settings > API Keys > publishable (sb_publishable_...)");
  else ok("publishable key", PUB.slice(0, 18) + "...");

  if (!SECRET) bad("secret key is not set", "Settings > API Keys > secret (sb_secret_...)");
  else ok("secret key", SECRET.slice(0, 14) + "... (this one must never be committed)");

  if (!MODERATORS.length) bad("QURAMA_MODERATORS is empty", "add the email you will sign in to /admin with");
  else ok("moderators", MODERATORS.join(", "));

  if (failures) return done();

  const admin = createClient(URL, SECRET, { auth: { persistSession: false } });
  const anon = createClient(URL, PUB, { auth: { persistSession: false } });

  /* ------------------------------------------------------- connection ---- */
  console.log("");
  console.log("connection");
  try {
    const { error } = await attempt(admin.from("submissions").select("id").limit(1), "connecting");
    if (error && /Invalid API key|JWT|invalid/i.test(error.message)) {
      bad("the secret key was rejected", "check you copied the secret key, not the publishable one");
      return done();
    }
    if (error && /does not exist|schema cache|relation/i.test(error.message)) {
      bad("connected, but there is no `submissions` table",
          "Dashboard > SQL Editor > New query > paste all of supabase/schema.sql > Run");
    } else if (error) {
      bad("unexpected error: " + error.message);
    } else {
      ok("connected, and `submissions` exists");
    }
  } catch (e) {
    bad("could not reach " + URL, e.message);
    return done();
  }

  /* ----------------------------------------------------------- tables ---- */
  console.log("");
  console.log("tables");
  for (const table of ["submissions", "entries"]) {
    const { error } = await attempt(admin.from(table).select("id").limit(1), "reading " + table);
    if (error) bad("`" + table + "` is missing or unreadable", "run supabase/schema.sql");
    else ok("`" + table + "`");
  }

  /* -------------------------------------------- the part that matters ---- */
  console.log("");
  console.log("row level security");
  /* With RLS on and no policy, PostgREST answers 200 with an empty array - the
     rows are filtered out rather than refused. So "no error, no rows" is the
     pass. An *error* means we could not check at all, which must never be
     reported as a pass: a false all-clear here is worse than no check. */
  const sub = await attempt(anon.from("submissions").select("id,email").limit(1), "public read of submissions");
  if (sub.error) {
    warn("could not verify that `submissions` is private: " + sub.error.message,
         "re-run once the project is reachable - do not deploy until this line reads ok");
  } else if (Array.isArray(sub.data) && sub.data.length > 0) {
    bad("THE PUBLIC KEY CAN READ `submissions` - contributor emails are exposed",
        "run supabase/schema.sql, which enables RLS with no policy on that table");
  } else {
    ok("the public key cannot read `submissions`", "this is the check that matters most");
  }
  const ent = await attempt(anon.from("entries").select("id").limit(1), "public read of entries");
  if (ent.error) {
    warn("the public key cannot read `entries` either, so the archive will look empty",
         "check the 'entries are publicly readable' policy exists");
  } else {
    ok("the public key can read `entries`");
  }

  /* ---------------------------------------------------------- storage ---- */
  console.log("");
  console.log("storage");
  const buckets = await attempt(admin.storage.listBuckets(), "listing storage buckets");
  if (buckets.error) {
    bad("could not list buckets: " + buckets.error.message);
  } else {
    const essays = (buckets.data || []).find(function (b) { return b.id === "essays"; });
    if (!essays) {
      bad("the `essays` bucket is missing", "run supabase/schema.sql");
    } else if (essays.public) {
      bad("the `essays` bucket is PUBLIC - uploaded documents would be world-readable",
          "Storage > essays > settings > make it private");
    } else {
      ok("the `essays` bucket exists and is private");
    }
  }

  /* ------------------------------------------------ moderator accounts ---- */
  console.log("");
  console.log("moderator sign-in");
  const users = await attempt(admin.auth.admin.listUsers({ perPage: 200 }), "listing users");
  if (users.error || !users.data) {
    warn("could not list users: " + (users.error ? users.error.message : "no response"));
  } else {
    const all = users.data.users || [];
    const emails = all.map(function (u) { return (u.email || "").toLowerCase(); });

    for (const m of MODERATORS) {
      const user = all.find(function (u) { return (u.email || "").toLowerCase() === m; });
      if (!user) {
        bad("no Supabase account exists for " + m, "npm run add-moderator");
      } else if (!user.email_confirmed_at && !user.confirmed_at) {
        warn(m + " exists but is unconfirmed", "confirm it in Authentication > Users");
      } else {
        ok(m + " can sign in");
      }
    }

    const strangers = emails.filter(function (e) { return e && MODERATORS.indexOf(e) === -1; });
    if (strangers.length) {
      warn(strangers.length + " other account(s) exist in this project: " + strangers.slice(0, 5).join(", "),
           "they cannot moderate, but consider turning sign-ups off: Authentication > Providers > Email");
    }
  }

  done();
}

main().catch(function (e) {
  console.error("");
  console.error("  doctor crashed: " + e.message);
  console.error("");
  process.exit(1);
});
