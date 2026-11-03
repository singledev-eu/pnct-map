# 01b: "Whole country" button

**Status:** done · **Branch:** `task/01b-whole-country` (from main) · **Preview:** https://task-01b-whole-country.pnct-map.pages.dev

## What changed

- **Button** "All" / "Tudo", directly under `−` in MapLibre's zoom group, in the same 29 px style (a 600-weight 11 px text label). `aria-label` and tooltip: "Show the whole country" / "Ver o país inteiro". It is relabelled live on a language switch.
- **Action** (`main.ts`): clears the selection through the same path as ✕ (`select(null)`: panel closed, slab lowered, hash `f=`/`c=` removed), empties and closes the search box, then eases to the exact country view the zoom-out ends at (`fitCenter(MAINLAND, limits.minZoom, fitPadding(false))`, zoom `limits.minZoom`), pitch 0, bearing 0, over 1.2 s. The ease is instant under reduced motion (`motion()`). MapLibre writes the new `map=` into the hash when the move ends.
- **Disabled** (muted text) at the country view (zoom = minZoom, level) with nothing selected. Refreshed on `moveend` and on every selection change.
- **Phones:** before, the whole zoom group was hidden while the bottom sheet was open. Now, with the sheet at half height, the zoom group (+, −, Tudo) sits 8 px above the sheet (`--sheet-h`, tracked with a ResizeObserver). It is still hidden while the sheet is full or being dragged. The attribution stays in the sheet's © credit, as before.
- Strings in `strings.en.ts`/`strings.pt.ts` (`countryButton`, `countryLabel`); glossary row added.
- `web/scripts/country_button_shots.mjs`: review shots.

## Tests

`tests/e2e/country-button.spec.ts` (5 tests):
- from a 3D parish selection: country view, pitch 0, no selection, search emptied, slab emptied, hash zoom = country zoom, then disabled;
- disabled at load;
- enabled after zooming in, and back;
- reduced motion: at rest on the next frame;
- PT label;
- phone with the sheet open.

Full suite: pytest 114 · Vitest 146 · e2e 145 passed, none flaky.

Screenshots: `.artifacts/night01b/<device>-<scheme>-<view>.png` (country / selected / selected-pt) and `.artifacts/night01b/review.png`.

## Decisions for Mike

1. **Zoom buttons above the half sheet on phones**: implemented, because the task asks for the button with the sheet open. Before, phones hid them while the panel was open. The alternative is to keep them hidden and rely on ✕ then "Tudo". They may cover a little of the map's right edge above the sheet.
2. Label "All" vs an icon (e.g. a Portugal outline or ⤢). Text matches family.singledev.eu's "Всё" and needs no explaining; "Tudo" is 4 letters and fits the 29 px button at 11 px.
3. The button doesn't reset the district filter or "Only PNCT" (it only does what ✕ does, plus the camera). Say if it should.
