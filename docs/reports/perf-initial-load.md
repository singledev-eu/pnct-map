# Performance: initial load

Branch `perf/initial-load`. Nothing was deployed.

## Result

Parish polygons now appear **44% sooner** on a throttled phone profile: **12.8 s → 7.2 s**.

The time until the whole map is idle barely moved, **12.8 s → 12.0 s**. That gap is waiting for basemap label glyphs, which this branch doesn't change.

Idealista link output is byte-for-byte unchanged. The new snapshot check finds **0 differences**.

## Before / after

**Profile:** Playwright + Chromium, Pixel 7 emulation, DevTools "Fast 3G" (562.5 ms latency, 180 KB/s down), 4× CPU slowdown, cold cache, 3 runs. Each run uses `npm run preview`, which serves gzip, not brotli.

**Timings** (median of 3 runs, min–max in brackets):

| Metric | Before | After |
|---|---|---|
| Parish polygons drawn | 12,780 ms (12,757–12,843) | **7,222 ms** (7,216–7,299) |
| First full map idle (incl. basemap labels) | 12,795 ms | 12,007 ms |

**Geometry assets:**

| Asset | Before (raw / gzip / brotli) | After (raw / gzip / brotli) |
|---|---|---|
| `data/pnct.topo.json` (display geometry, fetched at start) | 1,873 / 537 / 456 KB | **1,810 / 502 / 428 KB** |
| `data/shapes.json` (Idealista link shapes, fetched when the panel first needs a link) | 596 / 360 / 315 KB | unchanged, byte-identical |

**Other shipped assets** (unchanged, raw / gzip / brotli):
- `assets/index-*.js` (app + MapLibre): 1,046 / 280 / 231 KB
- `assets/maplibre-gl-worker-*.js`: 510 / 144 / 119 KB
- `assets/index-*.css`: 92 / 13 / 11 KB
- `index.html`: 4 / 1.5 / 1.2 KB

The basemap comes from tiles.openfreemap.org: style, sprite, 3 tiles and 11 glyph ranges, about 1.3 MB over the wire. About 480 KB of that is label glyphs.

Raw measurements are in `docs/perf/baseline.json` and `docs/perf/after.json`.

## What I found

- **Step 2 was not needed.** Links were already precomputed from full-resolution CAOP geometry in the pipeline: `scripts/build_shapes.py` writes `shapes.json`. They were never derived from the display geometry, so the hard constraint was already met by design. I left `shapes.json` and the link code untouched.
- **The display geometry was already lean.** It was already TopoJSON with shared borders, built with mapshaper at 6% retained vertices with `keep-shapes`. Its properties are only about 40 KB of the gzipped file, and the UI uses all of them: tooltip, panel, search and the district filter.
- **The load is bandwidth-bound.** About 1.9 MB has to come through 180 KB/s, so bytes and request order are what matter. CPU work is small: the parish layer is drawn about 0.6 s after its data arrives.
- **The real bottleneck was waiting, not file size.** The app added the parish layers on MapLibre's `load` event. `load` fires only after the first fully complete render, so it waits for every basemap tile and label glyph. The parish data sat ready for seconds before it was drawn.

## What changed and why

1. **Parish layers are added on `style.load` instead of `load`** (`web/src/main.ts`). That is when the style and sprite are in, which is all `addLayers` needs. Parishes no longer wait for basemap glyphs.
   - The "Loading map…" pill now hides when the parishes are drawn.
   - The basemap error message is limited to that same window, so a late tile error can't cover a working map.
   - `data-ready` still means first full idle, so the e2e tests are unchanged.
2. **`<link rel="preload">` for `pnct.topo.json`** (`web/index.html`). The data used to start downloading only after the 280 KB JS bundle had loaded and run. It now downloads alongside it.
   - The two changes only work together. Each alone measured no gain: 12.79 s with the preload only, 12.78 s with the `style.load` change only, about 7.7 s with both. That run was before the quantization change.
3. **TopoJSON quantization from 2e5 to 1.2e5** (`scripts/build_topo.py`). This means about 4.8 m steps instead of about 3 m.
   - It saves 35 KB gzip with no visible change.
   - No parish gained or lost parts. The largest area change is 0.29%.
   - It stays within the existing test that requires steps under 5 m.
4. **Measurement tooling:**
   - `web/scripts/perf.mjs`: throttled timing harness.
   - `web/scripts/shots.mjs`: fixed-view screenshots.
   - `web/scripts/side_by_side.py`: comparison sheets.
   - `web/src/links.snapshot.test.ts`: link diff check.
   - A `data-parishes-loaded` attribute that the harness waits for.

## Options I rejected

| Option | Result | Why rejected |
|---|---|---|
| Simplify to 3% or 2% retained | 362 / 314 KB gzip | Visible loss at parish zoom: the small spur of Vilarinho dos Freires disappears and the Peniche coast turns angular. 6% is already at the edge. |
| mapshaper `interval=` (10–30) instead of percent | 714–1,159 KB gzip | Keeps *more* detail than 6%, so larger. |
| Quantization 5e4 (~12 m steps) | 447 KB gzip | Looks identical in the screenshots, but breaks `test_topojson_quantization_below_zoom12_pixel` (5 m budget). You asked that existing tests pass, so I didn't loosen it. **Your call:** it would save a further ~55 KB, about 0.3 s. |
| Shorter property encoding (codes instead of repeated names) | ~10 KB gzip | Not worth a data-format change. |
| Preconnect to tiles.openfreemap.org + preload of the style JSON | 7.89 s vs 7.66 s without | Neutral to slightly worse in the harness, which shares bandwidth and doesn't emulate handshake latency. It might help on a real phone; untested, so left out. |
| PMTiles | not built | See the next section. |

**PMTiles.** Your threshold for trying it was over 1 MB brotli; the data is 428 KB brotli. On the remaining time, the first-parish critical path is now JS (280 KB) + worker (144 KB) + sprite (120 KB) + data (502 KB), all gzip.

PMTiles would cut the data part at country zoom. It would cost:
- a tiling tool (tippecanoe isn't installed here)
- the pmtiles dependency
- a separate index file for search, bounds and the panel lists, which currently come from the full GeoJSON
- `promoteId` for feature-state
- most importantly, tile requests on every zoom and pan. At 3G latency that changes the "smooth after load" behaviour you said works today.

I didn't measure the gain. I'd only pursue it if 7 s is still too slow on your phone.

**Biggest remaining lever, not taken:** about 480 KB of basemap label glyphs. They include Arabic and Tifinagh ranges, triggered by Moroccan labels in the z6 tiles. Cutting them means changing the basemap style's label fields, which changes the map. It would mostly shorten the time until labels appear, not the parishes.

## Simplification settings

- **Display parishes:** mapshaper 0.7.68, `-simplify 6% keep-shapes` (weighted Visvalingam, the default), `-clean`, GeoJSON precision 1e-5. All of this is unchanged in `scripts/build_geo.py`. Shared borders are kept by TopoJSON, so there are no gaps or overlaps.
- **TopoJSON quantization:** now 120,000 (was 200,000).
- **Concelho outlines:** dissolved from the same simplified parishes, as before.

**Screenshots** (1200×800 @2x): side-by-side before/after sheets in `docs/perf/screenshots/compare/`. The individual before/after PNGs were removed later to keep the repo small; `web/scripts/shots.mjs` regenerates them.
- `1-country.png`
- `2-district-viana.png`: district zoom, with the district filter
- `3-concelho-peso-da-regua.png`
- `4-coast-ria-de-aveiro.png`: jagged lagoon coastline
- `5-coast-peniche.png`: coastline at zoom 12
- `6-parish-vilarinho-dos-freires.png`: small, jagged PNCT parish (7.9 km²)

I can't see any difference in any pair.

## Link diff

`web/src/links.snapshot.test.ts` rebuilds every link the panel can show:
- **Scope:** 3,049 parishes (1,861 PNCT) and 278 concelhos.
- **Options:** all 48 search-option combinations (2 operations × 3 types × 8 land-filter sets).
- **Source:** the real `pnct.topo.json` and `shapes.json`, through `getLinks` and `getConcelhoLinks`. This also covers municipality links, which depend on the concelho names in the display data.
- **Method:** it hashes the result per parish and per concelho against `web/src/__snapshots__/links.sha256.json`, which was recorded before any change.

**Result: 0 differences.** `shapes.json` is byte-identical.

## Tests

- `uv run pytest`: 34 passed.
- `npm test` (Vitest): 21 passed, including the link snapshot and the Python/TS codec check over all of `shapes.json`.
- `npm run test:e2e` (Playwright): 8 passed.

**Behaviour check (extra script):**
- The district dropdown changes the hash and the shading.
- The hover tooltip, click-to-select, panel and Idealista link, and the PNCT toggle all work.
- There were no console errors.
- The preload is consumed with a single request and no "preloaded but not used" warning.

## Delegated to kiro-cli

**Task:** the throttled timing harness, `web/scripts/perf.mjs`.
- **Spec:** a one-file allowlist and the exact CDP profile. The spec and log are in `.kiro-logs/`.
- **Result:** it stayed in scope, the script ran, and it flagged its own blind spot honestly.
- **Review and fixes:**
  - Its CDP session couldn't see MapLibre's worker requests (vector tiles), so I added Playwright request tracking. This also showed that worker fetches *are* throttled.
  - I later added the parish-drawn milestone.

The mapshaper pipeline ended up as a one-constant change, so I didn't delegate it.

## Please check on your phone

Use mobile data or a weak signal, not Wi-Fi.

1. **Cold load.** Parishes should appear clearly before basemap labels, and the "Loading map…" pill should disappear when the parishes appear.
2. **Tap a parish as soon as it appears**, before labels finish. The panel and the Idealista link should work.
3. **Open a shared link with `#f=170810`.** It should open the panel and frame the parish.
4. **Zoom into Peniche or Vilarinho dos Freires.** Outlines should look the same as on the live version.
5. **Decide on 5e4 quantization** (loosen the 5 m test, about −55 KB) **and on PMTiles**, if 7 s is still too slow.
