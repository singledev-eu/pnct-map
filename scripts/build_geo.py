"""Build the simplified map layers from CAOP 2025 and the PNCT parish list.

Outputs:
  data/processed/parishes_all.geojson  all mainland parishes, with a pnct flag
  data/processed/concelhos.geojson     municipality outlines, dissolved from
                                        the simplified parishes so that the
                                        borders line up exactly
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pandas as pd
import pyogrio

ROOT = Path(__file__).resolve().parents[1]
CAOP_GPKG = ROOT / "data/external/CAOP_Continente_2025-gpkg/Continente_CAOP2025.gpkg"
PNCT_CSV = ROOT / "data/processed/pnct_parishes.csv"
INTERIM = ROOT / "data/interim/parishes_full_4326.geojson"
OUT_PARISHES = ROOT / "data/processed/parishes_all.geojson"
OUT_CONCELHOS = ROOT / "data/processed/concelhos.geojson"

MAPSHAPER = "mapshaper@0.7.68"
SIMPLIFY = "6%"
MAX_BYTES = 5 * 1024 * 1024


def write_full_resolution() -> None:
    gdf = pyogrio.read_dataframe(
        CAOP_GPKG,
        layer="cont_freguesias",
        columns=["dtmnfr", "freguesia", "municipio", "distrito_ilha"],
    )
    pnct = pd.read_csv(PNCT_CSV, dtype={"dicofre": str})
    unknown = set(pnct.dicofre) - set(gdf.dtmnfr)
    if unknown:
        raise ValueError(f"PNCT dicofres missing from CAOP: {sorted(unknown)}")

    gdf = gdf.rename(
        columns={
            "dtmnfr": "dicofre",
            "municipio": "concelho",
            "distrito_ilha": "distrito",
        }
    )
    gdf["dtmn"] = gdf.dicofre.str[:4]
    gdf["pnct"] = gdf.dicofre.isin(pnct.dicofre)
    gdf = gdf[["dicofre", "freguesia", "concelho", "distrito", "dtmn", "pnct", "geometry"]]
    gdf = gdf.sort_values("dicofre").to_crs(4326)

    INTERIM.parent.mkdir(parents=True, exist_ok=True)
    INTERIM.unlink(missing_ok=True)
    pyogrio.write_dataframe(gdf, INTERIM, driver="GeoJSON")


def simplify() -> None:
    env = {**os.environ, "npm_config_cache": str(ROOT / ".npm-cache"), "npm_config_update_notifier": "false"}
    cmd = [
        "npx", "-y", MAPSHAPER,
        "-i", str(INTERIM), "name=parishes",
        "-simplify", SIMPLIFY, "keep-shapes",
        "-clean",
        "-dissolve", "dtmn", "copy-fields=concelho,distrito", "+", "name=concelhos",
        "-target", "parishes",
        "-filter-fields", "dicofre,freguesia,concelho,distrito,pnct",
        "-o", str(OUT_PARISHES), "format=geojson", "precision=0.00001",
        "-target", "concelhos",
        "-o", str(OUT_CONCELHOS), "format=geojson", "precision=0.00001",
    ]
    subprocess.run(cmd, check=True, env=env)


def main() -> None:
    write_full_resolution()
    simplify()
    for path in (OUT_PARISHES, OUT_CONCELHOS):
        size = path.stat().st_size
        print(f"{path.relative_to(ROOT)}: {size / 1024 / 1024:.2f} MB")
    if OUT_PARISHES.stat().st_size > MAX_BYTES:
        raise SystemExit(f"{OUT_PARISHES.name} exceeds 5 MB; lower SIMPLIFY")


if __name__ == "__main__":
    main()
