"""Build the nearby-services data (docs/nearby-services/DATA.md).

Inputs: the pinned Geofabrik extract and the SNS list (fetch_services.py), the hand-checked
data/services/sns_urgencias.csv, CAOP 2025 and web/data/cities.json (concelho seats).

  1. Facilities: OSM objects classified by services_config (nodes, and areas at their representative
     point), inside mainland Portugal (CAOP districts), node/area duplicates merged; the SNS emergency
     services from the CSV. Each gets its concelho (DICO).
  2. The car graph (services_graph.read_roads), its largest strongly connected component, and one
     multi-source Dijkstra per category on the reversed graph.
  3. Read-offs:
       - parishes: from the parish's main settlement (an OSM place node inside it, DATA.md), else its
         point-on-surface; concelhos: from the seat in cities.json;
       - the land check grid: 1 km cells (EPSG:3763), from the road node nearest each cell centre.
     Every point snaps to the nearest node of the main component; a snap over SNAP_MAX_M is no value.

Outputs:
  web/data/services.json            lazy: facilities per category and the parish/concelho results
  web/data/services.meta.json       bundled: grid parameters, presence bitmap, sources, dates, labels
  web/public/services/grid-<sha8>/  gitignored: <i>.bin, one zlib file per GRID_CHUNK² cells, uint16
                                    little-endian [category][facility, seconds, metres/10][cell]
  data/services/build_report.json   counts, discarded snaps, validation, timings, sizes (tracked)

Usage: uv run python scripts/build_services.py
"""

from __future__ import annotations

import csv
import json
import math
import resource
import sys
import tempfile
import time
import zlib
from pathlib import Path

import numpy as np
import pyogrio
import shapely
from pyproj import Transformer

sys.path.insert(0, str(Path(__file__).resolve().parent))

import services_config as cfg  # noqa: E402
from build_hazard import publish as publish_dir, tree_sha256  # noqa: E402,F401
from fetch_services import pbf_path  # noqa: E402
from services_graph import Graph, cached_roads, haversine  # noqa: E402

TO_3763 = Transformer.from_crs(4326, 3763, always_xy=True)
TO_4326 = Transformer.from_crs(3763, 4326, always_xy=True)
CITIES_JSON = cfg.ROOT / "web/data/cities.json"


def log(msg: str) -> None:
    print(msg, flush=True)


# ---------------------------------------------------------------------------------------------
# Geography
# ---------------------------------------------------------------------------------------------


def load_caop():
    parishes = pyogrio.read_dataframe(cfg.CAOP_GPKG, layer="cont_freguesias", columns=["dtmnfr", "freguesia", "municipio"])
    concelhos = pyogrio.read_dataframe(cfg.CAOP_GPKG, layer="cont_municipios", columns=["dtmn", "municipio"])
    parishes = parishes.to_crs(3763)
    concelhos = concelhos.to_crs(3763)
    mainland = shapely.union_all(concelhos.geometry.values)
    return parishes, concelhos, mainland


def project(lon, lat) -> np.ndarray:
    x, y = TO_3763.transform(np.asarray(lon, dtype=float), np.asarray(lat, dtype=float))
    return np.column_stack([x, y])


def locate(points_xy: np.ndarray, polygons, codes) -> list[str | None]:
    """The code of the polygon containing each point (None outside every polygon)."""
    tree = shapely.STRtree(polygons)
    pts = shapely.points(points_xy)
    pi, gi = tree.query(pts, predicate="within")
    out: list[str | None] = [None] * len(points_xy)
    for p, g in zip(pi, gi):
        out[p] = codes[g]
    return out


# ---------------------------------------------------------------------------------------------
# Facilities
# ---------------------------------------------------------------------------------------------

KEYS = ("amenity", "healthcare", "shop", "railway", "place")


def read_pois(pbf: Path) -> tuple[list[dict], list[dict], np.ndarray]:
    """OSM objects in any category, the place nodes (for parish points), and active rail line vertices."""
    import osmium
    from shapely import wkb

    fab = osmium.geom.WKBFactory()
    facilities, places, rail = [], [], []
    started = time.time()
    fp = osmium.FileProcessor(str(pbf)).with_locations().with_areas().with_filter(osmium.filter.KeyFilter(*KEYS))
    for o in fp:
        tags = dict(o.tags)
        if o.is_way() and tags.get("railway") == "rail" and "service" not in tags:
            try:
                rail.extend((n.location.lon, n.location.lat) for n in o.nodes)
            except osmium.InvalidLocationError:
                pass
            continue
        place = tags.get("place") if o.is_node() else None
        cats = cfg.osm_categories(tags)
        if not cats and place not in cfg.PLACE_RANK:
            continue
        try:
            if o.is_node():
                lon, lat, ref = o.location.lon, o.location.lat, f"n{o.id}"
            elif o.is_area():
                geom = wkb.loads(fab.create_multipolygon(o), hex=True)
                p = geom.representative_point()
                lon, lat = p.x, p.y
                ref = f"{'w' if o.from_way() else 'r'}{o.orig_id()}"
            else:
                continue
        except Exception:  # broken multipolygons, missing node locations
            continue
        if not (cfg.LON_MIN <= lon <= cfg.LON_MAX and cfg.LAT_MIN <= lat <= cfg.LAT_MAX):
            continue
        if cats:
            facilities.append({"ref": ref, "name": tags.get("name", "").strip(), "lon": lon, "lat": lat, "cats": sorted(cats), "area": not o.is_node(), "tags": tags})
        if place in cfg.PLACE_RANK and tags.get("name"):
            places.append({"name": tags["name"], "place": place, "lon": lon, "lat": lat})
    log(f"  pois: {len(facilities):,} facility objects, {len(places):,} places, {len(rail):,} rail vertices ({time.time() - started:.0f} s)")
    return facilities, places, np.asarray(rail)


def dedupe(items: list[dict], radius_m: float = 150) -> tuple[list[dict], int]:
    """Merge a node and an area (or two objects) with the same folded name within radius_m; areas win."""
    items = sorted(items, key=lambda f: (not f["area"], f["ref"]))
    if not items:
        return [], 0
    from scipy.spatial import cKDTree

    xy = project([f["lon"] for f in items], [f["lat"] for f in items])
    tree = cKDTree(xy)
    dropped = np.zeros(len(items), dtype=bool)
    for i, f in enumerate(items):
        if dropped[i]:
            continue
        for j in tree.query_ball_point(xy[i], radius_m):
            if j > i and not dropped[j] and (cfg.fold(items[j]["name"]) == cfg.fold(f["name"]) or not items[j]["name"]):
                dropped[j] = True
    return [f for f, d in zip(items, dropped) if not d], int(dropped.sum())


def load_emergency(sns_rows: list[dict]) -> tuple[list[dict], list[str]]:
    """The hand-checked CSV; every row's service must still be in the SNS list (else: a warning in the report)."""
    names = {r["nome_do_servico_de_urgencia"] for r in sns_rows}
    out, missing = [], []
    with cfg.URGENCIAS_CSV.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if cfg.SNS_SPECIALISED.search(cfg.fold(row["sns_name"])):
                raise SystemExit(f"sns_urgencias.csv: {row['sns_name']} is a specialised (maternity/paediatric) service")
            if row["position"] not in ("osm", "sns") or (row["position"] == "osm") != bool(row["osm"]):
                raise SystemExit(f"sns_urgencias.csv: bad position/osm for {row['sns_name']}")
            if row["sns_name"] not in names:
                missing.append(row["sns_name"])
            out.append({"ref": row["osm"] or "", "name": row["sns_name"], "lon": float(row["lon"]), "lat": float(row["lat"]), "area": False})
    return out, missing


# ---------------------------------------------------------------------------------------------
# Parish and concelho points
# ---------------------------------------------------------------------------------------------


def parish_points(parishes, places: list[dict]) -> tuple[np.ndarray, list[str], list[str | None]]:
    """Per parish: the best-ranked OSM place inside it, preferring one whose name is in the parish name
    (city > town > village > ...); else the polygon's point-on-surface. Returns (xy, method, place name)."""
    pxy = project([p["lon"] for p in places], [p["lat"] for p in places])
    inside = locate(pxy, parishes.geometry.values, list(range(len(parishes))))
    by_parish: dict[int, list[int]] = {}
    for i, k in enumerate(inside):
        if k is not None:
            by_parish.setdefault(k, []).append(i)
    xy = np.zeros((len(parishes), 2))
    method: list[str] = []
    origin: list[str | None] = []
    for k, (name, geom) in enumerate(zip(parishes["freguesia"], parishes.geometry.values)):
        folded = cfg.fold(name)
        cands = by_parish.get(k, [])
        if cands:
            def key(i):
                pn = cfg.fold(places[i]["name"])
                named = len(pn) >= 3 and (pn in folded or folded in pn)
                return (not named, cfg.PLACE_RANK[places[i]["place"]])
            best = min(cands, key=key)
            xy[k] = pxy[best]
            method.append("place-named" if not key(best)[0] else f"place-{places[best]['place']}")
            origin.append(places[best]["name"])
        else:
            p = geom.representative_point()
            xy[k] = (p.x, p.y)
            method.append("point-on-surface")
            origin.append(None)
    return xy, method, origin


def concelho_points(concelhos) -> tuple[np.ndarray, list[str], list[str | None]]:
    """Per concelho: its seat (web/data/cities.json, OSM admin_centre), else the point-on-surface."""
    seats = {f["properties"]["dico"]: f for f in json.loads(CITIES_JSON.read_text())["features"]}
    xy = np.zeros((len(concelhos), 2))
    method, origin = [], []
    for k, (dico, geom) in enumerate(zip(concelhos["dtmn"], concelhos.geometry.values)):
        if dico in seats:
            lon, lat = seats[dico]["geometry"]["coordinates"]
            xy[k] = project([lon], [lat])[0]
            method.append("seat")
            origin.append(seats[dico]["properties"]["name"])
        else:
            p = geom.representative_point()
            xy[k] = (p.x, p.y)
            method.append("point-on-surface")
            origin.append(None)
    return xy, method, origin


# ---------------------------------------------------------------------------------------------
# The grid
# ---------------------------------------------------------------------------------------------


def grid_spec(mainland) -> dict:
    x0, y0, x1, y1 = mainland.bounds
    c = cfg.GRID_CELL_M
    left, top = math.floor(x0 / c) * c, math.ceil(y1 / c) * c
    width, height = math.ceil((x1 - left) / c), math.ceil((top - y0) / c)
    chunk = cfg.GRID_CHUNK
    return {
        "crs": "EPSG:3763",
        "origin": [left, top],
        "cell": c,
        "width": width,
        "height": height,
        "chunk": chunk,
        "chunk_cols": math.ceil(width / chunk),
        "chunk_rows": math.ceil(height / chunk),
    }


def grid_cells(spec: dict, mainland) -> tuple[np.ndarray, np.ndarray]:
    """Row/col and centre xy of every cell that touches mainland Portugal."""
    c = spec["cell"]
    cols, rows = np.meshgrid(np.arange(spec["width"]), np.arange(spec["height"]))
    cx = spec["origin"][0] + (cols.ravel() + 0.5) * c
    cy = spec["origin"][1] - (rows.ravel() + 0.5) * c
    near = shapely.buffer(mainland, c * 0.71)  # the cell's half-diagonal: any cell touching land
    shapely.prepare(near)
    keep = shapely.contains_xy(near, cx, cy)
    rc = np.column_stack([rows.ravel()[keep], cols.ravel()[keep]])
    return rc, np.column_stack([cx[keep], cy[keep]])


def encode(values: np.ndarray, cap: int) -> np.ndarray:
    out = np.full(values.shape, cfg.NO_VALUE, dtype=np.uint16)
    ok = np.isfinite(values) & (values >= 0)
    out[ok] = np.minimum(np.rint(values[ok]), cap).astype(np.uint16)
    return out


def write_grid(spec: dict, rc: np.ndarray, per_cat: dict[str, dict[str, np.ndarray]], out: Path) -> str:
    """One zlib file per chunk with any cell; returns the presence bitmap (hex)."""
    ncat = len(cfg.CATEGORY_IDS)
    ch = spec["chunk"]
    full = np.full((ncat, 3, spec["height"], spec["width"]), cfg.NO_VALUE, dtype=np.uint16)
    for k, cat in enumerate(cfg.CATEGORY_IDS):
        r = per_cat[cat]
        full[k, 0, rc[:, 0], rc[:, 1]] = r["facility"]
        full[k, 1, rc[:, 0], rc[:, 1]] = r["seconds"]
        full[k, 2, rc[:, 0], rc[:, 1]] = r["dm"]
    present = bytearray((spec["chunk_rows"] * spec["chunk_cols"] + 7) // 8)
    out.mkdir(parents=True, exist_ok=True)
    for cr in range(spec["chunk_rows"]):
        for cc in range(spec["chunk_cols"]):
            block = full[:, :, cr * ch : (cr + 1) * ch, cc * ch : (cc + 1) * ch]
            if (block == cfg.NO_VALUE).all():
                continue
            padded = np.full((ncat, 3, ch, ch), cfg.NO_VALUE, dtype=np.uint16)
            padded[:, :, : block.shape[2], : block.shape[3]] = block
            i = cr * spec["chunk_cols"] + cc
            (out / f"{i}.bin").write_bytes(zlib.compress(padded.astype("<u2").tobytes(), 9))
            present[i >> 3] |= 1 << (i & 7)
    return present.hex()


def read_grid(directory: Path, spec: dict, x: float, y: float) -> dict[str, tuple[int, int, int]] | None:
    """(facility, seconds, metres/10) per category at EPSG:3763 (x, y), as web/src/services.ts reads it."""
    col = math.floor((x - spec["origin"][0]) / spec["cell"])
    row = math.floor((spec["origin"][1] - y) / spec["cell"])
    if not (0 <= row < spec["height"] and 0 <= col < spec["width"]):
        return None
    ch = spec["chunk"]
    i = (row // ch) * spec["chunk_cols"] + col // ch
    if not (bytes.fromhex(spec["present"])[i >> 3] >> (i & 7)) & 1:
        return None
    a = np.frombuffer(zlib.decompress((directory / f"{i}.bin").read_bytes()), dtype="<u2").reshape(len(cfg.CATEGORY_IDS), 3, ch, ch)
    r, c = row % ch, col % ch
    return {cat: tuple(int(v) for v in a[k, :, r, c]) for k, cat in enumerate(cfg.CATEGORY_IDS)}


# ---------------------------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------------------------


def build() -> dict:
    t0 = time.time()
    timings: dict[str, float] = {}
    report: dict = {"osm_date": cfg.OSM_DATE, "osm_sha256": cfg.OSM_SHA256}
    pbf = pbf_path()
    sns_fetch = json.loads((cfg.CACHE / "sns" / "fetch.json").read_text())
    sns_rows = json.loads((cfg.CACHE / "sns" / "urgencias.json").read_text(encoding="utf-8"))

    parishes, concelhos, mainland = load_caop()
    dicos = list(concelhos["dtmn"])
    timings["caop"] = time.time() - t0

    # 1. facilities ------------------------------------------------------------------------------
    t = time.time()
    raw, places, rail = read_pois(pbf)
    timings["pois"] = time.time() - t
    xy_raw = project([f["lon"] for f in raw], [f["lat"] for f in raw])
    conc = locate(xy_raw, concelhos.geometry.values, dicos)
    # Stations must lie on an active railway (railway=rail within 100 m): stations on closed lines are out.
    from scipy.spatial import cKDTree

    rail_tree = cKDTree(project(rail[:, 0], rail[:, 1])) if len(rail) else None
    facilities: dict[str, list[dict]] = {c: [] for c in cfg.CATEGORY_IDS}
    dropped_station = 0
    outside = 0
    for f, xy, dico in zip(raw, xy_raw, conc):
        if dico is None:
            outside += 1
            continue
        f["concelho"] = dico
        for cat in f["cats"]:
            if cat == "station" and (rail_tree is None or rail_tree.query(xy)[0] > 100):
                dropped_station += 1
                continue
            facilities[cat].append(f)
    merged = {}
    for cat in list(facilities):
        facilities[cat], merged[cat] = dedupe(facilities[cat])
    emergency, missing = load_emergency(sns_rows)
    exy = project([f["lon"] for f in emergency], [f["lat"] for f in emergency])
    for f, dico in zip(emergency, locate(exy, concelhos.geometry.values, dicos)):
        if dico is None:
            raise SystemExit(f"sns_urgencias.csv: {f['name']} is outside mainland Portugal")
        f["concelho"] = dico
    facilities["emergency"] = sorted(emergency, key=lambda f: f["name"])
    for cat in facilities:
        if cat != "emergency":
            facilities[cat].sort(key=lambda f: (f["concelho"], cfg.fold(f["name"]), f["ref"]))
    report["facilities"] = {c: len(v) for c, v in facilities.items()}
    report["merged_duplicates"] = merged
    report["outside_mainland"] = outside
    report["stations_off_active_rail"] = dropped_station
    report["sns_missing_from_list"] = missing
    report["unnamed"] = {c: sum(1 for f in v if not f["name"]) for c, v in facilities.items()}
    log(f"  facilities: {report['facilities']}")

    # 2. graph -------------------------------------------------------------------------------------
    t = time.time()
    roads = cached_roads(pbf, cfg.OSM_SHA256)
    timings["roads"] = time.time() - t
    t = time.time()
    node_xy = project(roads.lon, roads.lat)
    graph = Graph.build(len(roads.lon), roads.u, roads.v, roads.metres, roads.seconds, node_xy)
    timings["graph"] = time.time() - t
    report["graph"] = {"ways": roads.ways, "nodes": int(graph.n), "edges": int(len(graph.edge_keys)), "main_component_nodes": int(graph.main.sum())}
    log(f"  graph: {report['graph']} ({timings['graph']:.0f} s)")

    # 3. snap and route ------------------------------------------------------------------------------
    pxy, pmethod, porigin = parish_points(parishes, places)
    cxy, cmethod, corigin = concelho_points(concelhos)
    plonlat = np.column_stack(TO_4326.transform(pxy[:, 0], pxy[:, 1]))
    with cfg.POINTS_CSV.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["dicofre", "freguesia", "lon", "lat", "method", "place"])
        for code, name, (lon, lat), m, o in zip(parishes["dtmnfr"], parishes["freguesia"], plonlat, pmethod, porigin):
            w.writerow([code, name, f"{lon:.6f}", f"{lat:.6f}", m, o or ""])
    spec = grid_spec(mainland)
    rc, gxy = grid_cells(spec, mainland)
    report["points"] = {
        "parish_method": {m: pmethod.count(m) for m in sorted(set(pmethod))},
        "concelho_method": {m: cmethod.count(m) for m in sorted(set(cmethod))},
        "grid_cells": int(len(gxy)),
    }
    pnode, pdist = graph.snap(pxy)
    cnode, cdist = graph.snap(cxy)
    gnode, gdist = graph.snap(gxy)
    report["snaps"] = {
        "parish_over_limit": [str(c) for c, n in zip(parishes["dtmnfr"], pnode) if n < 0],
        "concelho_over_limit": [str(c) for c, n in zip(dicos, cnode) if n < 0],
        "grid_over_limit": int((gnode < 0).sum()),
        "parish_snap_m_p50_p95_max": [round(float(np.percentile(pdist, q))) for q in (50, 95, 100)],
    }

    per_parish: dict[str, dict] = {}
    per_concelho: dict[str, dict] = {}
    grid_values: dict[str, dict[str, np.ndarray]] = {}
    discarded: dict[str, list] = {}
    t = time.time()
    for cat in cfg.CATEGORY_IDS:
        fl = facilities[cat]
        fxy = project([f["lon"] for f in fl], [f["lat"] for f in fl])
        fnode, fdist = graph.snap(fxy)
        ok = fnode >= 0
        discarded[cat] = [{"name": f["name"], "ref": f["ref"], "snap_m": round(float(d))} for f, d, k in zip(fl, fdist, ok) if not k]
        for f, d in zip(fl, fdist):
            f["snap_m"] = float(d)
        idx = np.nonzero(ok)[0]
        tc = time.time()
        near = graph.nearest(fnode[ok])
        fac = np.where(near.facility >= 0, idx[np.maximum(near.facility, 0)], -1)  # back to the full list
        log(f"  route {cat}: {ok.sum()} of {len(fl)} facilities snapped, Dijkstra + distances {time.time() - tc:.1f} s")

        def read(nodes):
            good = nodes >= 0
            n = np.maximum(nodes, 0)
            return (
                np.where(good, fac[n], -1),
                np.where(good, near.seconds[n], np.inf),
                np.where(good, near.metres[n], np.inf),
            )

        per_parish[cat] = read(pnode)
        per_concelho[cat] = read(cnode)
        gf, gs, gm = read(gnode)
        grid_values[cat] = {
            "facility": np.where(gf >= 0, gf, cfg.NO_VALUE).astype(np.uint16),
            "seconds": encode(np.where(gf >= 0, gs, np.inf), 0xFFFE),
            "dm": encode(np.where(gf >= 0, gm / 10, np.inf), 0xFFFE),
        }
    timings["routing"] = time.time() - t
    report["discarded_snaps"] = discarded

    # 4. outputs -------------------------------------------------------------------------------------
    def results(codes, values, origins):
        """Per category, aligned with codes: f (facility index), t (drive time in 10 s units) and d (road
        distance in 100 m units), null together where there is no value. The panel shows whole minutes
        and one decimal of km, so this is the precision it needs."""
        out = {}
        for cat in cfg.CATEGORY_IDS:
            f, s, m = values[cat]
            ok = [x >= 0 and np.isfinite(sv) and np.isfinite(mv) for x, sv, mv in zip(f, s, m)]
            out[cat] = {
                "f": [int(x) if g else None for x, g in zip(f, ok)],
                "t": [int(round(x / 10)) if g else None for x, g in zip(s, ok)],
                "d": [int(round(x / 100)) if g else None for x, g in zip(m, ok)],
            }
        # "from": the place the times are measured from (null: the polygon's point-on-surface).
        return {"codes": [str(c) for c in codes], "from": origins, **out}

    def facility_columns(fl):
        """Name, position (4 decimals, ~10 m) and concelho. The OSM ids stay in the build report's
        facility CSV; the app links OpenStreetMap at the position."""
        return {
            "name": [f["name"] for f in fl],
            "lon": [round(float(f["lon"]), 4) for f in fl],
            "lat": [round(float(f["lat"]), 4) for f in fl],
            "concelho": [f["concelho"] for f in fl],
        }

    web = {
        "version": 1,
        "categories": list(cfg.CATEGORY_IDS),
        "facilities": {cat: facility_columns(facilities[cat]) for cat in cfg.CATEGORY_IDS},
        "parishes": results(parishes["dtmnfr"], per_parish, porigin),
        "concelhos": results(dicos, per_concelho, corigin),
    }
    cfg.OUT_WEB.write_text(json.dumps(web, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    with cfg.FACILITIES_CSV.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["category", "index", "name", "lon", "lat", "concelho", "osm", "snap_m"])
        for cat in cfg.CATEGORY_IDS:
            for i, f in enumerate(facilities[cat]):
                w.writerow([cat, i, f["name"], f"{f['lon']:.6f}", f"{f['lat']:.6f}", f["concelho"], f["ref"], round(f.get("snap_m", 0))])
    log(f"wrote {cfg.OUT_WEB} ({cfg.OUT_WEB.stat().st_size / 1024:.0f} KiB)")

    cfg.PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(dir=cfg.PUBLIC_DIR, prefix=".grid-"))
    spec["present"] = write_grid(spec, rc, grid_values, tmp)
    name, sha, files, total = publish_into(tmp, "grid")
    report["sizes"] = {"services_json_bytes": cfg.OUT_WEB.stat().st_size, "grid_files": files, "grid_bytes": total}

    meta = {
        "grid": {"dir": f"services/{name}", "files": files, "bytes": total, "tree_sha256": sha, **spec, "layout": "uint16le[category][facility,seconds,metres/10][row][col]", "no_value": cfg.NO_VALUE},
        "categories": [{"id": c.id, "en": c.en, "pt": c.pt, "source": c.source} for c in cfg.CATEGORIES],
        "sources": {
            "osm": {"date": cfg.OSM_DATE, "url": cfg.OSM_URL, "licence": cfg.OSM_LICENCE, "licence_url": cfg.OSM_LICENCE_URL},
            "sns": {
                "period": cfg.SNS_PERIOD,
                "fetched": sns_fetch["fetched"][:10],
                "url": cfg.SNS_URGENCIAS_PAGE,
                "dados_url": cfg.SNS_URGENCIAS_DADOS,
                "licence": cfg.SNS_LICENCE,
                "licence_url": cfg.SNS_LICENCE_URL,
            },
        },
        "snap_max_m": cfg.SNAP_MAX_M,
    }
    cfg.META_JSON.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log(f"wrote {cfg.META_JSON}")

    # 5. validation: straight line vs road for a sample of parishes ------------------------------------
    report["validation"] = validate(parishes, pxy, per_parish, facilities)
    timings["total"] = time.time() - t0
    report["timings_s"] = {k: round(v, 1) for k, v in timings.items()}
    report["peak_rss_mib"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 2**20)  # bytes on macOS
    cfg.REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    log(f"wrote {cfg.REPORT_JSON}; total {timings['total']:.0f} s, peak RSS {report['peak_rss_mib']} MiB")
    return report


def publish_into(tmp: Path, prefix: str):
    """build_hazard.publish, but into PUBLIC_DIR of services."""
    import shutil

    sha, files, total = tree_sha256(tmp)
    name = f"{prefix}-{sha[:8]}"
    for old in cfg.PUBLIC_DIR.glob(f"{prefix}-????????"):
        if old.name != name:
            shutil.rmtree(old)
    target = cfg.PUBLIC_DIR / name
    if target.exists():
        shutil.rmtree(target)
    tmp.chmod(0o755)
    tmp.replace(target)
    log(f"wrote {target}: {files} files, {total / 2**20:.2f} MiB")
    return name, sha, files, total


# Detour factor: road distance / straight line. Typical rural values are 1.2–1.6; outside 1.0–2.5 is flagged.
DETOUR_RANGE = (1.0, 2.5)


def validate(parishes, pxy, per_parish, facilities) -> dict:
    """Every parish: road metres vs straight line to the same facility; flags implausible detours."""
    lonlat = np.column_stack(TO_4326.transform(pxy[:, 0], pxy[:, 1]))
    flagged = []
    ratios = {}
    for cat in cfg.CATEGORY_IDS:
        f, s, m = per_parish[cat]
        fl = facilities[cat]
        r = []
        for k in range(len(f)):
            if f[k] < 0:
                continue
            fac = fl[f[k]]
            line = float(haversine(lonlat[k, 0], lonlat[k, 1], fac["lon"], fac["lat"]))
            if line < 2000:  # short trips are dominated by the snap and the street grid
                continue
            ratio = m[k] / line
            r.append(ratio)
            if not DETOUR_RANGE[0] * 0.95 <= ratio <= DETOUR_RANGE[1]:
                flagged.append({"cat": cat, "parish": str(parishes["dtmnfr"].iloc[k]), "name": parishes["freguesia"].iloc[k], "facility": fac["name"], "line_km": round(line / 1000, 1), "road_km": round(m[k] / 1000, 1), "min": round(s[k] / 60), "ratio": round(ratio, 2)})
        if r:
            ratios[cat] = [round(float(np.percentile(r, q)), 2) for q in (5, 50, 95)]
    return {"detour_p5_p50_p95": ratios, "flagged": flagged}


if __name__ == "__main__":
    build()
