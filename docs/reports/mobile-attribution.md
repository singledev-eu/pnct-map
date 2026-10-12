# Mobile attribution: no more overlap with the legend

On phones, the map attribution no longer covers the legend.
- **Collapsed:** at ≤ 640 px it now starts as MapLibre's compact ⓘ button.
- **Expanded:** one tap shows the full text beside the legend, never on top of it.
- **Desktop:** keeps the full attribution line.

The attribution text and links are byte-for-byte the same as in production.

- **Preview:** https://preview.pnct-map.pages.dev (deployment `2c953305`). It also contains focus mode, which is still waiting for production. Production at https://pnct.singledev.eu is unchanged.
- **Branch:** `fix/mobile-attribution`, fast-forwarded into `main` and pushed to GitHub. Data, map behaviour and Idealista links are unchanged, and the link snapshot is at 0 differences.

## What was wrong

The app created the attribution with `compact: true`. In MapLibre 6.11 that means:
- It's always compact, on desktop too.
- It starts **expanded** on load and collapses only on the first map drag.

On a phone the expanded text grows leftwards from the bottom-right corner and lies on top of the legend.

Measuring every viewport showed two more cases:
- **Narrow landscape (740×360):** the full one-line attribution (600 px) ran into the legend.
- **Landscape with the parish panel open:** the attribution overlapped the legend, and the side panel covered the right half of the toolbar (district select and "Only PNCT" toggle) at all three phone sizes.

## Layout chosen: the attribution stays beside the legend

**Mode by width:**
- MapLibre now chooses: no `compact` option means the full line on maps wider than 640 px and the compact ⓘ at ≤ 640 px. Desktop keeps the full line, and it no longer collapses after a drag.
- On phones the ⓘ starts **collapsed**, by removing MapLibre's `maplibregl-compact-show` class, which is the same thing MapLibre does on drag. It also collapses after rotating or resizing from wide to narrow, which would otherwise re-open it.
- One tap expands it and another collapses it, using MapLibre's own toggle.

**Width limit:**
- The attribution (expanded ⓘ or full line) is limited to the space **right of the legend**:

  `max-width: calc(100vw − panel offset − legend's right edge − 10px margin − 8px gap)`

  with `box-sizing: border-box` so MapLibre's padding counts.
- A `ResizeObserver` in `main.ts` keeps the legend's right edge in a CSS variable. That covers any change in the legend's size, for example in focus mode, where "Other parish" is hidden.
- If the text doesn't fit, it wraps upwards in the bottom-right column, above the zoom buttons.

**Panel open:**
- With the side panel open (wider than 640 px), the controls already move left by 384 px. The same offset is now part of the width limit.
- The toolbar is also limited to the space left of the panel, so it wraps instead of running underneath. This fixes the landscape toolbar/panel collision.
- On phones in portrait, the bottom sheet hides the legend and the bottom-right controls while it's open, as before.

**Why this layout rather than moving the legend:**
- The legend stays put. Moving it up whenever the attribution expands would make it jump on every tap, and it would need the expanded attribution's height, which varies with the viewport and the wrap.
- Nothing new covers the map: the expanded text occupies the empty corner above the zoom buttons.
- It's almost all CSS: a width limit plus one variable. There's no custom attribution element, so MapLibre keeps managing the text, links and toggle. The same rule also fixes the narrow-landscape full line.

**Text:** the attribution reads "Boundaries: CAOP 2025 © DGT (CC BY 4.0) | OpenFreeMap © OpenMapTiles Data from OpenStreetMap", with links to openfreemap.org, openmaptiles.org and openstreetmap.org/copyright. That's identical to production; I compared it against the live site.

## Collision check

I measured the bounding boxes of the toolbar, legend, zoom buttons, attribution and panel, and checked every pair for overlap. Each viewport was tested in portrait and landscape, with the panel closed (attribution collapsed, then expanded) and with the panel open.

| Viewport | Before | After |
|---|---|---|
| 360×740 portrait | attribution over legend (on load) | no overlaps (expanded: 177×104 px beside the legend) |
| 740×360 landscape | attribution over legend; toolbar under panel | no overlaps |
| 390×844 portrait | attribution over legend (on load) | no overlaps |
| 844×390 landscape | toolbar under panel | no overlaps |
| 412×839 portrait | attribution over legend (on load) | no overlaps |
| 839×412 landscape | toolbar under panel | no overlaps |

- The same check against the deployed preview: 15 of 15 states with no overlaps.
- Desktop at 1440×900 is unchanged: the full line on one row, and the toolbar on one row.
- At 1024 px with the panel open, the full line now wraps to two lines beside the legend.

## Tests

| Suite | Result |
|---|---|
| pytest | 34 passed |
| Vitest | 21 passed; link snapshot **0 differences** |
| Playwright e2e (local) | 17 passed: the 15 existing tests plus 2 new ones |
| Playwright e2e against https://preview.pnct-map.pages.dev | 17 passed |

**New:** `web/tests/e2e/mobile-attribution.spec.ts`
- **Phone portrait (390×844):**
  - The attribution is compact and collapsed on load, with its text hidden.
  - A tap expands it; the exact text and the three links are checked.
  - Its box doesn't intersect the legend, collapsed or expanded, or the zoom buttons.
  - A second tap collapses it.
- **Phone landscape (844×390), panel open:**
  - The full line isn't compact, and its text and links are present.
  - It doesn't intersect the legend or the panel.
  - The toolbar doesn't intersect the panel.

Against a build of the previous `main`, both new tests fail, so they catch the original bug.

## Screenshots

`docs/screenshots/mobile-attribution/`, at 390×844 @2×:
- `before-expanded.png`: the old state on load, with the attribution over the legend.
- `before-collapsed.png`: the old state after tapping ⓘ.
- `after-collapsed.png`: the new state on load, with just the ⓘ.
- `after-expanded.png`: the new state after one tap, with the text wrapped beside the legend and above the zoom buttons.

## Not changed (for a later task)

While the parish panel is open in portrait, the bottom sheet hides the attribution control, as before. The sheet's own credit line reads "Boundaries CAOP 2025 © DGT, CC BY 4.0 · OpenFreeMap / © OpenStreetMap", which leaves out "© OpenMapTiles". Adding it would make the attribution complete in that state too. I left the text alone because this task said to keep the attribution text exactly as it is.

## Please check on your phone

Use https://preview.pnct-map.pages.dev:

1. In portrait, the bottom-right corner should show just the ⓘ button above the zoom buttons, and the legend should be fully readable.
2. Tap ⓘ. The full credit should appear to the right of the legend, wrapping over a few lines, with no overlap. Tap the links (they open the sites), then tap ⓘ again to close it.
3. Rotate to landscape. The full credit line should sit beside the legend. Open a parish: the toolbar should wrap to the left of the panel, so search, the district select and "Only PNCT" stay reachable.
4. Rotate back to portrait. The attribution should be collapsed again.
5. Turn on "Only PNCT", which hides one legend row, and expand ⓘ again. It should still sit beside the legend.

When it looks right, `cd web && npm run deploy` publishes this and focus mode to production.
