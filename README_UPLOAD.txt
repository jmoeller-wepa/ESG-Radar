ESG Radar – update 30: new data (gas storage, heat & rain, pulp origin, shelf price)
Builds on update 29. Cache version 20261109p. Does NOT contain anything for data/ – never overwrite data/.

UPLOAD (folder by folder on GitHub, "Add file > Upload files"):

  (repo root)          index.html, news.html, regulation.html, peers.html, costs.html, market.html, energy.html
  assets/              market.js, market.css, search.js, guide.js
  scripts/             collect_gas.py, collect_weather.py, collect_pulp_origin.py   (new)
  config/              market.json, eudr.json (new)
  .github/workflows/   collect-feeds.yml   (the folder is hidden in the zip on some systems; or edit the file on GitHub, see below)

ONE-TIME SETUP
 1. Free AGSI+ key for gas storage: register at https://agsi.gie.eu (top right "Register"), confirm the e-mail,
    then copy the API key from your account page.
    GitHub repo > Settings > Secrets and variables > Actions > New repository secret
    Name: AGSI_KEY   Value: the key
 2. Workflow: either upload collect-feeds.yml, or edit it on GitHub and add
      under env:      AGSI_KEY: ${{ secrets.AGSI_KEY }}
      after the "Collect river levels & soil moisture" step:
        - name: Collect heat & rain at the mills (DWD)
          run: python scripts/collect_weather.py
          continue-on-error: true
        - name: Collect gas storage (AGSI+)
          run: python scripts/collect_gas.py
          continue-on-error: true
        - name: Collect pulp imports by origin (Comext)
          run: python scripts/collect_pulp_origin.py
          continue-on-error: true
 3. Run the workflow once by hand (Actions > Daily data update > Run workflow). The first weather run downloads
    the 1991–2020 history per station and takes a few minutes; later runs are quick.
 4. Check data/debug/gas.json, weather.json, pulp_origin.json after the run (the status pill also shows failures).
 5. config/eudr.json: check the EUDR risk levels against the official EU list and add missing countries
    (e.g. Uruguay, Chile, Norway). A country without an entry shows "–".
