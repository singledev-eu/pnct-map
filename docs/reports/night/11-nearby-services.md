# 11: Nearby services (health, emergency, shops, schools, pharmacy, train)

**Status:** done, with driving times (no straight-line fallback needed) · **Branch:** `nearby-services` (from `main` d6a861c, not merged, not pushed) · **Preview:** https://preview.pnct-map.pages.dev · **Date:** night of 2026-11-26

For each parish, each concelho and any point checked in the land check, the app now shows the nearest:

- SNS health centre (centro de saúde, USF, UCSP, extensão);
- SNS emergency service, as a separate row;
- supermarket;
- primary school (1.º ciclo) and secondary school, as separate rows;
- pharmacy and train station (the optional extras, done).

Each row gives the name, the road distance and the drive time, e.g. *Health centre · Centro de Saúde de Penamacor · 20 km · 25 min by car*.

## Phase 0: data check

Full write-up: [docs/nearby-services/DATA.md](../../nearby-services/DATA.md). In short:

| Category | Source picked | Why | Count | Official total |
|---|---|---|---|---|
| Health centre | OSM (by name: Centro de Saúde, USF, UCSP, Extensão…) | SNS open data has no unit list with positions (one point per ULS only) | 953 | none published per unit |
| SNS emergency | **SNS list** (CC BY 4.0 via the ACSS record on dados.gov.pt), each service placed on its **OSM building** by hand | OSM `emergency=yes` mixes private hospitals and Red Cross posts and misses SUBs; the SNS export has the right *set* of services but some coordinates are geocoded to the town | 84 (90 mainland minus 6 paediatric/maternity) | ~85–90 |
| Supermarket | OSM `shop=supermarket` | no official source; all chains present | 3,245 | — |
| Primary school (1.º ciclo) | OSM `amenity=school`, by name / `isced:level` | DGEEC/ME lists have no coordinates (and stop at 2019/20 on dados.gov.pt) | 3,702 | INE 2024/25: **3,770** (−1.8%) |
| Secondary school | OSM, as above | as above | 754 | INE 2024/25: **915** (−18%) |
| Pharmacy | OSM `amenity=pharmacy` | INFARMED's finder is interactive only | 2,496 | INE 2025: **2,803** (−11%) |
| Train station | OSM heavy-rail stations/halts **on an active line** | no openly licensed CP GTFS | 433 | — |

- **Extract:** Geofabrik `portugal-261125.osm.pbf` (dated, not `-latest`), SHA-256 `ad86a158…f81952` pinned, MD5 checked against Geofabrik's. Downloads in gitignored `data/external/services/`.
- **The SNS export is broken in a specific way** (DATA.md has the details):
  - service names and coordinates are consistent;
  - region, town, unit and *type* (SUB/SUMC/SUP) are mis-joined across rows: Beja's hospital is filed under "Coimbra";
  - 7 coordinates are geocoded to the town, up to 23.8 km off (SUB Ponte de Sor).

  So the type is not shown, and the positions come from OSM. Automatic name matching picked a wrong OSM object 11 times (private hospitals, a military hospital, a USF, a physiotherapy clinic), all fixed by hand in `data/services/sns_urgencias.csv`.

## Phase 1: pipeline

`scripts/services_config.py` → `scripts/fetch_services.py` → `scripts/build_services.py` (+ `scripts/services_graph.py`), wired as `make services-fetch` / `make services` (and into `make all`, `web`, `e2e`). New Python dependencies: `osmium` (pyosmium 4.3.2), `scipy` 1.18.1.

Outputs:

| File | What | Size |
|---|---|---|
| `web/data/services.json` | facilities per category (name, lon/lat to 4 decimals, concelho) and per-parish/concelho results (facility index, time in 10 s, distance in 100 m, the origin's name) | 860 KiB raw, **184 KB brotli**, 246 KB gzip; lazy, content-hashed (`?url`) |
| `web/data/services.meta.json` | bundled: grid parameters, presence bitmap, categories, sources and dates | 3 KB |
| `web/public/services/grid-<sha8>/` | gitignored land check grid | **419 files, 2.2 MiB** (largest < 64 KiB) |
| `data/services/build_report.json`, `facilities.csv`, `parish_points.csv` | tracked: counts, discarded snaps, validation, timings; every facility with its OSM id; where each parish is measured from | 36 KB, 900 KB, 216 KB |

**Parish point (decision):** INE BGRI 2021 was not readily available: `mapas.ine.pt/download/…` gave 404 or an empty reply. So each parish is measured from its **main settlement**: the OSM place node inside it whose name matches the parish (2,972 of 3,049), else the best-ranked place (75), else the point-on-surface (2). Concelhos are measured from their seat (`cities.json`, all 278). The panel names the origin ("From Monsanto, by car"), so the limit is visible. In a big parish, a farm far from the village gets a different answer; the land check grid covers that case.

## Phase 2: driving distance and time (pure Python, no Docker, no OSRM)

- **Graph:** pyosmium reads every drivable way. Speeds are OSRM-car-like class defaults; with a `maxspeed`, 80% of it, capped at the class default + 20%. `PT:urban`/`PT:rural`/`PT:motorway` are understood. Oneways and roundabouts are respected, and `access=no/private/…` is excluded unless a more specific key allows it.
- **Size:** 1,170,745 ways, 14.6 M nodes, 29.1 M directed edges. The largest strongly connected component (14.48 M nodes) is the only snap target.
- **Decision, tracks:** `highway=track` is drivable at 10 km/h (15 for `grade1`; grade4/5 out). Without tracks, **19% of the mainland's 1 km cells** had no road within 1 km of their centre, because rural plots are reached by dirt roads. With tracks, 1.2% (1,111 land cells, none further than 5 km). At 10 km/h, tracks don't create shortcuts: detours are unchanged.
- **Snapping:** KD-tree (scipy) in EPSG:3763, limit 1 km, discards reported:
  - 3 supermarkets and 2 schools on the Ria Formosa islands (Culatra; no road);
  - no parish or concelho point over the limit (median snap 21 m, p95 84 m, max 685 m).
- **Routing:** one `scipy.sparse.csgraph.dijkstra(…, indices=facility_nodes, min_only=True, return_predecessors=True)` per category on the **reversed** graph, so the times are origin → facility. Nearest is by drive time. The road distance is summed along the same fastest path (pointer jumping over the predecessor tree). Parallel edges keep the fastest with its own length; a unit test catches the "fast but long" case. About 5 s per category.
- **Grid:** 1 km cells in EPSG:3763 (90,708 cells touching the mainland), each read from the road node nearest its centre, stored like the hazard cells: one zlib file per 16 × 16 cells, uint16 LE `[category][facility, seconds, metres/10]`, 0xFFFF = no value. No HTTP Range. The deploy check (`web/scripts/check_landcheck.mjs`) now verifies this directory too, and `_headers` caches `/services/*` as immutable (the directory name is content-hashed). With the land check, the site has 3,936 files, far under Pages' 20,000.
- **Build:** 190 s and 5.5 GiB peak RSS from the extract. With the parsed roads cached (`data/external/services/roads-<sha8>-<rules>.npz`, keyed by the extract and the speed rules), 98–108 s and 4.2 GiB. Mac with 16 GB.

### Validation

- **Detour ratio** (road / straight line, parish trips over 2 km), median per category 1.36–1.42, p5 ≈ 1.1, p95 ≈ 2.0. 153 of ~19,000 trips fall outside 0.95–2.5. All are short (2–6 km) and in steep valleys or across rivers (Douro at Pinhão and Ribadouro, Gerês, Cinfães, Serra de Aire), the worst ratio is 5.1, and there are no islands or ferry artefacts. Flagged list: `data/services/build_report.json` → `validation.flagged`.
- **Ferries:** left out on purpose (Tróia is reached by land).
- **The Spanish border:** the extract ends a little past it, so a route through Spain isn't found.
- **Independent router (spot check):** 10 PNCT parishes × 4 categories against the public OSRM demo (`router.project-osrm.org`, 40 requests, 1/s, generic User-Agent, only public place coordinates sent). The table is below and the raw data in `docs/nearby-services/spot_check.json`.

### Spot check: 10 PNCT parishes

| Parish (concelho) | From | Health centre | SNS emergency | Supermarket | Primary school |
|---|---|---|---|---|---|
| Arco de Baúlhe e Vila Nune (Cabeceiras de Basto) | Arco de Baúlhe | CS Cabeceiras de Basto, 5.9 km / 7 min (OSRM 6.2 / 8) | SUB Fafe, 23.5 / 19 (23.5 / 19) | Mercadinhos Adriano, 0.7 / 1 (1.0 / 2) | EB Arco de Baúlhe, 0.5 / 1 (0.3 / 1) |
| França (Bragança) | França | UCSP Santa Maria II, 13.4 / 13 (13.4 / 13) | Bragança hospital, 16.3 / 18 (15.6 / 17) | Delícias, 13.4 / 13 (same) | EB 1.º ciclo Dr. Diogo…, 14.9 / 15 (same) |
| Monsanto e Idanha-a-Velha (Idanha-a-Nova) | Monsanto | CS Penamacor, 20.4 / 24 (20.4 / 25) | Amato Lusitano, Castelo Branco, 51.6 / 53 (same) | Auchan, 19.9 / 23 (19.8 / 23) | EB Monsanto, 0.7 / 1 (same) |
| Pomares (Arganil) | Pomares | CS Oliveira do Hospital, 16.7 / 19 (16.7 / 20) | SUB Arganil, 25.5 / 30 (25.4 / 31) | A Ponte Minimercado, 7.5 / 8 (7.5 / 9) | EB Pomares, 0.6 / 1 (same) |
| Mértola | Mértola | UCSP Mértola, 0.5 / 1 (0.4 / 1) | SUB Castro Verde, 42.5 / 45 (42.8 / 45) | Meu Super, 0.6 / 1 (same) | EB Mértola, 0.3 / 1 (same) |
| Alcoutim e Pereiro | Alcoutim | CS Alcoutim, 0.8 / 2 (same) | SUB VRSA, 41.7 / 36 (41.3 / 35) | Corvo, 37.1 / 31 (same) | EB Alcoutim, 0.8 / 2 (same) |
| Sortelha (Sabugal) | Sortelha | CS Sabugal, 13.5 / 20 (13.4 / 20) | Pêro da Covilhã, 30.7 / 37 (same) | Ponto de Encontro, 8.1 / 12 (8.1 / 13) | EB Aldeia de Santo António, 8.5 / 14 (same) |
| Vila Facaia (Pedrógão Grande) | Vila Facaia | CS Castanheira de Pera, 9.3 / 10 (same) | SUB Pombal, 42.4 / 35 (42.4 / 36) | My Auchan, 9.0 / 9 (same) | EB Graça, 5.2 / 6 (5.1 / 6) |
| Sistelo (Arcos de Valdevez) | Sistelo | CS Arcos de Valdevez, 21.2 / 24 (21.9 / 25) | SUB Monção, 24.6 / 33 (24.9 / 33) | (unnamed in OSM), 14.7 / 22 (same) | EB Dr. Manuel da Costa B…, 13.7 / 16 (13.8 / 17) |
| Cabril (Montalegre) | Cabril | UCSP Montalegre, Polo Cabril, 1.0 / 1 (same) | SUB Montalegre, 39.7 / 44 (same) | (unnamed in OSM), 12.7 / 20 (same) | EB Cabril, 0.3 / 0 (same) |

On all 40 trips, our road distance and time agree with OSRM's within 0.7 km and 1 min. Both use OSM and similar car speeds, so this confirms the graph, the oneways and the routing, not the speed model against real traffic.

**Anomalies found by hand:**

1. "A Ponte Minimercado" and "Mercadinhos Adriano" count as supermarkets. The exclusion only catches names *starting* with Minimercado; OSM tags them `shop=supermarket`.
2. Sistelo's and Cabril's nearest supermarkets have no name in OSM ("Unnamed supermarket").
3. Monsanto's health centre is Penamacor's (20 km): an *extensão* in Monsanto, if open, is not in OSM.
4. The SNS emergency list is from May 2023; Alcoutim → SUB Vila Real de Santo António (36 min) is right for that list.

## Phase 3: UI

- **Panel block** (`web/src/nearby.ts`, in the parish and concelho panels, after the concelho card):
  - one stat tile per category, as in the concelho card: drive time large, "20 km by road" small;
  - the facility as a button that shows it on the map (marker in the category's colour, camera eased into the visible map, pitch/bearing kept, a full phone sheet dropped to half);
  - its concelho, and "OSM ↗" (an OpenStreetMap link at its position);
  - "From Monsanto, by car" / "From Idanha-a-Nova (the concelho seat), by car" under the heading;
  - the source line and "Estimates without traffic, not travel advice. In an emergency, call 112."
- **Land check:** the same tiles for the clicked point, from the grid cell (one ~5 KB GET), "From the road nearest this spot (1 km grid), by car". Where the cell has no value, the row shows the **straight-line** distance to the nearest facility (exact, computed in the browser), labelled "in a straight line", with a note. A failed load says "Could not load the nearby services…", never a number.
- **Overlay:** "Nearby services" / "Serviços próximos" in the legend, off by default, with `sv=1` in the hash:
  - dots coloured by category, under the 3D slabs and the labels;
  - faded in between zoom 7.5 and 9, with "Zoom in to see services" below that;
  - a colour key while on;
  - a "?" explainer: what, from where, how (free-flow, no traffic or turns), nearest by time, data dates, not travel or medical advice, 112.

  `mountExplainer` was generalised (text and id); the protection explainer is unchanged.
- **Strings:** a `services` group (`tn`) in `strings.ts`/`.en.ts`/`.pt.ts`, European Portuguese; 11 new glossary rows. "Hospital emergency" became **"SNS emergency service" / "Urgência do SNS"**: SUBs are often in health centres, so "hospital" would be wrong.
- **Credits:** "SNS emergency services: SNS (CC BY 4.0)" in the map attribution, the phone sheet credit and About (with OSM). README, `data/ATTRIBUTION.md` and CHANGELOG "Unreleased" are updated.
- **Accessibility:**
  - tiles are list items with a title summary;
  - the show buttons have "Show <name> on the map" (the visible name is in the label);
  - OSM links are named "Open <name> in OpenStreetMap";
  - the marker is `role=img` with a label;
  - the explainer is a dialog (Esc, focus return), checked in e2e;
  - phone tap targets are ≥ 32 px.
- **Theme:** colours in `theme.ts` `SERVICE_COLORS` per theme (the key, the marker and the layer read them); light/dark screenshots checked.

## Phase 4: verify

| Suite | Result |
|---|---|
| pytest | **302 passed** (228 before + 74 in `tests/test_services.py`) |
| Vitest | **279 passed** (260 before + 19 in `services.test.ts`) |
| Playwright e2e | **194 passed**, none flaky (185 before + 9 in `nearby-services.spec.ts`; full `npm run test:all` at 22:31) |

New tests:

- `tests/test_services.py`:
  - tag rules (health, supermarket, 22 school names, pharmacy, station);
  - maxspeed, way speeds and access, oneways;
  - routing on small graphs, including multi-source Dijkstra against brute force, the fast-but-long duplicate edge, snap limits and the main component;
  - the grid round trip and the curated CSV;
  - built outputs: counts against the INE ranges, every parish with a value, road ≥ straight line, grid files against the meta, the grid against parish results.
- `web/src/services.test.ts`:
  - EN/PT formatting and the row format of the brief;
  - decoding, missing values kept missing;
  - the straight line, the grid reader on a synthetic little-endian zlib chunk;
  - the straight-line fallback and a failed load as an error;
  - the real data (Monsanto) and a real grid chunk.
- `web/tests/e2e/nearby-services.spec.ts` (9 tests; the first 8 were also run 3× each: 24/24): the parish block, concelho PT, show on map, land check rows (one grid GET), a failed grid load, the overlay (not loaded on start, `sv=1`, zoom hint), the explainer, and the phone sheet.

**Perf** (`web/scripts/perf.mjs`, Pixel 7, Fast 3G, 4× CPU, 3 runs, analytics off; `docs/perf/nearby-services/{before,after}.json`):

| | before | after |
|---|---|---|
| parishes drawn (median) | 7,226 ms | 7,226 ms |
| first full idle (median) | 10,103 ms | 10,088 ms |
| main JS (transfer) | 326,186 B | 332,276 B (+6.1 KB: code + bundled meta) |
| `services.json` on load | — | not requested |

**Fixes found while verifying:**

- On phones, "show on the map" first put the marker under the first-visit intro card. `showFacility` now centres below it, and there's an e2e test for it. The land check's own `checkArea` has the same blind spot (the crosshair and marker can sit under the intro on a first visit); it is not changed here and is noted for Mike.
- The legend row was first "Services (health, shops, schools)", which overflowed at 375 px in PT (caught by `i18n-theme.spec.ts`). It is now "Nearby services" / "Serviços próximos", and the "?" margin is fixed.
- The attribution and sheet-credit e2e expectations now include the SNS credit (an intended change).
- `web/scripts/landcheck_shots.mjs` could never finish its phone views: it waited for the report to be *visible*, but phones open a peek. It now waits for it to be attached. The bug predates this branch.

**Screenshots:** `docs/screenshots/nearby-services/` (JPEG, light/dark, 375 and 1440): parish block, concelho, land check, show on map, overlay, PT. The full PNG sets are in `.artifacts/services-final/`, `.artifacts/landcheck-after/` and `.artifacts/polish-after/`; the polish and land check sets are regression checks of the existing views.

## Decisions taken alone (and why)

1. **OSM for everything but the emergency list.** No official per-unit source with coordinates and a reuse licence exists for health centres, schools, pharmacies or stations (DATA.md).
2. **SNS list + OSM positions for emergencies, curated by hand.** The SNS export's coordinates are partly town-geocoded and its type field is mis-joined, so the type isn't shown. Paediatric and maternity emergencies are excluded.
3. **"SNS emergency service"**, not "hospital emergency": SUBs are often not in a hospital.
4. **Health centres include *extensões*** (part of the SNS primary-care network; some open only on some days). UCC/URAP/USP are excluded (not consultations).
5. **Secondary includes vocational schools** (INE counts them under ensino secundário). "Escola Primária …" and "Antiga …" names are excluded (mostly closed).
6. **Stations must be within 100 m of an active `railway=rail`** (37 dropped). Halts count the same as stations.
7. **Tracks drivable at 10 km/h** (19% → 1.2% of cells without a road).
8. **Parish point = main settlement from OSM** (BGRI not downloadable), named in the UI.
9. **Nearest = nearest by drive time**, distance along that route (stated in the explainer).
10. **Ferries excluded.**
11. **One lazy `services.json` (184 KB br)** for the panels, the land check and the overlay. Splitting it would save ~70 KB for the panel only, at the cost of a second file. Precision is cut to what's shown (10 s, 100 m, ~10 m positions). OSM ids are kept in the tracked `facilities.csv`; the app links OSM by position.
12. **Preview deploy done** (wrangler was already logged in; the preview branch only, as allowed).

## Preview deploy

Wrangler was already logged in, so `npm run deploy:preview` ran. It repeated the full suite (pytest 302, Vitest 279, e2e 194, none flaky), then deployed to the **preview branch only**. Production was not touched.

- **https://preview.pnct-map.pages.dev** (deploy `cb140e66`: 423 new files uploaded, 3,530 reused).
- On Pages, a grid chunk answers `200 application/octet-stream`, 6.6 KB, `cache-control: public, max-age=31536000, immutable`.
- `nearby-services.spec.ts` against the preview (`E2E_BASE_URL`): 9/9 passed.

## What's left

- **Bus / public transport:** not attempted (no national open GTFS covering rural Portugal).
- **Emergency type (SUB / SUMC / SUP):** needs a clean SNS list. Also, SUB Loulé, Lagos and Albufeira keep the SNS coordinate and SUB Estremoz is placed on its health centre; worth a second look.
- **A newer SNS list:** the data is from May 2023 (pre-ULS reform names). `fetch_services.py` fails the build if a curated service leaves the list.
- **Population-weighted parish points** once INE BGRI 2021 can be downloaded (then perhaps a population-weighted average time per parish).
- **Turn costs / urban slowdown:** times run short in towns (free-flow).
- **Supermarket names:** extend the exclusion to "… Minimercado" if Mike prefers fewer small shops.
- **Train stations:** halts with few trains count the same. A CP timetable (if one with a licence appears) could filter by service.
- **Pharmacies:** OSM has 89% of INE's count; health centres have no official count to compare with.
- **Pi job:** not needed for the computation (3 min on the laptop). A scheduled extract refresh is the only reason for one.

## Release checklist for Mike

1. Review the branch (`git log main..nearby-services`, 11 commits), DATA.md and `data/services/sns_urgencias.csv` (the 84 emergency rows, especially the 3 `position=sns` rows and SUB Estremoz).
2. On a fresh checkout: `uv sync && uv run make services` (downloads the 430 MB extract; ~3 min, 5.5 GiB RAM) so `web/public/services/` exists; `node web/scripts/check_landcheck.mjs` must say "ok" for the services grid.
3. Run `cd web && npm run test:all`.
4. The preview is already up at https://preview.pnct-map.pages.dev (re-run `npm run deploy:preview` after any change). Check on the phone: a parish panel, a land check in the countryside, "show on the map", the overlay and the "?" text in PT.
5. Merge (fast-forward) into `main`, bump to **0.12.0** (CHANGELOG "Unreleased" → 0.12.0; `web/package.json`), tag `v0.12.0`, push.
6. `npm run deploy` (production) after the phone check.
7. Optional: ask ACSS/SPMS to confirm the CC BY terms on the transparency portal itself (dados.gov.pt says CC BY; the DE-SNS record says "notspecified").
