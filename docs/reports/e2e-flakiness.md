# E2E flakiness: visible, not blocking

**Production:** deployed. https://pnct.singledev.eu now has focus mode, the compact phone attribution and the linked bottom-sheet credit.

**The e2e suite:**
- **Retries:** it retries a failed test once. A test that passes only on the retry is reported as flaky with a prominent warning and its trace, without blocking a deploy. A test that fails both attempts still blocks.
- **Waits:** tests that check parish behaviour no longer wait for the OpenFreeMap basemap.
- **Results:** 85 of 85 locally (`--repeat-each=5`) and 3 of 3 full runs against production, with no flaky tests. With every basemap request delayed by up to 4 s, the suite passes 34 of 34.

Only tests and config changed, so no deploy was needed for this part.

## Production deploy

- **Deploy:** `cd web && npm run deploy` passed on the **first attempt**: pytest 34, Vitest 21 (link snapshot at 0 differences), Playwright 17. No e2e rerun was needed.
- **Deployment `6cee1a08`:** https://pnct.singledev.eu and https://pnct-map.pages.dev serve the same HTML, and it contains the new toggle label ("hide parishes outside PNCT territory").
- **Remote e2e against production:** 17 of 17 passed. That includes the focus-mode tests and the phone attribution tests: compact by default, expands on tap, and the sheet credit with all four links.

## How flaky tests show up now

**`playwright.config.ts`:**
- `retries: 1`, for local and remote runs alike.
- `trace: "on-first-retry"`, replacing `retain-on-failure`. Screenshots and video on failure weren't configured before and still aren't.
- A JSON reporter writes `web/playwright-report/e2e-results.json` (ignored by git), next to the list reporter.

**`web/scripts/e2e-flaky-report.mjs`:**
- It reads that report and, for each test Playwright marked `flaky`, prints a yellow banner with the test, its file and line, the first attempt's error, and `npx playwright show-trace <path to the retry's trace.zip>`.
- It always exits 0. When nothing is flaky it prints one line: "No flaky e2e tests".

**Where it runs:**
- After `npm run test:e2e` and `npm run test:e2e:remote`.
- Again at the very end of `npm run deploy` and `deploy:preview`, so the warning is the last thing on screen after the upload.

**Verified with a temporary probe test** (since removed):
- Failing only on the first attempt: Playwright exits 0, the list reporter says "1 flaky", and the banner printed the error and the trace path.
- Failing on both attempts: Playwright exits 1, so `test:all`, and with it `deploy`, stops before any upload.

**Not enabled:** Playwright 1.63 supports `--fail-on-flaky-tests` (and `failOnFlakyTests` in the config), which would make flaky tests fail the run again. It's deliberately off for deploy. Use it for a strict run, for example `npm run test:e2e -- --fail-on-flaky-tests`, if you ever want flakes to block.

## Wait-strategy audit

**Wait helpers** (shared in `web/tests/e2e/helpers.ts`, replacing three copies):
- `waitForParishes`: body `data-parishes-loaded`, meaning the parish layer has been drawn once. It doesn't depend on basemap tiles or glyphs.
- `waitForParishView`: the camera is at rest and the parish tiles for the current view are loaded. It's checked through `window.pnctMap` with `expect.poll`, two animation frames later, so a camera move or filter change that has just ended has requested its new tiles.
- `waitForFullIdle`: `data-ready`, then every source loaded and the camera at rest. Only before screenshots.

**Old waits:**
- `waitForMap` waited for `data-ready`, the first **full** idle, including every basemap tile and label glyph.
- `waitForIdle` slept a fixed **250 ms**, then waited for `data-map-idle`. That's the next full idle, so it waited for the basemap again after every camera move or filter change.

| Test | Old wait | New wait | Basemap needed? |
|---|---|---|---|
| smoke: map loads without console errors (+ screenshot) | `data-ready`, then 250 ms + idle | `waitForFullIdle` | yes, screenshot |
| smoke: searching Loulé selects the concelho | `data-ready` | `waitForParishes`, then auto-waiting panel assertions | no |
| smoke: selecting 130740 … survives a reload | `data-ready`; 250 ms + idle after the fly-to; `data-ready` after reload | `waitForParishes`; `waitForParishView` after the fly-to and after the reload | no |
| smoke: 130740 Idealista link follows the selector | `data-ready` (twice) | `waitForParishes` (twice) | no |
| smoke: whole-PNCT concelho / non-PNCT parish links | `data-ready` (twice) | `waitForParishes` (twice) | no |
| smoke: a dicofre-only link opens and frames it | `data-ready`, then 250 ms + idle, then a one-off zoom read | `waitForParishes`, then `expect.poll` on the hash zoom > 10 | no |
| smoke: clicking a parish selects it (+ screenshot) | `data-ready`; 250 ms + idle before the pixel click and before the screenshot | `waitForParishView` before the pixel click; `waitForFullIdle` only before the screenshot | screenshot only |
| smoke: mobile bottom sheet (+ screenshot) | `data-ready`; 250 ms + idle | `waitForParishes`; `waitForFullIdle` before the screenshot | screenshot only |
| focus: toggling hides non-PNCT fill and outlines | `data-ready` + 250 ms + idle; 250 ms + idle per toggle; one-off rendered-feature reads | `waitForParishView`; `setFocus` polls the layer filter, then `waitForParishView`; rendered features via `expect.poll` | no |
| focus: hover/click on a non-PNCT parish | `data-ready` + 250 ms + idle; same per toggle | `waitForParishView`; `setFocus` as above | no |
| focus: search excludes non-PNCT results | `data-ready`; 250 ms + idle per toggle | `waitForParishes`; `setFocus` as above | no |
| focus: `#f=<non-PNCT>&focus=1` opens with focus off | `data-ready` | `waitForParishes` | no |
| focus: survives a reload | `data-ready` (×3) | `waitForParishes` (×3) | no |
| focus: Lisboa disabled, dropped from the hash | `data-ready`; 250 ms + idle on toggle | `waitForParishes`; `setFocus` as above | no |
| focus: legacy `#pnct=1` | `data-ready` | `waitForParishes` | no |
| attribution: phone portrait (compact, tap, links, sheet credit) | `data-ready` | `waitForParishes`; the attribution-text assertion auto-waits up to 30 s | TileJSON only |
| attribution: phone landscape, panel open | `data-ready` | `waitForParishes`; same text assertion | TileJSON only |

**Attribution tests:** your brief listed attribution content as a full-idle case. The OpenFreeMap / OpenMapTiles / OpenStreetMap part of the text comes from the basemap's **TileJSON**, not from its tiles or glyphs. So these tests wait for the parishes and let the auto-waiting `toHaveText` (30 s timeout) wait for exactly that text. They no longer depend on tiles and glyphs, which are the slow, flaky part.

Every `waitForTimeout` is gone from the e2e tests. A normal local run takes about 19–20 s instead of about 31 s.

## Other flake sources found and fixed

- **Fixed 250 ms sleeps before "idle".** They guessed that a camera animation had started, and then waited for the basemap.
- **Search option lookups:** `searchAndPick` used `page.getByRole("option")`, which also matches the 20 district `<option>`s in the dropdown. It's now scoped to `#search-list li[role=option]`.
- **Clicks before the camera settled:** "clicking a parish" clicks a fixed pixel where `fitBounds` centres Gaifar. It now waits until the fly-to has finished and Gaifar's tiles are loaded, instead of a full idle that could also be slow for unrelated basemap reasons.
- **One-off reads of map state right after a change:**
  - Rendered parish features after a focus toggle are now polled.
  - `setFocus` waits until the layer filter has actually changed before checking that the parish tiles have reloaded.
  - The `map=` zoom in the URL is polled; MapLibre writes it at the end of a camera move.
- **Shared state between tests:** none found. Each test gets a fresh browser context (fresh `localStorage` and URL), and the e2e screenshots go to the ignored `test-results/`.

## Before/after repeat runs

| Run | Before (old waits, no retries) | After (new waits, retries 1) |
|---|---|---|
| Local, `--repeat-each=5` (85 test runs) | 85 passed, 0 flaky, 0 failed (2.7 min) | 85 passed, 0 flaky, 0 failed (1.7 min) |
| Remote against https://pnct.singledev.eu, 3 full runs | 3 × 17 passed (35–37 s each) | 3 × 17 passed, 0 flaky (27–29 s each) |
| Phone attribution test against production, `--repeat-each=20` with traces | 40 passed (I couldn't reproduce the earlier `toBeVisible` timeout) | — |
| Stress: every basemap request delayed by 0–4 s, `--repeat-each=2` | old suite: 34 passed, but **7.2 min** | new suite: **34 passed in 3.0 min** |
| Stress: no delay, `--repeat-each=2` | old suite: 34 passed, 1.1 min | new suite: 34 passed, 38 s |

**Reading these numbers:**
- **Rare failures:** the two failures you reported (2 of 6 full runs) didn't recur in roughly 500 test runs here, before or after the change (counting the stress runs), so the counts can't show a before/after difference on their own.
- **Basemap dependency:** the timings with the basemap delayed show the change that matters. The old waits spend most of their time waiting for the basemap, and every one of those waits can hit the 30 s timeout when tiles.openfreemap.org is slow. The new waits don't.
- **Skipped stress round:** a harsher round, with delays up to 12 s per request to push the old waits past their timeouts, was started and then stopped at your request. So the old suite has no stress baseline at that level.

## Remaining flaky tests

None seen after the changes: 85 of 85 locally, 3 × 17 against production, and 34 of 34 under the 4 s basemap stress.

**The one unexplained earlier failure** was a 15 s `toBeVisible` timeout in the phone-portrait attribution test against the preview. Its failing line wasn't captured, and 40 repeats against production with traces didn't reproduce it, so its cause is still unknown.

- **Possible cause:** the test now waits for the parishes rather than full idle, so a slow TileJSON can't delay the earlier steps. That's a plausible contributor, but it isn't confirmed.
- **Next time:** if it happens again, the retry records a trace automatically and the deploy output prints the `show-trace` command for it.
- **Timeouts:** I didn't raise any. The 30 s map timeout and the 15 s assertion timeout are unchanged, apart from the attribution-text assertion. That one now has the same 30 s as the other map waits, because it waits for the basemap's TileJSON.

## Test results (final)

| Suite | Result |
|---|---|
| pytest | 34 passed |
| Vitest | 21 passed; link snapshot **0 differences** |
| Playwright e2e (local) | 17 passed, no flaky |
| Playwright e2e against production | 3 × 17 passed, no flaky |

## Files

- `web/playwright.config.ts`: retries, trace on first retry, JSON report.
- `web/scripts/e2e-flaky-report.mjs`: new, the flaky-test warning.
- `web/package.json`: `test:e2e`, `test:e2e:remote`, `deploy` and `deploy:preview` run the report.
- `web/tests/e2e/helpers.ts`: new. The shared waits, `trackErrors`, `searchAndPick`, and the `E2E_SLOW_BASEMAP_MS` stress mode that delays tiles.openfreemap.org requests.
- `web/tests/e2e/{smoke,focus,mobile-attribution}.spec.ts`: use the helpers. The assertions are unchanged.
- `README.md`: Tests section, covering the flaky warning and the stress mode.
