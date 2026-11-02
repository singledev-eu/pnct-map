# 3D drill-down: the fit rule in flat mode and under reduced motion

Branch `feat/3d-drilldown` (`3e167aa` plus this report). Not merged, not tagged, not in production. Follows [3d-drilldown-fixes](3d-drilldown-fixes.md). Review decisions recorded there:
- translucent slab with overlays: kept;
- partial option (i): kept;
- inner rims: kept;
- light rims in dark mode: kept, pending your phone check;
- the large-concelho fallback: accepted.

**Preview:** https://preview.pnct-map.pages.dev (this deploy: https://bfcdb6c6.pnct-map.pages.dev)

## Changes

- **One framing rule for every mode.** `main.ts` `frame` (was `frame3d`) frames every selection that moves the camera by its projected footprint (`camera.ts` `fitProjected`). If the footprint already covers 35–85% of the visible area and fits, the zoom stays; otherwise the camera refits to 70%. This applies to:
  - a click on the map;
  - search;
  - the panel's parish and concelho links;
  - a link or hash change.
- **3D:** as before: pitch and bearing, 1.4 s.
- **3D off:** pitch 0 / bearing 0, eased over 0.9 s (the old flat fit's duration). A feature that is already well framed leaves the camera alone: no re-centring on every click. If it is partly outside the visible area, the camera only centres. A parish clicked inside a selected concelho, previously left tiny on phones, is now refitted.
- **Reduced motion:** the same, instant.
- `measureFootprint` (`camera.ts`) measures the footprint for a given camera, so flat mode can check the current view as it is. `fitProjected` uses it too.
- The old flat `fit` is now only used by the district filter.

## Zoom caps: the flat ones prevented a proper fit

I measured, for every parish and concelho, the share of the visible area it can reach at the cap (`fitZoom` on the display geometry, with the app's fit padding):

| | flat cap before | below 35% at it (desktop / phone) | cap now | below 35% at it (desktop / phone) |
|---|---|---|---|---|
| parish | 12 | 777 of 3,049 (287 PNCT) / 5 | 14 | 1 / 0 |
| concelho | 11 | 5 of 278 / 0 | 12 | 0 / 0 |

- The desktop's visible area is large (about 1,000 × 780 px), so at zoom 12 a quarter of all parishes stayed under 35%. Examples: Aguada de Baixo, 18%. The concelhos included São João da Madeira (19%), Entroncamento, Espinho, Vizela and Odivelas.
- **So the caps are now the 3D ones in every mode: parish 14, concelho 12.**
- The one parish still under 35% at 14 is Borba (São Bartolomeu), at 22% on desktop. It's an urban parish of a few hundred metres. MapLibre's max zoom is 15, and the data is drawn up to zoom 12 and overzoomed past it (the basemap goes further).

## Tests

- **pytest:** 114 passed.
- **Vitest:** 146 passed (+1: `measureFootprint` agrees with a fit and detects a feature outside the area).
- **e2e:** 137 passed (+12), no flaky tests. New in `drill-3d.spec.ts` (now 33 tests): for **3D off** and for **reduced motion**, each on **phone and desktop**:
  - a click on a parish inside the selected concelho;
  - search, a parish then a concelho;
  - a panel-list parish.

  Each asserts:
  - the feature's projected bounding box (MapLibre's own `project`) is inside the visible area and covers 33–87% of it;
  - pitch 0 / bearing 0;
  - under reduced motion, the camera already at rest on the next frame (an instant move).
- **Against the deployed preview:** `drill-3d` + `smoke`, 41 passed.

## For you to decide

1. **Flat zoom caps raised to parish 14 / concelho 12** (see above). This also changes 3D-off selection from 0.6.0: small parishes now zoom in further, and every fit lands at 70% instead of filling the padded view. Say if you'd rather keep 12 / 11 and accept small parishes on desktop.
2. **Flat mode leaves a well-framed selection alone** (35–85%, inside), where 3D still tilts and centres it. I chose this so a click in flat mode doesn't nudge the map every time; the alternative is to always centre.
3. **Release 0.7.0:** after your phone check (including the light rims in dark mode). I'll then merge, tag, deploy to production, publish the GitHub release (Latest) and record the README GIF from production.
