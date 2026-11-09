"""Collect river levels and soil moisture for the Market page, tab "Water" (data/water.json).

Sources (both public and free):
  - PEGELONLINE (Federal Waterways and Shipping Administration, WSV): water level of federal waterways, last 31 days per run.
    Daily means are added to the history kept in data/water.json, so the chart grows with every run.
  - Deutscher Wetterdienst (DWD) Climate Data Center: modelled daily soil moisture (% of usable field capacity) for the
    station nearest to each WEPA mill (config/water.json). The "recent" files cover roughly the last 1.5 years.

Settings: config/water.json. Diagnostics: data/debug/water.json (which station and column was used).
"""
import gzip
import io
import json
import math
import re
import urllib.parse
import urllib.request
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from status_util import report as report_status

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "water.json"
OUT = ROOT / "data" / "water.json"
DEBUG = ROOT / "data" / "debug" / "water.json"
UA = "Mozilla/5.0 (compatible; ESG-Radar/1.0)"
PEGEL = "https://www.pegelonline.wsv.de/webservices/rest-api/v2"
DWD = "https://opendata.dwd.de/climate_environment/CDC/derived_germany/soil/daily/recent/"


def get(url, timeout=90):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def get_json(url):
    return json.loads(get(url).decode("utf-8"))


# ---------- river gauges (PEGELONLINE) ----------
def find_station(stations, g):
    want = (g.get("station") or "").upper()
    for s in stations:
        if (s.get("shortname") or "").upper() == want:
            return s
    m = (g.get("match") or want).upper()
    for s in stations:
        if m and m in (s.get("longname") or "").upper():
            return s
    # not on PEGELONLINE (e.g. a gauge run by a federal state): nearest station on the same river
    if g.get("lat") is not None and g.get("lon") is not None:
        river = (g.get("water") or "").upper()
        near = [(km((g["lat"], g["lon"]), (s["latitude"], s["longitude"])), s) for s in stations
                if s.get("latitude") is not None and s.get("longitude") is not None
                and (not river or ((s.get("water") or {}).get("shortname") or "").upper() == river)]
        near = [x for x in near if x[0] <= float(g.get("maxKm", 60))]
        if near:
            d, s = min(near, key=lambda x: x[0])
            return dict(s, _fallbackKm=round(d, 1))
    return None


def collect_gauge(g, stations, prev, keep_from, dbg):
    st = find_station(stations, g)
    if not st:
        raise RuntimeError(f"station {g.get('station')} not found" + (" (no PEGELONLINE gauge on that river within reach)" if g.get("lat") is not None else ""))
    uid = st["uuid"]
    detail = get_json(f"{PEGEL}/stations/{uid}.json?includeTimeseries=true&includeCharacteristicValues=true")
    ts = next((t for t in detail.get("timeseries", []) if t.get("shortname") == "W"), None)
    if not ts:
        raise RuntimeError("no water level time series (W)")
    char = {c.get("shortname"): c.get("value") for c in ts.get("characteristicValues", []) or [] if c.get("value") is not None}
    meas = get_json(f"{PEGEL}/stations/{uid}/W/measurements.json?start=P31D")
    days = {}
    for m in meas:
        v, t = m.get("value"), (m.get("timestamp") or "")[:10]
        if v is None or not t:
            continue
        days.setdefault(t, []).append(float(v))
    series = {d: v for d, v in (prev.get("series") or [])}
    for d, vs in days.items():
        series[d] = round(sum(vs) / len(vs), 1)
    series = sorted((d, v) for d, v in series.items() if d >= keep_from)
    last = meas[-1] if meas else None
    dbg.append({"gauge": g["id"], "station": st.get("shortname"), "uuid": uid, "water": (st.get("water") or {}).get("longname"),
                "characteristic": char, "points": len(meas), **({"fallbackKm": st["_fallbackKm"], "wanted": g.get("station")} if "_fallbackKm" in st else {})})
    label = g.get("label") or st.get("longname")
    if "_fallbackKm" in st:   # configured gauge missing: name the gauge actually used
        label = f"{g.get('river') or (st.get('water') or {}).get('longname')} · {(st.get('longname') or '').title()}"
    keep = {k: char[k] for k in ("GlW", "MNW", "MW", "MHW", "HSW") if k in char}
    return {
        "id": g["id"], "label": label, "river": g.get("river") or (st.get("water") or {}).get("longname"),
        "station": st.get("longname"), "unit": ts.get("unit") or "cm", "why": g.get("why", ""),
        "characteristic": keep, "thresholds": g.get("thresholds", []),
        "latest": {"t": last.get("timestamp"), "v": last.get("value")} if last else None,
        "series": [list(p) for p in series],
        "link": f"https://www.pegelonline.wsv.de/gast/stammdaten?pegelnr={st.get('number')}" if st.get("number") else "https://www.pegelonline.wsv.de/",
    }


# ---------- soil moisture (DWD) ----------
def listing():
    html = get(DWD, timeout=60).decode("utf-8", "replace")
    return [urllib.parse.unquote(h) for h in re.findall(r'href="([^"?/][^"]*)"', html)]


def parse_stations(text):
    """Station list: a fixed-width or semicolon table. Returns {id: (lat, lon, name)} using plausible German coordinates."""
    out = {}
    for line in text.splitlines():
        parts = [p for p in (line.split(";") if ";" in line else line.split()) if p.strip()]
        if not parts or not re.fullmatch(r"\d{1,5}", parts[0].strip()):
            continue
        nums = []
        for p in parts[1:]:
            try:
                nums.append(float(p.strip().replace(",", ".")))
            except ValueError:
                pass
        lat = next((n for n in nums if 47 <= n <= 55.5 and not n.is_integer()), None)
        lon = next((n for n in nums if 5.5 <= n <= 15.5 and not n.is_integer() and n != lat), None)
        if lat is None or lon is None:
            continue
        name = next((p.strip() for p in parts[1:] if re.search(r"[A-Za-zÄÖÜäöü]{3}", p)), "")
        out[int(parts[0])] = (lat, lon, name)
    return out


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def read_soil(raw, name, columns):
    if name.endswith(".gz"):
        raw = gzip.decompress(raw)
    elif name.endswith(".zip"):
        z = zipfile.ZipFile(io.BytesIO(raw))
        names = z.namelist()
        inner = next((n for n in names if "produkt" in n.lower()), None) or next(n for n in names if n.lower().endswith((".txt", ".csv")))
        raw = z.read(inner)
    lines = raw.decode("latin-1").splitlines()
    head = [h.strip().lower() for h in lines[0].split(";")]
    col = next((c for c in columns if c in head), None)
    if col is None:
        col = next((h for h in head if h.startswith("bfg")), None)
    dcol = next((k for k, h in enumerate(head) if h in ("datum", "mess_datum", "date")), 1)
    if col is None:
        raise RuntimeError("no soil-moisture column in " + ",".join(head[:20]))
    k = head.index(col)
    out = []
    for line in lines[1:]:
        p = line.split(";")
        if len(p) <= k:
            continue
        d = p[dcol].strip()
        try:
            v = float(p[k].strip())
        except ValueError:
            continue
        if v < -900 or not re.fullmatch(r"\d{8}", d):
            continue
        out.append([f"{d[:4]}-{d[4:6]}-{d[6:]}", round(v, 1)])
    return col, head, out


def collect_sites(cfg, dbg):
    files = listing()
    st_file = next((f for f in files if "station" in f.lower() and f.lower().endswith((".txt", ".csv"))), None)
    if not st_file:
        raise RuntimeError("no station list in the DWD directory")
    stations = parse_stations(get(DWD + st_file).decode("latin-1"))
    data_files = {}
    for f in files:
        m = re.search(r"_(\d{3,5})\.(txt\.gz|zip|txt|csv\.gz)$", f)
        if m:
            data_files[int(m.group(1))] = f
    dbg.append({"dwdStationList": st_file, "stations": len(stations), "dataFiles": len(data_files), "sample": files[:6]})
    soil = cfg.get("soil", {})
    out, cache = [], {}
    for s in cfg.get("sites", []):
        cand = sorted(((km((s["lat"], s["lon"]), v[:2]), sid, v) for sid, v in stations.items() if sid in data_files), key=lambda x: x[0])
        if not cand:
            raise RuntimeError("no DWD station with data found")
        dist, sid, (lat, lon, name) = cand[0]
        try:
            if sid not in cache:
                cache[sid] = read_soil(get(DWD + data_files[sid]), data_files[sid], soil.get("columns", []))
            col, head, series = cache[sid]
        except Exception as exc:  # noqa: BLE001
            dbg.append({"site": s["id"], "station": sid, "error": str(exc)[:200]})
            continue
        dbg.append({"site": s["id"], "station": sid, "name": name, "km": round(dist, 1), "column": col, "header": head[:30], "points": len(series)})
        out.append({"id": s["id"], "name": s["name"], "district": s.get("district", ""), "station": {"id": sid, "name": name, "km": round(dist)},
                    "param": col, "unit": "% nFK", "series": series[-500:]})
    if not out:
        raise RuntimeError("no soil-moisture file could be read (see data/debug/water.json)")
    return out


def main():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    prev_g = {g["id"]: g for g in prev.get("gauges", [])}
    keep_from = (date.today() - timedelta(days=int(cfg.get("historyDays", 1095)))).isoformat()
    dbg, log, bad = [], [], []
    out = {"_comment": "Written by scripts/collect_water.py – do not edit by hand.", "gauges": [], "sites": prev.get("sites", []),
           "soil": {k: v for k, v in cfg.get("soil", {}).items() if k in ("dry", "veryDry")}}

    try:
        stations = get_json(f"{PEGEL}/stations.json")
    except Exception as exc:  # noqa: BLE001
        stations = None
        bad.append("PEGELONLINE: " + str(exc)[:80])
    for g in cfg.get("gauges", []):
        if stations is None:
            if g["id"] in prev_g:
                out["gauges"].append(prev_g[g["id"]])
            continue
        try:
            out["gauges"].append(collect_gauge(g, stations, prev_g.get(g["id"], {}), keep_from, dbg))
            log.append(f"{g['id']}: ok")
        except Exception as exc:  # noqa: BLE001
            bad.append(f"{g['id']}: {str(exc)[:80]}")
            if g["id"] in prev_g:
                out["gauges"].append(prev_g[g["id"]])

    try:
        out["sites"] = collect_sites(cfg, dbg)
        log.append(f"soil: {len(out['sites'])} sites")
    except Exception as exc:  # noqa: BLE001
        bad.append("DWD soil: " + str(exc)[:100])

    out["updated"] = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None).isoformat()
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    DEBUG.parent.mkdir(parents=True, exist_ok=True)
    DEBUG.write_text(json.dumps({"at": out["updated"], "log": log, "failed": bad, "details": dbg}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n_ok = len(out["gauges"]) + len(out["sites"])
    status = "ok" if not bad else ("warn" if n_ok else "error")
    report_status("water", "River levels & soil moisture", status,
                  f"{len(out['gauges'])} gauges · {len(out['sites'])} sites" + (" · failed: " + "; ".join(bad[:2]) if bad else ""), order=38)
    print("\n".join(log + ["FAILED " + b for b in bad]))


if __name__ == "__main__":
    main()
