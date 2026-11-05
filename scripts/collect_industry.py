#!/usr/bin/env python3
"""Industry context for the Market page ('Industry' tab).

Finds the latest monthly 'Statistische Kurzinformation' of DIE PAPIERINDUSTRIE e.V. (PDF, year-to-date
production and sales by paper grade in Germany) and updates the block 'germanyMonthly' in data/industry.json.
All other blocks of that file are yearly figures and are kept as they are.
Needs the package pypdf. Run by the GitHub Action (or locally: python scripts/collect_industry.py).
"""
import io
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from status_util import report as report_status  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "industry.json"
DEBUG = ROOT / "data" / "debug" / "industry.json"
BASE = "https://www.papierindustrie.de/fileadmin/0002-PAPIERINDUSTRIE/07_Dateien/1_Statistik/{y}/{n:02d}_{y}_Statistische_Kurzinformation_D.pdf"
UA = "Mozilla/5.0 (compatible; ESG-Radar/1.0; +https://github.com)"
GRADES = [("total", "Paper, board & cardboard, total", r"insgesamt"), ("graphic", "Graphic papers", r"Grafische"),
          ("packaging", "Packaging papers & board", r"Verpackung"), ("hygiene", "Hygiene papers (tissue)", r"Hygiene"),
          ("technical", "Technical & speciality papers", r"Techni")]
MEASURES = [("production", r"Produktion"), ("sales", r"Gesamtabsatz"), ("domestic", r"Inlandsabsatz"), ("export", r"Auslandsabsatz")]
MONTHS = {"Jan": 1, "Feb": 2, "Mrz": 3, "Mär": 3, "Apr": 4, "Mai": 5, "Jun": 6, "Jul": 7, "Aug": 8, "Sep": 9, "Okt": 10, "Nov": 11, "Dez": 12}
EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def fetch(url, method="GET"):
    req = urllib.request.Request(url, headers={"User-Agent": UA}, method=method)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read() if method == "GET" else b""


def latest_pdf():
    """The files are numbered per year (01, 02 …); the highest existing number is the latest issue."""
    year = datetime.now(timezone.utc).year
    for y in (year, year - 1):
        for n in range(24, 0, -1):
            url = BASE.format(y=y, n=n)
            try:
                fetch(url, "HEAD")
                return url
            except urllib.error.HTTPError:
                continue
            except Exception:  # noqa: BLE001
                continue
    raise RuntimeError("no Statistische Kurzinformation found")


def num(s):
    s = s.replace(".", "").replace(",", ".").replace("−", "-").replace("–", "-")
    return float(s)


def parse(text):
    """Works whether the PDF text keeps table rows on one line or puts every value on its own line."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    flat = " ".join(lines)
    period = re.search(r"Jan\w*\s*[-–]\s*(\w{3})\w*\.?(?:\s+Jan\w*\s*[-–]\s*\w+\.?)*\s+(?:Veränd\.?\s+)?(?:in 1\.000 t\s+)?(\d{4})", flat)
    title = re.search(r"\b(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})\b", flat)
    m = y = None
    if period:
        m, y = MONTHS.get(period.group(1)[:3]), int(period.group(2))
    if (not m or not y) and title:
        names = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]
        m, y = names.index(title.group(1)) + 1, int(title.group(2))
    if not m or not y:
        raise RuntimeError("period not found")
    numre = re.compile(r"^[-−–]?\d{1,3}(?:\.\d{3})*(?:,\d+)?$")
    rows, grade = {}, None
    for k, line in enumerate(lines):
        for key, _, pat in GRADES:
            if re.search(pat, line, re.I) and not numre.search(line.split()[-1]):
                grade = key
        for mk, pat in MEASURES:
            hit = re.match(pat, line)
            if grade and hit:
                vals = re.findall(r"[-−–]?\d{1,3}(?:\.\d{3})*(?:,\d+)?", line[hit.end():])
                j = k + 1
                while len(vals) < 3 and j < len(lines) and numre.match(lines[j]):
                    vals.append(lines[j]); j += 1
                if len(vals) >= 3:
                    rows.setdefault(grade, {})[mk] = [num(vals[0]), num(vals[1]), num(vals[2])]
    if "hygiene" not in rows or "production" not in rows["hygiene"]:
        raise RuntimeError("hygiene paper row not found")
    return f"Jan – {EN[m - 1]} {y}", f"Jan – {EN[m - 1]} {y - 1}", rows


def main():
    data = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    dbg = {"checked": datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None).isoformat()}
    try:
        try:
            import pypdf  # noqa: F401
        except ImportError:
            raise RuntimeError("package pypdf missing – add it to 'pip install' in the workflow")
        from pypdf import PdfReader
        url = latest_pdf()
        dbg["url"] = url
        reader = PdfReader(io.BytesIO(fetch(url)))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        dbg["text"] = text[:3000]
        label, prev, rows = parse(text)
        gm = data.setdefault("germanyMonthly", {})
        gm.update({"period": label, "periodPrev": prev, "auto": True, "fetched": dbg["checked"],
                   "source": {"label": "DIE PAPIERINDUSTRIE e.V., Statistische Kurzinformation", "url": url}})
        names = {k: n for k, n, _ in GRADES}
        gm["rows"] = [{"grade": names[k], "key": k, **rows[k]} for k, _, _ in GRADES if k in rows]
        OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        h = rows["hygiene"]["production"]
        report_status("industry", "Industry statistics", "ok", f"{label}: hygiene paper {h[0]:,.0f} kt ({h[2]:+.1f} %)", order=36)
        print("Industry:", label, rows.get("hygiene"))
    except Exception as exc:  # noqa: BLE001 - keep the previous figures
        dbg["error"] = str(exc)[:300]
        report_status("industry", "Industry statistics", "warn", "monthly update failed: " + str(exc)[:120] + " – showing the previous figures", order=36)
        print("Industry statistics failed:", exc)
    DEBUG.parent.mkdir(parents=True, exist_ok=True)
    DEBUG.write_text(json.dumps(dbg, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
