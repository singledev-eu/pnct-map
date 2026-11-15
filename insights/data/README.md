# Insights data

Nothing here is hand-edited. `python -m insights fetch` downloads the sources into `raw/` (gitignored). `python -m insights prepare` builds `prepared/` (committed, so the Pi can render without the geospatial stack), and it stops on any failed sanity check.

## Sources and versions

| What | Source | Version | Where |
|---|---|---|---|
| PNCT parish list | IEFP, *Territórios PNCT*, [PDF of 2026-02-04](https://www.iefp.pt/documents/10181/4287418/Territorios+PNCT_04-02-2026.pdf) (SHA-256 pinned in the `Makefile`) | 1,861 parishes | `data/processed/pnct_parishes.csv`, parsed and matched by `scripts/parse_pdf.py` and `scripts/build_parishes.py` |
| Current parishes (geometry, area, names) | DGT, [CAOP 2025 Continente](https://geo2.dgterritorio.gov.pt/caop/CAOP_Continente_2025-gpkg.zip), CC BY 4.0 (SHA-256 pinned in the `Makefile`) | 3,049 mainland parishes, EPSG:3763 | `data/external/` (main pipeline) |
| Census parishes (geometry only, for the crosswalk) | DGT, [CAOP 2024 Continente](https://geo2.dgterritorio.gov.pt/caop/CAOP_Continente_2024-gpkg.zip), the last edition before the 2025 split (SHA-256 pinned in `insights/config.py`) | 2,882 parishes = the Censos 2021 parishes | `data/external/` |
| Resident population, Census 2011 and 2021 | INE indicator [0011609](https://www.ine.pt/bddXplorer/htdocs/minfo.jsp?var_cd=0011609&lingua=PT), on the Censos 2021 geography (2011 is re-tabulated by INE onto the 2021 parishes), CC BY 4.0 | INE update 2022-11-23 | `raw/ine_census_2011.json`, `raw/ine_census_2021.json` |
| Median dwelling sale value, €/m² | INE indicator [0012255](https://www.ine.pt/bddXplorer/htdocs/minfo.jsp?var_cd=0012255&lingua=PT) (Metodologia 2022, all dwellings), CC BY 4.0 | latest annual period: 2025 (INE update 2026-04-24) | `raw/ine_sale_m2.json` |
| Porto and Lisboa reference points | OpenStreetMap `admin_centre` of each municipality, ODbL | `web/data/cities.json` (osm_base 2026-11-02) | committed |
| Airports OPO, LIS, FAO | OpenStreetMap `aeroway=aerodrome` with `iata`, via Overpass, ODbL | osm_base in `raw/fetch.json` | `raw/osm_airports.json` |

`prepared/national.json` records every source with its URL, period, the source's own update date and the fetch time.

## Sanity checks (`prepare`, and `Data.check()` on every load)

- Census 2011 and 2021: the 2,882 parishes **and** the 278 municipalities each sum exactly to INE's mainland total (10,047,621 and 9,855,909).
- The mainland area computed in EPSG:3763 matches CAOP's official 89,102.14 km² (tolerance 0.1%), and every parish is within 1% of its CAOP `area_ha`.
- All 1,861 PNCT codes match a CAOP 2025 parish, with no duplicates.
- The CAOP 2024 parishes are exactly the Census 2021 parishes, code for code.
- Every Census parish is at least 90% PNCT or at least 90% non-PNCT today. No parish is mixed.
- €/m² is present for (nearly) every concelho (278 of 278), every concelho has an OSM seat, and there are 18 districts.

## The crosswalk: CAOP 2025 ↔ Censos 2021

Lei n.º 25-A/2025 split 134 Census parishes (unions) into 301 current ones, and CAOP 2025 redrew a few boundaries. Census figures exist only for the 2021 parishes. Each CAOP 2025 parish is assigned to the Census parish it overlaps most (EPSG:3763).

- **Totals** (PNCT population share, change 2011→2021, density by group) are counted on the 2,882 Census parishes. Each split union is wholly PNCT or wholly non-PNCT, so it is assigned whole. The one exception is *Santa Maria de Sardoura* (Castelo de Paiva): after the 2025 boundary changes, 4% of its area lies in PNCT neighbours, and it counts as non-PNCT (`national.json` → `crosswalk.not_clean`).
- **Per-parish rankings** by population or density use only the 2,736 parishes whose 2025 boundaries equal a Census parish (same territory, at least 99% overlap both ways). Each such card says so in a footnote.
- **Area and distance** facts use the CAOP 2025 parishes directly.

## Prepared files

| File | Rows | Columns |
|---|---|---|
| `parishes.csv` | 3,049 | `dicofre, name, dtmn, concelho, dt, distrito, pnct, area_km2, cx, cy, lon, lat, centroid_inside, touches_coast, coast_km, porto_km, lisbon_km, opo_km, fao_km, lis_km, census_code, census_same, pop2011, pop2021` (population only when `census_same`) |
| `census_units.csv` | 2,882 | `census_code, census_name, dtmn, unit_km2, pnct_share, pnct, pop2011, pop2021` |
| `municipalities.csv` | 278 | `dtmn, concelho, distrito, n_parishes, n_pnct, area_km2, pnct_km2, pop2011, pop2021, status (full/partial/none), sale_m2, seat, seat_coast_km` |
| `districts.csv` | 18 | `dt, distrito, area_km2, pnct_km2` |
| `national.json` | | mainland totals, sale-value period and the Portugal value, reference points, coastline definition, crosswalk statistics, sources |
| `map.json` | 3,049 | simplified outlines (400 m tolerance, EPSG:3763 metres), for the small maps only |

## Definitions

- **Distance:** a straight line in EPSG:3763 from the parish centroid. For the 21 parishes whose centroid falls outside their own boundary (e.g. Carvalhal, Grândola, a curved coastal strip), shapely's interior point is used instead.
- **Coast:** the CAOP 2025 boundary segments *Limite e Linha de Costa* (1,217 km), which include estuary and lagoon shores. A parish "touches the coast" when its boundary is within 1 m of it.
- **"Within 30 km of the coast"** (housing): the concelho's OSM seat is within 30 km of that coastline, in a straight line.
- **PNCT concelho** (housing and concelho population insights): every parish of the concelho is PNCT (165 concelhos), because INE's values are per concelho.
