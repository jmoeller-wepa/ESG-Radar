ESG Radar – update-14-industry-ets-sites (09.11.2026)
Baut auf dem Repo-Stand 12d382f (update-12) + update-13 auf. Nichts in data/ enthalten.

Hochladen (Ordner für Ordner):
  Hauptordner (/):  index.html, market.html, peers.html
  assets/:          theme.css, carbon.js, search.js
  config/:          feeds.json, peer_installations.json
  scripts/:         collect_ets.py, collect_market.py (= identisch mit update-13; überspringen, falls schon hochgeladen)

NICHT anfassen: news.html und regulation.html (news.html wird gerade im Views-Thread geändert).
Cache-Version index/market/peers: 20261109a. Workflow bleibt unverändert.

Was neu ist:
- Market › Industry: zwei Unterseiten "Monthly · market" und "Yearly · industry profile" (Link: market.html#tab=industry&view=year)
- Market › Cost index: deutlicher Warnhinweis (nur öffentliche Daten, nicht WEPAs Kostenstruktur)
- Peers › Emissions · EU ETS: Warnhinweis + neue Tabelle "WEPA sites" mit allen 16 Produktionsstandorten und Status
- collect_ets.py ordnet Standorte über Ortsnamen zu und schreibt Kandidaten nach data/debug/ets_sites.json
- 6 neue News-Feeds "WEPA sites · …" (DE, FR, IT, PL, NL, UK), Impact "sites"
- Overview: Karten einer Reihe sind wieder gleich hoch
