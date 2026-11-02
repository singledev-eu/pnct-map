# 01c: Protected areas on 3D slabs

**Status:** done (on-slab version; the flat fallback was not built, see decisions) · **Branch:** `task/01c-protected-on-slabs`, **based on `task/01-dark-slab-labels`** (it needs task 01's palette and contrast rule; merge 01 first) · **Preview:** https://task-01c-protected-on-slabs.pnct-map.pages.dev

## What changed

- **No more glass.** `GLASS`/`setGlass` are gone, so the slab is opaque at all times.
- **Pipeline** (`scripts/build_protected.py` `write_slab`, also `--slab-only`): the simplified display overlay (write_display step 1) is cut by each display parish with `mapshaper -clip`. That gives one piece per parish × category with `dicofre` and `pnct`, written to **`web/data/protected-slab.topo.json`**: 886 KB raw, **282 KB gzipped**, budget 320 KB, 446 RNAP and 1,012 Natura pieces. Pieces collapsed by quantization are dropped. There is no separate per-concelho file: a concelho's outline is `topojson.merge()` of its parishes' pieces at runtime, which dissolves the shared parish arcs, so no inner cuts show.
  - A sliver filter was tried and rejected: it removed real narrow Natura river corridors (5 parishes ≥ 5% Natura lost their piece).
- **Lazy loading** (`protected.ts` `loadSlabProtected`): fetched once when an overlay is on (content-hashed `?url` import). It is never on the initial-load path.
- **Layers** (`layers.ts`):
  - `slab-protected-rnap` and `slab-protected-natura` are fill-extrusions on the slab top. Natura sits at 0.35 × rimLift above the slab, RNAP at 0.5 × above it, so RNAP sits on Natura where they overlap, with no z-fighting. Both stay above the PNCT tops of a partly-PNCT concelho.
  - `slab-protected-rim` is the outline of each category's part, extruded 0.8 × rimLift in the overlay colours (RNAP orange, Natura violet), below the parish/concelho rims.
  - **Colour:** `slabTint()` mixes 16% (RNAP) / 20% (Natura) of the category colour into the slab colour (PNCT or neutral), then blends back with black/white to the slab's own rendered luminance. Only the hue changes, so labels keep task 01's contrast.
- **drill.ts** `setProtected(visible, data)`: the parts of the categories that are on, for the raised slab (parish if up, else concelho). They rise from the ground with a new selection and move with the slab's transitions (DURATION_3D); their rim quads are rebuilt with the zoom; they are restored after a style rebuild. Each overlay toggle works independently.
- Outside the slab the ground overlay is unchanged (under the veil).
- `CLAUDE.md` invariant updated ("slabs are always opaque…").

## Choice: solid tint vs `fill-extrusion-pattern`

I implemented the luminance-matched solid tint plus the coloured rim. I did not prototype the hatch pattern on extrusions:
- the hatch's light stripes would break the ≥ 4.5:1 label rule wherever a label crosses a stripe (dark mode stripes are #b79cff);
- MapLibre lights the pattern like any extrusion top, so the stripe colours would have to be pre-darkened per theme.

The tint plus the rim reads cleanly in the screenshots.

## Screenshots

- Before (task-01 preview, glass): `.artifacts/night01c/before/`.
- After: `.artifacts/night01c/after/`. Desktop light/dark: `odemira-parish-{both,rnap,natura}`, `odemira-concelho-both`, `gimonde-both` (a partly-protected parish, Bragança). Phone light/dark: `odemira-parish-both`, `odemira-concelho-both`.
- Side by side: `.artifacts/night01c/cmp-dark.png` and `.artifacts/night01c/grid-after.png`.
- Script: `web/scripts/protected_slab_shots.mjs <out> [base-url]`.

## Tests

- pytest **118** (4 new: one object per category, one piece per parish with the right PNCT flag, every parish ≥ 5% inside a category has a piece, budget).
- Vitest **164**: contrast for each category's tint on PNCT and neutral slabs, both themes; the glass case removed.
- e2e **140**: the glass test is replaced by "slab opaque with overlays on; on-slab pieces only from the selected concelho, then only from the drilled parish; each toggle alone; both off → none". None flaky.

## Decisions for Mike

1. **Fallback "flat selection while an overlay is on"**: not built and not screenshotted, because the on-slab version came out clean. Say if you want it compared anyway (about 1 h).
2. **The hover pop-up hides the protected parts of the hovered parish** while it's popped (it rises above them). The alternative is to lift that parish's pieces with the pop; that needs more layers.
3. **Tint strength** (16% / 20%): in dark mode the tint is subtle (the rim does most of the work); in light mode Natura reads blue-teal rather than violet. Easy to tune in `SLAB_TINT`.
4. **File size:** 282 KB gzipped, lazy. Raising quantization or simplifying more could roughly halve it, at the cost of edge accuracy.
