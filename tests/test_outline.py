import json
from pathlib import Path

import geopandas as gpd
import shapely
from shapely import Point, Polygon

ROOT = Path(__file__).resolve().parents[1]
OUTLINE = ROOT / "web/data/outline.json"
PARISHES_GEOJSON = ROOT / "data/processed/parishes_all.geojson"

REACHABLE = {"Sagres": (37.01, -8.94), "Vila Real de Santo António": (37.19, -7.42), "Elvas": (38.88, -7.16), "Miranda do Douro": (41.50, -6.27), "Bragança": (41.81, -6.76), "Caminha": (41.87, -8.84), "Cabo da Roca": (38.78, -9.50)}
REJECTED = {"Cádiz": (36.53, -6.29), "Seville": (37.39, -5.98), "Badajoz": (38.88, -6.97), "Salamanca": (40.97, -5.66), "Vigo": (42.24, -8.72), "Ourense": (42.34, -7.86)}


def outline() -> Polygon:
    return Polygon(json.loads(OUTLINE.read_text())["ring"])


def test_outline_is_small_and_valid():
    poly = outline()
    assert poly.is_valid
    assert 50 < len(poly.exterior.coords) - 1 < 200
    assert OUTLINE.stat().st_size < 5_000


def test_outline_points():
    poly = outline()
    for name, (lat, lng) in REACHABLE.items():
        assert poly.contains(Point(lng, lat)), name
    for name, (lat, lng) in REJECTED.items():
        assert not poly.contains(Point(lng, lat)), name


def test_outline_contains_every_mainland_parish():
    poly = outline()
    parishes = gpd.read_file(PARISHES_GEOJSON)
    # The islets (Berlengas, Farilhões) are within the sea buffer too; allow the rounding to 1e-4°.
    outside = parishes[~parishes.geometry.within(poly.buffer(1e-4))]
    assert outside.empty, list(outside.get("dicofre", outside.index))[:10]
