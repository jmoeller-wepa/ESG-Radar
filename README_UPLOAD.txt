ESG Radar – update 14: remove prof_water + Water tab workflow step
Built on the repo as of 9 Nov 2026 (commit 8387837). Nothing in data/ is touched.

1) Upload (GitHub -> Add file -> Upload files), folder config/:
     market.json      (only change: indicator prof_water removed; Destatis has no water table by industry)

2) Edit .github/workflows/collect-feeds.yml on GitHub and insert this step directly after
   "Collect industry statistics" (before "Collect EU ETS emissions of peers"):

      - name: Collect river levels & soil moisture
        run: python scripts/collect_water.py
        continue-on-error: true

3) Actions -> Daily data update -> Run workflow. Afterwards the Water tab shows data and
   data/debug/water.json lists the DWD station per mill.
