"""Collect heat, rain, soil moisture and river levels at WEPA's mills outside Germany (data/sites_intl.json),
for Energy & climate › Water & weather. Sites and gauges: config/sites_intl.json.

Weather and soil – Copernicus ERA5-Land hourly time series (dataset reanalysis-era5-land-timeseries, CC BY 4.0):
  2 m temperature, total precipitation and volumetric soil water (levels 1–3 = 0–100 cm) at the grid point
  nearest to each mill. The data runs about a week behind. Needs a free key from the Copernicus Climate Data
  Store as GitHub secret CDS_KEY (and the dataset licence accepted once on the dataset page).
  Per mill: hot days (daily max >= 30 °C) since 1 January vs. normal, rain in the last 30 days in % of normal,
  12-week strip (same rules as the German mills, see collect_weather.py) and soil moisture in % of the normal
  for the day of the year. Normals (1991–2020) are loaded once per mill and kept in data/sites_intl.json.

River levels – national open services, no key:
  hubeau (France, Hub'Eau hydrométrie), imgw (Poland, IMGW-PIB), rws (Netherlands, Rijkswaterstaat), ea (England,
  Environment Agency flood monitoring). Daily means are added to the history kept in data/sites_intl.json.

Diagnostics: data/debug/sites_intl.json.
"""
import csv
import io
import json
import math
import os
import re
import tempfile
import unicodedata
import urllib.parse
import urllib.request
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from status_util import report as report_status
from collect_weather import normals as weather_normals, site_summary, doy, HOT, NORMAL

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "sites_intl.json"
OUT = ROOT / "data" / "sites_intl.json"
DEBUG = ROOT / "data" / "debug" / "sites_intl.json"
UA = "Mozilla/5.0 (compatible; ESG-Radar/1.0)"
CDS_URL = "https://cds.climate.copernicus.eu/api"
DATASET = "reanalysis-era5-land-timeseries"
VARS = ["2m_temperature", "total_precipitation", "volumetric_soil_water_level_1", "volumetric_soil_water_level_2", "volumetric_soil_water_level_3"]
LAYERS = (7, 21, 72)          # cm thickness of ERA5-Land soil levels 1–3 (0–7, 7–28, 28–100 cm)
RECENT_DAYS = 430
GAUGE_DAYS = 400


# ---------- helpers ----------
def get(url, timeout=90, data=None, headers=None):
    h = {"User-Agent": UA, "Accept": "application/json"}
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h, method="POST" if data is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def get_json(url, **kw):
    return json.loads(get(url, **kw).decode("utf-8"))


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def plain(s):
    return unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().upper()


def num(v):
    try:
        f = float(str(v).replace(",", "."))
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


# ---------- ERA5-Land ----------
def cds_client():
    key = os.environ.get("CDS_KEY", "").strip()
    if not key:
        raise RuntimeError("GitHub secret CDS_KEY is not set")
    import cdsapi  # installed by the workflow (pip install cdsapi)
    return cdsapi.Client(url=CDS_URL, key=key, quiet=True, progress=False)


def read_tables(raw):
    """CSV answer (plain or zipped, one or several files) -> list of csv.DictReader rows per file."""
    texts = []
    if raw[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            texts = [z.read(n).decode("utf-8", "replace") for n in z.namelist() if n.lower().endswith((".csv", ".txt"))]
    else:
        texts = [raw.decode("utf-8", "replace")]
    out = []
    for t in texts:
        lines = [l for l in t.splitlines() if l.strip() and not l.startswith("#")]
        out.append(list(csv.DictReader(lines)))
    return out


COLS = {"t2m": ("t2m", "2m_temperature", "temperature"), "tp": ("tp", "total_precipitation", "precipitation"),
        "sw1": ("swvl1", "volumetric_soil_water_level_1", "layer_1", "level_1"), "sw2": ("swvl2", "volumetric_soil_water_level_2", "level_2"),
        "sw3": ("swvl3", "volumetric_soil_water_level_3", "level_3")}


def hourly(raw):
    """-> {iso hour: {t2m, tp, sw1, sw2, sw3}} merged over all files of the answer."""
    rows = {}
    for table in read_tables(raw):
        if not table:
            continue
        keys = list(table[0].keys())
        tk = next((k for k in keys if "time" in k.lower() or k.lower() in ("date", "datetime")), None)
        if not tk:
            continue
        found = {}
        for name, cands in COLS.items():
            k = next((k for k in keys for c in cands if k.lower() == c), None) or next((k for k in keys for c in cands if c in k.lower()), None)
            if k:
                found[name] = k
        for r in table:
            t = (r.get(tk) or "").replace("T", " ")[:13]
            if len(t) < 13:
                continue
            d = rows.setdefault(t, {})
            for name, k in found.items():
                v = num(r.get(k))
                if v is not None:
                    d[name] = v
    return rows


def daily(hours):
    """Hourly ERA5-Land -> {date: (tmax °C, rain mm)} and {date: soil m³/m³ (0–100 cm)}.
    Precipitation in ERA5-Land is often accumulated from 00 UTC; detected per series and de-accumulated."""
    by = {}
    for t, v in hours.items():
        by.setdefault(t[:10], []).append((int(t[11:13]), v))
    days = sorted(by)
    # accumulated? within a day (01..23 UTC) the values never go down
    rising = total = 0
    for d in days:
        tp = [v.get("tp") for h, v in sorted(by[d]) if h >= 1 and v.get("tp") is not None]
        if len(tp) > 3:
            total += 1
            rising += all(b >= a - 1e-9 for a, b in zip(tp, tp[1:]))
    accumulated = total and rising / total > 0.9
    rec, soil = {}, {}
    for n, d in enumerate(days):
        hs = sorted(by[d])
        tx = [v["t2m"] for h, v in hs if v.get("t2m") is not None]
        if accumulated:
            nxt = by.get((date.fromisoformat(d) + timedelta(days=1)).isoformat(), [])
            at0 = next((v.get("tp") for h, v in nxt if h == 0 and v.get("tp") is not None), None)
            day_tp = [v.get("tp") for h, v in hs if h >= 1 and v.get("tp") is not None]
            rr = at0 if at0 is not None else (max(day_tp) if len(day_tp) >= 23 else None)
        else:
            vals = [v.get("tp") for h, v in hs if v.get("tp") is not None]
            rr = sum(vals) if len(vals) >= 20 else None
        tmax = max(tx) - 273.15 if len(tx) >= 20 and max(tx) > 150 else (max(tx) if len(tx) >= 20 else None)
        rec[d] = (round(tmax, 1) if tmax is not None else None, round(max(0.0, rr) * 1000, 1) if rr is not None else None)
        sw = [(v.get("sw1"), v.get("sw2"), v.get("sw3")) for h, v in hs]
        sw = [x for x in sw if None not in x]
        if sw:
            soil[d] = round(sum((LAYERS[0] * a + LAYERS[1] * b + LAYERS[2] * c) / 100 for a, b, c in sw) / len(sw), 4)
    return rec, soil, bool(accumulated)


def era5(client, s, start, end, tmpdir):
    target = Path(tmpdir) / f"{s['id']}_{start}.dat"
    client.retrieve(DATASET, {"variable": VARS, "location": {"latitude": s["lat"], "longitude": s["lon"]},
                              "date": [f"{start}/{end}"], "data_format": "csv"}, str(target))
    return hourly(target.read_bytes())


def soil_normals(soil):
    """Mean soil moisture per day of year (±7 days smoothed) for the normal period."""
    acc = {k: [] for k in range(1, 366)}
    for d, v in soil.items():
        if NORMAL[0] <= int(d[:4]) <= NORMAL[1]:
            acc[doy(d)].append(v)
    daily_ = [sum(v) / len(v) if v else None for k, v in sorted(acc.items())]
    out = []
    for i in range(365):
        win = [daily_[(i + j) % 365] for j in range(-7, 8) if daily_[(i + j) % 365] is not None]
        out.append(round(sum(win) / len(win), 4) if win else None)
    return out


def weather_site(client, s, norm, tmpdir, dbg):
    end = date.today() - timedelta(days=6)
    start = date.today() - timedelta(days=RECENT_DAYS)
    hours, last_err = None, None
    for e in (end, end - timedelta(days=4), end - timedelta(days=10)):   # the newest days may not be published yet
        try:
            hours = era5(client, s, start.isoformat(), e.isoformat(), tmpdir)
            if hours:
                break
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)[:160]
    if not hours:
        raise RuntimeError("ERA5-Land: " + (last_err or "empty answer"))
    rec, soil, acc = daily(hours)
    dbg["recentDays"], dbg["precipAccumulated"] = len(rec), acc
    if not norm:
        try:
            hist = None
            for y0 in (NORMAL[0], NORMAL[1] - 9):   # 30 years; if the request is too large, the last 10 of them
                try:
                    hist = era5(client, s, f"{y0}-01-01", f"{NORMAL[1]}-12-31", tmpdir)
                    if hist:
                        break
                except Exception as exc:  # noqa: BLE001
                    dbg.setdefault("normalsTries", []).append(f"{y0}: {str(exc)[:100]}")
            if not hist:
                raise RuntimeError("no history for the normals")
            hrec, hsoil, _ = daily(hist)
            wn = weather_normals(hrec)
            norm = {"rainPerDay": wn["rainPerDay"], "hotDaysCum": wn["hotDaysCum"], "years": wn["years"], "soilPerDay": soil_normals(hsoil)}
            dbg["normalYears"] = wn["years"]
        except Exception as exc:  # noqa: BLE001
            dbg["normalsError"] = str(exc)[:160]
            norm = None
    summ = site_summary(s, rec, norm)
    sp = (norm or {}).get("soilPerDay")
    series = []
    for d in sorted(soil):
        n = sp[doy(d) - 1] if sp else None
        series.append([d, round(100 * soil[d] / n) if n else None, round(100 * soil[d], 1)])
    summ["soil"] = series[-400:]   # [date, % of normal, volumetric %]
    return summ, norm


# ---------- river gauges ----------
def daily_means(points):
    by = {}
    for t, v in points:
        if v is not None and t:
            by.setdefault(t[:10], []).append(v)
    return {d: round(sum(v) / len(v), 1) for d, v in by.items()}


def gauge_hubeau(s, g, dbg):
    base = "https://hubeau.eaufrance.fr/api/v2/hydrometrie/"
    r = float(g.get("maxKm", 20)) / 80
    bbox = f"{s['lon'] - r * 1.5:.3f},{s['lat'] - r:.3f},{s['lon'] + r * 1.5:.3f},{s['lat'] + r:.3f}"
    st = get_json(base + "referentiel/stations?" + urllib.parse.urlencode({"bbox": bbox, "en_service": "true", "format": "json", "size": 200})).get("data") or []
    river = plain(g.get("river"))
    cand = []
    for x in st:
        la, lo = num(x.get("latitude_station")), num(x.get("longitude_station"))
        if la is None or lo is None or (river and river not in plain(x.get("libelle_cours_eau"))):
            continue
        cand.append((km((s["lat"], s["lon"]), (la, lo)), x))
    cand = sorted([c for c in cand if c[0] <= float(g.get("maxKm", 20))], key=lambda c: c[0])
    dbg["candidates"] = [f"{x.get('code_station')} {x.get('libelle_station')} ({x.get('libelle_cours_eau')}, {d:.1f} km)" for d, x in cand[:6]]
    for dist, x in cand[:4]:
        url = base + "observations_tr?" + urllib.parse.urlencode({"code_entite": x["code_station"], "grandeur_hydro": "H", "size": 20000, "fields": "date_obs,resultat_obs"})
        pts = []
        for _ in range(6):
            ans = get_json(url, timeout=120)
            pts += [(o.get("date_obs"), num(o.get("resultat_obs"))) for o in ans.get("data") or []]
            url = ans.get("next")
            if not url:
                break
        days = {d: round(v / 10, 1) for d, v in daily_means(pts).items()}   # mm -> cm
        if days:
            return {"name": x.get("libelle_station"), "river": x.get("libelle_cours_eau"), "code": x["code_station"], "km": round(dist, 1),
                    "source": "Hub'Eau (Eaufrance)", "link": "https://www.vigicrues.gouv.fr/", "days": days}
    raise RuntimeError("no Hub'Eau gauge with water levels within %s km" % g.get("maxKm", 20))


def gauge_imgw(s, g, dbg):
    rows = get_json("https://danepubliczne.imgw.pl/api/data/hydro")
    m = plain(g.get("match"))
    pick = None
    if m:
        pick = next(((0.0, x) for x in rows if m in plain(x.get("stacja"))), None)
    if not pick:
        near = []
        for x in rows:
            la, lo = num(x.get("lat")), num(x.get("lon"))
            if la is not None and lo is not None:
                near.append((km((s["lat"], s["lon"]), (la, lo)), x))
        near = sorted([n for n in near if n[0] <= float(g.get("maxKm", 25))], key=lambda n: n[0])
        pick = near[0] if near else None
    if not pick:
        raise RuntimeError("no IMGW gauge found")
    dist, x = pick
    la, lo = num(x.get("lat")), num(x.get("lon"))
    if la is not None and lo is not None:
        dist = km((s["lat"], s["lon"]), (la, lo))
    t, v = (x.get("stan_wody_data_pomiaru") or "")[:10], num(x.get("stan_wody"))
    dbg["picked"] = {k: x.get(k) for k in ("id_stacji", "stacja", "rzeka", "stan_wody", "stan_wody_data_pomiaru")}
    if not t or v is None:
        raise RuntimeError("IMGW gauge without a current water level")
    return {"name": (x.get("stacja") or "").title(), "river": (x.get("rzeka") or "").title(), "code": x.get("id_stacji"), "km": round(dist, 1),
            "source": "IMGW-PIB", "link": "https://hydro.imgw.pl/", "days": {t: v}}


def gauge_rws(s, g, dbg):
    base = "https://ddapi20-waterwebservices.rijkswaterstaat.nl"
    body = json.dumps({"CatalogusFilter": {"Grootheden": True, "Compartimenten": True, "Eenheden": True}}).encode()
    cat = get_json(base + "/METADATASERVICES/OphalenCatalogus", data=body, headers={"Content-Type": "application/json"}, timeout=120)
    locs = cat.get("LocatieLijst") or []
    meta = {m.get("AquoMetadata_MessageID"): m for m in cat.get("AquoMetadataLijst") or []}
    wl = {l.get("Locatie_MessageID") for l in cat.get("AquoMetadataLocatieLijst") or []
          if ((meta.get(l.get("AquoMetaData_MessageID") or l.get("AquoMetadata_MessageID")) or {}).get("Grootheid") or {}).get("Code") == "WATHTE"}
    matches = g.get("match") or []
    matches = [matches] if isinstance(matches, str) else matches
    pick = None
    for mname in matches:
        cands = [l for l in locs if plain(mname) in plain(l.get("Naam")) and (not wl or l.get("Locatie_MessageID") in wl)]
        if cands:
            pick = sorted(cands, key=lambda l: len(l.get("Naam") or ""))[0]
            break
    dbg["candidates"] = [f"{l.get('Code')} {l.get('Naam')}" for l in locs if any(plain(m) in plain(l.get("Naam")) for m in matches)][:10]
    if not pick:
        raise RuntimeError("no Rijkswaterstaat location matches " + ", ".join(matches))
    end = datetime.now(timezone.utc)
    q = {"Locatie": {"Code": pick["Code"]},
         "AquoPlusWaarnemingMetadata": {"AquoMetadata": {"Compartiment": {"Code": "OW"}, "Grootheid": {"Code": "WATHTE"}}},
         "Periode": {"Begindatumtijd": (end - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S.000+00:00"), "Einddatumtijd": end.strftime("%Y-%m-%dT%H:%M:%S.000+00:00")}}
    ans = get_json(base + "/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen", data=json.dumps(q).encode(), headers={"Content-Type": "application/json"}, timeout=120)
    pts = []
    for w in ans.get("WaarnemingenLijst") or []:
        for mm in w.get("MetingenLijst") or []:
            v = num((mm.get("Meetwaarde") or {}).get("Waarde_Numeriek"))
            if v is not None and abs(v) < 9000:
                pts.append((mm.get("Tijdstip") or mm.get("Tijdstempel") or "", v))
    days = daily_means(pts)
    if not days:
        raise RuntimeError("Rijkswaterstaat: no water levels for " + pick.get("Naam", ""))
    la, lo = num(pick.get("Lat")), num(pick.get("Lon"))
    dist = km((s["lat"], s["lon"]), (la, lo)) if la is not None and lo is not None and abs(la) <= 90 else None
    return {"name": pick.get("Naam"), "river": "Maas", "code": pick.get("Code"), "km": round(dist, 1) if dist is not None else None,
            "source": "Rijkswaterstaat", "link": "https://waterinfo.rws.nl/", "unit": "cm NAP", "days": days}


def gauge_ea(s, g, dbg):
    base = "https://environment.data.gov.uk/flood-monitoring"
    st = get_json(base + "/id/stations?" + urllib.parse.urlencode({"parameter": "level", "lat": s["lat"], "long": s["lon"], "dist": g.get("maxKm", 10)})).get("items") or []
    cand = sorted(((km((s["lat"], s["lon"]), (num(x.get("lat")), num(x.get("long")))), x) for x in st if num(x.get("lat")) is not None), key=lambda c: c[0])
    dbg["candidates"] = [f"{x.get('stationReference')} {x.get('label')} ({x.get('riverName')}, {d:.1f} km)" for d, x in cand[:6]]
    since = (date.today() - timedelta(days=28)).isoformat()
    for dist, x in cand[:4]:
        ref = x.get("stationReference") or x.get("notation")
        ans = get_json(f"{base}/id/stations/{ref}/readings?" + urllib.parse.urlencode({"since": since, "_sorted": "", "_limit": 10000}), timeout=120)
        items = [i for i in ans.get("items") or [] if "level-stage" in (i.get("measure") or "") or "-level-" in (i.get("measure") or "")]
        days = {d: round(v * 100, 1) for d, v in daily_means([(i.get("dateTime"), num(i.get("value"))) for i in items]).items()}   # m -> cm
        if days:
            low = None
            try:
                det = get_json(f"{base}/id/stations/{ref}").get("items") or {}
                det = det[0] if isinstance(det, list) else det
                low = num((det.get("stageScale") or {}).get("typicalRangeLow")) if isinstance(det.get("stageScale"), dict) else None
            except Exception:  # noqa: BLE001
                pass
            return {"name": x.get("label"), "river": x.get("riverName"), "code": ref, "km": round(dist, 1), "source": "Environment Agency",
                    "link": "https://check-for-flooding.service.gov.uk/river-and-sea-levels", "low": round(low * 100) if low is not None else None, "days": days}
    raise RuntimeError("no Environment Agency level gauge within %s km" % g.get("maxKm", 10))


GAUGES = {"hubeau": gauge_hubeau, "imgw": gauge_imgw, "rws": gauge_rws, "ea": gauge_ea}


# ---------- main ----------
def main():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    prev_sites = {x["id"]: x for x in prev.get("sites", [])}
    prev_norm = prev.get("normals", {})
    dbg, bad, out_sites, norms = [], [], [], dict(prev_norm)
    try:
        client = cds_client()
    except Exception as exc:  # noqa: BLE001
        client = None
        bad.append("weather: " + str(exc)[:120])
    keep_from = (date.today() - timedelta(days=GAUGE_DAYS)).isoformat()
    with tempfile.TemporaryDirectory() as tmpdir:
        for s in cfg.get("sites", []):
            old = prev_sites.get(s["id"], {})
            row = {"id": s["id"], "name": s["name"], "country": s["country"], "lat": s["lat"], "lon": s["lon"]}
            d = {"site": s["id"]}
            # weather + soil
            if client:
                try:
                    summ, norm = weather_site(client, s, prev_norm.get(s["id"]), tmpdir, d)
                    if norm:
                        norms[s["id"]] = norm
                    row["weather"] = summ
                except Exception as exc:  # noqa: BLE001
                    bad.append(f"{s['id']} weather: {str(exc)[:90]}")
                    d["weatherError"] = str(exc)[:200]
                    if old.get("weather"):
                        row["weather"] = old["weather"]
            elif old.get("weather"):
                row["weather"] = old["weather"]
            # river gauge
            g = s.get("gauge")
            if g:
                gd = {}
                try:
                    res = GAUGES[g["source"]](s, g, gd)
                    hist = {k: v for k, v in ((old.get("gauge") or {}).get("series") or []) if k >= keep_from}
                    if (old.get("gauge") or {}).get("code") != res.get("code"):
                        hist = {}
                    hist.update(res.pop("days"))
                    res["series"] = sorted([k, v] for k, v in hist.items() if k >= keep_from)
                    res.setdefault("unit", "cm")
                    row["gauge"] = res
                    gd["points"] = len(res["series"])
                except Exception as exc:  # noqa: BLE001
                    bad.append(f"{s['id']} river: {str(exc)[:90]}")
                    gd["error"] = str(exc)[:200]
                    if old.get("gauge"):
                        row["gauge"] = old["gauge"]
                d["gauge"] = gd
            dbg.append(d)
            out_sites.append(row)
    out = {"_comment": "Written by scripts/collect_sites_intl.py – do not edit by hand. Weather: Copernicus ERA5-Land (CC BY 4.0). Rivers: Hub'Eau, IMGW-PIB, Rijkswaterstaat, Environment Agency (OGL).",
           "hotThreshold": HOT, "normalPeriod": f"{NORMAL[0]}–{NORMAL[1]}", "soil": cfg.get("soil", {}), "countries": cfg.get("countries", {}),
           "sites": out_sites, "normals": norms}
    out["updated"] = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None).isoformat()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    DEBUG.parent.mkdir(parents=True, exist_ok=True)
    DEBUG.write_text(json.dumps({"at": out["updated"], "failed": bad, "details": dbg}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n_w = sum(1 for x in out_sites if x.get("weather")); n_g = sum(1 for x in out_sites if x.get("gauge"))
    report_status("sites_intl", "Weather & rivers at mills abroad", "ok" if not bad else ("warn" if n_w or n_g else "error"),
                  f"{n_w} sites with weather · {n_g} river gauges" + (" · failed: " + "; ".join(bad[:2]) if bad else ""), order=40)
    print(f"sites abroad: {n_w} weather, {n_g} gauges" + ("; FAILED " + "; ".join(bad) if bad else ""))


if __name__ == "__main__":
    main()
