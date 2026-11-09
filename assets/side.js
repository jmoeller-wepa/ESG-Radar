/* Shared sidebar for the Peers and Market pages (same look and areas as the Radar page).
   RadarSide.build(container, { groups: [...], onChange }) renders the groups (group.multi: several rows can be ticked);
   RadarSide.area() / RadarSide.setArea() keep the selected area in sync across pages. */
(function () {
  const AREAS = {
    climate: { label: "Climate & Energy", icon: '<path d="M10 9.5V3.5a2 2 0 1 0-4 0v6a3 3 0 1 0 4 0Z"/><path d="M8 6v5"/>' },
    forests: { label: "Forests & Biodiversity", icon: '<path d="M8 1.5L3.5 8h2L3 11.5h10L10.5 8h2Z"/><path d="M8 11.5V15"/>' },
    circularity: { label: "Circularity & Packaging", icon: '<path d="M13 8a5 5 0 0 1-8.5 3.5"/><path d="M3 8a5 5 0 0 1 8.5-3.5"/><path d="M11.8 1.8v2.9H8.9"/><path d="M4.2 14.2v-2.9h2.9"/>' },
    water: { label: "Water & Pollution", icon: '<path d="M8 1.8S3.5 7 3.5 10a4.5 4.5 0 0 0 9 0C12.5 7 8 1.8 8 1.8Z"/>' },
    people: { label: "People & Supply chain", icon: '<circle cx="6" cy="5.5" r="2.3"/><path d="M1.8 13.5c.5-2.4 2.2-3.7 4.2-3.7s3.7 1.3 4.2 3.7"/><circle cx="11.3" cy="6" r="1.8"/><path d="M11 9.6c1.7.1 2.9 1.3 3.2 3.4"/>' },
    reporting: { label: "Reporting & Governance", icon: '<path d="M4 1.8h5.5L12.5 5v9.2H4Z"/><path d="M9.5 1.8V5h3"/><path d="M6 8.5h4.5M6 11h4.5"/>' },
    data: { label: "Data & AI", icon: '<ellipse cx="8" cy="4" rx="5" ry="2"/><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4"/><path d="M3 8c0 1.1 2.2 2 5 2s5-.9 5-2"/>' },
  };
  const ALL_ICON = '<circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11M8 2.5c1.8 1.7 1.8 9.3 0 11M8 2.5c-1.8 1.7-1.8 9.3 0 11"/>';
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  function icon(markup) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    ["width", "height"].forEach((a) => s.setAttribute(a, "16"));
    s.setAttribute("viewBox", "0 0 16 16"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.5"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true");
    s.innerHTML = markup; // static markup defined in this file, never data
    return s;
  }
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  // groups: [{ id, title, items: [{ key, label, icon?, count?, disabled?, title? }], selected }]
  function build(aside, opts) {
    aside.replaceChildren();
    const toggle = el("button", "side-toggle", opts.toggleLabel || "Filters");
    toggle.type = "button"; toggle.setAttribute("aria-expanded", "false");
    const sum = el("span"); toggle.appendChild(sum);
    const body = el("div", "side-body");
    toggle.addEventListener("click", () => { const o = aside.classList.toggle("open"); toggle.setAttribute("aria-expanded", String(o)); });
    aside.append(toggle, body);
    const api = { refresh };
    // Scroll positions survive a refresh: the page, the panel and every scrolling list inside it
    const SCROLLERS = ".ps-tree, .co-list, .ind-list, [data-keep-scroll]";
    function keepScroll() {
      const lists = {};
      body.querySelectorAll(SCROLLERS).forEach((n) => { (lists[n.className] = lists[n.className] || []).push(n.scrollTop); });
      return { y: window.scrollY, aside: aside.scrollTop, body: body.scrollTop, lists };
    }
    function restoreScroll(k) {
      const seen = {};
      body.querySelectorAll(SCROLLERS).forEach((n) => { const i = seen[n.className] = (seen[n.className] || 0) + 1; const v = (k.lists[n.className] || [])[i - 1]; if (v) n.scrollTop = v; });
      if (k.aside) aside.scrollTop = k.aside;
      if (k.body) body.scrollTop = k.body;
      if (Math.abs(window.scrollY - k.y) > 1) window.scrollTo({ top: k.y });
    }
    function refresh(groups) {
      const kept = keepScroll();
      body.replaceChildren();
      const sums = [];
      groups.forEach((g) => {
        const wrap = el("div", "side-group"); wrap.setAttribute("role", "group");
        const cap = el("p", "cap", g.title); cap.id = "sg-" + g.id; wrap.setAttribute("aria-labelledby", cap.id);
        wrap.appendChild(cap);
        // g.multi: selected is a list; "all" is the reset row, the other rows get a checkbox
        const isOn = (k) => (g.multi ? (k === "all" ? !g.selected.length : g.selected.includes(k)) : k === g.selected);
        g.items.forEach((it) => {
          const b = el("button", "sitem"); b.type = "button";
          const on = isOn(it.key);
          if (g.multi && it.key !== "all") { const c = el("span", "cbx" + (on ? " on" : "")); if (on) c.textContent = "✓"; b.appendChild(c); b.setAttribute("role", "checkbox"); b.setAttribute("aria-checked", String(on)); }
          else if (it.icon) b.appendChild(icon(it.icon));
          b.appendChild(el("span", "lbl", it.label));
          b.appendChild(el("span", "count", it.count == null ? "" : String(it.count)));
          if (!(g.multi && it.key !== "all")) b.setAttribute("aria-pressed", String(on));
          if (on) sums.push(it.label);
          if (it.disabled) { b.disabled = true; b.title = it.title || "Nothing for this area on this page"; }
          b.addEventListener("click", () => { aside.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); opts.onChange(g.id, it.key); });
          wrap.appendChild(b);
        });
        body.appendChild(wrap);
      });
      // Extra cards below the groups (e.g. the legend or the Market period slicer); nodes are reused between refreshes
      (opts.extra || []).forEach((x) => {
        if (x.show && !x.show()) return;
        const wrap = el("div", "side-group" + (x.cls ? " " + x.cls : "")); wrap.setAttribute("role", "group");
        if (x.title) { const cap = el("p", "cap", x.title); cap.id = "sg-" + x.id; wrap.setAttribute("aria-labelledby", cap.id); wrap.appendChild(cap); }
        wrap.appendChild(typeof x.node === "function" ? x.node() : x.node);
        if (x.before) body.insertBefore(wrap, body.firstChild); else body.appendChild(wrap);
      });
      sum.textContent = sums.join(" · ");
      restoreScroll(kept);
    }
    return api;
  }

  // Same bar on top of every multi-select list: "3 of 12 selected · Select all · Deselect all"
  function bulkBar(o) {
    const bar = el("div", "ms-bar");
    bar.appendChild(el("span", "ms-count", o.selected + " of " + o.total + " " + (o.noun || "selected")));
    const btn = (label, off, fn, title) => { const b = el("button", null, label); b.type = "button"; b.disabled = off; if (title) b.title = title; b.addEventListener("click", (e) => { e.stopPropagation(); fn(); }); return b; };
    const acts = el("span", "ms-acts");
    acts.append(btn("Select all", o.selected >= (o.max || o.total), o.onAll, o.allTitle), btn("Deselect all", o.selected <= (o.min || 0), o.onNone, o.noneTitle));
    bar.appendChild(acts);
    return bar;
  }

  function areaItems(available, counts) {
    const items = [{ key: "all", label: "All areas", icon: ALL_ICON, count: counts ? counts.all : null }];
    Object.entries(AREAS).forEach(([k, a]) => items.push({
      key: k, label: a.label, icon: a.icon, count: counts ? counts[k] : null,
      disabled: available ? !available.includes(k) : false,
    }));
    return items;
  }

  // Selected area: from the link (#area=…) or what the visitor picked last on any page
  function area() {
    const p = new URLSearchParams(location.hash.slice(1)).get("area");
    if (p && (AREAS[p] || p === "all")) return p;
    const s = store.get("radar.area");
    return s && AREAS[s] ? s : "all";
  }
  function setArea(a) {
    store.set("radar.area", a);
    document.querySelectorAll(".nav [data-page]:not([data-page='overview'])").forEach((link) => {
      const base = link.getAttribute("href").split("#")[0];
      link.setAttribute("href", base + (a !== "all" ? "#area=" + a : ""));
    });
  }

  window.RadarSide = { AREAS, build, areaItems, area, setArea, bulkBar };
})();
