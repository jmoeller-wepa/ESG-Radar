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
