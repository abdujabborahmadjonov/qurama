"use strict";
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

module.exports = {
  ROOT,
  SITE: path.join(ROOT, "site"),
};
