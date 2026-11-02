"""Build web/data/cities.json: the 278 mainland concelho seats, the 18 district capitals marked.

Input: data/external/osm/seats.json (fetch_cities.py: the admin_centre node of every municipality
in OpenStreetMap) and CAOP 2025 (municipalities and districts). Each seat is matched to the CAOP
concelho it lies in (point in polygon, EPSG:3763); islands fall outside mainland CAOP and are
dropped. A district capital is the seat of the concelho named like its district (Aveiro … Viseu).

The build fails unless every mainland concelho gets exactly one seat: nothing is guessed or filled in.

Output (GeoJSON, coordinates at 5 decimals, ~1 m): properties name (the OSM name, as the place is
called locally, never translated; CAOP's spelling where the two differ only in accents), dico (CAOP), capital (district capital); plus "meta" with the
source, licence and fetch time.
"""

from __future__ import annotations

import json
import unicodedata
from pathlib import Path

import geopandas as gpd
import pyogrio

ROOT = Path(__file__).resolve().parents[1]
CAOP_GPKG = ROOT / "data/external/CAOP_Continente_2025-gpkg/Continente_CAOP2025.gpkg"
SEATS = ROOT / "data/external/osm/seats.json"
FETCH = ROOT / "data/external/osm/fetch.json"
OUT = ROOT / "web/data/cities.json"
CRS = 3763
N_CONCELHOS = 278
N_DISTRICTS = 18


def main() -> None:
    elements = json.loads(SEATS.read_text(encoding="utf-8"))["elements"]
    nodes = [e for e in elements if e["type"] == "node"]
    seats = gpd.GeoDataFrame(
        {"osm_id": [n["id"] for n in nodes], "name": [n["tags"].get("name") for n in nodes]},
        geometry=gpd.points_from_xy([n["lon"] for n in nodes], [n["lat"] for n in nodes]),
        crs=4326,
    ).to_crs(CRS)
    municipios = pyogrio.read_dataframe(CAOP_GPKG, layer="cont_municipios", columns=["dtmn", "municipio", "distrito_ilha"]).to_crs(CRS)
    joined = gpd.sjoin(seats, municipios, predicate="within", how="inner")
    if joined.name.isna().any():
        raise SystemExit(f"seats without a name: {joined[joined.name.isna()].osm_id.tolist()}")
    per = joined.groupby("dtmn").size()
    missing = sorted(set(municipios.dtmn) - set(per.index))
    doubled = per[per > 1].index.tolist()
    if missing or doubled or len(joined) != N_CONCELHOS:
        raise SystemExit(f"expected one seat per mainland concelho: missing {missing}, more than one {doubled}, {len(joined)} seats")
    # OSM spells two seats without their accents ("Vila Nova de Foz Coa", "Castanheira de Pera"):
    # where the names differ only in diacritics, CAOP's official spelling wins.
    bare = lambda s: unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().casefold()  # noqa: E731
    same = joined.apply(lambda r: r["name"] != r.municipio and bare(r["name"]) == bare(r.municipio), axis=1)
    if same.any():
        print(f"accents from CAOP: {joined[same][['name', 'municipio']].values.tolist()}")
    joined.loc[same, "name"] = joined.loc[same, "municipio"]
    joined["capital"] = joined.municipio == joined.distrito_ilha
    if joined.capital.sum() != N_DISTRICTS:
        raise SystemExit(f"expected {N_DISTRICTS} district capitals, got {joined.capital.sum()}")
    joined = joined.sort_values("dtmn").to_crs(4326)
    fetched = json.loads(FETCH.read_text(encoding="utf-8"))
    out = {
        "type": "FeatureCollection",
        "meta": {
            "generated_by": "scripts/build_cities.py",
            "source": fetched["source"],
            "url": fetched["url"],
            "licence": fetched["licence"],
            "licence_url": fetched["licence_url"],
            "osm_base": fetched["osm_base"],
            "fetched_at": fetched["fetched_at"],
            "matching": "Each seat matched to the CAOP 2025 concelho it lies in (DGT, CC BY 4.0).",
        },
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [round(r.geometry.x, 5), round(r.geometry.y, 5)]},
                "properties": {"name": r.name, "dico": r.dtmn, "capital": bool(r.capital)},
            }
            for r in joined.itertuples()
        ],
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(out['features'])} seats, {int(joined.capital.sum())} capitals, {OUT.stat().st_size / 1024:.0f} KB")
    renamed = joined[joined.name != joined.municipio]
    print(f"{len(renamed)} seats named unlike their concelho, e.g. {renamed[['municipio', 'name']].head(8).values.tolist()}")


if __name__ == "__main__":
    main()
