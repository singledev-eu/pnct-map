# Land check: simpler "Check a spot" mode

Branch `feat/land-check` (last code commit cc9ad70). Not merged, not pushed. Production untouched.

## What changed
- **Tap or click checks in place.** The point is checked at once and the marker goes there.
- **The camera stays put, with one exception:** if the panel or sheet that just opened would cover the point, the map pans just enough to keep the point and its pin 16 px clear. That uses `keepVisible()`, based on `visibleArea()`. With reduced motion it jumps instead of easing. Expanding the sheet does the same.
- **Keyboard only:** while the map has keyboard focus (`:focus-visible`), the crosshair marks the centre of the visible map. Enter checks that point and keeps it there.
- **A toast replaces the hint bar.**
  - It says "Tap anywhere to check a spot" (PT "Toque em qualquer ponto para verificar"), or "Click…"/"Clique…" with a mouse.
  - It appears when the mode turns on and fades after about 3 s. After the first check it doesn't show again in the session (sessionStorage).
  - The mode button is filled while on, so the mode stays visible without the bar.
- **The phone sheet opens as a peek** (a new "peek" state in `sheet.ts`):
  - one row with "PNCT: yes/no", the hazard badge in ICNF's colour ("Hazard: Very high"; "Checking…" until the data loads) and the place name;
  - a tap on it, the handle or a drag up expands it to the full report; dragging it down closes it;
  - a sheet you've already expanded keeps its height for the next check.
- `#chk=` links open the mode with the point in the middle of the visible map and the peek showing. Esc, PT/EN, light/dark and 44 px targets are kept: the peek row is 52 px tall and the toggle 44 px.

## Removed
- The "Check here" button and the hint bar (HTML, CSS, `checkHere`/`hint`/`hintTouch`/`crosshair` strings).
- The touch crosshair and tap-to-centre.
- The glossary rows "Check here" and "crosshair (map centre) → mira".
- The e2e tests for those.
- `touchDrag` moved from `bottom-sheet.spec.ts` to `helpers.ts` so both specs can use it.

## Visible map at 390×844 with the peek open
- **667 px** (toolbar bottom 100 → sheet top 767; the peek is 77 px), measured on the preview with the first-visit intro dismissed.
- **582 px** while the first-visit intro is still showing under the toolbar (measured in e2e).
- Before this change, with the hint bar and the half sheet, it was about 170 px.

## Tests
- **Vitest:** 255 passed.
- **e2e:** 178 passed, none flaky. The land check spec has 14 tests.
  - Mouse: the toast appears and fades and doesn't return after a check; the toggle is pressed; crosshair cursor and no crosshair; a click checks in place with no camera move; one marker; a click where the panel opens pans just enough (16 px clear of it, no vertical move); the keyboard crosshair is centred in the visible map, Enter checks it, Esc removes the marker.
  - Touch: a tap checks in place with no crosshair; the toast is dismissed by the first check; the peek is one row with the badges and the place; it expands by tap, handle and drag; a tap near the bottom is kept just above the peek; with reduced motion it jumps; a link in PT.
- **pytest:** 145 passed. The full suite ran through `npm run deploy:preview`.

## Preview
https://preview.pnct-map.pages.dev (deploy c2c9030e)

## Screenshots (`.artifacts/checkux/`, from the preview)
- Phone: `phone-{light,dark}-1-mode-toast.png`, `phone-{light,dark}-2-peek.png` (a tap near the bottom, kept above the peek), `phone-{light,dark}-3-expanded.png`.
- Desktop: `desktop-{light,dark}-1-mode-toast.png`, `desktop-{light,dark}-2-click.png`, `desktop-{light,dark}-3-keyboard.png`.
- The peek and desktop shots are from deploy 1866913e. The last deploy changed only the toast width, and the phone toast shots were retaken on it.

## Note
- The toast no longer mentions Enter and Esc, which the old hint did. Keyboard users find the crosshair when they focus the map. The button's tooltip is unchanged.
