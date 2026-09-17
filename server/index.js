"use strict";
/* Long-lived process: local development, Livops, a VPS. */

const app = require("./app");
const auth = require("./lib/auth");
const supabase = require("./lib/supabase");

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, function () {
  console.log("Qurama running on http://localhost:" + PORT);
  console.log("Moderation queue: http://localhost:" + PORT + "/admin");
  if (!supabase.configured()) {
    console.log("\n  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — uploads are disabled.");
    console.log("  Copy .env.example to .env and fill it in, then restart.\n");
  } else if (!auth.isConfigured()) {
    console.log("\n  QURAMA_MODERATORS is empty, so nobody can sign in to the queue.\n");
  }
});
