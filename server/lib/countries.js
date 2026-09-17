"use strict";
/* Kept in step with the COUNTRIES array in site/assets/js/i18n.js. */
const COUNTRIES = [
  { code: "kz", en: "Kazakhstan",   uz: "Qozog‘iston" },
  { code: "kg", en: "Kyrgyzstan",   uz: "Qirg‘iziston" },
  { code: "uz", en: "Uzbekistan",   uz: "O‘zbekiston" },
  { code: "tj", en: "Tajikistan",   uz: "Tojikiston" },
  { code: "tm", en: "Turkmenistan", uz: "Turkmaniston" },
  { code: "af", en: "Afghanistan",  uz: "Afg‘oniston" },
];

const THEMES = ["identity", "regions", "zines", "av", "info", "community", "publications"];
const FORMATS = ["text", "audio", "video", "zine", "info"];

const CODES = COUNTRIES.map(function (c) { return c.code; });
function name(code, lang) {
  const c = COUNTRIES.find(function (x) { return x.code === code; });
  return c ? (c[lang] || c.en) : code;
}

module.exports = { COUNTRIES, CODES, THEMES, FORMATS, name };
