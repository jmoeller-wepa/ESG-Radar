#!/usr/bin/env python3
"""Post the monthly ESG Radar update to a Teams channel via a Workflows webhook.

Needs the environment variable TEAMS_WEBHOOK_URL (a GitHub secret). Without it,
the script does nothing. The webhook comes from the Teams workflow template
"Post to a channel when a webhook request is received".

Posts the high-relevance items added by the latest feed run (data/last_run.json)
plus the next three deadlines. Posts nothing if there are no new high items.
Run locally with --dry-run to print the card instead of sending it.
"""
import json
import os
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AREA_LABEL = {
    "climate": "Climate", "forests": "Forests", "circularity": "Circularity",
    "water": "Water", "people": "People", "reporting": "Reporting", "data": "Data & AI",
}
MAX_ITEMS = 8


def fmt(d):
    y, m, day = (int(x) for x in d[:10].split("-"))
    return date(y, m, day).strftime("%-d %b %Y")


def page_url():
    if os.environ.get("RADAR_URL"):
        return os.environ["RADAR_URL"]
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if "/" in repo:
        owner, name = repo.split("/", 1)
        return f"https://{owner.lower()}.github.io/{name}/"
    return ""


def build_card(radar, last_run):
    added = set(last_run.get("added", []))
    items = [e for e in radar["entries"] if e.get("id") in added and e.get("relevance") == "high"]
    items.sort(key=lambda e: (not e.get("monthlySummary"), e.get("date", "")), reverse=False)
    if not items:
        return None
    today = date.today().isoformat()
    upcoming = sorted(
        (e for e in radar["entries"] if e.get("nextDate") and e["nextDate"] >= today),
        key=lambda e: e["nextDate"],
    )[:3]
    month = date.today().strftime("%B %Y")
    url = page_url()

    body = [
        {"type": "TextBlock", "text": f"ESG Radar · {month} update", "weight": "Bolder", "size": "Medium", "wrap": True},
        {"type": "TextBlock", "text": f"{len(items)} new high-relevance item(s)", "isSubtle": True, "spacing": "None", "wrap": True},
    ]
    for e in items[:MAX_ITEMS]:
        area = AREA_LABEL.get((e.get("areas") or ["data"])[0], "")
        body.append({
            "type": "TextBlock",
            "text": f"**{area}** · [{e['title']}]({e['url']})  \n{e.get('source', '')}",
            "wrap": True, "spacing": "Small",
        })
    if len(items) > MAX_ITEMS:
        body.append({"type": "TextBlock", "text": f"+{len(items) - MAX_ITEMS} more on the radar", "isSubtle": True, "wrap": True})
    if upcoming:
        body.append({"type": "TextBlock", "text": "Next deadlines", "weight": "Bolder", "color": "Attention", "spacing": "Medium"})
        body.append({"type": "FactSet", "facts": [
            {"title": fmt(e["nextDate"]), "value": e.get("nextDateLabel") or e["title"]} for e in upcoming
        ]})
    card = {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard", "version": "1.4", "body": body,
    }
    if url:
        card["actions"] = [
            {"type": "Action.OpenUrl", "title": "Open ESG Radar", "url": url},
            {"type": "Action.OpenUrl", "title": "Monthly updates", "url": url.rstrip("/") + "/news.html#area=data&type=monthly"},
        ]
    return {"type": "message", "attachments": [
        {"contentType": "application/vnd.microsoft.card.adaptive", "contentUrl": None, "content": card}
    ]}


def main():
    dry = "--dry-run" in sys.argv
    webhook = os.environ.get("TEAMS_WEBHOOK_URL", "").strip()
    if not webhook and not dry:
        print("TEAMS_WEBHOOK_URL not set – Teams post skipped.")
        return 0
    radar = json.loads((ROOT / "data" / "radar.json").read_text(encoding="utf-8"))
    lr_path = ROOT / "data" / "last_run.json"
    last_run = json.loads(lr_path.read_text(encoding="utf-8")) if lr_path.exists() else {}
    payload = build_card(radar, last_run)
    if payload is None:
        print("No new high-relevance items – nothing posted.")
        return 0
    if dry:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0
    req = urllib.request.Request(webhook, data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"Teams post sent (HTTP {resp.status}).")
    except Exception as exc:  # noqa: BLE001 - never fail the whole run because of Teams
        print(f"::warning::Teams post failed: {exc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
