"""posted.json: which insights were sent to Telegram (sent = drafted; posting is a human decision)."""

from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path

from insights import config as cfg


def path() -> Path:
    return cfg.STATE_DIR / "posted.json"


def load() -> list[dict]:
    p = path()
    if not p.exists():
        return []
    return json.loads(p.read_text(encoding="utf-8")).get("posted", [])


def posted_ids() -> set[str]:
    return {e["id"] for e in load()}


def record(insight_id: str, evergreen: bool, **extra) -> None:
    entries = load()
    entries.append({"id": insight_id, "evergreen": evergreen,
                    "sent_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"), **extra})
    p = path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps({"posted": entries}, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, p)  # atomic: a crash never leaves half a file
