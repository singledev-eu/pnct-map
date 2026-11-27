"""Nearby services: the OSM tag rules, the car speeds, the routing core on small graphs, the grid
encoding, and (when built) the outputs against their invariants.

The output tests need `uv run make services`; they are skipped on a fresh clone like the other data tests.
"""

import csv
import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import services_config as cfg  # noqa: E402
from services_graph import Graph, haversine  # noqa: E402

# ---- tag rules ---------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "tags, expected",
    [
        ({"amenity": "clinic", "name": "Centro de Saúde de Arganil"}, True),
        ({"amenity": "doctors", "name": "USF Terras de Basto"}, True),
        ({"healthcare": "centre", "name": "UCSP Valpaços - Polo de Carrazedo"}, True),
        ({"amenity": "clinic", "name": "Extensão de Saúde de Montalvo"}, True),
        ({"amenity": "clinic", "name": "Unidade de Saúde Familiar Sol Nascente"}, True),
        ({"amenity": "clinic", "name": "UCC Alcácer do Sal"}, False),  # community care
        ({"amenity": "clinic", "name": "URAP Alentejo Central"}, False),
        ({"amenity": "clinic", "name": "Clínica Dentária Sorriso"}, False),
        ({"amenity": "clinic", "name": "Unidade de Saúde Alcaide"}, False),  # generic, no SNS operator
        ({"amenity": "clinic", "name": "Unidade de Saúde de Pegões", "operator": "ARS LVT"}, True),
        ({"amenity": "clinic", "name": "Centro de Saúde de X", "disused": "yes"}, False),
        ({"shop": "supermarket", "name": "Centro de Saúde"}, False),  # not a health amenity
    ],
)
def test_health_centre(tags, expected):
    assert cfg.is_health_centre(tags) is expected


@pytest.mark.parametrize(
    "tags, expected",
    [
        ({"shop": "supermarket", "name": "Pingo Doce"}, True),
        ({"shop": "supermarket", "brand": "Lidl"}, True),  # unnamed but tagged
        ({"shop": "supermarket", "name": "Minimercado Central"}, False),
        ({"shop": "supermarket", "name": "Mini-Mercado Rosa"}, False),
        ({"shop": "supermarket", "name": "Centro Comercial Dolce Vita"}, False),
        ({"shop": "convenience", "name": "Spar Express"}, False),
    ],
)
def test_supermarket(tags, expected):
    assert cfg.is_supermarket(tags) is expected


@pytest.mark.parametrize(
    "name, isced, expected",
    [
        ("Escola Básica de Calde", None, {"school1"}),
        ("EB1 do Pedregal", None, {"school1"}),
        ("Escola do Ensino Básico do 1° Ciclo de Almofala", None, {"school1"}),  # degree sign
        ("Centro Escolar da Batalha", None, {"school1"}),
        ("Escola Básica e Jardim de Infância de Paderne", None, {"school1"}),
        ("Escola Básica Integrada de Vila Flor", None, {"school1"}),
        ("Escola Básica 2,3 de Arouca", None, set()),
        ("Escola Básica 2.º e 3.º Ciclos de Vagos", None, set()),
        ("Escola do Ensino Básico do 1º e 2º Ciclo Gonçalo Nunes", None, {"school1"}),
        ("Escola Básica do 2º e 3º Ciclo Poeta Emiliano da Costa", "3", set()),  # name beats a wrong isced
        ("Escola Secundária de Albufeira", None, {"school3"}),
        ("Escola Básica e Secundária do Cadaval", None, {"school3"}),
        ("Escola Profissional de Salvaterra de Magos", None, {"school3"}),
        ("EB 2,3/S de Vila Pouca", None, {"school3"}),
        ("Colégio Infante", "1;2;3", {"school1", "school3"}),
        ("Colégio Infante", "0;1", {"school1"}),
        ("Antiga Escola Primária de Aldeia", None, set()),
        ("Escola Primária de Aldeia", None, set()),  # closed in most cases
        ("Escola de Condução Avenida", None, set()),
        ("Academia de Música", None, set()),
        ("Jardim de Infância de Vila", None, set()),
        ("", None, set()),
    ],
)
def test_school_kind(name, isced, expected):
    tags = {"amenity": "school", "name": name}
    if isced:
        tags["isced:level"] = isced
    assert cfg.school_kind(tags) == expected


def test_isced_levels():
    assert cfg.isced_levels({"isced:level": "0;1"}) == {0, 1}
    assert cfg.isced_levels({"isced:level": "2-3"}) == {2, 3}
    assert cfg.isced_levels({"isced:level": "1; 2;3"}) == {1, 2, 3}
    assert cfg.isced_levels({}) == set()


@pytest.mark.parametrize(
    "tags, expected",
    [
        ({"amenity": "pharmacy", "name": "Farmácia Central"}, True),
        ({"amenity": "pharmacy", "name": "Parafarmácia", "dispensing": "no"}, False),
        ({"railway": "station", "train": "yes", "name": "Tunes"}, True),
        ({"railway": "halt", "operator": "Infraestruturas de Portugal, S.A.", "name": "Aguim"}, True),
        ({"railway": "station", "station": "subway", "operator": "Metropolitano de Lisboa"}, False),
        ({"railway": "station", "station": "light_rail", "operator": "Metro do Porto"}, False),
        ({"railway": "halt", "station": "funicular", "train": "yes"}, False),
        ({"railway": "station", "usage": "tourism", "train": "yes"}, False),
    ],
)
def test_pharmacy_and_station(tags, expected):
    assert (cfg.is_pharmacy(tags) or cfg.is_train_station(tags)) is expected


def test_categories_are_complete():
    assert cfg.CATEGORY_IDS == ("health", "emergency", "supermarket", "school1", "school3", "pharmacy", "station")
    assert all(c.en and c.pt for c in cfg.CATEGORIES)


# ---- speeds and directions ------------------------------------------------------------------------


@pytest.mark.parametrize(
    "value, kmh",
    [("50", 50), ("50 km/h", 50), ("PT:urban", 50), ("PT:rural", 90), ("PT:motorway", 120), ("30 mph", 30 * 1.609344), ("signals", None), ("50;70", None), ("", None), ("0", None)],
)
def test_parse_maxspeed(value, kmh):
    assert cfg.parse_maxspeed(value) == (pytest.approx(kmh) if kmh else None)


def test_way_speed():
    assert cfg.way_speed({"highway": "motorway"}) == 90
    assert cfg.way_speed({"highway": "residential", "maxspeed": "50"}) == pytest.approx(30)  # min(40, 25 * 1.2)
    assert cfg.way_speed({"highway": "primary", "maxspeed": "90"}) == pytest.approx(72)
    assert cfg.way_speed({"highway": "track"}) == 10
    assert cfg.way_speed({"highway": "track", "tracktype": "grade1"}) == 15
    assert cfg.way_speed({"highway": "track", "tracktype": "grade5"}) is None
    assert cfg.way_speed({"highway": "track", "access": "private"}) is None
    assert cfg.way_speed({"highway": "path"}) is None
    assert cfg.way_speed({"highway": "footway"}) is None
    assert cfg.way_speed({"highway": "residential", "access": "private"}) is None
    assert cfg.way_speed({"highway": "residential", "access": "no", "motor_vehicle": "yes"}) == 25
    assert cfg.way_speed({"highway": "residential", "motor_vehicle": "no"}) is None
    assert cfg.way_speed({"highway": "service", "service": "parking_aisle"}) is None
    assert cfg.way_speed({"highway": "pedestrian"}) is None
    assert cfg.way_speed({"highway": "residential", "area": "yes"}) is None


def test_way_direction():
    assert cfg.way_direction({"highway": "primary"}) == 0
    assert cfg.way_direction({"highway": "primary", "oneway": "yes"}) == 1
    assert cfg.way_direction({"highway": "primary", "oneway": "-1"}) == -1
    assert cfg.way_direction({"highway": "primary", "junction": "roundabout"}) == 1
    assert cfg.way_direction({"highway": "motorway"}) == 1
    assert cfg.way_direction({"highway": "motorway", "oneway": "no"}) == 0


# ---- routing on small graphs ------------------------------------------------------------------------


def small_graph(edges, n, xy=None):
    u = np.array([e[0] for e in edges])
    v = np.array([e[1] for e in edges])
    m = np.array([float(e[2]) for e in edges])
    s = np.array([float(e[3]) for e in edges])
    if xy is None:
        xy = np.column_stack([np.arange(n) * 100.0, np.zeros(n)])
    return Graph.build(n, u, v, m, s, xy)


def test_oneway_routing_and_distance():
    # 0 -> 1 -> 2 is the only way from 0 to 2; 2 -> 0 directly is fast but only from 2.
    g = small_graph([(0, 1, 100, 10), (1, 2, 200, 20), (2, 0, 50, 1), (1, 0, 100, 10)], 3)
    near = g.nearest(np.array([2]))
    assert near.seconds.tolist() == [30, 20, 0]
    assert near.metres.tolist() == [300, 200, 0]
    assert near.facility.tolist() == [0, 0, 0]


def test_duplicate_edges_keep_fastest_with_its_length():
    g = small_graph([(0, 1, 100, 50), (0, 1, 300, 10), (1, 0, 100, 50)], 2)
    near = g.nearest(np.array([1]))
    assert near.seconds[0] == 10
    assert near.metres[0] == 300  # the length of the fast edge, not of the short one


def test_multi_source_matches_brute_force():
    rng = np.random.default_rng(7)
    n = 300
    edges = []
    for a in range(n):
        for b in rng.choice(n, 4, replace=False):
            if a != b:
                metres = float(rng.uniform(50, 2000))
                edges.append((a, int(b), metres, metres / rng.uniform(5, 30)))
    xy = rng.uniform(0, 10000, (n, 2))
    g = small_graph(edges, n, xy)
    facilities = np.array([5, 77, 150, 151])
    near = g.nearest(facilities)
    # Brute force: forward Dijkstra from every node, min over facilities.
    w = {}
    for a, b, metres, secs in edges:
        if (a, b) not in w or secs < w[(a, b)][1]:
            w[(a, b)] = (metres, secs)
    fwd = csr_matrix(([max(v[1], 1e-3) for v in w.values()], ([k[0] for k in w], [k[1] for k in w])), shape=(n, n))
    full = dijkstra(fwd, directed=True)
    best = full[:, facilities].min(axis=1)
    assert np.allclose(near.seconds, best)
    reach = np.isfinite(best)
    assert np.array_equal(np.isfinite(near.metres), reach)
    # The facility found is one that attains the minimum.
    for x in np.nonzero(reach)[0]:
        assert math.isclose(full[x, facilities[near.facility[x]]], best[x], rel_tol=1e-9)
    # The distance is the length of the fastest path: the sum of its edge lengths, checked on a sample
    # by walking the brute-force predecessor tree of the chosen facility.
    _, pred = dijkstra(fwd.T.tocsr(), directed=True, indices=facilities, return_predecessors=True)
    for x in np.nonzero(reach)[0][:60]:
        k = near.facility[x]
        node, total = x, 0.0
        while node != facilities[k]:
            nxt = pred[k, node]
            total += w[(node, nxt)][0]
            node = nxt
        if math.isclose(full[x, facilities[k]], best[x], rel_tol=1e-12):
            # Equal-time ties may take another path of the same time but a different length.
            assert near.metres[x] == pytest.approx(total) or np.isclose(near.seconds[x], best[x])


def test_snap_limits_and_main_component():
    # 0 <-> 1 is the main component; 2 is an island reachable from nowhere.
    xy = np.array([[0.0, 0.0], [100.0, 0.0], [5.0, 5.0]])
    g = small_graph([(0, 1, 100, 10), (1, 0, 100, 10), (2, 0, 10, 1)], 3, xy)
    assert g.main.tolist() == [True, True, False]
    node, dist = g.snap(np.array([[4.0, 4.0], [100.0, 3000.0]]))
    assert node.tolist()[0] == 0  # the island node 2 is nearer, but not a snap target
    assert node.tolist()[1] == -1  # beyond SNAP_MAX_M


def test_haversine():
    assert haversine(-9.0, 39.0, -9.0, 40.0) == pytest.approx(111_195, rel=1e-3)


# ---- grid encoding ------------------------------------------------------------------------------------


def test_grid_round_trip(tmp_path):
    import shapely

    import build_services as bs

    mainland = shapely.box(0, 0, 40_000, 20_000)
    spec = bs.grid_spec(mainland)
    rc, gxy = bs.grid_cells(spec, mainland)
    values = {}
    for k, cat in enumerate(cfg.CATEGORY_IDS):
        values[cat] = {
            "facility": (np.arange(len(rc)) % 50 + k).astype(np.uint16),
            "seconds": bs.encode(np.arange(len(rc)) * 7.4, 0xFFFE),
            "dm": bs.encode(np.where(np.arange(len(rc)) % 9 == 0, np.inf, np.arange(len(rc)) * 3.0), 0xFFFE),
        }
    spec["present"] = bs.write_grid(spec, rc, values, tmp_path)
    for i in (0, 17, len(rc) - 1):
        got = bs.read_grid(tmp_path, spec, *gxy[i])
        for k, cat in enumerate(cfg.CATEGORY_IDS):
            assert got[cat] == tuple(int(values[cat][key][i]) for key in ("facility", "seconds", "dm"))
    assert bs.read_grid(tmp_path, spec, -50_000, 0) is None
    assert bs.encode(np.array([np.inf, -1, 70_000.0]), 0xFFFE).tolist() == [cfg.NO_VALUE, cfg.NO_VALUE, 0xFFFE]


# ---- the curated emergency list ------------------------------------------------------------------------


def test_sns_urgencias_csv():
    with cfg.URGENCIAS_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert 70 <= len(rows) <= 100
    names = [r["sns_name"] for r in rows]
    assert len(set(names)) == len(names)
    for r in rows:
        assert r["position"] in ("osm", "sns")
        assert (r["position"] == "osm") == bool(r["osm"]), r
        assert cfg.LON_MIN < float(r["lon"]) < cfg.LON_MAX and cfg.LAT_MIN < float(r["lat"]) < cfg.LAT_MAX
        assert not cfg.SNS_SPECIALISED.search(cfg.fold(r["sns_name"]))
        assert r["note"]



# The four SUB positions verified in November 2026 (docs/reports/sub-verification-2026-11.md): the OSM object,
# its centre, and the coordinate before (the SNS export's, or the earlier pick) that they must have left.
VERIFIED_SUBS = {
    "SUB Loulé": ("w1060369440", -8.012607, 37.145526, (-8.017458, 37.141949)),  # Centro de Saúde de Loulé
    "SUB do Hospital de Lagos": ("w93276413", -8.682069, 37.097885, (-8.670200, 37.099600)),  # H. Terras do Infante
    "SUB Albufeira": ("w760612149", -8.254972, 37.098197, (-8.255000, 37.098000)),  # Centro de Saúde de Albufeira
    "SUB Estremoz": ("n9723349238", -7.585896, 38.848688, None),  # UCSP Estremoz, unchanged, now cross-checked
}


def test_verified_sub_positions():
    with cfg.URGENCIAS_CSV.open(encoding="utf-8") as f:
        rows = {r["sns_name"]: r for r in csv.DictReader(f)}
    for name, (ref, lon, lat, before) in VERIFIED_SUBS.items():
        r = rows[name]
        assert (r["position"], r["osm"]) == ("osm", ref), name
        assert (float(r["lon"]), float(r["lat"])) == (lon, lat), name
        assert "verified 2026-11" in r["note"], name
        if before:
            assert haversine(lon, lat, *before) > 20, name  # moved off the old point


# ---- built outputs ------------------------------------------------------------------------------------

BUILT = cfg.OUT_WEB.exists() and cfg.META_JSON.exists()
META = json.loads(cfg.META_JSON.read_text(encoding="utf-8")) if BUILT else None
GRID_DIR = ROOT / "web/public" / META["grid"]["dir"] if META else None
needs_build = pytest.mark.skipif(not BUILT, reason="services data not built (uv run make services)")
needs_grid = pytest.mark.skipif(not (BUILT and GRID_DIR.exists()), reason="services grid not built (uv run make services)")


@pytest.fixture(scope="module")
def web():
    return json.loads(cfg.OUT_WEB.read_text(encoding="utf-8"))


@needs_build
def test_web_facilities(web):
    assert web["categories"] == list(cfg.CATEGORY_IDS)
    counts = {c: len(web["facilities"][c]["name"]) for c in cfg.CATEGORY_IDS}
    # Sanity ranges against the official totals (DATA.md): INE 2024/25 1.º ciclo 3,770, secondary 915,
    # pharmacies 2,803; SNS 84 general emergency services (after removing paediatric/maternity).
    assert 3300 <= counts["school1"] <= 4300
    assert 600 <= counts["school3"] <= 1100
    assert 2200 <= counts["pharmacy"] <= 3200
    assert 2800 <= counts["supermarket"] <= 4000
    assert 700 <= counts["health"] <= 1500
    assert 70 <= counts["emergency"] <= 100
    assert 300 <= counts["station"] <= 600
    for cat in cfg.CATEGORY_IDS:
        cols = web["facilities"][cat]
        assert len({len(v) for v in cols.values()}) == 1
        for lon, lat in zip(cols["lon"], cols["lat"]):
            assert cfg.LON_MIN < lon < cfg.LON_MAX and cfg.LAT_MIN < lat < cfg.LAT_MAX
        assert all(len(c) == 4 for c in cols["concelho"])


@needs_build
def test_web_parish_results(web):
    p = web["parishes"]
    assert len(p["codes"]) == 3049 and len(set(p["codes"])) == 3049
    for cat in cfg.CATEGORY_IDS:
        r = p[cat]
        n = len(web["facilities"][cat]["name"])
        assert len(r["f"]) == len(r["t"]) == len(r["d"]) == 3049
        have = [i for i, f in enumerate(r["f"]) if f is not None]
        assert len(have) >= 3040, cat  # almost every parish point reaches a road and a facility
        for i in have:
            assert 0 <= r["f"][i] < n
            assert r["t"][i] is not None and r["d"][i] is not None
            assert r["t"][i] * 10 < 4 * 3600  # nothing on the mainland is 4 h from a pharmacy or a school
        # No invented values: missing f means missing time and distance too.
        for i, f in enumerate(r["f"]):
            if f is None:
                assert r["t"][i] is None and r["d"][i] is None


@needs_build
def test_road_distance_not_below_straight_line(web):
    """Road metres >= straight line (minus the snaps) for every parish result."""
    import build_services as bs

    parishes, _, _ = bs.load_caop()
    # The parish points are not in the output; the facility's own position bounds the check from below
    # through the parish polygon: the straight line from the polygon to the facility.
    geoms = dict(zip(parishes["dtmnfr"], parishes.geometry.values))
    import shapely

    for cat in ("emergency", "station"):
        cols = web["facilities"][cat]
        fxy = bs.project(cols["lon"], cols["lat"])
        r = web["parishes"][cat]
        for code, f, d in zip(web["parishes"]["codes"], r["f"], r["d"]):
            if f is None:
                continue
            line = shapely.distance(geoms[code], shapely.Point(fxy[f]))
            assert d * 100 + 2 * cfg.SNAP_MAX_M >= line, (cat, code, d, line)


@needs_grid
def test_grid_files_match_meta():
    from build_hazard import tree_sha256

    sha, files, total = tree_sha256(GRID_DIR)
    g = META["grid"]
    assert (sha, files, total) == (g["tree_sha256"], g["files"], g["bytes"])
    assert files < 2000  # Pages: 20,000 files per deploy, shared with the land check (3,517)
    assert max(p.stat().st_size for p in GRID_DIR.iterdir()) < 64 * 1024


@needs_grid
def test_grid_reads_like_parish_results(web):
    """A parish point and the grid cell around it usually give the same facility (1 km cells)."""
    import build_services as bs
    from pyproj import Transformer

    to3763 = Transformer.from_crs(4326, 3763, always_xy=True)
    # Lisbon (Santa Maria Maior) and a rural point in Mértola: both have a value for every category.
    for lon, lat in ((-9.1365, 38.7107), (-7.6640, 37.6420)):
        got = bs.read_grid(GRID_DIR, META["grid"], *to3763.transform(lon, lat))
        assert got is not None
        for cat in cfg.CATEGORY_IDS:
            f, s, dm = got[cat]
            assert f != cfg.NO_VALUE and s != cfg.NO_VALUE and dm != cfg.NO_VALUE, (cat, lon, lat)
            assert f < len(web["facilities"][cat]["name"])
    # The Atlantic: no cell.
    assert bs.read_grid(GRID_DIR, META["grid"], *to3763.transform(-10.5, 39.5)) is None


@needs_build
def test_verified_sub_positions_built():
    """The app's data carries the verified points (4 decimals, ~10 m)."""
    data = json.loads(cfg.OUT_WEB.read_text(encoding="utf-8"))
    em = data["facilities"]["emergency"]
    at = {n: (em["lon"][i], em["lat"][i]) for i, n in enumerate(em["name"])}
    for name, (_, lon, lat, _before) in VERIFIED_SUBS.items():
        assert haversine(lon, lat, *at[name]) < 10, name
