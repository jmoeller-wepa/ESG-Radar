/* ESG Radar – filter dropdowns with checkboxes (same behaviour as Period / Indicators on Market › Trends).
   RadarDD.multi({ label, empty, items, selected, onChange }) → { el, update(items, selected), show(on) }
     items: [{ key, label, count? }] or groups { group, key?, items: [...] }.
     A group with a key stands for "everything in this group" (e.g. all peer news); without a key the group
     checkbox simply ticks all its rows. Nothing ticked = no filter. onChange gets the list of ticked keys.
   RadarDD.single({ label, items: [{ key, label }], value, onChange }) → { el, update(value), show(on) } – one choice, same look. */
(function () {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  let openDD = null;
  function closeOpen(focus) { if (!openDD) return; const d = openDD; openDD = null; d.close(focus); }
  document.addEventListener("click", (ev) => { if (openDD && !openDD.root.contains(ev.target)) closeOpen(false); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && openDD) { ev.stopPropagation(); closeOpen(true); } });

  function cbx(st) { const c = el("span", "cbx" + (st === true ? " on" : st === "mixed" ? " part" : "")); if (st === true) c.textContent = "✓"; return c; }

  function shell(o) {
    const root = el("span", "fdd");
    if (o.label) root.appendChild(el("span", "fl", o.label));
    const btn = el("button", "fdd-b"); btn.type = "button"; btn.setAttribute("aria-haspopup", "true"); btn.setAttribute("aria-expanded", "false");
    if (o.label) btn.setAttribute("aria-label", o.label);
    const pop = el("div", "fdd-p"); pop.hidden = true; pop.setAttribute("role", "dialog"); if (o.label) pop.setAttribute("aria-label", o.label);
    root.append(btn, pop);
    const d = {
      root, btn, pop, isOpen: false,
      open() { closeOpen(false); d.isOpen = true; openDD = d; btn.setAttribute("aria-expanded", "true"); pop.hidden = false; d.fill(); place(); const f = pop.querySelector("input, button:not(:disabled)"); if (f) f.focus({ preventScroll: true }); },
      close(focus) { d.isOpen = false; if (openDD === d) openDD = null; btn.setAttribute("aria-expanded", "false"); pop.hidden = true; if (focus) btn.focus(); },
      fill() {},
    };
    // open to the left when the list would run off the right edge of the window
    function place() { pop.classList.remove("right"); const r = pop.getBoundingClientRect(); if (r.right > window.innerWidth - 8) pop.classList.add("right"); }
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); d.isOpen ? d.close(false) : d.open(); });
    pop.addEventListener("click", (ev) => ev.stopPropagation());
    return d;
  }

  function multi(o) {
    let items = o.items || [], sel = (o.selected || []).slice(), q = "";
    const d = shell(o);
    const leavesOf = (g) => g.items || [];
    const rows = () => items.flatMap((it) => (it.items ? it.items : [it]));
    const gOn = (g) => (g.key && sel.includes(g.key)) || (leavesOf(g).length > 0 && leavesOf(g).every((x) => sel.includes(x.key)));
    const on = (x, g) => sel.includes(x.key) || !!(g && g.key && sel.includes(g.key));
    const checked = () => items.reduce((n, it) => n + (it.items ? it.items.filter((x) => on(x, it)).length : (sel.includes(it.key) ? 1 : 0)), 0);
    // keep keys in list order so saved views compare cleanly
    function order(keys) {
      const all = []; items.forEach((it) => { if (it.items) { if (it.key) all.push(it.key); it.items.forEach((x) => all.push(x.key)); } else all.push(it.key); });
      return all.filter((k) => keys.includes(k));
    }
    function set(keys) { sel = order(keys); paint(); if (d.isOpen) d.fill(); o.onChange(sel.slice()); }
    function toggleLeaf(x, g) {
      let k = sel.slice();
      if (g && g.key && k.includes(g.key)) { k = k.filter((y) => y !== g.key); g.items.forEach((y) => { if (y.key !== x.key) k.push(y.key); }); }
      else if (k.includes(x.key)) k = k.filter((y) => y !== x.key);
      else k.push(x.key);
      set(k);
    }
    function toggleGroup(g) {
      const kids = g.items.map((x) => x.key);
      let k = sel.filter((y) => y !== g.key && !kids.includes(y));
      if (!gOn(g)) { if (g.key) k.push(g.key); else k = k.concat(kids); }
      set(k);
    }
    function selectAll() { const k = []; items.forEach((it) => { if (it.items) { if (it.key) k.push(it.key); else it.items.forEach((x) => k.push(x.key)); } else k.push(it.key); }); set(k); }
    function paint() {
      const n = checked(), b = d.btn;
      b.replaceChildren();
      b.classList.toggle("on", n > 0);
      if (!n) b.appendChild(el("span", "v", o.empty || "All"));
      else { b.appendChild(el("span", "v", "Selected")); b.appendChild(el("span", "n", String(n))); }
      b.appendChild(el("span", "chev"));
      b.title = n ? rows().filter((x) => sel.includes(x.key) || items.some((g) => g.items && g.key && sel.includes(g.key) && g.items.includes(x))).map((x) => x.label).join(", ") : "";
    }
    d.fill = function () {
      const keep = d.pop.querySelector(".fdd-list"), top = keep ? keep.scrollTop : 0;
      const fi = [...d.pop.querySelectorAll("button, input")].indexOf(document.activeElement); // keyboard focus survives a redraw
      const total = rows().length, n = checked();
      d.pop.replaceChildren();
      const bar = el("div", "ms-bar");
      bar.appendChild(el("span", "ms-count", n + " of " + total + " selected"));
      const acts = el("span", "ms-acts");
      const sa = el("button", null, "Select all"), da = el("button", null, "Deselect all");
      sa.type = da.type = "button"; sa.disabled = n >= total; da.disabled = !n;
      sa.addEventListener("click", selectAll); da.addEventListener("click", () => set([]));
      acts.append(sa, da); bar.appendChild(acts); d.pop.appendChild(bar);
      let input = null;
      if (total >= 8) {
        input = el("input", "fdd-q"); input.type = "search"; input.placeholder = "Find …"; input.value = q; input.setAttribute("aria-label", "Find in " + (o.label || "list"));
        d.pop.appendChild(input);
      }
      const list = el("div", "fdd-list");
      const row = (x, g) => {
        const st = on(x, g);
        const b = el("button", "fdd-r" + (g ? " sub" : "")); b.type = "button"; b.setAttribute("role", "checkbox"); b.setAttribute("aria-checked", String(st));
        b.dataset.t = (x.label + " " + (g ? g.group : "")).toLowerCase();
        b.append(cbx(st), el("span", "lbl", x.label), el("span", "c", x.count == null ? "" : String(x.count)));
        b.addEventListener("click", () => toggleLeaf(x, g));
        return b;
      };
      items.forEach((it) => {
        if (!it.items) { list.appendChild(row(it)); return; }
        const k = it.items.filter((x) => on(x, it)).length, st = gOn(it) ? true : k ? "mixed" : false;
        const h = el("button", "fdd-r grp"); h.type = "button"; h.setAttribute("role", "checkbox"); h.setAttribute("aria-checked", String(st)); h.dataset.g = "1";
        h.append(cbx(st), el("span", "lbl", it.group), el("span", "c", st === "mixed" ? k + " of " + it.items.length : it.count == null ? "" : String(it.count)));
        h.addEventListener("click", () => toggleGroup(it));
        list.appendChild(h);
        it.items.forEach((x) => list.appendChild(row(x, it)));
      });
      d.pop.appendChild(list);
      const apply = () => {
        const t = q.trim().toLowerCase();
        list.querySelectorAll(".fdd-r").forEach((r) => { if (!r.dataset.g) r.hidden = !!t && !r.dataset.t.includes(t); });
        list.querySelectorAll(".fdd-r.grp").forEach((h) => { let n2 = h.nextElementSibling, any = false; while (n2 && n2.classList.contains("sub")) { if (!n2.hidden) any = true; n2 = n2.nextElementSibling; } h.hidden = !!t && !any; });
      };
      if (input) input.addEventListener("input", () => { q = input.value; apply(); });
      apply();
      list.scrollTop = top;
      if (fi >= 0) { const f = d.pop.querySelectorAll("button, input")[fi]; if (f) f.focus({ preventScroll: true }); }
    };
    paint();
    return {
      el: d.root,
      update(newItems, newSel) { if (newItems) items = newItems; if (newSel) sel = order(newSel); paint(); if (d.isOpen) d.fill(); },
      show(v) { d.root.hidden = !v; if (!v && d.isOpen) d.close(false); },
    };
  }

  function single(o) {
    let value = o.value;
    const d = shell(o);
    const paint = () => { const it = o.items.find((x) => x.key === value) || o.items[0]; d.btn.replaceChildren(el("span", "v", it.label), el("span", "chev")); };
    d.fill = function () {
      d.pop.replaceChildren();
      const list = el("div", "fdd-list");
      o.items.forEach((x) => {
        const b = el("button", "fdd-r one" + (x.key === value ? " sel" : "")); b.type = "button"; b.setAttribute("role", "menuitemradio"); b.setAttribute("aria-checked", String(x.key === value));
        b.append(el("span", "tick", x.key === value ? "✓" : ""), el("span", "lbl", x.label));
        b.addEventListener("click", () => { value = x.key; paint(); d.close(true); o.onChange(value); });
        list.appendChild(b);
      });
      d.pop.appendChild(list);
    };
    d.pop.classList.add("narrow");
    paint();
    return { el: d.root, update(v) { value = v; paint(); if (d.isOpen) d.fill(); }, show(v) { d.root.hidden = !v; } };
  }

  window.RadarDD = { multi, single, close: () => closeOpen(false) };
})();
