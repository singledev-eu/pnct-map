# Protected-areas overlay v1 (target 0.4.0)

Branch `feat/protected-areas`, 2026-10-17. **Not merged, tagged or deployed: waiting for approval.** Full suite green: pytest 72, Vitest 79, e2e 62 (0 flaky).

## What I built

**Data pipeline** (offline only; the browser never calls ICNF or EEA):

- `scripts/protected_config.py`: the single switch. Each category (`rnap`, `natura`) points at one source.
  - `CATEGORIES["rnap"] = None` drops RNAP from the overlay, shares, legend, panel and credits. I verified this end to end: rebuild, then pytest and Vitest green.
  - `CATEGORIES["natura"] = "natura-icnf"` swaps Natura from EEA to ICNF `BDG/RN2000` (ZPE + SIC layers, already defined).
- `scripts/fetch_protected.py` (delegated to kiro-cli, reviewed, two fixes; see below). Run with `make protected-fetch` or `cd web && npm run data:protected` (fetch plus build). Caches into the gitignored `data/external/protected/<source>/`.
  - **RNAP:** ICNF MapServer layer 0 "RNAP - Limites" (the only layer, 56 polygons, native EPSG:3763, `maxRecordCount` 2000), with `f=geojson`, `outSR=4326`, paged by `resultOffset`/`resultRecordCount` (25 per page, ordered by the OID). The total is checked against `returnCountOnly` and object ids must be unique.
  - **Natura 2000:** the EEA end-2024 GeoPackage (`Natura2000_end2024.gpkg`, 1.36 GB EU-wide, EPSG:3035, layer `NaturaSite_polygon`), read with `MS = 'PT'`. Downloads are resumable and SHA-256 pinned (`fc947b01…964f42`).
  - Each source writes `fetch.json` with the source URL, licence, UTC fetch time and file hashes.
- `scripts/build_protected.py` (`make protected`, now part of `make all`):
  - **Normalise:** code/name/type, whitespace cleaned, `make_valid`, polygon parts only, dissolved per site code. Sites that don't touch mainland land are dropped.
  - **Shares:** `gpd.overlay` of the **full-resolution CAOP 2025 parishes** with the **unsimplified** sites, in **EPSG:3763**. Each parish gets `rnap_pct`, `natura_pct` and `any_pct`, where `any_pct` is the union of both, not the sum. Concelhos are aggregated exactly from their parishes (area-weighted). Sites covering at least **0.5%** of the parish or concelho are listed by name, largest first.
  - **Display:** each category is dissolved, clipped to mainland land, and simplified with mapshaper 3% (Visvalingam, `keep-shapes`, both categories together so shared edges stay shared). It is then split along the display PNCT outline, so each part carries `pnct: true/false`. Output is TopoJSON at quantization 1.2e5, like the parishes.
  - **Checks:** prints the data quirks and fails over a size budget.

**Web app:**

- **Legend:** a "Nature protection" group with two toggles, "Protected areas (RNAP)" and "Natura 2000", both off by default. Swatches match the map. A note gives the sources and dates ("ICNF, 2026-10-17 · EEA, end 2024") and the disclaimer "Indicator, not a verdict — check the municipal PDM." On phones it sits inside the collapsible legend, scrolls if a short screen needs it, and toggle rows are ≥ 32 px tall.
- **Styling:**
  - RNAP is an orange tint (16%) with a solid outline (light `#c2410c`, dark `#fb923c`).
  - Natura 2000 is a violet `\` hatch with a dashed outline (light `#7c3aed`, dark `#b79cff`). Its hatch runs on the other diagonal from the teal `/` partly-PNCT hatch.
  - Colours live in `PALETTES` and the `--map-*` CSS tokens (kept in step by `theme.test.ts`).
- **Layer order:** above the parish fills, below the parish and concelho lines, the selection highlight and the basemap labels. The overlays are never hit-tested, so concelho and parish selection and the zoom-dependent behaviour are unchanged; e2e clicks through both overlays to prove it.
- **Toggles:** they switch `visibility` only. The overlay file is fetched once, on the first switch-on.
- **Link state:** `pa=rnap,natura` in the hash, so shared links keep the overlays.
- **Focus mode ("Only PNCT"):** the overlay layers get the same `pnct == true` filter, so they stop exactly where the PNCT fill does.
- **Theme switch:** the overlays are carried through a live switch; their sources and pattern images survive the style diff.
- **Panel (parish and concelho):** a "Nature protection" section, shown whatever the toggles, e.g. "Under protection: 100% (RNAP 100%, Natura 100%)". Below it are the intersecting areas with their designation (e.g. "Peneda-Gerês · Parque Nacional", "Serra do Gerês · ZPE (Birds Directive)") and the disclaimer. The shares file is fetched on the first panel open.
- **Attribution:** ICNF and EEA are added, with links, to the map control, the phone bottom-sheet credit and the About panel. All three are generated from `protected.meta.json`, so dropping RNAP also drops its credit. The About panel says "reuse terms not confirmed" for ICNF.
- **Strings:** all new UI strings are in `web/src/strings.ts` (`ProtectedStrings`, `en`, `formatPct`). A `pt` table of the same shape can replace it.

**Docs:**
- `data/ATTRIBUTION.md`: every source with its licence status.
- README: pipeline targets and attribution.
- CHANGELOG 0.4.0, marked unreleased.
- ROADMAP: done row, Next, decisions.
- CLAUDE.md: layout, commands and invariants.
- `web/package.json` bumped to 0.4.0.

## Data sizes and budgets

| File | Raw | gzip -9 | Vite gzip | When it loads | Budget (gzip -9) |
|---|---|---|---|---|---|
| `web/data/protected.topo.json` (overlay) | 574 KB | 201.5 KB | 214 KB | first toggle switch-on | 220 KB |
| `web/data/protection.json` (shares) | 293 KB | 23.6 KB | 25 KB | first panel open | 40 KB |
| `web/data/protected.meta.json` (categories) | 0.8 KB | 0.4 KB | in the JS | bundled | 2 KB |
| `data/processed/protected_sites.csv` | 158 sites | | | not shipped | |

The overlay breaks down as ~131 KB for the two simplified categories plus ~70 KB for the PNCT split, which adds the display PNCT outline's vertices where it crosses a protected area. Natura alone, with the split, is 92 KB.

Simplification error at 3%: median 14 m (RNAP) and 16 m (Natura), area change ≤ 0.06%. That is about one pixel at zoom 12. I measured 2%, 3% and 4%: 4% was over budget, and 2% roughly doubles the median error.

## Format choice: lazy TopoJSON, not vector tiles or PMTiles

- **Nothing on the initial-load path.** Both toggles are off by default, so the overlay costs nothing until it's asked for. A single 200 KB file is then one request; tiles would mean a request per tile on every pan and zoom, which is what hurts on slow phones.
- **Same stack as the rest of the app:** TopoJSON through `topojson-client`, GeoJSON sources, content-hashed under `/assets/` with immutable caching. No new hosting path (PMTiles needs range requests and a protocol plugin).
- **The roadmap's PMTiles threshold** (~1 MB) isn't reached. If v2 adds layers like REN/RAN, which are far bigger, that decision should be revisited.
- **The shares stay a separate small JSON keyed by DICOFRE/DICO,** so the panel never needs the geometry.

## Load-time delta

Same throttled profile as earlier reports (`web/scripts/perf.mjs`: Pixel 7, Fast 3G, 4× CPU, cold cache, 5 runs, medians):

| | Baseline (0.3.1) | 0.4.0 branch | Δ |
|---|---|---|---|
| Parishes drawn | 7,112 ms | 7,077 ms | −35 ms (noise) |
| Full idle (ready) | 9,946 ms | 9,917 ms | −29 ms (noise) |
| Main JS transferred | 281.3 KB | 283.7 KB | +2.4 KB |
| Protected-area data requested on load | | none | |

Throttled, after load (3 runs each):
- First switch-on of a toggle until the overlay is drawn and the map idle: ~1.9 s. Later toggles are instant.
- First panel open until the shares show: ~1.8 s after the hash change, most of which is the selection fly-to plus Fast 3G latency.

Raw data: `.artifacts/perf-baseline.json`, `.artifacts/perf-after.json` (gitignored).

## Data quirks

- **Geometry validity:** no source geometry was invalid or empty by GEOS (`make_valid` still runs). mapshaper found 8 self-intersections in the simplified Natura layer and repaired them.
- **"2,016 intersections could not be repaired":** this warning is RNAP×Natura boundary crossings. Both categories share one mapshaper dataset so their common edges simplify identically, and crossings between the layers are expected, not defects.
- **Thin sliver holes:** the raw unions have them between adjacent Natura sites whose edges don't quite meet. Simplification and `-clean` remove them; they never affect the shares, which use the unsimplified unions.
- **Missing names:** none. Two names needed whitespace cleaning: "Gruta de Vale\nTelheiro" had a newline, and "Serras do Socorro e  Archeira" a double space.
- **Area field:** RNAP's `area_ha` is 0 for three monuments: Pegadas de Dinossáurios (54 ha by geometry), Lagosteiros (7 ha) and Pedra da Mua (5 ha). The source field isn't used; areas come from the geometry.
- **Overlaps inside a category:**
  - RNAP 65.6 ha in total: three Monumentos Naturais lie inside parks (Lagosteiros and Pedra da Mua in Arrábida, the dinosaur footprints in Serras de Aire e Candeeiros).
  - Natura 719,884 ha: the ZPE and ZEC networks largely overlap. Seven areas appear twice under the same name, once per Directive (e.g. "Estuário do Tejo", "Costa Sudoeste"); the panel lists both, told apart by type.
- **Off mainland:** 65 of the 167 Portuguese Natura sites are not on mainland (Azores, Madeira, offshore) and are dropped. All 56 RNAP areas touch mainland.
- **Mostly at sea:** Recife do Algarve - Pedra do Valado is a 15,623 ha marine park with 1.1 ha on land. The display is clipped to land, so marine parts aren't drawn, and they can't count in any parish share. Other mostly-marine sites: Berlengas, Litoral Norte, Cabo Mondego; 10 Natura sites such as Costa Sudoeste and Aveiro/Nazaré.
- **Estuaries:** the Tejo and Sado reserves show over water, because CAOP parishes include the estuaries.
- **Shares overall:**
  - 1,055 of 3,049 parishes have some protection and 145 are at 100%. 200 of 278 concelhos have some.
  - 27 parishes have an RNAP share between 0 and 0.5%, and 27 a Natura share in that range. Most are boundary noise where a protected area follows the parish line in a different survey. No names are listed for those.
- **Sanity checks (pytest):**
  - Tourém, Vilar da Veiga and Cabril are ≥ 99.5% RNAP.
  - Central Lisbon parishes (Santa Maria Maior, Arroios, Estrela) and Porto parishes (Bonfim, Cedofeita union) are at 0%. Parque das Nações is 4.1% Natura (the Tejo estuary ZPE).
  - For every parish and concelho, union ≥ max and ≤ sum.

## kiro-cli delegation

kiro wrote `scripts/fetch_protected.py` and `tests/test_fetch_protected.py` (20 offline tests) from the spec `.kiro-logs/protected-fetch-spec.md` (log `.kiro-logs/protected-fetch.log`). I reviewed the diff and fixed two bugs:
1. A 416 on a `.part` that was already complete deleted it and restarted the 1.36 GB download. It is now treated as complete when `Content-Range` matches.
2. ICNF's MapServer layer JSON has no `objectIdField`, so paging ordered by a non-existent `OBJECTID` and the server rejected it. It now falls back to the field of type `esriFieldTypeOID` (`id`).

## Tests

- **pytest `tests/test_protected.py`:**
  - synthetic squares (union 100% vs sum 125%, a sliver below the name threshold);
  - rounding and the 100% cap;
  - categories follow the config;
  - per-field meta;
  - every DICOFRE/DICO is present;
  - union bounds for all parishes and concelhos;
  - Peneda-Gerês ≈ 100%, city centres 0%;
  - area-weighted concelho share;
  - clean names;
  - overlay objects with both `pnct` flags;
  - size budgets.
- **pytest `tests/test_fetch_protected.py`:** pagination, the transfer-limit flag, count and duplicate checks, resume, SHA mismatch (kiro).
- **Vitest `src/protected.test.ts`:**
  - meta and credits;
  - no overlay layers before load;
  - layer order;
  - visibility-only toggles;
  - focus filter;
  - theme palette;
  - theme-switch carry-over;
  - hatch direction;
  - `formatPct` and the summary string.
- **e2e `tests/e2e/protected-areas.spec.ts` (11 tests, stable in 3 consecutive runs):**
  - off by default with no data requests;
  - toggles show and hide the layers and update the hash, and the file is fetched once;
  - a `pa=` link;
  - panel shares with the toggles off (Vilar da Veiga 100%, Santa Maria Maior 0%, Terras de Bouro);
  - parish and concelho selection with both overlays on, clicking through them;
  - focus mode;
  - light and dark with no console warnings or errors;
  - a live theme switch;
  - attribution and About credits;
  - the phone legend (fits 390×844, tap targets, collapses, sheet credit).
- **`mobile-attribution.spec.ts`:** its exact credit strings now include ICNF and EEA. This is an intended change.
- **Link snapshot:** unchanged, 0 differences.

## Screenshots

Light + dark, desktop (1440×900 @2×) + phone (390×844 @3×), in `.artifacts/protected-shots/` (gitignored; regenerate with `node web/scripts/protected_shots.mjs <dir>` against `npm run preview`). File names are `<device>-<scheme>-<view>.png`.

- **Desktop views:**
  - `country`: both overlays;
  - `geres-parish`: Vilar da Veiga panel;
  - `geres-concelho`: Terras de Bouro;
  - `estuary-parish`: Parque das Nações;
  - `focus-north`: Only PNCT with both overlays;
  - `rnap-only`, `natura-only`: Lisbon/Setúbal;
  - `about`.
- **Phone views:** `country`, `geres-parish`, `geres-concelho`, `estuary-parish`, `legend-open`, `attribution-open`.

Key ones:
- `.artifacts/protected-shots/desktop-light-country.png`
- `.artifacts/protected-shots/desktop-dark-focus-north.png`
- `.artifacts/protected-shots/desktop-light-geres-parish.png`
- `.artifacts/protected-shots/phone-light-legend-open.png`
- `.artifacts/protected-shots/phone-dark-geres-parish.png`

## Open questions

1. **ICNF licence:** RNAP's reuse terms are unconfirmed. The service only states ICNF as copyright holder. Ship 0.4.0 with RNAP credited as "reuse terms not confirmed", or set `CATEGORIES["rnap"] = None` until ICNF answers? One line either way.
2. **Natura source:** keep EEA end-2024 (CC BY 4.0, confirmed licence, one 1.36 GB download per refresh) or switch to ICNF `BDG/RN2000` (lighter and possibly newer, but the same unconfirmed terms as RNAP)?
3. **Marine areas:** the overlay is clipped to land, so marine parks (Recife do Algarve) and the sea parts of coastal sites aren't drawn. Fine for land hunters; draw them at sea instead?
4. **Size vs focus mode:** the PNCT split costs ~70 KB gzipped (35% of the overlay). The alternative is to not clip overlays in focus mode and save that. I kept the split because focus mode promises to hide everything outside PNCT.
5. **Light-theme blend:** RNAP orange over PNCT teal reads as a muted brown. Distinct, but not pretty. I lowered the tint from 22% to 16%. If you'd rather, RNAP could be outline-only, or both categories hatched.
6. **Tiny shares:** values like "RNAP 0.2%" come from boundary mismatches. Show anything under 0.5% as "<0.5%", or hide it?
7. **Duplicate Natura names:** when a ZPE and a ZEC share a name (e.g. "Estuário do Tejo"), merge them into one line ("Estuário do Tejo · ZPE + ZEC")?
8. **Release:** after approval: fast-forward into `main`, push, `npm run deploy:preview`, phone check, `npm run deploy`, tag `v0.4.0`. The CHANGELOG date is still "unreleased".
