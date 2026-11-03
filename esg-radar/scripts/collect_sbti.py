#!/usr/bin/env python3
"""Update the SBTi column of data/peers.json from the SBTi Target Dashboard download.

Source: Science Based Targets initiative, "Data by company" (Excel), https://sciencebasedtargets.org/target-dashboard
(credit "Science Based Targets initiative" and link to the dashboard – shown on the Peers page).

Each peer is found with the name patterns in config/sbti.json. If SBTi shows a different
status than the page, the old value moves into the KPI's history (so the trend arrow works)
and the new value is written with the dashboard as source.
"""
import io
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

from status_util import report as report_status

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "sbti.json"
PEERS = ROOT / "data" / "peers.json"
UA = "Mozilla/5.0 (compatible; ESG-Radar/1.0)"
RANK = ["None", "Committed", "Validated", "Net-zero validated"]


def norm(h):
    return re.sub(r"[^a-z0-9]+", "_", str(h or "").strip().lower()).strip("_")


def rows_from(xlsx):
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(xlsx), read_only=True, data_only=True)
    for ws in wb.worksheets:
        header = None
        for row in ws.iter_rows(values_only=True):
            if header is None:
                names = [norm(c) for c in row]
                if any("company" in n and "name" in n for n in names) or "company" in names:
                    header = names
                continue
            if any(c not in (None, "") for c in row):
                yield dict(zip(header, row))
        if header:
            return


def col(row, *must):
    for k, v in row.items():
        if k and all(m in k for m in must):
            return v
    return None


def status_of(row):
    """Map one SBTi company row to the page's scale."""
    near = str(col(row, "near", "status") or col(row, "near_term", "status") or "").lower()
    nz = str(col(row, "net_zero", "status") or col(row, "long", "status") or "").lower()
    overall = str(col(row, "target", "status") or col(row, "status") or "").lower()
    if "targets set" in nz or "target set" in nz:
        return "Net-zero validated"
    if "targets set" in near or "target set" in near or "targets set" in overall:
        return "Validated"
    if "commit" in near or "commit" in nz or "commit" in overall:
        if "removed" in near or "removed" in overall or "expired" in near:
            return "None"
        return "Committed"
    return None


def main():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    peers = json.loads(PEERS.read_text(encoding="utf-8"))
    try:
        req = urllib.request.Request(cfg["download"], headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=120) as resp:
            rows = list(rows_from(resp.read()))
        if not rows:
            raise RuntimeError("no rows with a company name column")
    except Exception as exc:  # noqa: BLE001
        report_status("sbti", "SBTi targets", "warn", f"download failed: {str(exc)[:120]} – values unchanged", order=45)
        print("SBTi download failed:", exc)
        return 0

    today = date.today().isoformat()
    changes, found = [], 0
    for c in peers["companies"]:
        pat = cfg["companies"].get(c["id"])
        if not pat:
            continue
        rx = re.compile(pat, re.IGNORECASE)
        matches = [r for r in rows if rx.search(str(col(r, "company", "name") or r.get("company") or ""))]
        statuses = [s for s in (status_of(r) for r in matches) if s]
        if not statuses:
            continue
        found += 1
        best = max(statuses, key=RANK.index)
        name = str(col(matches[0], "company", "name") or "")
        cell = c["kpis"].get("sbti") or {}
        if cell.get("v") == best:
            continue
        if cell.get("v") is not None:
            hist = cell.get("history", [])
            hist.append({k: cell[k] for k in ("v", "d", "y") if k in cell})
            cell["history"] = hist[-5:]
        cell.update({"v": best, "d": f"{best} · SBTi dashboard ({name})", "y": today[:4], "src": cfg["sourcePage"]})
        c["kpis"]["sbti"] = cell
        changes.append(f"{c['name']}: {best}")

    if changes:
        PEERS.write_text(json.dumps(peers, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report_status("sbti", "SBTi targets", "ok", f"{found} peers found · " + (", ".join(changes) if changes else "no changes"), order=45)
    print("SBTi:", found, "peers found;", changes or "no changes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
