// Market + Costs pages (shared). The page is chosen by <body data-mpage="costs|market">.
(function () {
  // WEPA line colours (palette "G2 + Pink"): light WEPA Grün, Mittelblau, WEPA Pink, WEPA blue #335777, Hellblau.
  // This order keeps neighbouring colours distinguishable for colour-blind readers; light colours get labels at the line end.
  const SLOTS = ["#33b09c", "#0064aa", "#f4b49f", "#335777", "#96d2dc", "#828282"]; // fixed order; a series keeps its colour while selected (6th: WEPA grey)
  const MAX_LINES = 6;      // up to 6 lines share one chart; with more, every indicator gets its own small chart
  const MAX_SEL = 40;
  const SM_COLOR = "var(--d-0064aa-text, #0064aa)"; // small multiples: one colour, the panel title carries the identity
  const LIGHT = new Set(["#f4b49f", "#96d2dc"]); // light colours: dark tick mark instead of white
  const PRESETS = [["12", "Last 12 months"], ["36", "3 years"], ["60", "5 years"], ["all", "All"]];
  const EARLIEST = "2019-01";
  const DEFAULT_CMP = document.body.dataset.mpage === "energy" ? ["grid_de", "res_share_de", "mix_coal"] : document.body.dataset.mpage !== "costs" ? ["de_prod_paper", "de_retail_drug", "de_imp_tissue"] : ["ppi_tissue", "pulp_nbsk_eu", "rcp_export_eu", "power_de_spot", "ppi_pulp", "us_recovered_paper", "gas_ttf"];
  const PAGE = ["costs", "energy"].includes(document.body.dataset.mpage) ? document.body.dataset.mpage : "market";
  // three pages share this script: which questions and tabs each one shows
  const PAGE_Q = { costs: ["cost"], market: ["market", "env"], energy: ["grid"] };
  const PAGE_TABS = { costs: ["glance", "cmp", "cost"], market: ["glance", "cmp", "industry", "fibre"], energy: ["glance", "cmp", "grid", "gas", "water"] };
  const PAGE_FILE = { costs: "costs.html", market: "market.html", energy: "energy.html" };
  const state = { gran: "auto", tab: "glance", ind: "month", area: "all", q: "all", topic: "all", find: "", gasArea: "eu", pulp: "total", sel: new Set(), cmp: [], lay: (() => { try { return localStorage.getItem("radar.trendsView") === "list" ? "list" : "cards"; } catch (e) { return "cards"; } })() };
  // The four questions (config/market.json "questions"); every indicator belongs to one
  let QUESTIONS = { cost: { label: "What does tissue cost us?", title: "What does tissue cost us right now?", tab: "cost", link: "Open cost index" },
    market: { label: "How is our market doing?", title: "How is our market doing?", tab: "industry", link: "Open industry" },
    grid: { label: "How green is our power?", title: "How green is the power we buy?", tab: "grid", link: "Open grid" },
    env: { label: "Industry & environment", title: "Where does the industry stand on environment?", tab: "industry", link: "Open industry profile" } };
  const QDEF = { grid: "grid", powermix: "grid", market_de: "market", profile: "env" };
  const questionOf = (i) => i.question || QDEF[i.group] || "cost";
  const Q_ICON = {
    all: '<circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11M8 2.5c1.8 1.7 1.8 9.3 0 11M8 2.5c-1.8 1.7-1.8 9.3 0 11"/>',
    cost: '<circle cx="8" cy="8" r="5.5"/><path d="M9.8 5.8a2.4 2.4 0 1 0 0 4.4M5 7.2h3.6M5 8.8h3.6"/>',
    market: '<path d="M2 13.5h12"/><path d="M4 11V8M7 11V5.5M10 11V7M13 11V3.5"/>',
    grid: '<path d="M9 1.8L4 9h4l-1 5.2L12 7H8Z"/>',
    env: '<path d="M3 13c0-6 4-9.5 10-10-.3 6-3.8 10-10 10Z"/><path d="M3 13l5-5"/>',
  };
  // Page tabs: Compare + one tab per topic (grid carbon intensity sits with energy)
  // Page tabs: Compare (chart + indicator tiles) · Grid (carbon intensity by country) · Carbon cost (exposure tool)
  const TAB_DEF = [
    { id: "cost", label: "Cost index", groups: [], lead: "How public input-cost statistics add up to an illustrative tissue cost driver index, set against the producer price index for tissue." },
    { id: "industry", label: "Industry", groups: [], lead: "Two views: WEPA's market month by month (production, demand, trade), and a yearly environmental profile of the German paper industry as a yardstick." },
    { id: "grid", label: "Power grid", groups: ["grid"], lead: "Where German power comes from, and the CO₂ intensity of national power grids – 12-month averages smooth out the seasons. Click a country for its history." },
    { id: "gas", label: "Gas storage", groups: [] },
    { id: "fibre", label: "Fibre", groups: [] },
    { id: "water", label: "Water & weather", groups: [], lead: "River levels at the Rhine bottleneck and next to our mills, and how dry the soil is around each German mill. Updated every working day from public sources." },
  ];
  const GLANCE_LEAD = "Four questions behind tissue costs and demand, answered from public statistics. The signal compares the latest value with a year earlier: headwind or tailwind for WEPA. Click a row for details.";
  let TABS = [];
  const ui = { open: false, exp: new Set(), indOpen: false, indQ: "" };
  const colorOf = {};
  let M = null, side = null, ETS = null, WATER = null, GAS = null, WEATHER = null, PULP = null, EUDR = null, INTL = null;
  const START_HASH = location.hash;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => { const n = document.createElementNS(NS, tag); Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v)); return n; };

  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtMonth = (s) => MON[+s.slice(5, 7) - 1] + " " + s.slice(0, 4);
  const fmtDay = (s) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
  const fmtDate = (s, ind) => (s.length > 7 ? fmtDay(s) : ind && ind.freq === "half-yearly" ? (s.slice(5, 7) === "01" ? "H1 " : "H2 ") + s.slice(0, 4)
    : ind && ind.freq === "quarterly" ? "Q" + (Math.floor((+s.slice(5, 7) - 1) / 3) + 1) + " " + s.slice(0, 4) : ind && ind.freq === "yearly" ? s.slice(0, 4) : fmtMonth(s));
  function fmtVal(v, unit) {
    if (v == null) return "–";
    if (unit === "€/kWh") return v.toLocaleString("en-GB", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    if (unit === "USD per EUR") return v.toLocaleString("en-GB", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    if (unit && unit.startsWith("g CO")) return Math.round(v).toLocaleString("en-GB");
    if (unit === "€/t") return Math.round(v).toLocaleString("en-GB");
    if (unit === "€/MWh") return v.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (unit === "%" || unit === "index") return v.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (unit === "kt" || unit === "TJ" || unit === "€ m" || unit === "million m³") return v.toLocaleString("en-GB", { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 });
    return v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const unitLabel = (u) => (u === "index" ? "index" : u);
  const monthsBack = (ym, n) => { const [y, m] = ym.split("-").map(Number); const t = y * 12 + (m - 1) - n; return Math.floor(t / 12) + "-" + String((t % 12) + 1).padStart(2, "0"); };

  // ---------- period selection (set of months, like a Power BI hierarchy slicer) ----------
  const toN = (d) => { const [y, mo] = d.slice(0, 7).split("-").map(Number); return y * 12 + mo - 1; };
  const fromN = (n) => Math.floor(n / 12) + "-" + String((n % 12) + 1).padStart(2, "0");
  let LATEST = null;
  const latestMonth = () => LATEST || (LATEST = M.indicators.filter(chartable).map((i) => i.series[i.series.length - 1][0].slice(0, 7)).sort().pop() || null);
  function monthRange(a, b) { const out = []; for (let n = toN(a); n <= toN(b); n++) out.push(fromN(n)); return out; }
  function preset(key) {
    const last = latestMonth(); if (!last) return new Set();
    return new Set(monthRange(key === "all" ? EARLIEST : monthsBack(last, Number(key) - 1), last));
  }
  const selSorted = () => [...state.sel].sort();
  const periodStart = () => selSorted()[0] || null;
  const periodEnd = () => { const s = selSorted(); return s[s.length - 1] || null; };
  const inSel = (d) => state.sel.has(d.slice(0, 7));
  const isContiguous = () => { const s = selSorted(); return s.length > 0 && toN(s[s.length - 1]) - toN(s[0]) + 1 === s.length; };
  function encodeSel() {
    const s = selSorted(), parts = []; let a = null, prev = null;
    s.forEach((m) => { if (a && toN(m) === toN(prev) + 1) { prev = m; return; } if (a) parts.push(a === prev ? a : a + ".." + prev); a = prev = m; });
    if (a) parts.push(a === prev ? a : a + ".." + prev);
    return parts.join(",");
  }
  function decodeSel(str) {
    const out = new Set();
    (str || "").split(",").forEach((part) => { const [a, b] = part.split(".."); if (/^\d{4}-\d{2}$/.test(a)) monthRange(a, /^\d{4}-\d{2}$/.test(b || "") ? b : a).forEach((m) => out.add(m)); });
    return out;
  }
  function periodLabel() {
    const s = selSorted(); if (!s.length) return "No months selected";
    const span = fmtMonth(s[0]) + (s.length > 1 ? " – " + fmtMonth(s[s.length - 1]) : "");
    return isContiguous() ? span + " · " + s.length + (s.length === 1 ? " month" : " months") : s.length + " months selected · " + span;
  }

  // ---------- state & links ----------
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get("months")) state.sel = decodeSel(p.get("months"));
    if (p.get("cmp") != null) state.cmp = p.get("cmp").split(",").filter(Boolean);
    if (["auto", "year", "quarter", "month"].includes(p.get("gran"))) state.gran = p.get("gran");
    if (p.get("tab") && TABS.some((t) => t.id === p.get("tab"))) state.tab = p.get("tab");
    else if (p.has("cmp") || p.has("add")) state.tab = "cmp"; // links from the Overview page open the Trends chart
    if (p.get("topic")) state.topic = p.get("topic");
    if (p.get("view") === "year" || p.get("view") === "month") state.ind = p.get("view");
  }
  function writeHash() {
    const p = new URLSearchParams();
    p.set("tab", state.tab);
    if (state.tab === "industry") p.set("view", state.ind);
    if (state.tab === "cmp" && state.topic !== "all") p.set("topic", state.topic);
    if (state.gran !== "auto") p.set("gran", state.gran);
    const def = preset("36"); const same = def.size === state.sel.size && [...def].every((m) => state.sel.has(m));
    if (!same) p.set("months", encodeSel());
    p.set("cmp", state.cmp.join(","));
    history.replaceState(null, "", "#" + p.toString());
  }

  const hasData = (i) => i.series && i.series.length > 0;
  const chartable = (i) => hasData(i) && i.source !== "manual" && i.series.length > 1 && i.group !== "profile";
  // the question filter applies on "At a glance" and "Trends"; the other tabs always show everything
  // Costs page = the "cost" question (prices, energy, labour); Market page = market, grid and the industry profile
  const onPage = (i) => PAGE_Q[PAGE].includes(questionOf(i));
  const pageOf = (i) => Object.keys(PAGE_Q).find((k) => PAGE_Q[k].includes(questionOf(i))) || "costs";
  const pageInds = () => M.indicators.filter(onPage);
  const visible = () => pageInds();

  let wasMulti = false;
  function assignColors() {
    const multi = state.cmp.length > MAX_LINES;
    if (multi || wasMulti) Object.keys(colorOf).forEach((id) => delete colorOf[id]);
    wasMulti = multi;
    if (multi) { state.cmp.forEach((id) => { colorOf[id] = SM_COLOR; }); return; }
    Object.keys(colorOf).forEach((id) => { if (!state.cmp.includes(id)) delete colorOf[id]; });
    state.cmp.forEach((id) => {
      if (colorOf[id]) return;
      const used = new Set(Object.values(colorOf));
      colorOf[id] = SLOTS.find((c) => !used.has(c)) || SLOTS[0];
    });
  }
  function defaultCmp() {
    const vis = visible().filter((i) => chartable(i) && indexed(i).length).map((i) => i.id);
    const pref = DEFAULT_CMP.filter((id) => vis.includes(id));
    return [...pref, ...vis.filter((id) => !pref.includes(id))].slice(0, 3);
  }

  // ---------- filter bar under the tabs (replaces the side panel) ----------
  // Price trends: search · topic · indicators in chart · period. Cost index: period. Other tabs: no bar.
  let topicDD = null;
  function renderBar() {
    const bar = $("mbar"); if (!bar) return;
    const show = state.tab === "cmp" || state.tab === "cost";
    bar.hidden = !show; if (!show) { bar.replaceChildren(); return; }
    const keepFocus = document.activeElement && document.activeElement.id === "tq";
    const nodes = [];
    if (state.tab === "cmp") {
      const s = el("label", "search"); s.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
      const q = el("input"); q.id = "tq"; q.type = "search"; q.placeholder = "Find indicator"; q.value = state.find; q.setAttribute("aria-label", "Find indicator");
      q.addEventListener("input", () => { state.find = q.value; renderCmpTiles(); });
      s.appendChild(q); nodes.push(s);
      const groups = Object.entries(M.groups).filter(([g]) => pageInds().some((i) => i.group === g));
      topicDD = RadarDD.single({ label: "Topic", value: state.topic, items: [{ key: "all", label: "All topics" }].concat(groups.map(([g, l]) => ({ key: g, label: l }))), onChange: (k) => { state.topic = k; renderCmpTiles(); writeHash(); } });
      nodes.push(topicDD.el);
      nodes.push(el("span", "fb-sp"));
      const vs = el("div", "vsw"); vs.setAttribute("role", "group"); vs.setAttribute("aria-label", "Show indicators as");
      [["cards", "Cards", '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>'], ["list", "List", '<path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke-linecap="round"/>']].forEach(([k, t, ic]) => {
        const b = el("button"); b.type = "button"; b.setAttribute("aria-pressed", String(state.lay === k)); b.title = k === "list" ? "Show as a compact list" : "Show as cards";
        b.innerHTML = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' + ic + "</svg>"; b.appendChild(el("span", null, t));
        b.addEventListener("click", () => { if (state.lay === k) return; state.lay = k; try { localStorage.setItem("radar.trendsView", k); } catch (e) {} [...vs.children].forEach((x) => x.setAttribute("aria-pressed", String(x === b))); renderCmpTiles(); });
        vs.appendChild(b);
      });
      nodes.push(vs);
      const ib = el("div", "mb-pop mb-ind"); ib.appendChild(el("span", "fl", "In chart")); ib.appendChild(indicatorNode()); nodes.push(ib);
    } else nodes.push(el("span", "fb-sp"));
    const pb = el("div", "mb-pop"); pb.appendChild(el("span", "fl", "Period")); pb.appendChild(periodNode()); nodes.push(pb);
    bar.replaceChildren(...nodes);
    if (keepFocus) { const q = $("tq"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }

  // ---------- compare chart ----------
  function indexed(ind) {
    const pts = ind.series.filter((p) => inSel(p[0]));
    if (pts.length < 2) return [];
    const base = pts[0][1];
    return base ? pts.map((p) => ({ d: p[0], v: (100 * p[1]) / base, raw: p[1] })) : [];
  }

  // ---- time axis: years / quarters / months (values are averaged per period) ----
  const QN = (m) => Math.floor((+m.slice(5, 7) - 1) / 3) + 1;
  function effGran(nMonths) { return state.gran !== "auto" ? state.gran : nMonths <= 36 ? "month" : nMonths <= 96 ? "quarter" : "year"; }
  const bucketOf = (d, g) => (g === "year" ? d.slice(0, 4) : g === "quarter" ? d.slice(0, 4) + "-Q" + QN(d) : d.slice(0, 7));
  const bucketLabel = (b, g) => (g === "year" ? b : g === "quarter" ? b.slice(5) + " " + b.slice(0, 4) : fmtMonth(b));
  function aggregate(pts, g) {
    if (g === "month") return pts.map((p) => ({ ...p, d: p.d.slice(0, 7), b: p.d.slice(0, 7) }));
    const m = new Map();
    pts.forEach((p) => { const b = bucketOf(p.d, g); if (!m.has(b)) m.set(b, []); m.get(b).push(p); });
    return [...m.entries()].map(([b, arr]) => {
      const ds = arr.map((p) => toN(p.d)); const mid = fromN(Math.round((Math.min(...ds) + Math.max(...ds)) / 2));
      return { d: mid, b, v: arr.reduce((a, p) => a + p.v, 0) / arr.length, raw: arr.reduce((a, p) => a + p.raw, 0) / arr.length, n: arr.length };
    });
  }
  let curG = "month";
  function renderGran(nMonths) {
    const box = $("gran"); box.replaceChildren();
    const eff = effGran(nMonths);
    [["auto", "Auto"], ["year", "Years"], ["quarter", "Quarters"], ["month", "Months"]].forEach(([k, label]) => {
      const b = el("button", null, label); b.type = "button"; b.setAttribute("aria-pressed", String(state.gran === k));
      if (k === "auto") b.appendChild(el("small", null, eff === "year" ? "years" : eff === "quarter" ? "quarters" : "months"));
      b.title = k === "auto" ? "Choose automatically from the period length" : "Show one value per " + k + (k === "month" ? "" : " (average of its months)");
      b.addEventListener("click", () => { state.gran = k; renderChart(); writeHash(); });
      box.appendChild(b);
    });
  }
  function renderChart() {
    const box = $("chart"); box.replaceChildren();
    const legend = $("legend"); legend.replaceChildren();
    const start = periodStart();
    const byId = Object.fromEntries(M.indicators.map((i) => [i.id, i]));
    const nMonths = start ? monthRange(start, periodEnd()).length : 0;
    const G = effGran(nMonths); renderGran(nMonths); curG = G;
    const sel = state.cmp.map((id) => byId[id]).filter((i) => i && chartable(i)).map((i) => ({ ind: i, pts: start ? aggregate(indexed(i), G) : [], color: colorOf[i.id] }));
    const lines = sel.filter((l) => l.pts.length);
    const gaps = sel.filter((l) => !l.pts.length);
    renderTable(lines);
    gaps.forEach((l) => {
      const b = el("button", "lg off"); b.type = "button"; b.title = "Not enough data in this period (published " + l.ind.freq + "). Click to remove.";
      const i = el("i"); i.style.background = l.color;
      b.append(i, el("span", null, shortName(l.ind) + " – no data in period"), el("span", "x", "×"));
      b.addEventListener("click", () => toggle(l.ind.id));
      legend.appendChild(b);
    });
    if (!start || !lines.length) {
      box.appendChild(el("div", "empty", !M.indicators.some(chartable) ? "Market data arrives with the next weekly run of the GitHub Action." : gaps.length ? "The selected indicators have too few values in this period – choose a longer period." : "Tick indicators in the side panel (or the box on a card) to compare them here."));
      return;
    }
    if (lines.length > MAX_LINES) { renderMultiples(box, lines, start); return; }
    lines.slice().reverse().forEach((l) => legend.prepend(legendChip(l)));
    function legendChip(l) {
      const b = el("button", "lg"); b.type = "button"; b.title = "Remove from chart";
      const i = el("i"); i.style.background = l.color;
      b.append(i, el("span", null, shortName(l.ind)), el("span", "x", "×"));
      b.addEventListener("click", () => toggle(l.ind.id));
      return b;
    }

    const W = Math.max(320, box.clientWidth || 800), H = box.clientWidth < 600 ? 240 : 300;
    // right margin = width of the longest end label (measured), so names are not cut off
    const ctx = (renderChart._c = renderChart._c || document.createElement("canvas")).getContext("2d");
    ctx.font = "600 12px " + getComputedStyle(box).fontFamily;
    const endText = (l) => Math.round(l.pts[l.pts.length - 1].v) + " " + shortName(l.ind);
    const need = Math.max(...lines.map((l) => ctx.measureText(endText(l)).width)) + 16;
    const m = { t: 12, r: Math.min(need, W * 0.34), b: G === "year" ? 26 : 44, l: 40 }; // months/quarters: extra row for the years
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Indexed comparison chart" });
    const months = monthRange(start, periodEnd());
    const t0 = start, t1 = months[months.length - 1];
    const x = (d) => m.l + ((toN(d) - toN(t0)) / Math.max(1, toN(t1) - toN(t0))) * (W - m.l - m.r);
    const all = lines.flatMap((l) => l.pts.map((p) => p.v)).concat([100]);
    let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.08 || 5; lo -= pad; hi += pad;
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);

    const step = niceStep((hi - lo) / 5);
    const grid = svgEl("g", { class: "grid" });
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      grid.appendChild(svgEl("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
      const t = svgEl("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }); t.textContent = Math.round(v); grid.appendChild(t);
    }
    svg.appendChild(grid);
    const base = svgEl("g", { class: "base" }); base.appendChild(svgEl("line", { x1: m.l, x2: W - m.r, y1: y(100), y2: y(100) })); svg.appendChild(base);
    // x axis in two rows: months (or quarters) in grey, the year in bold underneath, centred on its months.
    // Every second year gets a light band and each new year a solid line, so the years are easy to find.
    const xl = svgEl("g");
    const buckets = [...new Set(months.map((d) => bucketOf(d, G)))];
    const mid = (b) => { const ds = months.filter((d) => bucketOf(d, G) === b); return fromN(Math.round((toN(ds[0]) + toN(ds[ds.length - 1])) / 2)); };
    const room = Math.max(1, Math.floor((W - m.l - m.r) / (G === "month" ? 34 : G === "quarter" ? 30 : 44)));
    const every = Math.max(1, Math.ceil(buckets.length / room));
    const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const evM = every <= 1 ? 1 : every <= 2 ? 2 : every <= 3 ? 3 : every <= 6 ? 6 : 12; // month labels on a regular rhythm (every 2nd, 3rd … month)
    if (G !== "year") {
      const halfM = months.length > 1 ? (x(months[1]) - x(months[0])) / 2 : 0;
      const bands = svgEl("g", { class: "ybands" });
      const yrs = [...new Set(months.map((d) => d.slice(0, 4)))];
      yrs.forEach((yr) => {
        const ds = months.filter((d) => d.startsWith(yr));
        const xa = Math.max(m.l, x(ds[0]) - halfM), xb = Math.min(W - m.r, x(ds[ds.length - 1]) + halfM);
        if (+yr % 2 === 0) bands.appendChild(svgEl("rect", { x: xa, y: m.t, width: Math.max(0, xb - xa), height: H - m.t - m.b, class: "yband" }));
        if (ds[0] !== months[0]) xl.appendChild(svgEl("line", { x1: xa, x2: xa, y1: m.t, y2: H - 4, class: "ysep" }));
        if (xb - xa > 26) { const t = svgEl("text", { x: (xa + xb) / 2, y: H - 6, "text-anchor": "middle", class: "yl" }); t.textContent = yr; xl.appendChild(t); }
      });
      svg.insertBefore(bands, svg.firstChild);
    }
    buckets.forEach((b, k) => {
      if (G === "month" ? (+b.slice(5, 7) - 1) % evM : k % every) return;
      const at = G === "month" ? b : mid(b);
      if (x(at) > W - m.r + 4) return;
      const t = svgEl("text", { x: x(at), y: G === "year" ? H - 6 : H - 25, "text-anchor": "middle", class: G === "year" ? "yl" : null });
      t.textContent = G === "year" ? b : G === "quarter" ? b.slice(5) : MONS[+b.slice(5, 7) - 1];
      xl.appendChild(t);
    });
    svg.appendChild(xl);
    // lines + end labels (de-overlapped)
    const ends = [];
    // soft gradient under each line (shadcn-style area chart); fainter when many lines overlap
    const fill = lines.length <= 2 ? 0.26 : lines.length <= 4 ? 0.16 : 0.1;
    const firstLine = svg.lastChild;
    lines.forEach((l) => {
      // a gap in the selected months breaks the line instead of bridging it
      const segs = [];
      l.pts.forEach((p, k) => {
        const prev = l.pts[k - 1];
        const broken = !prev || (G === "month"
          ? monthRange(fromN(toN(prev.d) + 1), fromN(Math.max(toN(prev.d) + 1, toN(p.d) - 1))).some((m) => toN(m) < toN(p.d) && !state.sel.has(m))
          : buckets.indexOf(p.b) - buckets.indexOf(prev.b) > 1);
        if (broken) segs.push([]);
        segs[segs.length - 1].push([x(p.d), y(p.v)]);
      });
      segs.forEach((sg) => RadarViz.area(svg, sg, H - m.b, l.color, fill, firstLine && firstLine.nextSibling));
      const d = segs.map((sg) => RadarViz.path(sg)).join("");
      svg.appendChild(svgEl("path", { class: "line", stroke: l.color, d }));
      if (G !== "month" && l.pts.length <= 40) l.pts.forEach((p) => svg.appendChild(svgEl("circle", { cx: x(p.d), cy: y(p.v), r: 2.6, fill: l.color })));
      const last = l.pts[l.pts.length - 1];
      svg.appendChild(svgEl("circle", { cx: x(last.d), cy: y(last.v), r: 3.5, fill: l.color, stroke: "var(--d-fff-border, #fff)", "stroke-width": 2 }));
      ends.push({ y: y(last.v), x: x(last.d), text: endText(l), full: l.ind.label });
    });
    ends.sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 15) ends[k].y = ends[k - 1].y + 15;
    ends.forEach((e) => {
      const t = svgEl("text", { class: "end", x: Math.min(e.x, W - m.r) + 8, y: e.y + 4 });
      let txt = e.text; while (txt.length > 6 && ctx.measureText(txt).width > m.r - 12) txt = txt.slice(0, -2);
      t.textContent = txt === e.text ? txt : txt.trimEnd() + "…";
      const ti = svgEl("title"); ti.textContent = e.full; t.appendChild(ti); svg.appendChild(t);
    });

    // hover: crosshair + tooltip
    const xh = svgEl("line", { class: "xh", y1: m.t, y2: H - m.b, visibility: "hidden" }); svg.appendChild(xh);
    const hit = svgEl("rect", { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: "transparent" }); svg.appendChild(hit);
    box.appendChild(svg);
    const tip = el("div", "tip"); tip.hidden = true; box.appendChild(tip);
    const move = (ev) => {
      const r = svg.getBoundingClientRect(); const px = ((ev.clientX - r.left) / r.width) * W;
      let best = null, bd = 1e9;
      const cands = G === "month" ? months : buckets.map(mid);
      cands.forEach((d) => { const dd = Math.abs(x(d) - px); if (dd < bd) { bd = dd; best = d; } });
      const bb = bucketOf(best, G);
      const rows = lines.map((l) => { let p = null; l.pts.forEach((q) => { if (G === "month" ? q.d.slice(0, 7) <= best : q.b === bb) p = q; }); return { l, p }; }).filter((r2) => r2.p);
      if (!rows.length) { tip.hidden = true; xh.setAttribute("visibility", "hidden"); return; }
      xh.setAttribute("x1", x(best)); xh.setAttribute("x2", x(best)); xh.setAttribute("visibility", "visible");
      tip.replaceChildren(el("b", null, bucketLabel(G === "month" ? best : bb, G) + (G === "month" ? "" : " · average")));
      rows.forEach(({ l, p }) => {
        const row = el("div"); const s = el("span"); const i = el("i"); i.style.background = l.color; s.append(i, document.createTextNode(shortName(l.ind)));
        row.append(s, el("em", null, Math.round(p.v) + "  ·  " + fmtVal(p.raw, l.ind.unit))); tip.appendChild(row);
      });
      tip.hidden = false;
      const left = (x(best) / W) * r.width; const tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(r.width - tw, left + (left > r.width / 2 ? -tw - 12 : 12))) + "px";
      tip.style.top = "8px";
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerleave", () => { tip.hidden = true; xh.setAttribute("visibility", "hidden"); });
  }
  // More than 6 indicators: one small chart each, all on the same index scale (first month = 100)
  function renderMultiples(box, lines, start) {
    const months = monthRange(start, periodEnd());
    const t0 = months[0], t1 = months[months.length - 1];
    const all = lines.flatMap((l) => l.pts.map((p) => p.v)).concat([100]);
    let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.06 || 5; lo -= pad; hi += pad;
    box.appendChild(el("p", "sm-note", `${lines.length} indicators – one small chart each, all on the same index scale (${fmtMonth(start)} = 100, dashed line). Click a title for details.`));
    const grid = el("div", "sm-grid");
    const W = 260, H = 86, L = 2, R = 2, T = 4, B = 14;
    const x = (d) => L + ((toN(d) - toN(t0)) / Math.max(1, toN(t1) - toN(t0))) * (W - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    lines.forEach((l) => {
      const card = el("div", "sm");
      const h = el("div", "sm-h");
      const t = el("button", "t", shortName(l.ind)); t.type = "button"; t.title = l.ind.label + " – open details"; t.addEventListener("click", () => openInd(l.ind));
      const xb = el("button", "x", "×"); xb.type = "button"; xb.title = "Remove from chart"; xb.setAttribute("aria-label", "Remove " + shortName(l.ind)); xb.addEventListener("click", () => toggle(l.ind.id));
      h.append(t, xb);
      const last = l.pts[l.pts.length - 1];
      const v = el("div", "sm-v"); v.append(el("b", null, String(Math.round(last.v))), document.createTextNode(" · " + fmtVal(last.raw, l.ind.unit) + " " + unitLabel(l.ind.unit) + " · " + fmtDate(last.d, l.ind)));
      const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", role: "img", "aria-label": shortName(l.ind) + " indexed" });
      svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y(100), y2: y(100), stroke: "var(--d-c9ced6-border, #c9ced6)", "stroke-dasharray": "3 3", "vector-effect": "non-scaling-stroke" }));
      const sp = l.pts.map((p) => [x(p.d), y(p.v)]);
      RadarViz.area(svg, sp, H - B, SM_COLOR, 0.24);
      svg.appendChild(svgEl("path", { d: RadarViz.path(sp), fill: "none", stroke: SM_COLOR, "stroke-width": 2, "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke" }));
      const tip = el("div", "sm-tip"); tip.hidden = true;
      svg.addEventListener("pointermove", (ev) => {
        const r = svg.getBoundingClientRect(); const px = ((ev.clientX - r.left) / r.width) * W;
        let best = l.pts[0], bd = 1e9; l.pts.forEach((p) => { const dd = Math.abs(x(p.d) - px); if (dd < bd) { bd = dd; best = p; } });
        tip.hidden = false; tip.style.left = (x(best.d) / W) * 100 + "%"; tip.style.top = (y(best.v) / H) * 86 + 30 + "px";
        tip.textContent = fmtDate(best.d, l.ind) + ": " + Math.round(best.v) + " · " + fmtVal(best.raw, l.ind.unit);
      });
      svg.addEventListener("pointerleave", () => { tip.hidden = true; });
      card.append(h, v, svg, tip);
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }
  // Shared line chart in the Trends style (smooth lines, soft gradient areas, end labels, crosshair + tooltip).
  // Draws into an element that is already on the page, so the SVG matches its real width (text is not scaled).
  // o = { keys: [x keys], series: [{ name, color, vals: [number|null], end?, width?, dash? }], height, base?, refs?: [{ v, label, color }],
  //       yFmt(v), xLabel(key, k) → text|null, sep(key, k) → true for a year separator, tipTitle(key), tipVal(series, v), lo?, hi? }
  function trendChart(box, o) {
    box.replaceChildren();
    const W = Math.max(320, box.clientWidth || 800), H = o.height || (box.clientWidth < 600 ? 240 : 280);
    const n = o.keys.length;
    const ctx = (trendChart._c = trendChart._c || document.createElement("canvas")).getContext("2d");
    ctx.font = "600 12px " + getComputedStyle(box).fontFamily;
    const lastOf = (sr) => { for (let k = n - 1; k >= 0; k--) if (sr.vals[k] != null) return k; return -1; };
    const ends = o.series.map((sr) => ({ sr, k: lastOf(sr) })).filter((e) => e.k >= 0).map((e) => ({ ...e, text: sr2end(e.sr, e.sr.vals[e.k]) }))
      .concat((o.refs || []).map((r) => ({ ref: r, text: r.label })));
    function sr2end(sr, v) { return sr.end ? sr.end(v) : o.yFmt(v) + " " + sr.name; }
    const need = Math.max(0, ...ends.map((e) => ctx.measureText(e.text).width)) + 16;
    const m = { t: 12, r: Math.min(need, W * 0.34), b: 26, l: 44 };
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.label || "Chart" });
    svg.style.height = H + "px";
    const x = (k) => m.l + (k / Math.max(1, n - 1)) * (W - m.l - m.r);
    const all = o.series.flatMap((sr) => sr.vals.filter((v) => v != null)).concat(o.base != null ? [o.base] : [], (o.refs || []).map((r) => r.v));
    let lo = o.lo != null ? o.lo : Math.min(...all), hi = o.hi != null ? o.hi : Math.max(...all);
    if (o.lo == null || o.hi == null) { const pad = (hi - lo) * 0.08 || 5; if (o.lo == null) lo -= pad; if (o.hi == null) hi += pad; }
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
    const step = niceStep((hi - lo) / 5);
    const grid = svgEl("g", { class: "grid" });
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
      grid.appendChild(svgEl("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
      const t = svgEl("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }); t.textContent = o.yFmt(v); grid.appendChild(t);
    }
    svg.appendChild(grid);
    if (o.base != null) { const b = svgEl("g", { class: "base" }); b.appendChild(svgEl("line", { x1: m.l, x2: W - m.r, y1: y(o.base), y2: y(o.base) })); svg.appendChild(b); }
    const room = Math.max(1, Math.floor((W - m.l - m.r) / 46));
    const every = o.thin === false ? 1 : Math.max(1, Math.ceil(n / room));
    o.keys.forEach((key, k) => {
      if (o.sep && k && o.sep(key, k)) svg.appendChild(svgEl("line", { x1: x(k), x2: x(k), y1: m.t, y2: H - m.b, stroke: "var(--d-eef0f3-border, #eef0f3)" }));
      const txt = o.xLabel(key, k, every); if (txt == null) return;
      const t = svgEl("text", { x: x(k), y: H - 6, "text-anchor": "middle" }); t.textContent = txt; svg.appendChild(t);
    });
    (o.refs || []).forEach((r) => svg.appendChild(svgEl("line", { x1: m.l, x2: W - m.r, y1: y(r.v), y2: y(r.v), stroke: r.color, "stroke-width": 1.6, "stroke-dasharray": "5 4" })));
    const fill = o.series.length <= 2 ? 0.26 : o.series.length <= 4 ? 0.14 : 0.1;
    const firstLine = svg.lastChild;
    o.series.forEach((sr) => {
      const segs = [[]];
      sr.vals.forEach((v, k) => { if (v == null) { if (segs[segs.length - 1].length) segs.push([]); return; } segs[segs.length - 1].push([x(k), y(v)]); });
      if (sr.area !== false) segs.forEach((sg) => RadarViz.area(svg, sg, H - m.b, sr.color, fill, firstLine && firstLine.nextSibling));
      const ln = svgEl("path", { class: "line", stroke: sr.color, d: segs.map((sg) => RadarViz.path(sg)).join("") });
      if (sr.width) ln.setAttribute("stroke-width", sr.width);
      svg.appendChild(ln);
      const k = lastOf(sr); if (k >= 0) svg.appendChild(svgEl("circle", { cx: x(k), cy: y(sr.vals[k]), r: 3.5, fill: sr.color, stroke: "var(--d-fff-border, #fff)", "stroke-width": 2 }));
    });
    const lab = ends.map((e) => ({ y: e.ref ? y(e.ref.v) : y(e.sr.vals[e.k]), x: e.ref ? W - m.r : x(e.k), text: e.text })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < lab.length; k++) if (lab[k].y - lab[k - 1].y < 15) lab[k].y = lab[k - 1].y + 15;
    lab.forEach((e) => {
      const t = svgEl("text", { class: "end", x: Math.min(e.x, W - m.r) + 8, y: e.y + 4 });
      let txt = e.text; while (txt.length > 6 && ctx.measureText(txt).width > m.r - 12) txt = txt.slice(0, -2);
      t.textContent = txt === e.text ? txt : txt.trimEnd() + "…";
      const ti = svgEl("title"); ti.textContent = e.text; t.appendChild(ti); svg.appendChild(t);
    });
    const xh = svgEl("line", { class: "xh", y1: m.t, y2: H - m.b, visibility: "hidden" }); svg.appendChild(xh);
    const hit = svgEl("rect", { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: "transparent" }); svg.appendChild(hit);
    box.appendChild(svg);
    const tip = el("div", "tip"); tip.hidden = true; box.appendChild(tip);
    hit.addEventListener("pointermove", (ev) => {
      const r = svg.getBoundingClientRect(); const px = ((ev.clientX - r.left) / r.width) * W;
      const k = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (n - 1))));
      const rows = o.series.filter((sr) => sr.vals[k] != null);
      if (!rows.length) { tip.hidden = true; xh.setAttribute("visibility", "hidden"); return; }
      xh.setAttribute("x1", x(k)); xh.setAttribute("x2", x(k)); xh.setAttribute("visibility", "visible");
      tip.replaceChildren(el("b", null, o.tipTitle(o.keys[k])));
      rows.forEach((sr) => { const row = el("div"); const sp = el("span"); const i = el("i"); i.style.background = sr.color; sp.append(i, document.createTextNode(sr.name)); row.append(sp, el("em", null, o.tipVal ? o.tipVal(sr, sr.vals[k]) : o.yFmt(sr.vals[k]))); tip.appendChild(row); });
      if (o.tipExtra) { const ex = o.tipExtra(k); if (ex) tip.appendChild(ex); }
      tip.hidden = false;
      const left = (x(k) / W) * r.width; const tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(r.width - tw, left + (left > r.width / 2 ? -tw - 12 : 12))) + "px";
      tip.style.top = "8px";
    });
    hit.addEventListener("pointerleave", () => { tip.hidden = true; xh.setAttribute("visibility", "hidden"); });
  }
  function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
  const trunc = (s, n) => (s.length > n ? s.slice(0, Math.max(4, n - 1)) + "…" : s);
  function shortName(i) {
    return { ppi_tissue: "Tissue PPI", ppi_pulp: "Pulp PPI", ppi_paper: "Paper PPI", prod_paper: "Paper output", us_recovered_paper: "Recovered paper (US)", us_wood_pulp: "Wood pulp (US)", pulp_nbsk_eu: "Pulp NBSK (EU imp.)", pulp_bhkp_eu: "Pulp BHKP (EU imp.)", rcp_export_eu: "Recovered paper (EU exp.)", power_de_spot: "Power DE spot", rcp_occ_exp: "OCC (EU exp.)", rcp_white_exp: "White grades (EU exp.)", rcp_news_exp: "News & PAMS (EU exp.)", rcp_mixed_exp: "Mixed papers (EU exp.)", rcp_occ_intra: "OCC (intra-EU)", rcp_white_intra: "White grades (intra-EU)", de_rcp_102: "DE 1.02 mixed", de_rcp_104: "DE 1.04 packaging", de_rcp_403: "DE 4.03 kraft corrugated", de_rcp_111: "DE 1.11 deinking", ppi_corrugated: "Corrugated PPI (EU)", us_recycled_board: "Recycled board (US)", us_corrugated_boxes: "Corrugated boxes (US)", gas_ttf: "Gas TTF", elec_de: "Electricity DE", gas_de: "Gas DE", res_share_de: "Renewables DE", eua: "EUA", eurusd: "EUR/USD", de_ppi_pulp: "Pulp PPI (DE)", de_ppi_tissue: "Tissue PPI (DE)", de_ppi_gas: "Gas for industry (DE)", de_ppi_power: "Power for industry (DE)", de_ppi_diesel: "Diesel (DE)", de_labour_paper: "Labour cost, manuf. (DE)", de_prod_paper: "Paper production (DE)", de_retail_drug: "Drugstore sales (DE)", de_retail_food: "Supermarket sales (DE)", de_imp_tissue: "Tissue imports (DE)", de_exp_tissue: "Tissue exports (DE)", de_imp_pulp: "Pulp imports (DE)", mix_wind: "Wind share (DE)", mix_solar: "Solar share (DE)", mix_biomass: "Biomass share (DE)", mix_hydro: "Hydro & other RE (DE)", mix_gas: "Gas share (DE)", mix_coal: "Coal share (DE)", mix_other: "Other conventional (DE)", prof_water: "Water use, paper", prof_waste: "Waste, paper & print", prof_envinv: "Environmental investment, paper", prof_energy_total: "Energy use, paper" }[i.id] || (i.country ? "Grid " + i.country : i.label);
  }

  function renderTable(lines) {
    const t = $("dtable"); t.replaceChildren();
    if (!lines.length) { $("tbl-btn").hidden = true; return; }
    $("tbl-btn").hidden = false;
    const key = (p) => p.b || p.d.slice(0, 7);
    const dates = [...new Set(lines.flatMap((l) => l.pts.map(key)))].sort().reverse();
    const table = el("table"); const hr = el("tr"); hr.appendChild(el("th", null, curG === "year" ? "Year (average)" : curG === "quarter" ? "Quarter (average)" : "Month"));
    lines.forEach((l) => hr.appendChild(el("th", null, shortName(l.ind) + " (index)")));
    const thead = el("thead"); thead.appendChild(hr); table.appendChild(thead);
    const tb = el("tbody");
    dates.forEach((d) => { const tr = el("tr"); tr.appendChild(el("td", null, curG === "month" ? fmtMonth(d) : bucketLabel(d, curG))); lines.forEach((l) => { const p = l.pts.find((q) => key(q) === d); tr.appendChild(el("td", null, p ? p.v.toFixed(1) : "")); }); tb.appendChild(tr); });
    table.appendChild(tb); t.appendChild(table);
  }

  // ---------- tiles ----------
  function yoy(ind) {
    const s = ind.series; if (!s || s.length < 2) return null;
    const last = s[s.length - 1]; const target = monthsBack(last[0].slice(0, 7), 12);
    const prev = s.find((p) => p[0].slice(0, 7) === target);
    // a % change needs a positive base (some recovered-paper indices go negative) – otherwise show the change in points
    return prev && prev[1] ? { pct: (100 * (last[1] - prev[1])) / prev[1], pp: last[1] - prev[1], pts: prev[1] < 0 } : null;
  }
  function spark(ind, color) {
    let pts = ind.series.filter((p) => inSel(p[0]));
    if (pts.length < 3) pts = ind.series.slice(-6); // half-yearly data: show the last three years
    const svg = svgEl("svg", { class: "spark", viewBox: "0 0 200 34", "aria-hidden": "true" });
    if (pts.length < 2) return svg;
    const vs = pts.map((p) => p[1]); const lo = Math.min(...vs), hi = Math.max(...vs) || 1;
    const sp = pts.map((p, k) => [(k / (pts.length - 1)) * 198 + 1, 31 - ((p[1] - lo) / (hi - lo || 1)) * 26]);
    const c = color || "var(--d-335777-text, #335777)";
    RadarViz.area(svg, sp, 34, c, 0.3);
    svg.appendChild(svgEl("path", { d: RadarViz.path(sp), fill: "none", stroke: c, "stroke-width": 2, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }));
    return svg;
  }
  function tile(ind) {
    const can = chartable(ind);
    const sel = state.cmp.includes(ind.id);
    const t = el("div", "tile" + (can ? "" : " static") + (sel ? " sel" : ""));
    t.tabIndex = 0; t.setAttribute("role", "button"); t.title = "Open: history and what it means for WEPA";
    t.setAttribute("aria-label", ind.label + " – open details");
    t.addEventListener("click", (e) => { if (!e.target.closest("a, .pin")) openInd(ind); });
    t.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === t) openInd(ind); });
    if (sel) t.style.setProperty("--sel", colorOf[ind.id]);
    t.appendChild(el("div", "lbl", ind.label));
    if (ind.esrs && !can) { t.classList.add("has-tag"); t.appendChild(el("span", "tag", ind.esrs)); }
    if (can) {
      const p = el("button", "pin", sel ? "✓" : ""); p.type = "button"; p.setAttribute("role", "checkbox"); p.setAttribute("aria-checked", String(sel));
      p.title = sel ? "Remove from the Trends chart" : "Add to the Trends chart"; p.setAttribute("aria-label", p.title + " – " + ind.label);
      if (sel && LIGHT.has(colorOf[ind.id])) p.style.color = "var(--d-002d55-text, #002d55)";
      p.addEventListener("click", (e) => { e.stopPropagation(); toggle(ind.id); });
      t.appendChild(p);
    }
    if (!hasData(ind)) {
      t.appendChild(el("div", "na", "No data yet – arrives with the next data update."));
    } else {
      const last = ind.series[ind.series.length - 1];
      const v = el("div", "val"); v.append(el("b", null, fmtVal(last[1], ind.unit)), el("small", null, unitLabel(ind.unit) + " · " + fmtDate(last[0], ind)));
      t.appendChild(v);
      const c = yoy(ind);
      if (c) {
        const up = c.pts ? c.pp > 0 : c.pct > 0.05, dn = c.pts ? c.pp < 0 : c.pct < -0.05;
        const ch = el("div", "chg");
        ch.append(el("span", "a", up ? "▲" : dn ? "▼" : "▬"), document.createTextNode((c.pts ? `${c.pp > 0 ? "+" : ""}${c.pp.toFixed(1)} pts` : ind.unit === "%" ? `${c.pp > 0 ? "+" : ""}${c.pp.toFixed(1)} pp` : `${c.pct > 0 ? "+" : ""}${c.pct.toFixed(1)} %`) + (ind.freq === "yearly" ? " vs. previous year" : " vs. a year ago")));
        t.appendChild(ch);
      } else if (ind.source === "manual" && ind.notes && ind.notes.length) {
        t.appendChild(el("div", "note", ind.notes[ind.notes.length - 1].note || ""));
      }
      if (ind.status === "stale") t.appendChild(el("div", "warn", "Last update failed – showing the previous values."));
      if (can) t.appendChild(spark(ind, sel ? colorOf[ind.id] : null));
    }
    if (ind.short) { const w = el("div", "wepa"); w.title = ind.short; const sp = el("span", null, ind.short); w.append(el("b", null, "For WEPA"), sp); if (!can || !hasData(ind)) w.style.marginTop = "auto"; t.appendChild(w); }
    const src = el("div", "src");
    src.appendChild(el("span", null, `${ind.attribution} · ${ind.freq}`));
    const a = el("a", null, "Source ↗"); a.href = (ind.source === "manual" && ind.notes && ind.notes.length && ind.notes[ind.notes.length - 1].url) || ind.link; a.target = "_blank"; a.rel = "noopener";
    src.appendChild(a); t.appendChild(src);
    return t;
  }
  // compact list row (Trends › List view): pick for the chart, name, latest value, change, sparkline
  function indRow(ind) {
    const can = chartable(ind), sel = state.cmp.includes(ind.id);
    const r = el("div", "irow" + (sel ? " sel" : ""));
    r.tabIndex = 0; r.setAttribute("role", "button"); r.setAttribute("aria-label", ind.label + " – open details");
    r.addEventListener("click", (e) => { if (!e.target.closest("a, .pin")) openInd(ind); });
    r.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === r) openInd(ind); });
    if (sel) r.style.setProperty("--sel", colorOf[ind.id]);
    if (can) {
      const p = el("button", "pin", sel ? "✓" : ""); p.type = "button"; p.setAttribute("role", "checkbox"); p.setAttribute("aria-checked", String(sel));
      p.title = sel ? "Remove from the Trends chart" : "Add to the Trends chart"; p.setAttribute("aria-label", p.title + " – " + ind.label);
      if (sel && LIGHT.has(colorOf[ind.id])) p.style.color = "var(--d-002d55-text, #002d55)";
      p.addEventListener("click", (e) => { e.stopPropagation(); toggle(ind.id); });
      r.appendChild(p);
    } else r.appendChild(el("span", "pin off"));
    const n = el("div", "ir-n"); n.append(el("b", null, ind.label), el("small", null, (ind.attribution || "").split(/[,(]/)[0].trim() + " · " + ind.freq)); r.appendChild(n);
    if (!hasData(ind)) { r.appendChild(el("span", "ir-na", "No data yet")); return r; }
    const last = ind.series[ind.series.length - 1];
    const v = el("div", "ir-v"); v.append(el("b", null, fmtVal(last[1], ind.unit) + " "), el("small", null, unitLabel(ind.unit) + " · " + fmtDate(last[0], ind))); r.appendChild(v);
    r.appendChild(el("span", "ir-c", yoy(ind) ? chgText(ind) : "–"));
    const sg = signal(ind); r.appendChild(sg ? el("span", "sig " + sg.cls, sg.text) : el("span"));
    r.appendChild(can ? spark(ind, sel ? colorOf[ind.id] : null) : el("span"));
    return r;
  }
  function toggle(id) {
    if (state.cmp.includes(id)) state.cmp = state.cmp.filter((c) => c !== id);
    else if (state.cmp.length < MAX_SEL) state.cmp.push(id);
    renderAll();
  }
  // "Select all" per category: all on, or all off when they are already all on
  function toggleGroup(ids) {
    const allOn = ids.every((id) => state.cmp.includes(id));
    if (allOn) state.cmp = state.cmp.filter((id) => !ids.includes(id));
    else ids.forEach((id) => { if (!state.cmp.includes(id) && state.cmp.length < MAX_SEL) state.cmp.push(id); });
    renderAll();
  }
  // Grid carbon intensity: one ranked table (12-month averages smooth out the seasons), tiles below
  function avg12(ind, offset) {
    const s = ind.series; if (!s || s.length < 12 + offset) return null;
    const part = s.slice(s.length - 12 - offset, s.length - offset);
    return part.reduce((a, p) => a + p[1], 0) / part.length;
  }
  function gridTable(items) {
    const rows = items.filter((i) => hasData(i)).map((i) => ({ i, now: avg12(i, 0), prev: avg12(i, 12) })).filter((r) => r.now != null);
    if (!rows.length) return null;
    const eu = rows.find((r) => r.i.id === "grid_eu");
    rows.sort((a, b) => b.now - a.now);
    const maxV = Math.max(...rows.map((r) => r.now));
    const last = rows[0].i.series[rows[0].i.series.length - 1][0];
    const box = el("div", "panel gt");
    const head = el("div", "gt-head");
    head.append(el("span", null, `g CO₂/kWh · 12-month average to ${fmtMonth(last)} · Ember (CC BY 4.0)`));
    box.appendChild(head);
    const wrap = el("div", "dtable"); const t = el("table", "gtt");
    const hr = el("tr"); ["Country", "12-month average", "vs. previous 12 months", "Trend 5 years", eu ? "× EU average" : ""].forEach((h) => hr.appendChild(el("th", null, h)));
    const thead = el("thead"); thead.appendChild(hr); t.appendChild(thead);
    const tb = el("tbody");
    rows.forEach(({ i, now, prev }) => {
      const sel = state.cmp.includes(i.id);
      const tr = el("tr", (i.id === "grid_eu" ? "ref" : "") + (sel ? " sel" : ""));
      tr.tabIndex = 0; tr.title = "Show the history";
      if (sel) tr.style.setProperty("--sel", colorOf[i.id]);
      tr.addEventListener("click", () => openInd(i)); tr.addEventListener("keydown", (e) => { if (e.key === "Enter") openInd(i); });
      tr.appendChild(el("td", null, i.id === "grid_eu" ? "EU average" : i.country || i.label));
      const bar = el("div", "gbar"); const b = el("i"); b.style.width = Math.max(2, (now / maxV) * 180) + "px";
      bar.append(el("b", null, Math.round(now).toString()), b);
      const td1 = el("td"); td1.appendChild(bar); tr.appendChild(td1);
      const pct = prev ? (100 * (now - prev)) / prev : null;
      tr.appendChild(el("td", "num", pct == null ? "–" : `${pct > 0.05 ? "▲" : pct < -0.05 ? "▼" : "▬"} ${pct > 0 ? "+" : ""}${pct.toFixed(1)} %`));
      const roll = []; const s = i.series.slice(-71);
      for (let k = 11; k < s.length; k++) roll.push(s.slice(k - 11, k + 1).reduce((a, p) => a + p[1], 0) / 12);
      const td3 = el("td"); td3.appendChild(sparkVals(roll)); tr.appendChild(td3);
      tr.appendChild(el("td", "num", eu && i.id !== "grid_eu" ? (now / eu.now).toFixed(1) + " ×" : ""));
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); box.appendChild(wrap);
    return box;
  }
  // ---- Pop-up for any indicator: key numbers, explanation for WEPA, history chart, yearly averages ----
  let ABOUT = {}, GRID_ABOUT = null, IND = null, COST = null; // from config/market.json (loaded with the data)
  function aboutBlock(ind) {
    const a = ind.group === "grid" ? GRID_ABOUT : ABOUT[ind.id] || ind.about;
    if (!a) return null;
    const box = el("div", "gd-about");
    const ico = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
    const EYE = ico('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'), LIM = ico('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>');
    [["What it shows", a.what, EYE], ["For WEPA", a.wepa, ""], ["Limits", a.limits, LIM]].forEach(([h, t, icon], n) => {
      if (!t) return; const d = el("div", "ab" + n); const hb = el("b"); hb.innerHTML = icon; hb.appendChild(document.createTextNode(h)); d.append(hb, el("p", null, t)); box.appendChild(d);
    });
    return box;
  }
  function openInd(ind) {
    const isGrid = ind.group === "grid";
    const all = M.indicators;
    const s = (ind.series || []).filter((p) => p[1] != null);
    const eu = isGrid ? all.find((x) => x.id === "grid_eu") : null;
    const name = isGrid ? (ind.id === "grid_eu" ? "EU average" : ind.country || ind.label) + " · grid carbon intensity" : ind.label;
    const u = unitLabel(ind.unit);
    $("gd-title").textContent = name;
    $("gd-sub").textContent = isGrid ? "g CO₂ per kWh of electricity generated · monthly · Ember (CC BY 4.0)" : [u, ind.freq, ind.attribution].filter(Boolean).join(" · ");
    const body = $("gd-body"); body.replaceChildren();
    const ab = aboutBlock(ind);
    if (s.length < 2) {
      if (s.length === 1) { const k1 = el("div", "gd-kpis"); const d = el("div"); d.append(document.createTextNode("Latest · " + fmtDate(s[0][0], ind)), el("b", null, fmtVal(s[0][1], ind.unit) + " " + u)); k1.appendChild(d); body.appendChild(k1); }
      if (ab) body.appendChild(ab);
      (ind.notes || []).slice().reverse().forEach((n) => body.appendChild(el("p", "empty", fmtDate(n.date, ind) + " · " + (n.note || ""))));
      if (!s.length) body.appendChild(el("p", "empty", "No data yet – arrives with the next run of the data update."));
      body.appendChild(srcFoot(ind)); $("gdlg").showModal(); return;
    }
    if (!isGrid) return openSeries(ind, s, body, ab);
    const roll = (arr) => arr.map((p, k) => (k < 11 ? null : [p[0], arr.slice(k - 11, k + 1).reduce((a, q) => a + q[1], 0) / 12]));
    const r12 = roll(s).filter(Boolean);
    const euMap = eu && eu !== ind ? new Map(roll(eu.series.filter((p) => p[1] != null)).filter(Boolean).map((p) => [p[0].slice(0, 7), p[1]])) : null;
    // key numbers
    const now = r12[r12.length - 1], yAgo = r12[r12.length - 13], first = r12[0];
    const k = el("div", "gd-kpis");
    const kp = (label, val) => { const d = el("div"); d.append(document.createTextNode(label), el("b", null, val)); return d; };
    k.append(kp("12-month average to " + fmtMonth(now[0]), Math.round(now[1]) + " g"),
      kp("vs. a year earlier", yAgo ? ((now[1] - yAgo[1]) / yAgo[1] * 100 > 0 ? "+" : "") + ((now[1] - yAgo[1]) / yAgo[1] * 100).toFixed(1) + " %" : "–"),
      kp("vs. " + first[0].slice(0, 4) + " (12-month avg.)", ((now[1] - first[1]) / first[1] * 100 > 0 ? "+" : "") + ((now[1] - first[1]) / first[1] * 100).toFixed(0) + " %"),
      kp("Lowest / highest month", Math.round(Math.min(...s.map((p) => p[1]))) + " / " + Math.round(Math.max(...s.map((p) => p[1])))));
    body.appendChild(k);
    if (ab) body.appendChild(ab);
    // legend + chart
    const lg = el("div", "gd-lg");
    const li = (c, t, dash) => { const x = el("span"); const i = el("i"); i.style.background = dash ? "repeating-linear-gradient(90deg," + c + " 0 4px,transparent 4px 7px)" : c; x.append(i, document.createTextNode(t)); return x; };
    lg.append(li("#96d2dc", "Monthly value"), li("#0064aa", "12-month average"));
    if (euMap) lg.appendChild(li("#8a94a3", "EU average (12-month)", true));
    body.appendChild(lg);
    const box = el("div", "gd-chart");
    const W = 840, H = 260, L = 44, R = 12, T = 10, B = 26;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": name + " grid carbon intensity history" });
    const xs = s.map((p) => p[0]);
    const vals = s.map((p) => p[1]).concat(euMap ? [...euMap.values()] : []);
    const hi = Math.max(...vals) * 1.05, lo = Math.max(0, Math.min(...vals) * 0.9);
    const x = (idx) => L + (idx / (xs.length - 1)) * (W - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const step = niceStep((hi - lo) / 4);
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "var(--d-eef0f3-border, #eef0f3)" }));
      const t = svgEl("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 11, fill: "var(--d-8a94a3-text, #8a94a3)" }); t.textContent = Math.round(v); svg.appendChild(t);
    }
    xs.forEach((d, idx) => { if (d.slice(5, 7) === "01") { const t = svgEl("text", { x: x(idx), y: H - 6, "text-anchor": "middle", "font-size": 11, fill: "var(--d-8a94a3-text, #8a94a3)" }); t.textContent = d.slice(0, 4); svg.appendChild(t); svg.appendChild(svgEl("line", { x1: x(idx), x2: x(idx), y1: T, y2: H - B, stroke: "var(--d-f3f4f6-border, #f3f4f6)" })); } });
    const path = (pts, attrs) => svg.appendChild(svgEl("path", Object.assign({ d: pts.map((p, n) => (n ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(""), fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round" }, attrs)));
    const idxOf = new Map(xs.map((d, n) => [d.slice(0, 7), n]));
    path(s.map((p, n) => [x(n), y(p[1])]), { stroke: "var(--d-96d2dc-border, #96d2dc)", "stroke-width": 1.6 });
    if (euMap) path([...euMap.entries()].filter(([m]) => idxOf.has(m)).map(([m, v]) => [x(idxOf.get(m)), y(v)]), { stroke: "var(--d-8a94a3-text, #8a94a3)", "stroke-width": 1.6, "stroke-dasharray": "5 4" });
    path(r12.map((p) => [x(idxOf.get(p[0].slice(0, 7))), y(p[1])]), { stroke: "var(--d-0064aa-text, #0064aa)", "stroke-width": 2.6 });
    // hover
    const hl = svgEl("line", { y1: T, y2: H - B, stroke: "var(--d-002d55-text, #002d55)", "stroke-width": 1, opacity: 0 }); svg.appendChild(hl);
    const tip = el("div", "gd-tip"); tip.hidden = true;
    const r12Map = new Map(r12.map((p) => [p[0].slice(0, 7), p[1]]));
    svg.addEventListener("pointermove", (ev) => {
      const rc = svg.getBoundingClientRect(); const px = ((ev.clientX - rc.left) / rc.width) * W;
      const n = Math.max(0, Math.min(xs.length - 1, Math.round(((px - L) / (W - L - R)) * (xs.length - 1))));
      const m = xs[n].slice(0, 7);
      hl.setAttribute("x1", x(n)); hl.setAttribute("x2", x(n)); hl.setAttribute("opacity", 1);
      tip.hidden = false; tip.style.left = (x(n) / W) * 100 + "%"; tip.style.top = (y(s[n][1]) / H) * 100 + "%";
      tip.textContent = fmtMonth(xs[n]) + ": " + Math.round(s[n][1]) + " g" + (r12Map.has(m) ? " · 12-mo. " + Math.round(r12Map.get(m)) : "") + (euMap && euMap.has(m) ? " · EU " + Math.round(euMap.get(m)) : "");
    });
    svg.addEventListener("pointerleave", () => { hl.setAttribute("opacity", 0); tip.hidden = true; });
    box.append(svg, tip); body.appendChild(box);
    // yearly averages
    const years = [...new Set(s.map((p) => p[0].slice(0, 4)))];
    const t = el("table", "gd-yr"); const hr = el("tr");
    ["Year", "Average g CO₂/kWh", "vs. previous year", "Months", euMap ? "× EU average" : ""].forEach((h) => hr.appendChild(el("th", null, h)));
    const th = el("thead"); th.appendChild(hr); t.appendChild(th);
    const tb = el("tbody"); let prev = null;
    const euYear = (yr) => { if (!eu) return null; const v = eu.series.filter((p) => p[0].startsWith(yr) && p[1] != null); return v.length ? v.reduce((a, p) => a + p[1], 0) / v.length : null; };
    years.forEach((yr) => {
      const v = s.filter((p) => p[0].startsWith(yr)); const avg = v.reduce((a, p) => a + p[1], 0) / v.length;
      const tr = el("tr"); const e = euYear(yr);
      tr.append(el("td", null, yr + (v.length < 12 ? " *" : "")), el("td", null, Math.round(avg).toString()),
        el("td", null, prev ? ((avg - prev) / prev * 100 > 0 ? "+" : "") + ((avg - prev) / prev * 100).toFixed(1) + " %" : "–"),
        el("td", null, String(v.length)), el("td", null, euMap && e ? (avg / e).toFixed(2) + " ×" : ""));
      tb.prepend(tr); prev = avg;
    });
    t.appendChild(tb); const wrap = el("div"); wrap.style.overflowX = "auto"; wrap.appendChild(t); body.appendChild(wrap);
    body.appendChild(srcFoot(ind, "* incomplete year. Source: Ember, monthly electricity data (CC BY 4.0)."));
    $("gdlg").showModal();
  }
  // footer: source link + add to / remove from the Trends chart
  function srcFoot(ind, text) {
    const foot = el("div", "gd-foot");
    const sp = el("span", null, text || ("Source: " + (ind.attribution || "") + " "));
    if (!text && ind.link) { const a = el("a", null, "open ↗"); a.href = ind.link; a.target = "_blank"; a.rel = "noopener"; sp.appendChild(a); }
    foot.appendChild(sp);
    if (chartable(ind)) {
      const on = state.cmp.includes(ind.id);
      const add = el("button", "gd-add" + (on ? " on" : ""), on ? "✓ In the Trends chart – remove" : "Add to Trends chart"); add.type = "button";
      add.addEventListener("click", () => { toggle(ind.id); $("gdlg").close(); });
      foot.appendChild(add);
    }
    return foot;
  }
  // Non-grid indicators: one line in its own unit, hover values, yearly averages
  function openSeries(ind, s, body, ab) {
    const u = unitLabel(ind.unit);
    const last = s[s.length - 1], first = s[0];
    const c = yoy(ind);
    const k = el("div", "gd-kpis");
    const kp = (label, val) => { const d = el("div"); d.append(document.createTextNode(label), el("b", null, val)); return d; };
    const pct = (a, b) => ((a - b) / Math.abs(b) * 100 > 0 ? "+" : "") + ((a - b) / Math.abs(b) * 100).toFixed(1) + " %";
    k.append(kp("Latest · " + fmtDate(last[0], ind), fmtVal(last[1], ind.unit) + (ind.unit === "index" ? "" : " " + u)),
      kp("vs. a year earlier", c ? (c.pts ? (c.pp > 0 ? "+" : "") + c.pp.toFixed(1) + " pts" : ind.unit === "%" ? (c.pp > 0 ? "+" : "") + c.pp.toFixed(1) + " pp" : (c.pct > 0 ? "+" : "") + c.pct.toFixed(1) + " %") : "–"),
      kp("vs. " + fmtDate(first[0], ind), ind.unit === "%" ? ((last[1] - first[1]) > 0 ? "+" : "") + (last[1] - first[1]).toFixed(1) + " pp" : pct(last[1], first[1])),
      kp("Lowest / highest", fmtVal(Math.min(...s.map((p) => p[1])), ind.unit) + " / " + fmtVal(Math.max(...s.map((p) => p[1])), ind.unit)));
    body.appendChild(k);
    if (ab) body.appendChild(ab);
    const box = el("div", "gd-chart");
    const W = 840, H = 240, L = 52, R = 12, T = 10, B = 26;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": ind.label + " history" });
    const xs = s.map((p) => p[0]);
    const vals = s.map((p) => p[1]);
    const span = Math.max(...vals) - Math.min(...vals) || Math.abs(vals[0]) || 1;
    const hi = Math.max(...vals) + span * 0.08, lo = Math.min(...vals) - span * 0.08;
    const x = (idx) => L + (xs.length === 1 ? 0 : (idx / (xs.length - 1)) * (W - L - R));
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const step = niceStep((hi - lo) / 4);
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "var(--d-eef0f3-border, #eef0f3)" }));
      const t = svgEl("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 11, fill: "var(--d-8a94a3-text, #8a94a3)" }); t.textContent = fmtVal(Math.abs(v) < step / 1e6 ? 0 : v, ind.unit === "index" ? "%" : ind.unit); svg.appendChild(t);
    }
    let lastYear = null;
    xs.forEach((d, idx) => { const yr = d.slice(0, 4); if (yr !== lastYear) { lastYear = yr; const t = svgEl("text", { x: x(idx), y: H - 6, "text-anchor": "middle", "font-size": 11, fill: "var(--d-8a94a3-text, #8a94a3)" }); t.textContent = yr; svg.appendChild(t); svg.appendChild(svgEl("line", { x1: x(idx), x2: x(idx), y1: T, y2: H - B, stroke: "var(--d-f3f4f6-border, #f3f4f6)" })); } });
    const dp = s.map((p, n) => [x(n), y(p[1])]);
    RadarViz.area(svg, dp, H - B, "var(--d-0064aa-text, #0064aa)", 0.24);
    svg.appendChild(svgEl("path", { d: RadarViz.path(dp), fill: "none", stroke: "var(--d-0064aa-text, #0064aa)", "stroke-width": 2.4, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    if (s.length < 30) s.forEach((p, n) => svg.appendChild(svgEl("circle", { cx: x(n), cy: y(p[1]), r: 3, fill: "var(--d-0064aa-text, #0064aa)" })));
    const hl = svgEl("line", { y1: T, y2: H - B, stroke: "var(--d-002d55-text, #002d55)", "stroke-width": 1, opacity: 0 }); svg.appendChild(hl);
    const tip = el("div", "gd-tip"); tip.hidden = true;
    svg.addEventListener("pointermove", (ev) => {
      const rc = svg.getBoundingClientRect(); const px = ((ev.clientX - rc.left) / rc.width) * W;
      const n = Math.max(0, Math.min(xs.length - 1, Math.round(((px - L) / (W - L - R)) * (xs.length - 1))));
      hl.setAttribute("x1", x(n)); hl.setAttribute("x2", x(n)); hl.setAttribute("opacity", 1);
      tip.hidden = false; tip.style.left = (x(n) / W) * 100 + "%"; tip.style.top = (y(s[n][1]) / H) * 100 + "%";
      tip.textContent = fmtDate(xs[n], ind) + ": " + fmtVal(s[n][1], ind.unit) + (ind.unit === "index" ? "" : " " + u);
    });
    svg.addEventListener("pointerleave", () => { hl.setAttribute("opacity", 0); tip.hidden = true; });
    box.append(svg, tip); body.appendChild(box);
    // yearly averages
    const years = [...new Set(xs.map((d) => d.slice(0, 4)))];
    const t = el("table", "gd-yr"); const hr = el("tr");
    ["Year", "Average" + (ind.unit === "index" ? " (index)" : " · " + u), "vs. previous year", "Values"].forEach((h) => hr.appendChild(el("th", null, h)));
    const th = el("thead"); th.appendChild(hr); t.appendChild(th);
    const tb = el("tbody"); let prev = null;
    const full = ind.freq === "half-yearly" ? 2 : 12;
    years.forEach((yr) => {
      const v = s.filter((p) => p[0].startsWith(yr)); const avg = v.reduce((a, p) => a + p[1], 0) / v.length;
      const tr = el("tr");
      tr.append(el("td", null, yr + (v.length < full ? " *" : "")), el("td", null, fmtVal(avg, ind.unit)),
        el("td", null, prev == null ? "–" : ind.unit === "%" ? ((avg - prev) > 0 ? "+" : "") + (avg - prev).toFixed(1) + " pp" : pct(avg, prev)), el("td", null, String(v.length)));
      tb.prepend(tr); prev = avg;
    });
    t.appendChild(tb); const wrap = el("div"); wrap.style.overflowX = "auto"; wrap.appendChild(t); body.appendChild(wrap);
    body.appendChild(srcFoot(ind));
    if (ind.status === "stale") body.insertBefore(el("p", "gd-warn", "The last update of this indicator failed – showing the previous values."), body.firstChild);
    $("gdlg").showModal();
  }
  function sparkVals(vals) {
    const svg = svgEl("svg", { class: "gsp", viewBox: "0 0 110 24", "aria-hidden": "true" });
    if (vals.length < 2) return svg;
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const vp = vals.map((v, k) => [2 + (k / (vals.length - 1)) * 106, 21 - ((v - lo) / (hi - lo || 1)) * 18]);
    RadarViz.area(svg, vp, 24, "var(--d-335777-text, #335777)", 0.28);
    svg.appendChild(svgEl("path", { d: RadarViz.path(vp), fill: "none", stroke: "var(--d-335777-text, #335777)", "stroke-width": 2, "stroke-linejoin": "round" }));
    return svg;
  }

  $("gd-x").addEventListener("click", () => $("gdlg").close());
  $("gdlg").addEventListener("click", (ev) => { if (ev.target === $("gdlg")) $("gdlg").close(); });
  // ---------- Cost driver index ----------
  const COST_KEY = "radar.costWeights";
  function costWeights() {
    let saved = {}; try { saved = JSON.parse(localStorage.getItem(COST_KEY) || "{}") || {}; } catch (e) {}
    const w = {}; COST.components.forEach((c) => { w[c.key] = saved[c.key] != null ? +saved[c.key] : c.weight; });
    w.other = saved.other != null ? +saved.other : COST.other;
    return w;
  }
  function seriesMap(id) { const i = M.indicators.find((x) => x.id === id); return i && i.series && i.series.length > 1 ? new Map(i.series.map((p) => [p[0].slice(0, 7), p[1]])) : null; }
  // value at month m, carried forward up to 'gap' months (statistics are published with a delay)
  function at(map, m, gap) { for (let k = 0; k <= gap; k++) { const v = map.get(fromN(toN(m) - k)); if (v != null) return v; } return null; }
  function computeCost() {
    const W = costWeights();
    const fx = seriesMap("eurusd");
    const comps = COST.components.map((c) => {
      const id = c.ids.find((x) => seriesMap(x)); if (!id) return { ...c, id: null, w: W[c.key] || 0 };
      let map = seriesMap(id);
      if (c.usd && fx) { const m2 = new Map(); map.forEach((v, k) => { const r = at(fx, k, 2); if (r) m2.set(k, v / r); }); map = m2; }
      return { ...c, id, map, gap: c.gap || 2, w: W[c.key] || 0, ind: M.indicators.find((x) => x.id === id) };
    });
    const months = selSorted();
    const usable = comps.filter((c) => c.map && c.w > 0);
    const base = months.find((m) => usable.every((c) => at(c.map, m, c.gap) != null));
    if (!base) return { comps, W, rows: [] };
    const totalW = usable.reduce((a, c) => a + c.w, 0) + (W.other || 0);
    const ppi = seriesMap(COST.compare);
    const ppiBase = ppi ? at(ppi, base, 2) : null;
    const rows = [];
    months.filter((m) => m >= base).forEach((m) => {
      const vals = usable.map((c) => at(c.map, m, c.gap));
      if (vals.some((v) => v == null)) return;
      const idx = (usable.reduce((a, c, k) => a + c.w * (vals[k] / at(c.map, base, c.gap)), 0) + (W.other || 0)) / totalW * 100;
      const p = ppi && ppiBase ? at(ppi, m, 0) : null;
      rows.push({ m, idx, ppi: p != null ? (p / ppiBase) * 100 : null, parts: usable.map((c, k) => ({ key: c.key, ratio: vals[k] / at(c.map, base, c.gap) })) });
    });
    return { comps, usable, W, totalW, base, rows };
  }
  // Caution banner (styles in theme.css): title + text or list items
  function cautionBox(title, lines) {
    const box = el("div", "caution"); box.setAttribute("role", "note");
    box.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18 17H2Z"/><path d="M10 8v4.2" stroke-linecap="round"/><circle cx="10" cy="14.6" r=".9" fill="currentColor" stroke="none"/></svg>';
    const tx = el("div"); tx.appendChild(el("b", null, title));
    if (lines.length === 1) tx.appendChild(el("p", null, lines[0]));
    else { const ul = el("ul"); lines.forEach((l) => ul.appendChild(el("li", null, l))); tx.appendChild(ul); }
    box.appendChild(tx); return box;
  }
  function cautionShort(title, summary, lines) {
    const box = el("div", "caution short"); box.setAttribute("role", "note");
    box.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18 17H2Z"/><path d="M10 8v4.2" stroke-linecap="round"/><circle cx="10" cy="14.6" r=".9" fill="currentColor" stroke="none"/></svg>';
    const tx = el("div"); const line = el("div"); line.append(el("b", null, title), document.createTextNode(summary)); tx.appendChild(line);
    const d = el("details"); d.appendChild(el("summary", null, "Details"));
    const ul = el("ul"); lines.forEach((l) => ul.appendChild(el("li", null, l))); d.appendChild(ul); tx.appendChild(d);
    box.appendChild(tx); return box;
  }
  function renderCost(host) {
    host.appendChild(cautionShort("Illustrative:", "public market data, not WEPA's cost structure.", [
      "The index is built only from public statistics (Eurostat, Destatis, FRED, SMARD). It contains no WEPA purchase prices, contracts, hedges or volumes.",
      "The weights are illustrative shares of a typical non-integrated tissue mill, not WEPA's real cost split. Changing them only changes your browser view.",
      "Use it to see the direction of input costs, not to judge WEPA's margin or to plan budgets.",
    ]));
    const R = computeCost();
    const draws = [];
    const sec = el("section", "panel ind-sec");
    const h = el("div", "ind-h"); h.append(el("h3", null, "Tissue cost driver index"), el("span", null, R.base ? fmtMonth(R.base) + " = 100" : ""));
    sec.appendChild(h);
    if (!R.rows.length) { sec.appendChild(el("div", "empty", "Not enough data for this period – choose a longer period, or wait for the next data update.")); host.appendChild(sec); return; }
    const last = R.rows[R.rows.length - 1], lastP = [...R.rows].reverse().find((r) => r.ppi != null);
    sec.appendChild(costStrip(R, last, lastP));
    // chart (same style as Trends)
    const box = el("div", "chart ind-chart"); sec.appendChild(box);
    const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    draws.push(() => trendChart(box, {
      label: "Tissue cost driver index vs. tissue price index",
      keys: R.rows.map((r) => r.m), base: 100,
      series: [
        { name: "Cost driver index", color: "#0064aa", vals: R.rows.map((r) => r.idx), end: (v) => Math.round(v) + " Cost index" },
        { name: "Tissue price index (EU)", color: "#33b09c", vals: R.rows.map((r) => (r.ppi == null ? null : r.ppi)), end: (v) => Math.round(v) + " Tissue price" },
      ],
      yFmt: (v) => String(Math.round(v)),
      sep: (key) => key.endsWith("-01"),
      xLabel: (key, k, every) => (k % every ? null : (key.endsWith("-01") || k === 0 ? MONS[+key.slice(5, 7) - 1] + " ’" + key.slice(2, 4) : MONS[+key.slice(5, 7) - 1])),
      tipTitle: (key) => fmtMonth(key),
      tipVal: (sr, v) => v.toFixed(1),
      tipExtra: (k) => { const r = R.rows[k]; if (r.ppi == null) return null; const d = el("div"); const g = r.ppi - r.idx; d.append(el("span", null, "Price minus cost"), el("em", null, (g > 0 ? "+" : "") + g.toFixed(1) + " pts")); return d; },
    }));
    // contributions + weights
    const t = el("table", "gd-yr cost-t"); const hr = el("tr");
    ["Input · public indicator used", "Weight %", "Change since " + fmtMonth(R.base), "Index points"].forEach((x2) => hr.appendChild(el("th", null, x2)));
    const th = el("thead"); th.appendChild(hr); t.appendChild(th);
    const tb = el("tbody");
    const W = costWeights();
    const save = (k2, v) => { const cur = costWeights(); cur[k2] = Math.max(0, +v || 0); try { localStorage.setItem(COST_KEY, JSON.stringify(cur)); } catch (e) {} renderTiles(); };
    const winput = (k2, v) => { const i = el("input"); i.type = "number"; i.min = 0; i.max = 100; i.step = 1; i.value = v; i.className = "w-in"; i.setAttribute("aria-label", "Weight " + k2); i.addEventListener("change", () => save(k2, i.value)); return i; };
    R.comps.forEach((c) => {
      const tr = el("tr");
      const part = last.parts.find((p) => p.key === c.key);
      const ch = part ? (part.ratio - 1) * 100 : null;
      const contrib = part ? (c.w * (part.ratio - 1) * 100) / R.totalW : null;
      const ind = el("td", "ct-in"); ind.appendChild(el("b", null, c.label));
      if (c.ind) { const a = el("button", "link", shortName(c.ind) + " · " + (c.ind.attribution || "").split(" (")[0].split(",")[0]); a.type = "button"; a.addEventListener("click", () => openInd(c.ind)); ind.appendChild(a); } else ind.appendChild(el("small", null, "no data yet"));
      const wt = el("td"); wt.appendChild(winput(c.key, W[c.key]));
      const top = contrib != null && contrib > 0 && contrib === Math.max(...R.comps.map((c2) => { const p2 = last.parts.find((p) => p.key === c2.key); return p2 ? (c2.w * (p2.ratio - 1) * 100) / R.totalW : -Infinity; }));
      tr.append(ind, wt, el("td", "num", ch == null ? "–" : (ch > 0 ? "+" : "") + ch.toFixed(1) + " %"), el("td", "num" + (top ? " ct-top" : ""), contrib == null ? "–" : (contrib > 0 ? "+" : "") + contrib.toFixed(1)));
      tb.appendChild(tr);
    });
    const tro = el("tr"); const wo = el("td"); wo.appendChild(winput("other", W.other));
    const io = el("td", "ct-in"); io.append(el("b", null, "Other costs (held constant)"), el("small", null, "chemicals, packaging, other …"));
    tro.append(io, wo, el("td", "num", "0 %"), el("td", "num", "0"));
    tb.appendChild(tro);
    t.appendChild(tb); const tw = el("div"); tw.style.overflowX = "auto"; tw.appendChild(t); sec.appendChild(tw);
    const note = el("p", "ind-src");
    const reset = el("button", "link", "Reset to default weights"); reset.type = "button"; reset.addEventListener("click", () => { try { localStorage.removeItem(COST_KEY); } catch (e) {} renderTiles(); });
    note.append(document.createTextNode("Weights are illustrative shares of cash cost (total " + Math.round(R.totalW) + ") and are saved only in your browser. Gas is converted to euro with EUR/USD; missing recent months are carried forward up to two months (labour costs, published quarterly, up to five). "), reset);
    sec.appendChild(note);
    host.appendChild(sec);
    draws.forEach((f) => f());
  }

  // ---------- Industry tab ----------
  function srcLink(src) { const a = el("a", null, (src && src.label) || "Source"); if (src && src.url) { a.href = src.url; a.target = "_blank"; a.rel = "noopener"; } return a; }
  function aboutOf(a) { if (!a) return null; return aboutBlock({ about: a, id: "" }); }
  // ---------- Water tab: river levels (PEGELONLINE) + soil moisture at the German mills (DWD) ----------
  // Levels and moisture are shown neutrally; only the status pill is coloured, because it is a judgement (low water / dry).
  const W_COL = "var(--d-0064aa-text, #0064aa)";
  const dayKey = (d) => d.slice(0, 10);
  function addDays(iso, n) { const [y, m, d] = iso.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); }
  function valueAgo(series, days) {
    if (!series.length) return null;
    const target = addDays(series[series.length - 1][0], -days);
    let best = null; series.forEach((p) => { if (p[0] <= target) best = p; });
    return best;
  }
  function gaugeStatus(g, v) {
    const c = g.characteristic || {};
    if (c.GlW != null && v < c.GlW) return { cls: "head", text: "Low water" };
    const th = (g.thresholds || []).slice().sort((a, b) => b.v - a.v).find((t) => v < t.v);
    if (th) return { cls: "head", text: "Below " + th.v + " cm" };
    if (c.MNW != null && v < c.MNW) return { cls: "head", text: "Below mean low water" };
    return { cls: "flat", text: "Normal" };
  }
  function soilStatus(v) {
    const S = (WATER && WATER.soil) || {}; const dry = S.dry != null ? S.dry : 50, very = S.veryDry != null ? S.veryDry : 30;
    if (v < very) return { cls: "head", text: "Very dry" };
    if (v < dry) return { cls: "head", text: "Dry" };
    return { cls: "flat", text: "Normal" };
  }
  const arrow = (d, unit, digits) => (d == null ? "" : (d > 0 ? "▲ " : d < 0 ? "▼ " : "▬ ") + Math.abs(d).toFixed(digits) + " " + unit);
  function dailyChart(box, series, o) {
    const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const keys = series.map((p) => p[0]);
    let shownYear = false;
    trendChart(box, {
      label: o.label, keys, height: o.height || 220, lo: o.lo, hi: o.hi,
      series: [{ name: o.name, color: W_COL, vals: series.map((p) => p[1]), end: (v) => Math.round(v) + " " + o.unit }],
      refs: o.refs || [],
      yFmt: (v) => String(Math.round(v)),
      sep: (key, k) => k > 0 && key.slice(0, 7) !== keys[k - 1].slice(0, 7) && key.slice(5, 7) === "01",
      xLabel: (key, k, every) => {
        const first = k === 0 || key.slice(0, 7) !== keys[k - 1].slice(0, 7);
        if (!first) return null;
        if (k === 0) { const nx = keys.findIndex((x) => x.slice(0, 7) !== key.slice(0, 7)); if (nx > 0 && nx < keys.length * 0.12) return null; }
        const m = +key.slice(5, 7);
        const step = keys.length > 400 ? 3 : keys.length > 200 ? 2 : 1;
        if (k > 0 && (m - 1) % step) return null;
        const withY = m === 1 || !shownYear; shownYear = true;
        return MONS[m - 1] + (withY ? " ’" + key.slice(2, 4) : "");
      },
      thin: false,
      tipTitle: (key) => fmtDay(key),
      tipVal: (sr, v) => v.toFixed(0) + " " + o.unit,
    });
  }
  function renderWater(host) {
    const draws = [];
    if (!WATER || (!(WATER.gauges || []).length && !(WATER.sites || []).length)) {
      const sec = el("section", "panel ind-sec");
      sec.appendChild(el("div", "empty", "Water data arrives with the next data update (scripts/collect_water.py)."));
      host.appendChild(sec); return;
    }
    // 1) river levels
    const gauges = (WATER.gauges || []).filter((g) => (g.series || []).length);
    if (gauges.length) {
      const sec = el("section", "panel ind-sec");
      const h = el("div", "ind-h"); h.append(el("h3", null, "River levels"), el("span", null, "daily mean in cm · PEGELONLINE (WSV, DL-DE→Zero-2.0)"));
      sec.appendChild(h);
      const k = el("div", "gd-kpis ind-k");
      gauges.forEach((g) => {
        const last = g.series[g.series.length - 1], wk = valueAgo(g.series, 7);
        const v = g.latest && g.latest.v != null ? g.latest.v : last[1];
        const st = gaugeStatus(g, v);
        const d = el("div"); d.append(document.createTextNode(g.label), el("b", null, Math.round(v) + " cm"));
        const sm = el("small", null, (wk ? arrow(v - wk[1], "cm", 0) + " vs. a week ago · " : "") + (g.latest && g.latest.t ? fmtDay(g.latest.t) : fmtDay(last[0])) + " ");
        sm.appendChild(el("span", "sig " + st.cls, st.text)); d.appendChild(sm); k.appendChild(d);
      });
      sec.appendChild(k);
      const wg = el("div", "w-grid"); sec.appendChild(wg);
      gauges.forEach((g) => {
        const wrap = el("div", "w-g");
        const c = g.characteristic || {};
        const refs = [];
        (g.thresholds || []).forEach((t) => refs.push({ v: t.v, label: t.v + " cm " + (t.short || "surcharges"), color: "var(--d-b45309-text, #b45309)" }));
        if (c.GlW != null) refs.push({ v: c.GlW, label: c.GlW + " cm GlW", color: "var(--d-8a4a33-text, #8a4a33)" });
        else if (c.MNW != null) refs.push({ v: c.MNW, label: c.MNW + " cm MNW", color: "var(--d-8a4a33-text, #8a4a33)" });
        const hh = el("div", "w-gh"); hh.append(el("b", null, g.label), el("span", null, g.series.length + " days" + (g.station ? " · gauge " + g.station : "")));
        wrap.appendChild(hh);
        const box = el("div", "chart ind-chart w-chart"); wrap.appendChild(box);
        draws.push(() => dailyChart(box, g.series, { label: "Water level " + g.label, name: g.label, unit: "cm", refs }));
        if (g.why) { const w = el("p", "wepa-l"); w.append(el("b", null, "For WEPA"), document.createTextNode(g.why.charAt(0).toUpperCase() + g.why.slice(1))); wrap.appendChild(w); }
        // GlW / MNW / MW are explained in the "?" guide; only our own thresholds are listed here
        const legend = (g.thresholds || []).map((t) => t.v + " cm: " + t.label);
        if (legend.length) wrap.appendChild(el("p", "ind-src", legend.join(" · ")));
        wg.appendChild(wrap);
      });
      const f = el("p", "ind-src"); f.append("Source: ");
      const a = el("a", null, "PEGELONLINE (WSV) ↗"); a.href = "https://www.pegelonline.wsv.de/"; a.target = "_blank"; a.rel = "noopener"; f.appendChild(a);
      f.appendChild(document.createTextNode(" · the history grows by one day with every data update."));
      sec.appendChild(f);
      host.appendChild(sec);
    }
    // 2) soil moisture at the mills
    const sites = (WATER.sites || []).filter((s) => (s.series || []).length);
    const sec = el("section", "panel ind-sec");
    const h = el("div", "ind-h"); h.append(el("h3", null, "Soil, heat and rain around our German mills"), el("span", null, "soil moisture in % of usable field capacity (nFK) · Deutscher Wetterdienst (CC BY 4.0)"));
    sec.appendChild(h);
    if (!sites.length) { sec.appendChild(el("div", "empty", "Soil moisture arrives with the next data update.")); host.appendChild(sec); draws.forEach((f) => f()); return; }
    const tw = el("div", "w-tw"); const t = el("table", "gd-yr w-t");
    const hasWx = !!(WEATHER && (WEATHER.sites || []).length);
    const hr = el("tr"); ["Mill", "Soil moisture", "vs. 30 days ago", "Status", "Soil, last 12 months"].concat(hasWx ? ["Hot days ≥ 30 °C", "Rain, last 30 days", "Last 12 weeks"] : []).forEach((x) => hr.appendChild(el("th", null, x)));
    const th = el("thead"); th.appendChild(hr); t.appendChild(th);
    const tb = el("tbody");
    const S = WATER.soil || {}; const dry = S.dry != null ? S.dry : 50;
    sites.forEach((s) => {
      const last = s.series[s.series.length - 1], ago = valueAgo(s.series, 30), st = soilStatus(last[1]);
      const tr = el("tr");
      const td0 = el("td"); td0.appendChild(el("b", null, s.name)); td0.appendChild(el("small", null, s.district)); tr.appendChild(td0);
      const td1 = el("td"); td1.appendChild(el("b", null, Math.round(last[1]) + " %")); td1.appendChild(el("small", null, fmtDay(last[0]))); tr.appendChild(td1);
      tr.appendChild(el("td", null, ago ? arrow(last[1] - ago[1], "pp", 0) : "–"));
      const td3 = el("td"); td3.appendChild(el("span", "sig " + st.cls, st.text)); tr.appendChild(td3);
      const td4 = el("td", "w-sp");
      const pts = s.series.filter((p) => p[0] >= addDays(last[0], -365));
      const svg = svgEl("svg", { class: "spark", viewBox: "0 0 200 34", "aria-label": "Soil moisture, last 12 months", role: "img" });
      if (pts.length > 1) {
        const hi = Math.max(110, ...pts.map((p) => p[1]));
        const sp = pts.map((p, k) => [(k / (pts.length - 1)) * 198 + 1, 31 - (Math.max(0, p[1]) / hi) * 28]);
        const yd = 31 - (dry / hi) * 28;
        svg.appendChild(svgEl("line", { x1: 0, x2: 200, y1: yd, y2: yd, stroke: "var(--d-b45309-text, #b45309)", "stroke-dasharray": "3 3", "stroke-width": 1, "vector-effect": "non-scaling-stroke" }));
        RadarViz.area(svg, sp, 34, W_COL, 0.28);
        svg.appendChild(svgEl("path", { d: RadarViz.path(sp), fill: "none", stroke: W_COL, "stroke-width": 2, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }));
      }
      td4.appendChild(svg); tr.appendChild(td4);
      tr.classList.add("w-click"); tr.tabIndex = 0; tr.setAttribute("role", "button"); tr.setAttribute("aria-label", s.name + ": open details");
      tr.addEventListener("click", () => openSite(s));
      tr.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openSite(s); } });
      td0.querySelector("b").appendChild(el("span", "w-more", " ›"));
      if (hasWx) {
        const wx = weatherOf(s.id);
        const yr = wx ? wx.last.slice(0, 4) : "";
        const th1 = el("td", "num"); if (wx) { th1.appendChild(el("b", null, String(wx.hotDays))); th1.appendChild(el("small", null, wx.hotNormal != null ? "normal " + Math.round(wx.hotNormal) + " by now · " + yr : yr)); } else th1.textContent = "–"; tr.appendChild(th1);
        const th2 = el("td", "num"); if (wx && wx.rain30Pct != null) { th2.appendChild(el("b", null, wx.rain30Pct + " %")); th2.appendChild(el("small", null, "of normal · " + wx.rain30 + " mm")); } else th2.textContent = wx && wx.rain30 != null ? wx.rain30 + " mm" : "–"; tr.appendChild(th2);
        const th3 = el("td"); if (wx) th3.appendChild(weekStrip(wx)); tr.appendChild(th3);
      }
      tb.appendChild(tr);
    });
    t.appendChild(tb); tw.appendChild(t); sec.appendChild(tw);
    if (hasWx) {
      const lg = el("div", "wk-legend"); [["dryhot", "Dry and hot"], ["dry", "Dry (less than a quarter of normal rain)"], ["hot", "Hot (a day ≥ 30 °C)"], ["ok", "Normal"]].forEach(([c, l]) => { const x = el("span"); x.append(el("i", "wk " + c), document.createTextNode(l)); lg.appendChild(x); });
      lg.appendChild(el("span", "pm", "one square per week, oldest left · normals " + (WEATHER.normalPeriod || "1991–2020")));
      sec.appendChild(lg);
    }
    const w = el("p", "wepa-l"); w.append(el("b", null, "For WEPA"), document.createTextNode("Heat and long dry spells come before low river levels, stricter limits on water abstraction and warmer cooling water. Below " + dry + " % soil moisture plants start to suffer; dashed line in the mini charts."));
    sec.appendChild(w);
    const f = el("p", "ind-src"); f.append("Source: ");
    const a = el("a", null, "DWD Climate Data Center ↗"); a.href = "https://opendata.dwd.de/climate_environment/CDC/derived_germany/soil/daily/"; a.target = "_blank"; a.rel = "noopener"; f.appendChild(a);
    f.appendChild(document.createTextNode(" · modelled soil moisture and daily station observations (max temperature, rain) at the nearest DWD stations to each mill (click a mill for details and the stations used) · mill sites from wepa.eu."));
    sec.appendChild(f);
    host.appendChild(sec);
    host.appendChild(intlSection());
    draws.forEach((f2) => f2());
  }
  // ---------- Gas storage (Energy & climate, GIE AGSI+) ----------
  // this year's fill level against the min–max range and the average of the five years before
  function gasStats(area) {
    const s = (GAS && GAS.areas && GAS.areas[area] && GAS.areas[area].series) || [];
    if (!s.length) return null;
    const last = s[s.length - 1], year = +last[0].slice(0, 4);
    const doy = (d) => { const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - Date.UTC(+d.slice(0, 4), 0, 1); return Math.min(364, Math.round(t / 864e5)); };
    const by = {};
    s.forEach(([d, v]) => { const y = +d.slice(0, 4); if (y >= year - 5 && y < year) (by[doy(d)] = by[doy(d)] || []).push(v); });
    const band = [];
    for (let k = 0; k < 365; k += 2) { const vs = [k, k + 1].flatMap((j) => by[j] || []); if (vs.length) band.push([k, Math.min(...vs), Math.max(...vs), vs.reduce((a, b) => a + b, 0) / vs.length]); }
    const cur = s.filter((p) => +p[0].slice(0, 4) === year).map(([d, v]) => [doy(d), v]);
    const near = (k) => band.reduce((b, x) => (Math.abs(x[0] - k) < Math.abs(b[0] - k) ? x : b), band[0] || [k, null, null, null]);
    const lastYear = s.filter((p) => +p[0].slice(0, 4) === year - 1).map(([d, v]) => [doy(d), v]);
    const ly = lastYear.reduce((b, x) => (Math.abs(x[0] - doy(last[0])) < Math.abs(b[0] - doy(last[0])) ? x : b), lastYear[0] || [0, null]);
    const wk = s.find((p) => p[0] >= addDays(last[0], -7));
    const n = near(doy(last[0]));
    return { last, year, band, cur, avgNow: n[3], minNow: n[1], maxNow: n[2], lastYear: ly[1], week: wk ? last[1] - wk[1] : null, years: Object.keys(s.reduce((a, p) => ((+p[0].slice(0, 4) < year) && (a[p[0].slice(0, 4)] = 1), a), {})).length };
  }
  function gasChart(box, st) {
    const W = Math.max(320, box.clientWidth || 800), H = 260, L = 38, R = 118, T = 12, B = 26;
    const x = (k) => L + (k / 364) * (W - L - R), y = (v) => T + (1 - v / 100) * (H - T - B);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Gas storage fill level this year against the last five years", class: "gas-svg" });
    [0, 25, 50, 75, 100].forEach((v) => {
      svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "var(--line-2)" }));
      const t = svgEl("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", class: "g-ax" }); t.textContent = v + " %"; svg.appendChild(t);
    });
    MON.forEach((m, k) => { const t = svgEl("text", { x: x(k * 30.4 + 15), y: H - 6, "text-anchor": "middle", class: "g-ax" }); t.textContent = m; svg.appendChild(t); });
    if (st.band.length > 2) {
      const up = st.band.map((b) => [x(b[0]), y(b[2])]), dn = st.band.map((b) => [x(b[0]), y(b[1])]).reverse();
      svg.appendChild(svgEl("path", { d: RadarViz.path(up) + " L" + dn.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L") + " Z", fill: "var(--d-e5e7eb-bg, #e5e7eb)", opacity: ".8" }));
      svg.appendChild(svgEl("path", { d: RadarViz.path(st.band.map((b) => [x(b[0]), y(b[3])])), fill: "none", stroke: "var(--ink-3)", "stroke-dasharray": "3 3", "stroke-width": 1.2 }));
      const lb = st.band[st.band.length - 1];
      const t1 = svgEl("text", { x: W - R + 6, y: y(lb[3]) + 4, class: "g-ax" }); t1.textContent = "5-year average"; svg.appendChild(t1);
      const t2 = svgEl("text", { x: W - R + 6, y: Math.max(T + 8, y(lb[2]) - 6), class: "g-ax" }); t2.textContent = "5-year range"; svg.appendChild(t2);
    }
    // 1 November: EU storage target of 90 % (Regulation (EU) 2022/1032, flexible since 2025)
    const nov = 304;
    svg.appendChild(svgEl("line", { x1: x(nov), x2: x(nov), y1: T, y2: H - B, stroke: "var(--d-b45309-text, #b45309)", "stroke-dasharray": "2 3" }));
    svg.appendChild(svgEl("circle", { cx: x(nov), cy: y(90), r: 3, fill: "none", stroke: "var(--d-b45309-text, #b45309)" }));
    const tt = svgEl("text", { x: x(nov) - 6, y: y(90) - 6, "text-anchor": "end", class: "g-ax g-warn" }); tt.textContent = "EU target 90 % · 1 Nov"; svg.appendChild(tt);
    if (st.cur.length > 1) {
      const pts = st.cur.map(([k, v]) => [x(k), y(v)]);
      svg.appendChild(svgEl("path", { d: RadarViz.path(pts), fill: "none", stroke: W_COL, "stroke-width": 2.4, "stroke-linejoin": "round" }));
      const lp = pts[pts.length - 1];
      svg.appendChild(svgEl("circle", { cx: lp[0], cy: lp[1], r: 4, fill: W_COL }));
      const t = svgEl("text", { x: lp[0] + 8, y: lp[1] + 4, class: "g-now" }); t.textContent = Math.round(st.last[1]) + " % " + st.year; svg.appendChild(t);
    }
    box.replaceChildren(svg);
  }
  function renderGas(host) {
    const sec = el("section", "panel ind-sec");
    if (!GAS || !GAS.areas || !Object.keys(GAS.areas).length) {
      sec.append(el("h3", null, "Gas storage"), el("div", "empty", "Gas storage data arrives with the next data update. It needs the GitHub secret AGSI_KEY (a free key from agsi.gie.eu)."));
      host.appendChild(sec); return;
    }
    const areas = Object.keys(GAS.areas);
    if (!areas.includes(state.gasArea)) state.gasArea = areas[0];
    const st = gasStats(state.gasArea);
    const h = el("div", "ind-h"); h.append(el("h3", null, "Gas storage · " + GAS.areas[state.gasArea].label), el("span", null, "% full · daily · GIE AGSI+"));
    const seg = el("span", "gran"); areas.forEach((a) => { const b = el("button", null, GAS.areas[a].label); b.type = "button"; b.setAttribute("aria-pressed", String(a === state.gasArea)); b.addEventListener("click", () => { state.gasArea = a; renderTiles(); }); seg.appendChild(b); });
    h.appendChild(seg); sec.appendChild(h);
    if (st) {
      const k = el("div", "gd-kpis ind-k");
      const kp = (label, v, sub) => { const d = el("div"); d.append(document.createTextNode(label), el("b", null, v)); if (sub) d.appendChild(el("small", null, sub)); return d; };
      const pp = (v) => (v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(1) + " pp");
      k.append(kp("Today · " + fmtDay(st.last[0]), st.last[1].toFixed(1) + " %", st.week != null ? arrow(st.week, "pp", 1) + " in a week" : ""),
        kp("vs. same day last year", pp(st.lastYear != null ? st.last[1] - st.lastYear : null)),
        kp("vs. 5-year average", pp(st.avgNow != null ? st.last[1] - st.avgNow : null), st.years < 5 ? "only " + st.years + " years of history so far" : ""));
      sec.appendChild(k);
      const box = el("div", "chart ind-chart gas-chart"); sec.appendChild(box); host.appendChild(sec);
      gasChart(box, st);
    } else host.appendChild(sec);
    const w = el("p", "wepa-l"); w.append(el("b", null, "For WEPA"), document.createTextNode("Storage below the usual range going into winter usually means higher and more volatile gas prices – the biggest energy cost of drying tissue."));
    sec.appendChild(w);
    const f = el("p", "ind-src"); f.append("Source: "); const a = el("a", null, "GIE AGSI+ ↗"); a.href = "https://agsi.gie.eu"; a.target = "_blank"; a.rel = "noopener"; f.append(a, document.createTextNode(" · grey band = lowest to highest level of the five years before, dashed = their average."));
    sec.appendChild(f);
  }

  // ---------- Fibre (Market): EU pulp imports by origin + EUDR country risk ----------
  function renderFibre(host) {
    const sec = el("section", "panel ind-sec");
    const prods = (PULP && PULP.products) || {};
    const keys = ["total", "bhkp", "nbsk"].filter((k) => prods[k] && (prods[k].rows || []).length);
    if (!keys.length) { sec.append(el("h3", null, "Where the EU's pulp comes from"), el("div", "empty", "Pulp import data arrives with the next data update (scripts/collect_pulp_origin.py).")); host.appendChild(sec); }
    else {
      if (!keys.includes(state.pulp)) state.pulp = keys[0];
      const P = prods[state.pulp];
      const h = el("div", "ind-h"); h.append(el("h3", null, "Where the EU's pulp comes from"), el("span", null, "share of import volume · " + fmtMonth(P.from) + " – " + fmtMonth(P.to) + " · " + P.totalKt.toLocaleString("en-GB") + " kt · Eurostat Comext"));
      const seg = el("span", "gran");
      [["total", "All chemical pulp"], ["bhkp", "Short fibre (BHKP)"], ["nbsk", "Long fibre (NBSK)"]].filter(([k]) => keys.includes(k)).forEach(([k, l]) => { const b = el("button", null, l); b.type = "button"; b.setAttribute("aria-pressed", String(k === state.pulp)); b.addEventListener("click", () => { state.pulp = k; renderTiles(); }); seg.appendChild(b); });
      h.appendChild(seg); sec.appendChild(h);
      const risk = (EUDR && EUDR.risk) || {};
      const top = P.rows.slice(0, 10), rest = P.rows.slice(10).reduce((a, r) => a + r.share, 0);
      const max = Math.max(...top.map((r) => r.share), 1);
      const list = el("div", "po-list");
      top.concat(rest > 0.05 ? [{ name: "Other countries", share: Math.round(rest * 10) / 10, other: true }] : []).forEach((r) => {
        const row = el("div", "po-r" + (r.other ? " other" : ""));
        const bar = el("span", "po-bar"); const fill = el("i"); fill.style.width = (100 * r.share / max).toFixed(1) + "%"; bar.appendChild(fill);
        const rk = risk[r.code];
        row.append(el("span", "n", r.name), bar, el("b", null, r.share.toFixed(1).replace(".0", "") + " %"),
          el("span", "c", r.change == null ? "" : (r.change > 0.05 ? "▲ +" : r.change < -0.05 ? "▼ −" : "▬ ") + Math.abs(r.change).toFixed(1) + " pp"),
          rk ? el("span", "risk " + rk, rk === "low" ? "Low risk" : rk === "high" ? "High risk" : "Standard risk") : el("span", "risk none", r.other ? "" : "–"));
        if (r.kt != null) row.title = r.name + ": " + r.kt.toLocaleString("en-GB") + " kt in 12 months";
        list.appendChild(row);
      });
      sec.appendChild(list);
      const w = el("p", "wepa-l"); w.append(el("b", null, "For WEPA"), document.createTextNode("Shows how concentrated the EU's pulp supply is – South America for short fibre, the Nordics and North America for long fibre – and which origins need deforestation-free proof under the EUDR. EU imports overall, not WEPA's own suppliers."));
      sec.appendChild(w);
      const f = el("p", "ind-src"); f.append("Source: ", srcLink(PULP.source), document.createTextNode(" · HS " + P.hs + ", imports of all EU countries incl. trade inside the EU · change against the 12 months before · EUDR risk: "), srcLink((EUDR && EUDR.source) || { label: "EU Commission" }), document.createTextNode(" (– = not set in config/eudr.json)"));
      sec.appendChild(f);
      host.appendChild(sec);
    }
    // fibre supply in Germany: pulp imports + recovered paper share
    const sup = el("section", "panel ind-sec");
    const rr = IND && IND.germanyRecoveredRate;
    sup.appendChild(el("div", "ind-h")).append(el("h3", null, "Recovered paper share in Germany"), el("span", null, "% of fibre input · yearly"));
    if (rr && rr.series) {
      const t = el("table", "gd-yr"); const hr = el("tr"); ["Grade", ...rr.years.slice(-6).map(String)].forEach((x) => hr.appendChild(el("th", null, x)));
      const th = el("thead"); th.appendChild(hr); t.appendChild(th); const tb = el("tbody");
      ["Hygiene papers", "All paper & board"].forEach((k) => { const v = rr.series[k]; if (!v) return; const tr = el("tr", k === "Hygiene papers" ? "us" : ""); tr.appendChild(el("td", null, k)); v.slice(-6).forEach((x) => tr.appendChild(el("td", null, x + " %"))); tb.appendChild(tr); });
      t.classList.add("yr-t"); t.appendChild(tb); const tw = el("div", "tw-x"); tw.appendChild(t); sup.appendChild(tw);
      const f = el("p", "ind-src"); f.append("Source: ", srcLink(rr.source)); sup.appendChild(f);
    }
    host.appendChild(sup);
  }

  // ---------- Shelf price vs. producer price (Market › Industry › Monthly) ----------
  function shelfPanel(draws) {
    const cpi = M.indicators.find((i) => i.id === "cpi_toilet_de"), ppi = M.indicators.find((i) => i.id === "de_ppi_tissue");
    const sec = el("section", "panel ind-sec");
    const h = el("div", "ind-h"); h.append(el("h3", null, "Shelf price vs. producer price"));
    sec.appendChild(h);
    if (!cpi || !hasData(cpi) || !ppi || !hasData(ppi)) {
      sec.appendChild(el("div", "empty", "The consumer price for toilet paper arrives with the next data update (Destatis)."));
      return sec;
    }
    const R = COST ? computeCost() : null;
    const cm = seriesMap("cpi_toilet_de"), pm = seriesMap("de_ppi_tissue");
    const costBy = new Map(R && R.rows ? R.rows.map((r) => [r.m, r.idx]) : []);
    const months = selSorted().filter((m) => cm.has(m) && pm.has(m));
    if (months.length < 3) { sec.appendChild(el("div", "empty", "Not enough overlapping months yet.")); return sec; }
    const b = months[0], cb = cm.get(b), pb = pm.get(b), kb = costBy.get(b);
    h.appendChild(el("span", null, "index, " + fmtMonth(b) + " = 100 · Destatis"));
    const box = el("div", "chart ind-chart"); sec.appendChild(box);
    const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const series = [
      { name: "Shelf price (toilet paper)", color: "#f4b49f", vals: months.map((m) => (100 * cm.get(m)) / cb), end: (v) => Math.round(v) + " Shelf price" },
      { name: "Producer price (tissue, DE)", color: "#33b09c", vals: months.map((m) => (100 * pm.get(m)) / pb), end: (v) => Math.round(v) + " Producer price" },
    ];
    if (kb) series.unshift({ name: "Input cost index", color: "#0064aa", vals: months.map((m) => (costBy.has(m) ? (100 * costBy.get(m)) / kb : null)), end: (v) => Math.round(v) + " Input costs" });
    draws.push(() => trendChart(box, {
      label: "Shelf price vs. producer price", keys: months, base: 100, series,
      yFmt: (v) => String(Math.round(v)), sep: (key) => key.endsWith("-01"),
      xLabel: (key, k, every) => (k % every ? null : (key.endsWith("-01") || k === 0 ? MONS[+key.slice(5, 7) - 1] + " ’" + key.slice(2, 4) : MONS[+key.slice(5, 7) - 1])),
      tipTitle: (key) => fmtMonth(key), tipVal: (sr, v) => v.toFixed(1),
    }));
    const w = el("p", "wepa-l"); w.append(el("b", null, "For WEPA"), document.createTextNode("If shelf prices rise while producer prices stay flat, retail keeps the margin; if both lag behind input costs, the squeeze sits with producers."));
    sec.appendChild(w);
    const f = el("p", "ind-src"); f.append("Consumer price index, single item toilet paper, and producer price index for household & sanitary paper: Destatis (dl-de/by-2-0). Input cost index: the illustrative index from the Costs page. The period follows the 3 years shown on the page.");
    sec.appendChild(f);
    return sec;
  }

  // ---------- Weather at the mills (DWD): hot days, rain vs. normal, 12-week strip ----------
  const WK_CLS = { dryhot: ["Dry and hot", "dryhot"], dry: ["Dry", "dry"], hot: ["Hot", "hot"], ok: ["Normal", "ok"], na: ["No data", "na"] };
  function weatherOf(id) { return ((WEATHER && WEATHER.sites) || []).find((x) => x.id === id) || null; }
  function weekStrip(wx) {
    const box = el("span", "wk-strip");
    (wx.weeks || []).forEach((w) => {
      const c = WK_CLS[w.cls] || WK_CLS.na; const i = el("i", "wk " + c[1]);
      i.title = "Week from " + fmtDay(w.start) + ": " + c[0] + (w.rain != null ? " · rain " + w.rain + " mm" + (w.rainNormal ? " (normal " + w.rainNormal + ")" : "") : "") + (w.tmax != null ? " · max " + Math.round(w.tmax) + " °C" : "");
      box.appendChild(i);
    });
    return box;
  }

  // ---- Pop-up for one mill: soil moisture over the full history, heat and rain, 12 weeks in detail ----
  function openSite(s) {
    const wx = weatherOf(s.id);
    const S = WATER.soil || {}; const dry = S.dry != null ? S.dry : 50, very = S.veryDry != null ? S.veryDry : 30;
    const ser = (s.series || []).filter((p) => p[1] != null);
    const last = ser[ser.length - 1], ago = valueAgo(ser, 30), yAgo = valueAgo(ser, 365), st = soilStatus(last[1]);
    $("gd-title").textContent = s.name + " · water & weather";
    const sub = [s.district];
    if (s.station) sub.push("soil: DWD station " + (s.station.name || s.station.id) + " (" + s.station.km + " km)");
    if (wx && wx.station) sub.push("weather: DWD station " + wx.station.name + " (" + wx.station.km + " km)");
    $("gd-sub").textContent = sub.join(" · ");
    const body = $("gd-body"); body.replaceChildren();
    // key numbers
    const k = el("div", "gd-kpis");
    const kp = (label, val, small, sig) => { const d = el("div"); d.append(document.createTextNode(label), el("b", null, val)); if (small || sig) { const sm = el("small", null, small || ""); if (sig) sm.appendChild(el("span", "sig " + sig.cls, sig.text)); d.appendChild(sm); } return d; };
    const pp = (a, b) => { const v = Math.round(a - b); return (v > 0 ? "+" : "") + v + " pp"; };
    k.appendChild(kp("Soil moisture · " + fmtDay(last[0]), Math.round(last[1]) + " %", "", st));
    k.appendChild(kp("vs. 30 days ago", ago ? pp(last[1], ago[1]) : "–", yAgo ? "vs. a year ago " + pp(last[1], yAgo[1]) : ""));
    if (wx) {
      k.appendChild(kp("Hot days ≥ 30 °C in " + wx.last.slice(0, 4), String(wx.hotDays), wx.hotNormal != null ? "normal by now: " + Math.round(wx.hotNormal) : ""));
      k.appendChild(kp("Rain, last 30 days", wx.rain30Pct != null ? wx.rain30Pct + " %" : wx.rain30 != null ? wx.rain30 + " mm" : "–", wx.rain30Pct != null ? "of normal · " + wx.rain30 + " of " + wx.rain30Normal + " mm" : ""));
    }
    body.appendChild(k);
    // soil moisture chart
    body.appendChild(el("h4", "gd-h", "Soil moisture, % of usable field capacity"));
    const lg = el("div", "gd-lg");
    const li = (c, t, dash) => { const x = el("span"); const i = el("i"); i.style.background = dash ? "repeating-linear-gradient(90deg," + c + " 0 4px,transparent 4px 7px)" : c; x.append(i, document.createTextNode(t)); return x; };
    lg.append(li("#0064aa", "Daily value"), li("#b45309", "Dry (" + dry + " %)", true), li("#b91c1c", "Very dry (" + very + " %)", true));
    if (yAgo) lg.appendChild(li("#8a94a3", "Same day a year earlier", true));
    body.appendChild(lg);
    const box = el("div", "gd-chart");
    const narrow = window.innerWidth < 640;
    const W = narrow ? 420 : 840, H = narrow ? 230 : 250, L = 34, R = 8, T = 10, B = 26;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Soil moisture at " + s.name });
    const hi = Math.max(110, ...ser.map((p) => p[1])), lo = 0;
    const x = (n) => L + (n / Math.max(1, ser.length - 1)) * (W - L - R);
    const y = (v) => T + (1 - (Math.max(lo, v) - lo) / (hi - lo)) * (H - T - B);
    const MUTED = "var(--d-8a94a3-text, #8a94a3)";
    for (let v = 0; v <= hi; v += 25) {
      svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "var(--d-eef0f3-border, #eef0f3)" }));
      const t = svgEl("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 11, fill: MUTED }); t.textContent = v; svg.appendChild(t);
    }
    const months = ser.length > 200;
    ser.forEach((p, n) => {
      if (p[0].slice(8) !== "01") return;
      const mm = p[0].slice(5, 7); if (months && !["01", "04", "07", "10"].includes(mm)) return;
      const lab = mm === "01" ? p[0].slice(0, 4) : new Date(p[0] + "T00:00:00Z").toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
      const t = svgEl("text", { x: x(n), y: H - 6, "text-anchor": "middle", "font-size": 11, fill: MUTED, "font-weight": mm === "01" ? 600 : 400 }); t.textContent = lab; svg.appendChild(t);
      svg.appendChild(svgEl("line", { x1: x(n), x2: x(n), y1: T, y2: H - B, stroke: "var(--d-f3f4f6-border, #f3f4f6)" }));
    });
    [[dry, "var(--d-b45309-text, #b45309)"], [very, "var(--d-b91c1c-text, #b91c1c)"]].forEach(([v, c]) => svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: c, "stroke-dasharray": "5 4", "stroke-width": 1.2 })));
    const byDay = new Map(ser.map((p) => [p[0], p[1]]));
    const prevYear = ser.map((p, n) => { const v = byDay.get(addDays(p[0], -365)); return v == null ? null : [x(n), y(v)]; }).filter(Boolean);
    if (prevYear.length > 1) svg.appendChild(svgEl("path", { d: RadarViz.path(prevYear), fill: "none", stroke: MUTED, "stroke-width": 1.4, "stroke-dasharray": "4 4" }));
    const pts = ser.map((p, n) => [x(n), y(p[1])]);
    RadarViz.area(svg, pts, H - B, W_COL, 0.22);
    svg.appendChild(svgEl("path", { d: RadarViz.path(pts), fill: "none", stroke: W_COL, "stroke-width": 2.2, "stroke-linejoin": "round" }));
    const hl = svgEl("line", { y1: T, y2: H - B, stroke: "var(--d-002d55-text, #002d55)", "stroke-width": 1, opacity: 0 }); svg.appendChild(hl);
    const tip = el("div", "gd-tip"); tip.hidden = true;
    svg.addEventListener("pointermove", (ev) => {
      const rc = svg.getBoundingClientRect(); const px = ((ev.clientX - rc.left) / rc.width) * W;
      const n = Math.max(0, Math.min(ser.length - 1, Math.round(((px - L) / (W - L - R)) * (ser.length - 1))));
      hl.setAttribute("x1", x(n)); hl.setAttribute("x2", x(n)); hl.setAttribute("opacity", 1);
      tip.hidden = false; tip.style.left = (x(n) / W) * 100 + "%"; tip.style.top = (y(ser[n][1]) / H) * 100 + "%";
      const py = byDay.get(addDays(ser[n][0], -365));
      tip.textContent = fmtDay(ser[n][0]) + ": " + Math.round(ser[n][1]) + " %" + (py != null ? " · a year earlier " + Math.round(py) + " %" : "");
    });
    svg.addEventListener("pointerleave", () => { hl.setAttribute("opacity", 0); tip.hidden = true; });
    box.append(svg, tip); body.appendChild(box);
    if (wx) weeksBlock(body, wx, W, L, R, narrow, (WEATHER && WEATHER.normalPeriod) || "1991–2020");
    const ab = el("div", "gd-about two");
    [["For WEPA", "Long dry spells and heat come before low river levels, stricter limits on water abstraction and warmer cooling water. Below " + dry + " % of usable field capacity plants start to suffer, below " + very + " % is drought stress."],
     ["Limits", "Soil moisture is modelled by DWD for the nearest station (under grass, 0–60 cm), not measured at the mill. Weather is the nearest DWD station with daily data; normals use the years that station has between 1991 and 2020."]].forEach(([h2, t2], n) => { const d = el("div", "ab" + (n ? 2 : 1)); d.append(el("b", null, h2), el("p", null, t2)); ab.appendChild(d); });
    body.appendChild(ab);
    const foot = el("div", "gd-foot"); const sp = el("span", null, "Source: Deutscher Wetterdienst, Climate Data Center (CC BY 4.0) ");
    const a = el("a", null, "open ↗"); a.href = "https://opendata.dwd.de/climate_environment/CDC/"; a.target = "_blank"; a.rel = "noopener"; sp.appendChild(a); foot.appendChild(sp); body.appendChild(foot);
    $("gdlg").showModal();
  }
  // last 12 weeks: rain per week against normal, heat on top (site pop-ups)
  function weeksBlock(body, wx, W, L, R, narrow, period) {
    const MUTED = "var(--d-8a94a3-text, #8a94a3)";
    if ((wx.weeks || []).length) {
      body.appendChild(el("h4", "gd-h", "Last 12 weeks · rain and heat per week"));
      const lg2 = el("div", "wk-legend");
      [["dryhot", "Dry and hot"], ["dry", "Dry"], ["hot", "Hot"], ["ok", "Normal"]].forEach(([c, l]) => { const xx = el("span"); xx.append(el("i", "wk " + c), document.createTextNode(l)); lg2.appendChild(xx); });
      const nl = el("span"); const ni = el("i", "wk-nm"); nl.append(ni, document.createTextNode("Normal rain for the week")); lg2.appendChild(nl);
      body.appendChild(lg2);
      const wb = el("div", "gd-chart");
      const H2 = narrow ? 200 : 210, B2 = narrow ? 26 : 40, T2 = 22;
      const sv = svgEl("svg", { viewBox: `0 0 ${W} ${H2}`, role: "img", "aria-label": "Rain and heat per week, last 12 weeks" });
      const weeks = wx.weeks;
      const top = Math.max(10, ...weeks.map((w) => Math.max(w.rain || 0, w.rainNormal || 0))) * 1.1;
      const yy = (v) => T2 + (1 - v / top) * (H2 - T2 - B2);
      const step = niceStep(top / 4);
      for (let v = 0; v <= top; v += step) {
        sv.appendChild(svgEl("line", { x1: L, x2: W - R, y1: yy(v), y2: yy(v), stroke: "var(--d-eef0f3-border, #eef0f3)" }));
        const t = svgEl("text", { x: L - 6, y: yy(v) + 4, "text-anchor": "end", "font-size": 11, fill: MUTED }); t.textContent = Math.round(v); sv.appendChild(t);
      }
      const unit = svgEl("text", { x: L - 6, y: 12, "text-anchor": "end", "font-size": 11, fill: MUTED }); unit.textContent = "mm"; sv.appendChild(unit);
      const cw = (W - L - R) / weeks.length, bw = Math.min(38, cw * 0.55);
      const FILL = { dryhot: "#e08a6a", dry: "#f4b49f", hot: "#f2c94c", ok: "var(--d-e5e7eb-bg, #dde1e7)", na: "transparent" };
      weeks.forEach((w, n) => {
        const cx = L + cw * (n + 0.5);
        const g = svgEl("g", {});
        if (w.rain != null) g.appendChild(svgEl("rect", { x: cx - bw / 2, y: yy(w.rain), width: bw, height: Math.max(1, yy(0) - yy(w.rain)), rx: 3, fill: FILL[w.cls] || FILL.ok }));
        if (w.rainNormal != null) g.appendChild(svgEl("line", { x1: cx - bw / 2 - 5, x2: cx + bw / 2 + 5, y1: yy(w.rainNormal), y2: yy(w.rainNormal), stroke: "var(--d-002d55-text, #002d55)", "stroke-width": 2 }));
        if (w.tmax != null) { const t = svgEl("text", { x: cx, y: 13, "text-anchor": "middle", "font-size": narrow ? 10 : 11, fill: w.hotDays ? "var(--d-b45309-text, #b45309)" : MUTED, "font-weight": w.hotDays ? 600 : 400 }); t.textContent = Math.round(w.tmax) + "°"; g.appendChild(t); }
        const d = svgEl("text", { x: cx, y: H2 - B2 + 16, "text-anchor": "middle", "font-size": narrow ? 10 : 11, fill: MUTED }); d.textContent = narrow ? w.start.slice(8).replace(/^0/, "") + "/" + w.start.slice(5, 7).replace(/^0/, "") : fmtShort(w.start); g.appendChild(d);
        if (w.rain != null && !narrow) { const r = svgEl("text", { x: cx, y: H2 - B2 + 30, "text-anchor": "middle", "font-size": 10.5, fill: "var(--ink-2, #4b5563)" }); r.textContent = w.rain + " mm"; g.appendChild(r); }
        const ttl = svgEl("title", {}); ttl.textContent = "Week from " + fmtDay(w.start) + ": " + (WK_CLS[w.cls] || WK_CLS.na)[0] + (w.rain != null ? " · rain " + w.rain + " mm" + (w.rainNormal ? " (normal " + w.rainNormal + " mm)" : "") : "") + (w.tmax != null ? " · max " + Math.round(w.tmax) + " °C" : "") + (w.hotDays ? " · " + w.hotDays + " hot day" + (w.hotDays > 1 ? "s" : "") : "");
        g.appendChild(ttl); sv.appendChild(g);
      });
      wb.appendChild(sv); body.appendChild(wb);
      body.appendChild(el("p", "gd-note", "Bars: rain per week, coloured by the week's class. Dark line: normal rain for that week (" + period + "). Numbers on top: the week's highest temperature."));
    }
  }
  // ---------- mills outside Germany: ERA5-Land weather + soil, national river gauges (data/sites_intl.json) ----------
  function intlSoilStatus(pct) {
    const S = (INTL && INTL.soil) || {}; const dry = S.dry != null ? S.dry : 75, very = S.veryDry != null ? S.veryDry : 55;
    if (pct == null) return { cls: "na", text: "–" };
    return pct < very ? { cls: "head", text: "Very dry" } : pct < dry ? { cls: "head", text: "Dry" } : { cls: "flat", text: "Normal" };
  }
  function gaugeChange(g, days) {
    const ser = (g && g.series) || []; if (ser.length < 2) return null;
    const last = ser[ser.length - 1], ago = valueAgo(ser, days);
    return ago && ago[0] !== last[0] ? last[1] - ago[1] : null;
  }
  function intlSection() {
    const sec = el("section", "panel ind-sec");
    const h = el("div", "ind-h"); h.append(el("h3", null, "Heat, rain, soil and rivers at our mills abroad"), el("span", null, "Copernicus ERA5-Land (CC BY 4.0) · national river gauges"));
    sec.appendChild(h);
    const sites = ((INTL && INTL.sites) || []).filter((x) => x.weather || x.gauge);
    if (!sites.length) { sec.appendChild(el("div", "empty", "Weather and river data for the mills in France, Italy, Poland, the Netherlands and the UK arrive with the next data update (scripts/collect_sites_intl.py, needs the CDS_KEY secret).")); return sec; }
    const C = INTL.countries || {};
    const tw = el("div", "w-tw"); const t = el("table", "gd-yr w-t");
    const hr = el("tr"); ["Mill", "Soil moisture", "Status", "Hot days ≥ 30 °C", "Rain, last 30 days", "Last 12 weeks", "River"].forEach((x) => hr.appendChild(el("th", null, x)));
    const th = el("thead"); th.appendChild(hr); t.appendChild(th);
    const tb = el("tbody");
    let lastCountry = null;
    sites.slice().sort((a, b) => (C[a.country] || a.country).localeCompare(C[b.country] || b.country)).forEach((s) => {
      if (s.country !== lastCountry) { lastCountry = s.country; const gr = el("tr", "w-grp"); gr.appendChild(el("td", null, C[s.country] || s.country)).colSpan = 7; tb.appendChild(gr); }
      const wx = s.weather, soil = wx && (wx.soil || []).filter((p) => p[1] != null), sl = soil && soil.length ? soil[soil.length - 1] : null, st = intlSoilStatus(sl ? sl[1] : null);
      const tr = el("tr", "w-click"); tr.tabIndex = 0; tr.setAttribute("role", "button"); tr.setAttribute("aria-label", s.name + ": open details");
      tr.addEventListener("click", () => openIntl(s));
      tr.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openIntl(s); } });
      const td0 = el("td"); const nb = el("b", null, s.name); nb.appendChild(el("span", "w-more", " ›")); td0.append(nb, el("small", null, wx ? "weather to " + fmtDay(wx.last) : "no weather data yet")); tr.appendChild(td0);
      const td1 = el("td", "num"); if (sl) { td1.appendChild(el("b", null, sl[1] + " %")); td1.appendChild(el("small", null, "of normal")); } else td1.textContent = "–"; tr.appendChild(td1);
      const td2 = el("td"); if (sl) td2.appendChild(el("span", "sig " + st.cls, st.text)); tr.appendChild(td2);
      const td3 = el("td", "num"); if (wx) { td3.appendChild(el("b", null, String(wx.hotDays))); td3.appendChild(el("small", null, wx.hotNormal != null ? "normal " + Math.round(wx.hotNormal) + " by now" : "")); } else td3.textContent = "–"; tr.appendChild(td3);
      const td4 = el("td", "num"); if (wx && wx.rain30Pct != null) { td4.appendChild(el("b", null, wx.rain30Pct + " %")); td4.appendChild(el("small", null, "of normal · " + wx.rain30 + " mm")); } else td4.textContent = "–"; tr.appendChild(td4);
      const td5 = el("td"); if (wx) td5.appendChild(weekStrip(wx)); tr.appendChild(td5);
      const td6 = el("td");
      const g = s.gauge;
      if (g && (g.series || []).length) {
        const lv = g.series[g.series.length - 1], ch = gaugeChange(g, 7);
        const top = el("b", null, Math.round(lv[1]) + " cm"); td6.appendChild(top);
        if (ch != null) td6.appendChild(el("span", "w-ch", " " + (ch > 0.5 ? "▲" : ch < -0.5 ? "▼" : "▬") + " " + Math.abs(Math.round(ch)) + " cm in 7 days"));
        td6.appendChild(el("small", null, [g.river, g.name].filter(Boolean).join(" · ")));
      } else td6.appendChild(el("small", null, s.country === "IT" || s.id === "bridgend" ? "no open gauge data" : "–"));
      tr.appendChild(td6);
      tb.appendChild(tr);
    });
    t.appendChild(tb); tw.appendChild(t); sec.appendChild(tw);
    const S = INTL.soil || {};
    const lg = el("div", "wk-legend"); [["dryhot", "Dry and hot"], ["dry", "Dry"], ["hot", "Hot"], ["ok", "Normal"]].forEach(([c, l]) => { const x = el("span"); x.append(el("i", "wk " + c), document.createTextNode(l)); lg.appendChild(x); });
    lg.appendChild(el("span", "pm", "one square per week · soil dry below " + (S.dry || 75) + " % of normal · normals " + (INTL.normalPeriod || "1991–2020")));
    sec.appendChild(lg);
    const w = el("p", "wepa-l"); w.append(el("b", null, "For WEPA"), document.createTextNode("The same early warning for the mills outside Germany: dry soil and heat come before low rivers and limits on water abstraction. Soil moisture is compared with what is normal for the time of year, because soils differ from site to site."));
    sec.appendChild(w);
    const f = el("p", "ind-src"); f.append("Source: ");
    const a = el("a", null, "Copernicus Climate Data Store, ERA5-Land ↗"); a.href = "https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries"; a.target = "_blank"; a.rel = "noopener"; f.appendChild(a);
    f.appendChild(document.createTextNode(" (about a week behind) · rivers: Hub'Eau (France), IMGW-PIB (Poland), Rijkswaterstaat (Netherlands), Environment Agency (England, OGL) · no free gauge service in Italy and Wales · click a mill for details."));
    sec.appendChild(f);
    return sec;
  }
  // simple daily line chart for the pop-ups: ser = [[date, value]], lines = [[value, colour, label]]
  function dayChart(ser, o) {
    const narrow = window.innerWidth < 640;
    const W = narrow ? 420 : 840, H = narrow ? 220 : 240, L = 40, R = 8, T = 10, B = 26;
    const MUTED = "var(--d-8a94a3-text, #8a94a3)";
    const box = el("div", "gd-chart");
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.aria || "" });
    const vals = ser.map((p) => p[1]).concat((o.lines || []).map((l) => l[0]));
    let lo = o.lo != null ? o.lo : Math.min(...vals), hi = o.hi != null ? Math.max(o.hi, ...vals) : Math.max(...vals);
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.08; if (o.lo == null) lo -= pad; hi += pad;
    const x = (n) => L + (n / Math.max(1, ser.length - 1)) * (W - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const step = niceStep((hi - lo) / 4);
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "var(--d-eef0f3-border, #eef0f3)" }));
      const t = svgEl("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 11, fill: MUTED }); t.textContent = Math.round(v); svg.appendChild(t);
    }
    const long = ser.length > 200;
    ser.forEach((p, n) => {
      if (p[0].slice(8) !== "01") return; const mm = p[0].slice(5, 7);
      if (long && !["01", "04", "07", "10"].includes(mm)) return;
      const t = svgEl("text", { x: x(n), y: H - 6, "text-anchor": "middle", "font-size": 11, fill: MUTED, "font-weight": mm === "01" ? 600 : 400 });
      t.textContent = mm === "01" ? p[0].slice(0, 4) : new Date(p[0] + "T00:00:00Z").toLocaleString("en-GB", { month: "short", timeZone: "UTC" }); svg.appendChild(t);
      svg.appendChild(svgEl("line", { x1: x(n), x2: x(n), y1: T, y2: H - B, stroke: "var(--d-f3f4f6-border, #f3f4f6)" }));
    });
    (o.lines || []).forEach(([v, c]) => svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: c, "stroke-dasharray": "5 4", "stroke-width": 1.2 })));
    const pts = ser.map((p, n) => [x(n), y(p[1])]);
    if (pts.length > 1) {
      RadarViz.area(svg, pts, H - B, W_COL, 0.2);
      svg.appendChild(svgEl("path", { d: RadarViz.path(pts), fill: "none", stroke: W_COL, "stroke-width": 2.2, "stroke-linejoin": "round" }));
    } else if (pts.length === 1) svg.appendChild(svgEl("circle", { cx: pts[0][0], cy: pts[0][1], r: 4, fill: W_COL }));
    const hl = svgEl("line", { y1: T, y2: H - B, stroke: "var(--d-002d55-text, #002d55)", "stroke-width": 1, opacity: 0 }); svg.appendChild(hl);
    const tip = el("div", "gd-tip"); tip.hidden = true;
    svg.addEventListener("pointermove", (ev) => {
      const rc = svg.getBoundingClientRect(); const px = ((ev.clientX - rc.left) / rc.width) * W;
      const n = Math.max(0, Math.min(ser.length - 1, Math.round(((px - L) / (W - L - R)) * (ser.length - 1))));
      hl.setAttribute("x1", x(n)); hl.setAttribute("x2", x(n)); hl.setAttribute("opacity", 1);
      tip.hidden = false; tip.style.left = (x(n) / W) * 100 + "%"; tip.style.top = (y(ser[n][1]) / H) * 100 + "%";
      tip.textContent = fmtDay(ser[n][0]) + ": " + (o.fmt ? o.fmt(ser[n]) : ser[n][1]);
    });
    svg.addEventListener("pointerleave", () => { hl.setAttribute("opacity", 0); tip.hidden = true; });
    box.append(svg, tip);
    return box;
  }
  function openIntl(s) {
    const wx = s.weather, g = s.gauge, C = (INTL && INTL.countries) || {};
    const S = (INTL && INTL.soil) || {}; const dry = S.dry != null ? S.dry : 75, very = S.veryDry != null ? S.veryDry : 55;
    $("gd-title").textContent = s.name + " · water & weather";
    const sub = [C[s.country] || s.country, "weather: ERA5-Land grid point nearest to the mill (about 9 km)"];
    if (g) sub.push("river: " + [g.name, g.river].filter(Boolean).join(", ") + (g.km != null ? " (" + g.km + " km)" : ""));
    $("gd-sub").textContent = sub.join(" · ");
    const body = $("gd-body"); body.replaceChildren();
    const soil = wx ? (wx.soil || []).filter((p) => p[1] != null) : [];
    const sl = soil.length ? soil[soil.length - 1] : null, ago = sl ? valueAgo(soil, 30) : null;
    const k = el("div", "gd-kpis");
    const kp = (label, val, small, sig) => { const d = el("div"); d.append(document.createTextNode(label), el("b", null, val)); if (small || sig) { const sm = el("small", null, small || ""); if (sig) sm.appendChild(el("span", "sig " + sig.cls, sig.text)); d.appendChild(sm); } return d; };
    if (sl) k.appendChild(kp("Soil moisture · " + fmtDay(sl[0]), sl[1] + " % of normal", ago ? "vs. 30 days ago " + (sl[1] - ago[1] > 0 ? "+" : "") + (sl[1] - ago[1]) + " pp " : "", intlSoilStatus(sl[1])));
    if (wx) {
      k.appendChild(kp("Hot days ≥ 30 °C in " + wx.last.slice(0, 4), String(wx.hotDays), wx.hotNormal != null ? "normal by now: " + Math.round(wx.hotNormal) : ""));
      k.appendChild(kp("Rain, last 30 days", wx.rain30Pct != null ? wx.rain30Pct + " %" : wx.rain30 != null ? wx.rain30 + " mm" : "–", wx.rain30Pct != null ? "of normal · " + wx.rain30 + " of " + wx.rain30Normal + " mm" : ""));
    }
    if (g && (g.series || []).length) { const lv = g.series[g.series.length - 1], ch = gaugeChange(g, 7); k.appendChild(kp("River level · " + fmtDay(lv[0]), Math.round(lv[1]) + " " + (g.unit || "cm"), ch != null ? (ch > 0 ? "+" : "") + Math.round(ch) + " cm in 7 days" : "")); }
    body.appendChild(k);
    if (soil.length > 1) {
      body.appendChild(el("h4", "gd-h", "Soil moisture, % of the normal for the time of year"));
      const lg = el("div", "gd-lg");
      const li = (c, t, dash) => { const x = el("span"); const i = el("i"); i.style.background = dash ? "repeating-linear-gradient(90deg," + c + " 0 4px,transparent 4px 7px)" : c; x.append(i, document.createTextNode(t)); return x; };
      lg.append(li("#0064aa", "Daily value"), li("#8a94a3", "Normal (100 %)", true), li("#b45309", "Dry (" + dry + " %)", true), li("#b91c1c", "Very dry (" + very + " %)", true));
      body.appendChild(lg);
      body.appendChild(dayChart(soil, { lo: 0, hi: 120, aria: "Soil moisture at " + s.name, lines: [[100, "var(--d-8a94a3-text, #8a94a3)"], [dry, "var(--d-b45309-text, #b45309)"], [very, "var(--d-b91c1c-text, #b91c1c)"]], fmt: (p) => p[1] + " % of normal" + (p[2] != null ? " · " + p[2] + " % water by volume" : "") }));
    }
    const narrow = window.innerWidth < 640;
    if (wx) weeksBlock(body, wx, narrow ? 420 : 840, 34, 8, narrow, (INTL && INTL.normalPeriod) || "1991–2020");
    if (g && (g.series || []).length) {
      body.appendChild(el("h4", "gd-h", "River level · " + [g.river, g.name].filter(Boolean).join(", ")));
      const lines = g.low != null ? [[g.low, "var(--d-b45309-text, #b45309)"]] : [];
      if (g.low != null) { const lg = el("div", "gd-lg"); const x = el("span"); const i = el("i"); i.style.background = "repeating-linear-gradient(90deg,#b45309 0 4px,transparent 4px 7px)"; x.append(i, document.createTextNode("Low end of the typical range (" + g.low + " cm)")); lg.appendChild(x); body.appendChild(lg); }
      body.appendChild(dayChart(g.series, { aria: "River level", lines, fmt: (p) => Math.round(p[1]) + " " + (g.unit || "cm") }));
      body.appendChild(el("p", "gd-note", "Daily mean in " + (g.unit || "cm") + " above the gauge's own zero" + (g.unit === "cm NAP" ? " (Dutch reference level NAP)" : "") + ". The history grows by one day with every data update" + (g.series.length < 20 ? " – only " + g.series.length + " day" + (g.series.length > 1 ? "s" : "") + " so far" : "") + "."));
    }
    const ab = el("div", "gd-about two");
    [["For WEPA", "Dry soil and heat come before low rivers, limits on water abstraction and warmer cooling water. A river gauge next to the mill shows the water situation directly."],
     ["Limits", "ERA5-Land is a model on a 9 km grid, not a measurement at the mill; it runs about a week behind and smooths out local peaks. Soil moisture covers 0–100 cm. Gauges are the nearest public ones and may sit on a different stream than the mill's intake."]].forEach(([h2, t2], n) => { const d = el("div", "ab" + (n ? 2 : 1)); d.append(el("b", null, h2), el("p", null, t2)); ab.appendChild(d); });
    body.appendChild(ab);
    const foot = el("div", "gd-foot"); const sp = el("span", null, "Sources: Copernicus Climate Change Service, ERA5-Land (CC BY 4.0)" + (g ? " · " + g.source + " " : " "));
    if (g && g.link) { const a = el("a", null, "open ↗"); a.href = g.link; a.target = "_blank"; a.rel = "noopener"; sp.appendChild(a); }
    foot.appendChild(sp); body.appendChild(foot);
    $("gdlg").showModal();
  }
  function fmtShort(iso) { const d = new Date(iso + "T00:00:00Z"); return d.getUTCDate() + " " + d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }); }

  function renderIndustry(host) {
    const draws = [];
    // two sub-pages: monthly market figures and the yearly industry profile
    const sub = el("div", "subnav"); sub.setAttribute("role", "tablist"); sub.setAttribute("aria-label", "Industry view");
    [["month", "Monthly market"], ["year", "Yearly industry profile"]].forEach(([id, t]) => {
      const b = el("button", null, t); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(state.ind === id));
      b.addEventListener("click", () => { if (state.ind === id) return; state.ind = id; renderAll(); window.scrollTo({ top: 0 }); });
      sub.appendChild(b);
    });
    host.appendChild(sub);
    const pct = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(1).replace(".0", "") + " %";
    const kt = (v) => Math.round(v).toLocaleString("en-GB");
    if (state.ind === "year") { renderIndustryYear(host, draws); return; }
    // 0) monthly market indicators (Destatis)
    host.appendChild(secHead("ind-month", "Every month", "How is our market doing?"));
    const shelf = shelfPanel(draws); if (shelf) host.appendChild(shelf);
    if (!IND) host.appendChild(el("div", "empty", "Industry figures of DIE PAPIERINDUSTRIE are not available yet."));
    // 1) Germany, year-to-date by grade
    const gm = IND && IND.germanyMonthly;
    if (gm) {
      const sec = el("section", "panel ind-sec");
      const h = el("div", "ind-h"); h.append(el("h3", null, "Germany · paper production and sales by grade"), el("span", null, gm.period + " vs. " + gm.periodPrev + " · " + gm.unit + ""));
      sec.appendChild(h);
      const hy = (gm.rows || []).find((r) => r.key === "hygiene");
      if (hy) {
        const k = el("div", "gd-kpis");
        const kp = (label, v, sub) => { const d = el("div"); d.append(document.createTextNode(label), el("b", null, v)); if (sub) d.appendChild(el("small", null, sub)); return d; };
        if (hy.production) k.appendChild(kp("Tissue (hygiene paper) production", kt(hy.production[0]) + " kt", pct(hy.production[2]) + " vs. previous year"));
        if (hy.domestic) k.appendChild(kp("Tissue sales in Germany", kt(hy.domestic[0]) + " kt", pct(hy.domestic[2])));
        const tot = (gm.rows || []).find((r) => r.key === "total");
        if (tot && tot.production) k.appendChild(kp("All paper & board production", kt(tot.production[0]) + " kt", pct(tot.production[2])));
        sec.appendChild(k);
      }
      const t = el("table", "gd-yr ind-t"); const hr = el("tr");
      ["Grade", "Production", "vs. prev. year", "Sales in Germany", "vs. prev. year", "Export sales", "vs. prev. year"].forEach((x) => hr.appendChild(el("th", null, x)));
      const th = el("thead"); th.appendChild(hr); t.appendChild(th);
      const tb = el("tbody");
      (gm.rows || []).forEach((r) => {
        const tr = el("tr", r.key === "hygiene" ? "us" : "");
        const cell = (a, i) => el("td", i === 2 ? "chg " + (a && a[2] < 0 ? "dn" : "up") : null, a ? (i === 2 ? pct(a[2]) : kt(a[0])) : "–");
        tr.append(el("td", null, r.grade), cell(r.production, 0), cell(r.production, 2), cell(r.domestic, 0), cell(r.domestic, 2), cell(r.export, 0), cell(r.export, 2));
        tb.appendChild(tr);
      });
      t.appendChild(tb); const w = el("div"); w.style.overflowX = "auto"; w.appendChild(t); sec.appendChild(w);
      if (gm.latestNote && !gm.auto) { const n = el("p", "ind-note"); n.append(document.createTextNode(gm.latestNote.text + " "), srcLink(gm.latestNote.source)); sec.appendChild(n); }
      const ab = aboutOf(gm.about); if (ab) sec.appendChild(ab);
      const f = el("p", "ind-src"); f.append("Source: ", srcLink(gm.source)); sec.appendChild(f);
      host.appendChild(sec);
    }
    draws.forEach((f) => f());
  }
  function renderIndustryYear(host, draws) {
    if (!IND) host.appendChild(el("div", "empty", "Industry figures of DIE PAPIERINDUSTRIE are not available yet."));
    renderProfile(host);
    // 2) Recovered paper utilisation rate by grade
    const rr = IND && IND.germanyRecoveredRate;
    if (rr) {
      const sec = el("section", "panel ind-sec");
      const h = el("div", "ind-h"); h.append(el("h3", null, "Germany · recovered paper utilisation rate by grade"), el("span", null, "% of paper production · yearly " + rr.years[0] + "–" + rr.years[rr.years.length - 1]));
      sec.appendChild(h);
      const COLS = { "Hygiene papers": "#33b09c", "All paper & board": "#335777", "Packaging papers": "#96d2dc", "Graphic papers": "#f4b49f" };
      const lg = el("div", "legend ind-lg");
      Object.keys(rr.series).forEach((nm) => { const x = el("span", "lg"); const i = el("i"); i.style.background = COLS[nm] || "#828282"; x.append(i, el("span", null, nm)); lg.appendChild(x); });
      if (rr.wepaRef) { const x = el("span", "lg"); const i = el("i"); i.style.background = "repeating-linear-gradient(90deg,#0064aa 0 4px,transparent 4px 7px)"; x.append(i, el("span", null, rr.wepaRef.label + " (" + rr.wepaRef.value + " %, " + rr.wepaRef.note + ")")); lg.appendChild(x); }
      sec.appendChild(lg);
      const box = el("div", "chart ind-chart"); sec.appendChild(box);
      const ys = rr.years;
      draws.push(() => trendChart(box, {
        label: rr.label, keys: ys, lo: 0, hi: 120,
        series: Object.entries(rr.series).map(([nm, vals]) => ({ name: nm, color: COLS[nm] || "#828282", vals, width: nm === "Hygiene papers" ? 2.6 : null, end: (v) => v + "% " + nm })),
        refs: rr.wepaRef ? [{ v: rr.wepaRef.value, label: rr.wepaRef.value + "% WEPA", color: "var(--d-0064aa-text, #0064aa)" }] : [],
        yFmt: (v) => Math.round(v) + "%",
        xLabel: (key, k) => (k % 2 === 0 || k === ys.length - 1 ? String(key) : null), thin: false,
        tipTitle: (key) => String(key),
        tipVal: (sr, v) => v + " %",
      }));
      const ab = aboutOf(rr.about); if (ab) sec.appendChild(ab);
      const f = el("p", "ind-src"); f.append("Source: ", srcLink(rr.source)); sec.appendChild(f);
      host.appendChild(sec);
    }
    // 3) Europe
    const eu = IND && IND.europe;
    if (eu) {
      const sec = el("section", "panel ind-sec");
      const h = el("div", "ind-h"); h.append(el("h3", null, eu.label), el("span", null, "yearly"));
      sec.appendChild(h);
      const k = el("div", "gd-kpis ind-k");
      (eu.kpis || []).forEach((x) => { const d = el("div"); d.append(document.createTextNode(x.label), el("b", null, x.value)); if (x.change) d.appendChild(el("small", null, x.change)); k.appendChild(d); });
      sec.appendChild(k);
      const ab = aboutOf(eu.about); if (ab) sec.appendChild(ab);
      const f = el("p", "ind-src"); f.append("Source: ", srcLink(eu.source)); sec.appendChild(f);
      host.appendChild(sec);
    }
    draws.forEach((f) => f());
  }

  // ---------- signals: headwind / tailwind for WEPA (a judgement, so the only coloured element) ----------
  function signal(ind) {
    if (!ind.good || !hasData(ind)) return null;
    const c = yoy(ind); if (!c) return null;
    const pp = ind.unit === "%";
    const v = pp || c.pts ? c.pp : c.pct, band = ind.band != null ? ind.band : pp || c.pts ? 1 : 3;
    if (Math.abs(v) < band) return { cls: "flat", text: "Neutral" };
    return (v > 0) === (ind.good === "up") ? { cls: "tail", text: "Tailwind" } : { cls: "head", text: "Headwind" };
  }
  function chgText(ind) {
    const c = yoy(ind); if (!c) return "–";
    const up = c.pct > 0.05, dn = c.pct < -0.05, a = up ? "▲ " : dn ? "▼ " : "▬ ";
    if (c.pts) return (c.pp > 0 ? "▲ +" : c.pp < 0 ? "▼ " : "▬ ") + c.pp.toFixed(1) + " pts";
    return ind.unit === "%" ? a + (c.pp > 0 ? "+" : "") + c.pp.toFixed(1) + " pp" : a + (c.pct > 0 ? "+" : "") + c.pct.toFixed(1) + " %";
  }
  function goTab(id, anchor) {
    state.tab = id;
    if (anchor === "ind-year") state.ind = "year"; else if (anchor === "ind-month") state.ind = "month";
    renderAll(); window.scrollTo({ top: 0 });
    if (anchor) setTimeout(() => { const x = $(anchor); if (x) x.scrollIntoView({ block: "start" }); }, 30);
  }
  // one sentence per page; **…** marks the key figures (shown in bold)
  function summaryLine() {
    const bits = [];
    const mv = (inds) => inds.filter((i) => hasData(i) && i.good && yoy(i) && !yoy(i).pts).sort((a, b) => Math.abs(yoy(b).pct) - Math.abs(yoy(a).pct)).slice(0, 2);
    const mvText = (i) => "**" + shortName(i) + " " + chgText(i).replace(/^[▲▼▬] /, "") + "**";
    if (PAGE === "costs") {
      const R = COST ? computeCost() : null;
      const lastP = R && R.rows.length ? [...R.rows].reverse().find((r) => r.ppi != null) : null;
      if (lastP) {
        const r = R.rows.find((x) => x.m === lastP.m), dc = r.idx - 100, dp = lastP.ppi - 100;
        const w = (v) => (Math.abs(v) < 0.5 ? "**flat**" : (v > 0 ? "**up " : "**down ") + Math.abs(v).toFixed(0) + " %**");
        bits.push("Public input costs are " + w(dc) + " since " + fmtMonth(R.base) + " while tissue prices are " + w(dp) + (lastP.ppi - r.idx < -1 ? ", so **margins are under pressure**." : lastP.ppi - r.idx > 1 ? ", so **prices are ahead of costs**." : ", so the gap is small."));
      }
      const m = mv(pageInds()).filter((i) => Math.abs(yoy(i).pct) > 5);
      if (m.length) bits.push("Biggest moves on a year ago: " + m.map(mvText).join(" and ") + ".");
      return bits.join(" ");
    }
    if (PAGE === "market") {
      const hy = IND && IND.germanyMonthly && (IND.germanyMonthly.rows || []).find((r) => r.key === "hygiene");
      if (hy && hy.production) bits.push("German tissue production " + IND.germanyMonthly.period + " is **" + (hy.production[2] < 0 ? "down " : "up ") + Math.abs(hy.production[2]).toFixed(1) + " %** on last year.");
      const m = mv(pageInds());
      if (m.length) bits.push("Biggest moves on a year ago: " + m.map(mvText).join(" and ") + ".");
      return bits.join(" ");
    }
    const de = M.indicators.find((i) => i.id === "grid_de");
    if (de && hasData(de)) { const a = avg12(de, 0), b = avg12(de, 12); if (a && b) bits.push("The German grid factor (12-month average) is **" + Math.abs((a - b) / b * 100).toFixed(0) + " % " + (a < b ? "lower" : "higher") + "** than a year earlier."); }
    const re = M.indicators.find((i) => i.id === "res_share_de");
    if (re && hasData(re)) bits.push("Renewables supply **" + fmtVal(re.series[re.series.length - 1][1], "%") + " %** of German power (" + fmtDate(re.series[re.series.length - 1][0], re) + ").");
    const gs = ((WATER && WATER.gauges) || []).filter((g) => (g.series || []).length).filter((g) => { const v = g.latest && g.latest.v != null ? g.latest.v : g.series[g.series.length - 1][1]; return gaugeStatus(g, v).cls === "head"; });
    if (gs.length) bits.push("**Low water** at " + gs.map((g) => g.label).join(" and ") + ".");
    const gst = gasStats("eu");
    if (gst) bits.push("EU gas storage is **" + gst.last[1].toFixed(0) + " % full**" + (gst.avgNow != null ? " (" + (gst.last[1] - gst.avgNow > 0 ? "+" : "−") + Math.abs(gst.last[1] - gst.avgNow).toFixed(0) + " pp vs. the 5-year average)" : "") + ".");
    return bits.join(" ");
  }
  // ---------- At a glance: one card per topic (verdict, signal dots, 3 key indicators) ----------
  const TOPICS = {
    costs: [
      { key: "fibre", label: "Fibre & packaging", groups: ["fibre", "packaging"] },
      { key: "recovered", label: "Recovered paper", groups: ["recovered"] },
      { key: "energy", label: "Energy & carbon", groups: ["energy", "carbon"] },
      { key: "labour", label: "Labour & logistics", groups: ["labour"] },
    ],
    market: [
      { key: "demand", label: "Demand & trade", ids: ["de_retail_drug", "de_retail_food", "de_imp_tissue", "de_exp_tissue"], tab: "industry", anchor: "ind-month", link: "Industry" },
      { key: "prod", label: "Production", ids: ["de_prod_paper", "prod_paper"], tab: "industry", anchor: "ind-month", link: "Industry" },
      { key: "fibre", label: "Fibre supply", ids: ["de_imp_pulp"], fibre: true, tab: "fibre", link: "Fibre" },
    ],
    energy: [
      { key: "grid", label: "Grid carbon intensity", groups: ["grid"], tab: "grid", link: "Power grid", pick: ["grid_de", "grid_eu", "grid_pl"] },
      { key: "mix", label: "German power mix", groups: ["powermix", "energy"], tab: "grid", link: "Power grid", pick: ["res_share_de", "mix_coal", "mix_wind"] },
      { key: "gas", label: "Gas storage", gas: true, tab: "gas", link: "Gas storage" },
      { key: "water", label: "Water & weather", water: true, tab: "water", link: "Water & weather" },
    ],
  };
  const topicInds = (t) => (t.any ? M.indicators : pageInds()).filter((i) => (t.ids ? t.ids.includes(i.id) : t.groups.includes(i.group)) && hasData(i));
  function verdictWord(h, t) {
    if (h && t && h < 2 * t && t < 2 * h) return "Mixed";
    if (h && t) { if (h > t) t = 0; else h = 0; }
    if (PAGE === "costs") return h ? "Rising" : t ? "Easing" : "Stable";
    if (PAGE === "energy") return h ? "Worse" : t ? "Better" : "Stable";
    return h ? "Under pressure" : t ? "Improving" : "Stable";
  }
  function glanceCard(t) {
    const card = el("section", "panel tc");
    const head = el("div", "tc-h"); head.appendChild(el("h3", null, t.label)); card.appendChild(head);
    const go = el("button", "gl-go"); go.type = "button";
    if (t.water) return waterCard(card, head, go, t);
    if (t.fibre) return fibreCard(card, head, go, t);
    if (t.gas) return gasCard(card, head, go, t);
    const inds = topicInds(t);
    if (!inds.length) { card.appendChild(el("p", "tc-v", "Waiting for first data.")); return card; }
    const sigs = inds.map((i) => ({ i, s: signal(i), c: yoy(i) }));
    const h = sigs.filter((x) => x.s && x.s.cls === "head").length, tl = sigs.filter((x) => x.s && x.s.cls === "tail").length;
    const cls = h > tl ? "head" : tl > h ? "tail" : "flat";
    head.appendChild(el("span", "sig " + cls, cls === "head" ? "Headwind" : cls === "tail" ? "Tailwind" : "Neutral"));
    const mv = sigs.filter((x) => x.c && !x.c.pts).sort((a, b) => Math.abs(b.i.unit === "%" ? b.c.pp * 3 : b.c.pct) - Math.abs(a.i.unit === "%" ? a.c.pp * 3 : a.c.pct))[0];
    const v = el("p", "tc-v"); v.appendChild(el("b", null, verdictWord(h, tl)));
    if (mv) v.appendChild(document.createTextNode(" · biggest move: " + shortName(mv.i) + " " + chgText(mv.i).replace(/^[▲▼▬] /, "") + " on a year ago"));
    card.appendChild(v);
    const dots = el("div", "tc-dots"); dots.title = h + " headwind · " + tl + " tailwind · " + (inds.length - h - tl) + " neutral or no signal";
    sigs.forEach((x) => { const d = el("i", x.s ? x.s.cls : ""); d.title = shortName(x.i) + ": " + (x.s ? x.s.text : "no signal"); dots.appendChild(d); });
    dots.appendChild(el("span", null, h + " headwind · " + tl + " tailwind"));
    card.appendChild(dots);
    // key indicators: the topic's own pick, else glance-flagged first, then the biggest moves
    const rank = (x) => (t.pick ? (t.pick.includes(x.i.id) ? 1000 - t.pick.indexOf(x.i.id) : 0) : (x.i.glance ? 500 : 0)) + (x.c && !x.c.pts ? Math.min(Math.abs(x.c.pct), 400) : 0);
    sigs.slice().sort((a, b) => rank(b) - rank(a)).slice(0, 3).forEach((x) => card.appendChild(keyRow(x.i)));
    go.textContent = t.tab ? "Open " + t.link + " ›" : "All " + inds.length + " in Price trends ›";
    go.addEventListener("click", () => { if (t.tab) goTab(t.tab, t.anchor); else { state.topic = t.groups.length === 1 ? t.groups[0] : "all"; state.find = ""; goTab("cmp"); } });
    card.appendChild(go);
    return card;
  }
  function keyRow(i) {
    const r = el("button", "tc-r"); r.type = "button"; r.title = i.label + " – open details";
    r.addEventListener("click", () => openInd(i));
    const last = i.series[i.series.length - 1];
    r.append(el("span", "n", shortName(i)), sparkVals(i.series.filter((p) => p[0].slice(0, 7) > monthsBack(last[0].slice(0, 7), 36)).map((p) => p[1])),
      el("span", "v", fmtVal(last[1], i.unit) + (i.unit === "index" ? "" : " " + unitLabel(i.unit))), el("span", "c", chgText(i)));
    return r;
  }
  // Fibre supply (Market): pulp imports + recovered paper share in hygiene papers (yearly, Umweltbundesamt)
  function fibreCard(card, head, go, t) {
    const inds = topicInds(t);
    const rr = IND && IND.germanyRecoveredRate, hy = rr && rr.series && rr.series["Hygiene papers"], all = rr && rr.series && rr.series["All paper & board"];
    const v = el("p", "tc-v");
    if (hy && hy.length > 1) {
      const n = hy.length - 1, y0 = rr.years[0];
      v.appendChild(el("b", null, hy[n] < hy[n - 1] ? "Less recovered fibre" : hy[n] > hy[n - 1] ? "More recovered fibre" : "Stable"));
      v.appendChild(document.createTextNode(" · hygiene papers use " + hy[n] + " % recovered paper (" + rr.years[n] + "; " + hy[0] + " % in " + y0 + ")"));
    } else v.appendChild(el("b", null, "Fibre supply"));
    card.appendChild(v);
    const po = PULP && PULP.products && PULP.products.total;
    if (po && po.rows && po.rows.length) {
      const r0 = po.rows[0], r1 = po.rows[1];
      const d = el("div", "tc-r static"); d.append(el("span", "n", "Largest pulp origins (EU, 12 months)"), el("span", "v", r0.name + " " + Math.round(r0.share) + " %" + (r1 ? " · " + r1.name + " " + Math.round(r1.share) + " %" : "")), el("span"));
      card.appendChild(d);
    }
    inds.forEach((i) => card.appendChild(keyRow(i)));
    const yr = (label, arr) => { const n = arr.length - 1, d = arr[n] - arr[n - 1]; const r = el("div", "tc-r static"); r.append(el("span", "n", label), el("span", "v", arr[n] + " %"), el("span", "c", (d > 0 ? "▲ +" : d < 0 ? "▼ −" : "▬ ") + Math.abs(d) + " pp")); return r; };
    if (hy) card.appendChild(yr("Recovered paper share · hygiene (" + rr.years[rr.years.length - 1] + ")", hy));
    if (all) card.appendChild(yr("Recovered paper share · all grades", all));
    go.textContent = "Open " + t.link + " ›"; go.addEventListener("click", () => goTab(t.tab, t.anchor)); card.appendChild(go);
    return card;
  }
  // Gas storage (Energy & climate): EU + German storage vs. the 5-year average
  function gasCard(card, head, go, t) {
    const eu = gasStats("eu"), de = gasStats("de");
    const v = el("p", "tc-v");
    const gap = eu && eu.avgNow != null ? eu.last[1] - eu.avgNow : null;
    const cls = gap == null ? "flat" : gap < -5 ? "head" : gap > 5 ? "tail" : "flat";
    head.appendChild(el("span", "sig " + cls, cls === "head" ? "Headwind" : cls === "tail" ? "Tailwind" : "Neutral"));
    if (eu) { v.appendChild(el("b", null, gap == null ? "Storage " + Math.round(eu.last[1]) + " %" : gap < -5 ? "Below normal" : gap > 5 ? "Above normal" : "Normal")); v.appendChild(document.createTextNode(" · EU storage " + eu.last[1].toFixed(0) + " % full" + (gap != null ? ", " + Math.abs(gap).toFixed(0) + " pp " + (gap < 0 ? "below" : "above") + " the 5-year average" : ""))); }
    else v.appendChild(el("b", null, "Gas storage data arrives with the next update"));
    card.appendChild(v);
    const row = (n, val, c) => { const d = el("div", "tc-r static"); d.append(el("span", "n", n), el("span", "v", val), el("span", "c", c || "")); return d; };
    if (eu) card.appendChild(row("Gas storage EU", eu.last[1].toFixed(1) + " %", eu.week != null ? arrow(eu.week, "pp", 1) + " in a week" : ""));
    if (de) card.appendChild(row("Gas storage Germany", de.last[1].toFixed(1) + " %", de.week != null ? arrow(de.week, "pp", 1) + " in a week" : ""));
    go.textContent = "Open " + t.link + " ›"; go.addEventListener("click", () => goTab(t.tab)); card.appendChild(go);
    return card;
  }
  function waterCard(card, head, go, t) {
    const gauges = ((WATER && WATER.gauges) || []).filter((g) => (g.series || []).length);
    const sites = ((WATER && WATER.sites) || []).filter((s) => (s.series || []).length);
    if (!gauges.length && !sites.length) { card.appendChild(el("p", "tc-v", "Water data arrives with the next data update.")); return card; }
    const gs = gauges.map((g) => { const last = g.series[g.series.length - 1]; const v = g.latest && g.latest.v != null ? g.latest.v : last[1]; return { g, v, st: gaugeStatus(g, v) }; });
    const ss = sites.map((s) => { const last = s.series[s.series.length - 1]; return { s, v: last[1], st: soilStatus(last[1]) }; });
    const lowR = gs.filter((x) => x.st.cls === "head"), dry = ss.filter((x) => x.st.cls === "head");
    const wxs = ((WEATHER && WEATHER.sites) || []);
    const hotNow = wxs.filter((w) => { const lw = (w.weeks || []).slice(-2); return lw.some((x) => x.cls === "hot" || x.cls === "dryhot"); });
    const bad = lowR.length + dry.length;
    head.appendChild(el("span", "sig " + (bad ? "head" : "flat"), bad ? "Headwind" : "Neutral"));
    const v = el("p", "tc-v"); v.appendChild(el("b", null, lowR.length ? "Low water" : dry.length ? "Dry soil" : "Normal"));
    v.appendChild(document.createTextNode(" · " + (lowR.length ? lowR.map((x) => x.g.label).join(", ") + " below normal" : "rivers normal") + (sites.length ? " · " + dry.length + " of " + sites.length + " mills dry" : "") + (wxs.length ? " · " + (hotNow.length ? hotNow.length + " with heat in the last 2 weeks" : "no heat in the last 2 weeks") : "")));
    card.appendChild(v);
    const dots = el("div", "tc-dots");
    gs.concat(ss).forEach((x) => { const d = el("i", x.st.cls === "head" ? "head" : ""); d.title = (x.g ? x.g.label : x.s.name) + ": " + x.st.text; dots.appendChild(d); });
    dots.appendChild(el("span", null, bad + " of " + (gs.length + ss.length) + " flagged"));
    card.appendChild(dots);
    const rows = gs.map((x) => [x.g.label, Math.round(x.v) + " cm", x.st]).concat(ss.slice().sort((a, b) => a.v - b.v).map((x) => [x.s.name + " · soil", Math.round(x.v) + " %", x.st]));
    rows.slice(0, 3).forEach((r) => { const d = el("div", "tc-r static"); d.append(el("span", "n", r[0]), el("span", "v", r[1]), el("span", "sig " + r[2].cls, r[2].text)); card.appendChild(d); });
    go.textContent = "Open " + t.link + " ›"; go.addEventListener("click", () => goTab(t.tab)); card.appendChild(go);
    return card;
  }
  function renderGlance(host) {
    const ln = lineNode(); if (ln) host.appendChild(ln);
    if (PAGE === "costs" && COST) {
      const R = computeCost();
      if (R.rows.length) {
        const last = R.rows[R.rows.length - 1], lastP = [...R.rows].reverse().find((r) => r.ppi != null);
        const strip = costStrip(R, last, lastP); strip.classList.add("tc-strip");
        const go = el("button", "gl-go", "Open Cost index ›"); go.type = "button"; go.addEventListener("click", () => goTab("cost")); strip.appendChild(go);
        host.appendChild(strip);
      }
    }
    const grid = el("div", "tc-grid");
    TOPICS[PAGE].forEach((t) => grid.appendChild(glanceCard(t)));
    host.appendChild(grid);
    host.appendChild(el("p", "gl-foot", "Signals are rule-based: a change of more than 3 % (1 pp for shares) against a year earlier, in the direction that helps or hurts WEPA. One dot per indicator. Click an indicator for details."));
  }
  // Cost index result strip: cost index · tissue price index · margin signal (Costs › At a glance and Cost index)
  function costStrip(R, last, lastP) {
    const s = el("div", "c-strip");
    const k = (cls, label, v, sub) => { const d = el("div", "c-k" + cls); d.append(el("small", null, label), el("b", null, v), el("span", null, sub)); return d; };
    s.appendChild(k("", "Cost index", last.idx.toFixed(1), fmtMonth(last.m) + " · " + fmtMonth(R.base) + " = 100"));
    if (lastP) {
      s.appendChild(k("", "Tissue price index", lastP.ppi.toFixed(1), fmtMonth(lastP.m) + " · what producers charge"));
      const gap = lastP.ppi - R.rows.find((r) => r.m === lastP.m).idx;
      s.appendChild(k(gap < 0 ? " head" : " tail", "Margin signal", (gap > 0 ? "+" : "") + gap.toFixed(1) + " pts", gap < 0 ? "headwind · costs ahead of prices" : "tailwind · prices ahead of costs"));
    }
    return s;
  }
  // Cost index: inputs → cost index vs. tissue price → margin signal
  function costChain(R) {
    const last = R.rows[R.rows.length - 1], lastP = [...R.rows].reverse().find((r) => r.ppi != null);
    const sec = el("section", "panel ch");
    const h = el("div", "ind-h"); h.append(el("h3", null, "How public input costs add up · illustrative, not WEPA figures"), el("span", null, fmtMonth(R.base) + " = 100"));
    sec.appendChild(h);
    const row = el("div", "ch-row");
    const ins = el("div", "ch-in");
    const contrib = (c) => { const part = last.parts.find((p) => p.key === c.key); return part ? { ch: (part.ratio - 1) * 100, pts: (c.w * (part.ratio - 1) * 100) / R.totalW } : null; };
    R.comps.forEach((c) => {
      const x = contrib(c);
      const b = el("button", "ch-i"); b.type = "button";
      const nm = el("span"); nm.append(el("b", null, c.label + " · " + Math.round(c.w) + " %"), el("small", null, c.ind ? shortName(c.ind) + " · " + (c.ind.attribution || "").split(" (")[0].split(",")[0] : "no data yet"));
      b.append(nm, el("span", "num", x ? (x.ch > 0 ? "+" : "") + x.ch.toFixed(1) + " %" : "–"), el("span", "num pts", x ? (x.pts > 0 ? "+" : "") + x.pts.toFixed(1) : "–"));
      if (c.ind) b.addEventListener("click", () => openInd(c.ind)); else b.disabled = true;
      ins.appendChild(b);
    });
    const lg = el("div", "ch-lg"); lg.append(el("span"), el("span", null, "change"), el("span", null, "index pts")); ins.appendChild(lg);
    const arrow = () => { const a = el("div", "ch-arrow", "→"); a.setAttribute("aria-hidden", "true"); return a; };
    const mid = el("div", "ch-mid");
    const kb = (cls, label, v, sub) => { const d = el("div", "ch-k" + cls); d.append(el("span", null, label), el("b", null, v), el("small", null, sub)); return d; };
    mid.appendChild(kb(" main", "Cost index", last.idx.toFixed(1), fmtMonth(last.m)));
    if (lastP) mid.appendChild(kb("", "Tissue price index", lastP.ppi.toFixed(1), fmtMonth(lastP.m) + " · what producers charge"));
    row.append(ins, arrow(), mid, arrow());
    if (lastP) {
      const gap = lastP.ppi - R.rows.find((r) => r.m === lastP.m).idx;
      const out = el("div", "ch-out " + (gap < 0 ? "head" : "tail"));
      const top = R.comps.map((c) => ({ c, x: contrib(c) })).filter((o) => o.x && o.x.pts > 0.05).sort((a, b) => b.x.pts - a.x.pts).slice(0, 2);
      const drivers = top.length ? " " + top.map((o) => o.c.label.split(" (")[0].toLowerCase()).join(" and ") + " add the most (" + top.map((o) => "+" + o.x.pts.toFixed(1)).join(" and ") + " points)." : "";
      out.append(el("span", null, "Margin signal · " + (gap < 0 ? "headwind" : "tailwind")), el("b", null, (gap > 0 ? "+" : "") + gap.toFixed(1) + " pts"),
        el("p", null, (gap < 0 ? "Costs ran ahead of prices since " : "Prices are ahead of costs since ") + fmtMonth(R.base) + "." + (gap < 0 ? drivers.replace(/^ (\w)/, (m, a) => " " + a.toUpperCase()) : "")));
      row.appendChild(out);
    } else row.appendChild(el("div", "empty", "No tissue price index yet."));
    sec.appendChild(row);
    return sec;
  }
  function secHead(id, cap, title, tools) {
    const h = el("div", "sec-h"); h.id = id;
    const tx = el("div"); tx.append(el("p", "cap", cap), el("h3", null, title)); h.appendChild(tx);
    if (tools) h.appendChild(tools);
    return h;
  }
  // stacked share bar: [{ name, v, color }]
  function mixBar(parts) {
    const tot = parts.reduce((a, p) => a + p.v, 0) || 1;
    const bar = el("div", "mix"); bar.setAttribute("role", "img"); bar.setAttribute("aria-label", parts.map((p) => p.name + " " + (100 * p.v / tot).toFixed(0) + " %").join(", "));
    const lg = el("div", "mix-lg");
    parts.forEach((p) => {
      const i = el("i"); i.style.width = (100 * p.v / tot) + "%"; i.style.background = p.color; i.title = p.name + ": " + (100 * p.v / tot).toFixed(1) + " %"; bar.appendChild(i);
      const s = el("span"); const d = el("i"); d.style.background = p.color; s.append(d, document.createTextNode(p.name + " "), el("b", null, (100 * p.v / tot).toFixed(1) + " %")); if (p.extra) s.appendChild(el("small", null, " " + p.extra)); lg.appendChild(s);
    });
    return [bar, lg];
  }
  const MIX_COL = { mix_wind: "#33b09c", mix_solar: "#96d2dc", mix_biomass: "#1d7f6c", mix_hydro: "#0064aa", mix_gas: "#f4b49f", mix_coal: "#335777", mix_other: "#828282" };
  function mixPanel() {
    const items = M.indicators.filter((i) => i.stack === "powermix" && hasData(i));
    const sec = el("section", "panel ind-sec");
    const h = el("div", "ind-h"); sec.appendChild(h);
    if (!items.length) { h.append(el("h3", null, "Power mix behind the German grid"), el("span", null, "SMARD (CC BY 4.0)")); sec.appendChild(el("div", "empty", "The power mix arrives with the next data update.")); return sec; }
    const last = items.map((i) => i.series[i.series.length - 1][0]).sort()[0];
    h.append(el("h3", null, "Power mix behind the German grid"), el("span", null, fmtMonth(last) + " · share of public net generation · Bundesnetzagentur | SMARD.de (CC BY 4.0)"));
    const parts = items.map((i) => {
      const p = i.series.find((x) => x[0] === last); const prev = i.series.find((x) => x[0] === monthsBack(last, 12));
      const d = p && prev ? p[1] - prev[1] : null;
      return { name: i.label.replace("German power mix · ", ""), v: p ? p[1] : 0, color: MIX_COL[i.id] || "#828282", extra: d == null ? "" : (d > 0.05 ? "▲ " : d < -0.05 ? "▼ " : "▬ ") + Math.abs(d).toFixed(1) + " pp" };
    });
    sec.appendChild(el("h4", "gd-h", fmtMonth(last)));
    const [bar, lg] = mixBar(parts); sec.append(bar, lg);
    // development over the years: average share of the months of each calendar year
    const ys = [...new Set(items.flatMap((i) => i.series.map((p) => p[0].slice(0, 4))))].sort();
    const rows = ys.map((y) => {
      const ms = [...new Set(items.flatMap((i) => i.series.filter((p) => p[0].startsWith(y)).map((p) => p[0])))];
      const parts2 = items.map((i) => { const v = i.series.filter((p) => p[0].startsWith(y)).map((p) => p[1]); return { id: i.id, name: i.label.replace("German power mix · ", ""), v: v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0, color: MIX_COL[i.id] || "#828282" }; });
      const r = { year: y, parts: parts2, total: parts2.reduce((a, p) => a + p.v, 0) };
      if (ms.length < 12) r.partial = y + ": " + fmtMonth(ms.sort()[0]) + " – " + fmtMonth(ms[ms.length - 1]) + " only.";
      return r;
    }).filter((r) => r.total > 0);
    if (rows.length > 1) { sec.appendChild(el("h4", "gd-h", "By year · average of the months")); sec.appendChild(mixYears(rows)); }
    const w = el("p", "wepa-l"); w.append(el("b", null, "For WEPA"), document.createTextNode("Explains why the German grid factor moves – more wind and solar lower the location-based Scope 2 of German sites, more coal raises it. Changes are against the same month a year earlier."));
    sec.appendChild(w);
    return sec;
  }
  // Industry tab, yearly part: energy mix + fact cards; returns the section head (monthly panels are inserted before it)
  const ENERGY_COL = { prof_energy_gas: "#f4b49f", prof_energy_power: "#0064aa", prof_energy_renew: "#33b09c", prof_energy_coal: "#335777", prof_energy_oil: "#96d2dc" };
  function renderProfile(host) {
    const prof = M.indicators.filter((i) => i.group === "profile");
    const withData = prof.filter(hasData);
    const latest = withData.map((i) => i.series[i.series.length - 1][0].slice(0, 4)).sort().pop();
    const tools = el("div", "sec-tools");
    tools.appendChild(el("span", null, latest ? "Latest reporting year " + latest : "Waiting for the first Destatis data"));
    const head = secHead("ind-year", "Every year · industry profile", "Where does the industry stand on environment?", tools);
    host.appendChild(head);
    const sec = el("section", "panel ind-sec");
    const h = el("div", "ind-h"); h.append(el("h3", null, "Energy mix of the paper industry"), el("span", null, "share of energy use · Destatis 43531")); sec.appendChild(h);
    const years = energyYears();
    if (years.length) { h.lastChild.textContent = "share of energy use · " + years[0].year + "–" + years[years.length - 1].year + " · Destatis 43531"; sec.appendChild(mixYears(years, { unit: "TJ" })); }
    else sec.appendChild(el("div", "empty", "The energy mix arrives with the first Destatis data update."));
    const w = el("p", "wepa-l"); w.append(el("b", null, "For WEPA"), document.createTextNode("How gas-dependent the industry is and how far fuel switching has come – a yardstick for WEPA's transition plan (ESRS E1).")); sec.appendChild(w);
    host.appendChild(sec);
    const facts = prof.filter((i) => i.stack !== "energy").concat(prof.filter((i) => i.id === "prof_energy_total"));
    if (facts.length) { const g = el("div", "tiles fill"); facts.forEach((i) => g.appendChild(tile(i))); host.appendChild(g); }
    return head;
  }
  // energy mix per reporting year (absolute TJ per carrier + "Other" = total minus carriers)
  function energyYears() {
    const get = (id) => M.indicators.find((i) => i.id === id);
    const tot = get("prof_energy_total");
    const carriers = Object.keys(ENERGY_COL).map(get).filter((i) => i && hasData(i));
    if (!carriers.length) return [];
    const ys = [...new Set(carriers.flatMap((i) => i.series.map((p) => p[0])))].sort();
    const val = (i, y) => { const p = i && (i.series || []).find((x) => x[0] === y); return p ? p[1] : null; };
    return ys.map((y) => {
      const parts = carriers.map((i) => ({ id: i.id, name: i.label.replace("Energy use, paper industry · ", "").replace(/^\w/, (c) => c.toUpperCase()), v: val(i, y) || 0, color: ENERGY_COL[i.id] }));
      const sum = parts.reduce((a, p) => a + p.v, 0), t = val(tot, y);
      parts.push({ id: "other", name: "Other", v: t && t > sum * 1.005 ? t - sum : 0, color: "#828282" });
      return { year: y.slice(0, 4), parts, total: Math.max(t || 0, sum) };
    }).filter((r) => r.total > 0);
  }
  // 100 % stacked bar per year, newest on top; legend with the newest share and the change since the first year
  function mixYears(rows, opt) {
    opt = opt || {};
    const box = el("div", "myr");
    const first = rows[0], last = rows[rows.length - 1];
    const share = (r, id) => { const p = r.parts.find((x) => x.id === id); return p ? (100 * p.v) / r.total : 0; };
    const names = last.parts.filter((p) => rows.some((r) => share(r, p.id) > 0.05));
    const lg = el("div", "mix-lg");
    names.forEach((p) => {
      const sp = el("span"); const d = el("i"); d.style.background = p.color;
      const a = share(last, p.id), b = share(first, p.id), dd = a - b;
      sp.append(d, document.createTextNode(p.name + " "), el("b", null, a.toFixed(1) + " %"));
      if (rows.length > 1) sp.appendChild(el("small", null, " " + (dd > 0.05 ? "▲ " : dd < -0.05 ? "▼ " : "▬ ") + Math.abs(dd).toFixed(1) + " pp since " + first.year));
      lg.appendChild(sp);
    });
    box.appendChild(lg);
    const list = el("div", "myr-rows");
    rows.slice().reverse().forEach((r) => {
      const row = el("div", "myr-r");
      row.appendChild(el("span", "myr-y", r.year + (r.partial ? " *" : "")));
      const bar = el("div", "mix myr-bar"); bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", r.year + ": " + names.map((p) => p.name + " " + share(r, p.id).toFixed(0) + " %").join(", "));
      names.forEach((p) => {
        const v = share(r, p.id); if (v <= 0) return;
        const i = el("i"); i.style.width = v + "%"; i.style.background = p.color; i.title = r.year + " · " + p.name + ": " + v.toFixed(1) + " %";
        if (v >= 7) { i.textContent = Math.round(v) + "%"; if (["#96d2dc", "#f4b49f", "#33b09c"].includes(p.color)) i.classList.add("dk"); }
        bar.appendChild(i);
      });
      row.appendChild(bar);
      if (opt.unit) row.appendChild(el("span", "myr-t", Math.round(r.total).toLocaleString("en-GB") + " " + opt.unit));
      list.appendChild(row);
    });
    box.appendChild(list);
    if (rows.some((r) => r.partial)) box.appendChild(el("p", "gd-note", "* " + rows.find((r) => r.partial).partial));
    return box;
  }
  function energyParts() {
    const get = (id) => M.indicators.find((i) => i.id === id);
    const tot = get("prof_energy_total");
    const carriers = Object.keys(ENERGY_COL).map(get).filter((i) => i && hasData(i));
    if (!carriers.length) return null;
    const year = carriers.map((i) => i.series[i.series.length - 1][0]).sort().pop();
    const val = (i) => { const p = i && (i.series || []).find((x) => x[0] === year); return p ? p[1] : null; };
    const parts = carriers.map((i) => ({ name: i.label.replace("Energy use, paper industry · ", "").replace(/^\w/, (c) => c.toUpperCase()), v: val(i) || 0, color: ENERGY_COL[i.id] }));
    const sum = parts.reduce((a, p) => a + p.v, 0), t = val(tot);
    if (t && t > sum * 1.005) parts.push({ name: "Other", v: t - sum, color: "#828282" });
    return { year: year.slice(0, 4), parts, tot: Math.max(t || 0, sum) || 1 };
  }
  function buildTabs() {
    TABS = [{ id: "glance", label: "At a glance", groups: [], lead: GLANCE_LEAD }, { id: "cmp", label: PAGE === "costs" ? "Price trends" : "Trends", groups: [] }, ...TAB_DEF.filter((t) => (t.id === "cost" ? !!COST : ["industry", "water", "carbon", "gas", "fibre"].includes(t.id) ? true : t.groups.some((g) => M.groups[g])))]
      .filter((t) => PAGE_TABS[PAGE].includes(t.id)).sort((a, b) => PAGE_TABS[PAGE].indexOf(a.id) - PAGE_TABS[PAGE].indexOf(b.id));
  }
  function renderTabs() {
    $("tabs").replaceChildren(...TABS.map((t) => {
      const b = el("button", null, t.label); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(t.id === state.tab));
      if (t.id === "cmp") b.appendChild(el("small", null, state.cmp.length + " selected"));
      b.addEventListener("click", () => { state.tab = t.id; renderAll(); window.scrollTo({ top: 0 }); });
      return b;
    }));
    $("tab-cmp").hidden = state.tab !== "cmp";
    $("groups").hidden = state.tab === "cmp";
  }
  // Strip on the Grid tab: what is in the Trends chart right now
  function cmpStrip() {
    const box = el("div", "cmp-strip");
    box.appendChild(el("span", null, state.cmp.length ? "In the Trends chart:" : "Nothing in the Trends chart yet."));
    state.cmp.forEach((id) => { const i = M.indicators.find((x) => x.id === id); if (!i) return; const c = el("span", "cs-chip"); const d = el("i"); d.style.background = colorOf[id]; c.append(d, document.createTextNode(shortName(i))); box.appendChild(c); });
    if (state.cmp.length) { const go = el("button", "cs-go", "Open Trends →"); go.type = "button"; go.addEventListener("click", () => { state.tab = "cmp"; renderAll(); window.scrollTo({ top: 0 }); }); box.appendChild(go); }
    return box;
  }
  // Compare tab: indicator tiles by topic below the chart (grid countries too, the profile stays on Industry)
  function renderCmpTiles() {
    const host = $("cmp-tiles"); host.replaceChildren();
    if (state.tab !== "cmp") return;
    const term = state.find.trim().toLowerCase();
    const vis = visible().filter((i) => (state.topic === "all" || i.group === state.topic) && (!term || (i.label + " " + (i.short || "") + " " + (i.attribution || "")).toLowerCase().includes(term)));
    if (!vis.length) { host.appendChild(el("div", "empty", "No indicator matches – clear the search or pick another topic.")); return; }
    Object.entries(M.groups).forEach(([g, label]) => {
      if (g === "profile") return;
      const items = vis.filter((i) => i.group === g); if (!items.length) return;
      const sec = el("section", "group"); sec.appendChild(el("h3", "cap", label));
      const grid = state.lay === "list" ? el("div", "ilist") : el("div", "tiles");
      items.forEach((i) => grid.appendChild(state.lay === "list" ? indRow(i) : tile(i)));
      sec.appendChild(grid); host.appendChild(sec);
    });
  }
  function renderTiles() {
    const host = $("groups"); host.replaceChildren();
    const tab = TABS.find((t) => t.id === state.tab);
    if (!tab || tab.id === "cmp") return;
    // tab descriptions live in the "?" guide (assets/guide.js)
    if (tab.id === "grid") {
      // (no "In the Trends chart" strip here – countries are added to the chart from their pop-up)
      host.appendChild(mixPanel());
      const items = visible().filter((i) => i.group === "grid");
      const t = items.length ? gridTable(items) : null;
      if (t) {
        t.classList.replace("gt", "ind-sec");
        const gh = t.querySelector(".gt-head"), ih = el("div", "ind-h");
        ih.append(el("h3", null, "CO₂ intensity of national power grids"), el("span", null, gh ? gh.textContent : ""));
        if (gh) gh.replaceWith(ih); else t.prepend(ih);
      }
      host.appendChild(t || el("div", "empty", "Grid data arrives with the next data update (Ember)."));
      if (t) { const w = el("p", "wepa-l"); w.append(el("b", null, "For WEPA"), document.createTextNode("Electricity use × this factor gives the location-based Scope 2 of WEPA's sites in each country. Electrifying heat lowers emissions a lot in France, little in Poland.")); t.appendChild(w); }
    }
    if (tab.id === "glance") renderGlance(host);
    if (tab.id === "industry") renderIndustry(host);
    if (tab.id === "cost") renderCost(host);
    if (tab.id === "water") renderWater(host);
    if (tab.id === "gas") renderGas(host);
    if (tab.id === "fibre") renderFibre(host);
    if (tab.id === "carbon") {
      const panel = el("div", "panel cc-panel"); panel.id = "carbon";
      const hd = el("div", "cc-head"); hd.append(el("h4", null, "Carbon cost exposure · WEPA EU ETS sites"), el("span", null, "verified emissions × EUA price"));
      const body = el("div"); panel.append(hd, body);
      if (ETS) CarbonCost.render(body, ETS, M, { history: true }); else body.appendChild(el("p", "cc-note", "EU ETS data arrives with the next weekly run."));
      host.appendChild(panel);
    }
  }

  // ---------- side panel: period slicer (years → months) and indicator checklist ----------
  function cbox(stateVal) {
    const c = el("span", "cbx" + (stateVal === true ? " on" : stateVal === "mixed" ? " part" : ""));
    if (stateVal === true) c.textContent = "✓";
    return c;
  }
  function periodNode() {
    const wrap = el("div", "ps");
    const dd = el("button", "ps-dd"); dd.type = "button"; dd.setAttribute("aria-expanded", String(ui.open));
    dd.append(el("span", null, periodLabel()), el("span", "chev" + (ui.open ? " up" : "")));
    dd.addEventListener("click", () => { ui.open = !ui.open; renderBar(); });
    wrap.appendChild(dd);
    if (!ui.open) return wrap;
    const last = latestMonth();
    const tree = el("div", "ps-tree");
    if (!last) { tree.appendChild(el("p", "ps-empty", "No data yet.")); wrap.appendChild(tree); return wrap; }
    for (let yr = Number(last.slice(0, 4)); yr >= Number(EARLIEST.slice(0, 4)); yr--) {
      const months = monthRange(yr + "-01", yr + "-12").filter((m) => m >= EARLIEST && m <= last);
      const n = months.filter((m) => state.sel.has(m)).length;
      const st = n === 0 ? false : n === months.length ? true : "mixed";
      const row = el("div", "ps-row");
      const tw = el("button", "ps-tw", ui.exp.has(String(yr)) ? "▾" : "▸"); tw.type = "button"; tw.setAttribute("aria-label", (ui.exp.has(String(yr)) ? "Hide" : "Show") + " months of " + yr);
      tw.addEventListener("click", () => { ui.exp.has(String(yr)) ? ui.exp.delete(String(yr)) : ui.exp.add(String(yr)); renderBar(); });
      const yb = el("button", "ps-year"); yb.type = "button"; yb.setAttribute("role", "checkbox"); yb.setAttribute("aria-checked", String(st));
      yb.append(cbox(st), el("b", null, String(yr)));
      const first = months.filter((m) => state.sel.has(m));
      yb.appendChild(el("small", null, st === true ? (months.length === 12 ? "all" : MON[+months[0].slice(5) - 1] + " – " + MON[+months[months.length - 1].slice(5) - 1]) : st === "mixed" ? n + " of " + months.length : ""));
      yb.addEventListener("click", () => { months.forEach((m) => (st === true ? state.sel.delete(m) : state.sel.add(m))); renderAll(); });
      row.append(tw, yb); tree.appendChild(row);
      if (ui.exp.has(String(yr))) {
        const g = el("div", "ps-months");
        MON.forEach((name, k) => {
          const m = yr + "-" + String(k + 1).padStart(2, "0");
          const b = el("button", "ps-m" + (state.sel.has(m) ? " on" : ""), name); b.type = "button";
          b.setAttribute("aria-pressed", String(state.sel.has(m)));
          if (m < EARLIEST || m > last) { b.disabled = true; b.title = "No data yet"; }
          b.addEventListener("click", () => { state.sel.has(m) ? state.sel.delete(m) : state.sel.add(m); renderAll(); });
          g.appendChild(b);
        });
        tree.appendChild(g);
      }
    }
    const qs = el("div", "ps-qs");
    PRESETS.forEach(([k, label]) => { const b = el("button", null, label); b.type = "button"; b.addEventListener("click", () => { state.sel = preset(k); renderAll(); }); qs.appendChild(b); });
    tree.appendChild(qs);
    wrap.appendChild(tree);
    return wrap;
  }
  function indicatorNode() {
    const wrap = el("div", "idd");
    const all = visible().filter(chartable);
    const dd = el("button", "ps-dd"); dd.type = "button"; dd.setAttribute("aria-expanded", String(ui.indOpen));
    dd.append(el("span", null, state.cmp.length + " of " + all.length + " selected"), el("span", "chev" + (ui.indOpen ? " up" : "")));
    dd.addEventListener("click", () => { ui.indOpen = !ui.indOpen; renderBar(); });
    wrap.appendChild(dd);
    if (!ui.indOpen) return wrap;
    const tree = el("div", "ps-tree");
    tree.appendChild(RadarSide.bulkBar({ selected: state.cmp.length, total: all.length, max: Math.min(all.length, MAX_SEL),
      onAll: () => { all.forEach((i) => { if (!state.cmp.includes(i.id) && state.cmp.length < MAX_SEL) state.cmp.push(i.id); }); renderAll(); },
      onNone: () => { state.cmp = []; renderAll(); }, allTitle: "Add every listed indicator to the chart", noneTitle: "Empty the Trends chart" }));
    const q = el("input", "ind-q"); q.type = "search"; q.placeholder = "Find indicator"; q.setAttribute("aria-label", "Find indicator"); q.value = ui.indQ;
    tree.appendChild(q);
    const list = indicatorList(all); tree.appendChild(list); wrap.appendChild(tree);
    const apply = () => {
      const term = q.value.trim().toLowerCase(); ui.indQ = q.value;
      let head = null, shown = 0;
      [...list.children].forEach((n) => {
        if (n.classList.contains("ind-grp")) { if (head) head.hidden = !shown; head = n; shown = 0; return; }
        if (!n.classList.contains("ind")) return;
        const hit = !term || (n.title + " " + n.textContent).toLowerCase().includes(term); n.hidden = !hit; if (hit) shown++;
      });
      if (head) head.hidden = !shown;
    };
    q.addEventListener("input", apply); apply();
    return wrap;
  }
  function indicatorList(vis) {
    const box = el("div", "ind-list");
    if (!vis.length) { box.appendChild(el("p", "ps-empty", "No chartable data yet.")); return box; }
    Object.entries(M.groups).forEach(([g, label]) => {
      const items = vis.filter((i) => i.group === g); if (!items.length) return;
      const head = el("div", "ind-grp"); head.appendChild(el("span", null, label));
      const ids = items.map((i) => i.id); const allOn = ids.every((id) => state.cmp.includes(id));
      const ga = el("button", "ind-all", allOn ? "Deselect all" : "Select all"); ga.type = "button";
      ga.title = (allOn ? "Remove all " : "Add all ") + label + " indicators" + (allOn ? " from" : " to") + " the chart";
      ga.addEventListener("click", () => toggleGroup(ids));
      head.appendChild(ga); box.appendChild(head);
      items.forEach((i) => {
        const on = state.cmp.includes(i.id);
        const b = el("button", "ind"); b.type = "button"; b.setAttribute("role", "checkbox"); b.setAttribute("aria-checked", String(on));
        const c = cbox(on); if (on) { c.style.background = colorOf[i.id]; if (LIGHT.has(colorOf[i.id])) c.style.color = "var(--d-002d55-text, #002d55)"; }
        b.append(c, el("span", null, shortName(i)));
        b.title = i.label;
        b.addEventListener("click", () => toggle(i.id));
        box.appendChild(b);
      });
    });
    box.appendChild(el("p", "ind-note", "Up to " + MAX_LINES + " share one chart, more are shown as small charts"));
    return box;
  }

  // the summary sentence opens "At a glance" (below the tabs, so the tabs never move), styled like the Overview's first sentence
  function lineNode() {
    const p = el("p", "pg-sum"); const line = summaryLine();
    if (!line) return null;
    line.replace(/ (%|pp|pts)/g, "\u00a0$1").split("**").forEach((t, k) => { if (t) p.appendChild(k % 2 ? el("b", null, t) : document.createTextNode(t)); });
    return p;
  }
  function renderAll() {
    assignColors();
    renderTabs(); renderBar(); if (state.tab === "cmp") renderChart(); renderCmpTiles(); renderTiles(); writeHash();
  }

  $("tbl-btn").addEventListener("click", () => { const t = $("dtable"); t.hidden = !t.hidden; $("tbl-btn").setAttribute("aria-expanded", String(!t.hidden)); $("tbl-btn").textContent = t.hidden ? "Show as table" : "Hide table"; });
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (state.tab === "cmp") renderChart(); else if (state.tab === "cost" || state.tab === "industry" || state.tab === "grid" || state.tab === "water" || state.tab === "gas") renderTiles(); }, 120); });

  Promise.all([
    fetch("data/market.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch("data/peer_emissions.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("config/market.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("data/industry.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("data/water.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    // new sources (update-30): missing files simply leave their views empty
    ...(PAGE === "energy" ? ["data/gas.json", "data/weather.json", "data/sites_intl.json"] : PAGE === "market" ? ["data/pulp_origin.json", "config/eudr.json"] : [])
      .map((u) => fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)),
  ]).then(([data, ets, cfg, ind, water, x1, x2, x3]) => {
    M = data; ETS = ets; IND = ind; WATER = water;
    if (PAGE === "energy") { GAS = x1; WEATHER = x2; INTL = x3; } else if (PAGE === "market") { PULP = x1; EUDR = x2; }
    if (cfg) {
      (cfg.indicators || []).forEach((i) => { if (i.about) ABOUT[i.id] = i.about; });
      GRID_ABOUT = cfg.gridAbout || null; COST = cfg.costIndex || null;
      if (cfg.questions) QUESTIONS = cfg.questions;
      if (cfg.groups) M.groups = Object.assign({}, cfg.groups, M.groups && Object.fromEntries(Object.entries(M.groups).filter(([g]) => !(g in cfg.groups))));
      // config fields for the page (summary line, question, signal) and indicators not collected yet (shown as "waiting for data")
      const byId = new Map(M.indicators.map((i) => [i.id, i]));
      const order = [];
      (cfg.indicators || []).forEach((c) => {
        let i = byId.get(c.id);
        if (!i) { i = { id: c.id, group: c.group, areas: c.areas, label: c.label, unit: c.unit, freq: c.freq, attribution: c.attribution, link: c.link, source: c.source, series: [], status: "missing" }; }
        ["short", "good", "band", "glance", "question", "stack", "esrs", "label", "group"].forEach((k) => { if (c[k] != null) i[k] = c[k]; });
        order.push(i); byId.delete(c.id);
      });
      M.indicators = order.concat([...byId.values()]);
      if (PAGE === "market") { const pi = M.indicators.find((i) => i.id === "de_imp_pulp"); if (pi) { pi.group = "fibre_supply"; pi.question = "market"; M.groups.fibre_supply = "Fibre supply"; } }
    }
    $("meta").textContent = data.updated ? "Updated " + fmtDay(data.updated) : "Not collected yet";
    // links to the other page's tabs or indicators (old Market links, Overview, search) are forwarded
    {
      const hp = new URLSearchParams(START_HASH.slice(1));
      const t = hp.get("tab"), id = hp.get("ind") || hp.get("add");
      const indX = id && M.indicators.find((i) => i.id === id);
      const firstCmp = (hp.get("cmp") || "").split(",").map((x) => M.indicators.find((i) => i.id === x)).find(Boolean);
      let target = null;
      if (t && !PAGE_TABS[PAGE].includes(t)) target = Object.keys(PAGE_TABS).find((k) => PAGE_TABS[k].includes(t));
      else if (indX && !onPage(indX) && (!t || t === "cmp")) target = pageOf(indX);
      else if (!id && firstCmp && !onPage(firstCmp)) target = pageOf(firstCmp);
      if (target && target !== PAGE) { location.replace(PAGE_FILE[target] + START_HASH); return; }
    }
    buildTabs();
    state.sel = preset("36");
    if (latestMonth()) ui.exp.add(latestMonth().slice(0, 4));
    readHash();
    document.addEventListener("click", (e) => {
      if (ui.open && !e.target.closest(".ps")) { ui.open = false; renderBar(); }
      if (ui.indOpen && !e.target.closest(".idd") && e.target.isConnected) { ui.indOpen = false; renderBar(); }
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && (ui.open || ui.indOpen)) { ui.open = ui.indOpen = false; renderBar(); } });
    state.cmp = state.cmp.filter((id) => M.indicators.some((i) => i.id === id && chartable(i))).slice(0, MAX_SEL);
    if (!new URLSearchParams(location.hash.slice(1)).has("cmp")) state.cmp = defaultCmp();
    // "Add to Trends chart" from the search window: market.html#add=<indicator id>
    const addId = new URLSearchParams(START_HASH.slice(1)).get("add");
    if (addId && M.indicators.some((i) => i.id === addId && chartable(i))) { state.tab = "cmp"; if (!state.cmp.includes(addId)) state.cmp.push(addId); }
    renderAll();
    const indLink = new URLSearchParams(START_HASH.slice(1)).get("ind");
    const indObj = indLink && M.indicators.find((i) => i.id === indLink);
    if (indObj) setTimeout(() => openInd(indObj), 50);
  }).catch(() => {
    $("meta").textContent = "";
    $("groups").hidden = false; $("groups").replaceChildren(el("div", "empty", "Market data is not available yet. It is created by the weekly GitHub Action (scripts/collect_market.py)."));
    $("chart").replaceChildren(); $("tbl-btn").hidden = true;
  });
})();
