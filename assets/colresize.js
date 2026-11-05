/* Resizable table columns: drag the right edge of a column header; double-click the edge to reset the table.
   Works for every table on the page, also ones rendered later. Widths are remembered per browser (localStorage). */
(function () {
  const KEY = "radar.colwidths.v1";
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
  const store = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} };

  const st = document.createElement("style");
  st.textContent = `
  th.cr-th { position: relative; }
  th.cr-th[data-cr-sticky] { position: sticky; }
  .cr-h { position: absolute; top: 0; right: -4px; width: 9px; height: 100%; cursor: col-resize; z-index: 3; touch-action: none; }
  .cr-h::after { content: ""; position: absolute; top: 25%; bottom: 25%; left: 4px; width: 1px; background: transparent; transition: background .12s; }
  th:hover > .cr-h::after { background: #c9d1db; }
  .cr-h:hover::after, .cr-h.on::after { background: #33b09c; width: 2px; left: 3.5px; }
  table.cr-fixed { table-layout: fixed; }
  /* after resizing, text wraps onto the next line instead of being cut off */
  table.cr-fixed td, table.cr-fixed th, table.cr-fixed td *, table.cr-fixed th * { white-space: normal !important; overflow-wrap: break-word; }
  table.cr-fixed td, table.cr-fixed th { vertical-align: top; }
  body.cr-drag, body.cr-drag * { cursor: col-resize !important; user-select: none !important; }`;
  document.head.appendChild(st);

  const pageKey = location.pathname.split("/").pop() || "index.html";
  function headerCells(t) {
    const row = (t.tHead && t.tHead.rows[0]) || [...t.rows].find((r) => r.querySelector("th"));
    if (!row) return null;
    const cells = [...row.cells];
    if (!cells.length || cells.some((c) => c.colSpan > 1) || cells.length < 2) return null;
    return cells;
  }
  function tableKey(t, cells) {
    return pageKey + "|" + (t.id || t.className.replace(/\bcr-fixed\b/, "").trim() || "t") + "|" + cells.length;
  }
  const label = (c, i) => (c.textContent || "").replace(/[▲▼ⓘ]/g, "").trim().slice(0, 40) || "#" + i;

  function freeze(t, cells) {
    const ws = cells.map((c) => c.getBoundingClientRect().width);
    cells.forEach((c, i) => { c.style.width = ws[i] + "px"; });
    t.classList.add("cr-fixed");
    t.style.width = ws.reduce((a, b) => a + b, 0) + "px";
    t.style.minWidth = "0";
  }
  function apply(t, cells) {
    const w = saved[tableKey(t, cells)];
    if (!w || t.classList.contains("cr-fixed") || !t.offsetWidth) return; // hidden tables are done when they show
    freeze(t, cells);
    cells.forEach((c, i) => { const v = w[label(c, i)]; if (v) c.style.width = v + "px"; });
    t.style.width = cells.reduce((a, c) => a + parseFloat(c.style.width), 0) + "px";
  }

  function prepare(t) {
    const cells = headerCells(t);
    if (!cells) return;
    if (cells[0].querySelector(".cr-h")) { apply(t, cells); return; }
    cells.forEach((c, i) => {
      c.classList.add("cr-th");
      if (getComputedStyle(c).position === "sticky") c.setAttribute("data-cr-sticky", "");
      const h = document.createElement("span"); h.className = "cr-h"; h.setAttribute("aria-hidden", "true");
      h.title = "Drag to resize · double-click to reset";
      h.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); });
      h.addEventListener("dblclick", (e) => {
        e.stopPropagation(); e.preventDefault();
        delete saved[tableKey(t, cells)]; store();
        cells.forEach((x) => { x.style.width = ""; });
        t.classList.remove("cr-fixed"); t.style.width = ""; t.style.minWidth = "";
      });
      h.addEventListener("pointerdown", (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!t.classList.contains("cr-fixed")) freeze(t, cells);
        const x0 = e.clientX, w0 = parseFloat(c.style.width), tw0 = parseFloat(t.style.width);
        h.classList.add("on"); document.body.classList.add("cr-drag");
        try { h.setPointerCapture(e.pointerId); } catch (err) {}
        const move = (ev) => {
          const w = Math.max(48, w0 + ev.clientX - x0);
          c.style.width = w + "px"; t.style.width = tw0 + (w - w0) + "px";
        };
        const up = () => {
          h.classList.remove("on"); document.body.classList.remove("cr-drag");
          h.removeEventListener("pointermove", move); h.removeEventListener("pointerup", up); h.removeEventListener("pointercancel", up);
          const k = tableKey(t, cells); saved[k] = {};
          cells.forEach((x, j) => { saved[k][label(x, j)] = Math.round(parseFloat(x.style.width)); });
          store();
        };
        h.addEventListener("pointermove", move); h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up);
      });
      c.appendChild(h);
    });
    apply(t, cells);
  }

  let queued = false;
  const scan = () => { queued = false; document.querySelectorAll("table").forEach(prepare); };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(scan); } };
  new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "open"] });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", queue); else queue();
})();
