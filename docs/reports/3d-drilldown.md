# 3D drill-down selection

Branch `feat/3d-drilldown` (`7713fcb` plus this report). Not merged, not tagged, not in production.

**Preview:** https://preview.pnct-map.pages.dev (this deploy: https://1235365d.pnct-map.pages.dev)

## What it does

- **Camera:** selecting a concelho (from the country view or search) or a parish (click, search, panel list) eases into a tilted view: pitch 50° (40° on phones), plus a fixed bearing of ±8–15° per feature, taken from its code so the same selection always lands the same way. It takes 1.4 s. The selection is centred in the visible area: left of the panel on desktop, above the bottom sheet on phones. Clearing the selection (✕, a click on empty map) levels the camera back to pitch 0 / bearing 0. A click on a parish tilts onto it without changing the zoom.
- **Slab:** the selection is drawn as a `fill-extrusion` layer filtered to that one feature (by `code` / `dicofre`). Its height rises from 0 through a paint transition, to 3% of the feature's larger side (60–1000 m), so parishes and concelhos look alike at their fitted zoom. `fill-extrusion-vertical-gradient` darkens the walls. A strong outline (3 px) is drawn over it. Drilling from a concelho into a parish lowers and fades the concelho slab (0.7 s) while the parish slab rises. Once lowered, the slab layer is emptied.
- **Focus:** a veil (a `background` layer at 38% in the basemap's colour) fades in above the app layers and below the slab and the basemap labels. Fills, lines and roads dim evenly, so PNCT teal against grey stays readable (see the screenshots).
- **3D button** in the legend header, next to the theme button: "3D", `aria-pressed`, label "3D view: on/off" / "Vista 3D: ligada/desligada". Saved in localStorage (`pnct-map:3d`) like the theme, and on by default everywhere (see Phones). Switching it on during a selection tilts onto it in place; switching it off lowers the slab and levels the camera.
- **Reduced motion:** under `prefers-reduced-motion: reduce` there is no tilt and no slab, only the flat highlight, and selections jump instead of easing (that last part is new for reduced-motion users; before, they got the 900 ms ease). The 3D button is disabled, labelled "3D view: off (reduced motion is on)". The media query is followed live.

## (a) vs (b): the "map on the slab" look

Screenshots (local, not committed): `.artifacts/3d/compare/*.png`, with (a) on the left and (b) on the right, in desktop/phone × light/dark × concelho/parish. The single shots are in `.artifacts/3d/looks/`. `node web/scripts/drill_shots.mjs <dir>` regenerates them.

- **(a) glass:** a tall (6%), pale, 35–55% opaque slab. The map shows through it. But the footprint outline stays on the ground, so it shows *inside* the raised top face, offset from the slab edge by the slab's height. It reads as two shapes. Without the outline, the pale top loses its edge against the faded map, especially in dark mode.
- **(b) plate (chosen):** a thin (3%), 92% opaque slab in the PNCT colour, with the outline. The edge and the top line up, the walls give the depth, and the basemap labels (drawn above the app layers) stay on top of the slab, which gives the promo's "map on the slab" feel. It also works in both themes without separate tuning.

## Phones: decided from measurements

`node web/scripts/perf_3d.mjs --runs 3` on the throttled mid-range profile (Pixel 7, DevTools Fast 3G, 4× CPU, cold cache; same profile as `perf.mjs`). Each run selects Vila Real (concelho), then Mateus (parish), then closes the panel. Medians; raw data in `docs/perf/3d-drilldown.json`:

| step | fps 3D on / off | worst frame on / off | to idle on / off | basemap tiles on / off |
|---|---|---|---|---|
| concelho | 55 / 54 | 83 / 67 ms | 17.8 / 16.9 s | 14 / 10 |
| parish | 60 / 61 | 17 / 17 ms | 13.0 / 15.2 s | 21 / 14 |
| close | 60 / — (no move) | 17 / — | 1.0 / 1.5 s | 0 / 0 |

- The animation runs at the same frame rate. The slab layer holds one feature, so its bucket is tiny.
- The real cost is **+40–50% basemap tiles per selection**: the tilted view shows more ground towards the horizon. Time to idle is within ±2 s (and lower with 3D on for the parish step, where the tilted view's tiles overlapped more with the concelho view's).
- **Decision: on by default on phones too**, with the lower 40° pitch, because the bottom sheet puts the selection in the top half, towards the horizon.
- **Caveat:** headless Chromium renders WebGL in software and the CDP CPU throttle doesn't slow the GPU, so the fps figures compare on vs off, not real devices. Please check it on your phone. If it feels heavy there, the switch is one line (`load3dPref`'s default plus the `PHONE_QUERY` check).

## Recordings

Real-time Playwright recordings of the preview build (light theme: country view → Vila Real → Mateus → close):

- desktop: `.artifacts/3d/rec/3d-desktop.mp4` (9 s, 1280×800), `.artifacts/3d/rec/3d-desktop.gif` (720 px, 6.6 MB)
- phone: `.artifacts/3d/rec/3d-phone.mp4` (9 s, 390×844), `.artifacts/3d/rec/3d-phone.gif` (280 px, 3.1 MB)

These are headless captures, so the frame pacing is less smooth than in a real browser.

## Camera limits with pitch

- `constrainView`'s "centre of the visible area inside the mainland outline" rule used the flat padding offset. Under pitch and bearing, the screen offset of the panel/sheet maps to a different ground offset. The new `groundOffset` (`camera.ts`) projects it exactly for MapLibre's perspective camera (eye at `height/2/tan(fov/2)`) and turns it by the bearing. It's used both to place a fitted selection (`offsetCenter`) and in the constrain, so the two agree. MapLibre's own `easeTo({offset})` would have run the constrain on the offset point instead of the real map centre.
- Zooming out by hand below the concelho level levels the camera, because a tilted country view would show the horizon. Every zoom-out still ends at the exact country view.
- `fitZoom` takes the bearing into account (the turned box must fit).
- **Bug found and fixed:** MapLibre's `hash` ignores the bearing in `map=` while rotation gestures are off, as here, so a reloaded or shared tilted link lost its turn (the existing smoke reload test caught it). `readHash` now keeps the bearing, and a 3D selection from a link gets it back.

## Decisions and trade-offs for you

1. **No idle bearing drift (the optional item).** A continuous drift keeps the map rendering every frame while something is selected: battery drain on phones, MapLibre's `idle` never firing (which the e2e waits, `data-map-idle`, the screenshot and perf scripts all rely on), and the basemap re-placing labels all the time. One slow 8–10 s swing after arrival would be possible as a follow-up, if you want it.
2. **Veil instead of per-feature fading.** The fill opacities are data-driven (feature state), and MapLibre doesn't transition data-driven values, so non-selected polygons can't fade individually. One background layer dims everything below the slab, basemap included, with a real transition, and it costs one layer.
3. **Constant slab heights**, not zoom expressions, so the height transitions animate. The height is set per selection from the feature's size. Zooming in afterwards makes the slab look taller, as a physical object would.
4. **Labels stay above the slab** (they're in the basemap's label stack). That's what makes (b) feel like "map on the slab". The flip side: road shields and village labels appear over the slab top too.
5. **The bearing is per feature** (±8–15°, from its code), not random, so a shared link and a reload land the same way.
6. **No compass control.** The map can only be turned by a selection, and every way out levels it, so the north arrow wasn't added.
7. **Reduced motion now also makes all selections instant**, as the brief asked ("instant selection"). Before, that was a 900 ms ease for everyone.
8. **kiro-cli was not used.** The work was one tightly coupled change (camera maths, layer order, main.ts selection flow, tests). Writing a spec and reviewing the diff would have cost more than it saved.

## Tests

- **e2e** `web/tests/e2e/drill-3d.spec.ts` (7 tests):
  - desktop default on: pitch 50, bearing 8–15°, the slab filtered to the selection, the veil on, the drill swap, the concelho slab emptied, ✕ → pitch 0 / bearing 0;
  - a click on the sea clears the selection and returns the pitch to 0;
  - reduced motion: no tilt, no slab, the camera at rest on the next frame, the button disabled;
  - reduced motion turned on live during a 3D selection levels the camera;
  - the button off/on persists across a reload, with the PT label;
  - a dark theme switch keeps the slab, with no console warnings or errors;
  - phone: pitch 40, and the selection sits above the bottom sheet.

  The existing suite passes with 3D on by default (the smoke reload test exposed the bearing bug above).
- **Vitest:** `drill.test.ts` (setting, bearing range, slab height, slab layers hold one feature) and `groundOffset` in `camera.test.ts`.
- **Full suite before the preview deploy:** pytest 114, Vitest 130, e2e 111, no flaky tests. `drill-3d` + `smoke` against the deployed preview: 15 passed.
- **Link snapshot:** 0 differences (no link code touched).

## Files

- New: `web/src/drill.ts`, `web/src/drill.test.ts`, `web/tests/e2e/drill-3d.spec.ts`, `web/scripts/perf_3d.mjs`, `web/scripts/drill_shots.mjs`, `docs/perf/3d-drilldown.json`.
- Changed:
  - `layers.ts`: slab, veil and outline layers, carried through theme switches;
  - `main.ts`: the selection flow, fit, constrain, the 3D setting;
  - `camera.ts`: `groundOffset`, `offsetCenter`, `fitZoom` with bearing;
  - `controls.ts`, `style.css`: the 3D button;
  - `strings.*`, `theme.ts` (slab palette), `hash.ts` (bearing);
  - `CLAUDE.md`, `docs/i18n-glossary.md`.
