"use strict";
/* Sets the moderator password. Run: npm run set-password */

const readline = require("readline");
const auth = require("./lib/auth");
const store = require("./lib/store");

store.ensureDirs();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Stop the password echoing to the terminal.
const originalWrite = rl._writeToOutput;
function hidden(prompt, cb) {
  rl.question(prompt, function (answer) {
    rl._writeToOutput = originalWrite;
    process.stdout.write("\n");
    cb(answer);
  });
  rl._writeToOutput = function (s) {
    if (s.startsWith(prompt)) originalWrite.call(rl, s);
  };
}

hidden("New moderator password: ", function (first) {
  if (first.length < 12) {
    console.error("Too short — use at least 12 characters.");
    process.exit(1);
  }
  hidden("Again: ", function (second) {
    if (first !== second) {
      console.error("They do not match.");
      process.exit(1);
    }
    auth.savePassword(first);
    console.log("Saved to data/admin.json (hashed with scrypt, readable only by you).");
    rl.close();
  });
});
