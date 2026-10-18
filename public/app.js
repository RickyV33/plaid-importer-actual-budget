// Shared page behavior. Every page works without it; this adds the theme
// switch, the language picker, local and relative times, the hero count-up,
// grow-in bars, expandable rows, and banner dismissal.
(function () {
  var root = document.documentElement;
  var lang = root.lang || "en";
  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var YEAR = 60 * 60 * 24 * 365;

  function setCookie(name, value) {
    document.cookie = name + "=" + encodeURIComponent(value) + "; path=/; max-age=" + YEAR + "; samesite=lax";
  }
  function getCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  // Day buckets on the server follow the browser's time zone.
  try {
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && getCookie("tz") !== tz) setCookie("tz", tz);
  } catch (e) {}

  // ── theme ──────────────────────────────────────────────────────
  var toggle = document.querySelector("[data-theme-toggle]");
  function paintToggle() {
    if (!toggle) return;
    var dark = root.dataset.theme === "dark";
    toggle.setAttribute("aria-pressed", String(dark));
    var label = toggle.querySelector("[data-theme-label]");
    if (label) label.textContent = dark ? toggle.dataset.labelLight : toggle.dataset.labelDark;
    var icon = toggle.querySelector("i");
    if (icon) icon.className = dark ? "fa-solid fa-sun" : "fa-solid fa-moon";
  }
  if (toggle) {
    paintToggle();
    toggle.addEventListener("click", function () {
      var next = root.dataset.theme === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem("pi-theme", next); } catch (e) { /* remembering is a convenience */ }
      paintToggle();
    });
  }

  // ── language ───────────────────────────────────────────────────
  document.querySelectorAll("[data-lang-select]").forEach(function (sel) {
    sel.addEventListener("change", function () {
      setCookie("lang", sel.value);
      location.reload();
    });
  });

  // ── times ──────────────────────────────────────────────────────
  // Server-side formatting uses the server's zone; redo it in the browser's.
  var abs = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
  document.querySelectorAll(".local-ts[data-ts]").forEach(function (el) {
    var ts = Number(el.dataset.ts);
    if (ts > 0) el.textContent = abs.format(new Date(ts));
  });
  var rel = window.Intl && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(lang, { numeric: "auto" }) : null;
  var STEPS = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  function relative(ts) {
    var secs = (ts - Date.now()) / 1000;
    for (var i = 0; i < STEPS.length; i++) {
      if (Math.abs(secs) >= STEPS[i][1]) return rel.format(Math.round(secs / STEPS[i][1]), STEPS[i][0]);
    }
    return rel.format(Math.round(secs / 60), "minute");
  }
  document.querySelectorAll(".rel-ts[data-ts]").forEach(function (el) {
    var ts = Number(el.dataset.ts);
    if (!(ts > 0)) return;
    el.title = abs.format(new Date(ts));
    if (rel) el.textContent = relative(ts);
  });

  // ── motion ─────────────────────────────────────────────────────
  if (!reduceMotion) {
    var num = new Intl.NumberFormat(lang);
    document.querySelectorAll("[data-count-to]").forEach(function (el) {
      var target = Number(el.dataset.countTo);
      if (!(target > 0)) return;
      var start;
      function tick(now) {
        // Time from the first frame: a frame's timestamp can predate this script.
        if (start === undefined) start = now;
        var x = Math.min(1, (now - start) / 900);
        el.textContent = num.format(Math.round(target * (1 - Math.pow(1 - x, 4))));
        if (x < 1) requestAnimationFrame(tick);
      }
      el.textContent = num.format(0);
      requestAnimationFrame(tick);
    });
  }
  // Two frames: the first paints the empty state, the second starts the transition.
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      document.querySelectorAll(".grow").forEach(function (el) { el.classList.add("grown"); });
    });
  });

  // ── expandable rows ────────────────────────────────────────────
  function flip(row) {
    var detail = document.getElementById(row.getAttribute("aria-controls"));
    if (!detail) return;
    var open = detail.hidden;
    detail.hidden = !open;
    row.setAttribute("aria-expanded", String(open));
  }
  document.querySelectorAll("[data-disclosure]").forEach(function (row) {
    row.addEventListener("click", function (e) {
      if (e.target.closest("a, button, input, select")) return;
      flip(row);
    });
    row.addEventListener("keydown", function (e) {
      if (e.target !== row) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(row); }
    });
  });

  // ── banners ────────────────────────────────────────────────────
  document.querySelectorAll("[data-dismiss-key]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      fetch("/banners/" + encodeURIComponent(btn.dataset.dismissKey) + "/dismiss", { method: "POST" });
      var notice = btn.closest(".notice");
      if (notice) notice.remove();
    });
  });
})();
