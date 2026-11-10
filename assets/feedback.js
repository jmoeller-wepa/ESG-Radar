/* Feedback: a "Feedback" button in the header opens a small panel.
   "Send by email" opens the reader's mail program (Outlook) with a ready email:
   subject, the page and tab they are on, a link and their text. Nothing is sent from the site itself.
   To change where feedback goes, edit FEEDBACK_TO below (leave "" to let the reader fill in the address). */
(function () {
  const FEEDBACK_TO = "jan-niklas.moeller@wepa.eu";

  const KINDS = ["Idea", "Something's wrong", "Data looks off"];

  const css = `
  .fb-btn { flex: none; height: 34px; border-radius: 8px; border: 1px solid var(--h-ctl-border, #e3e7ec); background: var(--h-ctl-bg, #fff); color: var(--h-ctl-fg, #374151); font: 500 13.5px/1 inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 0 11px; }
  .fb-btn:hover { background: var(--h-ctl-hover, #f3f5f8); }
  .fb-btn svg { width: 16px; height: 16px; flex: none; }
  @media (max-width: 1280px) { .fb-btn { width: 34px; padding: 0; justify-content: center; } .fb-btn span { display: none; } }
  dialog.fb-dlg { margin: 72px 16px auto auto; width: min(420px, calc(100vw - 32px)); border: 1px solid var(--d-e3e7ec-border, #e3e7ec); border-radius: 16px; padding: 0; background: var(--d-fff-bg, #fff); color: var(--d-111827-text, #111827); box-shadow: 0 18px 48px rgba(0, 20, 50, .18); }
  dialog.fb-dlg::backdrop { background: rgba(0, 20, 50, .12); }
  dialog.fb-dlg[open] { animation: fb-in .16s ease-out; }
  @keyframes fb-in { from { transform: translateY(-6px); opacity: 0; } }
  .fb-h { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 18px 4px; }
  .fb-h h3 { margin: 0; font-size: 16px; color: var(--blue-900, var(--d-002d55-text, #002d55)); }
  .fb-b { padding: 8px 18px 18px; display: flex; flex-direction: column; gap: 12px; font-size: 14px; }
  .fb-kinds { display: flex; gap: 6px; flex-wrap: wrap; }
  .fb-kinds button { border: 1px solid var(--d-e3e7ec-border, #e3e7ec); background: var(--d-fff-bg, #fff); color: var(--d-374151-text, #374151); border-radius: 999px; padding: 4px 12px; font: inherit; font-size: 13px; cursor: pointer; }
  .fb-kinds button[aria-pressed="true"] { background: var(--d-eef5fb-bg, #eef5fb); border-color: var(--blue-700, #0064aa); color: var(--blue-700, #0064aa); font-weight: 600; }
  .fb-ctx { display: flex; gap: 8px; align-items: flex-start; background: var(--d-f3f5f8-bg, #f3f5f8); border-radius: 10px; padding: 8px 10px; font-size: 12.5px; color: var(--d-374151-text, #374151); cursor: pointer; }
  .fb-ctx input { margin: 2px 0 0; accent-color: #33b09c; }
  .fb-b textarea { width: 100%; box-sizing: border-box; min-height: 110px; resize: vertical; border: 1px solid var(--d-e3e7ec-border, #e3e7ec); border-radius: 10px; background: var(--d-fff-bg, #fff); color: inherit; padding: 8px 10px; font: inherit; font-size: 13.5px; }
  .fb-b textarea:focus { outline: none; border-color: #33b09c; box-shadow: 0 0 0 3px rgba(51, 176, 156, .15); }
  .fb-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .fb-row .fb-copy { margin-right: auto; border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; color: var(--blue-700, #0064aa); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  .fb-row .fb-b2 { cursor: pointer; font: inherit; font-size: 13px; border-radius: 8px; padding: 6px 13px; border: 1px solid var(--d-e3e7ec-border, #e3e7ec); background: var(--d-fff-bg, #fff); color: var(--d-374151-text, #374151); }
  .fb-row .fb-cancel:hover { background: var(--d-f3f5f8-bg, #f3f5f8); }
  .fb-go { background: var(--wepa-dark, #002d55) !important; border-color: var(--wepa-dark, #002d55) !important; color: var(--d-fff-bg, #fff) !important; }
  .fb-go:disabled { opacity: .45; cursor: default !important; }
  .fb-note { margin: 0; font-size: 12.5px; color: var(--d-6b7280-text, #6b7280); }
  .fb-ok { margin: 0; font-size: 13px; border-radius: 10px; padding: 8px 10px; background: var(--d-e8f7f4-bg, #e8f7f4); color: var(--d-1d7f6c-text, #1d7f6c); }`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const host = document.querySelector("header .wrap");
  if (!host) return;
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "fb-btn"; btn.title = "Send feedback on the radar"; btn.setAttribute("aria-label", "Send feedback");
  btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg><span>Feedback</span>';
  const guideBtn = host.querySelector(".hg-btn"), meta = host.querySelector("#meta, .meta");
  if (guideBtn) guideBtn.before(btn); else if (meta) meta.after(btn); else host.appendChild(btn);

  const dlg = document.createElement("dialog"); dlg.className = "fb-dlg"; dlg.setAttribute("aria-labelledby", "fb-ttl");
  dlg.innerHTML = '<div class="fb-h"><h3 id="fb-ttl">Send feedback</h3><button type="button" class="ui-x" aria-label="Close">×</button></div>' +
    '<div class="fb-b"><div class="fb-kinds" role="group" aria-label="Type of feedback"></div>' +
    '<label class="fb-ctx"><input type="checkbox" checked><span>Include where I am: <b class="fb-where"></b></span></label>' +
    '<textarea placeholder="What should we change or add?" aria-label="Your feedback"></textarea>' +
    '<div class="fb-row"><button type="button" class="fb-copy">Copy text instead</button><button type="button" class="fb-b2 fb-cancel">Cancel</button><button type="button" class="fb-b2 fb-go" disabled>Send by email</button></div>' +
    '<p class="fb-note">Opens your email program with everything filled in. Press Send there.</p></div>';
  document.body.appendChild(dlg);

  const kindsEl = dlg.querySelector(".fb-kinds"), ta = dlg.querySelector("textarea"), inc = dlg.querySelector(".fb-ctx input");
  const go = dlg.querySelector(".fb-go"), note = dlg.querySelector(".fb-note");
  let kind = KINDS[0];
  KINDS.forEach((k) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = k; b.setAttribute("aria-pressed", String(k === kind));
    b.addEventListener("click", () => { kind = k; kindsEl.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); });
    kindsEl.appendChild(b);
  });

  const txt = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
  const where = () => {
    const pageName = txt(document.querySelector('header .nav a[aria-current="page"]')) || document.title;
    const t = document.querySelector('.ptabs:not(.vtabs) [role="tab"][aria-selected="true"]');
    let tab = "";
    if (t) { const c = t.cloneNode(true); c.querySelectorAll("small, .n, .count").forEach((x) => x.remove()); tab = txt(c); }
    return tab && tab !== pageName ? pageName + " › " + tab : pageName;
  };
  const subject = () => "ESG Radar feedback – " + kind + (inc.checked ? " – " + txt(document.querySelector('header .nav a[aria-current="page"]')) : "");
  const body = () => {
    let s = ta.value.trim();
    if (inc.checked) s += "\n\nPage: " + where() + "\nLink: " + location.href;
    return s;
  };
  const flash = (msg) => { note.textContent = msg; note.className = "fb-ok"; };
  const resetNote = () => { note.textContent = "Opens your email program with everything filled in. Press Send there."; note.className = "fb-note"; };

  ta.addEventListener("input", () => { go.disabled = !ta.value.trim(); });
  btn.addEventListener("click", () => { dlg.querySelector(".fb-where").textContent = where(); resetNote(); dlg.showModal(); ta.focus(); });
  dlg.querySelector(".ui-x").addEventListener("click", () => dlg.close());
  dlg.querySelector(".fb-cancel").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (ev) => { if (ev.target === dlg) dlg.close(); });

  go.addEventListener("click", () => {
    if (!ta.value.trim()) return;
    const href = "mailto:" + encodeURIComponent(FEEDBACK_TO).replace(/%40/g, "@") +
      "?subject=" + encodeURIComponent(subject()) + "&body=" + encodeURIComponent(body().replace(/\n/g, "\r\n"));
    location.href = href;
    flash("Your email program should open now with this message. Press Send there. If nothing happens, use “Copy text instead”.");
    setTimeout(() => { ta.value = ""; go.disabled = true; }, 400);
  });

  dlg.querySelector(".fb-copy").addEventListener("click", async () => {
    const all = (FEEDBACK_TO ? "To: " + FEEDBACK_TO + "\n" : "") + "Subject: " + subject() + "\n\n" + body();
    try { await navigator.clipboard.writeText(all); flash("Copied. Paste it into an email" + (FEEDBACK_TO ? " to " + FEEDBACK_TO : "") + "."); }
    catch (e) { ta.select(); flash("Copy didn't work here. Select the text and copy it with Ctrl C."); }
  });
})();
