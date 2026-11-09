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
import zipfile
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
_smard_cache = {}


def smard_monthly(filter_id, region="DE"):
    if (filter_id, region) in _smard_cache:
        return _smard_cache[(filter_id, region)]
    base = f"https://www.smard.de/app/chart_data/{filter_id}/{region}"
    stamps = json.loads(get(f"{base}/index_month.json")).get("timestamps", [])
    out = {}
    for ts in stamps[-10:]:
        data = json.loads(get(f"{base}/{filter_id}_{region}_month_{ts}.json"))
        for t, v in data.get("series", []):
            if v is None:
                continue
            # SMARD month timestamps are local midnight (CET) -> may fall on the last day of the previous month in UTC
            d = datetime.fromtimestamp(t / 1000 + 3 * 3600, tz=timezone.utc)
            month = d.strftime("%Y-%m")
            out[month] = out.get(month, 0.0) + float(v)
    _smard_cache[(filter_id, region)] = out
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


def smard_share(ind):
    """Share (%) of some generation types ('part', SMARD filter ids) in the total of 'total' (power mix)."""
    part, tot = {}, {}
    for fid in ind["total"]:
        for m, v in smard_monthly(fid).items():
            tot[m] = tot.get(m, 0.0) + v
            if fid in ind["part"]:
                part[m] = part.get(m, 0.0) + v
    now_month = datetime.now(timezone.utc).strftime("%Y-%m")
    series = [[m, round(100 * part.get(m, 0.0) / tot[m], 1)] for m in sorted(tot) if tot[m] > 0 and START <= m < now_month]
    if not series:
        raise RuntimeError("no data")
    return series, None


def smard_price(ind):
    """Day-ahead wholesale price (€/MWh), monthly average. SMARD gives one value per month for prices;
    if those look like sums instead of averages, fall back to the weekly values averaged per month."""
    fid, region = ind.get("filter", 4169), ind.get("region", "DE-LU")
    base = f"https://www.smard.de/app/chart_data/{fid}/{region}"
    now_month = datetime.now(timezone.utc).strftime("%Y-%m")
    vals = {}
    stamps = json.loads(get(f"{base}/index_month.json")).get("timestamps", [])
    for ts in stamps[-10:]:
        for t, v in json.loads(get(f"{base}/{fid}_{region}_month_{ts}.json")).get("series", []):
            if v is not None:
                vals[datetime.fromtimestamp(t / 1000 + 3 * 3600, tz=timezone.utc).strftime("%Y-%m")] = float(v)
    good = sorted(vals.values())
    if not good or good[len(good) // 2] > 600:      # implausible as an average price -> use weekly values
        weeks = {}
        wstamps = json.loads(get(f"{base}/index_week.json")).get("timestamps", [])
        for ts in wstamps[-120:]:
            for t, v in json.loads(get(f"{base}/{fid}_{region}_week_{ts}.json")).get("series", []):
                if v is not None:
                    m = datetime.fromtimestamp(t / 1000 + 3 * 3600 * 24, tz=timezone.utc).strftime("%Y-%m")  # mid-week
                    weeks.setdefault(m, []).append(float(v))
        vals = {m: sum(v) / len(v) for m, v in weeks.items()}
    series = [[m, round(v, 2)] for m, v in sorted(vals.items()) if START <= m < now_month]
    if not series:
        raise RuntimeError("no data")
    return series, None


# ---------- Eurostat Comext (EU external trade): unit value = value / quantity, €/t ----------
COMEXT = "https://ec.europa.eu/eurostat/api/comext/dissemination/statistics/1.0/data/"
COMEXT_DEBUG = ROOT / "data" / "debug" / "comext.json"
_comext_dbg = {}


def comext(ind):
    """Monthly unit value (€ per tonne) of EU imports or exports of one product code (HS/CN),
    from Eurostat Comext. Example: 470321 = bleached softwood kraft pulp (NBSK)."""
    dbg = _comext_dbg.setdefault(ind["id"], {"tries": []})
    dataset = ind.get("dataset", "DS-045409")
    reporters = ind.get("reporters", ["EU27_2020", "EU"])
    partners = ind.get("partners", ["EXT_EU27_2020", "EXTRA_EU27_2020", "EXT_EU"])
    base_q = {"format": "JSON", "lang": "EN", "freq": "M", "product": ind["product"], "flow": str(ind["flow"])}
    last_err = "no data"
    for rep_code in reporters:
        for partner in partners + [None]:      # None = all partners, choose from the answer
            q = dict(base_q, reporter=rep_code)
            if partner:
                q["partner"] = partner
            url = COMEXT + dataset + "?" + urllib.parse.urlencode(q) + "&indicators=VALUE_IN_EUROS&indicators=QUANTITY_IN_100KG"
            try:
                data = json.loads(get(url, timeout=120))
                dims = data.get("id", [])
                dbg["dims"] = dims
                pdim = next((d for d in dims if d.lower() == "partner"), None)
                if partner is None and pdim:
                    idx = data["dimension"][pdim]["category"]["index"]
                    codes = list(idx) if isinstance(idx, dict) else idx
                    dbg["partnerCodes"] = [c for c in codes if not (len(c) == 2 and c.isalpha())][:40]
                    prefixes = tuple(ind.get("partnerPrefix", ["EXT", "EXTRA"]))
                    partner = next((c for c in codes if c.upper().startswith(prefixes)), None)
                    if not partner:
                        raise RuntimeError("no partner code starting with " + "/".join(prefixes) + " in answer")
                ind_dim = next(d for d in dims if d.lower() == "indicators")
                base_req = {pdim: partner} if pdim and partner else {}
                # trade is split by customs procedure (normal, inward/outward processing …): add all parts up
                sdim = next((d for d in dims if d.lower() == "stat_procedure"), None)
                procs = [None]
                if sdim:
                    sidx = data["dimension"][sdim]["category"]["index"]
                    procs = list(sidx) if isinstance(sidx, dict) else sidx
                    dbg["procedures"] = procs
                    tot = [c for c in procs if c.upper() in ("TOTAL", "ALL")]
                    if tot:
                        procs = tot
                v_sum, q_sum = {}, {}
                for pc in procs:
                    req = dict(base_req, **({sdim: pc} if sdim and pc else {}))
                    for code, acc in (("VALUE_IN_EUROS", v_sum), ("QUANTITY_IN_100KG", q_sum)):
                        part, _ = pick_series(data, {}, dict(req, **{ind_dim: code}))
                        for m, v in part:
                            acc[m] = acc.get(m, 0.0) + v
                series = [[m, round(v_sum[m] / (q_sum[m] / 10), 1)] for m in sorted(v_sum)
                          if q_sum.get(m, 0) >= ind.get("minQty100kg", 1000)]
                dbg["tries"].append({"reporter": rep_code, "partner": partner, "ok": len(series)})
                if series:
                    dbg["used"] = {"reporter": rep_code, "partner": partner, "latest": series[-1]}
                    return series, {"reporter": rep_code, "partner": partner}
                last_err = "no months with enough volume"
            except urllib.error.HTTPError as exc:
                last_err = f"HTTP {exc.code}"
                try:
                    dbg["tries"].append({"reporter": rep_code, "partner": partner, "error": last_err, "body": exc.read().decode("utf-8", "replace")[:300]})
                except Exception:  # noqa: BLE001
                    dbg["tries"].append({"reporter": rep_code, "partner": partner, "error": last_err})
            except Exception as exc:  # noqa: BLE001
                last_err = str(exc)[:160]
                dbg["tries"].append({"reporter": rep_code, "partner": partner, "error": last_err})
    raise RuntimeError(last_err)


# ---------- Destatis GENESIS (needs the GitHub secret DESTATIS_TOKEN, or DESTATIS_USER + DESTATIS_PASSWORD) ----------
GENESIS = "https://genesis.destatis.de/genesisWS/rest/2020/"
DESTATIS_DEBUG = ROOT / "data" / "debug" / "destatis.json"
DESTATIS_BUDGET = 900      # seconds for all GENESIS calls of one run; later Destatis indicators keep their old values
_destatis = {"tables": {}, "debug": {}, "meta": {}, "values": {}, "resolved": {}, "catalogue": {}, "varsearch": {}, "t0": None}
_PERIOD = re.compile(r"(MONAT|QUART|HALBJ|HJAHR)\D*(\d{1,2})$")


def _genesis_auth():
    tok = os.environ.get("DESTATIS_TOKEN", "").strip()
    if tok:
        return {"username": tok, "password": ""}
    user, pw = os.environ.get("DESTATIS_USER", "").strip(), os.environ.get("DESTATIS_PASSWORD", "")
    if user:
        return {"username": user, "password": pw}
    return None


def _genesis_post(method, params, timeout=120):
    auth = _genesis_auth()
    if not auth:
        raise RuntimeError("GitHub secret DESTATIS_TOKEN is not set")
    import time
    if _destatis["t0"] is None:
        _destatis["t0"] = time.monotonic()
    if time.monotonic() - _destatis["t0"] > DESTATIS_BUDGET:
        raise RuntimeError("time budget for Destatis used up in this run – tried again next run")
    body = urllib.parse.urlencode({"language": "de", **params}).encode("utf-8")
    req = urllib.request.Request(GENESIS + method, data=body, method="POST",
                                 headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", **auth})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    # GENESIS sends large tables as a zip file (even with compress=false): unpack the first file
    if raw[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            raw = z.read(z.namelist()[0])
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    return raw.decode("utf-8", "replace")


def _genesis_json(method, params, timeout=90):
    text = _genesis_post(method, params, timeout)
    try:
        return json.loads(text)
    except ValueError:
        raise RuntimeError(f"GENESIS {method}: no JSON answer ({text[:80]!r})")


def _num_de(v):
    v = (v or "").strip()
    if "," in v or re.fullmatch(r"-?\d{1,3}(\.\d{3})+", v):   # German format: dot = thousands separator
        v = v.replace(".", "").replace(",", ".")
    try:
        return float(v)
    except ValueError:
        return None


def _flat(s):
    return re.sub(r"\s+", " ", s or "").strip()


def _resolve_tables(ind):
    """'62421-*' + 'tableMatch' -> candidate tables of that statistic whose title matches (catalogue/tables).
    tableMatch may be a list of regexes in priority order; the collector tries the candidates in turn."""
    name = ind["table"]
    if "*" not in name:
        return [name]
    pats = ind.get("tableMatch", ".")
    pats = [pats] if isinstance(pats, str) else list(pats)
    key = name + "|" + "|".join(pats)
    if key in _destatis["resolved"]:
        return _destatis["resolved"][key]
    if name not in _destatis["catalogue"]:
        info = _genesis_json("catalogue/tables", {"selection": name, "area": "all", "pagelength": "200"})
        _destatis["catalogue"][name] = [{"code": t.get("Code"), "content": _flat(t.get("Content"))} for t in (info.get("List") or [])]
        _destatis["debug"].setdefault("catalogue", {})[name] = _destatis["catalogue"][name][:60]
    tables = _destatis["catalogue"][name]
    hits = []
    for p in pats:
        rx = re.compile(p, re.I)
        hits += [t["code"] for t in tables if rx.search(t["content"]) and t["code"] not in hits]
    if not hits:
        raise RuntimeError(f"no table {name} matches {pats} – see data/debug/destatis.json (catalogue)")
    _destatis["resolved"][key] = hits
    return hits


def _variables(table):
    """Classifying variables of a table (metadata/table), as [{code, content}]."""
    if table in _destatis["meta"]:
        return _destatis["meta"][table]
    info = _genesis_json("metadata/table", {"name": table, "area": "all"})
    found, seen = [], set()

    def walk(node):
        if isinstance(node, dict):
            code, content = node.get("Code"), node.get("Content")
            if code and content and code != table and code not in seen and (node.get("Type") or "").lower() != "wert":
                seen.add(code)
                found.append({"code": code, "content": _flat(content)})
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
    walk(info.get("Object") or info)
    _destatis["meta"][table] = found
    _destatis["debug"].setdefault("variables", {})[table] = found[:30]
    return found


def _values(var):
    if var in _destatis["values"]:
        return _destatis["values"][var]
    info = _genesis_json("catalogue/values2variable", {"name": var, "selection": "*", "area": "all", "pagelength": "10000"}, timeout=120)
    vals = [{"code": v.get("Code"), "content": _flat(v.get("Content"))} for v in (info.get("List") or [])]
    _destatis["values"][var] = vals
    return vals


def _classify(ind, table, dbg):
    """'filter': {'var': regex, 'values': [regex, …], 'multi': bool} -> GENESIS classifying parameters.
    Every variable of the table that matches 'var' is tried in turn (a table can have e.g. GP 2-Steller and
    9-Steller lists). Each value regex is tried in order against code and name; the shortest (most aggregated)
    code wins, or all hits when 'multi' is set (e.g. several CN codes that are summed afterwards)."""
    f = ind.get("filter")
    if not f:
        return {}
    if f.get("code"):
        cands = [f["code"]]
    else:
        vp = re.compile(f["var"], re.I)
        cands = [v["code"] for v in _variables(table) if vp.search(v["content"]) or vp.search(v["code"])]
        if f.get("varSearch"):   # metadata can list only the first of several classifications (e.g. COICOP 2-Steller of 2-/…/10-Steller)
            try:
                if f["varSearch"] not in _destatis["varsearch"]:
                    info = _genesis_json("catalogue/variables", {"selection": f["varSearch"], "area": "all", "pagelength": "200"})
                    _destatis["varsearch"][f["varSearch"]] = [{"code": v.get("Code"), "content": _flat(v.get("Content"))} for v in (info.get("List") or [])]
                found = _destatis["varsearch"][f["varSearch"]]
                dbg["varSearch"] = [v["code"] + " " + v["content"] for v in found][:40]
                more = [v["code"] for v in found if v["code"] not in cands and (vp.search(v["content"]) or vp.search(v["code"]))]
                # most detailed first (10-Steller / Sonderpositionen before 5-, 4-, 3-Steller)
                more.sort(key=lambda c: next((-int(m) for m in re.findall(r"(\d+)-Steller", next(v["content"] for v in found if v["code"] == c))), 0))
                cands = more + cands
            except Exception as exc:  # noqa: BLE001
                dbg["varSearchError"] = str(exc)[:160]
        if not cands:
            raise RuntimeError(f"no variable matches '{f['var']}' in {table} – see data/debug/destatis.json (variables)")
    keys, var = f.get("keys"), cands[0]
    if not keys:
        hits, ex = [], re.compile(ind.get("exclude", r"\bohne\b"), re.I)
        for var in cands:
            try:
                vals = _values(var)
            except Exception as exc:  # noqa: BLE001
                dbg.setdefault("valueErrors", {})[var] = str(exc)[:120]
                continue
            for p in f.get("values", []):
                rx = re.compile(p, re.I)
                hits = [v for v in vals if (rx.search(v["content"]) or rx.search(v["code"])) and not ex.search(v["content"])]
                if hits:
                    break
            if f.get("peek"):   # all candidate values, to check the choice in data/debug/destatis.json
                px = re.compile(f["peek"], re.I)
                dbg.setdefault("peek", {})[var] = [v["code"] + " " + v["content"] for v in vals if px.search(v["content"])][:60]
            if hits:
                dbg["valueCount"] = len(vals)
                break
            dbg.setdefault("valueSample", {})[var] = vals[:40]
        if not hits:
            raise RuntimeError(f"no value of {', '.join(cands)} in {table} matches {f.get('values')} – see data/debug/destatis.json")
        hits.sort(key=lambda v: (len(v["code"]), v["code"]))
        if not f.get("multi"):
            hits = hits[:1]
        keys = [v["code"] for v in hits[:40]]
        dbg["values"] = hits[:40]
        dbg.pop("valueSample", None)
    dbg["classify"] = {"var": var, "keys": keys}
    return {"classifyingvariable1": var, "classifyingkey1": ",".join(keys)}


_UNIT_BASE = {"TJ": ("J", 1e12), "kt": ("t", 1e3), "€ m": ("EUR", 1e6), "million m³": ("m3", 1e6)}


def _unit_factor(unit, target):
    """Factor that converts a GENESIS value unit (e.g. 'GJ', 'Tsd. t', '1000 EUR', 'Mill. cbm') into target."""
    if target not in _UNIT_BASE:
        return 1.0
    base, tsize = _UNIT_BASE[target]
    u = (unit or "").strip().replace("€", "EUR").replace("m³", "m3").replace("cbm", "m3").replace("Kubikmeter", "m3")
    mult = 1.0
    m = re.match(r"(1\.?000\.?000|1\.?000|Tsd\.?|Mill\.?|Mio\.?|Mrd\.?)\s*", u, re.I)
    if m:
        mult = {"1000": 1e3, "1.000": 1e3, "tsd": 1e3, "1000000": 1e6, "1.000.000": 1e6, "mill": 1e6, "mio": 1e6, "mrd": 1e9}[m.group(1).lower().rstrip(".")]
        u = u[m.end():]
    pre = {"k": 1e3, "M": 1e6, "G": 1e9, "T": 1e12, "P": 1e15}
    u = u.strip()
    if u == base or u.lower() == base.lower():
        return mult / tsize
    if len(u) == len(base) + 1 and u.endswith(base) and u[0] in pre:
        return mult * pre[u[0]] / tsize
    return 1.0


def _destatis_table(name, extra=None):
    """Download a GENESIS table as flat CSV (ffcsv) and return a list of rows
    (label, value label, unit, period YYYY-MM, value). Months, quarters, half-years and years are understood."""
    extra = extra or {}
    key = name + "|" + json.dumps(extra, sort_keys=True)
    if key in _destatis["tables"]:
        return _destatis["tables"][key]
    dbg = _destatis["debug"].setdefault(name if not extra else name + " · " + extra.get("classifyingkey1", "")[:60], {})
    first, year = int(START[:4]), datetime.now(timezone.utc).year
    try:
        out = _destatis_rows(name, extra, first, year, dbg)
    except _NoCube as exc:
        # GENESIS code 7000 "kein Datenquader gefunden": one empty time slice (e.g. while Destatis is loading
        # new figures, or a year without data for one value variable) makes the whole request fail.
        # Wait once and try again, then fall back to one request per year and keep the years that work.
        import time
        time.sleep(20)
        try:
            out = _destatis_rows(name, extra, first, year, dbg)
            dbg["retry"] = "ok after 20 s"
        except _NoCube:
            out, empty = [], []
            for y in range(first, year + 1):
                try:
                    out += _destatis_rows(name, extra, y, y, dbg)
                except _NoCube:
                    empty.append(y)
            dbg["byYear"] = {"emptyYears": empty, "rows": len(out)}
            if not out:
                raise RuntimeError(str(exc)) from None
    dbg["series"] = sorted({(l + (" | " + vl if vl else "") + (" [" + u + "]" if u else "")) for l, vl, u, _, _ in out})[:120]
    _destatis["tables"][key] = out
    return out


class _NoCube(RuntimeError):
    """GENESIS answered 'no data cube / time slice' (code 7000) instead of a table."""


def _destatis_rows(name, extra, startyear, endyear, dbg):
    text = _genesis_post("data/tablefile", {"name": name, "area": "all", "compress": "false", "transpose": "false",
                                            "startyear": str(startyear), "endyear": str(endyear), "format": "ffcsv", **extra})
    if text.lstrip().startswith("{"):
        info = json.loads(text)
        dbg["answer"] = {k: info.get(k) for k in ("Status", "Ident") if k in info}
        msg = "GENESIS: " + json.dumps(info.get("Status") or info, ensure_ascii=False)[:180]
        st = info.get("Status") or {}
        if str(st.get("Code")) == "7000" or "Datenquader" in str(st.get("Content", "")):
            raise _NoCube(msg)
        raise RuntimeError(msg)
    dbg.pop("answer", None)
    dbg["raw"] = text[:600]
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    rows = [r for r in csv.reader(io.StringIO(text, newline=""), delimiter=";") if r]
    # ffcsv starts with the header row; skip any preamble lines before it
    start = next((k for k, r in enumerate(rows) if any(c.strip().lower() in ("value", "time") for c in r)), 0)
    rows = rows[start:]
    head = [h.strip() for h in rows[0]]
    dbg["columns"] = head
    dbg["sample"] = rows[1:4]
    low = [h.lower() for h in head]
    vcol = next((k for k, h in enumerate(low) if h == "value"), None)
    tcol = next((k for k, h in enumerate(low) if h in ("time", "zeit")), None)
    ucol = next((k for k, h in enumerate(low) if h == "value_unit"), None)
    lcol = next((k for k, h in enumerate(low) if h == "value_variable_label"), None)
    # period column (months, quarters, half-years): an attribute code like MONAT01, QUART3, HALBJ2; none = yearly table
    pcol = None
    for k in range(len(head)):
        vals = {r[k] for r in rows[1:60] if len(r) > k}
        if vals and all(_PERIOD.fullmatch(v or "") for v in vals):
            pcol = k
            break
    skip = {pcol + 1} if pcol is not None else set()
    names = r"(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|\d\. Quartal|\d\. Halbjahr|Quartal \d|Halbjahr \d)"
    label_cols = [k for k, h in enumerate(low) if h.endswith("attribute_label") and k not in skip]
    label_cols = [k for k in label_cols if not any(re.fullmatch(names, r[k] or "") for r in rows[1:20] if len(r) > k)]
    if vcol is None or tcol is None:
        raise RuntimeError(f"unknown table layout (value={vcol}, time={tcol}) – see data/debug/destatis.json")
    out = []
    for r in rows[1:]:
        if len(r) <= max(vcol, tcol):
            continue
        val = _num_de(r[vcol])
        if val is None:
            continue
        yr = r[tcol].strip()[:4]
        if not yr.isdigit():
            continue
        month = "01"
        if pcol is not None and len(r) > pcol:
            m = _PERIOD.match(r[pcol].strip())
            if m:
                n = int(m.group(2))
                month = {"MONAT": n, "QUART": (n - 1) * 3 + 1}.get(m.group(1), 1 if n == 1 else 7)
                month = f"{month:02d}"
        label = " · ".join(r[k].strip() for k in label_cols if len(r) > k and r[k].strip())
        out.append((label, (r[lcol].strip() if lcol is not None and len(r) > lcol else ""),
                    (r[ucol].strip() if ucol is not None and len(r) > ucol else ""), f"{yr}-{month}", val))
    dbg["periodColumn"] = head[pcol] if pcol is not None else "none (yearly)"
    return out


def destatis(ind):
    """Options: table (code, or 'NNNNN-*' with tableMatch), filter (classifying variable, see _classify),
    unit / valueLabel (regex on the value unit / value variable, e.g. index rows only, or 'Einfuhr: Gewicht'),
    match (regexes for the series name in priority order), sum (add up all matching series), scale (factor)."""
    tables = _resolve_tables(ind)
    tried, last = {}, None
    for table in tables[:5]:
        try:
            return _destatis_one(ind, table, tried)
        except RuntimeError as exc:
            if "time budget" in str(exc):
                raise
            tried[table], last = str(exc)[:200], exc
    raise last


def _destatis_one(ind, table, tried):
    dbg = {"table": table}
    if tried:
        dbg["tried"] = dict(tried)
    _destatis["debug"].setdefault("indicators", {})[ind["id"]] = dbg
    extra = _classify(ind, table, dbg)
    rows = _destatis_table(table, extra)
    if ind.get("toUnit"):
        dbg["units"] = sorted({r[2] for r in rows})[:8]
        rows = [(l, vl, u, per, v * _unit_factor(u, ind["toUnit"])) for l, vl, u, per, v in rows]
    if ind.get("unit_match"):
        ux = re.compile(ind["unit_match"], re.I)
        rows = [r for r in rows if ux.search(r[2])]
    if ind.get("valueLabel"):
        vx = re.compile(ind["valueLabel"], re.I)
        rows = [r for r in rows if vx.search(r[1])]
    full = bool(ind.get("unit_match") or ind.get("valueLabel") or ind.get("sum"))
    table_map = {}
    for label, vlabel, unit, period, val in rows:
        lab = label if not full else label + (" | " + vlabel if vlabel else "")
        table_map.setdefault(lab, {})[period] = val       # later rows win (index after % changes)
    pats = [re.compile(p, re.I) for p in ind.get("match", [])] or [re.compile(".")]
    excl = re.compile(ind.get("exclude", r"\bohne\b"), re.I)
    if ind.get("sum"):
        labels = [l for l in table_map if any(p.search(l) for p in pats) and not excl.search(l)]
    else:
        lab = next((l for p in pats for l in table_map if p.search(l) and not excl.search(l)), None)
        labels = [lab] if lab else []
    if not labels:
        dbg["seriesFound"] = sorted(table_map)[:60]
        raise RuntimeError("no series matches " + " / ".join(ind.get("match", [])) + " – see data/debug/destatis.json")
    dbg["matched"] = labels[:12]
    _destatis["debug"].setdefault("matched", {})[ind["id"]] = labels[0] if len(labels) == 1 else f"{len(labels)} series (sum)"
    merged = {}
    for l in labels:
        for m, v in table_map[l].items():
            merged[m] = merged.get(m, 0.0) + v
    scale = float(ind.get("scale", 1))
    series = [[m, round(v * scale, 3 if abs(v * scale) < 10 else 2)] for m, v in sorted(merged.items()) if m >= START]
    if not series:
        raise RuntimeError("no data")
    return series, {"series": labels[0] if len(labels) == 1 else f"{len(labels)} series", "table": table}


def destatis_discover():
    """Search GENESIS for tables of interest; the result helps to configure new indicators."""
    found = {}
    for term in ("Erzeugerpreise gewerblicher Produkte", "Wassereinsatz Wirtschaftszweige", "Wasseraufkommen Betriebe",
                 "Arbeitskosten Wirtschaftszweige", "Abfallmenge Wirtschaftszweige"):
        try:
            info = json.loads(_genesis_post("find/find", {"term": term, "category": "tables", "pagelength": "12"}, timeout=60))
            found[term] = [{"code": t.get("Code"), "content": _flat(t.get("Content"))} for t in (info.get("Tables") or [])][:12]
        except Exception as exc:  # noqa: BLE001
            found[term] = str(exc)[:160]
    _destatis["debug"]["search"] = found


# ---------- Ember (grid carbon intensity, CC BY 4.0) ----------
EMBER_URL = "https://files.ember-energy.org/public-downloads/monthly_full_release_long_format.csv"
EMBER_DEBUG = ROOT / "data" / "debug" / "ember.json"
_ember_cache = {}


def _open_csv(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    resp = urllib.request.urlopen(req, timeout=300)
    raw = resp
    if url.split("?")[0].endswith(".gz") or (getattr(resp, "headers", None) or {}).get("Content-Encoding") == "gzip":
        import gzip
        raw = gzip.GzipFile(fileobj=resp)
    return resp, csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""))


def _parse_ember(reader, dbg):
    """Read CO2 intensity per area and month from an Ember CSV.
    Works with the long format (Variable/Unit/Value rows) and the wide format (one column per measure):
    an intensity column is used directly; otherwise intensity = emissions / generation of the total row."""
    header = reader.fieldnames or []
    norm = {k: re.sub(r"[^a-z0-9]", "", (k or "").lower()) for k in header}
    find = lambda *names: next((k for k, n in norm.items() if n in names), None)
    findp = lambda pred: next((k for k, n in norm.items() if pred(n)), None)
    c_area, c_iso, c_date = find("area", "country", "entity"), find("iso3code", "iso3", "countrycode"), find("date", "month")
    c_var, c_sub, c_cat, c_unit, c_val = find("variable"), find("subcategory"), find("category"), find("unit"), find("value")
    c_src = findp(lambda n: n in ("electricitysource", "source", "fuel"))
    c_int = findp(lambda n: "intensity" in n and "co2" in n and "change" not in n and "yoy" not in n)
    c_em = findp(lambda n: n.startswith("emissions") and "mt" in n and "change" not in n and "yoy" not in n)
    c_gen = findp(lambda n: n.startswith("generation") and "twh" in n and "change" not in n and "yoy" not in n)
    dbg.update(columns=header, used={"intensity": c_int, "emissions": c_em, "generation": c_gen, "source": c_src, "variable": c_var})
    table, sources, samples = {}, {}, []
    for row in reader:
        if len(samples) < 3:
            samples.append({k: row.get(k) for k in header[:14]})
        date = (row.get(c_date) or "")[:7] if c_date else ""
        if date < START:
            continue
        value = None
        if c_var and c_val:                                   # long format
            text = " ".join((row.get(c) or "") for c in (c_cat, c_sub, c_var) if c).lower()
            unit = (row.get(c_unit) or "").lower().replace(" ", "")
            if "intensity" in text and "co2" in unit:
                value = row.get(c_val)
        elif c_int:                                           # wide format with an intensity column
            value = row.get(c_int)
        elif c_em and c_gen:                                  # derive from emissions and generation of the total row
            src = (row.get(c_src) or "").lower() if c_src else "total"
            if len(sources) < 40:
                sources[src] = 1
            if "total" in src:
                try:
                    value = 1000 * float(row.get(c_em)) / float(row.get(c_gen))
                except (TypeError, ValueError, ZeroDivisionError):
                    value = None
        try:
            value = round(float(value), 1)
        except (TypeError, ValueError):
            continue
        for key in {(row.get(c_iso) or "").strip() if c_iso else "", (row.get(c_area) or "").strip() if c_area else ""}:
            if key:
                table.setdefault(key, {})[date] = value
    dbg.update(sources=list(sources)[:40], samples=samples)
    return table


def ember_table():
    """{area key -> {YYYY-MM: gCO2/kWh}}, downloaded once per run. Follows Ember's 'file moved' notices and
    tries the emissions file next to a generation-only file. Details of every attempt go to data/debug/ember.json."""
    if "t" in _ember_cache:
        return _ember_cache["t"]
    if "err" in _ember_cache:
        raise RuntimeError(_ember_cache["err"])
    queue, tried, debug = [EMBER_URL], [], {"attempts": []}
    while queue and len(tried) < 6:
        url = queue.pop(0)
        if url in tried:
            continue
        tried.append(url)
        dbg = {"url": url}
        debug["attempts"].append(dbg)
        try:
            resp, reader = _open_csv(url)
            with resp:
                header = [h.strip().lower() for h in (reader.fieldnames or [])]
                if "new_url" in header:
                    row = next(reader, {}) or {}
                    new = next((v for k, v in row.items() if k and k.strip().lower() == "new_url"), "")
                    dbg["movedTo"] = new
                    if new.startswith("http"):
                        queue.insert(0, new)
                        # a generation-only file usually has an emissions file next to it
                        for a, b in (("generation", "emissions"), ("generation", "power_sector_emissions"), ("generation", "carbon_intensity")):
                            if a in new:
                                queue.append(new.replace(a, b))
                    continue
                table = _parse_ember(reader, dbg)
        except Exception as exc:  # noqa: BLE001 - note and try the next candidate
            dbg["error"] = str(exc)[:200]
            continue
        dbg["areas"] = len(table)
        if table:
            _ember_cache["t"] = table
            break
    try:
        EMBER_DEBUG.parent.mkdir(exist_ok=True)
        EMBER_DEBUG.write_text(json.dumps(debug, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    except OSError:
        pass
    if "t" in _ember_cache:
        return _ember_cache["t"]
    _ember_cache["err"] = "no CO2 intensity found in the Ember files (details in data/debug/ember.json)"
    raise RuntimeError(_ember_cache["err"])


def ember(ind):
    table = ember_table()
    data = table.get(ind["area"]) or next((table[k] for k in ind.get("alias", []) if k in table), None)
    if not data:
        raise RuntimeError(f"area {ind['area']} not in the Ember file")
    return [[m, v] for m, v in sorted(data.items())], None


def manual(ind):
    vals = sorted(ind.get("values", []), key=lambda x: x["date"])
    return [[v["date"], float(v["value"])] for v in vals], None


FETCH = {"eurostat": eurostat, "fred": fred, "smard": smard, "smard_share": smard_share, "smard_price": smard_price, "comext": comext, "destatis": destatis, "ember": ember, "manual": manual}
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
            if ind.get("accumulate") and old.get(ind["id"], {}).get("series"):
                # the source only holds recent months: keep older ones from earlier runs
                merged = {m: v for m, v in old[ind["id"]]["series"]}
                merged.update({m: v for m, v in series})
                series = [[m, merged[m]] for m in sorted(merged)]
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

    if any(i["source"] == "destatis" for i in config["indicators"]):
        if _genesis_auth():
            try:
                destatis_discover()
            except Exception as exc:  # noqa: BLE001
                _destatis["debug"]["search"] = str(exc)[:160]
        DESTATIS_DEBUG.parent.mkdir(parents=True, exist_ok=True)
        DESTATIS_DEBUG.write_text(json.dumps({"checked": now, "credentials": bool(_genesis_auth()), **_destatis["debug"]},
                                             ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    if _comext_dbg:
        COMEXT_DEBUG.parent.mkdir(parents=True, exist_ok=True)
        COMEXT_DEBUG.write_text(json.dumps({"checked": now, "indicators": _comext_dbg}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    auto = [r for r in result if r.get("source") != "manual"]
    bad = [r["id"] for r in auto if r.get("status") in ("stale", "missing")]
    report_status("market", "Market indicators", "error" if auto and len(bad) == len(auto) else "warn" if bad else "ok",
                  f"{len(auto) - len(bad)} of {len(auto)} indicators" + (" · failed: " + ", ".join(bad[:4]) + (f" +{len(bad) - 4} more" if len(bad) > 4 else "") if bad else ""), order=30)
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
