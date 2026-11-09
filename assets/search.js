/* Search window for all pages (S1). A "Search · Ctrl K" button in the header opens a large window in the middle of
   the screen. Results are grouped by type with filter chips; the selected result is previewed on the right.
   Data: the public JSON files the pages already use, loaded on first open. */
(function () {
  const page = location.pathname.split("/").pop() || "index.html";
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const get = (url, fb) => fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : fb)).catch(() => fb);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtD = (d) => { if (!d) return ""; const [y, m, dd] = String(d).split("-"); return (dd ? +dd + " " : "") + (m ? MON[+m - 1] + " " : "") + y; };
  const fmtN = (v) => (v == null ? "–" : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-GB") : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
  const strip = (t) => String(t || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

  const css = `
  header .gs-btn { display: flex; align-items: center; gap: 10px; height: 36px; min-width: 240px; padding: 0 10px 0 12px; margin-left: auto; border-radius: 8px; background: var(--h-search-bg, rgba(255,255,255,.12)); border: 1px solid var(--h-search-border, rgba(255,255,255,.24)); color: var(--h-search-fg, #c9d6e6); font: inherit; font-size: 13.5px; cursor: pointer; flex: none; }
  header .gs-btn .gs-lbl { flex: 1; text-align: left; }
  header .gs-btn:hover { border-color: var(--h-search-fg, rgba(255,255,255,.4)); color: var(--h-active, #fff); }
  header .gs-btn .kb { font-size: 11px; border: 1px solid var(--h-search-border, rgba(255,255,255,.3)); border-radius: 5px; padding: 1px 6px; background: var(--h-ctl-bg, transparent); }
  header .gs-btn ~ .meta, header .gs-btn ~ .stat-wrap { margin-left: 0 !important; }
  dialog.gs-dlg { width: min(820px, calc(100vw - 32px)); max-height: min(640px, calc(100vh - 96px)); margin: 72px auto auto; padding: 0; border: 0; border-radius: 16px; background: var(--surface, var(--d-fff-bg, #fff)); color: var(--ink, var(--d-111827-text, #111827)); box-shadow: 0 24px 64px rgba(0,20,50,.3); overflow: hidden; }
  dialog.gs-dlg[open] { display: flex; flex-direction: column; animation: gs-in .14s ease-out; }
  dialog.gs-dlg::backdrop { background: rgba(0,20,45,.38); }
  @keyframes gs-in { from { transform: translateY(-6px); opacity: 0; } }
  .gs-in { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--line, var(--d-eef0f3-border, #eef0f3)); flex: none; }
  .gs-in svg { color: var(--ink-3, var(--d-6b7280-text, #6b7280)); flex: none; }
  .gs-in input { flex: 1; min-width: 0; border: 0; outline: 0; font: inherit; font-size: 18px; color: var(--ink, var(--d-111827-text, #111827)); background: transparent; }
  .gs-in input::-webkit-search-cancel-button { display: none; }
  .gs-esc { font: inherit; font-size: 11px; color: var(--ink-3, var(--d-6b7280-text, #6b7280)); border: 1px solid var(--line, var(--d-dfe3e8-border, #dfe3e8)); background: none; border-radius: 5px; padding: 1px 6px; cursor: pointer; }
  .gs-chips { display: flex; gap: 6px; padding: 9px 18px; border-bottom: 1px solid var(--line, var(--d-eef0f3-border, #eef0f3)); flex-wrap: wrap; flex: none; }
  .gs-chips[hidden] { display: none; }
  .gs-chip { font: inherit; font-size: 12.5px; border: 1px solid var(--line-strong, var(--d-dfe3e8-border, #dfe3e8)); background: var(--surface, var(--d-fff-bg, #fff)); color: var(--ink-2, var(--d-374151-text, #374151)); border-radius: 20px; padding: 3px 11px; cursor: pointer; }
  .gs-chip small { color: var(--ink-3, var(--d-8a94a3-text, #8a94a3)); margin-left: 4px; }
  .gs-chip[aria-pressed="true"] { background: var(--accent-strong, var(--d-002d55-bg, #002d55)); border-color: var(--accent-strong, #002d55); color: var(--on-accent, #fff); }
  .gs-chip[aria-pressed="true"] small { color: inherit; opacity: .75; }
  .gs-body { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); min-height: 0; flex: 1; }
  .gs-body.solo { grid-template-columns: minmax(0, 1fr); }
  .gs-body.solo .gs-pv { display: none; }
  .gs-list { overflow-y: auto; padding: 4px 8px 10px; min-height: 0; }
  .gs-body:not(.solo) .gs-list { border-right: 1px solid var(--line, var(--d-eef0f3-border, #eef0f3)); }
  .gs-grp { font-size: 10.5px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3, var(--d-6b7280-text, #6b7280)); padding: 10px 10px 4px; margin: 0; }
  .gs-it { display: flex; gap: 12px; align-items: flex-start; padding: 7px 10px; border-radius: 10px; color: var(--ink, var(--d-111827-text, #111827)); text-decoration: none; cursor: pointer; }
  .gs-it[aria-selected="true"] { background: var(--hover-accent, var(--d-eef5f3-bg, #eef5f3)); }
  .gs-ic { flex: none; width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; }
  .gs-ic svg { width: 16px; height: 16px; }
  .gs-tx { display: flex; flex-direction: column; gap: 1px; min-width: 0; font-size: 13.5px; line-height: 1.35; }
  .gs-tx small { color: var(--ink-3, var(--d-6b7280-text, #6b7280)); font-size: 12px; }
  .gs-ret { margin-left: auto; font-size: 11px; color: var(--ink-3, var(--d-6b7280-text, #6b7280)); align-self: center; visibility: hidden; }
  .gs-it[aria-selected="true"] .gs-ret { visibility: visible; }
  .gs-more { font-size: 12.5px; color: var(--link, var(--d-0064aa-text, #0064aa)); padding: 4px 10px 6px 52px; background: none; border: 0; font-family: inherit; cursor: pointer; text-align: left; }
  .gs-list mark { background: var(--mark, var(--d-fff1b8-bg, #fff1b8)); color: inherit; border-radius: 2px; }
  .gs-pv { overflow-y: auto; padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; font-size: 13px; line-height: 1.5; color: var(--ink-2, var(--d-374151-text, #374151)); background: var(--surface-2, var(--d-fbfcfd-bg, #fbfcfd)); min-height: 0; }
  .gs-pv h4 { margin: 0; font-size: 16px; line-height: 1.3; color: var(--ink-strong, var(--d-002d55-text, #002d55)); }
  .gs-pv p { margin: 0; }
  .gs-tag { align-self: flex-start; font-size: 11.5px; color: var(--ink-2, var(--d-4b5563-text, #4b5563)); background: var(--chip, var(--d-f0f2f5-bg, #f0f2f5)); border-radius: 6px; padding: 2px 8px; }
  .gs-facts { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; margin: 0; font-size: 12.5px; }
  .gs-facts dt { color: var(--ink-3, var(--d-6b7280-text, #6b7280)); } .gs-facts dd { margin: 0; color: var(--ink, var(--d-111827-text, #111827)); }
  .gs-spark { background: var(--surface, var(--d-fff-bg, #fff)); border: 1px solid var(--line, var(--d-eef0f3-border, #eef0f3)); border-radius: 10px; padding: 8px 10px 4px; }
  .gs-spark small { display: flex; justify-content: space-between; color: var(--ink-3, var(--d-6b7280-text, #6b7280)); font-size: 11px; }
  .gs-acts { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; margin-top: 2px; }
  .gs-acts a { color: var(--link, var(--d-0064aa-text, #0064aa)); text-decoration: none; font-weight: 600; }
  .gs-acts a:hover { text-decoration: underline; }
  .gs-empty { padding: 18px 12px; color: var(--ink-3, var(--d-6b7280-text, #6b7280)); font-size: 13.5px; }
  .gs-recent { display: flex; gap: 6px; flex-wrap: wrap; padding: 2px 10px 6px; }
  .gs-recent button { font: inherit; font-size: 12.5px; color: var(--ink-2, var(--d-374151-text, #374151)); background: var(--chip, var(--d-f4f5f7-bg, #f4f5f7)); border: 0; border-radius: 8px; padding: 4px 10px; cursor: pointer; }
  .gs-qa { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 2px 10px 8px; }
  .gs-qa a { display: flex; flex-direction: column; gap: 1px; padding: 9px 12px; border: 1px solid var(--line, var(--d-eef0f3-border, #eef0f3)); border-radius: 10px; font-size: 13px; color: var(--ink, var(--d-111827-text, #111827)); text-decoration: none; }
  .gs-qa a:hover, .gs-qa a:focus-visible { background: var(--hover, var(--d-f5f7f9-bg, #f5f7f9)); }
  .gs-qa a small { color: var(--ink-3, var(--d-6b7280-text, #6b7280)); font-size: 12px; }
  .gs-foot { display: flex; gap: 16px; padding: 8px 18px; border-top: 1px solid var(--line, var(--d-eef0f3-border, #eef0f3)); font-size: 12px; color: var(--ink-3, var(--d-6b7280-text, #6b7280)); flex: none; }
  .gs-foot span:last-child { margin-left: auto; }
  @media (max-width: 760px) {
    header .gs-btn .gs-lbl, header .gs-btn .kb { display: none; }
    header .gs-btn { width: 34px; min-width: 0; padding: 0; justify-content: center; }
    dialog.gs-dlg { width: 100vw; max-width: 100vw; height: 100dvh; max-height: 100dvh; margin: 0; border-radius: 0; }
    .gs-body { grid-template-columns: minmax(0, 1fr); } .gs-pv { display: none; } .gs-body:not(.solo) .gs-list { border-right: 0; }
    .gs-qa { grid-template-columns: 1fr 1fr; } .gs-foot { display: none; }
  }`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  // ---------- icons per type ----------
  const ICON = {
    news: ["var(--ic-news-bg, #e3f4f0)", "var(--ic-news, #1f8f7d)", '<rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M5 6.5h6M5 9.5h4"/>'],
    peer: ["var(--ic-peer-bg, #fdeee8)", "var(--ic-peer, #c4653f)", '<circle cx="8" cy="6" r="2.5"/><path d="M3.5 13.5c.8-2.4 2.5-3.5 4.5-3.5s3.7 1.1 4.5 3.5"/>'],
    reg: ["var(--ic-reg-bg, #e8edf3)", "var(--ic-reg, #335777)", '<path d="M8 2.5v11M4 5h8M3 5l-1.5 4h3L3 5zM13 5l-1.5 4h3L13 5zM5.5 13.5h5"/>'],
    market: ["var(--ic-market-bg, #e6f0f8)", "var(--ic-market, #0064aa)", '<path d="M2 12l4-4 3 2 5-6"/>'],
    fabric: ["var(--ic-fabric-bg, #eceefa)", "var(--ic-fabric, #5563b8)", '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>'],
    page: ["var(--chip, #eef0f3)", "var(--ink-2, #335777)", '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M2.5 6h11"/>'],
  };
  function icon(kind) {
    const [bg, fg, path] = ICON[kind] || ICON.page;
    const s = el("span", "gs-ic"); s.style.background = bg;
    s.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + "</svg>";
    s.firstChild.setAttribute("stroke", fg); s.firstChild.style.stroke = fg;
    return s;
  }

  // ---------- header button + dialog ----------
  const nav = document.querySelector("header .nav");
  if (!nav) return;
  const btn = el("button", "gs-btn"); btn.type = "button"; btn.setAttribute("aria-haspopup", "dialog");
  btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg><span class="gs-lbl">Search</span><span class="kb">' + (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K") + "</span>";
  btn.setAttribute("aria-label", "Search all pages");
  nav.after(btn);

  const dlg = el("dialog", "gs-dlg"); dlg.setAttribute("aria-label", "Search");
  dlg.innerHTML = '<div class="gs-in"><svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>' +
    '<input type="search" id="gs-q" placeholder="Search news, regulation, peers, market …" aria-label="Search all pages" autocomplete="off" role="combobox" aria-controls="gs-list" aria-expanded="true"><button type="button" class="gs-esc">Esc</button></div>' +
    '<div class="gs-chips" role="group" aria-label="Filter by type" hidden></div><div class="gs-body"><div class="gs-list" id="gs-list" role="listbox"></div><div class="gs-pv" aria-live="polite"></div></div>' +
    '<div class="gs-foot"><span>↑ ↓ move</span><span>↵ open</span><span>Tab next filter</span><span>Searches all 5 pages</span></div>';
  document.body.appendChild(dlg);
  const input = dlg.querySelector("#gs-q"), chipsBox = dlg.querySelector(".gs-chips"), list = dlg.querySelector(".gs-list"), pv = dlg.querySelector(".gs-pv"), body = dlg.querySelector(".gs-body");

  function openS(q) {
    if (!dlg.open) dlg.showModal();
    if (q != null) input.value = q;
    input.focus(); input.select();
    load().then(run);
  }
  btn.addEventListener("click", () => openS());
  dlg.querySelector(".gs-esc").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (ev) => { if (ev.target === dlg) dlg.close(); });
  document.addEventListener("keydown", (ev) => {
    const typing = /input|textarea|select/i.test((document.activeElement || {}).tagName || "");
    if ((ev.key === "k" || ev.key === "K") && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); dlg.open ? dlg.close() : openS(); }
    else if (ev.key === "/" && !typing && !dlg.open) { ev.preventDefault(); openS(); }
  });
  window.RadarSearch = { open: openS };

  // ---------- index ----------
  let IDX = null, loading = null;
  const GROUPS = [["page", "Pages"], ["peer", "Peers"], ["market", "Market"], ["reg", "Regulation"], ["news", "News"], ["peernews", "Peer news"], ["fabric", "Fabric & Power BI roadmap"]];
  function load() {
    if (loading) return loading;
    loading = Promise.all([
      get("data/radar.json", { entries: [] }), get("data/peer_news.json", null), get("data/peers.json", null), get("data/roadmap.json", { rows: [] }),
      get("data/regulation.json", null), get("data/market.json", null), get("config/market.json", null), get("data/fabric_roadmap.json", null),
      get("config/roadmap_add.json", { rows: [] }),
    ]).then(([radar, pn, peers, roadmap, reg, market, mcfg, fabric, radd]) => {
      { const have = new Set((roadmap.rows || []).map((r) => r.id)); roadmap.rows = (roadmap.rows || []).concat((radd.rows || []).filter((r) => r && r.id && !have.has(r.id))); }
      const items = [];
      const add = (o, extra) => { o.text = (o.title + " " + (o.sub || "") + " " + (extra || "")).toLowerCase(); items.push(o); };
      const news = radar.entries || [];
      news.forEach((e) => add({ g: "news", kind: "news", title: e.title, sub: [fmtD(e.date), e.source].filter(Boolean).join(" · "), href: "news.html#open=" + encodeURIComponent(e.id), e, date: e.date || "" }, [e.summary, (e.tags || []).join(" "), e.whyItMatters].join(" ")));
      const names = {}; ((peers && peers.companies) || []).forEach((c) => { names[c.id] = c.name; });
      Object.entries((pn && pn.companies) || {}).forEach(([cid, l]) => (l || []).forEach((n) => add({ g: "peernews", kind: "peer", title: n.title, sub: [names[cid] || cid, fmtD(n.date), n.source].filter(Boolean).join(" · "), href: n.url, ext: true, n, company: names[cid] || cid, date: n.date || "" }, names[cid])));
      (roadmap.rows || []).forEach((r) => add({ g: "reg", kind: "reg", title: r.label, sub: "Regulation tracker", href: "regulation.html#topic=" + r.id, r }, [(r.phases || []).map((p) => p.label).join(" "), (r.milestones || []).map((m) => m.label).join(" ")].join(" ")));
      ((reg && reg.consultations) || []).forEach((c) => add({ g: "reg", kind: "reg", title: c.title, sub: "Consultation · closes " + fmtD(c.end), href: c.url, ext: true, c }, c.summary));
      ((peers && peers.companies) || []).forEach((c) => add({ g: "peer", kind: "peer", title: c.name, sub: (c.country || "") + " · full profile", href: "peers.html#profile=" + c.id, p: c, defs: peers.kpis || {} }, [(c.aliases || []).join(" "), (c.targets || []).join(" ")].join(" ")));
      const about = {}; ((mcfg && mcfg.indicators) || []).forEach((i) => { if (i.about) about[i.id] = i.about; });
      ((market && market.indicators) || []).filter((i) => (i.series || []).length).forEach((i) => add({ g: "market", kind: "market", title: i.label, sub: i.unit + " · " + (i.attribution || ""), href: "market.html#ind=" + i.id, m: i, about: about[i.id] }, (about[i.id] || {}).what));
      ((fabric && fabric.items) || []).forEach((f) => add({ g: "fabric", kind: "fabric", title: f.name, sub: [f.product, f.type, f.quarter].filter(Boolean).join(" · "), href: f.url, ext: true, f }, strip(f.desc)));
      PAGES.forEach(([t, s, h, x]) => add({ g: "page", kind: "page", title: t, sub: s, href: h, desc: s }, x));
      IDX = items;
    });
    return loading;
  }
  const PAGES = [
    ["Monthly round-up", "Overview · what changed in a month", "./", "summary digest month briefing"],
    ["Costs at a glance", "Costs · fibre, recovered paper, energy and labour: headwind or tailwind", "costs.html#tab=glance", "summary signal headwind tailwind cost prices"],
    ["Price trends", "Costs · compare price indicators as an index", "costs.html#tab=cmp", "compare chart pulp recovered paper gas power"],
    ["Cost index", "Costs · tissue cost drivers vs. tissue prices", "costs.html#tab=cost", "margin cost drivers pulp gas electricity"],
    ["Market at a glance", "Market · demand, production and fibre supply", "market.html#tab=glance", "summary demand production fibre supply"],
    ["Market trends", "Market · compare demand and trade indicators", "market.html#tab=cmp", "compare chart retail imports exports"],
    ["Industry · monthly", "Market · German market and trade, month by month", "market.html#tab=industry&view=month", "production hygiene paper retail imports exports monthly"],
    ["Industry · yearly", "Market · yearly industry profile: energy mix, water, waste, recovered paper, Europe", "market.html#tab=industry&view=year", "cepi recovered paper utilisation water waste energy mix environmental investment yearly"],
    ["Energy & climate at a glance", "Energy & climate · grid, power mix, gas storage and water", "energy.html#tab=glance", "summary energy climate"],
    ["Grid carbon intensity", "Energy & climate · power mix and CO₂ per kWh by country", "energy.html#tab=grid", "scope 2 electricity emission factor power mix"],
    ["Water & weather", "Energy & climate · river levels, soil moisture, heat and rain at our mills", "energy.html#tab=water", "rhine kaub pegel low water niedrigwasser drought dürre soil moisture bodenfeuchte heat hot days hitze rain regen"],
    ["Gas storage", "Energy & climate · EU and German gas storage vs. the last five years", "energy.html#tab=gas", "agsi gas storage füllstand speicher winter supply"],
    ["WEPA sites in the EU ETS", "Peers · which WEPA sites the emissions data covers", "peers.html#tab=ets", "ets sites coverage missing emissions scope 1 mills"],
    ["EU ETS emissions", "Peers · verified emissions of EU sites", "peers.html#tab=ets", "emissions trading co2 sites"],
    ["Next deadlines", "Regulation · roadmap of upcoming dates", "regulation.html#view=roadmap", "deadline timeline milestones"],
    ["Fibre · pulp origin", "Market · where the EU's pulp comes from, with EUDR country risk", "market.html#tab=fibre", "pulp origin eudr deforestation nbsk bhkp brazil finland sweden imports zellstoff herkunft"],
    ["Open consultations", "Regulation · EU “Have your say”", "regulation.html#show=consult", "have your say consultation"],
  ];
  const QUICK = [[1, "Costs"], [4, "Market"], [8, "Energy & climate"], [13, "Regulation"], [11, "Peers"], [0, "Overview"]];

  // ---------- recent searches ----------
  const RKEY = "radar.recentSearch";
  const recent = () => { try { return JSON.parse(localStorage.getItem(RKEY) || "[]"); } catch (e) { return []; } };
  const remember = (q) => { q = q.trim(); if (q.length < 2) return; try { localStorage.setItem(RKEY, JSON.stringify([q, ...recent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6))); } catch (e) {} };

  // ---------- render ----------
  let filter = "all", shown = [], sel = -1, expanded = {};
  function mark(node, text, words) {
    const low = text.toLowerCase(); const hits = [];
    words.forEach((w) => { let j = low.indexOf(w); while (j >= 0 && w) { hits.push([j, j + w.length]); j = low.indexOf(w, j + w.length); } });
    hits.sort((a, b) => a[0] - b[0]); let i = 0;
    hits.forEach(([a, b]) => { if (a < i) return; node.append(text.slice(i, a), el("mark", null, text.slice(a, b))); i = b; });
    node.append(text.slice(i));
  }
  function row(it, words) {
    const a = el("a", "gs-it"); a.href = it.href; a.setAttribute("role", "option"); a.id = "gs-o" + shown.length;
    if (it.ext) { a.target = "_blank"; a.rel = "noopener"; }
    const tx = el("span", "gs-tx"), t = el("span"); mark(t, it.title, words); tx.appendChild(t);
    if (it.sub) tx.appendChild(el("small", null, it.sub));
    a.append(icon(it.kind), tx, el("span", "gs-ret", it.ext ? "↗" : "↵"));
    a.addEventListener("mousemove", () => { if (shown[sel] !== a) select(shown.indexOf(a), false); });
    a.addEventListener("click", () => go(it));
    a._it = it; shown.push(a); return a;
  }
  function go(it) {
    remember(input.value);
    const same = it.href.split("#")[0] === page || (page === "index.html" && it.href === "./");
    if (!it.ext) { dlg.close(); if (same) setTimeout(() => location.reload(), 0); }
  }
  function select(i, scroll = true) {
    sel = i;
    shown.forEach((a, k) => a.setAttribute("aria-selected", String(k === sel)));
    if (sel >= 0) { input.setAttribute("aria-activedescendant", shown[sel].id); if (scroll) shown[sel].scrollIntoView({ block: "nearest" }); preview(shown[sel]._it); }
  }
  function run() {
    if (!IDX) return;
    const raw = input.value.trim(), q = raw.toLowerCase();
    list.replaceChildren(); shown = []; sel = -1;
    if (q.length < 2) { chipsBox.hidden = true; body.classList.add("solo"); return emptyState(); }
    const words = q.split(/\s+/).filter(Boolean);
    const res = IDX.filter((it) => words.every((w) => it.text.includes(w)))
      .map((it) => ({ it, s: words.filter((w) => it.title.toLowerCase().includes(w)).length * 10 + (it.title.toLowerCase().startsWith(words[0]) ? 5 : 0) }));
    const by = {}; res.forEach((r) => (by[r.it.g] = by[r.it.g] || []).push(r));
    Object.values(by).forEach((l) => l.sort((a, b) => b.s - a.s || String(b.it.date || "").localeCompare(String(a.it.date || ""))));
    // chips
    chipsBox.replaceChildren(); chipsBox.hidden = !res.length;
    if (filter !== "all" && !by[filter]) filter = "all";
    const chip = (key, label, n) => { const c = el("button", "gs-chip"); c.type = "button"; c.setAttribute("aria-pressed", String(filter === key)); c.append(label, el("small", null, String(n))); c.addEventListener("click", () => { filter = key; run(); input.focus(); }); chipsBox.appendChild(c); };
    chip("all", "All", res.length);
    GROUPS.forEach(([k, label]) => { if (by[k]) chip(k, label, by[k].length); });
    if (!res.length) { body.classList.add("solo"); list.appendChild(el("div", "gs-empty", "No results for “" + raw + "”. Try fewer or shorter words.")); return; }
    body.classList.remove("solo");
    // groups with the best title matches first; ties keep the default order
    const best = (k) => (by[k] ? by[k][0].s : -1);
    const ordered = GROUPS.map((g, i) => [g, i]).sort((a, b) => best(b[0][0]) - best(a[0][0]) || a[1] - b[1]).map((x) => x[0]);
    ordered.forEach(([k, label]) => {
      if (!by[k] || (filter !== "all" && filter !== k)) return;
      const lim = filter === k || expanded[k] ? 40 : 4;
      list.appendChild(el("p", "gs-grp", label));
      by[k].slice(0, lim).forEach((r) => list.appendChild(row(r.it, words)));
      if (by[k].length > lim) {
        const m = el("button", "gs-more", "Show all " + by[k].length + " →"); m.type = "button";
        m.addEventListener("click", () => { if (k === "news" && by[k].length > 40) { remember(raw); location.href = "news.html#q=" + encodeURIComponent(raw); } else { expanded[k] = true; run(); } });
        list.appendChild(m);
      }
    });
    select(0, false);
  }
  function emptyState() {
    pv.replaceChildren();
    const r = recent();
    if (r.length) {
      list.appendChild(el("p", "gs-grp", "Recent"));
      const box = el("div", "gs-recent");
      r.forEach((q) => { const b = el("button", null, q); b.type = "button"; b.addEventListener("click", () => { input.value = q; run(); input.focus(); }); box.appendChild(b); });
      list.appendChild(box);
    }
    list.appendChild(el("p", "gs-grp", "Go to"));
    const qa = el("div", "gs-qa");
    QUICK.forEach(([i, where]) => { const p = PAGES[i]; const a = el("a"); a.href = p[2]; a.append(p[0], el("small", null, where)); a.addEventListener("click", () => go({ href: p[2] })); qa.appendChild(a); });
    list.appendChild(qa);
  }

  // ---------- preview ----------
  function facts(pairs) { const dl = el("dl", "gs-facts"); pairs.filter((p) => p[1]).forEach(([k, v]) => dl.append(el("dt", null, k), el("dd", null, v))); return dl; }
  function acts(links) { const d = el("div", "gs-acts"); links.forEach(([t, h, ext]) => { const a = el("a", null, t); a.href = h; if (ext) { a.target = "_blank"; a.rel = "noopener"; } else a.addEventListener("click", () => go({ href: h })); d.appendChild(a); }); return d; }
  function spark(series, unit) {
    const s = series.slice(-24), vs = s.map((p) => p[1]), lo = Math.min(...vs), hi = Math.max(...vs), W = 300, H = 56;
    const x = (k) => (k / Math.max(1, s.length - 1)) * W, y = (v) => H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 10);
    const d = s.map((p, k) => (k ? "L" : "M") + x(k).toFixed(1) + " " + y(p[1]).toFixed(1)).join(" ");
    const box = el("div", "gs-spark");
    box.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" height="56" preserveAspectRatio="none" role="img" aria-label="Last ' + s.length + ' months"><path d="' + d + '" fill="none" stroke-width="2" vector-effect="non-scaling-stroke" style="stroke:var(--ic-market,#0064aa)"/></svg>';
    const lab = el("small"); lab.append(el("span", null, (fmtD(s[0][0]) || "") + " · " + fmtN(s[0][1])), el("span", null, (fmtD(s[s.length - 1][0]) || "") + " · " + fmtN(s[s.length - 1][1]) + " " + (unit || "")));
    box.appendChild(lab); return box;
  }
  function preview(it) {
    pv.replaceChildren();
    const tag = (t) => pv.appendChild(el("span", "gs-tag", t));
    const p = (t) => { if (t) pv.appendChild(el("p", null, strip(t))); };
    if (it.g === "news") {
      const e = it.e; tag({ regulation: "Regulation", tool: "Tools & updates", practice: "Best practice" }[e.type] || "News");
      pv.appendChild(el("h4", null, e.title)); p(e.summary);
      if (e.whyItMatters) { const w = el("p"); w.append(el("b", null, "Why it matters: "), strip(e.whyItMatters)); pv.appendChild(w); }
      pv.appendChild(facts([["Date", fmtD(e.date)], ["Source", e.source], ["Status", e.status], ["Next", e.nextDate ? fmtD(e.nextDate) + (e.nextDateLabel ? " · " + e.nextDateLabel : "") : ""]]));
      pv.appendChild(acts([["Open card", it.href], ["Source ↗", e.url, true]].filter((l) => l[1])));
    } else if (it.g === "peernews") {
      tag("Peer news · " + it.company); pv.appendChild(el("h4", null, it.n.title));
      pv.appendChild(facts([["Date", fmtD(it.n.date)], ["Source", it.n.source]]));
      pv.appendChild(acts([["Read article ↗", it.n.url, true], ["All " + it.company + " news", "news.html#type=peer&q=" + encodeURIComponent(it.company)]]));
    } else if (it.g === "peer") {
      const c = it.p, k = c.kpis || {}, d = it.defs, val = (id) => (k[id] && k[id].v != null && k[id].v !== "" ? String(k[id].v) + (d[id] && d[id].unit === "%" && typeof k[id].v === "number" ? " %" : "") : "");
      tag("Peer · " + (c.country || "")); pv.appendChild(el("h4", null, c.name));
      pv.appendChild(facts([["SBTi", val("sbti")], ["Net zero", val("netZeroYear")], ["Scope 1+2 target", val("scope12Target") && "−" + val("scope12Target").replace(/^-/, "")], ["Renewable electricity", val("renewableElectricity")], ["EcoVadis", val("ecovadis")], ["CDP Climate", val("cdpClimate")]]));
      if ((c.targets || [])[0]) p(c.targets[0]);
      pv.appendChild(acts([["Open full profile", it.href], c.report && c.report.url ? ["Report ↗", c.report.url, true] : null].filter(Boolean)));
    } else if (it.g === "market") {
      const m = it.m, s = m.series, last = s[s.length - 1], prev = s[s.length - 2];
      tag("Market indicator"); pv.appendChild(el("h4", null, m.label));
      if (s.length > 2) pv.appendChild(spark(s, m.unit));
      const ch = prev && prev[1] ? ((last[1] / prev[1] - 1) * 100) : null;
      pv.appendChild(facts([["Latest", fmtN(last[1]) + " " + (m.unit || "") + " · " + fmtD(last[0])], ["Change", ch == null ? "" : (ch >= 0 ? "▲ " : "▼ ") + Math.abs(ch).toFixed(1) + " % vs. " + fmtD(prev[0])], ["Source", m.attribution]]));
      if (it.about) p(it.about.what);
      pv.appendChild(acts([["Add to Trends chart", "costs.html#add=" + m.id], ["Open details", it.href]]));
    } else if (it.g === "reg") {
      if (it.c) {
        tag("EU consultation"); pv.appendChild(el("h4", null, it.c.title)); p(it.c.summary);
        pv.appendChild(facts([["Opened", fmtD(it.c.start)], ["Closes", fmtD(it.c.end)], ["Type", it.c.type]]));
        pv.appendChild(acts([["Have your say ↗", it.c.url, true]]));
      } else {
        const r = it.r, today = new Date().toISOString().slice(0, 10);
        const now = (r.phases || []).find((ph) => ph.from <= today && (!ph.to || ph.to >= today));
        const next = (r.milestones || []).filter((m) => m.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
        tag("Regulation"); pv.appendChild(el("h4", null, r.label));
        pv.appendChild(facts([["Now", now && now.label], ["Next", next && fmtD(next.date) + " · " + next.label], ["News items", (r.entries || []).length ? String(r.entries.length) : ""]]));
        pv.appendChild(acts([["Open in tracker", it.href], ["Related news", "news.html#topic=" + r.id]]));
      }
    } else if (it.g === "fabric") {
      tag("Fabric & Power BI roadmap"); pv.appendChild(el("h4", null, it.f.name));
      pv.appendChild(facts([["Product", it.f.product], ["Release", [it.f.type, it.f.quarter].filter(Boolean).join(" · ")]]));
      p(strip(it.f.desc).slice(0, 420));
      pv.appendChild(acts([["Roadmap ↗", it.f.url, true]]));
    } else {
      tag("Page"); pv.appendChild(el("h4", null, it.title)); p(it.desc);
      pv.appendChild(acts([["Go there", it.href]]));
    }
  }

  // ---------- keys ----------
  let t = null;
  input.addEventListener("input", () => { clearTimeout(t); expanded = {}; t = setTimeout(run, 90); });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault(); if (!shown.length) return;
      select((sel + (ev.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length);
    } else if (ev.key === "Enter" && sel >= 0) {
      ev.preventDefault(); const a = shown[sel]; go(a._it);
      if (a._it.ext) window.open(a.href, "_blank", "noopener"); else location.href = a.href;
    } else if (ev.key === "Tab" && !chipsBox.hidden) {
      ev.preventDefault();
      const keys = ["all", ...GROUPS.map((g) => g[0]).filter((k) => [...chipsBox.children].some((c) => c.textContent.startsWith(GROUPS.find((g) => g[0] === k)[1])))];
      filter = keys[(keys.indexOf(filter) + (ev.shiftKey ? -1 : 1) + keys.length) % keys.length]; run();
    }
  });
})();
