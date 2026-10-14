# Camera centre limits

Branch `fix/camera-center`, off `main` at `b30f375` (after 0.2.1). Commit `f06c00b` is **deployed to preview only**: https://preview.pnct-map.pages.dev (deployment `1ccbe4d9`). It is not merged or pushed, and production is still 0.2.1.

## Approach: MapLibre's built-in constrain hook

- **What 6.11.2 has:** the installed MapLibre has `transformConstrain` / `map.setTransformConstrain(fn)`. I checked the `.d.ts` and the source, not just the docs. The callback runs on every camera change: drag frames, pinch, inertia, `easeTo`/`flyTo` frames, `jumpTo`, the hash, and min-zoom changes.
- **The catch:** the hook **replaces** MapLibre's default constrain, which is also what applies min/max zoom and maxBounds. The default isn't reachable through the public API (in 6.x it sits on the private `map._camera`).
- **So `camera.ts` has a pure `constrainView()`** that does all three steps:
  1. clamp the zoom to `getMinZoom()`/`getMaxZoom()`;
  2. keep the viewport inside `getMaxBounds()`, the same rule as MapLibre's default;
  3. clamp the centre into `CENTER_BOX` per axis.
- **Why the steps don't conflict:** both ranges contain the country-view centre, so per-axis clamping never breaks the viewport rule.
- **One difference from MapLibre:** if the viewport is momentarily wider than maxBounds (mid-resize, before the limits are recomputed), it centres instead of force-zooming in.
- **Why this over a custom clamp:**
  - A `move` handler that clamps would fight the gesture: MapLibre moves the camera, then the handler moves it back, which jitters.
  - An ease-back on `moveend` visibly overshoots and then bounces.
  - The hook clamps *inside* each camera step, so pans and inertia simply stop at the edge, like the existing maxBounds. Zooming out is never blocked; only the centre is clamped.
  - An e2e test records the centre on every `move` event during three fast drags with inertia: none leaves the box.

## Margin: 0.25°

`CENTER_BOX` is mainland `[-9.53, 36.95, -6.18, 42.16]` ± 0.25°, about 25 km.

- **Fits need no margin.** I computed every concelho fit and every parish fit with the panel open: 390×844 and 360×740 phones with the bottom sheet, and 1440×900 and 1024×768 desktops with the side panel. None puts the camera centre outside the plain mainland box. The off-centre shift from the sheet or panel never reaches past the coast or the border.
- **Manual panning needs it.** With the phone sheet covering the bottom half, putting the Algarve coast mid-way in the visible half puts the centre about 211 px south of the coast: about 0.04° at z12 and about 0.29° at z9. 0.25° covers that from about z9.2 up, i.e. at parish level.
- **What 0.25° still allows:** Sagres, the Minho and the Spanish-border parishes can be centred with room to spare.
- **What it stops:** at z10, the centre stops about 0.12° east of the Guadiana and well north of Morocco, so Tangier is never in view.

## Files

| File | Change |
|---|---|
| `web/src/camera.ts` | `CENTER_MARGIN`, `CENTER_BOX`, `clampCenter`, `constrainView`, `ViewLimits` |
| `web/src/camera.test.ts` | +11 unit tests (below) |
| `web/src/main.ts` | `map.setTransformConstrain(...)`, which calls `constrainView` with the map's public limits |
| `web/tests/e2e/camera-center.spec.ts` (new) | 5 e2e tests, written by kiro-cli and reviewed (see below) |
| `CHANGELOG.md`, `docs/ROADMAP.md` | Unreleased entry; next steps |

**Unit tests (+11):**
- `clampCenter`: inside the box and on its edges; each side separately (Atlantic, Madrid, south of the Algarve, Galicia, the Tangier corner); the Mercator extremes (±180°, ±85.05°); the country-view centre is inside the box on four screen sizes.
- `constrainView`: no jump at min zoom (desktop, phone, ultra-wide); the zoom clamp (zooming out is never blocked, and Sagres at z12 is untouched); Tangier and Madrid at high zoom; the viewport stays inside maxBounds at low zoom; the resize edge case.

**e2e (5):**
- phone: panning and flying toward Tangier at z10;
- phone: a click on Vila do Bispo (the south-west Algarve corner) lands with the whole concelho above the bottom sheet;
- desktop: dragging toward Madrid, with every frame checked, plus a `jumpTo` to Madrid;
- desktop: zooming out from z12 at Sagres reaches min zoom;
- desktop: the country view is unchanged at min zoom.

**Delegation:** kiro-cli wrote the spec and stayed in its one allowed file. It stopped, as asked, when a test failed because of the app rather than the test (the min-zoom slack below). I adjusted that test's last assertion to what is actually guaranteed, and added the per-frame check to the Madrid test.

## Tests and performance

| Suite | 0.2.1 (`main`) | `fix/camera-center` |
|---|---|---|
| pytest | 34 | 34 |
| Vitest | 31 | 42 (+11); link snapshot 0 differences |
| Playwright | 29 | 34 (+5), no flaky tests |
| Against preview (camera-center, zoom-levels, glyphs) | – | 13/13 |

`perf.mjs`: 3 runs, Pixel 7, Fast 3G, 4× CPU, medians.

| | 0.2.1 | `fix/camera-center` |
|---|---|---|
| Parishes drawn | 7,262 ms | 7,253 ms |
| Full idle | 10,102 ms | 10,079 ms |
| Cross-origin bytes | 261 KB | 261 KB |
| App JS | 278.0 KB | 278.3 KB |
| Glyph ranges | 0-255 | 0-255 |

No regression.

## Left for later

- **Ship:** check the preview on a phone (pinch and drag at the Algarve and border edges), then merge and deploy.
- **Min-zoom vertical slack (pre-existing since 0.2.0, unchanged here).**
  - On height-limited screens (desktop), maxBounds at min zoom is taller than the view: lat 35.45–43.66 for a ~6° view.
  - So a cursor-anchored zoom-out from the Algarve ends about 1.2° south of the country view, with the north of the Minho cut off. Production 0.2.1 ends at exactly the same camera.
  - Your brief said min-zoom behaviour must stay as it is, so I didn't change it.
  - A fix: on the axis that limits the fit, set maxBounds to the min-zoom view instead of mainland ± 1.5°.
