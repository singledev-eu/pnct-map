# Focus mode ("Only PNCT")

The "Only PNCT" checkbox is now a real focus mode. Turning it on hides everything outside PNCT territory and changes how the map behaves, not just its shading.

- **Preview:** https://preview.pnct-map.pages.dev (deployment `0ae96036`). Production at https://pnct.singledev.eu is unchanged.
- **Branch:** `feature/focus-mode`, fast-forwarded into `main` and pushed to GitHub.
- **Tests:** all pass. The link snapshot is still at 0 differences, and data files are untouched.

## What the checkbox did before

It changed one paint value and nothing else:

- **Map:** in `layers.ts` → `fillOpacity()`, the base fill opacity of non-PNCT parishes went from 0.035 to 0. That base value only applies when a parish isn't hovered, selected or part of a selected concelho.
  - Hovered non-PNCT parishes still lit up at 0.22, and parishes of a selected concelho stayed at 0.12.
  - Parish outlines (`parish-line`), concelho outlines (`concelho-line`) and the highlight layer were unchanged. No layer filter was used.
- **Interaction:** none. Non-PNCT parishes still showed the tooltip and pointer cursor, and clicking still selected them.
- **Search and district dropdown:** unchanged.
- **Legend:** unchanged.
- **URL:** `pnct=1` in the hash was read on load and written on change. A later in-page hash change ignored it.

At 0.035 the fill was already almost invisible, so the checkbox looked like it did nothing.

## What focus mode does now

**Map:** focus mode uses MapLibre layer filters on the existing layers. Toggling is a `setFilter` call: no data refetch and no layer rebuild.
- `parish-fill`, `parish-line` and `parish-highlight` get `["==", ["get", "pnct"], true]`. Non-PNCT parishes have no fill and no outline; only the basemap shows there.
- `concelho-line` gets `[">", ["get", "pnct_count"], 0]`. A concelho's outline is drawn only if it has at least one PNCT parish, and then in full even when it's only partly PNCT, such as Amarante with 10 of 26.
- Filtered features also drop out of hit-testing (`queryRenderedFeatures`), which is what makes them non-interactive.

**Interaction:**
- Non-PNCT parishes ignore hover and clicks completely: no tooltip, no pointer cursor, no selection. Clicking one behaves like clicking empty map, so it closes the panel.
- Besides the layer filter, the hover and click handlers also check the parish. That covers the brief moment after toggling, before the filtered tiles are drawn.
- When focus mode turns on, any hover is cleared. A selected non-PNCT parish, or a selected concelho without PNCT parishes, is deselected and the panel closes.

**Search:**
- In focus mode, search uses a second index with only PNCT parishes and concelhos that have at least one PNCT parish.
- Partly-PNCT concelhos stay searchable and selectable. Concelhos with no PNCT parishes, such as Gondomar, are excluded.

**District dropdown:**
- Lisboa is the only district with no PNCT parishes (0 of 141). In focus mode it stays listed but is disabled (greyed out).
- If Lisboa is selected when focus mode turns on, including from a link, the dropdown resets to "All districts" and `d=` is removed from the URL.
- **Choice:** the camera doesn't move when this happens, so the view doesn't jump unexpectedly.

**Legend:** the "Other parish" row is hidden in focus mode.

**Panel (my choices):**
- **"Show all of <concelho>"** still selects the whole concelho. In focus mode it highlights only that concelho's PNCT parishes. The non-PNCT ones are hidden, so outlining them would show shapes that are otherwise invisible.
- **"Concelho coverage" / "PNCT coverage"** text is unchanged in both modes, for example "10 of 26 parishes are PNCT". It's the useful context focus mode removes from the map, so the panel keeps it.
- The concelho panel already lists only PNCT parishes, so it needed no change.

**Toggle:**
- The label stays "Only PNCT".
- `title`: "Hide parishes outside PNCT territory".
- `aria-label`: "Only PNCT: hide parishes outside PNCT territory".
- When on, the toggle gets a tinted background, teal border and bold text, because the mode hides most of the map.
- On phones (≤ 640 px) the district select and the toggle are 44 px tall, for comfortable tapping.

## URL and state

- **Default:** off. The state lives in the hash as `focus=1`, next to the existing parameters (`map`, `f`, `c`, `d`, `op`, `t`, `land`).
- **Legacy links:** `pnct=1` is still read and is rewritten to `focus=1`. Links without `focus`, such as `#f=170810`, work exactly as before.
- **Hidden targets:** if a link combines `focus=1` with a parish or concelho that focus mode would hide (a non-PNCT parish, or a concelho with no PNCT parishes), focus mode is turned off. The target then opens visible and selected, and `focus=1` is removed from the URL.
  - This is decided once from the hash, both on load and on in-page hash changes.
  - The app writes the hash with `history.replaceState`, which doesn't fire `hashchange`, so it can't loop.
- **In-page hash changes:** focus mode now follows them. Editing the hash or pressing back/forward with a different `focus` applies it.
- **Ordering bug fixed:** while building this I found and fixed a hash-change ordering bug. Turning focus on could clear the old selection, which rewrote the hash, and `restore()` then re-read the modified hash. It now uses the state read once at the start.
- **Test hook:** the map is exposed as `window.pnctMap` so the e2e tests can inspect layer filters and rendered features.

**Edge cases covered:**
- A non-PNCT parish is selected, then focus turns on: the selection is cleared and the panel closes.
- A concelho without PNCT parishes is selected, then focus turns on: the selection is cleared.
- A partly-PNCT concelho is selected, then focus turns on: it stays selected, and the highlight shrinks to its PNCT parishes. Turning focus off restores the full highlight.
- The pointer rests on a non-PNCT parish when focus turns on: the hover is cleared.
- A link to a non-PNCT parish with `focus=1`: focus is turned off.
- A link to a PNCT parish with `focus=1`: focus stays on.
- `focus=1` with `d=Lisboa`: the district resets.
- The legacy `pnct=1` link: it's upgraded to `focus=1`.

## Tests

| Suite | Result |
|---|---|
| pytest | 34 passed |
| Vitest | 21 passed; link snapshot **0 differences** |
| Playwright e2e (local) | 15 passed: the 8 existing tests plus 7 new ones in `web/tests/e2e/focus.spec.ts` |
| Playwright e2e against https://preview.pnct-map.pages.dev | 15 passed |

**New e2e tests** (written by kiro-cli and reviewed by me):
1. Toggling sets and clears the filters on all four layers. Rendered `parish-fill` features include non-PNCT ones when off and none when on. The `focus=1` hash and the "Other parish" legend row are checked too.
2. On a non-PNCT parish (Fregim, 130112), hover and click work when off. Turning focus on closes its panel. In focus mode, hover shows no tooltip or pointer and click doesn't select. Turning focus off makes it work again.
3. Search excludes Fregim and Gondomar in focus mode, while the partly-PNCT Amarante is still found and opens.
4. `#f=130112&focus=1` opens Fregim with focus off and `focus=1` removed.
5. `#focus=1` survives a reload. `#f=170810&focus=1` keeps focus on and opens Vilarinho dos Freires.
6. `#focus=1&d=Lisboa` resets to "All districts" with Lisboa disabled, and Lisboa is enabled again when focus is off.
7. Legacy `#pnct=1` turns focus on and becomes `focus=1`.

**Checks:**
- **Mutation check:** I broke the app three ways to make sure the tests catch real regressions:
  - Search ignoring focus fails test 3.
  - Links to hidden parishes keeping focus fail test 4.
  - Dropping the layer filter fails tests 1 and 5.
  - With the layer filter dropped, test 2 still passes, because the handler guard covers hover and click on its own, as intended.
- **Stability:** 3 repeated runs of the new file, 21 of 21 passed.

**Toggle timing** (`node scripts/perf.mjs --toggles 6`; Pixel 7, 4× CPU throttle, Fast 3G; 3 runs, 9 toggles each way):

| View | Focus on (click → idle) | Focus off |
|---|---|---|
| Country | median **48 ms** (44–68) | median **63 ms** (62–66) |
| Porto district | median **50 ms** (47–53) | median **63 ms** (55–65) |

- Initial load is unchanged: parishes drawn at 7.23 s (it was 7.22 s).
- Raw numbers are in `docs/perf/focus-toggle-{country,porto}.json`.
- `perf.mjs` gained a `--toggles N` option for this.

## Screenshots

Taken on a Pixel 7 (412×839 @2.6×), at country zoom and with the Porto district selected (a mix of PNCT and non-PNCT parishes).

**In the repo:** `docs/screenshots/focus-mode/`:
- `mobile-country-off.png`, `mobile-country-on.png`
- `mobile-porto-off.png`, `mobile-porto-on.png`

**All eight before/after shots, plus two comparison sheets:** `.artifacts/focus-mode/` (ignored by git). The "before" shots come from a build of the previous `main`.

What I checked in them:
- **Focus off is unchanged from before.** A pixel diff shows differences only in the header, from the taller 44 px controls.
- **Focus on:** in the Porto view only the PNCT parishes of Amarante and Marco de Canaveses remain, with their full concelho outlines. The rest of the district shows only the basemap.
- **Phone header:** it wraps cleanly into two rows: search, then district select and toggle. The toggle is 116×44 px.

## Notes

- A first version passed `filter: undefined` to `addLayer` when focus was off. MapLibre's style validation rejected the layers silently, so no parishes were drawn. The layer only gets a `filter` key when one is set. The e2e suite would have caught this; it was found earlier with a scripted check.
- The first `npm run deploy:preview` upload hit a Cloudflare API error on the deployments endpoint. Re-running the same upload (`wrangler pages deploy dist … --branch preview`) worked; the full suite had already passed in that run.
- **Pre-existing on phones:** the map's attribution line slightly overlaps the legend's top row in the bottom-left corner. It's unrelated to focus mode and I haven't changed it.

## Please check on your phone before production

Use https://preview.pnct-map.pages.dev:

1. Tap "Only PNCT". The map should switch instantly to PNCT parishes only, and the toggle should clearly look active. Tap again to restore.
2. Turn focus on and tap where a grey (non-PNCT) parish was, for example around Porto city. Nothing should be selected and any open panel should close.
3. Search "Amarante" in focus mode and pick the concelho. Only its PNCT parishes should be highlighted, and the panel still reads "10 of 26 parishes are PNCT".
4. Open the district dropdown in focus mode. Lisboa should be greyed out.
5. Share a link with focus on (it contains `focus=1`) and open it in another browser. It should open in focus mode.
6. Open https://preview.pnct-map.pages.dev/#f=130112&focus=1. Fregim should open with focus off.
7. Check that the header still fits comfortably in portrait and that the toggle is easy to hit.

When you're happy with it, `cd web && npm run deploy` publishes it to production.
