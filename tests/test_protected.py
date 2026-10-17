import gzip
import json
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pytest
from shapely import box

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_protected as bp  # noqa: E402
import protected_config  # noqa: E402

STATS = ROOT / "web/data/protection.json"
TOPO = ROOT / "web/data/protected.topo.json"
META = ROOT / "web/data/protected.meta.json"
PARISHES_GEOJSON = ROOT / "data/processed/parishes_all.geojson"

# Deep inside Peneda-Gerês (the national park): Vilar da Veiga (Terras de Bouro), Tourém and Cabril (Montalegre).
PENEDA_GERES = ["031017", "170632", "170601"]
# Central Lisbon and Porto: Santa Maria Maior, Arroios, Estrela; Bonfim, the Cedofeita... union.
CITY_CENTRES = ["110665", "110656", "110660", "131202", "131217"]


@pytest.fixture(scope="module")
def stats():
    return json.loads(STATS.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def cats(stats):
    return stats["categories"]


def blocks(stats, level):
    return {k: v["protection"] for k, v in stats[level].items()}


# ---- share computation on synthetic geometry (metres, EPSG:3763) ----------------------------


def synthetic():
    # Two 100 m × 100 m parishes side by side; "a" in concelho 0101, "b" in 0102.
    parishes = gpd.GeoDataFrame({"dicofre": ["010101", "010201"]}, geometry=[box(0, 0, 100, 100), box(100, 0, 200, 100)], crs=3763)
    # rnap covers the left half of "a"; natura covers x 25..125 (overlapping rnap by 25 m, and 25 m of "b").
    rnap = box(0, 0, 50, 100)
    natura = box(25, 0, 125, 100)
    unions = gpd.GeoDataFrame({"cat": ["rnap", "natura", "any"]}, geometry=[rnap, natura, rnap.union(natura)], crs=3763)
    sites = gpd.GeoDataFrame({"key": ["rnap:R", "natura:N", "natura:SLIVER"]}, geometry=[rnap, natura, box(199.8, 0, 200, 100)], crs=3763)
    return parishes, unions, sites


def test_overlap_and_shares_synthetic():
    parishes, unions, sites = synthetic()
    cat_areas = bp.overlap_areas(parishes, unions, "cat").unstack(fill_value=0.0)
    site_areas = bp.overlap_areas(parishes, sites, "key")
    area = parishes.set_index("dicofre").area
    index = {"rnap:R": 0, "natura:N": 1, "natura:SLIVER": 2}
    by_unit = {u: g.droplevel(0) for u, g in site_areas.groupby(level=0)}
    out = bp.shares(["rnap", "natura"], cat_areas, by_unit, area, index)

    a, b = out["010101"]["protection"], out["010201"]["protection"]
    assert (a["rnap_pct"], a["natura_pct"], a["any_pct"]) == (50.0, 75.0, 100.0)  # union, not the sum (125)
    assert (b["rnap_pct"], b["natura_pct"], b["any_pct"]) == (0.0, 25.0, 25.0)
    assert a["areas"] == [1, 0]  # largest first
    assert b["areas"] == [1]  # the 0.2% sliver is below NAME_MIN_SHARE


def test_share_rounding_and_cap():
    assert bp.pct(0, 0) == 0.0
    assert bp.pct(1, 3) == 33.3
    assert bp.pct(1.0000001, 1) == 100.0


def test_unit_without_any_overlap_is_zero():
    parishes, unions, _ = synthetic()
    far = parishes.assign(geometry=parishes.translate(10_000, 0))
    cat_areas = bp.overlap_areas(far, unions, "cat").unstack(fill_value=0.0)
    out = bp.shares(["rnap", "natura"], cat_areas, {}, far.set_index("dicofre").area, {})
    assert out["010101"]["protection"] == {"rnap_pct": 0.0, "natura_pct": 0.0, "any_pct": 0.0, "areas": []}


# ---- the built data -------------------------------------------------------------------------


def test_categories_follow_config(stats, cats):
    assert cats == list(protected_config.enabled())
    meta = json.loads(META.read_text(encoding="utf-8"))
    assert [c["id"] for c in meta["categories"]] == cats
    for c in meta["categories"]:
        assert c["url"].startswith("https://") and c["as_of"] and c["fetched_at"] and "licence_confirmed" in c


def test_per_field_meta(stats, cats):
    fields = stats["meta"]["fields"]
    for name in [*(f"protection.{c}_pct" for c in cats), "protection.any_pct", "protection.areas"]:
        assert {"source", "as_of", "licence"} <= set(fields[name]), name
    for c in cats:
        assert fields[f"protection.{c}_pct"]["url"].startswith("https://")


def test_keys_cover_every_parish_and_concelho(stats):
    with PARISHES_GEOJSON.open(encoding="utf-8") as f:
        dicofres = {feat["properties"]["dicofre"] for feat in json.load(f)["features"]}
    assert set(stats["freguesias"]) == dicofres
    assert set(stats["concelhos"]) == {d[:4] for d in dicofres}


@pytest.mark.parametrize("level", ["freguesias", "concelhos"])
def test_shares_are_consistent(stats, cats, level):
    for unit, p in blocks(stats, level).items():
        values = [p[f"{c}_pct"] for c in cats]
        assert all(0 <= v <= 100 for v in [*values, p["any_pct"]]), unit
        # The union is at least the larger category and at most their sum; every value is rounded to 0.1 (±0.05).
        slack = 0.05 * (len(values) + 1) + 1e-9
        assert max(values) - 0.1 - 1e-9 <= p["any_pct"] <= sum(values) + slack, unit
        assert all(0 <= i < len(stats["areas"]) for i in p["areas"]), unit
        if p["any_pct"] == 0:
            assert p["areas"] == [], unit


def test_peneda_geres_parishes_are_fully_protected(stats, cats):
    if "rnap" not in cats:
        pytest.skip("RNAP disabled in protected_config")
    parishes = blocks(stats, "freguesias")
    pnpg = next(i for i, a in enumerate(stats["areas"]) if a["cat"] == "rnap" and a["code"] == "PNPG")
    assert stats["areas"][pnpg]["name"] == "Peneda-Gerês"
    for dicofre in PENEDA_GERES:
        p = parishes[dicofre]
        assert p["rnap_pct"] >= 99.5, dicofre
        assert p["any_pct"] >= 99.5, dicofre
        assert p["areas"][0] == pnpg or pnpg in p["areas"], dicofre


def test_city_centres_are_unprotected(stats):
    parishes = blocks(stats, "freguesias")
    for dicofre in CITY_CENTRES:
        assert parishes[dicofre]["any_pct"] == 0, dicofre


def test_concelho_share_is_area_weighted(stats, cats):
    # Terras de Bouro (0310) holds part of the park: its share lies between its parishes' extremes.
    parishes = {k: v for k, v in blocks(stats, "freguesias").items() if k.startswith("0310")}
    c = stats["concelhos"]["0310"]["protection"]
    assert min(p["any_pct"] for p in parishes.values()) <= c["any_pct"] <= max(p["any_pct"] for p in parishes.values())
    assert c["any_pct"] > 30


def test_area_names_are_clean(stats):
    for a in stats["areas"]:
        assert a["name"] and a["name"] == " ".join(a["name"].split()), a
        assert a["cat"] in stats["categories"] and a["code"] and a["type"], a


def test_overlay_topology(cats):
    topo = json.loads(TOPO.read_text())
    assert list(topo["objects"]) == cats
    for cat in cats:
        geoms = topo["objects"][cat]["geometries"]
        assert {g["properties"]["pnct"] for g in geoms} == {True, False}, cat
        assert all(g["type"] in ("Polygon", "MultiPolygon") for g in geoms)


def test_size_budgets():
    assert len(gzip.compress(TOPO.read_bytes(), 9)) <= bp.TOPO_BUDGET_GZ
    assert len(gzip.compress(STATS.read_bytes(), 9)) <= bp.STATS_BUDGET_GZ
    assert META.stat().st_size < 2_000


def test_sites_csv():
    sites = pd.read_csv(ROOT / "data/processed/protected_sites.csv", dtype=str)
    assert {"category", "code", "name", "type", "area_ha", "mainland_ha"} <= set(sites.columns)
    assert not sites.duplicated(["category", "code"]).any()
