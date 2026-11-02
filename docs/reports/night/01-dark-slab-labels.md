# 01: Dark-mode slab labels

**Status:** done · **Branch:** `task/01-dark-slab-labels` · **Preview:** https://task-01-dark-slab-labels.pnct-map.pages.dev

## Problem

The basemap draws its place names over the slabs (light grey #a3a3a3 with a black halo in dark). The dark PNCT slab top rendered as bright teal #2abfae, so the contrast was **1.10:1**. MapLibre's extrusion lighting brightens a dark top by up to 1.5× plus 0.03 ambient, so the paint colour is not what you see.

## What changed

- `web/src/contrast.ts` (new): WCAG luminance and contrast, plus `extrusionTop()`, a port of MapLibre 6.11.2's fill-extrusion top-face lighting. It is **verified against pixels read back from the canvas**: #0f8a7e → #189b8e, #a3adb7 → #aab4be, #22b8a7 → #2abfae, #5a6571 → #6c7886, and after the change #051d1b → #123331, #171a1d → #2b2f33, #13a99a → #1bb0a1. All exact.
- `web/src/theme.ts`, palette:
  - dark: slab #22b8a7 → **#051d1b**, slabNeutral #5a6571 → **#171a1d**, pop #86ece0 → **#092521**, popNeutral #8f9ba7 → **#1d2125**. The rims are unchanged (bright).
  - light: slab #0f8a7e → **#13a99a**. Positron's #333 locality/state names were at 3.68:1 on the old top, so they failed too.
  - New `veilOpacity` per theme: light 0.38 (unchanged), dark **0.75** (was 0.38). The veil darkens the map around the selection so the deeper slab still stands out. `drill.ts`/`layers.ts` now treat `SlabState.veil` as on/off (1/0) × the palette's opacity, so a theme switch mid-selection gets the right veil.
- `web/src/layers.ts` `rimHeights`: on a **partly-PNCT concelho** the outer and inner rims now rise above the PNCT tops (they were 1 lift high, the tops 2 lifts, so the tops covered the rims). This was already wrong before but hidden by the bright teal. With deep tops the PNCT parishes merged into the veiled map.
- `web/src/contrast.test.ts` (new, 16 tests): for each theme × {slab, slabNeutral, pop, popNeutral}, every place-label colour reaches ≥ 4.5:1 on the rendered top. It also checks the translucent slab (overlay on) over the veiled land, slab vs veiled surroundings ≥ 1.1, rim vs top ≥ 7 (dark), and that pop is lighter than slab. The lighting model is pinned to the read-back pixels.
- `web/scripts/slab_contrast_shots.mjs` (new): before/after shots plus a read-back of the dominant canvas colour (`samples.json`).

## Contrast (after)

| Theme | Top | Rendered | Labels | vs veiled map around |
|---|---|---|---|---|
| light | PNCT slab | #1bb0a1 | #000 7.80, #333 **4.69** (was 3.68) | 1.45 |
| light | neutral slab | #aab4be | #000 10.0, #333 6.02 | 1.90 |
| light | pop | #66ccc0 | #000 11.0, #333 6.61 | – |
| light | neutral pop | #dce2e8 | #000 16.1, #333 9.70 | – |
| dark | PNCT slab | #123331 | #a3a3a3 **5.37** (was 1.10) | 1.13 (rim 12+:1) |
| dark | neutral slab | #2b2f33 | #a3a3a3 **5.35** (was 1.78) | 1.45 |
| dark | pop | #173d38 | #a3a3a3 **4.70** (was 1.93) | – |
| dark | neutral pop | #32383d | #a3a3a3 **4.72** (was 1.03) | – |

"vs veiled map" is the slab against PNCT neighbours under the veil (PNCT) or against veiled land (neutral). In dark, a top that meets AA with #a3a3a3 must render at luminance ≤ 0.042, and the old veiled PNCT neighbours were 0.043. So the fill alone can't separate them much; the bright rim (≥ 12:1 against the top) and the stronger veil do the work. See the screenshots.

Out of scope, on purpose: road names (Dark Matter #504e4e, positron #666) and water names (positron #495e91, Dark Matter dark text on a grey halo). They are dim by design and fail 4.5:1 on the basemap itself; no slab colour could fix them.

## Screenshots

`.artifacts/night01/{before,after}/<device>-<scheme>-<case>.png`. Devices: desktop, phone. Schemes: light, dark. Cases: `pnct` (Alvalade, Santiago do Cacém), `other` (Alvalade, Lisboa), `partial` (Viseu), `hover` (Viseu with Cota popped, desktop), `natura` (Alvalade with Natura on, translucent slab). Crop of the partial/hover fix: `.artifacts/night01/crop-hover.png`. Re-shoot: `node scripts/slab_contrast_shots.mjs <dir>` with the preview server on :4173.

## Tests

pytest 114 passed · Vitest 162 passed (16 new) · e2e 140 passed, none flaky.

## Decisions for Mike

1. **Dark look: deep slab plus strong veil (implemented)**, or **brighter labels (alternative B, not implemented)**. B lifts `DARK_PLACE_LABEL` from #a3a3a3 to about #d4d4d4 (a global label change, so only proposed). That allows a mid-teal top (≈ #26635c rendered, 4.5:1) that stands out ~1.8:1 from its surroundings, keeping the 0.38 veil, but every dark-mode place name gets brighter. Reversible: palette values plus one constant.
2. The partly-PNCT concelho rims now rise 3 lifts on the whole concelho, so the inner rims in its neutral part look a little taller/heavier than before. The alternative is per-edge rim heights (rims next to a PNCT parish only): more code in `edges.ts`.
3. The dark walls are now near-black and mostly read through the rim. A lighter wall colour would need a separate wall layer (MapLibre uses one colour per extrusion).
