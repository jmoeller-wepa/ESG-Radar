"""Shared helper: every collector reports how it went into data/status.json.

The status dot in the page header reads this file:
  ok    – the source worked
  warn  – part of it failed (old values were kept)
  error – nothing could be collected this run
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

STATUS = Path(__file__).resolve().parent.parent / "data" / "status.json"


def report(key, label, status, detail="", order=50):
    now = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None).isoformat()
    try:
        data = json.loads(STATUS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    data.setdefault("sources", {})
    prev = data["sources"].get(key, {})
    entry = {"label": label, "status": status, "detail": str(detail)[:200], "at": now, "order": order}
    # remember since when a source has been failing (shown as "failing for 3 weeks")
    if status != "ok":
        entry["failingSince"] = prev.get("failingSince") or now
    data["sources"][key] = entry
    data["lastRun"] = now
    server, repo, run = (os.environ.get(k) for k in ("GITHUB_SERVER_URL", "GITHUB_REPOSITORY", "GITHUB_RUN_ID"))
    if server and repo and run:
        data["runUrl"] = f"{server}/{repo}/actions/runs/{run}"
        data["actionsUrl"] = f"{server}/{repo}/actions"
    STATUS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
