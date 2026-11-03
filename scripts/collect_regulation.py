#!/usr/bin/env python3
"""Collect data for the Regulation page into data/regulation.json.

1. Open EU consultations ("Have your say" portal of the European Commission) that match
   the ESG keywords in config/regulation.json.
2. The latest official steps of the EU procedures linked to the roadmap rows
   (European Parliament Open Data API, CC BY 4.0).
   A new step also becomes a "Status update" entry on the News page (data/radar.json).

The Have your say portal has no documented API; the script reads the same data its
website loads and parses it defensively. If either source fails, the previous values
are kept and the status dot in the page header turns amber.
"""
import hashlib
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

from status_util import report as report_status

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "regulation.json"
FEEDS = ROOT / "config" / "feeds.json"
ROADMAP = ROOT / "data" / "roadmap.json"
RADAR = ROOT / "data" / "radar.json"
OUT = ROOT / "data" / "regulation.json"
DEBUG = ROOT / "data" / "debug" / "consultations.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ESG-Radar/1.0"
EP_UA = "ESG-Radar-prd-1.0"
HYS_API = "https://ec.europa.eu/info/law/better-regulation/brpapi/searchInitiatives"
HYS_PAGE = "https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/{id}_en"
EP_API = "https://data.europarl.europa.eu/api/v2/procedures/{pid}"
OEIL = "https://oeil.secure.europarl.europa.eu/oeil/en/procedure-file?reference={ref}"


def get_json(url, ua=UA, timeout=60, accept="application/json, text/plain, */*"):
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": accept, "Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def iso_date(v):
    """'2026/11/14 23:59:59', '2026-11-14T…', 1763078400000 -> '2026-11-14' (or None)."""
    if v is None:
        return None
    if isinstance(v, (int, float)) and v > 10**11:
        return datetime.fromtimestamp(v / 1000, tz=timezone.utc).date().isoformat()
    m = re.match(r"(\d{4})[-/](\d{2})[-/](\d{2})", str(v))
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None


def human(code):
    code = str(code or "").rsplit("/", 1)[-1].rsplit("#", 1)[-1]
    return code.replace("_", " ").strip().capitalize() if code else ""


def walk(obj):
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from walk(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk(v)


# ---------------- consultations ----------------
def initiatives_from(data):
    """Find the list of initiative objects in a Have your say answer, wherever it sits."""
    emb = data.get("_embedded") if isinstance(data, dict) else None
    if isinstance(emb, dict):
        for v in emb.values():
            if isinstance(v, list):
                return v
    for key in ("content", "items", "results", "initiatives"):
        if isinstance(data, dict) and isinstance(data.get(key), list):
            return data[key]
    if isinstance(data, list):
        return data
    return []


def consultation_fields(item):
    iid = item.get("id") or item.get("initiativeId")
    title = item.get("shortTitle") or item.get("title") or item.get("name")
    if not iid or not title:
        return None
    summary = item.get("dossierSummary") or item.get("summary") or ""
    start = end = kind = None
    for d in walk(item):
        status = str(d.get("receivingFeedbackStatus") or d.get("feedbackStatus") or "").upper()
        e = iso_date(d.get("feedbackEndDate") or d.get("endDate"))
        if e and (status in ("", "OPEN") or e >= date.today().isoformat()):
            if not end or e > end:
                end = e
                start = iso_date(d.get("feedbackStartDate") or d.get("startDate"))
                kind = d.get("type") or d.get("consultationType") or d.get("frontEndStage") or item.get("frontEndStage")
    dg = item.get("dg") or item.get("unit") or item.get("dgName")
    if isinstance(dg, dict):
        dg = dg.get("label") or dg.get("name") or dg.get("code")
    return {
        "id": str(iid), "title": re.sub(r"\s+", " ", str(title)).strip(),
        "summary": re.sub(r"<[^>]+>|\s+", " ", str(summary)).strip()[:400],
        "type": human(kind) or "Feedback", "dg": str(dg) if dg else None,
        "start": start, "end": end, "url": HYS_PAGE.format(id=iid),
    }


def collect_consultations(cfg, area_matchers, topic_words):
    words = [w for w in cfg.get("keywords", []) if w.strip()]
    # Acronyms (ETS, REACH, PFAS …) must match exactly as whole words; other words match word starts ("recycl" → recycling)
    caps = [w for w in words if w.isupper()]
    rx_low = re.compile(r"\b(" + "|".join(re.escape(w) for w in words if not w.isupper()) + r")", re.IGNORECASE)
    rx_caps = re.compile(r"\b(" + "|".join(re.escape(w) for w in caps) + r")\b") if caps else None

    class _P:
        @staticmethod
        def findall(t):
            return rx_low.findall(t) + (rx_caps.findall(t) if rx_caps else [])
    pattern = _P()
    today = date.today().isoformat()
    # The portal's parameters are undocumented: try a few known variants until one yields open consultations
    variants = cfg.get("queryVariants") or [
        {"feedbackOpen": "true", "language": "EN"},
        {"receivingFeedbackStatus": "OPEN", "language": "EN"},
        {"language": "EN", "sort": "feedbackEndDate,desc"},
    ]
    debug = {"fetched": datetime.now(timezone.utc).isoformat(timespec="seconds"), "attempts": []}
    found, seen = [], set()
    for variant in variants:
        found, seen, pages, total = [], set(), 0, 0
        for page in range(cfg.get("maxPages", 6)):
            q = {**variant, "page": page, "size": 50}
            url = HYS_API + "?" + urllib.parse.urlencode(q)
            try:
                data = get_json(url)
            except Exception as exc:  # noqa: BLE001 - note it and try the next variant
                debug["attempts"].append({"url": url, "error": str(exc)[:200]})
                break
            items = initiatives_from(data)
            pages += 1
            if page == 0:
                first = items[0] if items else None
                debug["attempts"].append({
                    "url": url,
                    "topLevelKeys": list(data)[:20] if isinstance(data, dict) else type(data).__name__,
                    "embeddedKeys": list(data.get("_embedded", {}))[:10] if isinstance(data, dict) and isinstance(data.get("_embedded"), dict) else None,
                    "page": data.get("page") if isinstance(data, dict) else None,
                    "items": len(items),
                    "firstItem": json.loads(json.dumps(first, default=str)[:6000] if first and len(json.dumps(first, default=str)) <= 6000 else json.dumps({k: (str(v)[:300]) for k, v in (first or {}).items()})),
                })
            if not items:
                break
            for it in items:
                total += 1
                c = consultation_fields(it)
                if not c or c["id"] in seen or not c["end"] or c["end"] < today:
                    continue
                seen.add(c["id"])
                text = c["title"] + " " + c["summary"]
                hits = sorted({m.lower() for m in pattern.findall(text)})
                if not hits:
                    continue
                c["areas"] = [a for a, m in area_matchers.items() if m(text)][:2] or ["reporting"]
                c["topics"] = [t for t, words in topic_words.items() if isinstance(words, list) and any(w.lower() in text.lower() for w in words)]
                c["keywords"] = hits[:4]
                found.append(c)
            if len(items) < 50:
                break
        if debug["attempts"]:
            debug["attempts"][-1]["openFound"] = len(seen)
            debug["attempts"][-1]["read"] = total
        if seen:
            break
    # Saved so the format can be checked from GitHub if the portal changes (small file, overwritten each run)
    DEBUG.parent.mkdir(exist_ok=True)
    DEBUG.write_text(json.dumps(debug, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    if not seen:
        raise RuntimeError("the portal answered, but no open consultations could be read (details in data/debug/consultations.json)")
    return sorted(found, key=lambda c: c["end"])


# ---------------- procedures ----------------
def pid_of(ref):
    m = re.match(r"(\d{4})/(\d{4})", ref or "")
    return f"{m.group(1)}-{m.group(2)}" if m else None


def text_of(v):
    if isinstance(v, dict):
        return v.get("en") or v.get("EN") or next((x for x in v.values() if isinstance(x, str)), "")
    if isinstance(v, list):
        return next((text_of(x) for x in v if text_of(x)), "")
    return str(v) if v else ""


def procedure_info(ref):
    pid = pid_of(ref)
    base = EP_API.format(pid=pid)
    fmt = "?" + urllib.parse.urlencode({"format": "application/ld+json"})
    title = ""
    try:
        proc = get_json(base + fmt, ua=EP_UA, accept="application/ld+json, application/json;q=0.9")
        for d in walk(proc):
            t = text_of(d.get("process_title") or d.get("title") or d.get("label"))
            if t and len(t) > 15:
                title = t
                break
    except Exception:  # noqa: BLE001 - the events are what matters
        pass
    events_raw = get_json(base + "/events" + fmt, ua=EP_UA, accept="application/ld+json, application/json;q=0.9")
    events = {}
    for d in walk(events_raw):
        when = None
        for k, v in d.items():
            if "date" in k.lower():
                when = iso_date(v if not isinstance(v, (list, dict)) else text_of(v))
                if when:
                    break
        if not when:
            continue
        label = text_of(d.get("activity_label") or d.get("label") or d.get("title")) or human(d.get("had_activity_type") or d.get("type"))
        if not label:
            continue
        events[(when, label.strip())] = True
    if not events:
        raise RuntimeError(f"no events found for {ref}")
    steps = [{"date": w, "label": l} for (w, l) in sorted(events)]
    return {"ref": ref, "title": title, "steps": steps[-25:], "latest": steps[-1], "url": OEIL.format(ref=urllib.parse.quote(ref))}


def main():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    feeds = json.loads(FEEDS.read_text(encoding="utf-8"))
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    now = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None).isoformat()
    today = date.today().isoformat()
    log = []

    def matcher(words):
        rx = re.compile(r"\b(" + "|".join(re.escape(w) for w in words if w.strip()) + r")\b", re.IGNORECASE)
        return lambda t: bool(rx.search(t))
    area_matchers = {a: matcher(w) for a, w in feeds.get("areaKeywords", {}).items() if w}

    out = {"updated": now, "consultations": old.get("consultations", []), "procedures": old.get("procedures", {})}

    # 1 consultations
    try:
        out["consultations"] = collect_consultations(cfg.get("consultations", {}), area_matchers, cfg.get("topicKeywords", {}))
        out["consultationsFetched"] = now
        cons_status = ("ok", f"{len(out['consultations'])} open and relevant")
    except Exception as exc:  # noqa: BLE001
        out["consultations"] = [c for c in out["consultations"] if (c.get("end") or "") >= today]
        cons_status = ("warn", f"failed: {str(exc)[:120]} – showing the last list")
    log.append(f"Consultations: {cons_status[1]}")
    report_status("consultations", "EU consultations", *cons_status, order=20)

    # 2 procedures
    radar = json.loads(RADAR.read_text(encoding="utf-8")) if RADAR.exists() else None
    roadmap = json.loads(ROADMAP.read_text(encoding="utf-8")) if ROADMAP.exists() else {"rows": []}
    rows = {r["id"]: r for r in roadmap.get("rows", [])}
    failed, cache, new_steps = [], {}, []
    for row_id, ref in cfg.get("procedures", {}).items():
        if not ref or row_id.startswith("_"):
            continue
        try:
            info = cache.get(ref) or procedure_info(ref)
            cache[ref] = info
        except Exception as exc:  # noqa: BLE001
            failed.append(f"{row_id} ({str(exc)[:60]})")
            continue
        prev = out["procedures"].get(row_id, {})
        info = dict(info)
        changed = prev.get("latest") != info["latest"]
        info["changed"] = today if (changed and prev) else prev.get("changed")
        out["procedures"][row_id] = info
        log.append(f"{row_id}: {ref} · {info['title'][:70] or '(no title)'} · latest: {info['latest']['label']} ({info['latest']['date']})")
        if changed and prev and radar is not None:
            new_steps.append((row_id, info))
    for row_id in list(out["procedures"]):
        if not cfg.get("procedures", {}).get(row_id):
            out["procedures"].pop(row_id)

    # A new official step becomes a News entry (shows under "New since last visit" and in the Teams post)
    if new_steps and radar is not None:
        known = {e.get("id") for e in radar.get("entries", [])}
        for row_id, info in new_steps:
            row = rows.get(row_id, {})
            name = row.get("label", row_id)
            eid = "status-" + hashlib.sha1(f"{row_id}{info['latest']['date']}{info['latest']['label']}".encode()).hexdigest()[:10]
            if eid in known:
                continue
            radar["entries"].append({
                "id": eid, "date": info["latest"]["date"], "type": "regulation",
                "areas": [row.get("area", "reporting")], "impacts": ["watch"], "tags": ["Status update"],
                "title": f"{name}: {info['latest']['label']}",
                "summary": f"New official step in procedure {info['ref']} ({info['title'][:160]}).".replace(" ().", "."),
                "whyItMatters": None, "status": None, "relevance": "medium",
                "nextDate": None, "nextDateLabel": None,
                "source": "EP Legislative Observatory", "url": info["url"], "origin": "feed", "added": today,
            })
        RADAR.write_text(json.dumps(radar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    proc_total = len([r for r in cfg.get("procedures", {}).values() if r])
    report_status("procedures", "Regulation status", "warn" if failed else "ok",
                  (f"{proc_total - len(failed)} of {proc_total} procedures" + (" · failed: " + ", ".join(failed[:3]) if failed else "")
                   + (f" · {len(new_steps)} new step(s)" if new_steps else "")), order=21)

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    text = "## Regulation page\n\n" + "\n".join("- " + l for l in log + [f"⚠️ procedure failed: {f}" for f in failed])
    print(text)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as fh:
            fh.write(text + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
