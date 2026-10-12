# pnct-map — Phase 3 report (property-search links)

All checks pass: **pytest 34/34**, **Vitest 20/20**, **Playwright 8/8**, and `tsc` is clean. Nothing ever requested idealista.pt; the e2e tests read link `href`s but never follow them. Commits are local only, with no push or deploy.

## Shapes (`scripts/build_shapes.py` → `web/public/data/shapes.json`, part of `make all`)
- **Size:** **582 KB raw, 352 KB gzipped**, for 1,861 PNCT parishes. It loads only when the first PNCT panel opens.
- **Source:** full-resolution CAOP 2025 (EPSG:3763). Simplification runs in metres, then the ring is projected to EPSG:4326, rounded to 1e-5 and polyline-encoded.
- **Methods:**
  - **single:** 1,847
  - **largest:** 9 (Aljezur's 4 coastal parishes, Sagres, Vila do Bispo e Raposeira, Castelo Branco, and 2 in Soure)
  - **hull:** 5, flagged approximate
- **Change to your rule:** the 5% test applies to each minor part, so dropping parts can still lose more than 5% in total. Vila Fernando (Guarda) had a 4.9% second part, and "largest" gave 0.941 coverage, which failed the gate. I added a fallback: if "largest" leaves coverage below 0.95, the parish uses the hull instead. That is why Vila Fernando is a hull.
- **Vertex count per ring** (cap 60):
  | Points | Parishes |
  |---|---|
  | 60 (at the cap) | 294 |
  | 56–59 | 1,053 |
  | 51–55 | 437 |
  | 41–50 | 61 |
  | 31–40 | 9 |
  | 21–30 | 6 |
  | 15 or fewer | 1 |

  The median is 57. Simplification uses a growing tolerance, so most rings end just under the cap.
- **Coverage** (shape ∩ parish ÷ parish): minimum **0.957**, median 0.995. The worst is Santa Cruz (Almodôvar), then Corujeira e Trinta (Guarda) at 0.963 and Vilarinho dos Freires (Peso da Régua) at 0.964.
- **Worst overreach:**
  - **Hull parishes**, by area added outside the parish:
    | Parish | Extra area | % of parish area |
    |---|---|---|
    | Vila Fernando | 17.1 km² | 105% |
    | Belmonte | 25.2 km² | 81% |
    | Cerdeira e Moura da Serra | 13.7 km² | 74% |
    | Vila Ruiva | 13.6 km² | 68% |
    | São Gens | 9.5 km² | 64% |
  - **Non-hull parishes:** the worst is Vilarinho dos Freires at 5.3% (0.42 km²). The 95th percentile is 1.6%.
- **Per-parish metrics:** `data/processed/shapes_quality.csv` (method, points, tolerance, parts, coverage, overreach in km² and as a ratio).

## Fixtures (both languages, byte for byte)
| Fixture | Python (`tests/test_shapes.py`) | TypeScript (`src/idealista.test.ts`) |
|---|---|---|
| 1: decodes to the 5 points and re-encodes | pass | pass |
| 2: the 28-point ring round-trips | pass | pass |
| 3: all 5 full URLs, exact | pass | pass |

- **Escaping:** `encodeURIComponent` plus `( ) ~ ! * '`, which reproduces the captured `%28 %29 %7E` escapes. `_` stays unescaped, as in fixture 2.
- **Rounding:** Python uses `floor(x*1e5 + 0.5)` to match JS `Math.round`. Python's built-in `round()` is banker's rounding.
- **Cross-check:** `src/shapes.test.ts` decodes every Python-encoded shape in `shapes.json` with the TypeScript codec and re-encodes it. All 1,861 match byte for byte, are closed, and are within the cap.
- **Other Python tests:** every PNCT parish has a shape; every ring is valid, simple, closed, has the stated number of unique points, and is at most 60; each ring lies inside the parish's bounding box; `approx` is set exactly when method is hull; coverage is at least 0.95.

## Web
- **`src/idealista.ts`:** the encoder, decoder and URL builders.
- **`src/links.ts`:**
  - `getLinks(parish, concelho, options)` is async, because it lazy-loads `shapes.json` and caches it. A failed fetch is retried on the next panel open. Each link is `{label, url, description?, note?}`.
  - Every PNCT parish gets "Search this parish on Idealista" (the polygon URL). Hull parishes add the note "Approximate area: this parish has detached parts."
  - The concelho list-view link appears only when the whole concelho is PNCT. It shows on parish panels and on the concelho panel.
  - Non-PNCT parishes get no links, only a sentence saying the parish isn't in the PNCT list.
- **Selector:** Comprar/Arrendar and Terrenos/Casas/Prédios as segmented radios, plus Urbano/Urbanizável/Não urbanizável checkboxes shown only for Terrenos.
  - Persisted in the hash (`op`, `t`, `land`, non-defaults only, e.g. `#f=130740&op=arrendar&t=casas`) and in localStorage, with try/catch around storage.
  - Load order: hash, then localStorage, then defaults. Changes update the links in place.
- **Links:** they open with `target=_blank rel="noopener noreferrer"`, followed by the footer "Links open idealista.pt in a new tab. This site isn't affiliated with Idealista."
- **Phase 2 fixes:**
  - Fully PNCT concelhos say "All N parishes are PNCT." with a collapsed "Show all" list.
  - The mobile bottom sheet has a credit line ("Boundaries CAOP 2025 © DGT, CC BY 4.0 · OpenFreeMap / © OpenStreetMap"). It wraps rather than truncates.
- **Size:** `dist/` is 4.3 MB raw, of which shapes.json is 0.58 MB. The JS bundle grew by 5 KB.

## E2E (`web/tests/e2e/smoke.spec.ts`) — 8/8 passed
- **New test for 130740:**
  - Exactly one link appears (Marco de Canaveses is a partial concelho), with `target=_blank` and `rel="noopener noreferrer"`.
  - The href starts with `/areas/comprar-terrenos/mapa-google?shape=%28%28`, and its shape decodes to a closed ring inside 130740's full-resolution bounding box.
  - Ticking Urbanizável adds `/com-terreno-urbanizavel`.
  - Switching to Arrendar + Casas hides the land filters and gives `/areas/arrendar-casas/mapa-google` with the same shape. The URL gets `op=arrendar&t=casas`, and the choice survives a reload.
- **New test for Arouca:**
  - Alvarenga, in all-PNCT Arouca, shows 2 links. The second is exactly `https://www.idealista.pt/comprar-terrenos/arouca/mapa-google`.
  - The Arouca panel shows "All N parishes are PNCT." with the list collapsed until "Show all", plus 1 link.
  - Ajuda (Lisboa) shows no links, only the "isn't in the PNCT list" line.
- **Mobile:** the sheet's credit line is visible.
- The earlier tests still pass, and the screenshots in `docs/screenshots/` were regenerated.

## Manual verification: `docs/link-samples.md`
Regenerate it with `uv run python scripts/link_samples.py`. It contains:
- **0. Control:** the fixture-1 URL rebuilt by our encoder.
- **1. Vertex limit:** Vaqueiros (Alcoutim, 080205), the most detailed PNCT parish at the cap (15,980 full-resolution vertices). Links at 60, 96 and 149 points, where the 100 and 150 caps were asked for.
- **2. Hull:** Vila Fernando, with the worst overreach.
- **3. "Não urbanizável" only:** Nogueira (Bragança), plus an unfiltered link for comparison.
- **4. Municipality slugs:** Castanheira de Pêra, Vila Nova de Cerveira and São João da Pesqueira, plus Vila Nova de Cerveira with the land filter in the guessed position.
- **5. Arrendar + terrenos.**

**Things I'm unsure of**, so please check them by hand:
- **Vertex limit:** Idealista's real maximum is unknown. Section 1 tests 60, 96 and 149 points.
- **Filter slug:** `terreno-nao-urbanizavel` is inferred.
- **Municipality URLs:** the slug rule and the filter position in that URL form are both guessed. Idealista may add a disambiguating suffix for some names.
- **Rentals:** whether Idealista supports arrendar + terrenos.
- **Hull overreach:** the 5 hull parishes take in a lot of land outside the parish. One alternative is to link to each part separately, since Idealista accepts only one shape per search.

## Delegated to kiro-cli
**Task:** the TypeScript port, `web/src/idealista.ts` and `idealista.test.ts`.
- **Spec:** exact API names, the Python reference to port, all three fixtures, and a two-file allowlist.
- **Result:** Kiro stayed in scope, made no network calls, and all 18 of its tests passed.
- **Review:** I checked the rounding parity (including negative half-way values) and the zigzag decode. **No fixes were needed.**
- **What I added:** the cross-language test over all of `shapes.json`. I used a Vite `?raw` import for it so the app doesn't need `@types/node`.

**Done by me:** the Python codec, shapes builder, pytest suite, prefs/hash state, links, panel and selector UI, styles, e2e changes, link samples and docs.

## Open questions
1. **Vertex cap:** after you check the samples, what limit should `MAX_VERTICES` use? Going up to around 100 would mainly benefit the 294 rings at the cap.
2. **Hull parishes:** OK to keep the hull for these 5, or should they show one link per part?
3. **Slugs:** if the municipality slug or `nao-urbanizavel` filter turns out wrong, send me the real URL and I'll update both encoders and the fixtures.
4. **Concelho fallback:** should partial concelhos get any concelho-level link? I've left it off for now, as specified.
5. **Default land filter:** is "Terrenos, no land filter" the right default, or should Urbanizável be pre-ticked?
