"""The map's three-state PNCT classification (data/sources/pnct-legal-status.md).

Each parish is `pnct`, `not_pnct` or `disputed`. The default is the IEFP list
(data/processed/pnct_parishes.csv), which agrees with the legal text, the annex of Portaria
208/2017, everywhere except the parishes in data/pnct_status.csv. Each row there gives the
`legal_status` (the map's definition, used for totals) and the `iefp_status`, and is `disputed`
when the two differ. Rows carry a reason, at least two sources and the date checked.

Standard library only: the pipeline scripts, the insights and the tests all read it.
"""

from __future__ import annotations

import csv
import datetime as dt
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATUS_CSV = ROOT / "data/pnct_status.csv"
STATUSES = ("pnct", "not_pnct", "disputed")
FIELDS = ["dicofre", "freguesia", "concelho", "status", "legal_status", "iefp_status", "reason", "sources", "checked"]


def load_overrides(path: Path = STATUS_CSV) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != FIELDS:
            raise ValueError(f"{path.name}: columns {reader.fieldnames}, expected {FIELDS}")
        rows = list(reader)
    for r in rows:
        r["sources"] = r["sources"].split()
    return rows


def validate(rows: list[dict], all_codes: set[str], iefp_codes: set[str]) -> None:
    """Raises ValueError on any inconsistency: unknown or repeated codes, a stale IEFP status, a
    disputed row without a reason or with fewer than two sources, a status that doesn't follow."""
    seen = set()
    for r in rows:
        code = r["dicofre"]
        where = f"{STATUS_CSV.name} {code} ({r['freguesia']})"
        if code in seen:
            raise ValueError(f"{where}: listed twice")
        seen.add(code)
        if code not in all_codes:
            raise ValueError(f"{where}: not a CAOP parish")
        for k in ("status", "legal_status", "iefp_status"):
            if r[k] not in STATUSES[:2] and not (k == "status" and r[k] == "disputed"):
                raise ValueError(f"{where}: {k} {r[k]!r}")
        actual = "pnct" if code in iefp_codes else "not_pnct"
        if r["iefp_status"] != actual:
            raise ValueError(f"{where}: iefp_status {r['iefp_status']} but the IEFP list says {actual}; re-check the row")
        expected = "disputed" if r["legal_status"] != r["iefp_status"] else r["legal_status"]
        if r["status"] != expected:
            raise ValueError(f"{where}: status {r['status']}, expected {expected} (legal {r['legal_status']}, IEFP {r['iefp_status']})")
        if not r["reason"].strip():
            raise ValueError(f"{where}: no reason")
        if r["status"] == "disputed" and len(r["sources"]) < 2:
            raise ValueError(f"{where}: a disputed parish needs at least two sources")
        if not all(s.startswith("https://") for s in r["sources"]):
            raise ValueError(f"{where}: sources must be https URLs")
        dt.date.fromisoformat(r["checked"])


def classify(all_codes: set[str], iefp_codes: set[str], path: Path = STATUS_CSV) -> dict[str, dict]:
    """{dicofre: {"status", "legal_status", "iefp_status"}} for every parish, validated."""
    rows = load_overrides(path)
    validate(rows, all_codes, iefp_codes)
    out = {}
    for code in all_codes:
        s = "pnct" if code in iefp_codes else "not_pnct"
        out[code] = {"status": s, "legal_status": s, "iefp_status": s}
    for r in rows:
        out[r["dicofre"]] = {k: r[k] for k in ("status", "legal_status", "iefp_status")}
    return out


def checked_date(path: Path = STATUS_CSV) -> str:
    return max(r["checked"] for r in load_overrides(path))
