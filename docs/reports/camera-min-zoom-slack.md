# Min-zoom slack fix

Branch `fix/camera-center`. Commit `576e4bf` sits on top of `f06c00b` (centre limits) and is **deployed to preview only**: https://preview.pnct-map.pages.dev (deployment `1d6e4456`). It's not merged or pushed, and production is still 0.2.1.

## Change

- **maxBounds = the min-zoom view, on both axes.** At min zoom the only possible camera is the country view, and zooming out from anywhere ends exactly there.
- **Where this differs from the brief.** The brief said "keep the current behaviour on the other axis", but that axis also had slack on phones:
  - A 390×844 phone is height-limited, but its ~4.0° view is narrower than mainland ± 1.5° (6.35°). So a zoom-out from Sagres ended **1.09° west** of the country view, with eastern Portugal cut off. That would have failed the phone test you asked for.
  - On desktop, nothing differs: that axis was already widened to the view.
  - Production 0.2.1 fails the new test both ways: desktop latitude 1.17° south, phone longitude 1.09° west.
- **A fading margin, so zoomed-in fits keep their room.** Pinning the bounds to the min-zoom view at *every* zoom pushed **Loulé** about 20 px under the phone bottom sheet when selected. A new data-driven test found this.
  - So `constrainView` widens maxBounds by `BOUNDS_MARGIN` (1.5°, the old margin). It fades in linearly from **0 at min zoom** to the full 1.5° at the parish level (min zoom + 2).
  - The allowed area therefore shrinks continuously while zooming out, so there's no jump. `CENTER_BOX` (± 0.25°) still limits panning at high zoom.
- **Resize and rotation:** it's recomputed with the existing dynamic limits, unchanged.

## Tests

- **Unit tests (Vitest 42 → 54):**
  - `cameraLimits` on desktop, phone, landscape phone and ultra-wide (height-limited) and on a 320×900 phone (width-limited). On each, the limiting axis is identified, maxBounds equals the view exactly on both axes, and the margin beyond mainland equals the fit padding.
  - Min zoom on all five screen shapes: any requested centre, including Sagres, the Minho, the border, Madrid and Tangier, even below min zoom, ends at exactly the country view.
  - The allowed area grows monotonically with zoom.
  - **New `camera.fits.test.ts`:** on two phones (bottom sheet) and two desktops (side panel), no concelho or parish selection fit (278 concelhos, all parishes) is moved by the camera constraint.
- **e2e (34 → 35):** "zooming out from zoom 12 near Sagres ends at the country view" now runs on desktop **and** phone. It wheel-zooms out anchored on Sagres and requires the initial fit camera within 1e-4°. It passes on the branch and on preview, and fails on production.
- **All suites:** pytest 34, Vitest 54 (link snapshot 0 differences), Playwright 35, no flaky tests.
- **Against preview:** camera-center + zoom-levels, 13/13.

## Performance

`perf.mjs`: 3 runs, Pixel 7, Fast 3G, 4× CPU, medians. No regression; the differences are within noise.

| | 0.2.1 | `f06c00b` | `576e4bf` |
|---|---|---|---|
| Parishes drawn | 7,262 ms | 7,253 ms | 7,275 ms |
| Full idle | 10,102 ms | 10,079 ms | 10,118 ms |
| App JS | 278.0 KB | 278.3 KB | 278.3 KB |
| Glyph ranges | 0-255 | 0-255 | 0-255 |

## Housekeeping

Deleted the merged local branches `feat/zoom-levels` (was `529c2ca`, tag `v0.2.0`) and `fix/phone-polish` (was `45d5966`, tag `v0.2.1`).

## Next

Check the preview on a phone, especially pinch-out from the Algarve and the border, and selecting Algarve concelhos. Then merge `fix/camera-center` and release.
