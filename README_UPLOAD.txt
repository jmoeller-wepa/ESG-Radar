ESG Radar – update-21-look-settings (builds on update-20, contains everything from update-19 and update-20)

Upload to the repository ROOT folder:
  index.html, news.html, regulation.html, peers.html, market.html

Upload to the folder assets/:
  theme.css, look.js (new file), views.js, side.js, filters.js
  (views.js, side.js and filters.js are unchanged from update-19; included so this zip works on its own)

Nothing in data/ or config/ changes.

What changed
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
- Cache version 20261109g on all pages.
