# Release 0.3.1: no console warnings from positron's road-shield filters

**Released 2026-10-15.** Tag [`v0.3.1`](https://github.com/singledev-eu/pnct-map/releases/tag/v0.3.1), marked **Latest**. Production deployment `0e351fe4` (https://0e351fe4.pnct-map.pages.dev), live at https://pnct.singledev.eu.

## What changed

**The warnings:** a light load logged 3 MapLibre warnings: `layers[<id>].filter[1]: Expected value to be of type number, but found null instead. Falling back to false.` They came from positron's three road-shield layers, which all filter on `["<=", ["get", "ref_length"], 6]`:

| Layer | Min zoom |
|---|---|
| `highway-shield-non-us` | 11 |
| `highway-shield-us-interstate` | 11 |
| `road_shield_us` | 12 |

Roads without a ref have no `ref_length`. The dark style has no `ref_length` filters.

**The fix, in `web/src/basemap.ts`:** `basemapStyle()`, the existing style patch that already does the Latin-only labels and the dark place names, now also rewrites comparisons on `["get", "ref_length"]` inside layer **filters** to `["coalesce", ["get", "ref_length"], 1000]` (`NO_REF_LENGTH`). It finds them by that pattern rather than by layer id, so it touches exactly those 3 filters. The icon and text expressions and every other layer are unchanged.

**Why 1000 and not 0:** today MapLibre falls back to `false` for a road without a ref, so the shield layers skip it.
- With `coalesce(…, 0)`, `0 <= 6` is true, so from z11 every road without a ref would match `highway-shield-non-us`. Each would get a `road_` icon and empty text: invisible, but extra symbol placement work.
- A fallback above the limit keeps the filter result `false`, exactly as before. Only the warning goes; nothing on the map changes.

**Tests**
- **Vitest:** `web/src/basemap.test.ts` checks that the filter is patched with the stand-in above the limit, that the other filter parts, the icon and the text are unchanged, and that unrelated layers are left alone.
- **e2e:** the light-load test in `web/tests/e2e/theme.spec.ts`:
  - loads at z12 over roads (`/#map=12/41.19/-7.72`), because the shield layers start at z11/z12;
  - waits for full idle;
  - asserts **no console warnings**, like the dark test.

  I checked it catches the bug: with the patch disabled, the test fails.

**Release files:**
- `web/package.json` and `package-lock.json` at 0.3.1;
- CHANGELOG entry **0.3.1 (2026-10-15)**;
- roadmap row "Released as 0.3.1".

## Commits

Branch `fix/positron-shield-warnings`, pushed and fast-forwarded into `main` (`dc7e6ae..66eee1b`):
- `66eee1b`: Silence positron's road-shield filter warnings; release 0.3.1

The local branch is deleted; its GitHub copy is kept. This report is a docs-only commit on `main`, after the tag.

## Tests

| Run | pytest | Vitest | e2e |
|---|---|---|---|
| On the branch (`npm run test:all`) | 37 passed | 67 passed, link snapshot 0 differences | 51 passed, none flaky |
| `npm run deploy` gate, on `main` | 37 passed | 67 passed | 51 passed, none flaky |
| Against production (`E2E_BASE_URL=https://pnct.singledev.eu/`) | n/a | n/a | **51 passed**, none flaky |

## Production check

- **Bundle:** https://pnct.singledev.eu serves `assets/index-BM3pg6pR.js`, byte-identical to the local build (`cmp`). I polled until the live bundle matched before running the suite, so the remote tests ran against 0.3.1.
- **Light** (Playwright `colorScheme: 'light'`, z12 over roads): positron requested, light palette, **no console warnings or errors**.
- **Dark** (`colorScheme: 'dark'`, z11): the dark style is the only style request, all 7 app layers are present, **no console warnings or errors**.
- **Live switch** light → dark → light on production keeps the camera, selection, focus filter, layers, panel and hash.

## Links

- Release: https://github.com/singledev-eu/pnct-map/releases/tag/v0.3.1
- Deployment: https://0e351fe4.pnct-map.pages.dev
- Site: https://pnct.singledev.eu
