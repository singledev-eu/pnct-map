# Nearby services: data sources (Phase 0)

Checked 2026-11-26. Every URL below was requested on that date, and the counts come from those
downloads, not from memory. Build numbers are from `data/services/build_report.json` (`uv run make services`).

**Verdict:** OpenStreetMap for health centres, supermarkets, schools, pharmacies and train stations. For
hospital emergency departments, the official SNS list says *which* services exist, and each one is placed
on its OSM building (hand-checked, `data/services/sns_urgencias.csv`). No official source with per-unit
coordinates and a reuse licence exists for the other categories.

## Sources

| Category | Chosen source | Rejected / cross-check | Licence | Date | Count (mainland) | Official total (sanity) | CRS |
|---|---|---|---|---|---|---|---|
| Health centre (SNS primary care: centro de saúde, USF, UCSP, extensão) | OSM, by name (rules below) | SNS "Evolução do número de unidades funcionais" (transparencia.sns.gov.pt, CC BY on dados.gov.pt): one row per ULS, a single point per ULS, no unit list | ODbL 1.0 | extract 2026-11-25 | 953 | No per-unit list published; the SNS has ~900 USF/UCSP plus extensions, many sharing a building (order of magnitude only) | EPSG:4326 |
| Hospital emergency (SNS urgência: SUB, SUMC, SUP) | SNS list "Caracterização das Valências de Urgência" + OSM position | OSM `emergency=yes` alone: 107 hospitals, mixes private hospitals and Red Cross posts, misses most SUBs (they sit in health centres) | List: CC BY 4.0 (ACSS record on dados.gov.pt); positions: ODbL | SNS data period "maio 2023" (portal `dcat.temporal`), export fetched 2026-11-26 | 84 (90 mainland services, minus 6 paediatric/maternity) | ~85–90 mainland emergency points in the SNS network | EPSG:4326 |
| Supermarket | OSM `shop=supermarket` | none official | ODbL 1.0 | 2026-11-25 | 3,245 | No official count. All major chains present: Pingo Doce 441, Lidl 296, Continente (Bom Dia/Modelo/–) 380, Aldi 162, Intermarché (all formats) 263, Auchan (all) 263, Meu Super 109, Amanhecer 109, Mercadona 79, Minipreço 49, Spar 55 | EPSG:4326 |
| Primary school (1.º ciclo) | OSM `amenity=school`, by name / `isced:level` | DGEEC "Alunos matriculados…" (other-pd): per-school xlsx up to 2019/20, no coordinates; InfoEscolas (cc-by, 2021): secondary only, no coordinates | ODbL 1.0 | 2026-11-25 | 3,702 | **3,770** establishments with 1.º ciclo, mainland 2024/25 (INE 0012584, from DGEEC; CC BY) → OSM −1.8% | EPSG:4326 |
| Secondary school (incl. vocational) | OSM, as above | as above | ODbL 1.0 | 2026-11-25 | 754 | **915** with ensino secundário (same INE table) → OSM −18% | EPSG:4326 |
| Pharmacy | OSM `amenity=pharmacy` (not `dispensing=no`) | INFARMED's finder is interactive only | ODbL 1.0 | 2026-11-25 | 2,496 | **2,803** pharmacies + 179 mobile posts, mainland 2025 (INE 0013201; CC BY) → OSM −11% | EPSG:4326 |
| Train station (CP / Fertagus) | OSM `railway=station|halt` (heavy rail) on an active line | none open (no CP GTFS with a reuse licence found) | ODbL 1.0 | 2026-11-25 | 433 | not checked | EPSG:4326 |

URLs:

- OSM: Geofabrik Portugal extract `https://download.geofabrik.de/europe/portugal/portugal-261125.osm.pbf`
  (430 MB, data up to 2026-11-25), SHA-256 `ad86a158145908bf1634d00c6633e01f0dbf3723cef1551b3b35b2294ff81952`,
  MD5 `1ebc30a1157376ca3b7674b64328a169` (matches Geofabrik's `.md5`). Pinned in `scripts/services_config.py`.
  The dated file is used, not `-latest`, so the pin stays valid while Geofabrik keeps it (a few months);
  a refresh changes the date, URL and both hashes together.
- SNS list: `https://transparencia.sns.gov.pt/explore/dataset/caracterizacao-das-valencias-de-urgencia/`
  (OpenDataSoft API export: `/api/explore/v2.1/catalog/datasets/caracterizacao-das-valencias-de-urgencia/exports/json`,
  1,077 rows = services × valências). Licence: the ACSS record on dados.gov.pt
  (`caracterizacao-das-valencias-de-urgencia-1`) says `cc-by`; the DE-SNS record of the same export says
  `notspecified`, and the portal's own metadata has no licence field. We use the CC BY record and credit
  "SNS (ACSS/DE-SNS)". Not pinned (it changes without notice): `fetch_services.py` records its SHA-256 and
  date, and the build fails if a curated service has left the list.
- INE totals: `https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd=0012584` (schools, 2024/25,
  updated 2026-06-29) and `…varcd=0013201` (pharmacies, 2025, updated 2026-06-26), both CC BY on dados.gov.pt.

## The SNS emergency list: what is wrong with it, and what we use

The export is a join of services and valências, and the join is broken in places:

- **Mis-joined fields.** `unidade_hospitalar`, `regiao`, `localidade` and `tipo_de_urgencia` often belong to
  another row: "Urgência do Hospital José Joaquim Fernandes – Beja" is listed under "ARS Centro, Coimbra";
  "Urgência do Hospital de Portimão" under Vila Franca de Xira; "SUB Mogadouro" under Amadora. Region counts
  are therefore meaningless (ARS Norte 48, ARS Centro 9). The `tipo_de_urgencia` of one service takes
  2–4 different values, so **the type (SUB/SUMC/SUP) is not shown**.
- **What holds.** `nome_do_servico_de_urgencia` and `localizacao_geografica` are consistent: each of the 90
  mainland service names has exactly one coordinate, and that coordinate is near a matching OSM health
  object for 83 of them.
- **Coordinates geocoded to the town.** 7 coordinates are far from the building: SUB Ponte de Sor 23.8 km
  (near Montargil), Guimarães 5.8 km, Gaia Unidade I 2.5 km, Tondela 2.3 km, Covilhã 2.0 km, Amadora-Sintra
  1.9 km, Santarém 1.9 km (the ULS Lezíria point).
- **Out of scope.** Paediatric and maternity emergencies (Maternidade Bissaya Barreto, Daniel de Matos, Alfredo
  da Costa, Hospital D. Estefânia, Pediátrico de Coimbra, Centro Materno Infantil do Norte) are not general
  emergency departments; `SNS_SPECIALISED` drops them.
- **Age.** The data period is May 2023. Services opened or closed since then (the 2024 ULS reform renamed the
  institutions) are not reflected. The rows still carry pre-2024 institution names (ARS, Centro Hospitalar).

`data/services/sns_urgencias.csv` (84 rows): the SNS name, `position` (`osm` = the matched OSM building, with
its id; `sns` = the official coordinate kept), and a note. Automatic matching (name tokens + distance,
`build_services` does not redo it) picked a wrong object 11 times (private hospitals for Albufeira, Santo Tirso
and Bragança; a military hospital for Coimbra-Covões; a USF for São João; a physiotherapy clinic for
Famalicão…); these were replaced by hand. Three rows keep the SNS coordinate (SUB Albufeira, SUB Loulé,
SUB Lagos): no OSM object could be confirmed as the service, and SUB Loulé and SUB Estremoz are **not
cross-checked** against a second source.

## OSM tag rules (`scripts/services_config.py`)

All are plain functions with tests (`tests/test_services.py`). Objects are nodes, or areas at their
representative point. A node and an area with the same name within 150 m are merged (areas win). Only objects
inside mainland Portugal (CAOP 2025 concelhos) are kept; 58 were outside.

- **Health centre:** `amenity=clinic|doctors|hospital` or `healthcare=centre|clinic|doctor`, and a name that
  starts with Centro de Saúde, USF, UCSP, Unidade de Saúde Familiar, Unidade de Cuidados de Saúde
  Personalizados/Primários, Extensão de Saúde, Polo de Saúde or Posto de Saúde; a generic "Unidade de Saúde X"
  only with an SNS operator (SNS, ARS, ULS, ACES, Ministério da Saúde). Excluded: UCC (community care), URAP,
  USP. OSM has no SNS tag, so a private clinic named "Centro de Saúde X" would pass (none seen in samples).
- **Supermarket:** `shop=supermarket` (OSM's self-service grocery), minus names starting with Minimercado,
  Mini-mercado, Mercearia, Frutaria, Talho or Centro Comercial (mis-tagged small shops and malls).
  `shop=convenience` is not a supermarket. 161 have no name ("Supermarket" in the app).
- **Schools.** The name decides first, because 97% of OSM schools have no `isced:level`, and some imported
  `isced:level` tags are wrong (an "EB 2/3" tagged `isced:level=3`):
  - 1.º ciclo: EB1, "1.º ciclo" (also with ° or without the dot), Centro Escolar, Escola Básica Integrada,
    or a bare "Escola Básica X" / "Escola do Ensino Básico X" that doesn't say 2.º/3.º ciclo;
  - secondary: Secundária, EBS, EB 2,3/S, Liceu, Escola Profissional / Tecnológica / Técnica (INE counts
    vocational schools under "ensino secundário");
  - EB 2,3 (2.º/3.º ciclo only): neither;
  - `isced:level` (1 / 3) decides only names that say nothing;
  - out: "Antiga …", "Escola Primária …" (mostly closed in the 2005–2012 closures), kindergartens, driving,
    music, dance, language and sport schools, universities and senior universities, training centres.
  - Limit: a school group's seat called just "Escola Básica X" can be a 2.º/3.º-ciclo school and is counted
    as 1.º ciclo. The total (−1.8% against INE) suggests the errors are few or balance out.
- **Pharmacy:** `amenity=pharmacy`, not `dispensing=no` (parapharmacies). 207 unnamed.
- **Train station:** `railway=station|halt` with `train=yes` or a heavy-rail operator (Infraestruturas de
  Portugal, CP, Fertagus, Adif/Renfe), not subway, light rail (Metro do Porto, MTS), funicular, tram or tourist
  trains, **and within 100 m of an active `railway=rail` line**: 37 stations on closed or dismantled lines were
  dropped. A halt with few trains a day counts the same as a main station.

## Parish points

**INE BGRI 2021 is not readily available:** `mapas.ine.pt/download/…` returned 404 or an empty reply on
2026-11-26, so no population-weighted point. Instead, each parish is measured from its **main settlement**: the
OSM `place=*` node inside the parish whose name matches the parish name (2,972 of 3,049), else the best-ranked
place (city > town > village > suburb > hamlet …; 75), else the polygon's point-on-surface (2). Concelhos are
measured from their seat (`web/data/cities.json`, OSM admin_centre; all 278). The app names the origin
("From Monsanto"). The points are in `data/services/parish_points.csv`.

Limits: in a large parish (Alentejo, Algarve serra), a farm 15 km from the parish village gets a different
answer. That is what the land check grid is for (any point, 1 km cells).

## Car routing (no Docker, no external engine)

`scripts/services_graph.py`, pure Python (pyosmium + numpy + scipy):

- **Graph:** every way with a drivable `highway` value. Speeds are OSRM-car-like class defaults (km/h): motorway 90,
  trunk 85, primary 65, secondary 55, tertiary 40, unclassified/residential 25, living_street 10, service 15,
  links 20–45. With a usable `maxspeed` (numbers, `PT:urban` 50, `PT:rural` 90, `PT:trunk` 100,
  `PT:motorway` 120), 80% of it, capped at the class default + 20%. **Tracks** (`highway=track`) are drivable
  at 10 km/h (15 for `tracktype=grade1`; grade4/5 out): many rural plots are reached only by a dirt road.
  Without them, 19% of the mainland's 1 km cells had no road within 1 km; with them, 1.2%.
  Access: `access`/`vehicle`/`motor_vehicle`/`motorcar` = no, private, agricultural, forestry, delivery,
  emergency or military excludes a way unless a more specific key allows it. `oneway` (yes/-1), roundabouts and
  motorways are one-way. Ferries are left out (the Setúbal–Tróia car ferry: Tróia is reached by land instead).
  No turn costs, traffic lights or congestion, so **times are free-flow estimates and run short in towns**.
- **Size:** 1,170,745 ways, 14,636,361 nodes, 29,093,325 directed edges; the largest strongly connected component
  (the only snap target) holds 14,478,499 nodes.
- **Snapping:** KD-tree (EPSG:3763) to the nearest main-component node; over 1 km is discarded and reported.
  Discarded: 3 supermarkets and 2 schools (Ilha da Culatra and nearby islands, no road). Parish points snap
  within 21 m (median), 84 m (p95), 685 m (max).
- **Routing:** one multi-source Dijkstra per category on the reversed graph (`scipy.sparse.csgraph.dijkstra`,
  `min_only=True`, predecessors): for every node, the time to the nearest facility *by drive time* and which one.
  The road distance is summed along that same fastest path (pointer jumping over the predecessor tree).
  ~5 s per category.
- **The Spanish border:** the Geofabrik extract ends a little past the border, so a route that would use a
  Spanish road is not found and a longer Portuguese one is used.

## Land check grid

1 km cells in EPSG:3763 covering every cell that touches the mainland (90,708 cells), each read from the road
node nearest the cell centre (snap ≤ 1 km, else no value: 1,552 cells, mostly at sea along the coast).
Stored like the hazard cells: `web/public/services/grid-<sha8>/<i>.bin`, one zlib file per 16 × 16 cells, uint16
little-endian `[category][facility, seconds, metres/10][row][col]`, 0xFFFF = no value. **419 files, 2.2 MiB**
(largest file well under 64 KiB), gitignored, served by Pages, no HTTP Range; `web/data/services.meta.json`
(bundled) names the directory with its file count, size and tree SHA-256, and `npm run deploy` refuses to ship
without it (`web/scripts/check_landcheck.mjs`). With the land check's 3,517 files the site stays far below Pages'
20,000-file limit.

## Validation

- **Detour ratio** (road km / straight line, parish trips over 2 km): median 1.36–1.42 per category, p5 ≈ 1.1,
  p95 ≈ 2.0. 153 trips fall outside 0.95–2.5, all short (2–6 km) and in steep valleys or across rivers (Douro,
  Gerês, Cinfães, Tâmega, Serra de Aire), with no ratio above 5.2, so no graph islands, no ferry shortcuts.
- **Independent router:** 10 PNCT parishes × 4 categories against the public OSRM demo; results in the night
  report (`docs/reports/night/11-nearby-services.md`).
- **Build:** 98 s with the parsed roads cached (190 s from the extract), peak RSS 5.5 GiB, on the 16 GB Mac.

## Credits

- OSM: "© OpenStreetMap contributors" (ODbL 1.0), in both languages, already in the map attribution and About.
- SNS: "Serviços de urgência: SNS (ACSS/DE-SNS), CC BY 4.0", with a link to the dataset.
