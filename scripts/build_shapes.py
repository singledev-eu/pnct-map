"""Build Idealista search shapes for PNCT parishes -> web/data/shapes.json.

For every PNCT parish, from FULL-resolution CAOP 2025 geometry:
  * single-part parish             -> its exterior ring        (method=single)
  * multipart, every non-largest
    part < 5% of the total area    -> the largest part's ring  (method=largest)
  * otherwise                      -> convex hull of all parts (method=hull, approx)
  * "largest" also falls back to the hull when dropping the minor parts would
    leave coverage below MIN_COVERAGE (the 5% rule is per part, not in total).
Holes are ignored. The ring is simplified (topology-preserving Douglas-Peucker,
in metres, EPSG:3763) with growing tolerance until it has <= MAX_VERTICES
unique points, then rounded to 1e-5 degrees in EPSG:4326 and Polyline-encoded.

Quality per parish goes to data/processed/shapes_quality.csv:
  coverage  = area(shape ∩ parish) / area(parish)
  overreach = area(shape − parish), in km² and as a ratio of the parish area
The build fails if any coverage < MIN_COVERAGE or a ring is invalid.
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import pyogrio
from pyproj import Transformer
import shapely
from shapely import MultiPolygon, Polygon

sys.path.insert(0, str(Path(__file__).resolve().parent))
from polyline import encode  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CAOP_GPKG = ROOT / "data/external/CAOP_Continente_2025-gpkg/Continente_CAOP2025.gpkg"
PNCT_CSV = ROOT / "data/processed/pnct_parishes.csv"
OUT_JSON = ROOT / "web/data/shapes.json"
OUT_QUALITY = ROOT / "data/processed/shapes_quality.csv"

MAX_VERTICES = 60
MIN_COVERAGE = 0.95
MINOR_PART_SHARE = 0.05
START_TOLERANCE_M = 5.0
TOLERANCE_STEP = 1.15

TO_WGS84 = Transformer.from_crs(3763, 4326, always_xy=True)
TO_PTTM = Transformer.from_crs(4326, 3763, always_xy=True)


@dataclass
class Shape:
    ring: list[tuple[float, float]]  # closed ring of (lat, lng), rounded to 1e-5
    method: str
    tolerance_m: float
    polygon_m: Polygon  # the rounded ring, back in EPSG:3763, for quality metrics

    @property
    def points(self) -> int:
        return len(self.ring) - 1

    @property
    def approx(self) -> bool:
        return self.method == "hull"


def base_polygon(geom: Polygon | MultiPolygon, allow_largest: bool = True) -> tuple[Polygon, str]:
    """The single hole-free polygon a search shape is derived from."""
    parts = list(geom.geoms) if isinstance(geom, MultiPolygon) else [geom]
    if len(parts) == 1:
        return Polygon(parts[0].exterior), "single"
    total = sum(p.area for p in parts)
    parts.sort(key=lambda p: p.area, reverse=True)
    if allow_largest and all(p.area / total < MINOR_PART_SHARE for p in parts[1:]):
        return Polygon(parts[0].exterior), "largest"
    return MultiPolygon(parts).convex_hull, "hull"


def to_ring(poly_m: Polygon) -> tuple[list[tuple[float, float]], Polygon]:
    """Project to WGS84, round to 5 decimals, drop repeated points, close the ring."""
    lngs, lats = TO_WGS84.transform(*poly_m.exterior.xy)
    ring: list[tuple[float, float]] = []
    for lat, lng in zip(lats, lngs):
        pt = (round(lat, 5), round(lng, 5))
        if not ring or ring[-1] != pt:
            ring.append(pt)
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    rounded = Polygon([(lng, lat) for lat, lng in ring])
    return ring, shapely.transform(rounded, lambda xy: np.column_stack(TO_PTTM.transform(xy[:, 0], xy[:, 1])))


def is_good_ring(ring: list[tuple[float, float]]) -> bool:
    poly = Polygon([(lng, lat) for lat, lng in ring])
    return len(ring) >= 4 and poly.is_valid and poly.exterior.is_simple and len(set(ring[:-1])) == len(ring) - 1


def make_shape(geom: Polygon | MultiPolygon, max_vertices: int = MAX_VERTICES) -> Shape:
    shape = simplify_to_cap(*base_polygon(geom), max_vertices)
    if shape.method == "largest" and quality(shape, geom)["coverage"] < MIN_COVERAGE:
        shape = simplify_to_cap(*base_polygon(geom, allow_largest=False), max_vertices)
    return shape


def simplify_to_cap(base: Polygon, method: str, max_vertices: int) -> Shape:
    tolerance = 0.0
    while True:
        simplified = base.simplify(tolerance, preserve_topology=True) if tolerance else base
        ring, poly_m = to_ring(simplified)
        if len(ring) - 1 <= max_vertices and is_good_ring(ring):
            return Shape(ring, method, tolerance, poly_m)
        tolerance = START_TOLERANCE_M if tolerance == 0 else tolerance * TOLERANCE_STEP
        if tolerance > 50_000:
            raise RuntimeError("could not simplify ring to a valid polygon")


def quality(shape: Shape, parish: Polygon | MultiPolygon) -> dict:
    area = parish.area
    covered = shape.polygon_m.intersection(parish).area
    over = shape.polygon_m.difference(parish).area
    return {
        "coverage": round(covered / area, 5),
        "overreach_km2": round(over / 1e6, 4),
        "overreach_ratio": round(over / area, 5),
    }


def load_pnct_geometries():
    pnct = pd.read_csv(PNCT_CSV, dtype={"dicofre": str})
    gdf = pyogrio.read_dataframe(CAOP_GPKG, layer="cont_freguesias", columns=["dtmnfr", "freguesia", "municipio"])
    if gdf.crs.to_epsg() != 3763:
        raise ValueError(f"Unexpected CAOP CRS {gdf.crs}")
    gdf = gdf[gdf.dtmnfr.isin(set(pnct.dicofre))].sort_values("dtmnfr")
    if len(gdf) != len(pnct):
        raise ValueError("Some PNCT parishes are missing from CAOP")
    return gdf


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-vertices", type=int, default=MAX_VERTICES)
    args = parser.parse_args()

    shapes: dict[str, dict] = {}
    rows = []
    for rec in load_pnct_geometries().itertuples():
        geom = rec.geometry
        shape = make_shape(geom, args.max_vertices)
        q = quality(shape, geom)
        shapes[rec.dtmnfr] = {
            "shape": encode(shape.ring),
            "points": shape.points,
            "approx": shape.approx,
            "method": shape.method,
        }
        rows.append(
            {
                "dicofre": rec.dtmnfr,
                "freguesia": rec.freguesia,
                "concelho": rec.municipio,
                "method": shape.method,
                "points": shape.points,
                "tolerance_m": round(shape.tolerance_m, 1),
                "parts": len(geom.geoms) if isinstance(geom, MultiPolygon) else 1,
                **q,
            }
        )

    quality_df = pd.DataFrame(rows)
    OUT_QUALITY.parent.mkdir(parents=True, exist_ok=True)
    quality_df.to_csv(OUT_QUALITY, index=False, lineterminator="\n")
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(shapes, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")

    raw = OUT_JSON.read_bytes()
    print(f"{OUT_JSON.relative_to(ROOT)}: {len(shapes)} shapes, {len(raw) / 1024:.0f} KB raw, {len(gzip.compress(raw, 9)) / 1024:.0f} KB gzipped")
    print(quality_df.method.value_counts().to_string())
    print(quality_df[["points", "coverage", "overreach_ratio", "overreach_km2"]].describe().round(4).to_string())

    bad = quality_df[quality_df.coverage < MIN_COVERAGE]
    if not bad.empty:
        raise SystemExit(f"coverage below {MIN_COVERAGE}:\n{bad.to_string()}")


if __name__ == "__main__":
    main()
