"use strict";
/* Creates a moderator account in Supabase Auth.

     npm run add-moderator

   Asks for an email and password here in the terminal, so the password is
   never typed into a browser form, a chat window, or a file. The account is
   created already confirmed, because there is no sign-up flow to confirm it
   through - sign-ups are meant to be switched off in this project.

   Being in Supabase Auth is not by itself enough to moderate: the address must
   also appear in QURAMA_MODERATORS. Two locks, deliberately. */

const readline = require("readline");
const { createClient } = require("@supabase/supabase-js");

const URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MODERATORS = (process.env.QURAMA_MODERATORS || "")
  .split(",").map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);

if (!URL || !SECRET) {
  console.error("\n  SUPABASE_URL and the secret key must be set in .env first.\n");
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(prompt) {
  return new Promise(function (resolve) { rl.question(prompt, resolve); });
}

// Same trick as a shell password prompt: swallow the echo while typing.
function askHidden(prompt) {
  return new Promise(function (resolve) {
    const original = rl._writeToOutput;
    rl.question(prompt, function (answer) {
      rl._writeToOutput = original;
      process.stdout.write("\n");
      resolve(answer);
    });
    rl._writeToOutput = function (chunk) {
      if (chunk.indexOf(prompt) === 0) original.call(rl, chunk);
    };
  });
}

async function main() {
  console.log("\nQurama - create a moderator account\n");

  const email = (await ask("Email: ")).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("\n  That does not look like an email address.\n");
    process.exit(1);
  }

  const password = await askHidden("Password (at least 12 characters): ");
  if (password.length < 12) {
    console.error("\n  Too short. This account can read every contributor's contact details.\n");
    process.exit(1);
  }
  const again = await askHidden("Again: ");
  if (password !== again) {
    console.error("\n  They do not match.\n");
    process.exit(1);
  }
  rl.close();

  const admin = createClient(URL, SECRET, { auth: { persistSession: false } });

  const existing = await admin.auth.admin.listUsers({ perPage: 200 });
  if (!existing.error) {
    const already = (existing.data.users || []).find(function (u) {
      return (u.email || "").toLowerCase() === email;
    });
    if (already) {
      const answer = (await new Promise(function (resolve) {
        const r = readline.createInterface({ input: process.stdin, output: process.stdout });
        r.question("\n  That account already exists. Reset its password? [y/N] ", function (a) {
          r.close(); resolve(a);
        });
      })).trim().toLowerCase();
      if (answer !== "y") {
        console.log("\n  Left alone.\n");
        process.exit(0);
      }
      const updated = await admin.auth.admin.updateUserById(already.id, { password: password });
      if (updated.error) {
        console.error("\n  Could not update: " + updated.error.message + "\n");
        process.exit(1);
      }
      console.log("\n  Password updated for " + email + "\n");
      return report(email);
    }
  }

  const created = await admin.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true,
  });
  if (created.error) {
    console.error("\n  Could not create the account: " + created.error.message + "\n");
    process.exit(1);
  }

  console.log("\n  Created " + email);
  report(email);
}

function report(email) {
  if (MODERATORS.indexOf(email) === -1) {
    console.log("");
    console.log("  One more step: this account cannot moderate yet.");
    console.log("  Add it to QURAMA_MODERATORS in .env and in your host's settings:");
    console.log("");
    console.log("      QURAMA_MODERATORS=" + (MODERATORS.concat([email]).join(",")));
    console.log("");
  } else {
    console.log("  It is already listed in QURAMA_MODERATORS, so it can sign in at /admin.");
    console.log("");
  }
}

main().catch(function (e) {
  console.error("\n  " + e.message + "\n");
  process.exit(1);
});
