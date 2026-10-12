# pnct-map

Interactive map of the parishes in mainland Portugal that the PNCT covers (Programa Nacional para a Coesão Territorial). For each PNCT parish it also builds Idealista property-search links. The links are generated only; nothing ever requests idealista.pt.

Live site: https://pnct.singledev.eu. This is an unofficial tool.

![The national map view, with PNCT parishes shaded](docs/screenshots/desktop-national.png)

## Quick start (map only)

The built map data is committed in `web/data/`, so the web app runs without the Python pipeline.

```sh
git clone https://github.com/singledev-eu/pnct-map.git
cd pnct-map/web
npm ci
npm run dev        # Vite dev server, prints the local URL
```

- `npm run build` type-checks and builds the static site into `web/dist/`.
- `npm run preview` serves the built site on http://localhost:4173/ (run `npm run build` first).

## Prerequisites

| Tool | Needed for | Notes |
|---|---|---|
| Node.js 24 and npm | Web app, tests, deploy | Also provides `npx`, which runs mapshaper and wrangler. Developed on Node 24; Vite 8 itself needs Node 20.19+ or 22.12+. |
| [uv](https://docs.astral.sh/uv/) | Data pipeline, pytest | Provides Python 3.12 (`.python-version`, `requires-python` in `pyproject.toml`). |
| make, curl, unzip, shasum | Data pipeline | `make download` uses curl, shasum and unzip. |
| Playwright Chromium | e2e tests, `scripts/perf.mjs` | See below. |

Playwright's Chromium is not installed by `npm ci`. Install it once, into `web/node_modules`:

```sh
cd web
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium
```

The `test:e2e` and `test:e2e:remote` scripts and `scripts/perf.mjs` set `PLAYWRIGHT_BROWSERS_PATH=0` themselves, so they look for the browser in `node_modules`. The same variable must be set for the install, or the browser goes to the global cache and the tests will not find it.

npm's cache is `../.npm-cache` (set in `web/.npmrc`), so installs stay inside the project.

## Data pipeline

Only needed to rebuild the data from the sources.

```sh
uv sync
uv run make all      # download (checksum-verified) → parse → match → geo → topo → shapes → pytest
```

`make download` fetches two sources. Each download is checked against a SHA-256 before it is kept:

- The CAOP 2025 Continente GeoPackage (a 106 MB zip, unpacked) into `data/external/`. It downloads only the 2025 edition.
- The PNCT list PDF from IEFP into `data/raw/`.

Git ignores both downloads. `make all` runs the download as a dependency, so you do not need to call it first.

| Target | What it does |
|---|---|
| `make download` | Fetches the CAOP 2025 Continente GeoPackage into `data/external/` and the PNCT PDF into `data/raw/`, and verifies both SHA-256 values |
| `make parse` | `scripts/parse_pdf.py` → `data/interim/pnct_raw.csv` |
| `make match` | `scripts/build_parishes.py` → `data/processed/pnct_parishes.csv`, `data/processed/unmatched.csv` |
| `make geo` | `scripts/build_geo.py` → `data/processed/parishes_all.geojson`, `data/processed/concelhos.geojson` |
| `make web-data` | `scripts/build_topo.py` → `web/data/pnct.topo.json` (one TopoJSON, objects `parishes` + `concelhos`) |
| `make shapes` | `scripts/build_shapes.py` → `web/data/shapes.json` (one search polygon per PNCT parish) and `data/processed/shapes_quality.csv` |
| `make test` | `pytest` (`tests/test_pipeline.py`, `tests/test_shapes.py`) |
| `make web` | `npm ci && npm test && npm run build` in `web/` → static `web/dist/` |
| `make e2e` | `npm ci`, builds, then runs the Playwright smoke tests (`web/tests/e2e`). Screenshots go to `web/test-results/screenshots/` (ignored by git) |
| `make clean` | Removes `data/interim`, `data/processed` and `web/data` |

mapshaper runs through `npx` at a pinned version (`mapshaper@0.7.68`), with its npm cache in `./.npm-cache`.

Committed outputs:

- `web/data/pnct.topo.json` and `web/data/shapes.json`
- `data/interim/pnct_raw.csv`
- `data/processed/*.csv` (`pnct_parishes.csv`, `unmatched.csv`, `shapes_quality.csv`)

Not committed (ignored, rebuilt by `make`):

- `data/processed/*.geojson`
- `data/interim/parishes_full_4326.geojson`
- `data/external/` and `data/raw/*.pdf`

`make clean` deletes `web/data`, which the site needs, and the committed CSV files. Run `uv run make all` afterwards to regenerate them. (`git restore web/data data/interim data/processed` also brings the committed files back, but not the ignored GeoJSON files.)

## Tests

| Command | What it runs |
|---|---|
| `uv run pytest -q` | Pipeline and shape tests in `tests/`. They read `data/processed/*.geojson`, so on a fresh clone run `uv run make all` first. |
| `cd web && npm test` | Vitest: the polyline codec, the shapes, and the link snapshot. |
| `cd web && npm run test:e2e` | Builds, then runs the Playwright smoke tests against a local preview server on port 4173. |
| `cd web && npm run test:all` | pytest, Vitest and e2e, in that order. |
| `cd web && E2E_BASE_URL=https://pnct.singledev.eu/ npm run test:e2e:remote` | The e2e suite against a deployed site. |

The link snapshot is `web/src/__snapshots__/links.sha256.json`. It holds a SHA-256 for every Idealista link the panel can show. It must stay at 0 differences. If a link change is intended, update it deliberately with `npx vitest run -u` (from `web/`) and review the diff.

For throttled load timing, start the preview server (`npm run preview` in one terminal), then run `node scripts/perf.mjs` from `web/` in another. Results from earlier runs are in `docs/perf/`.

## Deploy

Live at https://pnct.singledev.eu (Pages project `pnct-map`, production branch `main`, direct upload).

- `cd web && npm run deploy` runs pytest, Vitest and e2e, builds, then deploys to production.
- `npm run deploy:preview` does the same but deploys to https://preview.pnct-map.pages.dev.
- `E2E_BASE_URL=https://pnct.singledev.eu/ npm run test:e2e:remote` runs the e2e suite against a deployed site.
- Wrangler runs through `npx` at a pinned version. Log in once with `npx -y wrangler@4.149.0 login`.
- The deploy needs no Python pipeline or source data, but its pytest step reads the local pipeline outputs in `data/processed/`. On a fresh clone, run `uv run make all` first.
- `web/public/_headers` sets the caching and security headers. Everything under `/assets/` (including both data files) is content-hashed and cached as immutable.

## Data and attribution

This text matches the About panel on the site.

- **PNCT territories:** the official list dated 4 February 2026, published by IEFP: https://www.iefp.pt/documents/10181/4287418/Territorios+PNCT_04-02-2026.pdf
- **Boundaries:** CAOP 2025 © Direção-Geral do Território, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). "Informação geográfica cedida pela Direção-Geral do Território." Simplified for the web. Landing page: https://www.dgterritorio.gov.pt/cartografia/cartografia-tematica/caop
- **Basemap:** [OpenFreeMap](https://openfreemap.org), © OpenMapTiles, © OpenStreetMap contributors (ODbL).
- **Unofficial tool.** Always confirm eligibility with the official sources. This project is not affiliated with Idealista.

| Source | Edition | URL | Downloaded |
|---|---|---|---|
| PNCT territories list | IEFP, "Lista dos territórios PNCT", PDF dated 2026-02-04 (5 pages) | https://www.iefp.pt/documents/10181/4287418/Territorios+PNCT_04-02-2026.pdf (SHA-256 `c286ef77…e7cffc`). Not committed; `make download` saves it as `data/raw/territorios-pnct-2026-02-04.pdf` | provided; identical to the IEFP file |
| CAOP – Carta Administrativa Oficial de Portugal, DGT, Continente | **CAOP 2025** (approved 2026-01-28; Aviso n.º 3502/2026/2, DR 2.ª série, 2026-02-18), GeoPackage, layer `cont_freguesias`, EPSG:3763 | https://geo2.dgterritorio.gov.pt/caop/CAOP_Continente_2025-gpkg.zip (SHA-256 `87cd67f4…3ecd1d`) | 2026-10-11 |

CAOP is licensed CC-BY-4.0. More background is in `docs/caop_research.md`.

## Licence

The code is under the MIT licence (see `LICENSE`). The data keeps its own licences, listed above.

## Project docs

- `docs/reports/phase1-pipeline.md`: the data pipeline, and why CAOP 2025 was chosen over 2024.
- `docs/reports/phase2-map.md`: the map UI, with test results.
- `docs/reports/phase3-idealista-links.md`: the Idealista search shapes and link builder.
- `docs/reports/perf-initial-load.md`: initial-load performance, with before and after timings.
- `docs/reports/deploy-cloudflare.md`: the Cloudflare Pages deploy and the checks run on production.
- `docs/reports/github-publish.md`: repo cleanup, history rewrite and the first push to GitHub.
- `docs/caop_research.md`: research on CAOP editions, download URLs and the 2025 parish split.
- `docs/link-samples.md`: Idealista link samples for manual checking. Regenerate with `uv run python scripts/link_samples.py`.
- `docs/perf/`: load-timing JSON files (baseline, after, production, Cloudflare preview) and side-by-side comparison sheets in `docs/perf/screenshots/compare/`.

## Reference

### CAOP edition and the U.F. split

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

### Matching rules (`scripts/build_parishes.py`)

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

### Outputs

- `data/processed/pnct_parishes.csv`: one row per PNCT parish, with columns `dicofre, distrito, concelho, freguesia_official, source_row, match_method, match_score`.
- `data/processed/parishes_all.geojson`: all 3049 mainland parishes.
  - Properties: `dicofre, freguesia, concelho, distrito, pnct` (bool).
  - EPSG:4326, 5-decimal precision, about 4.7 MB.
  - Simplified with mapshaper (`-simplify 6% keep-shapes`).
- `data/processed/concelhos.geojson`: 278 municipality outlines. They are dissolved from the simplified parishes, so the borders line up exactly.

### Web app (`web/`)

```sh
cd web
npm ci
npm run dev                        # local dev server
npm run build                      # type-check + static build into web/dist/
BASE_PATH=/pnct-map/ npm run build # build for a sub-path, e.g. GitHub Pages
npm run test:e2e                   # build + Playwright smoke tests
```

- **Base path:** the default is `/` (the site is served from the domain root). Set `BASE_PATH` for a sub-path build.
- **Static data:** the app reads only `web/data/pnct.topo.json`, `web/data/shapes.json` (loaded when the first PNCT panel opens) and the OpenFreeMap "positron" basemap. There is no backend.
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

### Idealista search shapes

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
