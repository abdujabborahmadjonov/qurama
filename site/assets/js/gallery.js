/* ==========================================================================
   Gallery: photo essays and travel photographs, by country.
   Reads /api/gallery. Used on gallery.html and on the home page teaser.
   ========================================================================== */
(function () {
  "use strict";

  const NAMES = {
    kz: { en: "Kazakhstan", uz: "Qozog‘iston" }, kg: { en: "Kyrgyzstan", uz: "Qirg‘iziston" },
    uz: { en: "Uzbekistan", uz: "O‘zbekiston" }, tj: { en: "Tajikistan", uz: "Tojikiston" },
    tm: { en: "Turkmenistan", uz: "Turkmaniston" },
  };
  let POSTS = null;

  function lang() { return document.documentElement.lang === "uz" ? "uz" : "en"; }
  function tr(key) {
    const all = typeof I18N !== "undefined" ? I18N : {};
    const d = all[lang()] || {};
    return d[key] || (all.en || {})[key] || key;
  }
  function pick(p, field) { return (lang() === "uz" && p[field + "_uz"]) || p[field + "_en"] || ""; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function paragraphs(text) {
    return String(text || "").split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean)
      .map(function (p) { return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>"; }).join("");
  }

  async function load() {
    if (POSTS) return POSTS;
    try {
      const r = await fetch("/api/gallery");
      const d = await r.json();
      POSTS = (d && d.posts) || [];
    } catch (_) { POSTS = []; }
    return POSTS;
  }

  function card(p) {
    const a = document.createElement("a");
    a.className = "gcard";
    a.href = "gallery.html?post=" + encodeURIComponent(p.id);
    a.setAttribute("data-country", p.country);
    a.innerHTML =
      '<div class="gcard__img">' + (p.cover_url ? '<img loading="lazy" alt="" src="' + esc(p.cover_url) + '">' : "") +
      '<span class="gcard__count">' + p.photos.length + " " + esc(tr("gallery.photos")) + "</span></div>" +
      '<div class="gcard__body"><span class="gcard__meta"><img class="flag" src="assets/img/flags/' + p.country + '.svg" alt="" height="14">' +
      esc(NAMES[p.country][lang()]) + " · " + esc(tr(p.kind === "essay" ? "gallery.kind.essay" : "gallery.kind.travel")) + "</span>" +
      "<h3>" + esc(pick(p, "title")) + "</h3>" + (p.place ? '<span class="gcard__place">' + esc(p.place) + "</span>" : "") + "</div>";
    return a;
  }

  /* ---------- index ---------- */
  function initIndex() {
    const grid = document.getElementById("gallery-grid");
    if (!grid) return;
    const params = new URLSearchParams(location.search);
    const state = { country: params.get("country") || "all", kind: params.get("kind") || "all" };

    function draw() {
      const items = (POSTS || []).filter(function (p) {
        return (state.country === "all" || p.country === state.country) && (state.kind === "all" || p.kind === state.kind);
      });
      grid.innerHTML = "";
      items.forEach(function (p) { grid.appendChild(card(p)); });
      document.getElementById("gallery-empty").hidden = items.length > 0;
      document.querySelectorAll(".chip[data-gfilter]").forEach(function (c) {
        c.setAttribute("aria-pressed", String(state[c.dataset.gfilter] === c.dataset.value));
      });
    }
    document.querySelectorAll(".chip[data-gfilter]").forEach(function (c) {
      c.addEventListener("click", function () {
        state[c.dataset.gfilter] = c.dataset.value;
        const q = new URLSearchParams();
        if (state.country !== "all") q.set("country", state.country);
        if (state.kind !== "all") q.set("kind", state.kind);
        history.replaceState(null, "", "gallery.html" + (q.toString() ? "?" + q : ""));
        draw();
      });
    });

    const postId = params.get("post");
    load().then(function () {
      if (postId) {
        const p = POSTS.find(function (x) { return x.id === postId; });
        if (p) return showPost(p);
      }
      draw();
    });
    document.addEventListener("langchange", function () {
      if (!POSTS) return;
      const open = document.getElementById("gallery-post");
      if (!open.hidden && open.dataset.id) {
        const p = POSTS.find(function (x) { return x.id === open.dataset.id; });
        if (p) return showPost(p);
      }
      draw();
    });
  }

  /* ---------- a single post ---------- */
  function showPost(p) {
    document.getElementById("gallery-index").hidden = true;
    const hero = document.querySelector(".gallery-hero"); if (hero) hero.hidden = true;
    const el = document.getElementById("gallery-post");
    el.hidden = false; el.dataset.id = p.id; el.setAttribute("data-country", p.country);
    document.title = pick(p, "title") + " — Qurama";
    const photos = p.photos.map(function (ph, i) {
      const cap = pick(ph, "caption");
      return '<figure class="gpost__photo"><button type="button" data-i="' + i + '"><img loading="lazy" alt="' + esc(cap) + '" src="' + esc(ph.url) + '"></button>' +
        (cap ? "<figcaption>" + esc(cap) + "</figcaption>" : "") + "</figure>";
    }).join("");
    el.innerHTML = '<div class="wrap">' +
      '<a class="gpost__back" href="gallery.html?country=' + p.country + '">← ' + esc(tr("gallery.back")) + "</a>" +
      '<p class="eyebrow"><img class="flag" src="assets/img/flags/' + p.country + '.svg" alt="" height="14"> ' +
      esc(NAMES[p.country][lang()]) + " · " + esc(tr(p.kind === "essay" ? "gallery.kind.essay" : "gallery.kind.travel")) +
      (p.place ? " · " + esc(p.place) : "") + "</p>" +
      '<h1 class="gpost__title">' + esc(pick(p, "title")) + "</h1>" +
      (p.byline ? '<p class="gpost__by">' + esc(tr("gallery.by")) + " " + esc(p.byline) + "</p>" : "") +
      '<div class="gpost__intro prose">' + paragraphs(pick(p, "intro")) + "</div>" +
      '<div class="gpost__photos gpost__photos--' + p.kind + '">' + photos + "</div></div>";
    el.querySelectorAll(".gpost__photo button").forEach(function (b) {
      b.addEventListener("click", function () { openBox(p, Number(b.dataset.i)); });
    });
    window.scrollTo(0, 0);
  }

  /* ---------- lightbox ---------- */
  let box = { p: null, i: 0, last: null };
  function drawBox() {
    const lb = document.getElementById("lightbox");
    const ph = box.p.photos[box.i];
    lb.querySelector("img").src = ph.url;
    lb.querySelector("img").alt = pick(ph, "caption");
    lb.querySelector("figcaption").textContent = pick(ph, "caption") + "  " + (box.i + 1) + " / " + box.p.photos.length;
  }
  function openBox(p, i) {
    box = { p: p, i: i, last: document.activeElement };
    const lb = document.getElementById("lightbox");
    lb.hidden = false; document.body.style.overflow = "hidden";
    drawBox(); lb.querySelector(".lightbox__close").focus();
  }
  function closeBox() {
    document.getElementById("lightbox").hidden = true; document.body.style.overflow = "";
    if (box.last) box.last.focus();
  }
  function step(d) { box.i = (box.i + d + box.p.photos.length) % box.p.photos.length; drawBox(); }
  function initBox() {
    const lb = document.getElementById("lightbox");
    if (!lb) return;
    lb.querySelector(".lightbox__close").addEventListener("click", closeBox);
    lb.querySelector(".lightbox__nav--prev").addEventListener("click", function () { step(-1); });
    lb.querySelector(".lightbox__nav--next").addEventListener("click", function () { step(1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) closeBox(); });
    document.addEventListener("keydown", function (e) {
      if (lb.hidden) return;
      if (e.key === "Escape") closeBox();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    });
    let x0 = null;
    lb.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
    });
  }

  /* ---------- home teaser ---------- */
  function initHome() {
    const grid = document.getElementById("home-gallery-grid");
    if (!grid) return;
    function draw() {
      grid.innerHTML = "";
      POSTS.slice(0, 3).forEach(function (p) { grid.appendChild(card(p)); });
      document.getElementById("home-gallery").hidden = POSTS.length === 0;
    }
    load().then(draw);
    document.addEventListener("langchange", function () { if (POSTS) draw(); });
  }

  initIndex(); initBox(); initHome();
})();
