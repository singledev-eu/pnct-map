"""web/data/cities.json: the concelho seats (OSM admin_centre, scripts/build_cities.py)."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CITIES = json.loads((ROOT / "web/data/cities.json").read_text(encoding="utf-8"))
TOPO = json.loads((ROOT / "web/data/pnct.topo.json").read_text(encoding="utf-8"))
DISTRICTS = {
    "Aveiro", "Beja", "Braga", "Bragança", "Castelo Branco", "Coimbra", "Évora", "Faro", "Guarda",
    "Leiria", "Lisboa", "Portalegre", "Porto", "Santarém", "Setúbal", "Viana do Castelo", "Vila Real", "Viseu",
}


def test_one_seat_per_mainland_concelho():
    concelhos = {g["properties"]["dicofre"][:4] for g in TOPO["objects"]["parishes"]["geometries"]}
    dicos = [f["properties"]["dico"] for f in CITIES["features"]]
    assert len(dicos) == len(set(dicos)) == 278
    assert set(dicos) == concelhos


def test_the_18_district_capitals():
    capitals = {f["properties"]["name"] for f in CITIES["features"] if f["properties"]["capital"]}
    assert capitals == DISTRICTS


def test_points_on_mainland_and_named():
    for f in CITIES["features"]:
        lon, lat = f["geometry"]["coordinates"]
        assert -9.6 < lon < -6.1 and 36.9 < lat < 42.2, f["properties"]
        assert f["properties"]["name"].strip()


def test_named_seats_are_where_expected():
    seats = {f["properties"]["name"]: f["properties"]["dico"] for f in CITIES["features"]}
    assert seats["Coruche"] == "1409"  # Erra (140911) is in Coruche
    assert seats["Vila Nova de Foz Côa"] == "0914"  # CAOP's accents (OSM has "Coa")


def test_source_and_licence_recorded():
    meta = CITIES["meta"]
    assert "OpenStreetMap" in meta["source"] and meta["licence"].startswith("ODbL") and meta["fetched_at"]
