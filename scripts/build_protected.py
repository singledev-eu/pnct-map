"""Build the protected-areas overlay and the protection shares per parish and concelho.

Inputs: the downloads cached by fetch_protected.py (data/external/protected/<source>/, see
protected_config.py for which source feeds each category) and CAOP 2025 at full resolution.

Every site is read in its own CRS, reprojected to EPSG:3763 (PT-TM06, equal-area enough for
shares: its scale error over mainland is < 0.1%), repaired with make_valid and dissolved by
site code. Sites that don't touch mainland land (Azores, Madeira, offshore) are dropped.

Outputs:
  web/data/protection.json        shares keyed by DICOFRE (freguesias) and DICO (concelhos), each
                                  under a "protection" block, with per-field meta (source, url,
                                  as_of, licence) so it can later merge into per-parish data cards:
                                    <cat>_pct  share of the area inside the category (0-100, 0.1)
                                    any_pct    share inside the union of all categories
                                    areas      indexes into "areas" of the sites covering at least
                                               NAME_MIN_SHARE of the parish/concelho, largest first
                                  Shares use the unsimplified CAOP and site geometries.
  web/data/protected.topo.json    display overlay: one object per category, the category's sites
                                  dissolved, clipped to mainland land, simplified (mapshaper,
                                  topology-preserving), and split along the display PNCT outline
                                  into parts with pnct true/false (focus mode hides the false ones)
  web/data/protected.meta.json    the categories with source, version and licence (bundled with the app)
  data/processed/protected_sites.csv  every site: category, code, name, type, area, mainland share
The build prints the data quirks (repaired geometries, missing names, overlaps) and fails if an
output exceeds its size budget.
"""

from __future__ import annotations

import gzip
import json
import os
import subprocess
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyogrio
import shapely
from shapely.geometry import MultiPolygon, Polygon

sys.path.insert(0, str(Path(__file__).resolve().parent))
from protected_config import ArcGisSource, FileSource, enabled  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CAOP_GPKG = ROOT / "data/external/CAOP_Continente_2025-gpkg/Continente_CAOP2025.gpkg"
PARISHES_DISPLAY = ROOT / "data/processed/parishes_all.geojson"
INTERIM = ROOT / "data/interim/protected"
OUT_STATS = ROOT / "web/data/protection.json"
OUT_TOPO = ROOT / "web/data/protected.topo.json"
OUT_META = ROOT / "web/data/protected.meta.json"
OUT_SITES = ROOT / "data/processed/protected_sites.csv"

CRS = 3763
NAME_MIN_SHARE = 0.005  # a site is listed for a parish/concelho if it covers at least 0.5% of it

MAPSHAPER = "mapshaper@0.7.68"
SIMPLIFY = "3%"
QUANTIZATION = "120000"  # as build_topo.py: ~4.8 m steps
# Gzipped budgets. The overlay loads only when a toggle is first switched on and the shares only
# when the panel first opens, so neither is on the initial-load path.
TOPO_BUDGET_GZ = 220 * 1024
STATS_BUDGET_GZ = 40 * 1024


def polygonal(geom):
    """The polygon parts of a (repaired) geometry, as one Polygon/MultiPolygon, or None."""
    if geom is None or geom.is_empty:
        return None
    if isinstance(geom, (Polygon, MultiPolygon)):
        return geom
    parts = [g for g in shapely.get_parts(geom) if isinstance(g, (Polygon, MultiPolygon))]
    return shapely.union_all(parts) if parts else None


def read_source(cat: str, src: ArcGisSource | FileSource) -> tuple[gpd.GeoDataFrame, dict]:
    """The source's sites as code, name, type, geometry (EPSG:3763, repaired), plus its fetch metadata."""
    fetch_json = src.cache_dir() / "fetch.json"
    if not fetch_json.exists():
        raise SystemExit(f"{src.id}: not fetched yet; run `uv run python scripts/fetch_protected.py`")
    fetched = json.loads(fetch_json.read_text())

    if isinstance(src, ArcGisSource):
        frames = []
        for layer, fixed_type in src.layers.items():
            gdf = gpd.read_file(src.cache_dir() / f"layer{layer}.geojson")
            gdf["type"] = fixed_type if fixed_type else gdf[src.type_field]
            frames.append(gdf)
        gdf = pd.concat(frames, ignore_index=True)
    else:
        path = src.path()
        layer = src.layer or next(name for name, geom in pyogrio.list_layers(path) if geom)
        gdf = pyogrio.read_dataframe(path, layer=layer, where=src.where)
        gdf["type"] = gdf[src.type_field].map(src.type_labels).fillna(gdf[src.type_field])
    gdf = gdf.rename(columns={src.code_field: "code", src.name_field: "name"})
    gdf = gpd.GeoDataFrame(gdf[["code", "name", "type", "geometry"]], geometry="geometry").to_crs(CRS)

    quirks = {"features": len(gdf), "invalid": int((~gdf.geometry.is_valid).sum()), "empty": int(gdf.geometry.is_empty.sum())}
    gdf["geometry"] = [polygonal(shapely.make_valid(g)) if g is not None else None for g in gdf.geometry]
    gdf = gdf[gdf.geometry.notna()]
    for col in ("code", "name", "type"):
        gdf[col] = gdf[col].fillna("").astype(str).map(lambda s: " ".join(s.split()))  # "Vale\nTelheiro", double spaces
    missing = gdf.name == ""
    quirks["missing_name"] = gdf.loc[missing, "code"].tolist()
    gdf.loc[missing, "name"] = gdf.loc[missing, "code"]
    quirks["duplicate_codes"] = sorted(set(gdf.code[gdf.code.duplicated()]))
    gdf = gdf.dissolve(by="code", aggfunc={"name": "first", "type": "first"}, as_index=False)
    gdf["category"] = cat
    return gdf, {**fetched, "quirks": quirks}


def mainland_land() -> shapely.Geometry:
    districts = pyogrio.read_dataframe(CAOP_GPKG, layer="cont_distritos")
    return shapely.union_all(districts.geometry.values)


def read_parishes() -> gpd.GeoDataFrame:
    gdf = pyogrio.read_dataframe(CAOP_GPKG, layer="cont_freguesias", columns=["dtmnfr"])
    gdf = gdf.rename(columns={"dtmnfr": "dicofre"}).to_crs(CRS)
    gdf["area"] = gdf.geometry.area
    return gdf


def overlap_areas(parishes: gpd.GeoDataFrame, shapes: gpd.GeoDataFrame, key: str) -> pd.Series:
    """Area (m²) of each (dicofre, key) intersection, from the full-resolution geometries."""
    parts = shapes[[key, "geometry"]].explode(index_parts=False)
    inter = gpd.overlay(parishes[["dicofre", "geometry"]], parts, how="intersection", keep_geom_type=True)
    inter["a"] = inter.geometry.area
    return inter.groupby(["dicofre", key]).a.sum()


def pct(part: float, whole: float) -> float:
    return min(100.0, round(100 * part / whole, 1)) if whole else 0.0


def shares(cats: list[str], areas: pd.DataFrame, sites_by_unit: pd.Series, units: pd.Series, site_index: dict[str, int]) -> dict:
    """{unit: {"protection": {...}}} from per-unit category areas, per-unit site areas and unit areas."""
    out = {}
    for unit, total in units.items():
        block = {f"{cat}_pct": pct(areas.at[unit, cat] if unit in areas.index else 0.0, total) for cat in cats}
        block["any_pct"] = pct(areas.at[unit, "any"] if unit in areas.index else 0.0, total)
        listed = sites_by_unit.get(unit)
        names = [] if listed is None else [site_index[s] for s, a in listed.sort_values(ascending=False).items() if a >= NAME_MIN_SHARE * total]
        block["areas"] = names
        out[unit] = {"protection": block}
    return out


def write_display(categories: dict[str, gpd.GeoDataFrame], land) -> None:
    """Dissolved, land-clipped categories -> simplified TopoJSON split into PNCT / not-PNCT parts."""
    INTERIM.mkdir(parents=True, exist_ok=True)
    raw = []
    for cat, sites in categories.items():
        merged = shapely.intersection(shapely.union_all(sites.geometry.values), land)
        path = INTERIM / f"{cat}.geojson"
        path.unlink(missing_ok=True)
        gpd.GeoDataFrame({"category": [cat]}, geometry=[merged], crs=CRS).to_crs(4326).to_file(path, driver="GeoJSON")
        raw.append(str(path))
    env = {**os.environ, "npm_config_cache": str(ROOT / ".npm-cache"), "npm_config_update_notifier": "false"}
    simplified = INTERIM / "simplified"
    simplified.mkdir(exist_ok=True)
    # 1. Simplify the categories together, so boundaries they share stay shared.
    subprocess.run(
        ["npx", "-y", MAPSHAPER, "-i", "combine-files", *raw,
         "-simplify", SIMPLIFY, "keep-shapes", "-clean",
         "-o", str(simplified) + "/", "format=geojson", "precision=0.000001"],
        check=True, env=env,
    )
    # 2. Split along the display PNCT outline (the simplified parishes the map draws), so in focus
    #    mode the overlay stops exactly where the PNCT fill does. No further simplification here.
    cmd = ["npx", "-y", MAPSHAPER, "-i", "combine-files", *[str(simplified / f"{cat}.json") for cat in categories], str(PARISHES_DISPLAY),
           "-target", "parishes_all", "-filter", "pnct", "-dissolve", "+", "name=pnct"]
    for cat in categories:
        cmd += ["-target", cat, "-clip", "pnct", "+", f"name={cat}_in", "-each", "pnct=true",
                "-target", cat, "-erase", "pnct", "+", f"name={cat}_out", "-each", "pnct=false",
                "-merge-layers", f"target={cat}_in,{cat}_out", "force", f"name={cat}_split",
                "-filter-fields", "pnct"]
    for cat in categories:
        cmd += ["-target", cat, "-drop", "-target", f"{cat}_split", "-rename-layers", cat]
    cmd += ["-o", str(OUT_TOPO), "format=topojson", f"target={','.join(categories)}", f"quantization={QUANTIZATION}"]
    subprocess.run(cmd, check=True, env=env)


def field_meta(src: ArcGisSource | FileSource, fetched: dict) -> dict:
    return {
        "source": f"{src.provider}: {src.title}",
        "url": getattr(src, "url"),
        "as_of": src.release or fetched["fetched_at"][:10],
        "fetched_at": fetched["fetched_at"],
        "licence": src.licence,
        "licence_url": src.licence_url,
        "licence_confirmed": src.licence_confirmed,
    }


def gz_size(path: Path) -> int:
    return len(gzip.compress(path.read_bytes(), 9))


def main() -> None:
    sources = enabled()
    if not sources:
        raise SystemExit("no protected-area category enabled in protected_config.CATEGORIES")
    land = mainland_land()
    categories: dict[str, gpd.GeoDataFrame] = {}
    meta: dict[str, dict] = {}
    for cat, src in sources.items():
        sites, fetched = read_source(cat, src)
        inside = sites.geometry.intersection(land).area
        sites["area_ha"] = (sites.geometry.area / 1e4).round(1)
        sites["mainland_ha"] = (inside / 1e4).round(1)
        dropped = sites[inside <= 0]
        q = fetched["quirks"]
        q["not_on_mainland"] = len(dropped)
        q["mostly_at_sea"] = sites[(inside > 0) & (inside < 0.5 * sites.geometry.area)].name.tolist()
        sites = sites[inside > 0].reset_index(drop=True)
        union_area = shapely.union_all(sites.geometry.values).area
        q["overlap_ha"] = round((sites.geometry.area.sum() - union_area) / 1e4, 1)
        categories[cat] = sites
        meta[cat] = field_meta(src, fetched)
        print(f"{cat} ({src.id}): {len(sites)} sites on mainland; quirks {json.dumps(q, ensure_ascii=False)}")

    all_sites = pd.concat(categories.values(), ignore_index=True)
    pd.DataFrame(all_sites.drop(columns="geometry")).to_csv(OUT_SITES, index=False)
    all_sites["key"] = all_sites.category + ":" + all_sites.code
    site_index = {k: i for i, k in enumerate(all_sites.key)}

    unions = gpd.GeoDataFrame(
        {"cat": [*categories, "any"]},
        geometry=[*(shapely.union_all(s.geometry.values) for s in categories.values()), shapely.union_all(all_sites.geometry.values)],
        crs=CRS,
    )
    parishes = read_parishes()
    cat_areas = overlap_areas(parishes, unions, "cat").unstack(fill_value=0.0)
    site_areas = overlap_areas(parishes, all_sites, "key")

    parish_area = parishes.set_index("dicofre").area
    dico = lambda idx: idx.str[:4]  # noqa: E731
    concelho_area = parish_area.groupby(dico(parish_area.index)).sum()
    concelho_cat = cat_areas.groupby(dico(cat_areas.index)).sum()
    site_df = site_areas.reset_index()
    concelho_sites = site_df.assign(dico=site_df.dicofre.str[:4]).groupby(["dico", "key"]).a.sum()

    cats = list(categories)
    by_unit = lambda s: {u: g.droplevel(0) for u, g in s.groupby(level=0)}  # noqa: E731
    freguesias = shares(cats, cat_areas, by_unit(site_areas), parish_area.sort_index(), site_index)
    concelhos = shares(cats, concelho_cat, by_unit(concelho_sites), concelho_area.sort_index(), site_index)

    sources_meta = {cat: meta[cat] for cat in cats}
    union_meta = {
        "source": "Derived: union of " + " and ".join(m["source"] for m in sources_meta.values()),
        "as_of": max(m["fetched_at"] for m in sources_meta.values())[:10],
        "licence": "; ".join(f"{m['source'].split(':')[0]}: {m['licence']}" for m in sources_meta.values()),
    }
    fields = {f"protection.{cat}_pct": sources_meta[cat] for cat in cats}
    fields["protection.any_pct"] = union_meta
    fields["protection.areas"] = {**union_meta, "source": "Site names from " + " and ".join(m["source"] for m in sources_meta.values())}
    stats = {
        "schema": 1,
        "meta": {
            "generated_by": "scripts/build_protected.py",
            "method": (
                "Share of the CAOP 2025 area (full resolution, EPSG:3763) inside each category; any = inside the union "
                f"of the categories, not their sum. A site is listed when it covers at least {NAME_MIN_SHARE:.1%} of the area."
            ),
            "boundaries": {"source": "DGT: CAOP 2025", "licence": "CC BY 4.0", "licence_url": "https://creativecommons.org/licenses/by/4.0/"},
            "fields": fields,
        },
        "categories": cats,
        "areas": [{"cat": r.category, "code": r.code, "name": r.name, "type": r.type} for r in all_sites.itertuples()],
        "freguesias": freguesias,
        "concelhos": concelhos,
    }
    OUT_STATS.write_text(json.dumps(stats, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    OUT_META.write_text(
        json.dumps({"categories": [{"id": cat, **sources_meta[cat]} for cat in cats]}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    write_display(categories, land)
    for path, budget in ((OUT_TOPO, TOPO_BUDGET_GZ), (OUT_STATS, STATS_BUDGET_GZ), (OUT_META, None)):
        gz = gz_size(path)
        print(f"{path.relative_to(ROOT)}: {path.stat().st_size / 1024:.0f} KB raw, {gz / 1024:.1f} KB gzipped")
        if budget and gz > budget:
            raise SystemExit(f"{path.name} is {gz / 1024:.0f} KB gzipped, over its {budget / 1024:.0f} KB budget")


if __name__ == "__main__":
    main()
