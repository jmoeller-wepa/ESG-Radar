ESG Radar – update 34: weather, soil and rivers at the mills abroad
Builds on update 33. Cache version 20261110c. Nothing for data/.

UPLOAD
  (repo root)          index.html, news.html, regulation.html, peers.html, costs.html, market.html, energy.html
  assets/              market.js, market.css, guide.js, theme.css
  scripts/             collect_sites_intl.py (new)
  config/              sites_intl.json (new – mills abroad, town coordinates, which river gauge to use)
  .github/workflows/   collect-feeds.yml  (or paste the loose collect-feeds.yml on GitHub: adds CDS_KEY, cdsapi and the new step)

ONE-TIME SETUP – Copernicus key (free)
 1. Register at https://cds.climate.copernicus.eu (top right "Login - Register").
 2. Open the dataset page https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries ,
    tab "Download", scroll to "Terms of use" and click "Accept" (CC BY 4.0). Without this the API refuses requests.
 3. Copy your "API Token" from your profile page (https://cds.climate.copernicus.eu/profile).
 4. GitHub repo > Settings > Secrets and variables > Actions > New repository secret
    Name: CDS_KEY   Value: the token
 5. Run the workflow. The first run loads 30 years per mill for the normals and can take 10–30 minutes;
    later runs only load the last 14 months.
 6. Check data/debug/sites_intl.json (which gauges were picked, errors per mill).

River gauges: France (Hub'Eau), Poland (IMGW), Netherlands (Rijkswaterstaat), England (Environment Agency) need no key.
Italy (Lucca, Cassino) and Bridgend (Wales) have no free national gauge service, so they show weather only.
River history grows by one day with every run (Poland: one reading per run).
