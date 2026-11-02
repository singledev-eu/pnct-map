# 3D drill-down: fixes after phone and desktop testing

Branch `feat/3d-drilldown` (`3ed0b0a` plus this report). Not merged, not tagged, not in production. Follows [3d-drilldown](3d-drilldown.md).

**Preview:** https://preview.pnct-map.pages.dev (this deploy: https://0e7cd114.pnct-map.pages.dev)

Screenshots are local, under `.artifacts/3d/` (gitignored):
- `before-after/`: before (`7713fcb`) on the left, after on the right;
- `compare2/`: design options, shipped (a) on the left, alternative (b) on the right;
- `after/`: every review scenario;
- `theme-late.png`: the theme switch, shot 1.5 s after it.

`node web/scripts/drill_review.mjs <dir>` and `node web/scripts/drill_shots.mjs <dir>` regenerate them.

## 1. Parish (and concelho) fit

**Cause:**
- A click on a parish only tilted the camera in place at the current zoom. Inside a selected concelho, the parish stayed concelho-sized.
- Fits used the flat bounding box, and the near half of a tilted view is magnified, so a fitted feature could overflow towards the bottom.

**Fix:**
- `camera.ts` `fitProjected` frames the feature's projected footprint (its outer rings, through MapLibre's perspective camera: `projectGround`) at the *final* pitch and bearing. It centres the projected box in the visible area (left of the panel, above the sheet) and iterates the zoom until the box covers the target share.
- **Rule (`main.ts` `frame3d`):** centred at the current zoom, if the footprint covers 35–85% of the visible area and fits, the camera only tilts and centres. Otherwise it refits to 70%.
- The same rule applies to every entry point (click, search, panel list, a link) and to concelhos.
- Zoom limits: parishes zoom in up to 14 in 3D (flat still caps at 12). A concelho stays past the concelho level, so its parishes are clickable, unless that would overflow.

**Before → after:**
- `before-after/fit-phone-click-in-concelho.png`: Mateus was a dot, now it fills the area above the sheet.
- `before-after/fit-desktop-click-in-concelho.png`
- `fit-phone-panel-list.png`, `fit-phone-search-concelho.png`, `fit-desktop-search-large-parish.png`

I couldn't reproduce an overflow on all edges in the before shots (Sabóia from search fitted). The projected fit removes the cause either way, and the tests below assert it.

## 2. Hover in 3D

- **Outside the slab:** new hover outline layers (`parish-hover-line`, `concelho-hover-line`) sit above the veil. They're still below the slabs, as item 6 requires.
- **Inside a concelho slab:** the hovered parish pops up. It's an extra extrusion (`hover-pop`) from the slab top to 35% above it (at least 25 m), with a lighter top and a 160 ms rise. It has its own rim at its own top (`hover-rim`). The tooltip is unchanged.
- **Hit-testing through the slab top:** a pointer on a concelho slab's top used to hit the ground point *behind* it, so the hover and the click picked the parish south of the one under the pointer. `camera.ts` `groundUnder` finds the ground right under the slab-top point, and the app hit-tests there. A click on a raised slab or pop-up is that feature.
- **Before → after:** `before-after/hover-outside-slab.png`, `before-after/hover-inside-slab.png`.

## 3. Slab colour follows eligibility

- **PNCT parish or whole-PNCT concelho:** PNCT colour.
- **Non-PNCT parish or concelho:** a neutral, theme-aware slab. Light `#a3adb7`; dark `#5a6571`.
- **Partly-PNCT concelho (option i, shipped):** neutral slab with exactly its PNCT parishes raised in the PNCT colour on top (`concelho-pnct-top`). For Viseu that's 6 of 25.
- **Option ii:** one "partial" colour between teal and neutral, like the legend swatch. It doesn't say *which* parishes qualify; see `compare2/partial-desktop-{light,dark}-viseu.png`.
- **Before → after:**
  - `before-after/colour-{light,dark}-nonpnct-parish.png`: Repeses e São Salvador was teal, now neutral;
  - `before-after/colour-{light,dark}-partial-concelho.png`: Viseu.

## 6. Occlusion

- **The see-through was opacity:** the slab was 92% opaque, so ground lines (parish boundaries, roads) showed faintly through it. Slabs are now fully opaque. Every line layer, app and basemap, was already below the extrusions in layer order; a test now asserts it. After the first extrusion only extrusions follow, then the basemap labels, which stay on top as before.
- **The floating outline is gone:** the ground-level selection outline is replaced by **rims extruded on the slab top**. `edges.ts` cuts the feature's outline into thin quads, one per edge, on the inner side so nothing overhangs the wall, 2.4 px wide at the current zoom (rebuilt on zoom). They're extruded from the slab height to 6% above it (at least 4 m). They follow the slab up and down with the same transitions.
- **Outline: rim (shipped) vs none:** `compare2/outline-*.png`. Without it, the slab's top edge blurs into the veiled map, especially in light mode.
- **Inner parish boundaries on a concelho slab: rims (shipped) vs hidden:** `compare2/inner-*.png`. They're centred quads, 1.1 px, along the boundaries *shared* by two parishes only (TopoJSON gives shared arcs identical coordinates), so the outer wall gets only the outer rim. They show where you can click to drill in.
- **Phone cost:** in the throttled phone run (Pixel 7, Fast 3G, 4× CPU), frame rate is the same with 3D on and off (55 vs 54 fps for a concelho, 60 vs 60 for a parish). The worst frame during the concelho fly went from 83 ms (before this round) to 100 ms. Building the rim geometry takes 0.5–2.2 ms per concelho on desktop (Odemira, 1,010 inner quads: 2.2 ms). Raw data: `docs/perf/3d-drilldown-rims.json`.
- **Rim colour:** darker than the slab in light mode. In dark mode it's lighter (near-white teal or grey), because a dark rim on the bright dark-mode teal disappeared into the walls.
- **After shots, no ground line crossing a slab:** `after/occlusion-{light,dark}-{desktop,phone}-{concelho,parish}.png` (50° desktop, 40° phone), and `before-after/occlusion-dark-desktop-concelho.png`.

## 4. Interplay (`after/interplay-*.png`)

- **Protected areas:** with an opaque slab, the RNAP and Natura hatch vanished exactly over the selection, a regression from flat mode. **While any overlay is on, the slab turns 55% translucent** (rims stay opaque), so the overlay reads through it (`compare2/overlays-*.png`, b = translucent; shipped). The fade at country zoom is unchanged. The overlays sit under the veil, so they're dimmed outside the selection, like everything else.
- **Only PNCT:** the partial concelho shows only its PNCT parishes' fills around the slab, and the raised tops are unaffected (`interplay-focus-partial.png`).
- **Panel, concelho card, phone sheet:** unchanged (`interplay-phone-card.png`, the panels in every shot).
- **Language switch mid-selection:** the slab, rims and camera stay (`interplay-lang-switch.png`).
- **Theme switch mid-selection:** the slab, PNCT tops and rims come back in the new palette (e2e asserts no console warnings or errors). In `interplay-theme-switch.png` the basemap labels look dim. That's the screenshot catching MapLibre's 300 ms label colour transition (`settled.mjs` doesn't wait for paint transitions), and it was already there before this round. 1.5 s later they match a fresh dark load (`theme-late.png`). The label paint is identical in both cases.

## Tests

- **pytest:** 114 passed.
- **Vitest:** 145 passed (was 130). New:
  - camera maths: `projectGround` inverts `groundOffset`, `groundUnder` finds the ground under a raised point, `fitProjected` reaches the target share inside the area and matches `fitZoom` when flat;
  - `edges.ts`: inward and centred quads, holes, shared boundaries only;
  - the slab stack: lines below extrusions, rims on the top and opaque on a translucent slab, PNCT tops only for a partial concelho.
- **e2e:** 125 passed (was 111), no flaky tests. `drill-3d.spec.ts` grew from 7 to 21 tests:
  - **fit, phone and desktop:** search (a parish, a large parish, a concelho), a click on a parish inside the selected concelho, and a panel-list entry. Each asserts the feature's projected bounding box (MapLibre's own `project`) is inside the visible area and covers 33–87% of it;
  - **hover:** outside the slab (the outline layer above the veil, the hover state, no pop-up), and inside the concelho slab (the parish under the slab top pops up above the slab height, then drops and empties);
  - **colour, light and dark:** a non-PNCT parish is neutral; a partial concelho is neutral with exactly its 6 PNCT parishes raised; a whole-PNCT concelho has no tops;
  - **occlusion:** layer order, opaque slab, the rim's base at the slab height, rim features present;
  - **overlays:** the slab is translucent while Natura 2000 is on and opaque again when it's off; rims stay opaque.
- **Against the deployed preview:** `drill-3d` + `smoke`, 29 passed.

## Open decisions

1. **Translucent slab while a protected-areas overlay is on** (shipped) vs always opaque (the overlay hidden over the selection; the panel still shows the percentage). Changing it is one constant (`GLASS` in `drill.ts`).
2. **Partial concelho:** option (i), raised PNCT parishes (shipped), vs option (ii), one partial colour.
3. **Inner rims on concelho slabs** (shipped) vs hidden. Hiding them is one layer (`concelho-inner-rim`).
4. **Light rims in dark mode** instead of darker ones (see 6).
5. **A concelho too big for the parish level** at 70% (the fallback in `frame3d`) is fitted below that level, so its parishes need a zoom-in before they're clickable. None of the tested concelhos (Vila Real, Viseu, Odemira on phone and desktop) hit it.
6. **3D off:** a click on a parish still doesn't move the camera (unchanged from 0.6.0). The fit rule applies only in 3D.
7. **Release, once you approve:** the next minor is **0.7.0**, with a GitHub release marked Latest and a README GIF (recorded from production after the deploy). Not done yet, as asked.
