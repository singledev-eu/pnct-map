"""Build the web map's single TopoJSON file from the simplified parish layer.

Input:  data/processed/parishes_all.geojson (already simplified by build_geo.py)
Output: web/data/pnct.topo.json with two objects:
  parishes   dicofre, freguesia, concelho, distrito, pnct
  concelhos  name, distrito, pnct_count, parish_count
"""

from __future__ import annotations

import gzip
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IN_PARISHES = ROOT / "data/processed/parishes_all.geojson"
OUT_TOPO = ROOT / "web/data/pnct.topo.json"

MAPSHAPER = "mapshaper@0.7.68"
# 1.2e5 steps over mainland Portugal (~5.2° of latitude in the data) is ~4.8 m
# per step, inside the 5 m budget tests/test_pipeline.py enforces and far below
# a pixel at zoom 12 (~15 m/px at 40°N, 512px tiles). It is ~9% smaller gzipped
# than the previous 2e5 (~3 m) with no visible difference; the 6% simplification
# in build_geo.py removes far more detail than either.
QUANTIZATION = "120000"


def main() -> None:
    OUT_TOPO.parent.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "npm_config_cache": str(ROOT / ".npm-cache"), "npm_config_update_notifier": "false"}
    cmd = [
        "npx", "-y", MAPSHAPER,
        "-i", str(IN_PARISHES), "name=parishes",
        "-each", "dtmn=dicofre.slice(0,4)",
        "-dissolve", "dtmn", "copy-fields=concelho,distrito",
        "calc=pnct_count=sum(pnct ? 1 : 0), parish_count=count()",
        "+", "name=concelhos",
        "-target", "concelhos",
        "-rename-fields", "name=concelho",
        "-filter-fields", "name,distrito,pnct_count,parish_count",
        "-target", "parishes",
        "-filter-fields", "dicofre,freguesia,concelho,distrito,pnct",
        "-o", str(OUT_TOPO), "format=topojson", "target=parishes,concelhos",
        f"quantization={QUANTIZATION}",
    ]
    subprocess.run(cmd, check=True, env=env)
    raw = OUT_TOPO.read_bytes()
    print(
        f"{OUT_TOPO.relative_to(ROOT)}: {len(raw) / 1024:.0f} KB raw, "
        f"{len(gzip.compress(raw, 9)) / 1024:.0f} KB gzipped"
    )


if __name__ == "__main__":
    main()
