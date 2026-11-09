ESG Radar – update-28-peers-layout (builds on update-27, contains everything from update-19 to 27)

Upload to the repository ROOT folder:
  index.html, news.html, regulation.html, peers.html, market.html

Upload to the folder assets/:
  theme.css, look.js, guide.js, views.js, side.js, filters.js
  (guide.js changed in update-26, 27 and 28; views.js, side.js and filters.js are unchanged from update-19; included so this zip works on its own)

Nothing in data/ or config/ changes.

What changed in update-28 (Peers page + one Regulation fix)
- Peers: no side panel any more. One filter bar under the tabs: peer group switch (Tissue Europe /
  Global tissue / All peers), Companies dropdown (WEPA always shown), "KPIs for" dropdown (was "Area";
  Benchmark tab only) and Compact view.
- Benchmark table: no more filled green/pink cells. A small dot before the value shows the rating
  (best / better than median / below median, no dot = around the median); legend explains all of them.
- Profile cards below the table are gone. Each company cell now shows the news count and "Profile ›".
- Emissions · EU ETS: the warning is one line with "Details" to open the full explanation.
  WEPA site list shows the found sites as a normal table with chips "8 found · 6 missing · 2 UK ETS";
  missing sites (with possible registry matches as short codes, hover for the name) and the UK sites
  are folded away below. Lille shows a small "check" label (hover for the note).
- Regulation: "All on Have your say" link removed (each row has its own "Give feedback").
- "?" guide for Peers updated.
- Cache version 20261109n on all pages.

What changed in update-27 (Regulation page)
- No side panel any more. One filter bar on top (as on News): "Find a rule …" search, Area dropdown,
  and a switch All / Changed recently / Open consultation (with counts).
- "Open for feedback" stays above "Where things stand", but as a short list: one line per consultation
  with closing date, title, area, stage (step x of 4) and "Give feedback". The ones with little link to tissue
  are still folded away at the end of the list.
- Tracker rows are unchanged.
- Roadmap: grouped by area, the line under each topic shows its next date, key dates are small diamonds
  above the bar (grey once passed) instead of red lines through the text, the Today line is dashed and
  labelled, short bars show their text on hover only.
- "?" guide text for consultations updated.
- Cache version 20261109m on all pages.

What changed in update-26 (News page)
- No side panel on News any more; the news use the full width.
- One filter bar directly under the tabs: search, Areas (now a dropdown), What it is, Companies,
  Affects, Relevance. It stays at the top while you scroll (desktop). The "This view shows" chip row is gone.
- When you change an open view: "Changed · Save view · Save as new · Undo" at the end of the filter bar.
  On "All news" with filters set: "Save as view · Clear filters".
- "New" and "Saved" are tabs after your own views.
- "What's ahead" sits below the filter bar and always keeps the same height; views without deadlines
  show a calm empty state with "Show all N deadlines". Timeline, Events and Coming next scroll inside the box.
- "Jump to" (month) is a dropdown next to the year; Sort and Cards/List sit on the right of that line.
- Colour/relevance legend moved into the "?" guide.
- Cache version 20261109l on all pages.

What changed in update-25 (Market page)
- Side panel only where it fits: "At a glance" and "Trends" keep the question filter
  (Trends also period + indicators), "Cost index" shows only the period,
  "Industry", "Grid carbon intensity" and "Water" have no side panel and use the full width.
- Cache version 20261109k on all pages.

What changed in update-24 (Market page)
- "For WEPA" on tiles and under charts: no blue box any more; small green "FOR WEPA" label above
  the text, separated by a thin line.
- Explanation boxes under charts and in pop-ups: three columns without fill, thin dividers,
  small labels "What it shows" (eye icon), "For WEPA" (green, no icon), "Limits" (info icon).

What changed in update-23
- Settings panel stays open while you change options (closes with ×, Esc or a click outside).
- Default page background is now "Off" (light grey). If you already changed a setting,
  click "Reset to default" once in Settings.
- Market › Industry: toggle labels are just "Monthly market" / "Yearly industry profile".

What changed in update-22
- Descriptive lines under headings removed; their content is now in the "?" guide of each page
  (Overview "Your cards" line, Market intro + tab descriptions, Peers intro + table/profile/ETS hints,
  Regulation intro, News "select several"; click/sort hints in Market chart subtitles).
  Units, sources and the "illustrative, not WEPA figures" note stay on the page.
- Overview hover: key-number tiles lift with a clear shadow, cards get a stronger shadow,
  news/peer/market rows get a light green highlight.

What changed in update-21
- New look (default): cards with a soft shadow instead of a border, larger corners (18px),
  subtle "Aurora" gradient behind the page (header stays white), a bit more spacing in cards,
  small line icons in front of section labels, cards that open something lift slightly on hover.
- New Settings button in the header (sliders icon) with: Theme (Auto / Light / Dark),
  Page background (Off = light grey, Aurora, Mist, Sweep, Horizon, Mesh, Diagonal, Corners, Floor),
  Gradient strength (Subtle / Medium / Strong), Cards (Border / Shadow / Flat),
  Corners (Small / Medium / Large), Spacing (Normal / Airy), Section icons (Off / On), Reset to default.
  Choices are saved per browser. The separate light/dark button is now part of Settings.
- In dark mode cards keep a thin border (shadows are not visible on dark backgrounds).
- From update-20: wordmark "ESG Radar." 23px, font Geist.
