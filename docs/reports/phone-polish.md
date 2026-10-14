# Release 0.2.0 and phone polish

## Part 1: zoom levels shipped (0.2.0)

- **Merge:** `feat/zoom-levels` fast-forwarded into `main`. The tip is `529c2ca`, a release commit that dates the CHANGELOG entry as **0.2.0 (2026-10-14)** and bumps `web/package.json` to 0.2.0. Pushed `1faf9ad..529c2ca`.
- **Tests on `main`:** pytest 34, Vitest 29 (link snapshot 0 differences), Playwright 24. No flaky tests.
- **Production deploy:** `npm run deploy` ran the suite again, then uploaded deployment `68602e38`. Wrangler uploaded 0 new files, because the approved preview already had the identical assets.
- **Verification:**
  - https://pnct.singledev.eu serves `index-CWDSr3mz.js`, identical to the local build.
  - The zoom-levels and smoke specs passed **15/15** against the live URL. That covers the concelho level at country zoom, a concelho click zooming in, min zoom, maxBounds, resize and focus mode.
- **Not done:** no git tag or GitHub release for 0.2.0 (not requested).

## Part 2: `fix/phone-polish`

Branch off the updated `main`. Commit `7f8bba3` is **deployed to preview only**: https://preview.pnct-map.pages.dev (deployment `3b2ea87e`). It is not merged and not pushed to GitHub.

### 2a. Collapsible legend on phones

- **Phones (≤ 640 px, the app's existing breakpoint):**
  - The legend starts as a **"Legend ▾" chip** (81×46 px, which meets the 44 px tap target).
  - A tap expands it to the level-specific rows plus About.
- **Wider screens:** always expanded, with no toggle, even if a phone-width choice is stored.
- **Accessibility:**
  - A real `<button>` with `aria-expanded` and `aria-controls`; the rows are `hidden` when collapsed.
  - It works with Enter and Space.
  - The legend has `role="group"` with its label.
- **Storage:**
  - The choice is kept in `localStorage` under `pnct-map:legend`, wrapped in try/catch like `prefs.ts`.
  - With storage blocked, the page loads without errors and the toggle still works.
- **Layout:** the existing ResizeObserver on the legend keeps the attribution clear in both states. Tests check that the expanded legend doesn't overlap the expanded attribution or the zoom controls.
- **Levels:** the rows still switch with `body[data-level]`.
- **Files:**
  - `web/src/legend.ts` (new);
  - `web/index.html`, `web/src/style.css`, `web/src/main.ts`;
  - `web/tests/e2e/legend.spec.ts` (new, 4 tests).

### 2b. Arabic/Tifinagh glyph requests: option chosen

**Diagnosis:**
- At phone min zoom, the map loads z6 tile `6/30/25` (64 KB), which covers latitudes from 36.6°N southwards, including northern Morocco.
- Every positron label layer renders `name:latin` + `name:nonlatin`, so the Moroccan places pulled in 3 glyph ranges × 3 fonts. That was 8 extra files.

**Option A (bottom padding), rejected.** Computed for four phone sizes:
- The 60 px padding would have to drop to **≤ 30 px** to keep the view above 36.6°N (at 40 px, 360×740 and 375×667 still load the tile). That leaves Sagres and the Algarve coast within 30 px of the bottom edge, where the legend chip and map controls sit, so the fit gets worse.
- It only fixes the initial view: maxBounds allows panning to 35.45°N, so zoom 6–8 views of the Algarve load Morocco again.
- Clamping maxBounds to 36.6° instead would push Algarve concelhos under the bottom sheet when they're selected on a phone.

**Option B (label layers), chosen:**
- **How:** `web/src/basemap.ts` is a `transformStyle` passed to `map.setStyle()`. Where a feature has `name:nonlatin`, the label shows only its `name:latin` ("Tanger"). Every other label is unchanged.
- **Timing:** the patch is applied before any tile is parsed.
- **Why:**
  - It removes the requests at every camera position, not just the initial view.
  - It doesn't touch the fit: the Algarve stays fully visible at min zoom, with the chip below the coast (asserted in e2e).
  - It hides nothing; labels just stay in Latin script.
- **Trade-off:** the Morocco tile itself (64 KB) still loads at phone min zoom; only its fonts are gone.

**Checks:**
- **e2e** `basemap-glyphs.spec.ts` (written by kiro-cli, reviewed and accepted unchanged):
  - The phone viewport, at min zoom and at +1 and +2 near the Algarve coast.
  - Non-trivial: it requires a requested tile that contains Tangier, and requires 0-255 glyphs to have loaded.
  - It **fails against production** (lists all 8 offending URLs) and passes on the branch and on preview.
- **Unit tests:** `basemap.test.ts`, 2 tests.
- **perf.mjs** now prints `glyph ranges requested:` for each run.

## Tests

| Suite | 0.2.0 (`main`) | `fix/phone-polish` |
|---|---|---|
| pytest | 34 | 34 |
| Vitest | 29 | 31 (+2 basemap); link snapshot 0 differences |
| Playwright | 24 | 29 (+4 legend, +1 glyphs), no flaky tests |
| Against preview (legend, glyphs, zoom-levels) | – | 12/12 |

## Performance

`perf.mjs`: 3 runs, Pixel 7, Fast 3G, 4× CPU, medians. Same profile as the 0.2.0 numbers.

| | 0.2.0 | `fix/phone-polish` |
|---|---|---|
| Parishes drawn | 7,274 ms | 7,262 ms |
| Full idle (`ready`) | 12,026 ms | **10,102 ms** (−1.9 s) |
| Cross-origin bytes (CDP) | 593 KB | 261 KB |
| Basemap `.pbf` requests (tiles + glyphs) | 14 (3 + 11) | 6 (3 + 3) |
| Glyph ranges | 0-255, 1536-1791, 11520-11775, 65024-65279 | 0-255 |
| App JS | 277.7 KB | 278.0 KB |

## Left for later

- **Ship:** check the preview on a phone, then merge `fix/phone-polish` and deploy to production.
- **Release tag:** an optional `v0.2.0` tag and GitHub release.
- **Morocco tile:** it could also be avoided with a slightly smaller phone bottom padding, about 64 KB on first load. That's not worth the fit trade-off now.
- **Phone legend on the country view:** when expanded by the user, it still covers the Algarve. That's by choice; collapsing is one tap.
