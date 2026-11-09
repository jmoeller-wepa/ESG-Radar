/* "How to read this page": a "?" button in the header opens a side drawer with a short, page-specific guide.
 */
(function () {
  const page = (location.pathname.split("/").pop() || "index.html").replace(".html", "") || "index";
  const G = {
    index: {
      title: "Overview",
      intro: "A short briefing: one sentence on what matters now, five key numbers, the monthly round-up and the next 30 days. Your own cards follow below.",
      items: [
        ["Key numbers", "Five market indicators with their latest value, the change against the period before and a 12-month line. Click one for details; choose which five under “Customize”."],
        ["Monthly round-up", "What changed in a month: regulation milestones, the most relevant news, the biggest market moves and peer headlines. Use ‹ › to switch months."],
        ["Arrange the cards", "Click “Customize”, then drag a card to any free place or add and remove cards. The layout is saved in your browser only – colleagues keep their own. “↺ Reset” brings back the default."],
        ["Freshness", "The status line in the header shows when the data was last collected. Data is updated every weekday morning."],
      ],
      caveat: "All figures come from public sources. Nothing on this site uses internal WEPA data.",
    },
    news: {
      title: "News",
      intro: "News from ESG, regulation, AI & data sources and from our peers, grouped by month.",
      items: [
        ["Filters", "Choose one or more areas in the side panel. Above the cards, “What it is” picks the kind of item (regulation, tools, best practice, peer news – peer news also by topic such as capacity or deals) and “Affects us” what it touches at WEPA. Filters are kept in the link, so you can share a filtered view."],
        ["Filter & search", "The box above the cards filters this page. The Search button in the header (Ctrl K) searches all pages at once."],
        ["Open a card", "Click a card for the full summary, why it matters for WEPA, the source and related entries."],
        ["Cards or list", "The switch at the end of the filter bar shows the news as cards or as a compact list with one line per item. Each month first shows its latest items – “Show all” opens the rest."],
        ["Deadlines & coming next", "The side panel lists upcoming regulation deadlines. In the Data & AI area, “Coming next” shows planned Microsoft Fabric / Power BI features by quarter."],
        ["Archive", "Older months stay available – just scroll down. The toolbar shows which year you are in."],
      ],
      caveat: "Summaries are short extracts from the source. Check the original before quoting it.",
    },
    regulation: {
      title: "Regulation",
      intro: "Status and timeline of the EU and German rules that matter for a tissue manufacturer.",
      items: [
        ["Tracker", "One row per rule with its current status and the next milestone. Click a row for phases, dates and links to the official texts."],
        ["Roadmap", "The same rules on a time axis, so overlapping deadlines are easy to spot."],
        ["Consultations", "Open EU “Have your say” consultations with their closing date, the step the file has reached (early idea, public consultation, draft text, proposal adopted) and the area it touches. Consultations with little link to tissue (e.g. road transport, fisheries) are folded away below the cards."],
        ["What changed", "“Changed” shows only rules whose status or dates moved recently."],
      ],
      caveat: "This is a monitoring aid, not legal advice. Dates follow the official sources and can still shift.",
    },
    peers: {
      title: "Peers",
      intro: "Public ESG figures of WEPA and its competitors, side by side.",
      items: [
        ["Benchmark table", "One row per company. Cell colours: dark green = best in the group, light green = better than the median, pink = below the median. Hover a value for its definition, year and report page. “Compact view” shortens long values; drag a column edge to change its width."],
        ["Profile cards", "Below the table: click a card for the full profile – targets, ratings, KPIs and the latest news."],
        ["Emissions · EU ETS", "Verified CO₂ emissions of the companies’ EU sites from the EU emissions trading register."],
        ["Empty fields", "An empty field means the company does not publish that figure (or it was not found). It is not a zero."],
      ],
      caveat: "Companies define KPIs differently (scope, base year, group vs. tissue business). Compare with care and read the notes.",
    },
    market: {
      title: "Market",
      intro: "Public statistics behind tissue costs and demand, sorted by four questions: costs, market, power and the industry's environmental profile.",
      items: [
        ["At a glance", "One line per indicator with what it tells WEPA and a signal: headwind or tailwind compared with a year earlier. Use the question filter on the left to focus."],
        ["Trends", "Open “Indicators in chart” on the left and tick what you want to compare. Up to 6 are shown in one chart as an index (start = 100); with more, each gets its own small chart. Every card says in one line what it means for WEPA."],
        ["Indicator details", "Click the name of an indicator for what it measures, what it does and does not tell you, and the source."],
        ["Cost index", "Read left to right: each input's change and index points, the cost index against the tissue price index, and the margin signal. You can change the weights – they are saved in your browser only."],
        ["Industry", "Every month: German production, retail sales and tissue trade. Every year: energy mix, water, waste and environmental investment of German paper mills – “Copy as text” for reports."],
        ["Grid carbon intensity", "The German power mix by source, and CO₂ per kWh by country – useful for location-based Scope 2."],
        ["Water", "Rhine level at Kaub (barge bottleneck) and next to our mills, plus soil moisture around each German mill. Only the status pill is coloured: low water or dry."],
      ],
      caveat: "Index lines show direction and size of changes, not price levels. Public price series are averages and lag behind contract prices.",
    },
  };
  const g = G[page]; if (!g) return;
  const css = `
  .hg-btn { flex: none; width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--h-ctl-border, rgba(255,255,255,.28)); background: var(--h-ctl-bg, rgba(255,255,255,.12)); color: var(--h-ctl-fg, #fff); font: 600 16px/1 inherit; cursor: pointer; position: relative; }
  .hg-btn:hover { background: var(--h-ctl-hover, rgba(255,255,255,.22)); }
  .hg-btn:focus-visible { outline: 2px solid var(--d-96d2dc-border, #96d2dc); outline-offset: 2px; }
  .hg-tip { position: absolute; top: calc(100% + 10px); right: -6px; width: 220px; background: var(--d-fff-bg, #fff); color: var(--d-111827-text, #111827); border-radius: 10px; padding: 10px 12px; font: 400 13px/1.4 inherit; text-align: left; box-shadow: 0 12px 32px rgba(0,20,50,.25); z-index: 90; cursor: default; }
  .hg-tip::before { content: ""; position: absolute; top: -6px; right: 16px; width: 12px; height: 12px; background: var(--d-fff-bg, #fff); transform: rotate(45deg); }
  @media (max-width: 960px) { .hg-tip { position: fixed; top: 128px; left: 16px; right: 16px; width: auto; } .hg-tip::before { display: none; } }
  .hg-tip b { display: block; margin-bottom: 2px; }
  .hg-tip button { margin-top: 8px; border: 0; background: none; color: var(--d-0064aa-text, #0064aa); font: 600 12.5px inherit; padding: 0; cursor: pointer; }
  dialog.hg-drawer { margin: 0 0 0 auto; height: 100vh; max-height: 100vh; width: min(440px, 100vw); border: 0; padding: 0; color: var(--ink, var(--d-111827-text, #111827)); box-shadow: -18px 0 48px rgba(0,20,50,.2); }
  dialog.hg-drawer[open] { animation: hg-in .18s ease-out; }
  @keyframes hg-in { from { transform: translateX(24px); opacity: 0; } }
  .hg-h { position: sticky; top: 0; background: var(--d-fff-bg, #fff); display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 20px 24px 12px; border-bottom: 1px solid var(--line-2, var(--d-eef0f3-border, #eef0f3)); }
  .hg-h small { display: block; font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: var(--d-8a94a3-text, #8a94a3); font-weight: 600; }
  .hg-h h3 { margin: 2px 0 0; font-size: 20px; color: var(--blue-900, var(--d-002d55-text, #002d55)); }
  .hg-b { padding: 16px 24px 28px; font-size: 14px; line-height: 1.5; }
  .hg-b > p { margin: 0 0 14px; color: var(--d-374151-text, #374151); }
  .hg-b dl { margin: 0; display: grid; gap: 14px; }
  .hg-b dl > div { display: block; }
  .hg-b dt { font-weight: 600; color: var(--blue-900, var(--d-002d55-text, #002d55)); }
  .hg-b dd { margin: 2px 0 0; color: var(--d-4b5563-text, #4b5563); }
  .hg-c { margin-top: 18px; padding: 10px 12px; border-radius: 10px; background: var(--d-fff7f2-bg, #fff7f2); border: 1px solid var(--d-f9dccf-border, #f9dccf); color: var(--d-6b3b25-text, #6b3b25); font-size: 13px; }
  .hg-b .hg-f { margin: 18px 0 0; font-size: 12.5px; color: var(--d-8a94a3-text, #8a94a3); }`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const meta = document.querySelector("header #meta") || document.querySelector("header .meta");
  const host = meta ? meta.parentElement : document.querySelector("header .wrap");
  if (!host) return;
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "hg-btn"; btn.textContent = "?"; btn.title = "How to read this page"; btn.setAttribute("aria-label", "How to read this page");
  if (meta) meta.after(btn); else host.appendChild(btn);

  const dlg = document.createElement("dialog"); dlg.className = "hg-drawer"; dlg.setAttribute("aria-labelledby", "hg-ttl");
  dlg.innerHTML = '<div class="hg-h"><div><small>How to read this page</small><h3 id="hg-ttl"></h3></div><button type="button" class="ui-x" aria-label="Close">×</button></div><div class="hg-b"><p></p><dl></dl><div class="hg-c"></div><p class="hg-f">Questions or ideas for the radar? Contact the ESG Controlling &amp; Digitization team.</p></div>';
  dlg.querySelector("#hg-ttl").textContent = g.title;
  dlg.querySelector(".hg-b > p").textContent = g.intro;
  const dl = dlg.querySelector("dl");
  g.items.forEach(([t, d]) => { const w = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = t; dd.textContent = d; w.append(dt, dd); dl.append(w); });
  dlg.querySelector(".hg-c").textContent = g.caveat;
  document.body.appendChild(dlg);
  const KEY = "radar.guideSeen." + page;
  const seen = () => { try { localStorage.setItem(KEY, "1"); } catch (e) {} };
  let tip = null;
  const open = () => { if (tip) { tip.remove(); tip = null; } seen(); dlg.showModal(); };
  btn.addEventListener("click", open);
  dlg.querySelector(".ui-x").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (ev) => { if (ev.target === dlg) dlg.close(); });

  // No automatic hint any more: the guide opens only when the "?" button is clicked.
})();
