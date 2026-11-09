/* Settings button in the header ("Look"): theme, page background (gradients), gradient strength, cards, corners,
   spacing and section icons. Saved per browser in localStorage "radar.look.v1".
   Loaded in <head> (not deferred) so the saved look applies before the page paints; theme.css holds the styles
   (html[data-lk-*] attributes). The settings panel also takes over light/dark, so the separate theme button is hidden. */
(function () {
  const KEY = "radar.look.v1", TKEY = "radar.theme";
  const DEF = { bg: "aurora", gi: "s", card: "shadow", r: "l", d: "airy", ic: "on" };
  const root = document.documentElement;
  const load = () => { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { return Object.assign({}, DEF); } };
  let st = load();
  const apply = () => { for (const k in DEF) root.setAttribute("data-lk-" + k, st[k]); };
  apply();

  const BG = [["off", "Off"], ["aurora", "Aurora"], ["mist", "Mist"], ["sweep", "Sweep"], ["horizon", "Horizon"], ["mesh", "Mesh"], ["diag", "Diagonal"], ["corners", "Corners"], ["floor", "Floor"]];
  const ROWS = [
    { k: "gi", name: "Gradient strength", opts: [["s", "Subtle"], ["m", "Medium"], ["l", "Strong"]] },
    { k: "card", name: "Cards", opts: [["border", "Border"], ["shadow", "Shadow"], ["flat", "Flat"]] },
    { k: "r", name: "Corners", opts: [["s", "Small"], ["m", "Medium"], ["l", "Large"]] },
    { k: "d", name: "Spacing", opts: [["normal", "Normal"], ["airy", "Airy"]] },
    { k: "ic", name: "Section icons", opts: [["off", "Off"], ["on", "On"]] },
  ];
  const getTheme = () => { try { return localStorage.getItem(TKEY) || "auto"; } catch (e) { return "auto"; } };
  const setTheme = (t) => {
    try { localStorage.setItem(TKEY, t); } catch (e) {}
    if (t === "light" || t === "dark") root.dataset.theme = t; else delete root.dataset.theme;
    document.dispatchEvent(new CustomEvent("radar:theme", { detail: t }));
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} apply(); };

  const GEAR = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5h7M15 5.5h1M4 10h2M10 10h6M4 14.5h8M16 14.5h0"/><circle cx="13" cy="5.5" r="1.8"/><circle cx="8" cy="10" r="1.8"/><circle cx="14" cy="14.5" r="1.8"/></svg>';

  /* ---- line icons in section labels (main content only, not the side panel) ---- */
  const I = (d) => '<svg class="lk-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  const IC = [
    [/key numbers|indicator/i, I('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>')],
    [/round-?up|month/i, I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>')],
    [/next \d+ days|what's ahead|deadline|timeline|roadmap/i, I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')],
    [/your cards|cards/i, I('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>')],
    [/new since/i, I('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>')],
    [/peer|compan|profile/i, I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>')],
    [/feedback|consultation/i, I('<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>')],
    [/where things stand|regulation|rule|law/i, I('<path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"/>')],
    [/market|move|price|cost|trend/i, I('<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>')],
    [/news|headline|latest/i, I('<path d="M4 5h16M4 12h16M4 19h10"/>')],
    [/energy|grid|power|carbon|emission/i, I('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>')],
    [/target/i, I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>')],
    [/alert/i, I('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>')],
    [/data status/i, I('<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>')],
    [/water/i, I('<path d="M12 3s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12z"/>')],
  ];
  // section labels = .cap or upper-case h2/h3 headings in the main area (not the side panel, not inside news cards)
  function decorate() {
    document.querySelectorAll("main :is(.cap, .cards-h, h2, h3)").forEach((el) => {
      if (el.getAttribute("data-lk") === "-" || el.querySelector(":scope > .lk-ic")) return;
      if (el.closest(".side, .side-group, .fdd-p, .stat-pop, .card, .cc, .pcard, .tile, .lk-pop") ||
          (!el.classList.contains("cap") && getComputedStyle(el).textTransform !== "uppercase")) { el.setAttribute("data-lk", "-"); return; }
      const t = (el.textContent || "").trim();
      const hit = IC.find(([re]) => re.test(t));
      if (!hit) { el.setAttribute("data-lk", "-"); return; }
      el.setAttribute("data-lk", "1");
      el.insertAdjacentHTML("afterbegin", hit[1]);
    });
  }
  let queued = false;
  const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; decorate(); }); };

  /* ---- settings panel ---- */
  function seg(k, opts, cur) {
    return '<div class="lk-seg" role="group" data-k="' + k + '">' + opts.map(([v, t]) => '<button type="button" data-v="' + v + '" aria-pressed="' + (cur === v) + '">' + t + "</button>").join("") + "</div>";
  }
  function build(btn) {
    const pop = document.createElement("div");
    pop.className = "lk-pop"; pop.id = "lk-pop"; pop.hidden = true;
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Settings");
    const render = () => {
      pop.innerHTML =
        '<div class="lk-h"><b>Settings</b><button type="button" class="lk-x" aria-label="Close">×</button></div>' +
        '<div class="lk-row"><span>Theme</span>' + seg("theme", [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]], getTheme()) + "</div>" +
        '<div class="lk-row"><span>Page background</span><div class="lk-bgs" role="group">' +
        BG.map(([v, t]) => '<button type="button" class="lk-bg" data-v="' + v + '" aria-pressed="' + (st.bg === v) + '" title="' + t + '"><i data-lk-sw="' + v + '"></i><small>' + t + "</small></button>").join("") +
        "</div></div>" +
        ROWS.map((r) => '<div class="lk-row' + (r.k === "gi" && st.bg === "off" ? " lk-dis" : "") + '"><span>' + r.name + "</span>" + seg(r.k, r.opts, st[r.k]) + "</div>").join("") +
        '<div class="lk-f"><button type="button" class="lk-reset">Reset to default</button><span>Saved in this browser</span></div>';
    };
    render();
    pop.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.classList.contains("lk-x")) { close(); btn.focus(); return; }
      if (b.classList.contains("lk-reset")) { st = Object.assign({}, DEF); save(); render(); return; }
      if (b.classList.contains("lk-bg")) { st.bg = b.dataset.v; save(); render(); return; }
      const g = b.closest(".lk-seg"); if (!g) return;
      if (g.dataset.k === "theme") setTheme(b.dataset.v); else { st[g.dataset.k] = b.dataset.v; save(); }
      render();
    });
    const close = () => { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    btn.addEventListener("click", (e) => { e.stopPropagation(); const open = pop.hidden; if (open) render(); pop.hidden = !open; btn.setAttribute("aria-expanded", String(open)); });
    document.addEventListener("click", (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) { close(); btn.focus(); } });
    return pop;
  }
  function init() {
    const host = document.querySelector("header .wrap"); if (!host || host.querySelector(".lk-btn")) return;
    const wrap = document.createElement("div"); wrap.className = "lk-wrap";
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "th-btn lk-btn";
    btn.innerHTML = GEAR; btn.title = "Settings: theme and look"; btn.setAttribute("aria-label", "Settings: theme and look");
    btn.setAttribute("aria-haspopup", "dialog"); btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "lk-pop");
    wrap.appendChild(btn); wrap.appendChild(build(btn));
    const th = host.querySelector(".th-btn:not(.lk-btn)"), meta = host.querySelector("#meta, .meta");
    if (th) th.before(wrap); else if (meta) meta.before(wrap); else host.appendChild(wrap);
    decorate();
    const main = document.querySelector("main");
    if (main) new MutationObserver(later).observe(main, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
