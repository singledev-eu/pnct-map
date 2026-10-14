# Roadmap

Live at https://pnct.singledev.eu · repo https://github.com/singledev-eu/pnct-map · last updated 2026-10-14.

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
| 2026-10-12 | E2E flakiness: one retry; flaky tests warn with a trace but don't block deploys; tests wait for the parish layer, not the basemap | [e2e-flakiness](reports/e2e-flakiness.md) |

Release `v0.1.0` (2026-10-12) covers everything up to e2e flakiness; `0.2.0` (2026-10-14) adds zoom levels; `0.2.1` (2026-10-14) the phone polish; `0.2.2` (2026-10-14) the camera limits; see [CHANGELOG.md](../CHANGELOG.md).

## Next

Nothing agreed yet. Pick from the backlog below.

## Backlog

- Protected-areas overlay: natural parks, Natura 2000.
- PT/EN language toggle. Today the UI is English, with a PT-first title and description.
- Cloudflare Web Analytics (cookieless). Undecided.
- Eventual migration from Cloudflare Pages to Workers static assets. Wrangler 4.149 already steers new projects there; `pnct-map` was created on classic Pages with `--force`.

## Decisions and rejected options

- **TopoJSON quantization 5e4:** rejected. It looks identical at the tested views, but its ~12 m steps break the 5 m accuracy budget enforced by `test_topojson_quantization_below_zoom12_pixel`. Kept 1.2e5 (~4.8 m).
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
