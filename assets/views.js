/* ESG Radar – saved news views ("tabs" on the News page, cards on the Overview).
   A view is a saved set of News filters. Views live in this browser only (localStorage). */
(function () {
  const KEY = "radar.newsViews.v1";
  // every filter a view can hold; these values mean "no filter"
  // tool, type, impact, rel and co can hold several values, comma-separated ("regulation,peer:deals"); "all" = no filter
  const BASE = { view: "all", areas: [], tool: "all", type: "all", topic: "all", impact: "all", rel: "all", co: "all", sort: "date", q: "", layout: "cards" };
  const list = (v) => (v && v !== "all" ? String(v).split(",").filter(Boolean) : []);
  const join = (a) => (a && a.length ? a.join(",") : "all");
  // "What it is" values: a type, "monthly", "peer" (all peer news) or "peer:<topic>"
  const peerOn = (f) => list(f.type).some((t) => t === "peer" || t.startsWith("peer:"));
  // offered on first use; everything can be renamed, changed or deleted afterwards
  const STARTERS = [
    { id: "reporting", name: "Reporting", f: { areas: ["reporting"] } },
    { id: "energy", name: "Energy", f: { areas: ["climate"] } },
    { id: "peerwatch", name: "Peer watch", f: { type: "peer", layout: "list" } },
    { id: "sites", name: "Our sites", f: { impact: "sites" } }
  ];

  // Topics: assigned by keywords (English, German, Italian, Spanish headlines); an entry can have several
  const TOPICS = {
    capacity: { label: "Capacity & investment", re: /invest|expan|capacity|new (paper |tissue )?machine|new (plant|mill|factory|line)|production line|start-?up of|Werk|Fabrik|erweitert|Kapazit|Produktion|stabiliment|investiment|planta|nueva l[ií]nea/i },
    deals: { label: "M&A & results", re: /acqui|merger|takeover|stake|divest|buys|sells|sale of|IPO|results|earnings|revenue|profit|quarter|\bQ[1-4]\b|Übernahme|übernimmt|Umsatz|Gewinn|Quartal|Bilanz|acquisizion|fatturato|utile|adquisici|resultados/i },
    sustain: { label: "Sustainability & ESG", re: /sustainab|climate|\bCO2\b|CO₂|carbon|emission|\bESG\b|SBTi|net.?zero|recycl|renewable|\bFSC\b|EcoVadis|\bCDP\b|biodivers|water|Nachhaltig|Klima|Recycling|sostenib|riciclo|sustentab/i },
    products: { label: "Products & brands", re: /launch|new product|brand|range|innovation|toilet paper|kitchen (roll|towel)|hand towel|facial tissue|napkin|packaging|Toilettenpapier|Klopapier|Küchenrolle|Taschentuch|Marke|Produkt|Verpackung|prodott|marchio|carta igienica|marca|papel higi/i },
    markets: { label: "Prices & markets", re: /price|pulp|demand|market share|tariff|\bcost|inflation|private label|Preis|Zellstoff|Markt|Handelsmarke|prezz|cellulosa|precio|celulosa/i },
    people: { label: "People & organisation", re: /\bCEO\b|\bCFO\b|appoint|names .* (chief|head|president)|board|management team|employees|jobs|layoff|strike|union|Vorstand|Geschäftsführ|Mitarbeiter|Stellen|Streik|nomina|amministratore|despid|nombra/i },
    policy: { label: "Regulation & policy", re: /regulation|directive|\blaw\b|Commission|omnibus|\bCSRD\b|\bESRS\b|\bEUDR\b|\bPPWR\b|\bETS\b|\bCBAM\b|taxonomy|Gesetz|Verordnung|Richtlinie|normativ|regolament/i }
  };
  const PEER_TOPICS = ["capacity", "deals", "products", "markets", "people"];
  const topicsOf = (e) => e._topics || (e._topics = Object.keys(TOPICS).filter((k) => TOPICS[k].re.test(e.title + " " + (e.summary || "") + " " + (e.tags || []).join(" "))));
  const TOOLS = {
    fabric: { label: "Fabric", re: /\bfabric\b|onelake|data agent/i },
    powerbi: { label: "Power BI", re: /power ?bi|semantic model|\bdax\b/i },
    copilot: { label: "Copilot", re: /copilot/i },
    claude: { label: "Claude", re: /\bclaude\b|anthropic/i },
    chatgpt: { label: "ChatGPT", re: /chatgpt|openai|\bgpt\b|\bcodex\b/i },
    gemini: { label: "Gemini", re: /\bgemini\b|deepmind/i },
    ai: { label: "AI news", of: ["copilot", "claude", "chatgpt", "gemini"] },
    other: { label: "Other" }
  };
  const toolsOf = (e) => {
    if (e._tools) return e._tools;
    const t = [e.title, e.summary, e.source, (e.tags || []).join(" ")].join(" ");
    const found = Object.keys(TOOLS).filter((k) => TOOLS[k].re && TOOLS[k].re.test(t));
    if (found.some((k) => TOOLS.ai.of.includes(k))) found.push("ai");
    return (e._tools = found.length ? found : ["other"]);
  };
  const areasOf = (e) => (e.areas && e.areas.length ? e.areas : e.area ? [e.area] : []);
  const relOf = (e) => (["high", "medium", "low"].includes(e.relevance) ? e.relevance : "medium");

  // Peer news (weekly Google News search per company) become entries of type "peer"
  function peerEntries(pn, peers) {
    const names = {}; ((peers && peers.companies) || []).forEach((c) => { names[c.id] = c.name; });
    const out = [], seen = new Set();
    Object.entries((pn && pn.companies) || {}).forEach(([cid, list]) => (list || []).forEach((n) => {
      if (!n || !n.title || !n.url) return;
      const key = n.title.toLowerCase().replace(/\s+-\s+[^-]+$/, "").slice(0, 80);
      if (seen.has(key)) { const prev = out.find((x) => x._key === key); if (prev && !prev.companies.includes(names[cid] || cid)) prev.companies.push(names[cid] || cid); return; }
      seen.add(key);
      out.push({ id: "pn-" + cid + "-" + (n.date || "") + "-" + key.replace(/[^a-z0-9]+/g, "").slice(0, 24), _key: key, type: "peer", origin: "peer",
        title: n.title, summary: "", source: n.source || "", url: n.url, date: n.date, added: n.date, relevance: "medium",
        areas: [], companies: [names[cid] || cid], tags: [names[cid] || cid] });
    }));
    return out;
  }

  // old: true for views saved before filters took several values (rel "medium" meant "high & medium")
  const norm = (f, old) => {
    const x = { ...BASE };
    Object.keys(BASE).forEach((k) => { if (f && f[k] != null && k !== "areas") x[k] = String(f[k]); });
    x.areas = f && Array.isArray(f.areas) ? f.areas.map(String) : [];
    // one peer topic used to sit in its own field
    if (x.topic !== "all") { if (x.type === "peer" || x.type === "all") x.type = "peer:" + x.topic; x.topic = "all"; }
    // "All AI news" became the AI assistants group
    if (list(x.tool).includes("ai")) x.tool = join([...new Set(list(x.tool).flatMap((t) => (t === "ai" ? TOOLS.ai.of : [t])))]);
    if (old && x.rel === "medium") x.rel = "high,medium";
    if (!peerOn(x)) x.co = "all";
    return x;
  };
  // which filters differ between two views (empty list = the same)
  const diff = (a, b) => Object.keys(BASE).filter((k) => (k === "areas" ? [...a.areas].sort().join() !== [...b.areas].sort().join() : a[k] !== b[k]));

  // does entry e pass the filters f? ctx: { isNew(e), isSaved(e) }; opt.skipView / opt.skipQ leave those filters out
  function match(e, f, ctx, opt) {
    opt = opt || {};
    if (!opt.skipView) {
      if (f.view === "new" && !(ctx && ctx.isNew(e))) return false;
      if (f.view === "saved" && !(ctx && ctx.isSaved(e))) return false;
      if (f.view === "monthly" && !e.monthlySummary) return false;
    }
    if (f.areas.length && !areasOf(e).some((a) => f.areas.includes(a))) return false;
    const tools = list(f.tool), impacts = list(f.impact), types = list(f.type), rels = list(f.rel), cos = list(f.co);
    if (f.areas.length === 1 && f.areas[0] === "data" && tools.length && !toolsOf(e).some((t) => tools.includes(t))) return false;
    if (impacts.length && !(e.impacts || ["watch"]).some((i) => impacts.includes(i))) return false;
    if (f.topic !== "all" && !topicsOf(e).includes(f.topic)) return false;
    if (types.length && !types.some((t) => t === "monthly" ? !!e.monthlySummary
      : t === "peer" ? e.type === "peer"
      : t.startsWith("peer:") ? e.type === "peer" && topicsOf(e).includes(t.slice(5))
      : e.type === t)) return false;
    if (rels.length && !rels.includes(relOf(e))) return false;
    // companies narrow peer news only; other kinds of news pass
    if (cos.length && peerOn(f) && e.type === "peer" && !(e.companies || []).some((c) => cos.includes(c))) return false;
    if (f.q && !opt.skipQ && ![e.title, e.summary, e.whyItMatters, e.source, (e.tags || []).join(" ")].join(" ").toLowerCase().includes(f.q)) return false;
    return true;
  }

  function load() {
    try {
      const x = JSON.parse(localStorage.getItem(KEY));
      if (x && Array.isArray(x.list)) {
        const old = x.fv !== 2;
        const views = x.list.filter((v) => v && v.id && v.name).map((v) => ({ id: String(v.id), name: String(v.name).slice(0, 40), f: norm(v.f, old) }));
        return { list: views, active: String(x.active || "all"), start: x.start ? String(x.start) : null };
      }
    } catch (e) {}
    return { list: STARTERS.map((v) => ({ id: v.id, name: v.name, f: norm(v.f) })), active: "all", start: null };
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify({ fv: 2, list: s.list, active: s.active, start: s.start || null })); } catch (e) {} }

  window.RadarViews = { KEY, BASE, list, join, peerOn, STARTERS, TOPICS, PEER_TOPICS, TOOLS, topicsOf, toolsOf, areasOf, relOf, peerEntries, norm, diff, match, load, save };
})();
