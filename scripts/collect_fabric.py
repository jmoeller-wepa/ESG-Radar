#!/usr/bin/env python3
"""Collect planned Microsoft Fabric / Power BI features for the "Coming next" tab (Data & AI).

Source: Fabric GPS (https://www.fabric-gps.com), a free community mirror of Microsoft's
official Fabric roadmap (aka.ms/FabricRoadmap). It is not run by Microsoft; the page says so.
If it is unavailable, the previous list is kept and the status dot turns amber.
"""
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from status_util import report as report_status

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "fabric_roadmap.json"
API = "https://www.fabric-gps.com/api/releases"
UA = "ESG-Radar/1.0"

# Product (Fabric roadmap) -> tool filter on the News page
TOOL = {
    "Power BI": "powerbi",
    "Conversational Analytics": "copilot",
    "IQ": "fabric", "OneLake": "fabric", "Data Engineering": "fabric", "Data Factory": "fabric",
    "Data Warehouse": "fabric", "Data Science": "fabric", "Real-Time Intelligence": "fabric",
    "Administration, Governance and Security": "fabric", "Fabric Developer Experiences": "fabric",
    "SQL database": "fabric",
}


def get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def quarter_key(q):
    m = re.match(r"Q([1-4])\s+(\d{4})", q or "")
    return f"{m.group(2)}-{m.group(1)}" if m else "9999"


def main():
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"items": []}
    items, page = [], 1
    try:
        while page <= 20:
            data = get({"release_status": "Planned", "page_size": 200, "page": page, "sort": "release_date"})
            for r in data.get("data", []):
                if r.get("release_status") != "Planned" or r.get("active") is False:
                    continue
                product = r.get("product_name") or ""
                if product not in TOOL:
                    continue
                q = r.get("release_date") or ""
                items.append({
                    "id": r.get("release_item_id"),
                    "name": (r.get("feature_name") or "").strip(),
                    "product": product,
                    "tool": TOOL[product],
                    "type": "GA" if "general" in (r.get("release_type") or "").lower() else "Preview",
                    "quarter": q if re.match(r"Q[1-4]\s+\d{4}", q) else "Later",
                    "desc": re.sub(r"\s+", " ", r.get("feature_description") or "").strip()[:240],
                    "url": r.get("blog_url") or f"https://www.fabric-gps.com/release/{r.get('release_item_id')}",
                })
            if not (data.get("pagination") or {}).get("has_next"):
                break
            page += 1
        if not items:
            raise RuntimeError("no planned features returned")
    except Exception as exc:  # noqa: BLE001
        report_status("fabric", "Fabric roadmap", "warn", f"failed: {str(exc)[:120]} – showing the last list", order=50)
        print("Fabric roadmap failed:", exc)
        return 0
    # this year's past quarters are no longer "coming next"
    now = datetime.now(timezone.utc)
    current = f"{now.year}-{(now.month - 1) // 3 + 1}"
    items = [i for i in items if i["quarter"] == "Later" or quarter_key(i["quarter"]) >= current]
    items.sort(key=lambda i: (quarter_key(i["quarter"]), i["product"], i["name"]))
    OUT.write_text(json.dumps({
        "updated": now.replace(microsecond=0, tzinfo=None).isoformat(),
        "source": {"label": "Fabric GPS – community mirror of Microsoft's Fabric roadmap", "url": "https://www.fabric-gps.com",
                   "official": "https://aka.ms/FabricRoadmap"},
        "items": items,
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    report_status("fabric", "Fabric roadmap", "ok", f"{len(items)} planned features", order=50)
    print("Fabric roadmap:", len(items), "planned features")
    return 0


if __name__ == "__main__":
    sys.exit(main())
