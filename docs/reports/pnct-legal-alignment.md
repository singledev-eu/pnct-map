# PNCT map: legal definition, disputed parishes, insight landing paths (PR #4)

Branch `feat/insights`, not deployed. The map's definition of PNCT is now the **legal one**: the annex of Portaria 208/2017 plus verified amendments. None were found. Where the legal text and the IEFP list disagree, the parish is **disputed**: it gets its own style, it's never shown or counted as PNCT, and no insight names it.

## 1. Legal research (step 1)

Record: `data/sources/pnct-legal-status.md`.

- **No amendment or rectification of Portaria 208/2017 was found.**
  - The Portal das Finanças entry says "Estado: vigente" and "Histórico de alterações: -".
  - The AT *Guia Fiscal do Interior* (March 2023) still points only to the "Anexo da Portaria n.º 208/2017".
  - Searches of DRE content returned only the original act (and an unrelated homonym of 4 August 2017).
- **Read from the official DR PDF** (1.ª série n.º 134, pp. 3731–3734, text annex, SHA-256 recorded):
  - For Castelo de Paiva, the annex lists **only "Real"**.
  - **Dem** (Caminha) and **São Bento** (Porto de Mós) **are listed**.
  - The preamble gives "165 municípios e 73 freguesias".
- **CIC Deliberação 20/2018** (12 Sep 2018) added the União das Freguesias da Raiva, Pedorido e Paraíso to the **low-density list** for EU funds (Portugal 2020). No act carrying that change into the Portaria was found.
- **Everything else agrees.** The Portaria's 165 whole municipalities are exactly the IEFP list's 165 (Almeida checked in the DR original; CCA's transcription omits it). All other parish entries match.
- **Unresolved by design:** DRE's consolidated page renders with JavaScript and couldn't be read, and dre.tretas.org answered 403. So the finding is "no amendment found in the reachable sources", not a certified "none". The enquiry draft asks the authorities.

**Sources:**
- [Portaria 208/2017, DR PDF](https://files.diariodarepublica.pt/1s/2017/07/13400/0373103734.pdf)
- [DRE page](https://diariodarepublica.pt/dr/detalhe/portaria/208-2017-107684448)
- [Portal das Finanças copy](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Portaria_208_2017.pdf)
- [CIC Deliberação 20/2018 (COMPETE 2020)](https://www.compete2020.gov.pt/admin/images/Deliberacoes_cic_territ%C3%B3rios_baixa_densidade.pdf)
- [AT Guia Fiscal do Interior 2023](https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/Guias/Documents/Guia_Fiscal_do_Interior.pdf)
- [IEFP list 2026-02-04](https://www.iefp.pt/documents/10181/4287418/Territorios+PNCT_04-02-2026.pdf)

## 2. Final status of each disputed parish

| CAOP 2025 | Parish | Portaria 208/2017 | IEFP 2026-02-04 | Status | `legal_status` |
|---|---|---|---|---|---|
| 160209 | Dem (Caminha) | listed | missing | disputed | pnct |
| 101610 | São Bento (Porto de Mós) | listed | missing | disputed | pnct |
| 010615 | Raiva (Castelo de Paiva) | not listed (only Real) | listed | disputed | not_pnct |
| 010614 | Pedorido (Castelo de Paiva) | not listed | listed | disputed | not_pnct |
| 010613 | Paraíso (Castelo de Paiva) | not listed | listed | disputed | not_pnct |

The counts are now: legal PNCT 1,860 parishes, IEFP 1,861, and **1,858 shown as PNCT on the map** (undisputed).

## What changed

- **Data.**
  - `data/pnct_status.csv` holds the 5 rows: status, legal status, IEFP status, reason, three source URLs and the date checked.
  - `scripts/pnct_status.py` validates it. It checks for unknown or duplicate codes, an IEFP status that no longer matches the list, a status that doesn't follow, a missing reason, and fewer than two sources.
  - `build_geo` sets `pnct` only for undisputed PNCT parishes. `build_topo` writes the bundled `web/data/pnct-status.json`.
  - The topology geometry is unchanged: only Raiva, Pedorido and Paraíso lose `pnct`, and Castelo de Paiva goes from 4 to 1. The protected-area layers were rebuilt and are unchanged.
  - New tests in `tests/test_pnct_status.py`: exactly one status per parish, a reason and ≥2 sources per disputed row, the validator catching mistakes, and the web file matching the CSV.
- **Map.**
  - Disputed parishes get an amber "/" hatch and a dashed outline, in both themes and at every zoom. They're hidden in "Only PNCT" mode, and the outline sits below the 3D slabs.
  - The legend has a "Sources disagree" / "Fontes divergentes" row, plus "Source: Portaria 208/2017 (as amended) · checked 15 November 2026" under it.
  - The tooltip, panel and land check say "Sources disagree: Portaria 208/2017 says X, the IEFP list says Y. Check with Finanças/IEFP before relying on it.", in EN and pt-PT. The panel adds links to all three documents.
  - The concelho panel lists its disputed parishes. The About text now names the Portaria as the definition.
  - **Link snapshot: 0 differences.** Raiva, Pedorido and Paraíso keep their Idealista polygon links, because they have shapes. Dem and São Bento have none.
- **Insights.**
  - Totals and shares use `legal_status`, and each affected card carries the footnote "5 parishes are classified differently by IEFP; see map". That's 8 cards: area vs population, parish count, split concelhos, the two district rankings, density, population change, shrinking parishes. The coastal-parishes card's count is legal, with the same footnote.
  - Rankings, examples and top-5 lists skip disputed parishes (`Data.rank_*`, `Data.same`).
  - `prepare` now fails if any output names a disputed parish, whether by code, "Name (Concelho)" or as a bare value. All 25 ready insights pass.
  - The card source line now cites Portaria 208/2017 instead of the IEFP list.
- **Landing paths.**
  - `web/public/_redirects` has `/i/* /index.html 200`, a rewrite, so the path stays in the address bar. `_headers` gives `/i/*` the same revalidation as `/`.
  - Caption links are `https://pnct.singledev.eu/i/<id>?utm_source=facebook&utm_medium=social&utm_campaign=insights`. Unknown ids load the normal map.
  - The shortlist share link strips `/i/<id>`. There is no area focus: I skipped it to keep this simple.
- **Small fixes.**
  - `vite.config.ts` imports `./analytics.ts`, which removes the `configLoader: 'native'` warning. `tsc` passes.
  - **New:** `npm run test:e2e` builds with `CF_WEB_ANALYTICS_TOKEN=` (empty). Your new `web/.env.production.local` token had put the beacon into the e2e build, and from localhost its reports fail CORS, which the tests count as console errors. The deploy's own build still includes the beacon.
- **Enquiry draft:** `docs/reports/pnct-enquiry-pt.md` has an IEFP email and an e-Balcão variant, in pt-PT, not sent.

## Tests

- **pytest: 228 passed.** That includes the new `tests/test_pnct_status.py`, the updated `test_pipeline.py` (1,858 flagged, Castelo de Paiva 1) and 40 insights tests.
- **Vitest: 260 passed**, link snapshot 0 differences. **`tsc --noEmit` passes.**
- **e2e: 185 tests.** The full run had 184 passed and 1 failed: "About lists every credit in PT" looked for the old link text "lista oficial". The About now links the Portaria plus a "lista PNCT", so the test checks both. Rerun: 13/13 in that spec pass.
- **New e2e:** `disputed-landing.spec.ts` has 3 tests. One checks that the disputed style is rendered on São Bento (hatch + dashed outline, `pnct: false`), the hover tooltip text and the panel note with 3 source links. One checks Castelo de Paiva (only Real counted; disputed parishes named, PT). One checks that `/i/area_vs_population` loads the map with its path kept, and an unknown id too.

## Headline numbers that changed (old → new)

| Insight | Old | New |
|---|---|---|
| `closest_to_porto` | **24 km**, Pedorido (Castelo de Paiva) | **27 km**, São Miguel do Mato (Arouca); next four within 33 km (was 29) |
| `closest_to_airports` (OPO line) | 35 km, Pedorido | 39 km, São Miguel do Mato. The headline (FAO, Tôr, 21 km) is unchanged |
| `concelhos_split` | **20** split, 93 none | **21** split, 92 none (Porto de Mós is split again) |
| `parish_count` | 1,861 / 3,049 | **1,860 / 3,049** (61%) |
| `area_vs_population` | 1,968,418 residents on 68,780 km² | **1,965,270** on **68,777 km²**. The rounded 77% / 20% is unchanged |
| `population_change` | lost 198,705 | **lost 198,357**. −9.2% / +0.1% unchanged |
| `districts_area_share` | Aveiro 26%, Leiria 22% | Aveiro 24%, Leiria 23%. 7/18 is unchanged |
| `districts_population_share` | Aveiro 6% | Aveiro 5%. 7/18 is unchanged |

Unchanged headlines: density 29 vs 388, shrinking 93% vs 69%, all extremes, coast, housing, and concelho change.

The Pedorido CIC footnote (from the previous round) is **removed**: the parish is skipped now, and no Portaria amendment was found.

## Skipped, and why

- **Per-parish naming of the 5 disputed parishes:** skipped everywhere, as asked. Pedorido, Raiva and Paraíso dropped out of the Porto top 5, and Pedorido out of the OPO line.
- **Area focus on `/i/<id>`:** skipped, to keep it simple.
- **Re-checking the Portaria's annex against the DRE consolidated version:** not reachable (JavaScript-rendered page).

## Unverified

- **Whether an amendment exists anyway**, outside what was reachable. The enquiry asks.
- **Pages behaviour of the `_redirects` rewrite.** Not deployed. Locally, `vite preview` serves `/i/<id>` (e2e test). On Pages, `/i/* /index.html 200` is the documented rewrite form, and Pages already serves `index.html` for unknown paths (that's how `/check` works). Verify on a preview deploy: the address bar should keep `/i/area_vs_population`, and the Web Analytics dashboard should show the path.
- **The tax treatment of the disputed parishes:** only AT can answer (the e-Balcão variant). A binding ruling would be the formal route.
