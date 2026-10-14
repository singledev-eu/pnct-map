# Release 0.2.1 (and tags for 0.2.0)

**Merged:** `fix/phone-polish` was fast-forwarded into `main`. It adds `7f8bba3` (legend and glyph fix), `e8c6228` (phone-polish report) and `45d5966`, the release commit. That commit has the CHANGELOG entry **0.2.1 (2026-10-14)** with the perf numbers, `web/package.json` at 0.2.1, and the roadmap update. Pushed `529c2ca..45d5966`.

**Tests on `main`:** pytest 34, Vitest 31 (link snapshot 0 differences), Playwright 29. No flaky tests. `npm run deploy` ran the same suite again before uploading.

**Production deploy:** deployment `1f834b03` (https://1f834b03.pnct-map.pages.dev). Wrangler uploaded 0 new files: the approved preview (`3b2ea87e`) had the identical assets.

**Verification against https://pnct.singledev.eu:**
- **Bundle:** the live `index-C3XvmvVT.js` is identical to the local build.
- **Specs:** `legend.spec.ts`, `basemap-glyphs.spec.ts` and `zoom-levels.spec.ts` passed **12/12** against the live URL.
- **Glyph spec:** it now passes in production. It failed there before this deploy.

**Tags and releases:** both tags are annotated and pushed, and the release notes are the CHANGELOG entries.

| Tag | Commit | Release |
|---|---|---|
| `v0.2.0` | `529c2ca` | https://github.com/singledev-eu/pnct-map/releases/tag/v0.2.0 |
| `v0.2.1` | `45d5966` | https://github.com/singledev-eu/pnct-map/releases/tag/v0.2.1 (marked Latest) |

**Not done:** the merged local branches `feat/zoom-levels` and `fix/phone-polish` still exist; neither was ever pushed. This report is a docs-only commit on `main` after the tag.
