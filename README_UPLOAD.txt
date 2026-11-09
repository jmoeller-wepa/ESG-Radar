ESG Radar – update 31: workflow steps + toilet paper price fix
No html/asset changes. Nothing for data/.

  .github/workflows/   collect-feeds.yml   (adds AGSI_KEY + the 3 new collector steps)
  scripts/             collect_market.py   (finds the 10-digit consumer price list for toilet paper)
  config/              market.json

Then: Actions > Daily data update > Run workflow. The status panel should then show three new lines:
"Heat & rain at the mills", "Gas storage" and "Pulp imports by origin".
