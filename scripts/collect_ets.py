#!/usr/bin/env python3
"""Collect EU ETS verified emissions for the peer companies into data/peer_emissions.json.

Source: the European Commission's yearly "verified emissions" file from the Union Registry
(one row per installation, one column per year; CC BY 4.0). The script finds the newest file
on the Union Registry page by itself; if that fails it uses the fallback link in
config/peer_installations.json. The file only changes once a year (April), so the script
skips the download when it has already processed the newest file.

Installations are assigned to companies with the name patterns and include/exclude lists in
config/peer_installations.json. Every matched installation is written to the output, so the
team can check the assignment on the Peers page.
"""
import io
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from status_util import report as report_status

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "peer_installations.json"
OUT = ROOT / "data" / "peer_emissions.json"
UA = "Mozilla/5.0 (compatible; ESG-Radar/1.0)"

# Activity codes used in the Union Registry (Phase III/IV), for display only
ACTIVITY = {
    "20": "Combustion of fuels", "21": "Refining of mineral oil", "29": "Cement clinker", "30": "Lime", "31": "Glass",
    "32": "Ceramics", "35": "Pulp production", "36": "Paper or cardboard production",
    "9": "Pulp, paper and board",
}


def get(url, timeout=120):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def find_newest_file(page_url):
    """Return (year, absolute URL) of the newest verified_emissions_YYYY file linked on the page."""
    html = get(page_url, timeout=60).decode("utf-8", "replace")
    best = None
    for href in re.findall(r'href="([^"]+)"', html):
        href = href.replace("&amp;", "&")
        m = re.search(r"filename=verified_emissions_(\d{4})[^\"&]*\.xlsx", href)
        if m:
            year = int(m.group(1))
            url = href if href.startswith("http") else "https://climate.ec.europa.eu" + href
            if not best or year > best[0]:
                best = (year, url)
    if not best:
        raise RuntimeError("no verified_emissions link found on the page")
    return best


def norm(h):
    return re.sub(r"[^A-Z0-9]+", "_", str(h or "").strip().upper()).strip("_")


def read_rows(xlsx_bytes):
    """Yield dicts per installation from the first sheet that has an INSTALLATION_NAME header."""
    from openpyxl import load_workbook  # installed by the workflow

    wb = load_workbook(io.BytesIO(xlsx_bytes), read_only=True, data_only=True)
    for ws in wb.worksheets:
        header = None
        for row in ws.iter_rows(values_only=True):
            if header is None:
                names = [norm(c) for c in row]
                if "INSTALLATION_NAME" in names:
                    header = names
                continue
            if not any(c not in (None, "") for c in row):
                continue
            yield dict(zip(header, row))
        if header is not None:
            return
    raise RuntimeError("no sheet with an INSTALLATION_NAME column")


def num(v):
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v) if v >= 0 else None          # -1 etc. = not reported
    s = str(v).strip().replace(" ", "").replace(",", "")
    try:
        f = float(s)
        return f if f >= 0 else None
    except ValueError:
        return None                                   # "Excluded", "" …


def pick(row, *candidates):
    for c in candidates:
        if row.get(c) not in (None, ""):
            return row[c]
    return None


def main():
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    src = config["source"]
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    now = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None).isoformat()
    log = []

    try:
        year, url = find_newest_file(src["page"])
        log.append(f"Newest file on the Union Registry page: {year}")
    except Exception as exc:  # noqa: BLE001
        m = re.search(r"verified_emissions_(\d{4})", src["fallback"])
        year, url = (int(m.group(1)) if m else 0), src["fallback"]
        log.append(f"Page not readable ({str(exc)[:100]}); using the fallback link ({year})")

    config_stamp = json.dumps([config["companies"], config.get("fromYear"), config.get("excludeRegistries"), "v2-allocation"], sort_keys=True)
    if old.get("source", {}).get("url") == url and old.get("configStamp") == config_stamp and old.get("companies"):
        log.append("Already processed this file with the same mapping – nothing to do.")
        return finish(log)

    try:
        rows = list(read_rows(get(url)))
    except Exception as exc:  # noqa: BLE001 - keep the previous data
        log.append(f"⚠️ Download or parsing failed: {str(exc)[:200]} – previous data kept.")
        return finish(log)

    year_cols, alloc_cols = {}, {}
    for key in rows[0] if rows else {}:
        m = re.fullmatch(r"VERIFIED_EMISSIONS_?(\d{4})", key)
        if m:
            if int(m.group(1)) >= config.get("fromYear", 0):
                year_cols[key] = m.group(1)
        m2 = re.fullmatch(r"ALLOCATION_?(\d{4})", key)   # total free allocation of the year (not reserve/transitional columns)
        if m2 and int(m2.group(1)) >= config.get("fromYear", 0):
            alloc_cols[key] = m2.group(1)
    if not year_cols:
        log.append("⚠️ No VERIFIED_EMISSIONS_<year> columns found – previous data kept. Columns: " + ", ".join(list(rows[0])[:25]))
        return finish(log)
    holder_cols = [k for k in (rows[0] if rows else {}) if "ACCOUNT_HOLDER" in k and "NAME" in k]

    skip_registries = set(config.get("excludeRegistries", []))
    companies = {}
    for cid, rule in config["companies"].items():
        pats = [re.compile(p, re.IGNORECASE) for p in rule.get("patterns", [])]
        include, exclude = set(rule.get("include", [])), set(rule.get("exclude", []))
        found = []
        for r in rows:
            country = str(pick(r, "REGISTRY_CODE", "COUNTRY_CODE", "COUNTRY") or "").strip()
            inst = pick(r, "INSTALLATION_IDENTIFIER", "INSTALLATION_ID", "IDENTIFIER_IN_REG")
            if isinstance(inst, float) and inst.is_integer():
                inst = int(inst)
            key = f"{country}-{inst}"
            if country in skip_registries and key not in include:
                continue
            name = str(r.get("INSTALLATION_NAME") or "").strip()
            holder = " ".join(str(r.get(h) or "") for h in holder_cols).strip()
            text = f"{name} {holder}"
            if key in exclude:
                continue
            if key not in include and not any(p.search(text) for p in pats):
                continue
            em = {y: num(r.get(col)) for col, y in year_cols.items()}
            em = {y: v for y, v in em.items() if v is not None}
            al = {y: num(r.get(col)) for col, y in alloc_cols.items()}
            al = {y: v for y, v in al.items() if v is not None}
            if not em:
                continue
            act = str(pick(r, "MAIN_ACTIVITY_TYPE_CODE", "ACTIVITY_TYPE_CODE", "MAIN_ACTIVITY_TYPE", "ACTIVITY_TYPE") or "").strip()
            act = act[:-2] if act.endswith(".0") else act
            found.append({
                "key": key, "country": country, "name": name, "holder": holder or None,
                "city": (str(r.get("CITY") or "").strip() or None),
                "activity": ACTIVITY.get(act, act or None),
                "emissions": dict(sorted(em.items())),
                "allocation": dict(sorted(al.items())),
            })
        found.sort(key=lambda i: -max(i["emissions"].values()))
        totals, reporting, alloc = {}, {}, {}
        for i in found:
            for y, v in i.get("allocation", {}).items():
                alloc[y] = alloc.get(y, 0.0) + v
            for y, v in i["emissions"].items():
                totals[y] = totals.get(y, 0.0) + v
                reporting[y] = reporting.get(y, 0) + 1
        # reporting = how many of the matched installations have a value that year (gaps make totals jump)
        companies[cid] = {"installations": found, "total": dict(sorted(totals.items())), "reporting": dict(sorted(reporting.items())),
                          "allocation": dict(sorted(alloc.items()))}
        log.append(f"{cid}: {len(found)} installation(s)")

    years = sorted({y for c in companies.values() for y in c["total"]})
    out = {
        "updated": now,
        "source": {"year": year, "url": url, "page": src["page"], "attribution": src["attribution"]},
        "configStamp": config_stamp,
        "years": years,
        "companies": companies,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    log.append(f"Written: {len(years)} year(s), {sum(len(c['installations']) for c in companies.values())} installations")
    return finish(log)


def finish(log):
    bad = [line for line in log if line.startswith("⚠️")]
    report_status("ets", "Peer emissions (EU ETS)", "warn" if bad else "ok",
                  bad[-1][2:].strip() if bad else next((l for l in reversed(log) if l.startswith(("Written", "Already"))), "ok"), order=40)
    text = "## EU ETS peer emissions\n\n" + "\n".join("- " + line for line in log)
    print(text)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as fh:
            fh.write(text + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
