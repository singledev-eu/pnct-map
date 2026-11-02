"""Fetch the concelho seats (sedes de concelho) from OpenStreetMap, offline, into data/external/osm/.

One Overpass API query: every municipality relation in Portugal (boundary=administrative,
admin_level=7) and its admin_centre node (the seat). build_cities.py keeps the mainland ones and
matches each to its CAOP concelho. OSM data is © OpenStreetMap contributors, ODbL 1.0.

Writes seats.json (the raw Overpass response) and fetch.json (endpoint, query, licence, fetch time).
Cached files are reused unless --refresh.

Usage: uv run python scripts/fetch_cities.py [--refresh]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/external/osm"
ENDPOINT = "https://overpass-api.de/api/interpreter"
QUERY = """[out:json][timeout:150];
area["ISO3166-1"="PT"][admin_level=2]->.pt;
rel(area.pt)[boundary=administrative][admin_level=7]->.m;
node(r.m:"admin_centre");
out body;
.m out tags;"""
UA = {"User-Agent": "pnct-map data pipeline (+https://pnct.singledev.eu)"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    seats, meta = OUT / "seats.json", OUT / "fetch.json"
    if seats.exists() and meta.exists() and not a.refresh:
        print(f"{seats.relative_to(ROOT)}: cached")
        return
    body = urllib.parse.urlencode({"data": QUERY}).encode()
    with urllib.request.urlopen(urllib.request.Request(ENDPOINT, data=body, headers=UA), timeout=200) as r:
        raw = r.read()
    data = json.loads(raw)
    seats.write_bytes(raw)
    meta.write_text(
        json.dumps(
            {
                "source": "OpenStreetMap: admin_centre of each municipality (admin_level=7), via the Overpass API",
                "url": "https://www.openstreetmap.org/copyright",
                "endpoint": ENDPOINT,
                "query": QUERY,
                "licence": "ODbL 1.0 (© OpenStreetMap contributors)",
                "licence_url": "https://opendatacommons.org/licenses/odbl/1-0/",
                "osm_base": data.get("osm3s", {}).get("timestamp_osm_base"),
                "fetched_at": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"{seats.relative_to(ROOT)}: {len(data['elements'])} elements")


if __name__ == "__main__":
    main()
