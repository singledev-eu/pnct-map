# pnct-map: context for Claude Code

Unofficial map of the mainland Portugal parishes covered by the PNCT (Programa Nacional para a Coesão Territorial), with Idealista property-search links per PNCT parish.
- **Live:** https://pnct.singledev.eu (Cloudflare Pages project `pnct-map`).
- **Repo:** https://github.com/singledev-eu/pnct-map. `main` is protected against force pushes and deletion.
- **What's next:** [docs/ROADMAP.md](docs/ROADMAP.md).

## Stack and layout

- **Data pipeline:** Python 3.12 (uv), geopandas/pyogrio/shapely, and mapshaper via `npx` (pinned 0.7.68).
- **Web app:** Vite + TypeScript + MapLibre GL JS. It's a static site with no backend. The basemap is OpenFreeMap "positron" (light) or "dark" (Dark Matter), with labels in the UI language. The UI is in English and European Portuguese.
- `data/`: pipeline inputs and outputs. The downloads (`data/external/`, `data/raw/*.pdf`) and large intermediates (`data/processed/*.geojson`) are gitignored. `data/contacts/camaras.csv`: the hand-curated câmara contacts.
- `scripts/`: pipeline steps and `polyline.py`:
  - parishes: `parse_pdf` → `build_parishes` → `build_geo` → `build_topo`, plus `build_shapes` and `build_outline`;
  - protected areas: `protected_config` → `fetch_protected` → `build_protected`;
  - concelho card: `concelhos_config` → `fetch_ine` → `build_concelhos`, plus `contacts_candidates` and `validate_contacts`.
- `tests/`: pytest for the pipeline, shapes, outline, protected areas and concelho data.
- `web/data/`: committed, built by the pipeline.
  - `pnct.topo.json` (display geometry), `shapes.json` (Idealista link shapes), `outline.json` (the camera outline, bundled).
  - Protected areas: `protected.topo.json` (overlay, lazy), `protection.json` (shares per DICOFRE/DICO, lazy) and `protected.meta.json` (categories with EN and PT labels, bundled).
  - `concelhos.json` (population and contacts, lazy).
- `web/src/`:
  - `main.ts`: app wiring, selection, focus mode, hash.
  - `layers.ts`: MapLibre layers and filters.
  - `data.ts`: TopoJSON → GeoJSON, indexes.
  - `links.ts` and `idealista.ts`: Idealista URLs.
  - `theme.ts`: the Auto/Light/Dark choice (Auto follows `prefers-color-scheme`), basemap style URLs and the map palette (mirrored by the `--map-*` CSS tokens).
  - `protected.ts`: protected-areas data and credits.
  - `strings.ts` (types, live bindings, formatters) with `strings.en.ts` / `strings.pt.ts`: every UI string. `i18n.ts`: language detection, `?lang=`, `data-i18n`. `controls.ts`: PT | EN toggle and theme button. `about.ts`: the About dialog.
  - `concelho.ts`: the concelho card. `panel.ts`, `sheet.ts` (phone bottom sheet), `legend.ts` (legend, overlay toggles, explainer), `search.ts`, `hash.ts`, `prefs.ts`.
  - `camera.ts`: camera limits and the mainland outline. `basemap.ts`: the basemap style patches (Latin-only fallback, label language, shield filters, dark labels).
- `web/tests/e2e/`: Playwright specs. Shared waits are in `helpers.ts`.
- `web/scripts/`:
  - `perf.mjs`: throttled load timing; `--toggles N` times the focus toggle.
  - `shots.mjs`, `og_image.mjs`: screenshots and the share image. `readme_shot.mjs` (`npm run shots:readme`): the README screenshot.
  - Review shots: `theme_shots.mjs`, `protected_shots.mjs`, `concelho_shots.mjs`, `i18n_shots.mjs` (PT/EN × light/dark), `phone_safe_area_shots.mjs` (iPhone insets, before/after). `settled.mjs` is their shared wait.
  - `e2e-flaky-report.mjs`: the flaky-test warning.
- `web/public/`: `_headers` (caching, CSP, security headers), icons, OG image, robots.txt, sitemap.xml.
- `docs/`: `ROADMAP.md`, `i18n-glossary.md` (EN → PT terms), `reports/<task>.md` (one per task), screenshots and perf data.

## Commands

```sh
uv sync && uv run make all            # pipeline: downloads CAOP 2025 + the IEFP PNCT PDF (SHA-256 checked), rebuilds data, runs pytest
uv run make protected-fetch           # re-fetch RNAP (ICNF) and Natura 2000 (EEA, 1.36 GB once) into data/external/protected/
uv run make concelhos-fetch           # re-fetch the INE indicators into data/external/ine/ (REFRESH=1 for a new year)
uv run make concelhos                 # rebuild data/concelhos.json and web/data/concelhos.json (validates camaras.csv)
cd web && npm ci && npm run dev       # dev server (data is committed; the pipeline is not needed)
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium   # once, for e2e

uv run pytest -q                      # pipeline tests (need data/processed/*.geojson, so on a fresh clone: make all)
cd web && npm test                    # Vitest, including the link snapshot
cd web && npm run test:e2e            # build + Playwright (1 retry; prints a flaky-test warning if any)
cd web && npm run test:all            # pytest + Vitest + e2e
E2E_BASE_URL=https://pnct.singledev.eu/ npm run test:e2e:remote   # e2e against a deployed site
E2E_SLOW_BASEMAP_MS=4000 npm run test:e2e   # stress: delays tiles.openfreemap.org requests by 0–4 s
node scripts/e2e-flaky-report.mjs     # re-print flaky tests (with trace paths) from the last run

cd web && npm run deploy:preview      # test:all, build, deploy to https://preview.pnct-map.pages.dev
cd web && npm run deploy              # same, to production (main). Only after the user confirms.
```

- Wrangler runs through `npx` pinned at 4.149.0; the user runs `wrangler login` themselves.
- `gh` is logged in as `vopros21`.
- Never handle the user's credentials or tokens.

## Invariants

- **Link snapshot:** `web/src/__snapshots__/links.sha256.json` must stay at **0 differences**. Update it only for an intended link change (`npx vitest run -u`), and say so.
- **Link geometry:** Idealista links come from the full-resolution `web/data/shapes.json`, built by `scripts/build_shapes.py` from CAOP. They are never derived from the simplified display geometry.
- **Codec in two places:** URL and slug changes go in both `scripts/polyline.py` and `web/src/idealista.ts`, with their fixtures.
- **Content-hashed data:** the data files are imported with `?url`, so Vite content-hashes them into `/assets/` (immutable caching). `index.html` preloads the same hashed TopoJSON.
- **Attribution:** it must stay complete wherever it's shown: CAOP 2025 © DGT (CC BY 4.0), OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors, and the protected-area sources (ICNF RNAP, EEA Natura 2000; generated from `protected.meta.json`), with links. That covers the map control, the bottom-sheet credit and the About panel. Licence status: `data/ATTRIBUTION.md`.
- **Protected-area sources:** fetched offline only, never from the browser. `scripts/protected_config.py` is the single switch per category. Shares are computed on unsimplified CAOP and site geometry in EPSG:3763.
- **Parish layer readiness:** the app adds the parish layers on `style.load`, not `load`. `data-parishes-loaded` marks the first parish frame and `data-ready` the first full idle. `window.pnctMap` exposes the map for tests.
- **UI text:**
  - It lives only in `web/src/strings.en.ts` and `strings.pt.ts`. They share the `Strings` type, so a missing key doesn't compile, and `ui-text.guard.test.ts` flags literals elsewhere.
  - `index.html` holds `data-i18n` keys, not text. Data-derived labels carry both languages in their data meta (e.g. `protected.meta.json` `pt`).
  - PT is European Portuguese (AO 1990). Check new terms against [docs/i18n-glossary.md](docs/i18n-glossary.md) and add them there.
  - Place names are never translated.
- **Theme boot script:** the inline `<script>` in `<head>` of `index.html` is allowed by its SHA-256 in the CSP in `web/public/_headers`. Any edit to the script requires updating the hash; `i18n.test.ts` fails otherwise.
- **Phone / iOS Safari:**
  - Text inputs and selects stay at ≥ 16 px on phones and touch screens; Safari zooms into smaller ones on focus.
  - Bottom-pinned UI uses `env(safe-area-inset-bottom)`.
  - Full-height layouts use `dvh` with `vh` fallbacks.
  - Never use `maximum-scale` or `user-scalable` in the viewport meta: pinch zoom must work.
  - `mobile-safari.spec.ts` checks the first two with emulated insets.
- **Concelho contacts:**
  - They live in `data/contacts/camaras.csv`, with `pdm_status` `in_force` or `unclear`.
  - Verify every PDM link against the live site (or the Diário da República notice) before marking it.
  - Generic institutional contacts only (geral@, the switchboard), no personal data.
  - Check the CSV with `scripts/validate_contacts.py` (`--online` re-checks the URLs).
- **No invented values:** data shown in the UI is never estimated or filled in. A missing value shows "—" with a note ("not available" / "não disponível").
- **e2e waits:** wait for the parish layer (`waitForParishes` / `waitForParishView`), not the basemap. Use `waitForFullIdle` only before screenshots. No `waitForTimeout`.

## Working conventions

- **Branches:** one branch per task (`feat/…`, `fix/…`, `docs/…`). Fast-forward it into `main` only after the full suite passes, then push.
- **Deploys:** preview first (`npm run deploy:preview`). Production (`npm run deploy`) only after the user confirms, usually after checking on their phone.
- **Reports:** each task ends with a report in `docs/reports/<task>.md`. The final report is copied to the clipboard with `pbcopy`, and the copy is verified.
- **Delegation:** bounded sub-tasks may be delegated to kiro-cli (`kiro-cli chat --no-interactive --trust-tools=fs_read,fs_write,execute_bash --model claude-sonnet-5.5`), with a spec and a file allowlist. Review its diff before accepting it. Specs and logs go to the gitignored `.kiro-logs/`.
- **Throwaway output:** screenshots and similar go to the gitignored `.artifacts/`. e2e screenshots go to `web/test-results/`.
- **Untracked local files:** before a merge or rewrite that untracks files, back up the local copies. A fast-forward over a "stop tracking" commit deletes the working copies.
