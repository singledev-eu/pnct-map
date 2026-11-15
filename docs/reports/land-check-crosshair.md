# Land check: "Check a spot" crosshair rework

Branch `feat/land-check` (commit df1f472 plus this report). Not merged, not pushed. Production untouched.

## What changed
- **Touch (pointer: coarse):**
  - The crosshair is fixed in the middle of the *visible* map: under the toolbar and hint, above the bottom bar and the open sheet.
  - The hint has a **Check here** button (PT "Verificar aqui"), 44 px high.
  - A tap checks the tapped point, then eases it under the crosshair. "Check here" does the same, so the checked point always ends up under the crosshair, above the sheet.
- **Mouse (pointer: fine):**
  - No visible crosshair, just a crosshair cursor; a click checks in place and the map doesn't move.
  - The crosshair appears only while the map has keyboard focus (`:focus-visible`). Enter checks the point under it, the centre of the visible map left of the panel.
- **Both:**
  - The marker stays until the mode ends (button or Esc) or the next check replaces it.
  - A `#chk=` link opens the mode, with its point under the crosshair at zoom 12 or more.
  - With reduced motion the camera jumps instead of easing.
  - PT/EN, light/dark, Esc and 44 px targets are kept. The new terms are in the glossary.
- **One deviation:** the padding is computed by `visibleArea()` in `landcheck.ts`, with the same shape as MapLibre's padding, but it isn't set as MapLibre transform padding. The app's camera constrain and fits (`camera.ts`) assume that padding is zero. So the ease uses `easeTo({ offset })` from the measured padding instead.

## Tests
- Vitest: 255 passed, including 4 new `visibleArea` cases: phone with and without the sheet, the sheet at full height, desktop with the panel.
- e2e: 175 passed, no flaky tests. `landcheck.spec.ts` now has 11 tests:
  - mouse (desktop): cursor, click in place, the keyboard crosshair centred left of the panel, Enter, Esc removes the marker, one marker after a second click;
  - touch (390×844): the crosshair centred in the visible area and not the screen, a tap ends under the crosshair above the sheet, Check here, a link in PT, reduced motion with no ease.
- pytest: 145 passed. The whole run went through `npm run deploy:preview`.

## Preview
https://preview.pnct-map.pages.dev (deploy da7a759a)

## Screenshots (from the preview, `.artifacts/checkux/`)
- `phone-light-1-mode.png`, `phone-dark-1-mode.png`: the mode on, crosshair and Check here.
- `phone-light-2-after-tap.png`, `phone-dark-2-after-tap.png`: after a tap, the point under the crosshair above the sheet, with the marker.
- `desktop-light-1-mouse-click.png`, `desktop-dark-1-mouse-click.png`: after a click, marker only, no crosshair.
- `desktop-light-2-keyboard.png`, `desktop-dark-2-keyboard.png`: keyboard focus, crosshair left of the panel.

## Notes
- On a 390×844 phone with the sheet open, the visible map is about 170 px tall, because the toolbar wraps to two rows plus the hint. If the sheet is pulled up to full height, the crosshair hides until there is room again.
- When the mode ends, the report stays open, with its link, until ✕.
