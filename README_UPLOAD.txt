ESG Radar – Leuna gauge fix (water collector)
Built on the repo as of 9 Nov 2026 (commit 2e43599). Nothing in data/ is touched. No html change.

Upload (GitHub -> Add file -> Upload files):
  scripts/:  collect_water.py
  config/:   water.json

Why: the gauge Leuna-Kreypau (Saale) is run by the state of Saxony-Anhalt and is not on PEGELONLINE,
so the collector could not find it. Now, if a configured gauge is missing, the collector takes the nearest
PEGELONLINE gauge on the same river (within 60 km) and names it in the chart label.
data/debug/water.json then shows "wanted" and "fallbackKm" for the leuna gauge.
