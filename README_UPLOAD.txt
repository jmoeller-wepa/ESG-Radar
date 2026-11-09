ESG Radar – update 12: new topics (IED/BAT, energy relief, water rules, GHG Protocol/PCF, ecolabels, retail customers, Water tab)
Cumulative: also contains everything from update-9, -10 and -11. Nothing in data/ is touched.

Upload folder by folder (GitHub → Add file → Upload files):

Root folder (/):
  index.html, market.html, news.html, peers.html, regulation.html

assets/:
  guide.js, search.js, side.css, side.js, theme.css, theme.js

config/:
  feeds.json, market.json, regulation.json, roadmap_add.json (new), water.json (new)

scripts/:
  collect_feeds.py, collect_market.py, collect_regulation.py, collect_water.py (new)

Workflow (.github/workflows/collect-feeds.yml) – edit on GitHub and add this step
directly after "Collect industry statistics":

      - name: Collect river levels & soil moisture
        run: python scripts/collect_water.py
        continue-on-error: true

After the first run: data/debug/water.json shows which DWD station and column were used per mill.
