# Land check: data sources (Phase 0)

Checked 2026-11-15. Every URL below was requested on that date. The results are recorded here, not recalled from memory. The verdict for v1 is in the **Status** column.

| # | Dataset | Official source | Machine-readable version | Licence | Reference date | Resolution / scale | Size | CRS | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Structural wildfire hazard map 2020–2030 (Carta de Perigosidade de Incêndio Rural, cariz estrutural), 5 classes | ICNF geoCATÁLOGO, theme 5 (https://geocatalogo.icnf.pt/catalogo_tema5.html); metadata https://geocatalogo.icnf.pt/metadados/perigosidade_estrutural_20_30.html | GeoTIFF in a zip: https://geocatalogo.icnf.pt/dados/perigosidade_estrutural_2020_2030.zip (SHA-256 `4bb7f921…780a8011`). Also KML, WMS and WCS (`si.icnf.pt/geoserverplinia/BDG`). | ICNF geoCATÁLOGO terms: open data, free reuse, with the citation "ICNF, [layer], [download URL], [download date]" | SRUP record 2022-03-28 (zip `Last-Modified` 2022-03-28; the `.tif` inside is dated 2021-05-07). Methodology report 2020-04-03. | 25 m cells (11,253 × 23,060) | 19.5 MB zip, 20.1 MB `.tif` | EPSG:3763 (PT-TM06/ETRS89) | **OK** |
| 2 | REN, Reserva Ecológica Nacional (whole mainland) | DGT/SNIT, SRUP series. SNIG record `ad95b02a-fbd2-4b8e-89b6-f699a9ff3c0d`; dados.gov.pt dataset `srup-reserva-ecologica-nacional` | One WMS (`SDISNITWMSSRUP_REN_PT1`) and six WFS: `SDISNITWFSSRUP_REN_{NORTE,CENTRO,LVT,ALENTEJO,ALGARVE,PT1}` on `servicos.dgterritorio.pt`. No file download. Per-municipality vector downloads exist only inside the SNIT web app (snit-sgt.dgterritorio.gov.pt/ren, JavaScript only). | **Conflicting.** dados.gov.pt says `cc-by`. The SNIG/SNIT metadata says "destina-se à consulta e visualização… Qualquer outra utilização carece de autorização expressa da DGT". | SNIG metadata 2026-06-22; series created 2021-01-04 | 1:10 000 (metadata denominator); municipal delimitations at 1:25 000 or better | Unknown (could not query) | EPSG:3763 | **BLOCKED** |
| 3 | ANACOM fixed-network coverage | ANACOM. dados.gov.pt has two datasets: `cobertura-das-redes-fixas-servicos-de-voz-e-internet` (updated 2023-12-18) and `cobertura-da-rede-fixa-de-comunicacoes-eletronicas` (2026-07-01) | The 2023 dataset has **no resources**. The 2026 dataset has one resource, a **WMS**: `https://geo.anacom.pt/server/services/publico/Rede_Fixa/MapServer/WMSServer`. The ArcGIS REST endpoint behind it reports `capabilities: "Map"`, so it has no Query operation. Layers: Fibra Ótica, Cabo coaxial (DOCSIS 3.1), (DOCSIS 3.0), Cobre (com ADSL), (sem ADSL). | `notspecified` on dados.gov.pt; no copyright or licence text on the service | Quarterly ("the calendar quarter before the current date") | **Address-level** potential coverage (Decreto-Lei 40/2022, Portaria 77/2023), not BGRI subsections | n/a (images only) | EPSG:4326 service | **BLOCKED** |
| 4 | PNCT parishes | Already in the repo: IEFP list 2026-02-04 matched to CAOP 2025 (`web/data/pnct.topo.json`) | — | Public administrative document; CAOP CC BY 4.0 | 2026-02-04 (list), CAOP 2025 | CAOP display geometry, 1.2e5 quantization (~4.8 m) | (existing) | EPSG:4326 | **OK** |

## Notes per dataset

### 1. Wildfire hazard (OK)

- **Legal status.** The SRUP record cites Decreto-Lei 82/2021, art. 41 (the hazard map is one component of the risk cartography). The building and land-use rules tied to the related risk map were contested and suspended, so the app calls this a **hazard classification** and never a building rule.
- **Classes.** In the raster, 1 = muito baixa, 2 = baixa, 3 = média, 4 = alta, 5 = muito alta, and 15 = no data. ICNF's own palette comes from the QML in the zip: `#45b345`, `#ebff2f`, `#ee9b00`, `#dc0f0f`, `#902003`.
- **Unclassified land inside the mainland.** The methodology report ("Metodologia para a produção da Carta de Perigosidade de Incêndio Rural de cariz estrutural", Relatório Definitivo, 2020-04-03) scores only the farm, forest and scrub classes of COS 2018 (Table 1, COS 2.x to 7.1.3.1). Its class shares are percentages of "território florestal e agrícola". Built-up land, water and other surfaces therefore have no class. The centres of Porto and Lisbon both read 15 (no data). The app shows this as "not classified", never as "low".
- **Rejected source.** The only resource on dados.gov.pt `risco-de-incendios-rurais` (publisher: ANEPC, `notspecified` licence) is a WFS on a bare IP address (`http://23.95.164.237:8080/geoserver/`). It is not an ICNF or ANEPC host, so it is not used.
- **Also rejected.** `https://www.dgterritorio.gov.pt/download/CARTA_PERIGOSIDADE_INCENDIO_RURAL/PERIGOSIDADE_INCENDIO_RURAL.zip`, listed in the SRUP record, returns 404. The SRUP copy also carries the restrictive SNIT terms (see REN). ICNF's own geoCATÁLOGO copy is open data.

### 2. REN (BLOCKED)

Three separate reasons. Any one of them is enough for v1.

1. **The services are down.** On 2026-11-15 the WFS `GetCapabilities` returned HTTP 500 after ~78 s: "GetLayerNames: BuildLayerInfoOfAllLegendEntries: Unable to connect to the database". That was the Algarve endpoint. The PT1, LVT and Algarve endpoints first timed out at 45–60 s. The WMS timed out too.
2. **The licence conflicts.** dados.gov.pt lists the dataset as CC BY. The DGT metadata it comes from limits SNIT data to consultation and viewing, and any other use needs DGT's express authorisation. Publishing a derived layer on a public site goes beyond consultation. This needs a written answer from DGT.
3. **Coverage is unknown.** The REN is delimited per municipality and published in the Diário da República. SNIT itself says its vector data does not replace the published image-format delimitations. Without a working WFS, there is no way to count which municipalities are covered.

**What a full-mainland download would take** once the service works and the licence is clear: page `GetFeature` through the five regional WFS layers (or `REN_Nacional` on PT1) in EPSG:3763. That has the same shape as `fetch_protected.py`'s ArcGIS paging. Then record each municipality's presence and delimitation date, so the app can answer "unknown" for municipalities with no data. Scraping the SNIT viewer is not an option.

### 3. ANACOM fixed coverage (BLOCKED)

- No bulk file exists in any format, and no licence is stated.
- The only machine endpoint is a **view** service (WMS / ArcGIS `capabilities: Map`). It renders images. It offers no feature query and no download. Reading coverage out of rendered map images would mean scraping a viewer, which is not allowed.
- The spatial unit is the **address** (operators report per address under DL 40/2022), not BGRI subsections. The fields seen are technology layers (fibre PON/P2P, DOCSIS 3.0/3.1, copper with or without ADSL). Speeds are in the GEO.ANACOM "Coberturas disponíveis" lookup, which is interactive only.
- **Possible routes:** ask ANACOM for the address-level or BGRI-aggregated file under the open-data rules (Lei 26/2016), or for a licence on the parish-level table behind the quarterly "Redes e serviços de alta velocidade em local fixo" reports. The current RAV PDFs give only NUTS II tables.

### 4. PNCT (OK)

The parish under a point comes from the CAOP 2025 display geometry the map already loads. It is simplified and quantized, so within about 5 m of a parish boundary the answer can differ from the full-resolution CAOP. Idealista links keep coming from `shapes.json`, as before.

## Viewers for checking by hand

| Fact | Official viewer |
|---|---|
| Wildfire hazard | ICNF geoCATÁLOGO WMS viewer (https://geocatalogo.icnf.pt/, theme 5, "Carta de perigosidade de incêndio rural – 2020-2030"), or the SNIT SRUP viewer (https://snit-mais.dgterritorio.gov.pt/PortalSobreposicoes) |
| REN | SNIT (https://snit-sgt.dgterritorio.gov.pt/ren) or the SNIT overlays portal |
| Fixed broadband | GEO.ANACOM (https://geo.anacom.pt), "Coberturas disponíveis" |
| Parish and PNCT | CAOP 2025 (DGT) and the IEFP PNCT list (PDF) |

## Watching the sources

A weekly job on the Raspberry Pi (`ops/pi/`, [README](../../ops/pi/README.md)) watches these sources and sends a Telegram message when one changes. It reads the source list from `scripts/landcheck_config.py`: `HAZARD` (URLs and the pinned SHA-256) for the live dataset, and `BLOCKED[...].watch` for the endpoints that would unblock REN and fixed broadband. A new endpoint to watch goes there, not in the watcher.
