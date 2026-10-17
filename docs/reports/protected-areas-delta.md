# Protected areas: delta after review (0.4.0)

Branch `feat/protected-areas`, 2026-10-17. Still not merged, pushed, tagged or deployed: waiting for your final OK.

## What changed

- **Decisions 1–4 kept as they were:**
  - RNAP stays on, credited as "reuse terms not confirmed";
  - Natura stays on EEA end-2024;
  - overlays stay clipped to land;
  - the PNCT split for focus mode stays.

  No code change was needed.
- **RNAP tint (5):** 8% in the light theme, still 16% in dark, with the solid outline in both. The tint is now a palette value (`rnapTint`) mirrored by the CSS token `--map-rnap-tint`; Vitest checks they match.
  - **Result:** RNAP-only areas over the PNCT teal now read as teal with an orange outline, no longer brown. In the Gerês phone view the RNAP tint barely shows under the selection.
  - **What still looks darker:** at country zoom, where Natura is dense (Serra da Estrela, Montesinho, Douro Internacional), the darkening now comes from the violet Natura hatch, not from RNAP.
  - **Proposed, not done:** fade the Natura hatch below the parish level (e.g. 60% opacity at country zoom, full at parish zoom, using the same cross-fade as the fills). Say if you want it.
- **Small shares (6):** a share above 0 and below 0.5% shows as "<0.5%" in the summary, e.g. Cabanelas: "Under protection: <0.5% (RNAP <0.5%, Natura 0%)". `protection.json` and the summary's `data-*` attributes keep the exact value (0.4). The threshold is `SMALL_SHARE` in `strings.ts`.
- **Merged Natura names (7):** a Natura name listed twice (once as a ZPE, once as a ZEC/SIC) is now one line, "<name> · ZPE + ZEC", at the position of its first entry. For example, Parque das Nações shows "Estuário do Tejo · ZPE + ZEC". RNAP entries and different names are unchanged. The logic is `panelAreas()` in `protected.ts`.
- **Toggle loading state (8):** on the first switch-on, the toggle row shows a small spinner and "Loading…" (`role="status"`, `aria-busy` on the row) until the overlay is in the map. It clears afterwards, and later switch-ons don't show it. The spinner stops under `prefers-reduced-motion`. A failed load clears it too.
- All new strings (`naturaBoth`, `toggleLoading`) are in `web/src/strings.ts`.
- CHANGELOG 0.4.0 and the main report are updated.

## Before / after screenshots

The before shots are at the old 16% RNAP tint, the after shots at 8%.

- `.artifacts/protected-delta/before-desktop-light-country.png`
- `.artifacts/protected-delta/after-desktop-light-country.png`
- `.artifacts/protected-delta/before-phone-light-geres-parish.png`
- `.artifacts/protected-delta/after-phone-light-geres-parish.png`

The full set of 28 shots (light and dark, desktop and phone) is regenerated in `.artifacts/protected-shots/`.

## Tests (full suite green)

| Suite | Before review | Now |
|---|---|---|
| pytest | 72 passed | 72 passed |
| Vitest | 79 passed | 83 passed (+ "<0.5%" formatting, 2 × `panelAreas` merging, RNAP tint token) |
| Playwright e2e | 62 passed | 63 passed, 0 flaky (+ loading state appears and clears, held with a delayed route; the panel test also checks "<0.5%" and the merged "Estuário do Tejo · ZPE + ZEC") |

Link snapshot unchanged (0 differences).

## After your final OK

1. Fast-forward `feat/protected-areas` into `main` and push.
2. `npm run deploy:preview`, then your phone check.
3. `npm run deploy`.
4. Tag `v0.4.0`, and create a GitHub release from the CHANGELOG, marked Latest. The CHANGELOG date gets set on release.
