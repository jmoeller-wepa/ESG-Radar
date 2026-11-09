"""Collect where the EU's chemical wood pulp comes from, for Market › Fibre (data/pulp_origin.json).

Source: Eurostat Comext (dataset DS-045409, EU trade since 1988 by HS2-4-6 and CN8), monthly import volume
of HS 4703 (chemical wood pulp, sulphate), split into 470321 (bleached softwood, NBSK) and 470329 (bleached
hardwood, BHKP), reporter EU27, by partner country. Intra-EU partners (Finland, Sweden …) are included,
because the EU total is the sum of what the member states report.

The page shows the share of each origin over the last 12 months and the change against the 12 months before.
EUDR country risk comes from config/eudr.json. Diagnostics: data/debug/pulp_origin.json.
"""
import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from status_util import report as report_status

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "pulp_origin.json"
DEBUG = ROOT / "data" / "debug" / "pulp_origin.json"
EUDR = ROOT / "config" / "eudr.json"
COMEXT = "https://ec.europa.eu/eurostat/api/comext/dissemination/statistics/1.0/data/DS-045409"
UA = "Mozilla/5.0 (compatible; ESG-Radar/1.0)"
PRODUCTS = {"total": "4703", "nbsk": "470321", "bhkp": "470329"}
REPORTERS = ["EU27_2020", "EU"]


def get_json(q):
    url = COMEXT + "?" + urllib.parse.urlencode(q, doseq=True)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8")), url


def months_back(n):
    now = datetime.now(timezone.utc)
    t = now.year * 12 + now.month - 1 - n
    return f"{t // 12}-{t % 12 + 1:02d}"


def decode(data):
    """JSON-stat answer with dimensions (…, partner, …, time) -> {partner: {YYYY-MM: tonnes}}; other dimensions summed."""
    dims, sizes = data["id"], data["size"]
    strides, acc = [], 1
    for s in reversed(sizes):
        strides.insert(0, acc)
        acc *= s
    cats = {}
    for d in dims:
        idx = data["dimension"][d]["category"]["index"]
        cats[d] = sorted(idx, key=idx.get) if isinstance(idx, dict) else list(idx)
    pi, ti = dims.index(next(d for d in dims if d.lower() == "partner")), dims.index("time")
    # dimensions with a total code (e.g. stat_procedure: TOTAL next to its parts): keep only the total, else parts are summed
    only = {k: cats[d].index(next(c for c in cats[d] if c.upper() in ("TOTAL", "ALL")))
            for k, d in enumerate(dims) if k not in (pi, ti) and any(c.upper() in ("TOTAL", "ALL") for c in cats[d])}
    out = {}
    values = data.get("value") or {}
    items = values.items() if isinstance(values, dict) else enumerate(values)
    for pos, v in items:
        if v is None:
            continue
        pos = int(pos)
        coords = [(pos // strides[k]) % sizes[k] for k in range(len(dims))]
        if any(coords[k] != c for k, c in only.items()):
            continue
        partner, period = cats[dims[pi]][coords[pi]], cats[dims[ti]][coords[ti]]
        m = f"{period[:4]}-{period[-2:]}" if "M" in period else period[:7]
        out.setdefault(partner, {})
        out[partner][m] = out[partner].get(m, 0.0) + float(v) / 10   # 100 kg -> t
    return out


def fetch(product, dbg):
    since = months_back(27)
    last = "no data"
    for rep, with_time in [(r, t) for r in REPORTERS for t in (True, False)]:
        q = {"format": "JSON", "lang": "EN", "freq": "M", "reporter": rep, "product": product, "flow": "1",
             "indicators": "QUANTITY_IN_100KG"}
        if with_time:
            q["sinceTimePeriod"] = since.replace("-", "M")
        try:
            data, url = get_json(q)
            by = decode(data)
            dbg.append({"product": product, "reporter": rep, "partners": len(by), "url": url})
            if by:
                return by, rep
            last = "empty answer"
        except urllib.error.HTTPError as exc:
            last = f"HTTP {exc.code}"
            try:
                dbg.append({"product": product, "reporter": rep, "error": last, "body": exc.read().decode("utf-8", "replace")[:300]})
            except Exception:  # noqa: BLE001
                dbg.append({"product": product, "reporter": rep, "error": last})
        except Exception as exc:  # noqa: BLE001
            last = str(exc)[:160]
            dbg.append({"product": product, "reporter": rep, "error": last})
    raise RuntimeError(last)


def summarise(by, names):
    countries = {p: s for p, s in by.items() if len(p) == 2 and p.isalpha()}   # drop aggregates (EXT_EU27_2020, WORLD …)
    months = sorted({m for s in countries.values() for m, v in s.items() if v})
    # the newest month is often incomplete: use the last month that has at least 80 % of the previous month's volume
    tot = {m: sum(s.get(m, 0) for s in countries.values()) for m in months}
    while len(months) > 2 and tot[months[-1]] < 0.8 * tot[months[-2]]:
        months.pop()
    if len(months) < 12:
        raise RuntimeError(f"only {len(months)} months")
    cur, prv = months[-12:], months[-24:-12]
    def share(ms):
        t = sum(tot[m] for m in ms) or 1
        return {p: 100 * sum(s.get(m, 0) for m in ms) / t for p, s in countries.items()}, t
    sc, tc = share(cur)
    sp, tp = share(prv) if len(prv) == 12 else ({}, None)
    rows = sorted(({"code": p, "name": names.get(p, p), "share": round(v, 1), "kt": round(sum(countries[p].get(m, 0) for m in cur) / 1000, 1),
                    "change": round(v - sp[p], 1) if p in sp else None} for p, v in sc.items() if v > 0), key=lambda r: -r["share"])
    return {"from": cur[0], "to": cur[-1], "totalKt": round(tc / 1000), "prevTotalKt": round(tp / 1000) if tp else None, "rows": rows}


def main():
    eudr = json.loads(EUDR.read_text(encoding="utf-8")) if EUDR.exists() else {}
    names = eudr.get("names", {})
    prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    out = {"_comment": "Written by scripts/collect_pulp_origin.py – do not edit by hand. Source: Eurostat Comext DS-045409.",
           "source": {"label": "Eurostat Comext", "url": "https://ec.europa.eu/eurostat/comext/newxtweb/"}, "products": {}}
    dbg, bad = [], []
    for key, code in PRODUCTS.items():
        try:
            by, rep = fetch(code, dbg)
            out["products"][key] = dict(summarise(by, names), hs=code, reporter=rep)
        except Exception as exc:  # noqa: BLE001
            bad.append(f"{key}: {str(exc)[:100]}")
            if key in (prev.get("products") or {}):
                out["products"][key] = prev["products"][key]
    out["updated"] = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None).isoformat()
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    DEBUG.parent.mkdir(parents=True, exist_ok=True)
    DEBUG.write_text(json.dumps({"at": out["updated"], "failed": bad, "details": dbg}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n = len(out["products"])
    report_status("pulp_origin", "Pulp imports by origin (Comext)", "ok" if not bad else ("warn" if n else "error"),
                  f"{n} products" + (" · failed: " + "; ".join(bad[:2]) if bad else ""), order=36)
    print(f"pulp origin: {n} products" + ("; FAILED " + "; ".join(bad) if bad else ""))


if __name__ == "__main__":
    main()
