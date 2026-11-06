/* Light / dark mode. Loaded in <head> (not deferred) so the saved choice applies before the page paints.
   The header button cycles Auto (follows the computer's setting) → Light → Dark. */
(function () {
  const KEY = "radar.theme";
  const get = () => { try { return localStorage.getItem(KEY) || "auto"; } catch (e) { return "auto"; } };
  const apply = (t) => { if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };
  apply(get());
  const ICON = {
    auto: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="M10 3.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" stroke="none"/></svg>',
    light: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="3.6"/><path d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 12.3A7 7 0 0 1 7.7 3.5a7 7 0 1 0 8.8 8.8z"/></svg>',
  };
  const LABEL = { auto: "Theme: automatic (follows your computer)", light: "Theme: light", dark: "Theme: dark" };
  function addButton() {
    const host = document.querySelector("header .wrap"); if (!host || host.querySelector(".th-btn")) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "th-btn";
    const set = (t) => { b.innerHTML = ICON[t]; b.title = LABEL[t] + " – click to change"; b.setAttribute("aria-label", LABEL[t] + ". Click to change."); };
    set(get());
    b.addEventListener("click", () => {
      const next = { auto: "light", light: "dark", dark: "auto" }[get()];
      try { localStorage.setItem(KEY, next); } catch (e) {}
      apply(next); set(next);
      document.dispatchEvent(new CustomEvent("radar:theme", { detail: next }));
    });
    const meta = host.querySelector("#meta, .meta");
    if (meta) meta.before(b); else host.appendChild(b);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addButton); else addButton();
})();

/* Collapsible side panel (desktop). The pages rebuild the panel's contents, so the button is put back whenever it goes missing. */
(function () {
  const KEY = "radar.sideMin";
  const get = () => { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } };
  if (get()) document.documentElement.classList.add("side-min");
  const ICON_HIDE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2.5"/><path d="M7.5 3.5v13M13 8l-2 2 2 2"/></svg>';
  const ICON_SHOW = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2.5"/><path d="M7.5 3.5v13M11 8l2 2-2 2"/></svg>';
  function make() {
    const b = document.createElement("button"); b.type = "button"; b.className = "side-min-btn";
    const set = () => { const min = document.documentElement.classList.contains("side-min");
      b.innerHTML = (min ? ICON_SHOW : ICON_HIDE) + "<span>Hide panel</span>";
      b.title = min ? "Show the side panel" : "Hide the side panel"; b.setAttribute("aria-label", b.title); b.setAttribute("aria-expanded", String(!min)); };
    set();
    b.addEventListener("click", () => {
      const min = document.documentElement.classList.toggle("side-min");
      try { localStorage.setItem(KEY, min ? "1" : "0"); } catch (e) {}
      set();
      // charts size themselves to their box: let them redraw at the new width
      setTimeout(() => window.dispatchEvent(new Event("resize")), 200);
    });
    return b;
  }
  function init() {
    const side = document.querySelector("main.layout > .side"); if (!side) return;
    const ensure = () => { if (!side.querySelector(":scope > .side-min-btn")) side.prepend(make()); };
    ensure();
    new MutationObserver(ensure).observe(side, { childList: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

/* Chart helpers shared by all pages: smooth lines and soft gradient areas (shadcn-style area charts).
   RadarViz.path(points) → SVG path through [x, y] points (monotone curve: no overshoot beyond the data).
   RadarViz.area(svg, points, baseY, color, strength) → adds a gradient fill from the line down to baseY. */
window.RadarViz = (function () {
  const NS = "http://www.w3.org/2000/svg";
  let uid = 0;
  function path(p) {
    const n = p.length; if (!n) return "";
    if (n === 1) return "M" + p[0][0].toFixed(1) + " " + p[0][1].toFixed(1);
    if (n === 2) return "M" + p[0][0].toFixed(1) + " " + p[0][1].toFixed(1) + "L" + p[1][0].toFixed(1) + " " + p[1][1].toFixed(1);
    // monotone cubic (Fritsch–Carlson) tangents
    const dx = [], s = [], m = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; s[i] = dx[i] ? (p[i + 1][1] - p[i][1]) / dx[i] : 0; }
    m[0] = s[0]; m[n - 1] = s[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (!s[i]) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / s[i], b = m[i + 1] / s[i], h = a * a + b * b;
      if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * s[i]; m[i + 1] = t * b * s[i]; }
    }
    let d = "M" + p[0][0].toFixed(1) + " " + p[0][1].toFixed(1);
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += "C" + (p[i][0] + h).toFixed(1) + " " + (p[i][1] + m[i] * h).toFixed(1) + " " + (p[i + 1][0] - h).toFixed(1) + " " + (p[i + 1][1] - m[i + 1] * h).toFixed(1) + " " + p[i + 1][0].toFixed(1) + " " + p[i + 1][1].toFixed(1);
    }
    return d;
  }
  function gradient(svg, color, strength) {
    let defs = svg.querySelector(":scope > defs");
    if (!defs) { defs = document.createElementNS(NS, "defs"); svg.insertBefore(defs, svg.firstChild); }
    const id = "rv-g" + (++uid);
    const g = document.createElementNS(NS, "linearGradient");
    g.setAttribute("id", id); g.setAttribute("x1", "0"); g.setAttribute("y1", "0"); g.setAttribute("x2", "0"); g.setAttribute("y2", "1");
    [[0, strength], [1, 0]].forEach(([o, a]) => { const st = document.createElementNS(NS, "stop"); st.setAttribute("offset", String(o)); st.setAttribute("style", "stop-color:" + color + ";stop-opacity:" + a); g.appendChild(st); });
    defs.appendChild(g);
    return "url(#" + id + ")";
  }
  function area(svg, p, baseY, color, strength, before) {
    if (!p || p.length < 2) return null;
    const a = document.createElementNS(NS, "path");
    a.setAttribute("d", path(p) + "L" + p[p.length - 1][0].toFixed(1) + " " + baseY.toFixed(1) + "L" + p[0][0].toFixed(1) + " " + baseY.toFixed(1) + "Z");
    a.setAttribute("fill", gradient(svg, color, strength == null ? 0.28 : strength));
    a.setAttribute("stroke", "none"); a.setAttribute("class", "rv-area"); a.setAttribute("aria-hidden", "true");
    if (before && before.parentNode === svg) svg.insertBefore(a, before); else svg.appendChild(a);
    return a;
  }
  return { path, area };
})();
