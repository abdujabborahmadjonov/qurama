/* ==========================================================================
   Shared behaviour: language switching, mobile nav, story filtering, form.
   No build step, no dependencies.
   ========================================================================== */
(function () {
  "use strict";

  const STORAGE_KEY = "qurama.lang";
  const DEFAULT_LANG = "en";

  /* ---------------- i18n ---------------- */

  function currentLang() {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* private mode */ }
    if (saved && I18N[saved]) return saved;
    const nav = (navigator.language || "").slice(0, 2).toLowerCase();
    return I18N[nav] ? nav : DEFAULT_LANG;
  }

  function t(key, lang) {
    const dict = I18N[lang] || I18N[DEFAULT_LANG];
    return key in dict ? dict[key] : (I18N[DEFAULT_LANG][key] || key);
  }

  function applyLang(lang) {
    document.documentElement.lang = lang;

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.innerHTML = t(el.getAttribute("data-i18n"), lang);
    });

    // data-i18n-attr="placeholder:some.key, aria-label:other.key"
    document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      el.getAttribute("data-i18n-attr").split(",").forEach(function (pair) {
        const bits = pair.split(":");
        if (bits.length === 2) el.setAttribute(bits[0].trim(), t(bits[1].trim(), lang));
      });
    });

    document.querySelectorAll("[data-lang-btn]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-lang-btn") === lang));
    });

    document.dispatchEvent(new CustomEvent("langchange", { detail: { lang: lang } }));
  }

  function setLang(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
    applyLang(lang);
  }

  /* ---------------- header ---------------- */

  function initHeader() {
    const toggle = document.querySelector(".nav-toggle");
    const nav = document.getElementById("primary-nav");
    if (toggle && nav) {
      const sync = function () {
        const mobile = window.matchMedia("(max-width: 820px)").matches;
        nav.hidden = mobile && toggle.getAttribute("aria-expanded") !== "true";
      };
      toggle.addEventListener("click", function () {
        const open = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!open));
        sync();
      });
      window.addEventListener("resize", sync);
      sync();
    }

    document.querySelectorAll("[data-lang-btn]").forEach(function (btn) {
      btn.addEventListener("click", function () { setLang(btn.getAttribute("data-lang-btn")); });
    });

    // mark the current page in the nav
    const here = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll("#primary-nav a").forEach(function (a) {
      if (a.getAttribute("href") === here) a.setAttribute("aria-current", "page");
    });
  }

  /* ---------------- cards ---------------- */

  // Real published essays take over from the placeholder seed automatically.
  function archive() {
    if (typeof PUBLISHED_ENTRIES !== "undefined" && PUBLISHED_ENTRIES.length) return PUBLISHED_ENTRIES;
    return typeof STORIES !== "undefined" ? STORIES : [];
  }

  // Notices that only apply while the archive is still showing placeholders.
  function syncPlaceholderNotices() {
    const real = typeof PUBLISHED_ENTRIES !== "undefined" && PUBLISHED_ENTRIES.length > 0;
    document.querySelectorAll(".only-placeholders").forEach(function (el) { el.hidden = real; });
  }

  function countryName(code, lang) {
    const c = COUNTRIES.find(function (x) { return x.code === code; });
    return c ? (c[lang] || c.en) : code;
  }

  function prefix() {
    return location.pathname.indexOf("/essays/") !== -1 ? "../" : "";
  }

  function storyCard(item, lang) {
    const copy = item[lang] || item.en;
    const el = document.createElement(item.url ? "a" : "article");
    el.className = "card";
    if (item.url) el.setAttribute("href", prefix() + item.url);
    if (item.country) el.setAttribute("data-country", item.country);

    const parts = [];
    if (!item.url) parts.push('<span class="badge-placeholder">Placeholder</span>');
    parts.push('<div class="card__rule"></div>');
    parts.push("<h3>" + copy.title + "</h3>");
    parts.push("<p>" + copy.teaser + "</p>");

    const meta = [];
    if (item.country) meta.push('<span class="tag">' + countryName(item.country, lang) + "</span>");
    if (item.format)  meta.push('<span class="tag tag--flag">' + t("format." + item.format, lang) + "</span>");
    if (item.theme)   meta.push('<span class="tag tag--flag">' + t("theme." + item.theme, lang) + "</span>");
    if (meta.length)  parts.push('<div class="card__meta">' + meta.join("") + "</div>");

    el.innerHTML = parts.join("");
    return el;
  }

  function renderList(target, items, lang) {
    target.innerHTML = "";
    items.forEach(function (item) { target.appendChild(storyCard(item, lang)); });
  }

  /* ---------------- stories page ---------------- */

  function initStories() {
    const grid = document.getElementById("story-grid");
    if (!grid) return;

    const countEl = document.getElementById("story-count");
    const emptyEl = document.getElementById("story-empty");
    const state = { country: "all", theme: "all", format: "all" };

    // deep link: stories.html?country=uz
    const params = new URLSearchParams(location.search);
    ["country", "theme", "format"].forEach(function (k) {
      if (params.get(k)) state[k] = params.get(k);
    });

    function matches(s) {
      return (state.country === "all" || s.country === state.country) &&
             (state.theme   === "all" || s.theme   === state.theme) &&
             (state.format  === "all" || s.format  === state.format);
    }

    function draw() {
      const lang = document.documentElement.lang || DEFAULT_LANG;
      const shown = archive().filter(matches);
      renderList(grid, shown, lang);
      if (countEl) {
        const key = shown.length === 1 && ("stories.count.one" in (I18N[lang] || {}))
          ? "stories.count.one" : "stories.count";
        countEl.textContent = t(key, lang).replace("{n}", shown.length);
      }
      if (emptyEl) emptyEl.hidden = shown.length > 0;

      document.querySelectorAll(".chip[data-filter]").forEach(function (chip) {
        const group = chip.getAttribute("data-filter");
        chip.setAttribute("aria-pressed", String(state[group] === chip.getAttribute("data-value")));
      });
    }

    document.querySelectorAll(".chip[data-filter]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        state[chip.getAttribute("data-filter")] = chip.getAttribute("data-value");
        draw();
      });
    });

    document.addEventListener("langchange", draw);
    draw();
  }

  /* ---------------- simple lists (home + resources) ---------------- */

  function initSimpleLists() {
    const blocks = [
      { id: "featured-grid", data: function () { return archive().slice(0, 3); } },
      { id: "orgs-grid",     data: function () { return RESOURCE_ORGS; } },
      { id: "pubs-grid",     data: function () { return RESOURCE_PUBS; } },
    ];
    blocks.forEach(function (b) {
      const el = document.getElementById(b.id);
      if (!el) return;
      const draw = function () { renderList(el, b.data(), document.documentElement.lang || DEFAULT_LANG); };
      document.addEventListener("langchange", draw);
      draw();
    });
  }

  /* ---------------- share form ---------------- */

  function initForm() {
    const form = document.getElementById("share-form");
    if (!form) return;
    const status = document.getElementById("share-status");
    const button = form.querySelector('button[type="submit"]');

    function say(kind, key, fallback) {
      const lang = document.documentElement.lang || DEFAULT_LANG;
      status.hidden = false;
      status.className = "form-status form-status--" + kind;
      status.textContent = key ? t(key, lang) : fallback;
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!form.consent.checked) return say("err", "share.err.consent");

      const data = new FormData(form);
      data.set("consent", form.consent.checked ? "yes" : "no");
      if (form.essay && form.essay.files.length === 0) data.delete("essay");

      button.disabled = true;
      say("busy", "share.status.sending");
      try {
        const res = await fetch("/api/submissions", { method: "POST", body: data });
        const out = await res.json();
        if (out.ok) {
          form.reset();
          say("ok", null, t("share.status.sent", document.documentElement.lang || DEFAULT_LANG)
            .replace("{ref}", out.reference));
        } else {
          say("err", "share.err." + out.error, t("share.err.generic", document.documentElement.lang || DEFAULT_LANG));
        }
      } catch (_) {
        // Opened from the file system, or the server is down.
        say("err", "share.err.offline");
      } finally {
        button.disabled = false;
      }
    });
  }


  /* ---------------- editorial: featured story ---------------- */

  function initFeatured() {
    const host = document.getElementById("featured-story");
    if (!host) return;

    function draw() {
      const lang = document.documentElement.lang || DEFAULT_LANG;
      const items = archive().filter(function (i) { return i.url; });
      if (!items.length) { host.hidden = true; return; }
      host.hidden = false;

      const item = items[0];
      const copy = item[lang] || item.en;
      host.innerHTML =
        '<a class="featured" href="' + prefix() + item.url + '" data-country="' + item.country + '"' +
          ' style="--motif:url(' + prefix() + "assets/img/country/" + item.country + '.svg)">' +
          '<div class="featured__art"><span class="motif" aria-hidden="true"></span></div>' +
          '<div class="featured__text">' +
            '<p class="featured__kicker">' + t("home.featured.kicker", lang) + " · " +
              countryName(item.country, lang) + "</p>" +
            "<h3>" + copy.title + "</h3><p>" + copy.teaser + "</p>" +
          "</div></a>";
    }

    document.addEventListener("langchange", draw);
    draw();
  }

  /* ---------------- editorial: essay reading aids ---------------- */

  function initEssay() {
    const body = document.querySelector(".essay__body");
    if (!body) return;

    // progress bar
    const bar = document.querySelector(".reading-progress");
    if (bar) {
      const update = function () {
        const start = body.offsetTop;
        const span = body.offsetHeight - window.innerHeight + 120;
        const done = span > 0 ? (window.scrollY - start + 120) / span : 1;
        bar.style.width = Math.max(0, Math.min(1, done)) * 100 + "%";
      };
      window.addEventListener("scroll", update, { passive: true });
      window.addEventListener("resize", update);
      update();
    }

    // contents, built from whatever headings the document turned out to have
    const toc = document.getElementById("toc");
    const headings = Array.prototype.slice.call(body.querySelectorAll("h2, h3"));
    if (toc && headings.length >= 2) {
      const lang = document.documentElement.lang || DEFAULT_LANG;
      const items = headings.map(function (h, i) {
        if (!h.id) h.id = "section-" + (i + 1);
        return '<li' + (h.tagName === "H3" ? ' class="toc--sub"' : "") + '>' +
               '<a href="#' + h.id + '">' + h.textContent + "</a></li>";
      });
      toc.innerHTML = '<p class="toc__label">' + t("essay.contents", lang) + "</p><ol>" + items.join("") + "</ol>";

      const links = Array.prototype.slice.call(toc.querySelectorAll("a"));
      const mark = function (id) {
        links.forEach(function (a) {
          a.setAttribute("aria-current", String(a.getAttribute("href") === "#" + id));
        });
      };
      if ("IntersectionObserver" in window) {
        const seen = new Set();
        const io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) seen.add(e.target.id); else seen.delete(e.target.id);
          });
          const first = headings.filter(function (h) { return seen.has(h.id); })[0];
          if (first) mark(first.id);
        }, { rootMargin: "-80px 0px -70% 0px" });
        headings.forEach(function (h) { io.observe(h); });
      }
    } else if (toc) {
      toc.hidden = true;
    }

    // related stories: same country first, then same theme
    const related = document.getElementById("related-grid");
    if (related) {
      const here = document.body.getAttribute("data-entry-id");
      const drawRelated = function () {
        const lang = document.documentElement.lang || DEFAULT_LANG;
        const others = archive().filter(function (i) { return i.url && i.id !== here; });
        const mine = archive().find(function (i) { return i.id === here; }) || {};
        const ranked = others.sort(function (a, b) {
          const score = function (x) {
            return (x.country === mine.country ? 2 : 0) + (x.theme === mine.theme ? 1 : 0);
          };
          return score(b) - score(a);
        }).slice(0, 3);
        related.parentElement.hidden = ranked.length === 0;
        renderList(related, ranked, lang);
      };
      document.addEventListener("langchange", drawRelated);
      drawRelated();
    }
  }

  /* ---------------- boot ---------------- */

  document.addEventListener("DOMContentLoaded", function () {
    applyLang(currentLang());
    syncPlaceholderNotices();
    initHeader();
    initStories();
    initSimpleLists();
    initFeatured();
    initEssay();
    initForm();
  });
})();
