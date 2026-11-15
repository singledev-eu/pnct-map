"""A tiny prepared dataset with hand-computable answers (see the comments) for the catalog tests.

Districts 01 Alpha, 02 Beta, 03 Gamma. Concelhos: 0101 Aa (full PNCT), 0102 Ab (partial), 0201 Ba
(none), 0301 Ga (full). Census parish 010199 was split in 2025 into 010102 and 010103.
"""

import json

import pandas as pd
import pytest

from insights.catalog.base import Data

PARISHES = [
    # dicofre, name, dtmn, concelho, dt, distrito, pnct, area, coast_km, touches, porto, lisbon, opo, lis, fao, census, same, p11, p21
    ("010101", "Anta", "0101", "Aa", "01", "Alpha", True, 100.0, 5.0, True, 30.0, 300.0, 40.0, 310.0, 500.0, "010101", True, 120, 100),
    ("010102", "Bouça", "0101", "Aa", "01", "Alpha", True, 50.0, 12.0, False, 25.0, 280.0, 35.0, 290.0, 480.0, "010199", False, None, None),
    ("010103", "Cela (Santo André)", "0101", "Aa", "01", "Alpha", True, 30.0, 20.0, False, 45.0, 260.0, 50.0, 270.0, 460.0, "010199", False, None, None),
    ("010201", "Dornas", "0102", "Ab", "01", "Alpha", True, 20.0, 8.0, False, 60.0, 200.0, 65.0, 205.0, 400.0, "010201", True, 1000, 1100),
    ("010202", "Eira", "0102", "Ab", "01", "Alpha", False, 10.0, 1.0, False, 10.0, 290.0, 12.0, 295.0, 490.0, "010202", True, 5000, 5200),
    ("020101", "Fonte", "0201", "Ba", "02", "Beta", False, 40.0, 0.5, True, 300.0, 5.0, 305.0, 8.0, 250.0, "020101", True, 20000, 19000),
    ("030101", "Gralha", "0301", "Ga", "03", "Gamma", True, 5.0, 60.0, False, 200.0, 150.0, 210.0, 140.0, 30.0, "030101", True, 50, 40),
]
UNITS = [  # code, name, dtmn, km2, share, pnct, p11, p21
    ("010101", "Anta", "0101", 100.0, 1.0, True, 120, 100),
    ("010199", "União de Bouça e Cela", "0101", 80.0, 1.0, True, 300, 250),
    ("010201", "Dornas", "0102", 20.0, 1.0, True, 1000, 1100),
    ("010202", "Eira", "0102", 10.0, 0.0, False, 5000, 5200),
    ("020101", "Fonte", "0201", 40.0, 0.0, False, 20000, 19000),
    ("030101", "Gralha", "0301", 5.0, 1.0, True, 50, 40),
]
MUNICIPALITIES = [  # dtmn, concelho, distrito, n, n_pnct, area, pnct_km2, p11, p21, status, sale, seat, seat_coast
    ("0101", "Aa", "Alpha", 3, 3, 180.0, 180.0, 420, 350, "full", 500.0, "Aa", 10.0),
    ("0102", "Ab", "Alpha", 2, 1, 30.0, 20.0, 6000, 6300, "partial", 1500.0, "Ab", 5.0),
    ("0201", "Ba", "Beta", 1, 0, 40.0, 0.0, 20000, 19000, "none", 3000.0, "Ba", 1.0),
    ("0301", "Ga", "Gamma", 1, 1, 5.0, 5.0, 50, 40, "full", 400.0, "Ga", 50.0),
]
TOTAL_2011, TOTAL_2021 = 26470, 25690


def ref(en, pt):
    return {"en": en, "pt": pt, "lon": -8.0, "lat": 40.0, "x": 0.0, "y": 0.0, "source": "test"}


def write_fixture(path):
    cols = ["dicofre", "name", "dtmn", "concelho", "dt", "distrito", "pnct", "area_km2", "coast_km", "touches_coast",
            "porto_km", "lisbon_km", "opo_km", "lis_km", "fao_km", "census_code", "census_same", "pop2011", "pop2021"]
    p = pd.DataFrame(PARISHES, columns=cols)
    p["centroid_inside"] = True
    # Bouça is disputed: legally PNCT (pnct True, counted in totals) but missing from the IEFP list,
    # so nothing may name it (closest-to-Porto falls to Anta, the OPO airport too).
    p["status"] = ["disputed" if c == "010102" else ("pnct" if v else "not_pnct") for c, v in zip(p.dicofre, p.pnct)]
    p["iefp_pnct"] = p.pnct & (p.dicofre != "010102")
    p["pop2011"] = p.pop2011.astype("Int64")
    p["pop2021"] = p.pop2021.astype("Int64")
    p.to_csv(path / "parishes.csv", index=False)
    pd.DataFrame(UNITS, columns=["census_code", "census_name", "dtmn", "unit_km2", "pnct_share", "pnct", "pop2011", "pop2021"]).to_csv(
        path / "census_units.csv", index=False)
    pd.DataFrame(MUNICIPALITIES, columns=["dtmn", "concelho", "distrito", "n_parishes", "n_pnct", "area_km2", "pnct_km2",
                                          "pop2011", "pop2021", "status", "sale_m2", "seat", "seat_coast_km"]).to_csv(
        path / "municipalities.csv", index=False)
    pd.DataFrame([("01", "Alpha", 210.0, 200.0), ("02", "Beta", 40.0, 0.0), ("03", "Gamma", 5.0, 5.0)],
                 columns=["dt", "distrito", "area_km2", "pnct_km2"]).to_csv(path / "districts.csv", index=False)
    national = {
        "mainland_area_km2_caop": 255.0,
        "census_mainland": {"2011": TOTAL_2011, "2021": TOTAL_2021},
        "sale_m2": {"period": "2025", "portugal": 2000.0, "mainland": 2010.0,
                    "lowest_municipality": {"value": 400.0, "municipality": "Ga", "tied": ["Ga"], "with_value": 4,
                                            "municipalities": 5, "no_value": ["Ilha"]}},
        "reference_points": {"porto": ref("Porto", "Porto"), "lisbon": ref("Lisbon", "Lisboa"),
                             "opo": ref("Porto airport (OPO)", "aeroporto do Porto (OPO)"),
                             "lis": ref("Lisbon airport (LIS)", "aeroporto de Lisboa (LIS)"),
                             "fao": ref("Faro airport (FAO)", "aeroporto de Faro (FAO)")},
        "crosswalk": {"census_2021_parishes": 6, "split_census_parishes": 1, "one_to_one": 5, "not_clean": []},
        "status": {"legal_pnct": 5, "iefp_pnct": 4, "undisputed_pnct": 4,
                   "disputed": [{"code": "010102", "name": "Bouça", "concelho": "Aa", "legal": "pnct", "iefp": "not_pnct"}]},
        "sources": {"legal": {"title": "Portaria 208/2017", "checked": "2026-11-15", "url": "https://example.test/portaria"}},
    }
    (path / "national.json").write_text(json.dumps(national), encoding="utf-8")
    sq = lambda x, y: [[[x, y], [x + 10000, y], [x + 10000, y + 10000], [x, y + 10000], [x, y]]]  # noqa: E731
    (path / "map.json").write_text(json.dumps({r[0]: sq(i * 10000, (i % 3) * 10000) for i, r in enumerate(PARISHES)}))
    return path


@pytest.fixture
def fixture_dir(tmp_path):
    return write_fixture(tmp_path)


@pytest.fixture
def data(fixture_dir):
    return Data(fixture_dir)
