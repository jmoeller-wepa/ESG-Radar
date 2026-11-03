#!/usr/bin/env python3
"""Collect free, official market indicators into data/market.json.

Run by the weekly GitHub Action (or locally: python scripts/collect_market.py).
Sources (all free, no API key, reuse allowed with attribution):
- Eurostat JSON-stat API      (producer prices, production, energy prices)
- FRED fredgraph.csv          (US price indices, TTF gas, EUR/USD)
- SMARD chart_data (CC BY 4.0) (German power generation -> renewable share)
Manual indicators (e.g. the EU carbon price, which is licensed data) are copied from
config/market.json as they are.

Every indicator is fetched on its own: if one fails, the previous values are kept
and the run continues. Nothing is ever invented — no data means an empty tile.
"""
import csv
import io
import json
import re
import os
import sys
import urllib.parse
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from status_util import report as report_status

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "market.json"
OUT = ROOT / "data" / "market.json"
START = "2019-01"          # keep about seven years of history
UA = "Mozilla/5.0 (compatible; ESG-Radar/1.0; +https://github.com)"


def get(url, timeout=40):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8")


def norm_period(p):
    """'2024-03' / '2024M03' -> '2024-03'; '2024-S2' / '2024S2' -> '2024-07'; '2024' -> '2024-01'."""
    p = p.strip()
    if "S" in p[4:]:
        year, half = p[:4], p[-1]
        return f"{year}-{'01' if half == '1' else '07'}"
    if "Q" in p[4:]:
        year, q = p[:4], int(p[-1])
        return f"{year}-{(q - 1) * 3 + 1:02d}"
    if "M" in p[4:]:
        return f"{p[:4]}-{p[-2:]}"
    if len(p) == 4:
        return f"{p}-01"
    return p[:7]


# ---------- Eurostat ----------
def pick_series(data, prefer, required=None):
    required = required or {}
    """Decode a JSON-stat 2.0 answer into one time series.
    If a dimension still has several codes, take the first preferred code that exists (else the first one)."""
    dims, sizes = data["id"], data["size"]
    values = data.get("value") or {}
    strides, acc = [], 1
    for size in reversed(sizes):
        strides.insert(0, acc)
        acc *= size
    offset, chosen = 0, {}
    for dim, stride in zip(dims, strides):
        if dim == "time":
            continue
        index = data["dimension"][dim]["category"]["index"]
        codes = sorted(index, key=index.get) if isinstance(index, dict) else list(index)
        if dim in required and required[dim] not in codes:
            raise RuntimeError(f"{dim}={required[dim]} not in the answer")
        code = required.get(dim) or next((c for c in prefer.get(dim, []) if c in codes), codes[0])
        chosen[dim] = code
        offset += (index[code] if isinstance(index, dict) else codes.index(code)) * stride
    t_stride = strides[dims.index("time")]
    times = data["dimension"]["time"]["category"]["index"]
    series = []
    for period, pos in times.items():
        v = values.get(str(offset + pos * t_stride)) if isinstance(values, dict) else values[offset + pos * t_stride]
        if v is not None:
            series.append([norm_period(period), round(float(v), 4)])
    return sorted(s for s in series if s[0] >= START), chosen


def eurostat(ind):
    base = f"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{ind['dataset']}"
    attempts = [dict(ind["params"])]
    for alt in ind.get("alts", []):
        attempts.append({**attempts[-1], **alt})
    # last resort: only the essential filters; everything else is chosen via 'prefer'
    attempts.append({k: v for k, v in ind["params"].items() if k in ind.get("essential", ["geo", "nace_r2", "product"])})
    attempts.append({"geo": ind["params"]["geo"]})
    last_err = "no data"
    best = None
    for params in attempts:
        query = {"format": "JSON", "lang": "EN", **params}
        if ind.get("freq") == "monthly":
            query["sinceTimePeriod"] = START   # half-yearly data uses another period format (2019-S1); filtered below instead
        url = base + "?" + urllib.parse.urlencode(query)
        try:
            data = json.loads(get(url, timeout=90))
            if "time" not in data.get("id", []):
                raise RuntimeError("no time dimension in answer")
            # identity dimensions (which product, which country) must never fall back to another code
            required = {k: v for k, v in ind["params"].items() if k in ("geo", "nace_r2", "product", "siec")}
            missing = [k for k in required if k not in params and k not in data.get("id", [])]
            if missing:
                raise RuntimeError("answer does not identify " + ", ".join(missing))
            series, chosen = pick_series(data, ind.get("prefer", {}), required)
        except urllib.error.HTTPError as exc:
            try:
                detail = json.loads(exc.read().decode("utf-8")).get("error", [{}])
                detail = detail[0].get("label") if isinstance(detail, list) and detail else str(detail)
            except Exception:  # noqa: BLE001
                detail = ""
            last_err = f"HTTP {exc.code} {detail or ''}".strip()[:200] + " · tried: " + ", ".join(f"{k}={v}" for k, v in params.items())
            continue
        except Exception as exc:  # noqa: BLE001 - try the next parameter set
            last_err = str(exc)[:160]
            continue
        if series:
            # keep the most recent series (an old index base, e.g. 2015=100, can stop years ago)
            if best is None or series[-1][0] > best[0][-1][0]:
                best = (series, {**params, **chosen})
            fresh = datetime.now(timezone.utc).strftime("%Y-%m")
            if ind.get("freq") == "monthly" and series[-1][0] >= monthsback_str(fresh, 6):
                break
            continue
        last_err = "no recent data"
    if best:
        return best
    raise RuntimeError(last_err)


def monthsback_str(ym, n):
    y, m = map(int, ym.split("-"))
    t = y * 12 + (m - 1) - n
    return f"{t // 12}-{t % 12 + 1:02d}"


# ---------- FRED ----------
def fred(ind):
    url = "https://fred.stlouisfed.org/graph/fredgraph.csv?" + urllib.parse.urlencode({"id": ind["series"], "cosd": START + "-01"})
    rows = list(csv.reader(io.StringIO(get(url))))
    series = []
    for row in rows[1:]:
        if len(row) < 2 or row[1] in ("", "."):
            continue
        try:
            series.append([row[0][:7], round(float(row[1]), 4)])
        except ValueError:
            continue
    if not series:
        raise RuntimeError("no data")
    return [s for s in series if s[0] >= START], None


# ---------- SMARD ----------
def smard_monthly(filter_id):
    base = f"https://www.smard.de/app/chart_data/{filter_id}/DE"
    stamps = json.loads(get(f"{base}/index_month.json")).get("timestamps", [])
    out = {}
    for ts in stamps[-10:]:
        data = json.loads(get(f"{base}/{filter_id}_DE_month_{ts}.json"))
        for t, v in data.get("series", []):
            if v is None:
                continue
            # SMARD month timestamps are local midnight (CET) -> may fall on the last day of the previous month in UTC
            d = datetime.fromtimestamp(t / 1000 + 3 * 3600, tz=timezone.utc)
            month = d.strftime("%Y-%m")
            out[month] = out.get(month, 0.0) + float(v)
    return out


def smard(ind):
    ren, conv = {}, {}
    for fid in ind["renewable"]:
        for m, v in smard_monthly(fid).items():
            ren[m] = ren.get(m, 0.0) + v
    for fid in ind["conventional"]:
        for m, v in smard_monthly(fid).items():
            conv[m] = conv.get(m, 0.0) + v
    now_month = datetime.now(timezone.utc).strftime("%Y-%m")
    series = []
    for m in sorted(set(ren) & set(conv)):
        total = ren[m] + conv[m]
        if total > 0 and START <= m < now_month:     # skip the running month (incomplete)
            series.append([m, round(100 * ren[m] / total, 1)])
    if not series:
        raise RuntimeError("no data")
    return series, None


# ---------- Ember (grid carbon intensity, CC BY 4.0) ----------
EMBER_URL = "https://files.ember-energy.org/public-downloads/monthly_full_release_long_format.csv"
_ember_cache = {}


def _ember_follow(url):
    return ember_table(url)


def ember_table(url=None):
    """{area key -> {YYYY-MM: gCO2/kWh}} for every country in the monthly file (downloaded once per run)."""
    if "t" in _ember_cache:
        return _ember_cache["t"]
    url = url or EMBER_URL
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    table, seen_vars, header = {}, {}, None
    with urllib.request.urlopen(req, timeout=300) as resp:
        raw = resp
        if url.split("?")[0].endswith(".gz") or (getattr(resp, "headers", None) or {}).get("Content-Encoding") == "gzip":
            import gzip
            raw = gzip.GzipFile(fileobj=resp)
        reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""))
        header = reader.fieldnames
        if header and "new_url" in [h.strip().lower() for h in header]:
            # Ember moved the file: the old address now returns a one-line notice with the new address
            row = next(reader, {}) or {}
            new_url = next((v for k, v in row.items() if k and k.strip().lower() == "new_url"), "")
            if new_url and new_url.startswith("http") and not _ember_cache.get("moved"):
                _ember_cache["moved"] = new_url
                return _ember_follow(new_url)
        norm = {k: re.sub(r"[^a-z0-9]", "", (k or "").lower()) for k in (header or [])}
        find = lambda *names: next((k for k, n in norm.items() if n in names), None)
        c_area, c_iso, c_date = find("area", "country", "entity"), find("iso3code", "iso3", "countrycode"), find("date", "month")
        c_var, c_sub, c_cat = find("variable"), find("subcategory"), find("category")
        c_unit, c_val = find("unit"), find("value")
        for row in reader:
            text = " ".join((row.get(c) or "") for c in (c_cat, c_sub, c_var) if c).lower()
            unit = (row.get(c_unit) or "").lower().replace(" ", "")
            if len(seen_vars) < 40:
                seen_vars[(row.get(c_var) or "") + " [" + (row.get(c_unit) or "") + "]"] = 1
            if "intensity" not in text or "co2" not in unit:
                continue
            date = (row.get(c_date) or "")[:7]
            if date < START:
                continue
            try:
                value = round(float(row.get(c_val)), 1)
            except (TypeError, ValueError):
                continue
            for key in {(row.get(c_iso) or "").strip() if c_iso else "", (row.get(c_area) or "").strip() if c_area else ""}:
                if key:
                    table.setdefault(key, {})[date] = value
    if not table:
        raise RuntimeError("no CO2 intensity rows in the Ember file. Columns: " + ", ".join(header or [])[:200]
                           + " · variables seen: " + "; ".join(list(seen_vars)[:12])[:300])
    _ember_cache["t"] = table
    return table


def ember(ind):
    table = ember_table()
    data = table.get(ind["area"]) or next((table[k] for k in ind.get("alias", []) if k in table), None)
    if not data:
        raise RuntimeError(f"area {ind['area']} not in the Ember file")
    return [[m, v] for m, v in sorted(data.items())], None


def manual(ind):
    vals = sorted(ind.get("values", []), key=lambda x: x["date"])
    return [[v["date"], float(v["value"])] for v in vals], None


FETCH = {"eurostat": eurostat, "fred": fred, "smard": smard, "ember": ember, "manual": manual}
KEEP = ("id", "group", "areas", "label", "unit", "freq", "attribution", "link", "source", "country", "isUs")


def main():
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    old = {}
    if OUT.exists():
        try:
            old = {i["id"]: i for i in json.loads(OUT.read_text(encoding="utf-8")).get("indicators", [])}
        except (ValueError, KeyError):
            old = {}
    now = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None).isoformat()
    result, report = [], []
    for ind in config["indicators"]:
        item = {k: ind.get(k) for k in KEEP}
        if ind["source"] == "manual":
            item["notes"] = [{k: v[k] for k in ("date", "note", "url") if k in v} for v in ind.get("values", [])]
        try:
            series, used = FETCH[ind["source"]](ind)
            item.update(series=series, status="manual" if ind["source"] == "manual" else "ok", fetched=now)
            if used and used != ind.get("params"):
                item["usedParams"] = used
            report.append(f"| {ind['id']} | ok | {len(series)} | {series[-1][0] if series else '–'} |")
        except Exception as exc:  # noqa: BLE001 - keep old values, report, continue
            prev = old.get(ind["id"], {})
            item.update(series=prev.get("series", []), status="stale" if prev.get("series") else "missing",
                        fetched=prev.get("fetched"), error=str(exc)[:200])
            report.append(f"| {ind['id']} | ⚠️ {str(exc)[:80]} | {len(item['series'])} (kept) | – |")
        result.append(item)

    auto = [r for r in result if r.get("source") != "manual"]
    bad = [r["id"] for r in auto if r.get("status") in ("stale", "missing")]
    report_status("market", "Market indicators", "error" if auto and len(bad) == len(auto) else "warn" if bad else "ok",
                  f"{len(auto) - len(bad)} of {len(auto)} indicators" + (" · failed: " + ", ".join(bad[:4]) if bad else ""), order=30)
    OUT.write_text(json.dumps({"updated": now, "groups": config.get("groups", {}), "indicators": result},
                              ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    text = "\n".join(["## Market indicators", "", "| Indicator | Status | Points | Latest |", "|---|---|---|---|", *report])
    print(text)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as fh:
            fh.write(text + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
