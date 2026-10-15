# Release 0.2.3

**Merged:** `fix/shape-aware-camera` was pushed, then fast-forwarded into `main` (as in previous releases). Commits:
- `f8ae48b`: the shape-aware camera, with the CHANGELOG entry **0.2.3 (2026-10-15)** and `web/package.json` at 0.2.3;
- `176e822`: the shape-aware-camera report;
- `2e7597a`: the roadmap row marked "Released as 0.2.3".

Pushed `6bbd022..2e7597a`.

**Tests on `main`:** pytest 37, Vitest 61 (link snapshot 0 differences), Playwright 46. No flaky tests. `npm run deploy` ran the same suite again before uploading.

**Production deploy:** deployment `e315a4bf` (https://e315a4bf.pnct-map.pages.dev). Wrangler uploaded 0 new files, because the approved preview (`5ce0d702`) had identical assets.

**Verification against https://pnct.singledev.eu:**
- **Bundle:** the live `index-CMwkX0Wv.js` is identical to the local build.
- **Specs:** the full Playwright suite, **46/46** passed against the live URL, none flaky.

**Tag and release:**
- **Tag:** `v0.2.3` (annotated) on `2e7597a`, pushed.
- **Release:** https://github.com/singledev-eu/pnct-map/releases/tag/v0.2.3, marked **Latest**, with the CHANGELOG entry as its notes.

**Housekeeping:**
- The merged local branch `fix/shape-aware-camera` was deleted. Its remote copy on GitHub is kept, because it was pushed as requested.
- The roadmap backlog had no separate Spain-pan item. The only entry was the "on preview" row in Done, now "Released as 0.2.3", and the release line lists 0.2.3.
- This report is a docs-only commit on `main`, after the tag.
