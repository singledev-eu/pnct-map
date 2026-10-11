# CAOP research: editions, download URLs, 2025 parish split

Research date: 2026-10-11. Method: web search / web fetch only. No datasets were downloaded, so file sizes and GeoPackage layer/field names were not inspected directly. Anything not verified is marked **UNVERIFIED**.

Main source page (DGT, CAOP): https://www.dgterritorio.gov.pt/cartografia/cartografia-tematica/caop
It resolves to https://www.dgterritorio.gov.pt/atividades/cartografia/cartografia-tematica/caop.

## Summary

- CAOP2025 (Continente) already contains the post-split parishes. Its OGC API freguesias collection has **3049** items, and the split parishes of Águeda and Castelo de Paiva are present as separate parishes.
- The split was first integrated in the extraordinary edition **CAOP 2024.1**, not in the regular CAOP2025. The CAOP2025 metadata lists only Lei 27/2025 and Lei 48/2025 as its own changes.
- CAOP2024 (regular, approved 2025-01-03) is the last pre-split edition. Its Continente count is UNVERIFIED but is derived to be about 2882 (see Q3).
- Recommendation: use **CAOP2024** to match the 2026-02-04 list (see Q5).

## 1. Editions from 2023 onwards

| Edition | Approved / published | Source |
|---|---|---|
| CAOP2023 | Approved by despacho of 2024-01-08 | https://www.dgterritorio.gov.pt/Carta-Administrativa-Oficial-de-Portugal-CAOP-2023 (date taken from the search-result snippet; page body not re-read) |
| CAOP2024 | Approved 2025-01-03; news item dated 27/02/2025 | https://www.dgterritorio.gov.pt/Carta-Administrativa-Oficial-de-Portugal-CAOP-2024 |
| CAOP2024.1 (extraordinary version) | Approved 2025-06-11; news item dated 18/08/2025. It was made to integrate Lei n.º 25-A/2025. | https://www.dgterritorio.gov.pt/carta-administrativa-oficial-de-portugal-caop-20241 |
| CAOP2025 | Approved 2026-01-28; Aviso n.º 3502/2026/2, DR 2.ª série n.º 34, 2026-02-18. It covers changes from 2025-03-16 to 2025-12-31. | https://www.dgterritorio.gov.pt/atividades/cartografia/cartografia-tematica/caop and https://www.dgterritorio.gov.pt/carta-administrativa-oficial-de-portugal-caop-2025 |
| CAOP2026 | None listed on the DGT CAOP page as of this research. The latest published edition is CAOP2025. | https://www.dgterritorio.gov.pt/atividades/cartografia/cartografia-tematica/caop |

Other notes:
- Regarding 2024.1, a search result titled "Aviso 19817/2025/2 de 7 de agosto" describes "Aprovação da nova versão da CAOP de 2024". That result is on dre.tretas.org, which returned 403 when fetched, so it is only partly verified: https://dre.tretas.org/dre/6268211/aviso-19817-2025-2-de-7-de-agosto
- CAOP2024 introduced a new PostgreSQL/PostGIS and INSPIRE-aligned data model. Editions up to CAOP2023 used the EuroBoundaryMap v3.0-based model. Source: the DGT CAOP page above and https://github.com/dgterritorio/CAOP

## 2. Official download URLs (Continente)

### CAOP2025 (GeoPackage only on the DGT page)

- URL: https://geo2.dgterritorio.gov.pt/caop/CAOP_Continente_2025-gpkg.zip
- Source: the DGT CAOP page above, "Serviço de descarregamento > Continente > Geopackage". The same URL appears in the SNIG metadata: https://snig.dgterritorio.gov.pt/rndg/srv/api/records/198497815bf647ecaa990c34c42e932e/formatters/snig-view
- Metadata: https://snig.dgterritorio.gov.pt/catalogo/srv/por/catalog.search#/metadata/198497815bf647ecaa990c34c42e932e
- Changes list (PDF): https://www.dgterritorio.gov.pt/sites/default/files/ficheiros-cartografia/alteracoes_CAOP2025.pdf. The fetch tool cannot read PDFs, so its content is UNVERIFIED.
- CRS: ETRS89 / Portugal TM06, EPSG:3763 (SNIG metadata above).
- License: CC-BY-4.0, with the credit text "Informação geográfica cedida pela Direção-Geral do Território" (SNIG metadata above).
- Other access routes:
  - WMS: https://geo2.dgterritorio.gov.pt/geoserver/caop_continente/wms
  - OGC API: https://ogcapi.dgterritorio.gov.pt/collections/freguesias
  - Open data centre: https://cdd.dgterritorio.gov.pt/ (https://www.dgterritorio.gov.pt/dados-abertos)

### CAOP2024.1 (post-split, extraordinary version)

- GeoPackage: https://www.dgterritorio.gov.pt/sites/default/files/ficheiros-cartografia/CAOP_Continente_2024.1-gpkg.zip
- Metadata PDF: https://www.dgterritorio.gov.pt/sites/default/files/ficheiros-cartografia/Metadados_CAOP2024.1.pdf
- Changes list: https://www.dgterritorio.gov.pt/sites/default/files/ficheiros-cartografia/alteracoes_CAOP2024.1.pdf
- Source for all three: the DGT CAOP page, section "2024.1".

### CAOP2024 (regular, pre-split)

- GeoPackage: https://www.dgterritorio.gov.pt/sites/default/files/ficheiros-cartografia/CAOP_Continente_2024-gpkg.zip
- Metadata PDF: https://www.dgterritorio.gov.pt/sites/default/files/ficheiros-cartografia/Metadados_CAOP2024.pdf
- Changes list: https://www.dgterritorio.gov.pt/sites/default/files/ficheiros-cartografia/alteracoes_CAOP2024.pdf
- Extra information (zip): https://www.dgterritorio.gov.pt/sites/default/files/ficheiros-cartografia/InfExtra_Municipios_Freguesias_CAOP2024.zip
- Source for all four: the DGT CAOP page, section "2024". The relative links on that page resolve to these absolute URLs.

### CAOP2023 (for reference)

- Shapefile: https://www.dgterritorio.gov.pt/sites/default/files/ficheiros-cartografia/CAOP_Continente_2023-shp.zip
- GeoPackage: https://www.dgterritorio.gov.pt/sites/default/files/ficheiros-cartografia/CAOP_Continente_2023-gpkg.zip
- Source: the DGT CAOP page, section "2023".

### Not verified for the three zips above

- Approximate size: **UNVERIFIED**. No HEAD or download was done, and the SNIG metadata leaves "Tamanho de Transferência (Mb)" empty.
- CRS for CAOP2024 and CAOP2024.1: **UNVERIFIED**. The DGT data-model docs say the Continente editing tables use EPSG:3763 (https://raw.githubusercontent.com/dgterritorio/CAOP/master/documentacao/docs/implementacao_modelo.md).
- Whether the GeoPackage layer and column names match the OGC API names below: **UNVERIFIED**. Open the GPKG to confirm.

### Attribute fields

Confirmed for CAOP2025 through the OGC API queryables for the freguesias collection: https://ogcapi.dgterritorio.gov.pt/collections/freguesias/queryables?f=html

| Field | Type | Notes |
|---|---|---|
| `dtmnfr` | string | Parish code, 6 digits (e.g. `010103`). It is the DICOFRE equivalent. INE assigns the codes (DGT user guide: https://raw.githubusercontent.com/dgterritorio/CAOP/master/documentacao/docs/guia_do_utilizador.md). |
| `freguesia` | string | Official name. For a União it is the long "União das freguesias de ..." text. |
| `designacao_simplificada` | string | Short name, e.g. "Recardães e Espinhel" for a União. |
| `municipio` | string | |
| `distrito_ilha` | string | |
| `nuts3_cod`, `nuts3`, `nuts2`, `nuts1` | string | |
| `area_ha` | number | |
| `perimetro_km` | integer | |

- Evidence for the 6-digit code and the União naming: https://ogcapi.dgterritorio.gov.pt/collections/freguesias/items?f=html&limit=30&municipio=%C3%81gueda
- Field names for CAOP2024, CAOP2024.1 and CAOP2023 are **UNVERIFIED**. From memory, pre-2024 shapefiles used `DICOFRE`, `Freguesia`, `Concelho` and `Distrito`, but I did not confirm this.

### dados.gov.pt mirrors

- No DGT CAOP mirror was found on dados.gov.pt. The only "Carta administrativa" dataset found is from Agência Portuguesa do Ambiente and is unrelated: https://dados.gov.pt/en/datasets/carta-administrativa/. The dados.gov.pt mirror question is **UNVERIFIED** and probably negative.
- DGT's own open-data route is the Centro de Dados: https://cdd.dgterritorio.gov.pt/

## 3. Does CAOP2025 reflect the 2025 desagregação?

**Yes, in the data. The split was integrated earlier, in CAOP2024.1.**

### Law

- Lei n.º 25-A/2025, de 13 de março: https://diariodarepublica.pt/dr/detalhe/lei/25-a-2025-910933580
  - It "repõe freguesias agregadas pela Lei n.º 11-A/2013".
  - It applies the special simplified transitional procedure of art. 25.º of Lei n.º 39/2021.
- Timeline: parliament approved it on 2025-01-17. The President returned it without promulgation on 2025-02-12. Parliament reconfirmed it on 2025-03-06. Source: https://sapo.pt/artigo/lista-de-unioes-de-freguesias-cuja-desagregacao-foi-hoje-reconfirmada-pelo-parlamento-68ad654d4db0a1bfc2183797
- Follow-ups:
  - Declaração de Retificação n.º 23-A/2025/1 (12 May) and n.º 26/2025/1 (20 May). Source: http://dre.tretas.org/dre/6178663/declaracao-de-retificacao-26-2025-1-de-20-de-maio. This page appeared only in search results and was not fetched.
  - Lei n.º 66/2025 is a "Primeira alteração" to Lei 25-A/2025, dated 2025-11-07. Its content is UNVERIFIED beyond the title. Source: https://fpsolicitador.pt/diario-da-republica/lei-numero-66-2025-diario-da-republica/. The President promulgated it on 2025-10-31 (https://localnoticias.pt/marcelo-rebelo-de-sousa-promulga-reposicao-de-freguesias/). The President's comment there suggests it covers staff and transitional matters.

### Numbers

- 135 uniões de freguesias (or parishes ceding territory) are dissolved and 302 parishes are restored, in 70 municipalities. Source: https://observador.pt/2025/09/28/reducao-imposta-pela-troika-volta-atras-nestas-autarquicas-veja-que-freguesias-estao-de-regresso/
- The restored parishes keep their pre-2013 limits and names. Same source.
- Net effect is +167 parishes. National total goes from 3,091 to 3,258 (same Observador source).
- The restoration takes effect with the 2025-10-12 local elections. Sitting executives stay until then (same Observador source and the Sapo article).

### Counts in the CAOP data

| Edition | Continente parishes | Status |
|---|---|---|
| CAOP2025 | **3049** | Verified. The OGC API "CAOP2025 Freguesias" collection reports "Items in this collection: 3049": https://ogcapi.dgterritorio.gov.pt/collections/freguesias/items?f=html&limit=3&offset=0 |
| CAOP2024 | about 2882 | **UNVERIFIED**. Derived as 3049 − 167. It is consistent with the user's 2882 / 3091 and with Lusa's "3.091" national figure for the pre-restoration state. |
| CAOP2024.1 | about 3049 | **UNVERIFIED**. DGT says it integrates Lei 25-A/2025 (https://www.dgterritorio.gov.pt/carta-administrativa-oficial-de-portugal-caop-20241), but I did not inspect the data. |

- On the "approx. 2882 / 3091" figures: 3,091 is the national total before restoration, per Observador (it excludes Corvo, which has no parish council). 2882 for Continente is not directly sourced; it is only the derived value above.

### Evidence that CAOP2025 holds the post-split state

- Águeda has 15 parishes in CAOP2025. They include separate Águeda (`010130`), Borralha (`010133`), Agadão (`010128`), Aguada de Baixo (`010129`), Barrô (`010131`), Belazaima do Chão (`010132`) and Castanheira do Vouga (`010134`). Four unsplit uniões remain (`010124` to `010127`). Source: https://ogcapi.dgterritorio.gov.pt/collections/freguesias/items?f=html&limit=30&municipio=%C3%81gueda
- Castelo de Paiva has Bairros (`010612`), Paraíso (`010613`), Pedorido (`010614`), Raiva (`010615`) and Sobrado (`010616`) as separate parishes. Source: https://ogcapi.dgterritorio.gov.pt/collections/freguesias/items?f=html&limit=30&municipio=Castelo%20de%20Paiva
- Both lists match the Observador list of restored parishes.
- The CAOP2025 SNIG metadata names only Lei 27/2025 (Pernes, Santarém) and Lei 48/2025 (Castelo de Paiva) as its own changes. The Lei 25-A integration is therefore not part of CAOP2025's changes. Source: https://snig.dgterritorio.gov.pt/rndg/srv/api/records/198497815bf647ecaa990c34c42e932e/formatters/snig-view
- Restored parishes receive **new `dtmnfr` codes** (INE responsibility), per the DGT editing guide: https://raw.githubusercontent.com/dgterritorio/CAOP/master/documentacao/docs/guia_do_utilizador.md. Whether the old União codes were retired or reused is **UNVERIFIED**.

## 4. Official correspondence table (old U.F. DICOFRE → new parishes)

**Not found. UNVERIFIED that none exists.**

- DGT publishes per-edition change lists as PDFs: `alteracoes_CAOP2024.1.pdf` and `alteracoes_CAOP2025.pdf` (URLs in Q2). The fetch tool cannot read PDFs, so I could not check whether they contain code mappings.
- The CAOP2024 "Informações extra" zip is a municipalities-and-parishes extra, not a correspondence table (URL in Q2). Its content is UNVERIFIED.
- Law text: Lei 25-A/2025 lists the unions to dissolve and the parishes to restore by name (https://diariodarepublica.pt/dr/detalhe/lei/25-a-2025-910933580). I could not read the page (JavaScript required), so annexes are UNVERIFIED.
- INE assigns the new codes (DGT guide above). No INE crosswalk was found by search.
- Fallback to build one: join CAOP2024 and CAOP2025 `dtmnfr` by municipality and name, and use spatial overlay for the 135 affected unions. Restored parishes keep their pre-2013 limits, so overlay should be reliable.

## 5. Recommendation

For a list written on **2026-02-04** that uses **pre-split U.F. names**, use **CAOP2024** (regular edition) as the primary geometry source.

Reasons:
- CAOP2024 is the last edition before the restoration (approved 2025-01-03, before Lei 25-A/2025 of 2025-03-13). Its union names and codes should match a list built on the pre-split administrative state, so no crosswalk is needed. This is inferred from the dates, not from inspecting the data.
- CAOP2024.1 and CAOP2025 both reflect the split (the former per DGT, the latter verified at 3049 parishes). A list with old U.F. names will fail to match the 135 split unions in 70 municipalities, which is about 302 new parishes.
- The list (2026-02-04) post-dates CAOP2025's approval (2026-01-28) but pre-dates its official publication (DR and DGT page, 2026-02-18). CAOP2025 was therefore not publicly available when the list was written, which fits a list built on a pre-split source. Whether the list really matches CAOP2024 must be tested against the actual data; the web alone cannot prove it.

Suggested approach:
1. Download CAOP2024 Continente and join on name and municipality, or on `dtmnfr` if the list carries DICOFRE. Report the unmatched count.
2. Download CAOP2025 as well. For unions that were split, use a spatial overlay to map old unions to new parishes, if the product needs current boundaries.
3. Check the list's municipalities against the 70 affected municipalities (Observador list above). Mismatches outside them would point to other causes.

What I could not verify: file sizes, GeoPackage layer and column names for the 2024 and 2024.1 editions, parish counts for CAOP2024 and CAOP2024.1, and whether CAOP2024.1 equals CAOP2025 on the parish layer.
