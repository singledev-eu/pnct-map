# 09: Small 3D follow-up, a bearing swing

**Status:** done, **off by default** behind a constant (see the decision) · **Branch:** `task/09-bearing-swing` (from main) · **Preview:** https://task-09-bearing-swing.pnct-map.pages.dev. Add **`?swing=1`** to see it, e.g. https://task-09-bearing-swing.pnct-map.pages.dev/?swing=1#c=1714.

## Behaviour (`web/src/drill.ts`, `main.ts`)

- After a 3D selection's fit ends (its own `moveend`), the camera turns by **6°** towards the side of the selection's own turn and back, over **9 s**, **once**. One `easeTo` on bearing only, with the easing sin²(πt): 0 → 1 → 0, gentle at both ends. It ends exactly on the landed bearing (`easing(1) = 0`), so the URL's `map=` doesn't drift.
- **Cancelled** by any user-initiated camera move (MapLibre's `movestart` with `originalEvent`: drag, wheel, pinch, keyboard) or by a newer selection (a token). An interrupted swing stops where it is and doesn't resume.
- **Reduced motion:** never (no tilt there anyway). 3D off: never.
- **No continuous rendering afterwards:** the map fires `idle` after the swing (e2e checks it).
- `SWING` constant (off), `SWING_MS`, `SWING_DEG` and `swingEasing` are exported; `?swing=1` turns it on for review.

## Performance (phone profile: Pixel 7, Fast 3G, 4× CPU; 2 runs, medians; `web/scripts/perf_swing.mjs`, data `docs/perf/night09-swing.json`)

| Step | Swing | fps (pick → idle) | worst frame | idle (ms) | basemap tiles |
|---|---|---|---|---|---|
| select concelho | off | 34 | 8 100 | 18 530 | 13 |
| | on | 59 | 100 | 10 552 | 13 |
| select parish | off | 33 | 5 200 | 11 276 | 19 |
| | on | 60 | 17 | 10 494 | 19 |

How to read it:
- **The swing costs no tiles** (same counts) and runs at **59–60 fps** with no long frames.
- The "off" rows' low fps and multi-second "worst frame" are an artefact of this headless, throttled profile. Once the camera stops nothing repaints, and the rAF loop that counts frames is starved while tiles decode on the throttled CPU.
- Idle is dominated by tile loading over Fast 3G in both cases. I don't read "on is faster" into it.

**Conclusion:** no measurable frame-rate or network cost. The costs that remain:
- 9 s of continuous GPU rendering after every selection (battery on phones);
- the camera is "moving" for 9 s, so every wait for the camera at rest (e2e helpers, screenshot scripts, the selection's hash write) is 9 s later.

## Tests

- Vitest **147**: the easing goes out and back, slow start.
- e2e **144**:
  - off by default: a single `moveend`, then idle;
  - `?swing=1`: two `moveend`s; max turn 3–6.5°; it ends on the landed bearing; idle after, and nothing more;
  - a mouse drag mid-swing cancels it (no resume);
  - reduced motion: bearing 0.

  The tests are event-driven: no sleeps.
- pytest 114: run with the gitignored `data/external/ine/fetch.json` set aside for this run. Task 07's refetch added three queries to that local cache, which main's exact-match test doesn't know yet; merging 07 fixes it.

None flaky.

## Decisions for Mike

1. **Default on or off?** The perf numbers don't show a cost, so by the task's rule it could be on. I left it off (conservative and reversible: one constant), because:
   - it moves the camera for 9 s after every selection, which is battery on phones and might feel restless;
   - turning it on needs a test mode (`?swing=0` for the e2e suite and screenshot scripts) so the existing camera-at-rest waits don't grow by 9 s each.

   Try it on your phone with `?swing=1`.
2. Angle and duration (6°, 9 s): tune `SWING_DEG` / `SWING_MS`.
