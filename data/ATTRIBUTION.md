# Data attribution and licence status

Sources behind the committed data in `web/data/` and `data/processed/`. The site credits the same sources in the map attribution, the phone bottom-sheet credit and the About panel.

| Data | Provider | Edition | URL | Licence | Status |
|---|---|---|---|---|---|
| PNCT territories | IEFP | List dated 2026-02-04 (PDF) | https://www.iefp.pt/documents/10181/4287418/Territorios+PNCT_04-02-2026.pdf | Public administrative document | Used as published |
| Boundaries (CAOP 2025) | DGT, Direção-Geral do Território | CAOP 2025 Continente | https://www.dgterritorio.gov.pt/cartografia/cartografia-tematica/caop | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). "Informação geográfica cedida pela Direção-Geral do Território." | Confirmed |
| Protected areas (RNAP) | ICNF, Instituto da Conservação da Natureza e das Florestas | Live service, fetched 2026-10-17 (layer 0 "RNAP - Limites", 56 areas) | https://sigservices.icnf.pt/server/rest/services/BDG/RNAP/MapServer | **Not confirmed.** The service states only "Instituto da Conservação da Natureza e das Florestas, IP" as copyright, with no reuse licence. | **Open: confirm with ICNF.** Can be dropped with one line in `scripts/protected_config.py` (`CATEGORIES["rnap"] = None`). |
| Natura 2000 | EEA, European Environment Agency | Natura 2000 (vector), version end 2024 (published 2025-12-01), fetched 2026-10-17 | https://sdi.eea.europa.eu/catalogue/srv/api/records/91357f39-7866-41ce-b447-43905c364ec8 (DOI 10.2909/91357f39-7866-41ce-b447-43905c364ec8) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Confirmed (catalogue record) |
| Population, ageing index (concelho card) | INE, Instituto Nacional de Estatística | Estimativas Anuais da População Residente 2025 (0012917, 0012909; INE update 2026-06-22) and Censos 2011/2021 (0011609) | https://www.ine.pt/ine/json_indicador/ (fetched by `scripts/fetch_ine.py`) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), with the source identified (INE publications catalogue 2026) | Confirmed |
| Câmara contacts and PDM links (concelho card) | Each câmara municipal's website | Checked by hand; date per row (`as_of`) in `data/contacts/camaras.csv` | The câmara websites | Generic institutional contacts published by public bodies, no personal data; links only | Curated |
| Basemap | OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors | Live tiles | https://openfreemap.org | ODbL (OSM data) | Confirmed |

## Protected areas: how the sources plug in

`scripts/protected_config.py` maps each category (`rnap`, `natura`) to one source. To swap a source, point the category at another entry of `SOURCES`. To drop a category, set it to `None`, run `uv run make protected`, and the overlay, the shares, the legend toggle and the credits all follow.

- `natura-icnf` (ICNF `BDG/RN2000`, layers ZPE and SIC) is ready as a drop-in alternative to `natura-eea`, under the same unconfirmed ICNF terms as RNAP.
- Each fetch records the source URL, licence and UTC fetch time in `data/external/protected/<source>/fetch.json` (not committed). The build copies these into the per-field `meta` of `web/data/protection.json` and into `web/data/protected.meta.json`.
- The EEA GeoPackage (1.36 GB, EU-wide) is pinned by SHA-256 `fc947b01…964f42` in `protected_config.py`. The ICNF service is live and has no version, so its "as of" date is the fetch date.

## Concelho card: population and contacts

`scripts/concelhos_config.py` lists the INE indicators. `make concelhos-fetch` caches the raw responses and a `fetch.json` (URL, period, INE update date, fetch time) in the gitignored `data/external/ine/`; `make concelhos` builds `data/concelhos.json` and `web/data/concelhos.json`, with this meta per field.

- The population change compares two Census counts (2011 and 2021), never an annual estimate with a Census: since 2021 the estimates are administrative-based and differ from the Census by up to ±20% per municipality in the same year.
- The card's source line reads "INE, population estimates <year>, Censuses 2011/2021 · CC BY 4.0".

