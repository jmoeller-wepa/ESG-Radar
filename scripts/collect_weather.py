"""Collect heat and rain at the German mills for Energy & climate › Water & weather (data/weather.json).

Source: Deutscher Wetterdienst (DWD) Climate Data Center, daily station observations "kl" (CC BY 4.0):
  TXK = daily maximum air temperature (°C), RSK = daily precipitation (mm).
For each mill in config/water.json the nearest station with recent daily data is used.

Per mill the page shows
  - hot days (TXK >= 30 °C) since 1 January, and the normal number up to the same date (1991–2020),
  - rain in the last 30 days in % of the normal for those 30 days (1991–2020),
  - a 12-week strip: per week dry, hot, dry and hot, or normal.
Normals come from the station's historical file; they are computed once and kept in data/weather.json.
Diagnostics: data/debug/weather.json.
"""
import io
import json
import math
import re
import urllib.request
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from status_util import report as report_status

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "water.json"
OUT = ROOT / "data" / "weather.json"
DEBUG = ROOT / "data" / "debug" / "weather.json"
UA = "Mozilla/5.0 (compatible; ESG-Radar/1.0)"
BASE = "https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily/kl/"
NORMAL = (1991, 2020)
HOT = 30.0


def get(url, timeout=120):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def listing(sub):
    html = get(BASE + sub, timeout=60).decode("utf-8", "replace")
    return re.findall(r'href="([^"?/][^"]*)"', html)


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def stations(text):
    """KL_Tageswerte_Beschreibung_Stationen.txt: id von bis hoehe breite laenge name bundesland (fixed width)."""
    out = {}
    for line in text.splitlines():
        p = line.split()
        if len(p) < 7 or not p[0].isdigit():
            continue
        try:
            lat, lon = float(p[4]), float(p[5])
        except ValueError:
            continue
        rest = p[6:]
        rest = rest[:-2] if len(rest) > 2 and rest[-1].lower() == "frei" else rest[:-1] if len(rest) > 1 else rest  # drop "Bundesland" (and "Abgabe")
        out[int(p[0])] = {"lat": lat, "lon": lon, "to": p[2], "name": " ".join(rest)}
    return out


def read_zip(raw):
    """Product file of a DWD zip -> {date: (txk, rsk)}; -999 = missing."""
    z = zipfile.ZipFile(io.BytesIO(raw))
    inner = next(n for n in z.namelist() if n.lower().startswith("produkt"))
    lines = z.read(inner).decode("latin-1").splitlines()
    head = [h.strip().upper() for h in lines[0].split(";")]
    it, ir, idt = head.index("TXK"), head.index("RSK"), head.index("MESS_DATUM")
    out = {}
    for line in lines[1:]:
        p = [x.strip() for x in line.split(";")]
        if len(p) <= max(it, ir):
            continue
        d = p[idt]
        if not re.fullmatch(r"\d{8}", d):
            continue
        tx, rr = float(p[it]), float(p[ir])
        out[f"{d[:4]}-{d[4:6]}-{d[6:]}"] = (None if tx < -900 else tx, None if rr < -900 else rr)
    return out


def doy(d):
    """Day of year on a 365-day calendar (29 Feb counts as 28 Feb)."""
    y, m, dd = int(d[:4]), int(d[5:7]), int(d[8:10])
    if m == 2 and dd == 29:
        dd = 28
    return (date(2001, m, dd) - date(2001, 1, 1)).days + 1


def normals(hist):
    """Mean daily rain per day of year (smoothed ±7 days) and mean cumulative hot days per day of year, 1991–2020."""
    rain = {k: [] for k in range(1, 366)}
    hot_by_year = {}
    for d, (tx, rr) in hist.items():
        y = int(d[:4])
        if not NORMAL[0] <= y <= NORMAL[1]:
            continue
        k = doy(d)
        if rr is not None:
            rain[k].append(rr)
        if tx is not None:
            hot_by_year.setdefault(y, [0] * 366)
            if tx >= HOT:
                hot_by_year[y][k] += 1
    daily = [sum(v) / len(v) if v else None for k, v in sorted(rain.items())]
    smooth = []
    for i in range(365):
        win = [daily[(i + j) % 365] for j in range(-7, 8) if daily[(i + j) % 365] is not None]
        smooth.append(round(sum(win) / len(win), 3) if win else None)
    years = [c for y, c in hot_by_year.items()]
    cum = []
    for k in range(1, 366):
        cum.append(round(sum(sum(c[1:k + 1]) for c in years) / len(years), 1) if years else None)
    return {"rainPerDay": smooth, "hotDaysCum": cum, "years": len(years)}


def site_summary(s, rec, norm):
    days = sorted(d for d in rec if rec[d][0] is not None or rec[d][1] is not None)
    if not days:
        raise RuntimeError("no recent observations")
    last = days[-1]
    ld = date.fromisoformat(last)
    year0 = f"{ld.year}-01-01"
    hot = sum(1 for d in days if d >= year0 and rec[d][0] is not None and rec[d][0] >= HOT)
    hot_norm = norm["hotDaysCum"][doy(last) - 1] if norm else None
    d30 = [(ld - timedelta(days=i)).isoformat() for i in range(30)]
    r30 = [rec[d][1] for d in d30 if d in rec and rec[d][1] is not None]
    rain30 = round(sum(r30), 1) if len(r30) >= 25 else None
    n30 = round(sum(norm["rainPerDay"][doy(d) - 1] or 0 for d in d30), 1) if norm else None
    # 12 complete weeks ending with the last observed day
    weeks = []
    for w in range(11, -1, -1):
        end = ld - timedelta(days=7 * w)
        span = [(end - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
        tx = [rec[d][0] for d in span if d in rec and rec[d][0] is not None]
        rr = [rec[d][1] for d in span if d in rec and rec[d][1] is not None]
        if len(rr) < 5:
            weeks.append({"start": span[0], "cls": "na"})
            continue
        rain, nrain = sum(rr), (sum(norm["rainPerDay"][doy(d) - 1] or 0 for d in span) if norm else None)
        tmax = max(tx) if tx else None
        dry = rain < 2 or (nrain and rain < 0.25 * nrain)
        hot_w = tmax is not None and tmax >= HOT
        weeks.append({"start": span[0], "rain": round(rain, 1), "rainNormal": round(nrain, 1) if nrain else None,
                      "tmax": tmax, "hotDays": sum(1 for t in tx if t >= HOT),
                      "cls": "dryhot" if dry and hot_w else "dry" if dry else "hot" if hot_w else "ok"})
    return {"last": last, "hotDays": hot, "hotNormal": hot_norm, "rain30": rain30, "rain30Normal": n30,
            "rain30Pct": round(100 * rain30 / n30) if rain30 is not None and n30 else None, "weeks": weeks}


def main():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    prev_norm = prev.get("normals", {})
    dbg, bad, out_sites, norms = [], [], [], {}
    try:
        files = listing("recent/")
        st_file = next(f for f in files if "Beschreibung_Stationen" in f)
        st = stations(get(BASE + "recent/" + st_file).decode("latin-1"))
        recent = {int(m.group(1)): f for f in files for m in [re.search(r"tageswerte_KL_(\d{5})_akt\.zip", f)] if m}
        dbg.append({"stations": len(st), "recentFiles": len(recent)})
    except Exception as exc:  # noqa: BLE001
        st, recent = None, {}
        bad.append("DWD station list: " + str(exc)[:120])
    hist_files = None
    for s in cfg.get("sites", []) if st else []:
        cand = sorted((km((s["lat"], s["lon"]), (v["lat"], v["lon"])), sid, v) for sid, v in st.items() if sid in recent)
        if not cand:
            bad.append(f"{s['id']}: no station")
            continue
        # nearest station first; a station can list a recent file without temperature/rain values -> try the next one (max 30 km)
        rec, tried = None, []
        for dist, sid, info in [c for c in cand[:5] if c[0] <= 30] or cand[:1]:
            try:
                r = read_zip(get(BASE + "recent/" + recent[sid]))
            except Exception as exc:  # noqa: BLE001
                tried.append(f"{sid}: {str(exc)[:60]}")
                continue
            n = sum(1 for v in r.values() if v[0] is not None and v[1] is not None)
            if n >= 60:
                rec = r
                break
            tried.append(f"{sid} {info['name']}: only {n} days with temperature and rain")
        if tried:
            dbg.append({"site": s["id"], "skippedStations": tried})
        try:
            if rec is None:
                raise RuntimeError("no station with recent observations within 30 km")
            nkey = str(sid)
            norm = prev_norm.get(nkey)
            if not norm:
                if hist_files is None:
                    hist_files = listing("historical/")
                hf = next((f for f in hist_files if re.search(rf"tageswerte_KL_{sid:05d}_\d{{8}}_\d{{8}}_hist\.zip", f)), None)
                if hf:
                    norm = normals(read_zip(get(BASE + "historical/" + hf, timeout=300)))
                    if not norm.get("years"):
                        norm = None
                dbg.append({"site": s["id"], "historical": hf, "normalYears": (norm or {}).get("years")})
            if norm:
                norms[nkey] = norm
            summ = site_summary(s, rec, norm)
            out_sites.append({"id": s["id"], "name": s["name"], "station": {"id": sid, "name": info["name"], "km": round(dist)}, **summ})
            dbg.append({"site": s["id"], "station": sid, "name": info["name"], "km": round(dist, 1), "last": summ["last"]})
        except Exception as exc:  # noqa: BLE001
            bad.append(f"{s['id']}: {str(exc)[:100]}")
            old = next((x for x in prev.get("sites", []) if x["id"] == s["id"]), None)
            if old:
                out_sites.append(old)
    out = {"_comment": "Written by scripts/collect_weather.py – do not edit by hand. Source: Deutscher Wetterdienst, CDC (CC BY 4.0).",
           "hotThreshold": HOT, "normalPeriod": f"{NORMAL[0]}–{NORMAL[1]}", "sites": out_sites or prev.get("sites", []),
           "normals": {**prev_norm, **norms}}
    out["updated"] = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None).isoformat()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    DEBUG.parent.mkdir(parents=True, exist_ok=True)
    DEBUG.write_text(json.dumps({"at": out["updated"], "failed": bad, "details": dbg}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    report_status("weather", "Heat & rain at the mills (DWD)", "ok" if not bad else ("warn" if out_sites else "error"),
                  f"{len(out_sites)} sites" + (" · failed: " + "; ".join(bad[:2]) if bad else ""), order=39)
    print(f"weather: {len(out_sites)} sites" + ("; FAILED " + "; ".join(bad) if bad else ""))


if __name__ == "__main__":
    main()
