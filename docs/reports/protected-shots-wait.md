# Fix: the screenshot scripts' "settled" wait returned immediately

2026-10-18. Branch `fix/protected-shots-wait` (not pushed), fast-forwarded into `main`. Tooling only: nothing in the production bundle changes, so there's no deploy, tag or release.

## Root cause

`web/scripts/protected_shots.mjs` checked "settled" with `page.waitForFunction(() => new Promise(… two requestAnimationFrames … resolve(bool)), scheme, { polling: "raf" })`. Measured in Playwright 1.63: when the predicate returns a Promise, `waitForFunction` awaits it **once** and then judges the Promise object itself, which is always truthy. It doesn't re-poll. It returns after one check (about two frames), even when that check resolved `false`:

```
waitForFunction(() => new Promise(r => setTimeout(() => r(false), 50)), { timeout: 1500 })
  default polling: resolved after 71 ms with false
  raf polling:     resolved after 53 ms with false
```

The earlier `waitForFunction(() => document.body.dataset.ready === "true")` (a synchronous predicate, so correct) masked it: `data-ready` is set on the first full idle, so by then the map was usually settled already.

## Fix

- **New `web/scripts/settled.mjs`:** `waitForSettled(page, scheme, { timeout = 60_000 })` polls with `page.evaluate`, which awaits the Promise and returns its value. Each check runs two animation frames after the previous one ended, with no fixed sleeps. It returns the elapsed ms. On timeout it throws `map not settled after 60 s: <unmet condition>`, e.g. `map not settled after 2 s: map not drawn in the dark theme (body data-map-theme)`. The conditions are the same as before: app ready in `scheme`, the `pa=` overlays in the style, an open panel's protection section filled in, the camera at rest, the map (basemap included) loaded, no finite CSS animation.
- **`protected_shots.mjs`, `theme_shots.mjs`, `readme_shot.mjs`:** each drops its own copy for the shared helper and logs `(settled in N ms)` per view.

I chose the `page.evaluate` poll over a synchronous predicate: a synchronous predicate can't express "still true two frames later" without state left on `window`.

## Other occurrences

Every `waitForFunction` in `web/scripts/` and `web/tests/` was checked:

| Where | Pattern | Action |
|---|---|---|
| `web/scripts/theme_shots.mjs` `settled()` | Same Promise predicate (protected_shots was copied from it) | Fixed, uses `waitForSettled`. |
| `web/tests/e2e/camera-outline.spec.ts:237` | `waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))))`, used as a one-frame pause between touch moves | It already worked (the one await is the whole point), but it relied on the same quirk. Now `page.evaluate(...)`, same behaviour. |
| `web/scripts/readme_shot.mjs` | Already polled with `page.evaluate` (written in 0.4.1) | Moved to the shared helper. |
| Everything else (`perf.mjs`, `og_image.mjs`, `shots.mjs`, the `ready` / `pnctMap` / `spec.until` waits) | Synchronous predicates | Correct, unchanged. |

## Evidence

The same checks run once with the old `waitForFunction` wait and once with `waitForSettled`, each on a fresh 1440×900 page against the local preview build:

| Start state | Old | New |
|---|---|---|
| Right after `goto` | **67 ms**, returned `false`: app not even ready (`data-ready` unset, no map) | **525 ms**: ready, overlays in, map loaded |
| During a 1.5 s `easeTo` | **35 ms**, returned `false`: camera still moving | **1,867 ms**: camera at rest, tiles loaded |
| Fresh load after `data-ready` (how the scripts call it) | 33 ms, map already settled | 32–33 ms |

End-to-end runs with the fix:

- **`protected_shots.mjs`:** 28/28 screenshots, the same set as before (desktop 8 and phone 6 views, light and dark). Plain views settle in 31–33 ms; views with an interaction (About, legend open, attribution open) in 47–72 ms. Those are two to three polls, so the loop really re-checks. Spot-checked `desktop-light-geres-parish` and `phone-dark-legend-open`: correct.
- **`theme_shots.mjs`:** 22/22 screenshots, 31–71 ms per view.
- **`npm run shots:readme`:** settled in 506 ms. `docs/screenshots/desktop-protected.jpg` is byte-identical to the committed one.

## Tests

`npm run test:all`: pytest **72 passed**, Vitest **84 passed**, Playwright **70 passed**, 0 flaky.

## Docs

- `CHANGELOG.md`: new "Unreleased" section with an Infrastructure entry. The project records tooling changes there (`perf.mjs` in 0.2.1, the review-shot scripts in 0.3.0 and 0.4.0).
- `docs/ROADMAP.md`: the follow-up is removed from "Next" and a Done row is added.

## Commits

- `bd41053`: Screenshot scripts: really wait for a settled map (the fix, CHANGELOG, ROADMAP).
- The commit after it adds this report. `main` is fast-forwarded to it and pushed.
