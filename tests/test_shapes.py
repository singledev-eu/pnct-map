import json
import sys
from pathlib import Path

import pandas as pd
import pytest
from shapely import Polygon

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from polyline import concelho_slug, decode, encode, parse_shape_param, polygon_url, shape_param  # noqa: E402

SHAPES = ROOT / "web/public/data/shapes.json"
QUALITY = ROOT / "data/processed/shapes_quality.csv"
PNCT = ROOT / "data/processed/pnct_parishes.csv"
PARISHES_GEOJSON = ROOT / "data/processed/parishes_all.geojson"

F1 = "%28%28kbrfFjbgo%40%7DhYslCwv%40a%7Eg%40%7El%5ExtAikBzui%40%29%29"
F1_POINTS = [(37.94486, -7.90582), (38.07957, -7.88316), (38.08849, -7.67339), (37.92753, -7.68712), (37.94486, -7.90582)]
F2 = (
    "%28%28w%7BvxFl%7Der%40qpFiCypCquEgB_%7BKlnA%7BfGnZwmIzCojC%7EoAg%7BA%7CtAeA%7CgAj_Ad%5ChyBwHdhBeO%7EtB_%7B%40jp%40"
    "%7Be%40zrBtUxtAyPd%7D%40%3FlnAhy%40eP%7EvB%7DkK%7De%40daKzuCu%7BOpfEn%60G%7DdE%60xGev%40%60kFluBl%7BBub%40%7ElEw"
    "%7CDl%7BB%29%29"
)
MAX_VERTICES = 60


# ---- fixtures -----------------------------------------------------------------


def test_fixture1_decodes_and_reencodes():
    assert parse_shape_param(F1) == F1_POINTS
    assert shape_param(encode(F1_POINTS)) == F1


def test_fixture2_round_trips():
    points = parse_shape_param(F2)
    assert len(points) == 28
    assert points[0] == points[-1]
    assert shape_param(encode(points)) == F2


@pytest.mark.parametrize(
    "op,kind,filters,expected",
    [
        ("comprar", "terrenos", ["terreno-urbanizavel"], "areas/comprar-terrenos/com-terreno-urbanizavel/mapa-google"),
        (
            "comprar",
            "terrenos",
            ["terreno-urbano", "terreno-urbanizavel"],
            "areas/comprar-terrenos/com-terreno-urbano,terreno-urbanizavel/mapa-google",
        ),
        ("arrendar", "casas", None, "areas/arrendar-casas/mapa-google"),
        ("comprar", "casas", None, "areas/comprar-casas/mapa-google"),
        ("comprar", "predios", None, "areas/comprar-predios/mapa-google"),
    ],
)
def test_fixture3_urls(op, kind, filters, expected):
    url = polygon_url(op, kind, encode(F1_POINTS), filters)
    assert url == f"https://www.idealista.pt/{expected}?shape={F1}"


def test_concelho_slug():
    assert concelho_slug("Arouca") == "arouca"
    assert concelho_slug("Castanheira de Pêra") == "castanheira-de-pera"
    assert concelho_slug("São João da Pesqueira") == "sao-joao-da-pesqueira"


# ---- shapes.json ------------------------------------------------------------


@pytest.fixture(scope="module")
def shapes():
    return json.loads(SHAPES.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def quality():
    return pd.read_csv(QUALITY, dtype={"dicofre": str}).set_index("dicofre")


@pytest.fixture(scope="module")
def bboxes():
    out = {}
    for f in json.loads(PARISHES_GEOJSON.read_text(encoding="utf-8"))["features"]:
        coords = f["geometry"]["coordinates"]
        polys = [coords] if f["geometry"]["type"] == "Polygon" else coords
        xs = [x for p in polys for x, _ in p[0]]
        ys = [y for p in polys for _, y in p[0]]
        out[f["properties"]["dicofre"]] = (min(xs), min(ys), max(xs), max(ys))
    return out


def test_one_shape_per_pnct_parish(shapes):
    pnct = pd.read_csv(PNCT, dtype={"dicofre": str})
    assert set(shapes) == set(pnct.dicofre)


def test_rings_are_valid_closed_and_capped(shapes, bboxes):
    for dicofre, s in shapes.items():
        ring = decode(s["shape"])
        assert ring[0] == ring[-1], dicofre
        assert len(ring) - 1 == s["points"] <= MAX_VERTICES, dicofre
        assert len(set(ring[:-1])) == s["points"], dicofre
        poly = Polygon([(lng, lat) for lat, lng in ring])
        assert poly.is_valid and poly.exterior.is_simple, dicofre
        # Inside the parish's bounding box (simplified web geometry, small margin).
        x0, y0, x1, y1 = bboxes[dicofre]
        minx, miny, maxx, maxy = poly.bounds
        m = 0.005
        assert x0 - m <= minx and maxx <= x1 + m and y0 - m <= miny and maxy <= y1 + m, dicofre


def test_method_and_approx_flags(shapes):
    assert {s["method"] for s in shapes.values()} <= {"single", "largest", "hull"}
    for dicofre, s in shapes.items():
        assert s["approx"] == (s["method"] == "hull"), dicofre


def test_coverage(quality, shapes):
    assert set(quality.index) == set(shapes)
    assert (quality.coverage >= 0.95).all(), quality[quality.coverage < 0.95]
    assert (quality.points <= MAX_VERTICES).all()
