# insights/data/raw/

Downloads, gitignored. `python -m insights fetch` writes them, so nothing needs to be dropped in by hand. If a source can't be reached from where the pipeline runs (network restrictions), download these files elsewhere and put them here under exactly these names. Then add a matching entry to `fetch.json` (the format `fetch` writes: `file`, `code`, `period`, `url`, `source_updated`).

| File | URL | Expected content |
|---|---|---|
| `ine_census_2011.json` | `https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&lang=PT&varcd=0011609&Dim1=S7A2011&Dim3=T&Dim4=T` | INE JSON API response: `[{"Dados": {"2011": [{"geocod", "geodsg", "valor", …}]}}]`, every geography (Portugal, NUTS, 308 municipalities, 3,092 parishes) |
| `ine_census_2021.json` | same, with `Dim1=S7A2021` | same, for 2021 |
| `ine_sale_m2.json` | `https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&lang=PT&varcd=0012255&Dim1=S7A<year>&Dim3=H1` (`<year>` = the indicator's latest period, `UltimoPeriodo` from `https://www.ine.pt/ine/json_indicador/pindicaMeta.jsp?lang=PT&varcd=0012255`) | same shape; municipalities coded `1` + NUTS3 + DICO (7 characters), Portugal `PT` |
| `osm_airports.json` | Overpass `https://overpass-api.de/api/interpreter`, query in `insights/config.py` (`AIRPORTS_QUERY`) | Overpass JSON with the three aerodromes tagged `iata=OPO/LIS/FAO`, `out center` |
| `usage_parish_views.csv` | none yet: the site has no analytics | `dicofre,views,period_start,period_end`. It would unblock `most_viewed_parishes` |

CAOP 2024 (the Census 2021 parishes, for the crosswalk) goes to `data/external/CAOP_Continente_2024-gpkg.zip` (`https://geo2.dgterritorio.gov.pt/caop/CAOP_Continente_2024-gpkg.zip`, SHA-256 `a51b2458…`, checked by `fetch`).
