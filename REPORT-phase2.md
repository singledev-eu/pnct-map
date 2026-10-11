# pnct-map — Phase 2 report (map UI)

The app is a static Vite + TypeScript + MapLibre app in `web/`.
- `npm run build` is clean: `tsc --noEmit` reports 0 errors and the Vite build has no warnings.
- 6 of 6 Playwright e2e tests pass.
- 22 of 22 pytest tests pass.
- Nothing was deployed or pushed. Commits are local only.

## Web data (step 0)
- **Make target:** `make web-data` (part of `make all`) runs `scripts/build_topo.py`, which produces `web/public/data/pnct.topo.json`.
- **Contents:** one TopoJSON file with two objects:
  - `parishes` (3049): `dicofre, freguesia, concelho, distrito, pnct`.
  - `concelhos` (278): `name, distrito, pnct_count, parish_count`. These are dissolved from the parishes in mapshaper, so the borders align.
- **Simplification:** it reuses the existing phase 1 simplified geometry (6%), so nothing changes there.
- **Quantization:** 2e5 steps, about 3 m per step. One pixel at zoom 12 is about 19 m, so the result is visually identical. A test asserts the step stays under 5 m.
- **Size: 1,829 KB raw, 525 KB gzipped.** For comparison, `parishes_all.geojson` is 4.65 MB.
- **New tests:**
  - The TopoJSON decodes, arcs land in mainland bounds, and rings close.
  - Counts are 3049 and 278.
  - 1861 PNCT parishes, the same set as `pnct_parishes.csv`.
  - Concelho sums are 3049 and 1861; Loulé has `pnct_count` = 6.

## dist/
`npm run build` produces a fully static build: **3.4 MB raw, about 0.97 MB gzipped**.
| File | Raw | Gzipped |
|---|---|---|
| `index.js` (app + MapLibre) | 1,040 KB | 278 KB |
| `maplibre-gl-worker.js` | 510 KB | 144 KB |
| `pnct.topo.json` | 1,829 KB | 525 KB |
| CSS | 90 KB | 12 KB |

The base path is configurable:
- The default `./` is relocatable to any directory.
- `BASE_PATH=/pnct-map/ npm run build` builds for a GitHub Pages sub-path. I checked that the asset and data URLs resolve under that prefix.

## Libraries (exact pins, all released at least 2 weeks ago)
- **Runtime:** maplibre-gl 6.11.2, topojson-client 3.1.0.
- **Build:** vite 8.3.1, typescript 7.0.2.
- **Types:** @types/topojson-client 3.1.5, @types/topojson-specification 1.0.5, @types/geojson 7946.0.16.
- **Testing:** @playwright/test 1.63.0, using Chrome for Testing 153.
- **Basemap:** OpenFreeMap `positron` style (no API key).
- **Pipeline:** mapshaper 0.7.68 via npx, unchanged from phase 1.
- **No UI framework.** MapLibre 6 is ESM-only with a separate worker file. It is wired with Vite's `?worker&url` import plus `setWorkerUrl`.

## What's implemented
- **Map layers:** 4 layers on 2 GeoJSON sources, inserted below the basemap labels.
  - Parish fill: PNCT teal at 50%, others at 3.5% so they stay hoverable.
  - Parish lines: zoom 8 and above, thin.
  - Concelho lines: always visible, slightly heavier.
  - Highlight line.
- **Feature-state:** hover, selection, and "member of the selected concelho" are all feature-state. District and only-PNCT filters change paint expressions; no layers or data are rebuilt.
- **Hover:** shows a tooltip with freguesia, concelho, and PNCT yes/no.
- **Click and panel:** clicking opens a side panel on desktop, or a bottom sheet at 640 px wide or less.
  - Parish panel: freguesia, concelho, distrito, dicofre, PNCT badge, concelho coverage (e.g. "Only some parishes of Loulé are PNCT: 6 of 11 parishes" or "The whole concelho is PNCT …"), and a "Property search" section.
  - The property search section renders `getLinks(parish)` from `src/links.ts`, which returns `[]` for now and shows a placeholder line.
  - Concelho panel: coverage plus a clickable list of its PNCT parishes.
- **Search:** accent-insensitive autocomplete over 3049 parishes and 278 concelhos. Picking a parish flies to it. Picking a concelho fits its bounds and highlights all its parishes, with PNCT parishes still distinguishable.
- **Filters:** district dropdown (dims everything else and fits to the district) and an "Only PNCT" toggle.
- **Legend and About:** a legend, plus an About dialog listing the PNCT list (2026-02-04), CAOP 2025 with CC BY 4.0 and the DGT attribution text, and OpenFreeMap/OSM. The CAOP credit is also in the map attribution.
- **URL hash:** `#map=z/lat/lng&f=<dicofre>` (or `c=<concelho>`, `d=<district>`, `pnct=1`). A link with only `#f=…` frames that parish. A link that includes `map=` restores that exact view.

## E2E (`web/tests/e2e/smoke.spec.ts`; run with `npm run test:e2e` or `make e2e`) — 6/6 passed
1. The map loads with no console errors or page errors.
2. Searching "Loulé" and picking the concelho shows a panel count of `6 of 11 parishes`, a list of 6 PNCT parishes, and `c=0808` in the URL.
3. Picking "Várzea, Aliviada e Folhada" from search opens the panel with 130740 and PNCT status. After a reload with the hash, the same selection and the same `map=` view are restored.
4. A link with only `#f=130740` opens the panel and zooms in.
5. A real map click: after flying to Gaifar and closing the panel, clicking the canvas reselects Gaifar (`f=160761`). This also checks that no tooltip is left showing.
6. Mobile, 390×844: the bottom sheet opens for Vilar das Almas, positioned in the lower part of the screen, with no console errors.

**Screenshots:**
- `docs/screenshots/desktop-national.png`
- `docs/screenshots/desktop-ponte-de-lima.png`: Gaifar selected, Ponte de Lima context.
- `docs/screenshots/mobile-panel.png`

## Delegated to kiro-cli
**Task:** the search/autocomplete module, `web/src/search.ts` and `search.css`.
- **Spec:** an exact public API, ranking tiers, the ARIA combobox pattern, no `innerHTML`, and a file allowlist of those 2 files.
- **Scope:** Kiro stayed within the allowlist.
- **Quality:** the code was good: the index scan, tiered ranking, union-prefix handling, accent-aligned `<mark>` highlighting and keyboard navigation.

**What I fixed:**
1. **Phone scrolling bug:** it selected on `pointerdown`, as my own spec said. On a phone, scrolling the result list would pick whatever the finger landed on. I changed it to select on `click` and keep `preventDefault` on `pointerdown` so the input doesn't blur. Kiro had flagged this risk itself.
2. **CSS import:** I removed a `@ts-ignore` it had added on the CSS import. It isn't needed with the `vite/client` types.

**Done by me:** everything else, which is the TopoJSON step, map layers, panel, hash state, filters, styles, e2e tests, and docs.

**Bugs found and fixed while reviewing the screenshots:**
- **Stale tooltip:** a tooltip and hover highlight were left behind when the pointer moved from the map onto a DOM overlay, because MapLibre's layer `mouseleave` doesn't fire in that case. I also clear hover on `mouseout` now.
- **Attribution:** the desktop side panel covered the attribution and zoom controls. They now shift left while the panel is open.
- **Console 404:** a console 404 for `/favicon.ico` made the no-console-errors test fail. I added an inline SVG favicon.
- **Ambiguous locator:** the district `<select>` also has the combobox role, which made a test locator ambiguous.

## Performance notes and concerns
- **No profiling yet:** I didn't measure frame rates. Headless Chromium isn't a reliable way to check smoothness, so please check panning on a real phone.
- **Rendering load:** at national zoom, GeoJSON tiling is done once in the worker (source `maxzoom` 12) and there are only 4 vector layers. Hover and selection use feature-state, so they never re-tile. Panning should stay smooth.
- **Download size:**
  - The biggest cost is the first download, about 0.97 MB gzipped. About 525 KB of that is the TopoJSON, which loads in parallel with the style.
  - MapLibre's shared code is bundled twice, once in the main bundle and once in the worker, adding about 140 KB gzipped. That is inherent to MapLibre 6 module workers with Vite.
  - If load time matters, the next step would be pre-tiling to PMTiles or vector tiles. I don't think it's needed at this size.
- **Search cost:** search does a linear scan over about 3,300 precomputed strings per keystroke. I haven't measured it, but it feels instant.
- **External dependency:** the basemap depends on tiles.openfreemap.org being available. If it's down, the PNCT layers can't render, because they need the style. The app then shows an error message instead of loading forever.

## Environment notes
- **Chromium install:** `npx playwright install chromium` timed out repeatedly, even with a 180-second timeout, although curl could reach the same CDN. I downloaded the official Chrome for Testing zip with curl and unpacked it into `web/node_modules/playwright-core/.local-browsers/` (`PLAYWRIGHT_BROWSERS_PATH=0`). The README documents this.
- **Caches:** npm's cache is in `./.npm-cache` (set in `web/.npmrc`). Nothing was written outside the project.
- **Test location:** the e2e tests live in `web/tests/e2e`, not the root `tests/e2e`. They import `@playwright/test`, which is installed in `web/node_modules`, and the root `tests/` holds the Python suite.

## Open questions
1. **Colours and opacity:** OK with the teal palette and the 50% PNCT fill?
2. **Concelho selection:** a selected concelho outlines all its parishes and lists only its PNCT parishes. Should concelhos that are entirely PNCT also list all their parishes? Some have 60 or more.
3. **Mobile bottom sheet:** it covers the attribution while open. The CAOP credit stays in the About dialog. Is that acceptable, or should a compact credit line be added inside the sheet?
4. **Phase 3 links:** what should `getLinks` return? I assume a label, URL and description per parish. Does any site need extra fields, such as a concelho-level fallback?
5. **Language:** the UI copy is English, with Portuguese terms like Freguesia, Concelho and Distrito. Do you want a PT version or a language toggle?
