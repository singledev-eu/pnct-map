# Release 0.2.2

**Merged:** `fix/camera-center` was fast-forwarded into `main`. Commits:
- `f06c00b`: camera centre kept near mainland at every zoom;
- `50d147e`: camera-center report;
- `576e4bf`: every zoom-out ends at the country view;
- `906e4f9`: min-zoom slack report;
- `6cab094`: the release commit, with the CHANGELOG entry **0.2.2 (2026-10-14)**, `web/package.json` at 0.2.2, and the roadmap update.

Pushed `b30f375..6cab094`.

**Tests on `main`:** pytest 34, Vitest 54 (link snapshot 0 differences), Playwright 35. No flaky tests. `npm run deploy` ran the same suite again before uploading.

**Production deploy:** deployment `3c082af8` (https://3c082af8.pnct-map.pages.dev). Wrangler uploaded 0 new files, because the approved preview (`1d6e4456`) had identical assets.

**Verification against https://pnct.singledev.eu:**
- **Bundle:** the live `index-5tl5kUp7.js` is identical to the local build.
- **Specs:** **18/18** passed against the live URL: camera-center 6, zoom-levels 7, legend 4, glyphs 1.

**Tag and release:**
- **Tag:** `v0.2.2` (annotated) on `6cab094`, pushed.
- **Release:** https://github.com/singledev-eu/pnct-map/releases/tag/v0.2.2, marked **Latest**, with the CHANGELOG entry as its notes.

**Housekeeping:**
- The merged local branch `fix/camera-center` was deleted; only `main` remains.
- This report is a docs-only commit on `main`, after the tag.
- The roadmap's "Next" is empty again: nothing agreed, pick from the backlog.
