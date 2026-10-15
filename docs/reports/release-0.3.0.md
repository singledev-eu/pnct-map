# Release 0.3.0: automatic dark theme

**Released 2026-10-15.** Tag [`v0.3.0`](https://github.com/singledev-eu/pnct-map/releases/tag/v0.3.0), marked **Latest**. Production deployment `540bed25` (https://540bed25.pnct-map.pages.dev), live at https://pnct.singledev.eu.

## What changed since the dark-theme report

The screenshots were approved. The first report is [dark-theme](dark-theme.md).

1. **No more `wood-pattern` warning.**
   - OpenFreeMap's dark style uses a `wood-pattern` image that its sprite doesn't have, so MapLibre warned from z10.
   - `web/src/main.ts` now registers a **missing-image resolver** (`map.setMissingStyleImageResolver`) before the first style. Every style the map loads uses it, theme switches included.
   - A missing basemap image gets a 1×1 transparent stand-in. The app's hatch pattern, if a full style rebuild ever drops it, gets its real image in the current palette. `HATCH_IMAGE` is now exported from `layers.ts` for this.
   - **Why not a `styleimagemissing` listener, as requested:** in MapLibre 6.11 the event fires just *before* an unconditional `warnOnce`, so a listener can add the image but can't stop the warning. Only the resolver runs early enough. Same result, using the API MapLibre 6 provides for it.
2. **e2e assert:** the dark-load test in `web/tests/e2e/theme.spec.ts`:
   - loads at z11, because Dark Matter only draws its wood pattern from z10;
   - waits for full idle;
   - asserts that `wood-pattern` was resolved and that there are **no console warnings**, plus no errors as before.

   I checked it catches the bug: with the resolver disabled, the test fails.
3. **Release housekeeping:**
   - `web/package.json` and `package-lock.json` at 0.3.0;
   - CHANGELOG entry **0.3.0 (2026-10-15)**;
   - roadmap row moved to Done, "Released as 0.3.0", and the "Next" section is empty again;
   - the dark-theme report updated with this follow-up.

**Still there, as before:** a *light* load logs 3 console warnings from positron's road-shield filters (`["<=", ["get", "ref_length"], 6]` with a null value). They are already on `main` before this release and outside this request. They could be silenced with the same label-patch mechanism if you want.

## Commits

On `feature/dark-theme`, fast-forwarded into `main`. `main` was pushed `e259523..95657c1`, and the branch is pushed too.
- `d75bb60`: Add an automatic dark theme from prefers-color-scheme
- `95657c1`: Resolve missing basemap sprite images; release 0.3.0

The local `feature/dark-theme` branch is deleted; its GitHub copy is kept, as in earlier releases. This report is a docs-only commit on `main`, after the tag.

## Tests

| Run | pytest | Vitest | e2e |
|---|---|---|---|
| On the branch, after the resolver (`npm run test:all`) | 37 passed | 66 passed, link snapshot 0 differences | 51 passed, none flaky |
| `npm run deploy` gate, on `main` | 37 passed | 66 passed | 51 passed, none flaky |
| Against production (`E2E_BASE_URL=https://pnct.singledev.eu/`) | n/a | n/a | **51 passed**, none flaky |
| `theme.spec.ts` alone against production, no retries | n/a | n/a | 5 passed |

## Production check

- **Bundle:** https://pnct.singledev.eu serves `assets/index-Bp7cN8Ol.js`, byte-identical to the local build (`cmp`). Right after the deploy, one `curl` still got the 0.2.3 bundle (propagation lag); a few seconds later both the custom domain and `540bed25.pnct-map.pages.dev` served the new one. The theme specs were then rerun against production.
- **Meta tags live:** `color-scheme: light dark`, plus `theme-color` `#0f8a7e` (light) and `#0c0c0c` (dark).
- **Light** (Playwright `colorScheme: 'light'`): the positron style is requested and the dark one is not; light palette and background.
- **Dark** (`colorScheme: 'dark'`): the dark style is the first and only style request; all 7 app layers are present; dark palette; Dark Matter background `rgb(12,12,12)`; dark UI; **no console warnings or errors**.
- **Live switch on production:** light → dark → light keeps the camera, selection, focus filter, layers, panel and hash. At the country view, the concelho level and min zoom are kept.

## Links

- Release: https://github.com/singledev-eu/pnct-map/releases/tag/v0.3.0
- Deployment: https://540bed25.pnct-map.pages.dev
- Site: https://pnct.singledev.eu
