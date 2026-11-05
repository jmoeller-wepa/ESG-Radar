/* Data status dot for the page header (all pages).
   Reads data/status.json (written by the weekly GitHub Action) and replaces the "Updated …" text
   with a coloured dot: green = all sources fine, amber = a source failed, red = no update for 14+ days. */
(function () {
  const STALE_DAYS = 14;
  const css = `
  .stat-wrap { position: relative; margin-left: auto; }
  .hsearch ~ .stat-wrap { margin-left: 0; }
  .stat-btn { display: inline-flex; align-items: center; gap: 8px; font: inherit; font-size: 13px; color: var(--d-4b5563-text, #4b5563); border: 1px solid var(--d-e5e7eb-border, #e5e7eb); border-radius: 20px; padding: 4px 12px 4px 10px; background: var(--d-fff-bg, #fff); cursor: pointer; white-space: nowrap; }
  .stat-btn:hover { border-color: var(--d-cfd4db-border, #cfd4db); }
  .stat-dot { width: 9px; height: 9px; border-radius: 50%; background: #66C3B4; box-shadow: 0 0 0 3px var(--d-e4f4f1-border, #e4f4f1); flex: none; }
  .stat-dot.warn { background: #f2b33d; box-shadow: 0 0 0 3px var(--d-fdf1d8-border, #fdf1d8); }
  .stat-dot.error { background: #FF667E; box-shadow: 0 0 0 3px var(--d-ffe3e8-border, #ffe3e8); }
  .stat-dot.none { background: #c4c9d2; box-shadow: 0 0 0 3px var(--d-eef0f3-border, #eef0f3); }
  .stat-pop { position: absolute; right: 0; top: calc(100% + 8px); z-index: 50; width: min(420px, calc(100vw - 32px)); background: var(--d-fff-bg, #fff); border: 1px solid var(--d-ebedf1-border, #ebedf1); border-radius: 12px; box-shadow: 0 12px 32px rgba(0, 20, 50, .14); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; text-align: left; }
  .stat-pop[hidden] { display: none; }
  .stat-pop .cap { margin: 0 0 2px; font-size: 11.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--d-6b7280-text, #6b7280); }
  .stat-row { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: var(--d-374151-text, #374151); }
  .stat-row .stat-dot { margin-top: 5px; }
  .stat-row b { font-weight: 500; flex: 1; }
  .stat-row span { font-size: 12px; color: var(--d-8a94a3-text, #8a94a3); text-align: right; max-width: 55%; }
  .stat-msg { font-size: 12.5px; color: var(--d-4b5563-text, #4b5563); background: var(--d-f5f7f9-bg, #f5f7f9); border-radius: 8px; padding: 8px 10px; margin: 2px 0 0; line-height: 1.45; }
  .stat-msg.warn { background: var(--d-fdf6e7-bg, #fdf6e7); } .stat-msg.error { background: var(--d-fff0f2-bg, #fff0f2); }
  .stat-pop a { font-size: 13px; color: var(--d-0f4c9c-text, #0f4c9c); }
  @media (max-width: 720px) { .stat-wrap { margin-left: 0; } .stat-pop { left: 0; right: auto; } }`;
  const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const fmt = (iso) => { const d = new Date(iso.length <= 19 ? iso + "Z" : iso); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
  const fmtTime = (iso) => { const d = new Date(iso.length <= 19 ? iso + "Z" : iso); return d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };
  const daysSince = (iso) => (Date.now() - new Date(iso.length <= 19 ? iso + "Z" : iso).getTime()) / 864e5;

  function mount(data) {
    const meta = document.getElementById("meta");
    const header = meta ? meta.parentElement : document.querySelector("header .wrap");
    if (!header) return;
    if (meta) meta.style.display = "none";
    const wrap = el("div", "stat-wrap");
    const btn = el("button", "stat-btn"); btn.type = "button"; btn.setAttribute("aria-expanded", "false");
    const dot = el("span", "stat-dot"); const label = el("span");
    btn.append(dot, label);
    const pop = el("div", "stat-pop"); pop.hidden = true; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Data status");
    wrap.append(btn, pop);
    header.appendChild(wrap);
    btn.addEventListener("click", (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; btn.setAttribute("aria-expanded", String(!pop.hidden)); });
    document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); } });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); } });

    if (!data || !data.lastRun) {
      dot.classList.add("none"); label.textContent = "Not updated yet";
      pop.append(el("p", "cap", "Data status"), el("p", "stat-msg", "The weekly GitHub Action has not run yet. Start it once in GitHub: Actions → Weekly data update → Run workflow."));
      return;
    }
    const sources = Object.entries(data.sources || {}).map(([k, s]) => ({ key: k, ...s }))
      .map((s) => (daysSince(s.at) > STALE_DAYS ? { ...s, status: "error", detail: "no update since " + fmt(s.at) } : s))
      .sort((a, b) => (a.order || 50) - (b.order || 50));
    const stale = daysSince(data.lastRun) > STALE_DAYS;
    const issues = sources.filter((s) => s.status !== "ok");
    const level = stale || sources.some((s) => s.status === "error") ? "error" : issues.length ? "warn" : "ok";
    if (level !== "ok") dot.classList.add(level);
    label.textContent = stale ? `No update for ${Math.floor(daysSince(data.lastRun))} days`
      : "Updated " + fmt(data.lastRun) + (issues.length ? ` · ${issues.length} issue${issues.length > 1 ? "s" : ""}` : "");
    btn.title = "Data status – click for details";

    pop.appendChild(el("p", "cap", "Data status · last run " + fmtTime(data.lastRun)));
    sources.forEach((s) => {
      const row = el("div", "stat-row");
      const d = el("span", "stat-dot"); if (s.status !== "ok") d.classList.add(s.status);
      row.append(d, el("b", null, s.label), el("span", null, s.detail || s.status));
      pop.appendChild(row);
    });
    const longest = issues.reduce((m, s) => Math.max(m, s.failingSince ? daysSince(s.failingSince) : 0), 0);
    let msg;
    if (stale) msg = "The weekly update has not run for more than two weeks. In GitHub, open Actions and check whether the workflow \"Weekly data update\" is still enabled (GitHub pauses scheduled workflows after 60 days without repository activity) – then click Run workflow.";
    else if (level === "error") msg = "A source returned nothing this run. Old values are still shown. If it stays red after the next run, open the run in GitHub and read the summary for that source.";
    else if (level === "warn") msg = longest >= 21
      ? "A source has been failing for 3 weeks or more. Open the last run in GitHub, read the summary line for that source, and adjust its settings in the config folder (see README) – or ask someone to look at it."
      : "Part of a source failed this run; the previous values are kept. This usually fixes itself with the next weekly run.";
    else msg = "All sources were updated in the last weekly run.";
    pop.appendChild(el("p", "stat-msg " + level, msg));
    if (data.runUrl) { const a = el("a", null, "Open last run in GitHub ↗"); a.href = data.runUrl; a.target = "_blank"; a.rel = "noopener"; pop.appendChild(a); }
  }

  function start() {
    fetch("data/status.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then(mount);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
