"""Build insights/data/prepared/ from CAOP, the PNCT list, INE and OSM, with sanity checks that stop
the build on any mismatch. Needs the pipeline's geospatial dependencies (geopandas); the runtime only
reads the prepared files.

    python -m insights prepare

Outputs (committed, so the Pi can render without the geospatial stack):
  parishes.csv       one row per CAOP 2025 parish: PNCT flag, area, centroid distances, its Census
                     2021 parish and, only when the boundaries are the same, its Census population
  census_units.csv   one row per Censos 2021 parish: population 2011/2021 and its PNCT status
  municipalities.csv one row per concelho: PNCT parish counts and area, Census population, €/m²
  districts.csv      one row per district: area and PNCT area
  national.json      mainland totals, reference points, source versions, crosswalk statistics
  map.json           simplified parish outlines for the small maps (EPSG:3763, metres)
"""

from __future__ import annotations

import json

import geopandas as gpd
import pandas as pd
import pyogrio
from shapely.geometry import Point
from shapely.ops import unary_union

from insights import config as cfg

COAST = "Limite e Linha de Costa"
EPSG = 3763


class SanityError(SystemExit):
    pass


def check(ok: bool, message: str) -> None:
    if not ok:
        raise SanityError(f"SANITY CHECK FAILED: {message}")
    print(f"  ok: {message}")


def ine_rows(name: str) -> tuple[list[dict], dict]:
    record = json.loads((cfg.RAW / "fetch.json").read_text())[name]
    data = json.loads((cfg.RAW / record["file"]).read_text())
    return data[0]["Dados"][record["period"]], record


def census_tables() -> tuple[pd.DataFrame, pd.DataFrame, dict, dict]:
    """(parishes, municipalities, mainland totals, records) from INE 0011609."""
    par, mun, totals, records = {}, {}, {}, {}
    for year in (2011, 2021):
        rows, records[year] = ine_rows(f"census_{year}")
        for r in rows:
            code, value = r["geocod"], r["valor"]
            if value in (None, ""):
                continue
            if code == "1":
                totals[year] = int(value)
            elif len(code) == 6 and code[:4].isdigit() and int(code[:2]) <= 18:  # Braga uses letters (0302FA)
                par.setdefault(code, {"census_code": code, "census_name": r["geodsg"]})[f"pop{year}"] = int(value)
            elif len(code) == 4 and code.isdigit() and int(code[:2]) <= 18:
                mun.setdefault(code, {"dtmn": code})[f"pop{year}"] = int(value)
    return pd.DataFrame(par.values()), pd.DataFrame(mun.values()), totals, records


def sale_values() -> tuple[dict[str, float], dict, dict, dict]:
    """(mainland {dico: €/m²}, other geographies, fetch record, Portugal-wide minimum over all 308
    municipalities, islands included: the value, its municipality and the ones INE left empty)."""
    rows, record = ine_rows("sale_m2")
    mun, other, every, empty = {}, {}, [], []
    for r in rows:
        code = r["geocod"]
        municipal = len(code) == 7 and code[0] in "123"  # NUTS 2024: region + NUTS3 (2) + DICO
        if r.get("valor") in (None, ""):
            if municipal:
                empty.append(r["geodsg"])
            continue
        value = float(r["valor"])
        if municipal:
            every.append((value, r["geodsg"]))
        if municipal and code.startswith("1"):
            mun[code[3:]] = value
        elif not municipal:
            other[code] = value
    every.sort()
    lowest = {"value": every[0][0], "municipality": every[0][1], "tied": [n for v, n in every if v == every[0][0]],
              "with_value": len(every), "municipalities": len(every) + len(empty), "no_value": sorted(empty)}
    return mun, other, record, lowest


def to_3763(lon: float, lat: float) -> Point:
    return gpd.GeoSeries([Point(lon, lat)], crs=4326).to_crs(EPSG).iloc[0]


def reference_points() -> dict[str, dict]:
    cities = json.loads(cfg.CITIES_JSON.read_text())
    seats = {f["properties"]["dico"]: f for f in cities["features"]}
    refs = {}
    for key, dico, en, pt in (("porto", "1312", "Porto", "Porto"), ("lisbon", "1106", "Lisbon", "Lisboa")):
        lon, lat = seats[dico]["geometry"]["coordinates"]
        refs[key] = {"en": en, "pt": pt, "lon": lon, "lat": lat, "source": "OSM admin_centre (web/data/cities.json)"}
    osm = json.loads((cfg.RAW / "osm_airports.json").read_text())
    for e in osm["elements"]:
        c = e.get("center") or {"lat": e["lat"], "lon": e["lon"]}
        iata = e["tags"]["iata"]
        refs[iata.lower()] = {
            "en": f"{cfg.AIRPORTS[iata][0]} airport ({iata})",
            "pt": f"aeroporto {'do' if cfg.AIRPORTS[iata][1] == 'Porto' else 'de'} {cfg.AIRPORTS[iata][1]} ({iata})",
            "lon": c["lon"],
            "lat": c["lat"],
            "source": f"OSM {e['type']} {e['id']} ({e['tags'].get('name')})",
        }
    for r in refs.values():
        p = to_3763(r["lon"], r["lat"])
        r["x"], r["y"] = p.x, p.y
    return refs


def simplify_rings(geom, tolerance: float) -> list[list[list[int]]]:
    g = geom.simplify(tolerance, preserve_topology=True)
    polys = [g] if g.geom_type == "Polygon" else list(g.geoms)
    return [[[round(x), round(y)] for x, y in p.exterior.coords] for p in polys if p.area > tolerance**2]


def prepare() -> None:
    cfg.PREPARED.mkdir(parents=True, exist_ok=True)
    print("checks:")

    # --- CAOP 2025 parishes and the PNCT list ---
    fr = pyogrio.read_dataframe(cfg.CAOP_2025, layer="cont_freguesias")
    check(fr.crs.to_epsg() == EPSG, "CAOP 2025 is in EPSG:3763")
    fr = fr.rename(columns={"dtmnfr": "dicofre", "freguesia": "name", "municipio": "concelho", "distrito_ilha": "distrito"})
    fr["dtmn"] = fr.dicofre.str[:4]
    fr["dt"] = fr.dicofre.str[:2]
    fr["area_km2"] = fr.geometry.area / 1e6
    nuts1 = pyogrio.read_dataframe(cfg.CAOP_2025, layer="cont_nuts1", read_geometry=False)
    official_km2 = float(nuts1.area_ha.iloc[0]) / 100
    total_km2 = fr.area_km2.sum()
    check(abs(total_km2 / official_km2 - 1) < cfg.AREA_TOLERANCE,
          f"mainland area {total_km2:,.1f} km² (EPSG:3763) ≈ CAOP official {official_km2:,.1f} km²")
    worst = (fr.area_km2 / (fr.area_ha / 100) - 1).abs().max()
    check(worst < 0.01, f"every parish area within 1% of its CAOP area_ha (worst {worst:.4%})")

    pnct = pd.read_csv(cfg.PNCT_CSV, dtype=str)
    unknown = sorted(set(pnct.dicofre) - set(fr.dicofre))
    check(not unknown, f"all {len(pnct)} PNCT codes match a CAOP 2025 parish (unmatched: {unknown})")
    check(pnct.dicofre.is_unique, "PNCT codes are unique")
    fr["pnct"] = fr.dicofre.isin(set(pnct.dicofre))

    # --- Census 2021 parishes (CAOP 2024 geometry) and the crosswalk ---
    census_par, census_mun, totals, census_rec = census_tables()
    for year in (2011, 2021):
        s_par, s_mun = census_par[f"pop{year}"].sum(), census_mun[f"pop{year}"].sum()
        check(s_par == totals[year], f"Censos {year}: {len(census_par)} parishes sum to INE's mainland total {totals[year]:,}")
        check(s_mun == totals[year], f"Censos {year}: {len(census_mun)} municipalities sum to the mainland total")
    check(census_par[["pop2011", "pop2021"]].notna().all().all(), "every Census parish has 2011 and 2021 values")

    old = pyogrio.read_dataframe(cfg.CAOP_2024, layer="cont_freguesias", columns=["dtmnfr"])
    old = old.rename(columns={"dtmnfr": "census_code"})
    check(set(old.census_code) == set(census_par.census_code),
          f"the {len(old)} CAOP 2024 parishes are exactly the {len(census_par)} Censos 2021 parishes")
    old["unit_km2"] = old.geometry.area / 1e6
    ov = gpd.overlay(fr[["dicofre", "pnct", "area_km2", "geometry"]], old, how="intersection", keep_geom_type=True)
    ov["km2"] = ov.geometry.area / 1e6
    best = ov.sort_values("km2").groupby("dicofre").tail(1).set_index("dicofre")
    fr["census_code"] = fr.dicofre.map(best.census_code)
    fr["census_overlap"] = fr.dicofre.map(best.km2) / fr.area_km2
    check(fr.census_code.notna().all(), "every CAOP 2025 parish overlaps a Census parish")

    units = old.drop(columns="geometry").merge(census_par, on="census_code")
    units["pnct_share"] = units.census_code.map(ov[ov.pnct].groupby("census_code").km2.sum() / units.set_index("census_code").unit_km2).fillna(0.0)
    mixed = units[(units.pnct_share > 1 - cfg.CLEAN_SHARE) & (units.pnct_share < cfg.CLEAN_SHARE)]
    check(mixed.empty, f"every Census parish is ≥{cfg.CLEAN_SHARE:.0%} PNCT or ≥{cfg.CLEAN_SHARE:.0%} non-PNCT today (mixed: {mixed.census_code.tolist()})")
    units["pnct"] = units.pnct_share >= 0.5
    units["dtmn"] = units.census_code.str[:4]
    edge = units[(units.pnct_share > 0) & (units.pnct_share < 1)]
    off = edge.pnct_share.where(edge.pnct_share < 0.5, 1 - edge.pnct_share)
    print(f"  note: {len(edge)} Census parishes are not exactly 100%/0% PNCT by area (boundary slivers); "
          f"largest off-share {off.max() if len(off) else 0:.4f}")

    # A CAOP 2025 parish gets the Census population only when it is the same territory.
    children = fr.groupby("census_code").dicofre.size()
    cover = fr.groupby("census_code").apply(lambda g: g.area_km2.max(), include_groups=False) / units.set_index("census_code").unit_km2
    same = (fr.census_code.map(children) == 1) & (fr.census_overlap >= 0.99) & (fr.census_code.map(cover).between(0.99, 1.01))
    fr["census_same"] = same
    fr = fr.merge(census_par[["census_code", "pop2011", "pop2021"]], on="census_code", how="left")
    fr.loc[~fr.census_same, ["pop2011", "pop2021"]] = pd.NA
    split = units.census_code.isin(children[children > 1].index).sum()
    print(f"  note: {int(same.sum())} of {len(fr)} parishes match a Census parish 1:1; {split} Census parishes were split in 2025")

    pnct_pop = units.loc[units.pnct, "pop2021"].sum()
    check(abs(units.pop2021.sum() - totals[2021]) == 0, "Census units carry the whole mainland population")

    # --- Distances (straight line, EPSG:3763, from the polygon centroid) ---
    trocos = pyogrio.read_dataframe(cfg.CAOP_2025, layer="cont_trocos", columns=["significado_linha"])
    coast = unary_union(trocos[trocos.significado_linha == COAST].geometry.values)
    check(1000 < coast.length / 1000 < 1500, f"CAOP coastline is {coast.length / 1000:,.0f} km long")
    refs = reference_points()
    # The centroid, or, when it falls outside the parish (21 curved or ring-shaped parishes, e.g.
    # Carvalhal, Grândola, whose centroid lies 64 m from the shore), shapely's interior point.
    centroid = fr.geometry.centroid
    fr["centroid_inside"] = centroid.within(fr.geometry)
    cent = centroid.where(fr.centroid_inside, fr.geometry.representative_point())
    fr["cx"], fr["cy"] = cent.x.round(1), cent.y.round(1)
    ll = cent.to_crs(4326)
    fr["lon"], fr["lat"] = ll.x.round(5), ll.y.round(5)
    fr["coast_km"] = cent.distance(coast) / 1000
    fr["touches_coast"] = fr.geometry.distance(coast) < 1.0
    for key, r in refs.items():
        fr[f"{key}_km"] = cent.distance(Point(r["x"], r["y"])) / 1000

    # --- Municipalities and districts ---
    mu = pyogrio.read_dataframe(cfg.CAOP_2025, layer="cont_municipios", read_geometry=False)
    mu = mu.rename(columns={"municipio": "concelho", "distrito_ilha": "distrito"})[["dtmn", "concelho", "distrito"]]
    agg = fr.groupby("dtmn").agg(
        n_parishes=("dicofre", "size"), n_pnct=("pnct", "sum"), area_km2=("area_km2", "sum"),
        pnct_km2=("area_km2", lambda s: s[fr.loc[s.index, "pnct"]].sum()),
    )
    mu = mu.merge(agg, on="dtmn").merge(census_mun, on="dtmn", how="left")
    check(len(mu) == 278 and mu[["pop2011", "pop2021"]].notna().all().all(), "278 concelhos, each with Census 2011 and 2021")
    mu["status"] = ["full" if p == n else "none" if p == 0 else "partial" for p, n in zip(mu.n_pnct, mu.n_parishes)]
    sale, sale_other, sale_rec, sale_lowest = sale_values()
    check(sale_lowest["municipalities"] == 308, f"INE €/m² table covers all 308 municipalities ({sale_lowest['with_value']} with a value)")
    mu["sale_m2"] = mu.dtmn.map(sale)
    print(f"  note: €/m² {sale_rec['period']} available for {mu.sale_m2.notna().sum()} of 278 concelhos")
    check(mu.sale_m2.notna().sum() >= 270, "€/m² available for nearly every concelho")
    cities = json.loads(cfg.CITIES_JSON.read_text())
    seats = gpd.GeoDataFrame(
        {"dtmn": [f["properties"]["dico"] for f in cities["features"]], "seat": [f["properties"]["name"] for f in cities["features"]]},
        geometry=gpd.points_from_xy(*zip(*[f["geometry"]["coordinates"] for f in cities["features"]])), crs=4326,
    ).to_crs(EPSG)
    check(set(seats.dtmn) == set(mu.dtmn), "every concelho has an OSM seat")
    seats["seat_coast_km"] = seats.geometry.distance(coast) / 1000
    mu = mu.merge(seats[["dtmn", "seat", "seat_coast_km"]], on="dtmn")

    di = pyogrio.read_dataframe(cfg.CAOP_2025, layer="cont_distritos", read_geometry=False)[["dt", "distrito"]]
    dagg = fr.groupby("dt").agg(area_km2=("area_km2", "sum"), pnct_km2=("area_km2", lambda s: s[fr.loc[s.index, "pnct"]].sum()))
    di = di.merge(dagg, on="dt")
    check(len(di) == 18, "18 districts")

    # --- Write ---
    par_cols = ["dicofre", "name", "dtmn", "concelho", "dt", "distrito", "pnct", "area_km2", "cx", "cy", "lon", "lat",
                "centroid_inside", "touches_coast", "coast_km", *[f"{k}_km" for k in refs], "census_code", "census_same",
                "pop2011", "pop2021"]
    out = fr[par_cols].copy()
    for c in out.columns:
        if c.endswith("_km") or c == "area_km2":
            out[c] = out[c].round(3)
    out["pop2011"] = out.pop2011.astype("Int64")
    out["pop2021"] = out.pop2021.astype("Int64")
    out.sort_values("dicofre").to_csv(cfg.PREPARED / "parishes.csv", index=False)
    units[["census_code", "census_name", "dtmn", "unit_km2", "pnct_share", "pnct", "pop2011", "pop2021"]].round(
        {"unit_km2": 3, "pnct_share": 4}).sort_values("census_code").to_csv(cfg.PREPARED / "census_units.csv", index=False)
    mu.round({"area_km2": 3, "pnct_km2": 3, "seat_coast_km": 3}).astype({"pop2011": int, "pop2021": int}).sort_values(
        "dtmn").to_csv(cfg.PREPARED / "municipalities.csv", index=False)
    di.round(3).to_csv(cfg.PREPARED / "districts.csv", index=False)

    fetched = json.loads((cfg.RAW / "fetch.json").read_text())
    national = {
        "mainland_area_km2_caop": official_km2,
        "mainland_area_km2_computed": round(total_km2, 3),
        "census_mainland": {str(k): v for k, v in totals.items()},
        "pnct_census_pop2021": int(pnct_pop),
        "sale_m2": {"period": sale_rec["period"], "portugal": sale_other.get("PT"), "mainland": sale_other.get("1"),
                    "lowest_municipality": sale_lowest},
        "reference_points": refs,
        "coast": {"definition": f"CAOP 2025 boundary segments '{COAST}'", "length_km": round(coast.length / 1000, 1)},
        "crosswalk": {
            "caop_2025_parishes": len(fr), "census_2021_parishes": len(units), "split_census_parishes": int(split),
            "one_to_one": int(same.sum()), "clean_share": cfg.CLEAN_SHARE,
            "not_clean": [  # Census parishes more than 1% off a pure PNCT / non-PNCT status
                {"code": r.census_code, "name": r.census_name, "pnct_share": round(r.pnct_share, 4), "pop2021": int(r.pop2021)}
                for r in edge.itertuples() if 0.01 < r.pnct_share < 0.99
            ],
        },
        "sources": {
            "pnct": {"title": "IEFP, Territórios PNCT (2026-02-04)", "url": cfg.PNCT_URL},
            "caop_2025": {"title": "DGT, CAOP 2025 (Continente)", "url": cfg.CAOP_2025_URL, "licence": "CC BY 4.0"},
            "caop_2024": {"title": "DGT, CAOP 2024 (Continente), Censos 2021 parishes", "url": cfg.CAOP_2024_URL, "sha256": cfg.CAOP_2024_SHA256},
            **{k: v for k, v in fetched.items()},
        },
    }
    (cfg.PREPARED / "national.json").write_text(json.dumps(national, ensure_ascii=False, indent=1, default=str), encoding="utf-8")

    shapes = {d: simplify_rings(g, 400) for d, g in zip(fr.dicofre, fr.geometry)}
    (cfg.PREPARED / "map.json").write_text(json.dumps(shapes, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {cfg.PREPARED}: {len(out)} parishes, {len(units)} Census parishes, {len(mu)} concelhos")


if __name__ == "__main__":
    prepare()
