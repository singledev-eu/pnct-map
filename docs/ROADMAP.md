# Roadmap

Live at https://pnct.singledev.eu · repo https://github.com/singledev-eu/pnct-map · last updated 2026-10-17.

## Done

| Date | What | Report |
|---|---|---|
| 2026-10-11 | Data pipeline: PNCT list (IEFP PDF, 2026-02-04) matched to CAOP 2025 parishes; 1,861 of 3,049 mainland parishes are PNCT | [phase1-pipeline](reports/phase1-pipeline.md) |
| 2026-10-11 | Static map: MapLibre, TopoJSON parishes and concelhos, search, district filter, parish/concelho panel, URL state | [phase2-map](reports/phase2-map.md) |
| 2026-10-11 | Idealista property-search links per PNCT parish, from full-resolution shapes (`shapes.json`); municipality link for whole-PNCT concelhos | [phase3-idealista-links](reports/phase3-idealista-links.md) |
| 2026-10-12 | Initial load performance: parishes drawn on `style.load` instead of `load`, TopoJSON preloaded, quantization 1.2e5. Throttled phone profile: 12.8 s → 7.2 s | [perf-initial-load](reports/perf-initial-load.md) |
| 2026-10-12 | Deploy to Cloudflare Pages at pnct.singledev.eu: content-hashed data files, `_headers` (immutable assets, CSP, security headers), OG tags, robots/sitemap | [deploy-cloudflare](reports/deploy-cloudflare.md) |
| 2026-10-12 | GitHub publish: repo cleanup, one-time history rewrite (36 MB → 9.9 MB), MIT licence, `main` protected, Dependabot alerts | [github-publish](reports/github-publish.md) |
| 2026-10-12 | Focus mode ("Only PNCT"): hides everything outside PNCT territory, with no hover, clicks or search results there; `focus=1` in the URL | [focus-mode](reports/focus-mode.md) |
| 2026-10-12 | Mobile attribution: compact ⓘ on phones, kept clear of the legend; bottom-sheet credit with all four linked credits | [mobile-attribution](reports/mobile-attribution.md) |
| 2026-10-14 | Zoom levels (concelhos at country zoom, parishes inside, cross-fade) and camera limits (dynamic min zoom, maxBounds). Released as 0.2.0 | [zoom-levels](reports/zoom-levels.md) |
| 2026-10-14 | Phone polish: collapsible phone legend; Latin-only basemap labels, so no Arabic/Tifinagh glyph requests (full idle 12.0 → 10.1 s). Released as 0.2.1 | [phone-polish](reports/phone-polish.md) |
| 2026-10-14 | Camera centre kept over Portugal at every zoom, and every zoom-out ends at the exact country view. Released as 0.2.2 | [camera-center](reports/camera-center.md), [camera-min-zoom-slack](reports/camera-min-zoom-slack.md) |
| 2026-10-15 | Shape-aware camera: the centre of the visible map stays inside a mainland outline (2 km past the Spanish border, 20 km at sea) instead of a rectangle that reached Andalusia and Galicia. Released as 0.2.3 | [shape-aware-camera](reports/shape-aware-camera.md) |
| 2026-10-15 | Automatic dark theme from `prefers-color-scheme`: OpenFreeMap dark basemap, dark UI tokens and map palette, live switch that keeps the view, selection and focus. Released as 0.3.0 | [dark-theme](reports/dark-theme.md) |
| 2026-10-15 | No console warnings on a light load: positron's road-shield filters get a `ref_length` fallback through `basemapStyle()`. Released as 0.3.1 | [release-0.3.1](reports/release-0.3.1.md) |
| 2026-10-17 | Protected-areas overlay v1: RNAP (ICNF) and Natura 2000 (EEA end 2024) toggles, the share under protection in every parish/concelho panel, pluggable offline sources. Released as 0.4.0 | [protected-areas](reports/protected-areas.md), [delta](reports/protected-areas-delta.md), [release](reports/release-0.4.0.md) |
| 2026-10-12 | E2E flakiness: one retry; flaky tests warn with a trace but don't block deploys; tests wait for the parish layer, not the basemap | [e2e-flakiness](reports/e2e-flakiness.md) |

Release `v0.1.0` (2026-10-12) covers everything up to e2e flakiness; `0.2.0` (2026-10-14) adds zoom levels; `0.2.1` (2026-10-14) the phone polish; `0.2.2` (2026-10-14) the camera limits; `0.2.3` (2026-10-15) the shape-aware camera; `0.3.0` (2026-10-15) the dark theme; `0.3.1` (2026-10-15) quiet road-shield filters; `0.4.0` (2026-10-17) protected areas; see [CHANGELOG.md](../CHANGELOG.md).

## Next

- Possible 0.4.1: fade the Natura 2000 hatch at country zoom (the user decides after seeing 0.4.0 on the phone).
- Confirm ICNF's reuse terms for RNAP (and for BDG/RN2000, if Natura switches source). Until then RNAP is credited as "reuse terms not confirmed"; dropping it is one line in `scripts/protected_config.py`.

## Backlog

- Protected areas v2: other restriction layers (REN, RAN, PDM zoning), per-site tooltips, the planned per-parish data card (`protection.json` is already shaped for it).
- PT/EN language toggle. Today the UI is English, with a PT-first title and description.
- Cloudflare Web Analytics (cookieless). Undecided.
- Eventual migration from Cloudflare Pages to Workers static assets. Wrangler 4.149 already steers new projects there; `pnct-map` was created on classic Pages with `--force`.

## Decisions and rejected options

- **TopoJSON quantization 5e4:** rejected. It looks identical at the tested views, but its ~12 m steps break the 5 m accuracy budget enforced by `test_topojson_quantization_below_zoom12_pixel`. Kept 1.2e5 (~4.8 m).
- **Protected areas as PMTiles/vector tiles:** rejected for v1. The overlay is 214 KB gzipped and loads only on the first toggle. Tiles would add a request per tile on every pan and zoom, plus a new hosting path, for no gain at this size.
- **PMTiles:** not needed. The display data is ~430 KB brotli, under the 1 MB threshold, and PMTiles would add tile requests on every pan and zoom over slow mobile connections.
- **Cloudflare auto-deploy from GitHub:** not now. `npm run deploy` gates every upload on pytest, Vitest and e2e.
- **`--fail-on-flaky-tests` for deploy:** off. Flaky tests (passing only on the retry) print a warning with the trace; tests that fail both attempts still block.
- **Idealista vertex cap:** no limit was found on Idealista's side; the 60-, 100- and 150-vertex samples all worked. The pipeline still caps shapes at `MAX_VERTICES = 60`, also asserted in `web/src/shapes.test.ts`. Raising it would change link output and needs a deliberate update of the link snapshot.

## Known open items

- **One unexplained earlier e2e timeout:** a 15 s `toBeVisible` in the phone-portrait attribution test (`web/tests/e2e/mobile-attribution.spec.ts`) against the preview. It didn't reproduce in 40 runs with traces. The next occurrence will record a trace on the retry, and `npm run deploy` will print the `show-trace` command.
- **Phase-3 questions without a recorded answer** ([phase3-idealista-links](reports/phase3-idealista-links.md), "Open questions" 2–5). Confirm or close them:
  - hull parishes: one approximate link, or one link per part;
  - the unverified municipality slug and the `terreno-nao-urbanizavel` filter;
  - whether partial concelhos should get a concelho-level link;
  - the default land filter.
