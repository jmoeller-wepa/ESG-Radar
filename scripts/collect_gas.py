"""Collect gas storage fill levels for Energy & climate › Gas storage (data/gas.json).

Source: GIE AGSI+ (Aggregated Gas Storage Inventory, https://agsi.gie.eu), daily, EU total and per country.
The API needs a free key: register on agsi.gie.eu, then add it as the GitHub secret AGSI_KEY.

The first run loads about six years (the page compares this year with the range of the last five years);
later runs only load the last 60 days and add them to the history kept in data/gas.json.
Diagnostics: data/debug/gas.json.
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from status_util import report as report_status

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "gas.json"
DEBUG = ROOT / "data" / "debug" / "gas.json"
API = "https://agsi.gie.eu/api"
UA = "Mozilla/5.0 (compatible; ESG-Radar/1.0)"
YEARS = 6
# area -> query variants, tried in order (the API has used "type=eu" and "country=eu" for the EU total)
AREAS = {
    "eu": {"label": "EU", "queries": [{"type": "eu"}, {"country": "eu"}, {"continent": "eu"}]},
    "de": {"label": "Germany", "queries": [{"country": "de"}]},
}


def get_json(params, key):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "x-key": key, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode("utf-8")), url


def rows_of(answer):
    """The answer is {data: [...]} – for the EU total the rows can sit one level deeper ({data: [{children: …}]})."""
    data = answer.get("data") if isinstance(answer, dict) else answer
    return data if isinstance(data, list) else []


def fetch(area, start, key, dbg):
    last_err = "no data"
    for q in AREAS[area]["queries"]:
        series, page, pages, used = {}, 1, 1, None
        try:
            while page <= pages and page <= 40:
                ans, used = get_json(dict(q, **{"from": start, "to": date.today().isoformat(), "page": page, "size": 300}), key)
                pages = int(ans.get("last_page") or 1) if isinstance(ans, dict) else 1
                for r in rows_of(ans):
                    d, full = (r.get("gasDayStart") or r.get("gasDayStartedOn") or "")[:10], r.get("full")
                    try:
                        series[d] = round(float(full), 2)
                    except (TypeError, ValueError):
                        continue
                page += 1
            dbg.append({"area": area, "query": q, "pages": pages, "points": len(series), "url": (used or "").replace(key, "***")})
            if series:
                return series
            last_err = "empty answer"
        except urllib.error.HTTPError as exc:
            last_err = f"HTTP {exc.code}" + (" (check the AGSI_KEY secret)" if exc.code in (401, 403) else "")
            dbg.append({"area": area, "query": q, "error": last_err})
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)[:160]
            dbg.append({"area": area, "query": q, "error": last_err})
    raise RuntimeError(last_err)


def main():
    key = os.environ.get("AGSI_KEY", "").strip()
    prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    out = {"_comment": "Written by scripts/collect_gas.py – do not edit by hand. Source: GIE AGSI+ (agsi.gie.eu).",
           "source": {"label": "GIE AGSI+", "url": "https://agsi.gie.eu"}, "areas": {}}
    dbg, bad = [], []
    keep_from = date(date.today().year - YEARS, 1, 1).isoformat()
    for area, meta in AREAS.items():
        old = {d: v for d, v in ((prev.get("areas") or {}).get(area, {}).get("series") or [])}
        if not key:
            bad.append("GitHub secret AGSI_KEY is not set")
            if old:
                out["areas"][area] = prev["areas"][area]
            continue
        start = keep_from if len(old) < 300 else (date.today() - timedelta(days=60)).isoformat()
        try:
            new = fetch(area, start, key, dbg)
            old.update(new)
            series = sorted([d, v] for d, v in old.items() if d >= keep_from)
            out["areas"][area] = {"label": meta["label"], "unit": "% full", "series": series}
        except Exception as exc:  # noqa: BLE001
            bad.append(f"{area}: {exc}")
            if old:
                out["areas"][area] = prev["areas"][area]
    bad = sorted(set(bad))
    out["updated"] = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None).isoformat()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    DEBUG.parent.mkdir(parents=True, exist_ok=True)
    DEBUG.write_text(json.dumps({"at": out["updated"], "failed": bad, "details": dbg}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n = len(out["areas"])
    report_status("gas", "Gas storage (AGSI+)", "ok" if not bad else ("warn" if n else "error"),
                  f"{n} areas" + (" · failed: " + "; ".join(bad[:2]) if bad else ""), order=37)
    print(f"gas storage: {n} areas" + ("; FAILED " + "; ".join(bad) if bad else ""))


if __name__ == "__main__":
    main()
