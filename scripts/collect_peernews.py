#!/usr/bin/env python3
"""Collect the latest headlines per peer company into data/peer_news.json.

Source: Google News RSS search (free, no key, not officially documented by Google – if the format
changes, the previous headlines stay and the status dot turns amber). Searches are set in
config/peer_news.json. Only headline, outlet, date and link are stored.
"""
import json
import re
import sys
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path

import feedparser

from status_util import report as report_status

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "peer_news.json"
OUT = ROOT / "data" / "peer_news.json"
UA = "Mozilla/5.0 (compatible; ESG-Radar/1.0)"
LOCALES = {"en": ("en-US", "US", "US:en"), "de": ("de", "DE", "DE:de")}


def feed_url(q, lang, days):
    hl, gl, ceid = LOCALES.get(lang, LOCALES["en"])
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": f"{q} when:{days}d", "hl": hl, "gl": gl, "ceid": ceid})


def main():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"companies": {}}
    days, limit = cfg.get("days", 60), cfg.get("maxPerCompany", 4)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    out, failed, total = {}, [], 0
    for cid, searches in cfg["companies"].items():
        items, seen = [], set()
        ok = False
        for sdef in searches:
            try:
                parsed = feedparser.parse(feed_url(sdef["q"], sdef.get("lang", "en"), days), agent=UA)
                if parsed.bozo and not parsed.entries:
                    raise RuntimeError(str(parsed.get("bozo_exception", "unreadable")))
                ok = True
            except Exception as exc:  # noqa: BLE001
                failed.append(f"{cid} ({str(exc)[:50]})")
                continue
            for e in parsed.entries:
                title = re.sub(r"\s+", " ", e.get("title", "")).strip()
                source = (e.get("source") or {}).get("title") if isinstance(e.get("source"), dict) else None
                if source and title.endswith(" - " + source):
                    title = title[: -len(source) - 3]
                key = re.sub(r"[^a-z0-9]", "", title.lower())[:80]
                if not title or key in seen:
                    continue
                pub = e.get("published_parsed")
                when = datetime(*pub[:6], tzinfo=timezone.utc) if pub else None
                if when and when < cutoff:
                    continue
                seen.add(key)
                items.append({"title": title, "source": source, "url": e.get("link"), "date": when.date().isoformat() if when else None})
        if not ok:
            out[cid] = old.get("companies", {}).get(cid, [])
            continue
        items.sort(key=lambda i: i["date"] or "", reverse=True)
        out[cid] = items[:limit]
        total += len(out[cid])
    OUT.write_text(json.dumps({
        "updated": datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None).isoformat(),
        "source": "Google News search (headlines link to the original outlet)",
        "companies": out,
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n = len(cfg["companies"])
    status = "error" if len(failed) >= n else "warn" if failed else "ok"
    report_status("peernews", "Peer news", status, f"{total} headlines for {n} companies" + (" · failed: " + ", ".join(failed[:3]) if failed else ""), order=46)
    print("Peer news:", total, "headlines;", failed or "no failures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
