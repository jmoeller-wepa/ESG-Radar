#!/usr/bin/env python3
"""Collect new items from RSS/Atom feeds into data/radar.json (no manual review needed).

Run by the daily GitHub Action (or locally: python scripts/collect_feeds.py).
- Reads config/feeds.json
- Keeps items newer than the last run whose title/summary match a feed keyword
- Rates them automatically: monthly feature summaries and 'highKeywords' -> high,
  otherwise the feed's defaultRelevance
- Skips items already in radar.json or archive.json (by link)
- Moves feed items older than N days to data/archive.json to keep the page fast
A feed that fails is reported and skipped; it never breaks the run.
"""
import hashlib
import html
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import feedparser

from status_util import report as report_status

ROOT = Path(__file__).resolve().parent.parent
RADAR = ROOT / "data" / "radar.json"
ARCHIVE = ROOT / "data" / "archive.json"
CONFIG = ROOT / "config" / "feeds.json"
USER_AGENT = "Mozilla/5.0 (compatible; ESG-Radar/1.0)"

# Areas for the starter entries (used once, to backfill entries created before areas existed)
STARTER_AREAS = {
    "reg-omnibus-csrd": ["reporting"], "reg-omnibus-csddd": ["people"], "reg-esrs-2026": ["reporting"],
    "reg-voluntary-standard": ["reporting", "people"], "reg-esrs-xbrl": ["reporting", "data"],
    "reg-taxonomy-simplification": ["reporting"], "reg-eudr": ["forests"], "reg-ppwr": ["circularity"],
    "reg-ecgt": ["reporting", "circularity"], "reg-ets-review": ["climate"], "reg-ets2-delay": ["climate"],
    "reg-cbam": ["climate"], "std-sbti-cnzs-v2": ["climate"], "std-ghgp-scope2": ["climate"],
    "bp-stolt-nielsen-csrd": ["reporting"],
}

# Impact categories for the starter entries (backfill); everything else is assigned by keyword
STARTER_IMPACTS = {
    "reg-omnibus-csrd": ["reporting", "datamodel"], "reg-omnibus-csddd": ["suppliers"], "reg-esrs-2026": ["reporting", "datamodel"],
    "reg-voluntary-standard": ["suppliers", "reporting"], "reg-esrs-xbrl": ["datamodel"], "reg-taxonomy-simplification": ["reporting"],
    "reg-eudr": ["suppliers", "datamodel"], "reg-ppwr": ["products"], "reg-ecgt": ["products"], "reg-ets-review": ["costs"],
    "reg-ets2-delay": ["costs"], "reg-cbam": ["watch"], "std-sbti-cnzs-v2": ["reporting"], "std-ghgp-scope2": ["datamodel", "reporting"],
    "tool-msm-2026w1": ["watch"], "bp-stolt-nielsen-csrd": ["reporting"],
}


def load(path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def clean(text, limit=420):
    text = html.unescape(re.sub(r"<[^>]+>", " ", text or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[: limit - 1].rsplit(" ", 1)[0] + "…"


def entry_date(item):
    for key in ("published_parsed", "updated_parsed"):
        value = item.get(key)
        if value:
            return datetime(*value[:6], tzinfo=timezone.utc)
    return None


def matcher(keywords):
    parts = [re.escape(k.strip()) for k in keywords if k.strip()]
    if not parts:
        return None
    pattern = re.compile(r"\b(" + "|".join(parts) + r")\b", re.IGNORECASE)
    return lambda text: sorted({m.lower() for m in pattern.findall(text)})


def tag_name(word):
    return word.upper() if len(word) <= 4 else word.title()


def main():
    config = load(CONFIG, {})
    radar = load(RADAR, {"meta": {}, "entries": []})
    archive = load(ARCHIVE, [])
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    summary_re = re.compile(config.get("monthlySummaryPattern", "feature summary"), re.IGNORECASE)

    last_run = radar["meta"].get("lastFeedRun")
    since = (
        datetime.fromisoformat(last_run).replace(tzinfo=timezone.utc) - timedelta(days=2)
        if last_run
        else now - timedelta(days=config.get("lookbackDaysFirstRun", 45))
    )

    area_matchers = {a: matcher(kws) for a, kws in config.get("areaKeywords", {}).items()}

    def areas_for(feed, text):
        default = feed.get("defaultArea", "reporting")
        if feed.get("onlyDefaultArea"):
            return [default]
        found = [a for a, m in area_matchers.items() if m and m(text)]
        return found[:3] or [default]

    impact_matchers = {k: matcher(v) for k, v in config.get("impactKeywords", {}).items()}

    def impacts_for(text):
        found = [k for k, m in impact_matchers.items() if m and m(text)]
        return found[:2] or ["watch"]

    # Backfill: give older entries (from before areas/impacts existed) their areas and impacts
    for e in radar["entries"]:
        if not e.get("impacts"):
            e["impacts"] = STARTER_IMPACTS.get(e.get("id")) or impacts_for(" ".join(filter(None, [e.get("title"), e.get("summary")])))
    feeds_by_name = {f["name"]: f for f in config.get("feeds", [])}
    for e in radar["entries"]:
        if not e.get("areas") and e.get("id") in STARTER_AREAS:
            e["areas"] = STARTER_AREAS[e["id"]]
        elif not e.get("areas"):
            text = " ".join(filter(None, [e.get("title"), e.get("summary")]))
            feed = feeds_by_name.get(e.get("source")) or {"defaultArea": "data" if e.get("type") == "tool" else "reporting"}
            e["areas"] = areas_for(feed, text)

    known = {e.get("url") for e in radar["entries"]} | {e.get("url") for e in archive}
    # Feeds read before: a feed added later to config/feeds.json reads back 'lookbackDaysFirstRun'
    # days once, so its area is not empty until news arrives (older runs: feeds that already have items)
    seen = set(radar["meta"].get("feedsSeen") or {e.get("source") for e in radar["entries"] + archive if e.get("origin") == "feed"})
    backfill = now - timedelta(days=config.get("lookbackDaysFirstRun", 45))
    report, added = [], []

    for feed in config.get("feeds", []):
        name = feed["name"]
        try:
            parsed = feedparser.parse(feed["url"], agent=USER_AGENT)
            if parsed.bozo and not parsed.entries:
                raise RuntimeError(str(parsed.get("bozo_exception", "")) or "unreadable feed")
        except Exception as exc:  # noqa: BLE001 - report and continue
            reason = clean(str(exc), 120) or type(exc).__name__
            report.append(f"| {name} | ⚠️ failed: {reason} | 0 |")
            continue

        feed_since = since if name in seen else min(since, backfill)
        seen.add(name)
        match = matcher(feed.get("keywords", []))
        match_high = matcher(feed.get("highKeywords", []))
        count = 0
        for item in parsed.entries:
            if count >= feed.get("maxItems", 15):
                break
            link = item.get("link")
            published = entry_date(item)
            if not link or link in known or (published and published < feed_since):
                continue
            title = clean(item.get("title"), 200)
            summary = clean(item.get("summary") or item.get("description"))
            text = f"{title} {summary}"
            is_monthly = bool(summary_re.search(title))
            hits = match(text) if match else []
            if match and not hits and not is_monthly:
                continue

            if is_monthly or (match_high and match_high(text)):
                relevance = "high"
            else:
                relevance = feed.get("defaultRelevance", "medium")
            tags = (["Monthly update"] if is_monthly else []) + [
                tag_name(h) for h in hits if not (is_monthly and h == "feature summary")
            ][:3]

            new = {
                "id": "feed-" + hashlib.sha1(link.encode()).hexdigest()[:10],
                "date": (published or now).date().isoformat(),
                "type": feed.get("type", "tool"),
                "areas": areas_for(feed, text),
                "impacts": impacts_for(text),
                "tags": tags,
                "title": title,
                "summary": summary,
                "whyItMatters": None,
                "status": None,
                "relevance": relevance,
                "monthlySummary": is_monthly,
                "nextDate": None,
                "nextDateLabel": None,
                "source": name,
                "url": link,
                "origin": "feed",
                "added": today,
            }
            radar["entries"].append(new)
            known.add(link)
            added.append(new)
            count += 1
        report.append(f"| {name} | ok ({len(parsed.entries)} items read) | {count} |")

    # Archive old feed items so the page stays focused and fast
    cutoff = (now - timedelta(days=config.get("archiveFeedItemsAfterDays", 365))).date().isoformat()
    keep, moved = [], 0
    for e in radar["entries"]:
        if e.get("origin") == "feed" and e.get("date", today) < cutoff:
            archive.append(e)
            moved += 1
        else:
            keep.append(e)
    radar["entries"] = keep

    radar["meta"]["feedsSeen"] = sorted(n for n in seen if n)
    radar["meta"]["lastFeedRun"] = now.replace(microsecond=0, tzinfo=None).isoformat()
    save(RADAR, radar)
    if archive or ARCHIVE.exists():
        save(ARCHIVE, archive)
    # What this run added (read by scripts/post_teams.py)
    save(ROOT / "data" / "last_run.json", {"date": today, "added": [a["id"] for a in added]})

    lines = [
        f"## ESG Radar feed run – {today}",
        f"**{len(added)} new item(s)** added, {moved} item(s) older than the archive limit moved to archive.json.",
        "",
        "| Feed | Status | New |",
        "|---|---|---|",
        *report,
    ]
    if added:
        lines += ["", "### New items"] + [
            f"- [{a['relevance']}] [{a['title']}]({a['url']}) — {a['source']}" for a in added
        ]
    failed = sum(1 for r in report if "failed" in r)
    total = len(config.get("feeds", []))
    report_status("feeds", "News feeds", "error" if total and failed == total else "warn" if failed else "ok",
                  f"{total - failed} of {total} feeds · {len(added)} new" + (f" · {failed} failed" if failed else ""), order=10)
    text = "\n".join(lines)
    print(text)
    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a", encoding="utf-8") as fh:
            fh.write(text + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
