# pnct-map

Interactive map of the PNCT territories (Programa Nacional para a Coesão Territorial) in mainland Portugal.

- Phase 1: data pipeline (Python; `scripts/`, `data/`).
- Phase 2: static map app (`web/`: Vite, TypeScript, MapLibre GL JS).
- Phase 3: Idealista property-search links per PNCT parish. The links are generated only; nothing ever requests idealista.pt.

## Run end to end

Requirements: [uv](https://docs.astral.sh/uv/) (it provides Python 3.12), Node/npx (for mapshaper), `make`, `curl`, `unzip`.

```sh
uv sync
uv run make all      # download CAOP (checksum-verified) → parse → match → geo → tests
```

| Target | What it does |
|---|---|
| `make download` | Fetches the CAOP 2025 Continente GeoPackage into `data/external/` (gitignored) and verifies its SHA-256 |
| `make parse` | `scripts/parse_pdf.py` → `data/interim/pnct_raw.csv` |
| `make match` | `scripts/build_parishes.py` → `data/processed/pnct_parishes.csv`, `data/processed/unmatched.csv` |
| `make geo` | `scripts/build_geo.py` → `data/processed/parishes_all.geojson`, `data/processed/concelhos.geojson` |
| `make web-data` | `scripts/build_topo.py` → `web/public/data/pnct.topo.json` (one TopoJSON, objects `parishes` + `concelhos`) |
| `make shapes` | `scripts/build_shapes.py` → `web/public/data/shapes.json` (one search polygon per PNCT parish) and `data/processed/shapes_quality.csv` |
| `make test` | `pytest` (`tests/test_pipeline.py`, `tests/test_shapes.py`) |
| `make web` | `npm ci && npm test && npm run build` in `web/` → static `web/dist/` |
| `make e2e` | Builds, then runs the Playwright smoke tests (`web/tests/e2e`), writing screenshots to `docs/screenshots/` |
| `make clean` | Removes `data/interim` and `data/processed` |

mapshaper is run through `npx` at a pinned version (`mapshaper@0.7.68`), with its npm cache in `./.npm-cache`.

## Data sources

| Source | Edition | URL | Downloaded |
|---|---|---|---|
| PNCT territories list | PDF dated 2026-02-04 (5 pages) | Not committed. Place it at `data/raw/territorios-pnct-2026-02-04.pdf` (SHA-256 `c286ef77…e7cffc`) to rerun `make parse` | provided |
| CAOP – Carta Administrativa Oficial de Portugal, DGT, Continente | **CAOP 2025** (approved 2026-01-28; Aviso n.º 3502/2026/2, DR 2.ª série, 2026-02-18), GeoPackage, layer `cont_freguesias`, EPSG:3763 | https://geo2.dgterritorio.gov.pt/caop/CAOP_Continente_2025-gpkg.zip (SHA-256 `87cd67f4…3ecd1d`) | 2026-10-11 |

The CAOP landing page is https://www.dgterritorio.gov.pt/cartografia/cartografia-tematica/caop. CAOP is licensed CC-BY-4.0. Attribution: *"Informação geográfica cedida pela Direção-Geral do Território"*. More background is in `docs/caop_research.md`.

## CAOP edition and the U.F. split

Lei n.º 25-A/2025 restored 302 parishes from 135 *uniões de freguesias*, effective from the 12 Oct 2025 local elections. DGT published three relevant Continente editions:

| Edition | Parishes | State |
|---|---|---|
| CAOP 2024 | 2882 | pre-split |
| CAOP 2024.1 (extraordinary, Aug 2025) | 3049 | post-split |
| CAOP 2025 | 3049 | post-split; same codes and names as 2024.1 |

We expected the list to follow CAOP 2024, but **the list was written for the post-split map**. 18 of the 83 explicit rows name restored parishes that do not exist in CAOP 2024:

- Águeda: Agadão, Belazaima do Chão, Castanheira do Vouga
- Castelo de Paiva: Raiva, Pedorido, Paraíso
- Loulé: Querença, Tôr, Benafim
- Ourém: Matas, Cercal, Rio de Couros, Casal dos Bernardos
- Tomar: Serra, Junceira
- Ponte de Lima: Gaifar, Sandiães, Vilar das Almas

Every "U.F." name that the list still uses belongs to a union that was *not* split, and all of them exist unchanged in CAOP 2025.

**Decision: match against CAOP 2025.**

- All 83 explicit rows resolve within their own municipality, so no U.F. needs to be mapped onto successor parishes and no rows are flagged for it.
- Against CAOP 2024, exactly those 18 rows fail to match. In 2024 each of them is only part of a larger union, such as `010123` "U.F. de Belazaima do Chão, Castanheira do Vouga e Agadão", so a pre-split map could not show them.
- Wildcard rows (whole district or whole municipality) are expanded using the CAOP 2025 parish set.

## Matching rules (`scripts/build_parishes.py`)

- Each row is matched only within its own municipality, which is resolved from district plus concelho. Rows are never matched across municipalities.
- The match methods are tried in this order:
  1. `override`: a row pin from `data/overrides.csv`.
  2. `exact`: case-insensitive comparison with accents kept.
  3. `normalized`: accents stripped, uppercased, whitespace collapsed, and `U.F. [DE]` / `UNIÃO DAS FREGUESIAS DE` removed. Compared against both `freguesia` and `designacao_simplificada`.
  4. `fuzzy`: rapidfuzz, accepted only if the score is ≥ 90 and at least 5 points clear of the runner-up.
- Anything else goes to `data/processed/unmatched.csv` together with its top 3 candidates.
- Wildcards produce `match_method = wildcard`.

`data/overrides.csv` holds the manual fixes:

- `freguesia = *` is a concelho alias.
- Otherwise the row pins a PDF row to one or more dicofres (separated by `;`).
- A stale override, or a pin that targets an unknown or wrong-municipality code, fails the build.

Known PDF quirks:

- **Duplicate line:** "São Pedro do Sul / todas" appears twice. `parse_pdf.py` drops the duplicate.
- **CASTANHEIRA DE PERA:** officially Castanheira de Pêra. Handled by a concelho alias. Accent stripping would also match it.
- **VÁRZEA, ALIVIADA E FOLHADA (Marco de Canaveses):** pinned to `130740`. In CAOP 2025 this is also the official name, without a "União das freguesias de" prefix.
- **VILAR ALMAS (Ponte de Lima):** pinned to `160763` Vilar das Almas. The fuzzy score was 84.6, below 90, so it was not accepted automatically.

## Outputs

- `data/processed/pnct_parishes.csv`: one row per PNCT parish, with columns `dicofre, distrito, concelho, freguesia_official, source_row, match_method, match_score`.
- `data/processed/parishes_all.geojson`: all 3049 mainland parishes.
  - Properties: `dicofre, freguesia, concelho, distrito, pnct` (bool).
  - EPSG:4326, 5-decimal precision, about 4.7 MB.
  - Simplified with mapshaper (`-simplify 6% keep-shapes`).
- `data/processed/concelhos.geojson`: 278 municipality outlines. They are dissolved from the simplified parishes, so the borders line up exactly.

## Web app (`web/`)

```sh
cd web
npm ci
npm run dev                        # local dev server
npm run build                      # type-check + static build into web/dist/
BASE_PATH=/pnct-map/ npm run build # build for a sub-path, e.g. GitHub Pages
npm run test:e2e                   # build + Playwright smoke tests
```

- **Base path:** the default `./` makes `dist/` work from any directory.
- **Static data:** the app reads only `data/pnct.topo.json` plus the OpenFreeMap "positron" basemap. There is no backend.
- **Shareable state:** the URL hash holds the view, e.g. `#map=10/41.79/-8.58&f=160763`.
  - `f`: selected parish (dicofre).
  - `c`: selected concelho (4-digit code).
  - `d`: district filter.
  - `pnct=1`: show only PNCT parishes.
- **Property search:**
  - `src/links.ts` `getLinks(parish, concelho, options)` lazy-loads `data/shapes.json` on first use and caches it.
  - It returns `{label, url, description?, note?}` links: an Idealista polygon search for the parish, plus the municipality page when the whole concelho is PNCT.
  - The selector (Comprar/Arrendar, Terrenos/Casas/Prédios, land filters) persists in the hash (`op`, `t`, `land`) and in localStorage.
  - Unit tests: `npm test` (Vitest).
- **Local installs:** npm's cache (`../.npm-cache`, set in `web/.npmrc`) and Playwright's browsers (`PLAYWRIGHT_BROWSERS_PATH=0`, i.e. inside `node_modules`) stay inside the project.
  - If `npx playwright install chromium` times out, download Chrome for Testing with curl and unpack it to `node_modules/playwright-core/.local-browsers/chromium-<rev>/`.

## Idealista search shapes (phase 3)

URL format, from manually captured Idealista URLs:

```
https://www.idealista.pt/areas/{comprar|arrendar}-{terrenos|casas|predios}[/com-{filters}]/mapa-google?shape=<escaped "((" + polyline + "))">
```

- **Encoding:** Google Encoded Polyline, precision 1e5, lat/lng order, closed ring.
  - Escaping is `encodeURIComponent` plus `( ) ~ ! * '`.
  - Implemented twice: `scripts/polyline.py` (pipeline) and `web/src/idealista.ts` (app). Both are tested against the same captured fixtures.
  - A Vitest test re-encodes every Python-built shape byte for byte.
- **Shapes:** built from full-resolution CAOP 2025.
  - Single-part parish: its outline.
  - Multipart where every minor part is under 5%: the largest part, unless that drops coverage below 0.95.
  - Otherwise: the convex hull, flagged `approx`.
  - Holes are ignored.
  - Topology-preserving simplification to at most `MAX_VERTICES` = 60 unique points (`--max-vertices`). The build fails if any coverage is below 0.95.
- **Unverified:**
  - The `terreno-nao-urbanizavel` slug.
  - The municipality slug rule beyond Arouca, and the filter position in that URL form.
  - Arrendar + terrenos.
  - Idealista's real vertex limit.
- **Manual checks:** `docs/link-samples.md` (regenerate with `uv run python scripts/link_samples.py`).
