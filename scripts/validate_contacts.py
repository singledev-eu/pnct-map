"""Validate a câmara contacts CSV (data/contacts/camaras*.csv). Exploratory (concelho card, phase 1).

Offline checks (always):
  - the header is exactly COLUMNS;
  - every dico is one of the 278 mainland municipalities in CAOP 2025, with no duplicates, and the
    name matches CAOP;
  - website, urbanism_url, pdm_url and source_url are https URLs; email and phone are well-formed
    (a generic mailbox on the câmara's own domain; +351 and 9 digits, landline or mobile);
  - as_of is an ISO date.
Online check (--online): every URL answers with HTTP < 400 (GET, redirects followed). A failure is
reported, not fixed: the row needs a human look.

Usage: uv run python scripts/validate_contacts.py data/contacts/camaras.sample.csv [--online]
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
import ssl
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

import pyogrio

ROOT = Path(__file__).resolve().parent.parent
CAOP_GPKG = ROOT / "data/external/CAOP_Continente_2025-gpkg/Continente_CAOP2025.gpkg"
COLUMNS = ["dico", "name", "website", "email", "phone", "urbanism_url", "pdm_url", "source_url", "as_of", "notes"]
URL_FIELDS = ["website", "urbanism_url", "pdm_url", "source_url"]
EMAIL = re.compile(r"^[a-z0-9._%+-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$")
PHONE = re.compile(r"^\+351 [29]\d{2} \d{3} \d{3}$")
# Mailbox names that usually belong to a person; generic ones (geral, municipio, ...) pass.
PERSONAL = re.compile(r"^[a-z]+\.[a-z]+@")


def municipalities() -> dict[str, str]:
    df = pyogrio.read_dataframe(CAOP_GPKG, layer="cont_municipios", read_geometry=False)
    return dict(zip(df.dtmn, df.municipio))


def host(url: str) -> str:
    return urlparse(url).hostname.removeprefix("www.") if url else ""


def check_row(row: dict[str, str], caop: dict[str, str]) -> list[str]:
    problems = []
    dico = row["dico"]
    if dico not in caop:
        problems.append(f"dico {dico!r} is not a mainland municipality in CAOP 2025")
    elif row["name"] != caop[dico]:
        problems.append(f"name {row['name']!r} != CAOP {caop[dico]!r}")
    for f in URL_FIELDS:
        v = row[f]
        if not v:
            if f != "urbanism_url":  # the only optional URL
                problems.append(f"{f} is empty")
            continue
        if urlparse(v).scheme != "https" or not urlparse(v).hostname:
            problems.append(f"{f} is not an https URL: {v}")
    m = EMAIL.match(row["email"])
    if not m:
        problems.append(f"email malformed: {row['email']!r}")
    else:
        if m.group(1).removeprefix("www.") != host(row["website"]):
            problems.append(f"email domain {m.group(1)} is not the website's ({host(row['website'])})")
        if PERSONAL.match(row["email"]):
            problems.append(f"email looks personal: {row['email']}")
    if not PHONE.match(row["phone"]):
        problems.append(f"phone malformed (want '+351 2xx xxx xxx'): {row['phone']!r}")
    try:
        dt.date.fromisoformat(row["as_of"])
    except ValueError:
        problems.append(f"as_of is not an ISO date: {row['as_of']!r}")
    for f in ["urbanism_url", "pdm_url", "source_url"]:
        if row[f] and host(row[f]) != host(row["website"]):
            problems.append(f"{f} is off the câmara's site ({host(row[f])}); fine for SNIT, check otherwise")
    return problems


def reachable(url: str) -> str | None:
    """None if the URL answers < 400, else the reason. Retries once without certificate checks, to
    tell a broken TLS chain (reported as a warning) from a dead page."""
    req = urllib.request.Request(url, headers={"User-Agent": "pnct-map contacts check (+https://pnct.singledev.eu)"})
    for verify in (True, False):
        ctx = None if verify else ssl._create_unverified_context()  # noqa: S323 (diagnosis only)
        try:
            with urllib.request.urlopen(req, timeout=30, context=ctx):
                return None if verify else "reachable only without TLS verification (incomplete certificate chain?)"
        except urllib.error.HTTPError as e:
            return f"HTTP {e.code}"
        except urllib.error.URLError as e:
            if verify and isinstance(e.reason, ssl.SSLError):
                continue
            return f"{type(e.reason).__name__}: {e.reason}"
        except TimeoutError:
            return "timeout"
    return "unreachable"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", type=Path)
    ap.add_argument("--online", action="store_true", help="also check that every URL answers")
    args = ap.parse_args()
    with args.csv.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != COLUMNS:
            print(f"header {reader.fieldnames} != {COLUMNS}")
            return 1
        rows = list(reader)
    caop = municipalities()
    online: dict[tuple[str, str], str | None] = {}
    if args.online:  # every URL at once: câmara sites are slow, some take the full timeout
        jobs = [(row["dico"], f, row[f]) for row in rows for f in URL_FIELDS if row[f]]
        with ThreadPoolExecutor(max_workers=16) as pool:
            for (dico, f, _), why in zip(jobs, pool.map(lambda j: reachable(j[2]), jobs)):
                online[(dico, f)] = why
    errors = 0
    seen: set[str] = set()
    for row in rows:
        problems = check_row(row, caop)
        if row["dico"] in seen:
            problems.append("duplicate dico")
        seen.add(row["dico"])
        problems += [f"{f}: {why}" for f in URL_FIELDS if (why := online.get((row["dico"], f)))]
        for p in problems:
            print(f"{row['dico']} {row['name']}: {p}", flush=True)
        errors += bool(problems)
    print(f"{len(rows)} rows, {errors} with problems, {len(caop) - len(seen)} of {len(caop)} municipalities not covered")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
