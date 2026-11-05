/* Carbon cost exposure (shared by the Overview widget and the Market page).
   WEPA's verified EU ETS emissions × EUA price, gross and net of free allocation, with a "what if" price slider.
   Inputs: data/peer_emissions.json (Union Registry: emissions + free allocation) and the EUA value in data/market.json. */
(function () {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const css = `
  .cc-wrap { display: flex; flex-direction: column; gap: 12px; }
  .cc-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .cc-kpi { background: var(--d-f5f8fb-bg, #f5f8fb); border-radius: 10px; padding: 10px 12px; }
  .cc-kpi p { margin: 0; font-size: 11.5px; color: var(--d-6b7280-text, #6b7280); }
  .cc-kpi b { font-size: 19px; color: var(--d-002d55-text, #002d55); font-variant-numeric: tabular-nums; }
  .cc-kpi small { font-size: 11.5px; color: var(--d-8a94a3-text, #8a94a3); margin-left: 4px; }
  .cc-res { display: flex; flex-wrap: wrap; gap: 8px 28px; align-items: flex-end; }
  .cc-res p { margin: 0 0 2px; font-size: 12.5px; color: var(--d-6b7280-text, #6b7280); }
  .cc-big { font-size: 30px; font-weight: 650; color: var(--d-002d55-text, #002d55); letter-spacing: -.01em; line-height: 1.05; font-variant-numeric: tabular-nums; }
  .cc-big.net { color: var(--d-0064aa-text, #0064aa); }
  .cc-big.sur { color: var(--d-1d7f6c-text, #1d7f6c); }
  .cc-sub { font-size: 12px; color: var(--d-6b7280-text, #6b7280); margin-top: 3px; }
  .cc-yrs { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: 12.5px; color: var(--d-6b7280-text, #6b7280); }
  .cc-yrs button { border: 1px solid var(--d-e3e7ec-border, #e3e7ec); background: var(--d-fff-bg, #fff); border-radius: 7px; padding: 2px 9px; font: inherit; font-size: 12.5px; color: var(--d-374151-text, #374151); cursor: pointer; }
  .cc-yrs button[aria-pressed="true"] { border-color: #33b09c; background: var(--d-e8f7f4-bg, #e8f7f4); color: var(--d-00594a-text, #00594a); font-weight: 600; }
  .cc-hist tr.cur td { background: var(--d-f5f8fb-bg, #f5f8fb); font-weight: 600; }
  .cc-sl { display: flex; flex-direction: column; gap: 4px; }
  .cc-sl label { font-size: 12.5px; color: var(--d-4b5563-text, #4b5563); }
  .cc-sl label b { color: var(--d-002d55-text, #002d55); }
  .cc-sl input[type=range] { width: 100%; accent-color: #0064aa; }
  .cc-ticks { display: flex; justify-content: space-between; font-size: 11px; color: var(--d-9aa2ae-text, #9aa2ae); }
  .cc-note { margin: 0; font-size: 12px; color: var(--d-6b7280-text, #6b7280); line-height: 1.45; }
  .cc-hist { width: 100%; border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; }
  .cc-hist th, .cc-hist td { padding: 5px 8px; border-bottom: 1px solid var(--d-f0f2f5-border, #f0f2f5); text-align: right; white-space: nowrap; }
  .cc-hist th:first-child, .cc-hist td:first-child { text-align: left; }
  .cc-hist th { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--d-6b7280-text, #6b7280); }`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const fmtT = (t) => (t / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + " kt";
  const fmtEur = (e) => (Math.abs(e) >= 1e6 ? "€" + (e / 1e6).toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + " m" : "€" + Math.round(e / 1000).toLocaleString("en-GB") + " k");

  function inputs(ets, market, company, pick) {
    const c = ets && ets.companies && ets.companies[company || "wepa"];
    if (!c) return null;
    const years = Object.keys(c.total || {}).sort();
    const n = (c.installations || []).length;
    const complete = (y) => !c.reporting || (c.reporting[y] || 0) >= n;
    // default: the latest year in which all sites reported (a partial year understates emissions)
    const year = pick && years.includes(pick) ? pick : [...years].reverse().find(complete) || years[years.length - 1];
    const eua = market && (market.indicators || []).find((i) => i.id === "eua");
    const pt = eua && eua.series && eua.series[eua.series.length - 1];
    return {
      c, year, years,
      em: year ? c.total[year] : null,
      alloc: c.allocation && year && c.allocation[year] != null ? c.allocation[year] : null,
      sites: (c.installations || []).length,
      price: pt ? pt[1] : null, priceDate: pt ? pt[0] : null,
      partial: !!(year && !complete(year)), complete,
    };
  }

  // opts: { compact: bool, history: bool }
  function render(box, ets, market, opts) {
    opts = opts || {};
    box.replaceChildren();
    const d = inputs(ets, market, opts.company, opts.year);
    const wrap = el("div", "cc-wrap");
    if (!d || d.em == null) { wrap.appendChild(el("p", "cc-note", "EU ETS data arrives with the next weekly run of the GitHub Action.")); box.appendChild(wrap); return; }
    if (d.price == null) { wrap.appendChild(el("p", "cc-note", "No EUA price yet – add one in config/market.json (indicator 'eua').")); box.appendChild(wrap); return; }
    const k = el("div", "cc-kpis");
    const kpi = (label, val, small) => { const x = el("div", "cc-kpi"); x.append(el("p", null, label), el("b", null, val)); if (small) x.appendChild(el("small", null, small)); return x; };
    k.append(kpi("Verified emissions " + d.year + (d.partial ? " *" : ""), fmtT(d.em), d.sites + " sites"),
      kpi("Free allocation " + d.year, d.alloc != null ? fmtT(d.alloc) : "–", d.alloc != null ? Math.round((100 * d.alloc) / d.em) + "% of emissions" : "after next run"),
      kpi("EUA price", "€" + d.price.toLocaleString("en-GB", { maximumFractionDigits: 2 }), "per t · " + d.priceDate));
    if (!opts.compact && d.years.length > 1) {
      const ys = el("div", "cc-yrs"); ys.appendChild(el("span", null, "Emission year:"));
      d.years.slice(-5).forEach((y) => {
        const b = el("button", null, y + (d.complete(y) ? "" : " *")); b.type = "button"; b.setAttribute("aria-pressed", String(y === d.year));
        if (!d.complete(y)) b.title = "Not all sites reported yet";
        b.addEventListener("click", () => render(box, ets, market, Object.assign({}, opts, { year: y, price: Number(input.value) })));
        ys.appendChild(b);
      });
      wrap.appendChild(ys);
    }
    wrap.appendChild(k);
    const res = el("div", "cc-res");
    const g = el("div"); const gv = el("div", "cc-big"); g.append(el("p", null, "Gross cost"), gv, el("div", "cc-sub", "all verified emissions × price"));
    const n = el("div"); const nl = el("p", null, "Net – after free allocation"); const nv = el("div", "cc-big net"); const ns = el("div", "cc-sub"); n.append(nl, nv, ns);
    res.append(g); if (d.alloc != null) res.append(n);
    wrap.appendChild(res);
    const sl = el("div", "cc-sl");
    const lab = el("label"); const input = document.createElement("input");
    input.type = "range"; input.min = 40; input.max = 160; input.step = 1; input.value = Math.round(opts.price || d.price);
    input.setAttribute("aria-label", "EUA price in euro per tonne");
    const ticks = el("div", "cc-ticks"); ticks.append(el("span", null, "€40"), el("span", null, "€" + Math.round(d.price) + " today"), el("span", null, "€160"));
    sl.append(lab, input, ticks);
    wrap.appendChild(sl);
    const histCells = [];
    let histHead = null;
    const upd = () => {
      const p = Number(input.value);
      gv.textContent = fmtEur(d.em * p);
      if (d.alloc != null) {
        const gap = d.em - d.alloc;
        if (gap >= 0) { nl.textContent = "Net – after free allocation"; nv.className = "cc-big net"; nv.textContent = fmtEur(gap * p); ns.textContent = fmtT(gap) + " to buy × price"; }
        else { nl.textContent = "Surplus – allocation above emissions"; nv.className = "cc-big sur"; nv.textContent = fmtEur(-gap * p); ns.textContent = fmtT(-gap) + " spare allowances × price · no purchase needed"; }
      }
      histCells.forEach(([td, short]) => { td.textContent = short == null ? "–" : fmtEur(short * p); });
      if (histHead) histHead.textContent = "Net cost at €" + p + " / t";
      lab.replaceChildren(document.createTextNode("What if the EUA price is "), el("b", null, "€" + p + " / t"), document.createTextNode(p === Math.round(d.price) ? " (today's value)" : ""));
    };
    input.addEventListener("input", upd); upd();
    if (opts.history && d.years.length > 1) {
      const t = el("table", "cc-hist"); const hr = el("tr");
      ["Year", "Emissions", "Free allocation", "Shortfall", "Net cost"].forEach((h) => { const x = el("th", null, h); hr.appendChild(x); histHead = x; });
      const th = el("thead"); th.appendChild(hr); t.appendChild(th);
      const tb = el("tbody");
      d.years.slice().reverse().forEach((y) => {
        const em = d.c.total[y], al = d.c.allocation ? d.c.allocation[y] : null;
        const tr = el("tr", y === d.year ? "cur" : "");
        const cost = el("td"); histCells.push([cost, al != null ? Math.max(0, em - al) : null]);
        tr.append(el("td", null, y + (d.complete(y) ? "" : " *")), el("td", null, fmtT(em)), el("td", null, al != null ? fmtT(al) : "–"),
          el("td", null, al != null ? fmtT(Math.max(0, em - al)) : "–"), cost);
        tb.appendChild(tr);
      });
      t.appendChild(tb); const sc = el("div"); sc.style.overflowX = "auto"; sc.appendChild(t); wrap.appendChild(sc);
    }
    upd();
    wrap.appendChild(el("p", "cc-note", "Indicative only: WEPA sites in the EU ETS (not the UK or non-EU sites) · verified emissions and free allocation from the EU Union Registry · EUA price entered manually (exchange prices are licensed). Free allocation falls over time (benchmark updates, CBAM phase-in)." + (d.years.some((y) => !d.complete(y)) ? " * not all sites reported that year – emissions are understated." : "")));
    box.appendChild(wrap);
  }
  window.CarbonCost = { render, inputs };
})();
