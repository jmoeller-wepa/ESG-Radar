ESG Radar – update-26-news-filter-bar (builds on update-25, contains everything from update-19 to 25)

Upload to the repository ROOT folder:
  index.html, news.html, regulation.html, peers.html, market.html

Upload to the folder assets/:
  theme.css, look.js, guide.js, views.js, side.js, filters.js
  (guide.js changed in update-26; views.js, side.js and filters.js are unchanged from update-19; included so this zip works on its own)

Nothing in data/ or config/ changes.

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
