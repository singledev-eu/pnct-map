"""Build the camera outline of mainland Portugal -> web/data/outline.json.

The map keeps the centre of its visible area inside this polygon (web/src/camera.ts). From CAOP 2025:
  * mainland = the union of the districts, largest part only (no islets), holes dropped;
  * buffered by LAND_BUFFER_M along the Spanish border, so border towns (Elvas, Miranda do Douro,
    Vila Real de Santo António) can be centred while Spanish towns ~5 km out (Badajoz) cannot;
  * buffered by SEA_BUFFER_M at sea: the sea buffer minus everything within SEA_BUFFER_M of the
    border (CAOP cont_trocos with paises "Portugal#Espanha"), so it never reaches into Spain;
  * simplified (Douglas-Peucker, EPSG:3763 metres) with SIMPLIFY_M, then rounded to 1e-4° in EPSG:4326.
The build fails if the result has more than MAX_VERTICES vertices or doesn't contain mainland.
"""

from __future__ import annotations

import json
from pathlib import Path

import pyogrio
import shapely
from pyproj import Transformer
from shapely import Polygon

ROOT = Path(__file__).resolve().parents[1]
CAOP_GPKG = ROOT / "data/external/CAOP_Continente_2025-gpkg/Continente_CAOP2025.gpkg"
OUT_JSON = ROOT / "web/data/outline.json"

LAND_BUFFER_M = 2_000
SEA_BUFFER_M = 20_000
SIMPLIFY_M = 1_500
MAX_VERTICES = 200

TO_WGS84 = Transformer.from_crs(3763, 4326, always_xy=True)


def mainland() -> Polygon:
    districts = pyogrio.read_dataframe(CAOP_GPKG, layer="cont_distritos")
    land = shapely.union_all(districts.geometry.values)
    largest = max(getattr(land, "geoms", [land]), key=lambda p: p.area)
    return Polygon(largest.exterior)


def spanish_border():
    trocos = pyogrio.read_dataframe(CAOP_GPKG, layer="cont_trocos")
    return shapely.union_all(trocos[trocos.paises == "Portugal#Espanha"].geometry.values)


def outline(main: Polygon, border) -> Polygon:
    sea = shapely.difference(main.buffer(SEA_BUFFER_M), border.buffer(SEA_BUFFER_M))
    merged = shapely.union(main.buffer(LAND_BUFFER_M), sea)
    largest = max(getattr(merged, "geoms", [merged]), key=lambda p: p.area)
    return Polygon(largest.exterior).simplify(SIMPLIFY_M)


def main() -> None:
    land = mainland()
    poly = outline(land, spanish_border())
    if not poly.contains(land):
        raise SystemExit("outline does not contain mainland")
    xs, ys = TO_WGS84.transform(*zip(*poly.exterior.coords[:-1]))
    ring = [[round(x, 4), round(y, 4)] for x, y in zip(xs, ys)]
    if len(ring) > MAX_VERTICES:
        raise SystemExit(f"outline has {len(ring)} vertices (> {MAX_VERTICES})")
    OUT_JSON.write_text(
        json.dumps(
            {
                "source": "CAOP 2025 © DGT (CC BY 4.0); built by scripts/build_outline.py",
                "landBufferM": LAND_BUFFER_M,
                "seaBufferM": SEA_BUFFER_M,
                "simplifyM": SIMPLIFY_M,
                "ring": ring,
            },
            separators=(",", ":"),
        )
        + "\n"
    )
    print(f"{OUT_JSON.relative_to(ROOT)}: {len(ring)} vertices, {OUT_JSON.stat().st_size} bytes")


if __name__ == "__main__":
    main()
