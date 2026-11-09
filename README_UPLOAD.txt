ESG Radar – update 13: Destatis refresh fix (market indicators)
Built on the repo as of 9 Nov 2026 (incl. update-12). Nothing in data/ is touched.

Upload (GitHub -> Add file -> Upload files):

scripts/:
  collect_market.py

What changed:
- If GENESIS answers "kein Datenquader gefunden" (code 7000), the collector waits 20 s and tries again,
  then fetches the table year by year and keeps every year that works.
- The data status now says "+N more" when more than 4 indicators failed.

After the next run: data/debug/destatis.json shows "retry" or "byYear" (incl. empty years) for affected tables.
