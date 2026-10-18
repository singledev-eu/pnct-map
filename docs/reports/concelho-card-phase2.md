# Concelho card: phase 2 (build), 0.5.0 release candidate

2026-10-18. Branch `feat/concelho-card` (not merged, not tagged, not pushed).

- **Preview:** https://preview.pnct-map.pages.dev (this deploy: https://ebbc81ae.pnct-map.pages.dev). Production is unchanged (0.4.1).
- Interim reports: [UI checkpoint](concelho-card-ui.md), [sheet fixes and ageing ratio](concelho-card-sheet.md).

## What changed, file by file

### Pipeline (Python)

| File | Change |
|---|---|
| `scripts/concelhos_config.py` | New. INE indicators (0012917 population, 0012909 ageing index, 0011609 Censuses 2011/2021), estimate year (latest, 2021+ only), series-note guard, output paths, SNIT and issues URLs. |
| `scripts/fetch_ine.py` | New. INE JSON API fetch with retries, into the gitignored `data/external/ine/`, plus `fetch.json` (URL, period, INE update date, fetch time). Refuses estimates before 2021, or if INE's note on administrative estimates disappears. |
| `scripts/build_concelhos.py` | New. Joins INE, the CAOP 2025 area and the contacts CSV into `data/concelhos.json` (with the curators' notes) and `web/data/concelhos.json` (96 KB raw, 16 KB gzipped), with per-field meta. The census change is census to census. Missing values are null. |
| `scripts/validate_contacts.py` | New. Offline checks (CAOP names, generic institutional mailbox, `+351` phone, https URLs, ISO date) and `--online`. Errors: free-mail domains, personal-looking mailboxes. Warnings: off-domain links or mailboxes, an incomplete TLS chain, an empty `pdm_url`. |
| `scripts/contacts_candidates.py` | New. Per concelho: finds the câmara site and collects mailboxes, phones and urbanism/PDM links (including the JavaScript platform's `/mapadosite`) for the reviewer. |
| `scripts/explore_ine.py` | Removed (superseded by `fetch_ine.py`). |
| `Makefile` | `concelhos-fetch`, `concelhos`; part of `all`, `web` and `e2e`. |
| `data/contacts/camaras.csv` | 185 curated rows (see below). |
| `data/concelhos.json`, `web/data/concelhos.json` | Built outputs, committed. |
| `data/ATTRIBUTION.md` | INE (CC BY 4.0) and the câmara websites. |
| `tests/test_concelhos.py` | New, 36 tests: coverage of the 278 concelhos and the 185 PNCT ones, value ranges, mainland sums, census-to-census change, CAOP density, series guard, parsing, contacts validation, web file shape and size budget. |

### Web app

| File | Change |
|---|---|
| `web/src/concelho.ts` | New. `concelhoCard` (concelho panel) and `concelhoDetails` (collapsed section of the parish panel, rendered and fetched on first open).<br>**Population block:** people; census change; density; ageing ratio "4.2 older people (65+) per child (Portugal: 1.9)", with the index in an ⓘ; "Figures for the whole concelho" when partly PNCT.<br>**Câmara block:** website shown as its domain; email; phone; Urbanism; PDM in force (or "— No … page found"); "Official PDM maps: SNIT (DGT)"; "Report outdated info" (pre-filled issue, label `data`); "Câmara contacts: not yet available" when not curated. |
| `web/src/sheet.ts` | New. Phone sheet drag handle: snap to half / ~90vh, drag down to close, keyboard toggle, reduced motion. |
| `web/src/panel.ts` | Wires both card forms. Sheet handle, © credits toggle (the three-line credit footer collapses behind it). |
| `web/src/strings.ts` | `tc` (concelho card) and `sheet` strings, PT/EN-ready. |
| `web/src/style.css` | Card, handle, snap heights, © toggle, reduced-motion rules. Existing tokens only. |
| `web/src/protected.ts` | `cachedJson` exported (shared lazy loader). |
| `web/src/concelho.test.ts` | New. Data shape, `signedPct`, `domainOf`, ageing ratio (including below 1), issue URL. |
| `web/tests/e2e/concelho-card.spec.ts` | New. Card, lazy fetch only on open, not-yet state, partly-PNCT note, missing values, issue URL, both themes, 375 px phone. |
| `web/tests/e2e/bottom-sheet.spec.ts` | New. CDP touch drags at 375 px, header drag, snap back, ×, keyboard, reduced motion, © credits, desktop unchanged. |
| `mobile-attribution`, `smoke` and `protected-areas` specs | Tap the © before checking the sheet credit. |
| `web/scripts/concelho_shots.mjs` | New review screenshots. `settled.mjs` also waits for a loading card. |
| `web/package.json` | 0.5.0. |
| `CHANGELOG.md`, `docs/ROADMAP.md` | 0.5.0 entry (unreleased); "Next" points at the preview. |

## Curation

185 rows, one for every concelho with a PNCT parish:

- **Who wrote them:** the 10-row phase 1 sample by hand, plus 7 batches of 25 by kiro-cli. Each kiro spec allowed only `data/contacts/camaras.csv` to change. Batches 6 and 7 ran in parallel, in their own git worktrees, and were merged row by row.
- **Review:** every PDM link checked against the live page or the Diário da República notice text, from batch 2 on (batch 1 re-checked in full afterwards), and ~20% of the other fields spot-checked on the live sites. Each batch commit message carries its stats and the validator output.

| Batch | kiro rows | PDM links checked | PDM confirmed | Changed in review | Spot-checks |
|---|---|---|---|---|---|
| 1 | 25 | 25 | 23 | 2 PDM: Póvoa de Lanhoso, Amares | 5: 4 ok, 1 corrected (Póvoa) |
| 2 | 25 | 25 | 21 | 3 PDM: Sertã, Mirandela, Covilhã; 2 mailboxes: Vimioso, Penamacor | 5: 2 ok, 3 corrected |
| 3 | 25 | 25 | 21 | 3 PDM: Borba, Estremoz, Mourão (emptied) | 5/5 ok |
| 4 | 25 | 24 + 1 empty | 22 | 1 PDM: Trancoso | 5/5 ok |
| 5 | 25 | 25 | 22 | 0 | 5/5 ok |
| 6 | 25 | 25 | 21 | 0 | 5/5 ok |
| 7 | 25 | 25 | 17 | 4 PDM: Cinfães; São João da Pesqueira, São Pedro do Sul (filled); Castro Daire (emptied) | 5/5 ok |

- **Totals:** kiro filled 175 rows; the review changed 15 of them (13 PDM links, 2 mailboxes) and annotated many more.
- **What slipped through:**
  - revision-only or consultation pages (Póvoa de Lanhoso, Mirandela, Borba, Cinfães);
  - câmara pages still showing a superseded plan (Amares, Borba, Trancoso);
  - mailboxes swapped to get past the validator (Vimioso, Penamacor; the heuristic was fixed and the spec now forbids swapping).
- **My own error:** in the batch 1–2 re-check I "corrected" Mogadouro to Aviso 3299/2024, which the site labels "1ª Revisão". Reading the notice showed it only starts the revision, so I reverted the row. Every other notice-based correction was then re-read from the notice text, and the spec now says to read the notice, not the page label.
- **Official copies:** 9 `pdm_url`s are DGT's SNIT copy of the Diário da República notice of the plan in force, used where the câmara's page was outdated or revision-only. Each copy was opened and its summary line checked against the right municipality.

### No urbanism page (23)

`urbanism_url` empty; the card says "— No urbanism page found on the câmara's site":

> Alvito, Póvoa de Lanhoso, Freixo de Espada à Cinta, Belmonte, Covilhã, Fundão, Vila de Rei, Oliveira do Hospital, Pampilhosa da Serra, Guarda, Manteigas, Mêda, Pinhel, Castanheira de Pêra, Arronches, Elvas, Vila Nova da Barquinha, Alcácer do Sal, Monção, Mesão Frio, Mondim de Basto, Sátão, Vouzela.

### No PDM page or publication found (3)

Mourão, Aguiar da Beira and Castro Daire. `pdm_url` is empty; the card says "— No PDM page found on the câmara's site" above the SNIT line.

### PDM unclear (24)

The link holds the PDM documents, but the version in force isn't stated, or it's a viewer only. Kept, with a "CHECK"/"PDM re-check" note in the CSV:

> Marvão, Cuba, Vieira do Minho, Torre de Moncorvo, Penamacor, Sertã, Miranda do Corvo, Aljezur, Tavira, Almeida, Figueira de Castelo Rodrigo, Gouveia, Mêda, Pinhel, Crato, Abrantes, Mação, Monção, Montalegre, Viana do Castelo, Paredes de Coura, Penedono, Tondela, Vouzela.

### Validator

- **Offline:** 185 rows, **0 problems**, 32 warnings. All warnings are intended:
  - off-domain PDM links (SNIT copies, municipal geoportals or PDM sites, the CIM viewer);
  - mailboxes on another of the câmara's domains (Amares, Póvoa de Lanhoso, Viseu…) or the ISP domain the câmara publishes (Castelo de Vide, Monforte);
  - 3 empty `pdm_url`s.
- **Online:** see the end of this report.

## Tests

`npm run deploy:preview` for this build, all green, 0 flaky:

| Suite | Passed |
|---|---|
| pytest | 108 (36 in `test_concelhos.py`) |
| Vitest | 95 |
| Playwright | 86 (10 concelho card, 6 bottom sheet) |

The link snapshot is unchanged.

## What to check on the phone

1. **Concelho card** at country zoom, curated:
   - https://preview.pnct-map.pages.dev/#c=0505 (Idanha-a-Nova)
   - https://preview.pnct-map.pages.dev/#c=0708 (Mourão, "No PDM page")
   - https://preview.pnct-map.pages.dev/#c=1106 (Lisboa, "not yet available")
2. **Parish section:** https://preview.pnct-map.pages.dev/#f=050505. "Concelho: Idanha-a-Nova" opens on tap.
3. **Links:** the website shows its domain. `tel:` and `mailto:` open the phone and mail apps. "Report outdated info" opens a pre-filled GitHub issue.
4. **Sheet:**
   - drag up and down;
   - the © shows the credits;
   - Reduce Motion makes snaps instant.
5. **A few concelhos you know:** check that the PDM link really is the plan in force.

## Online validation (all 185 rows)

`uv run python scripts/validate_contacts.py --online` checked every website, urbanism, PDM and source URL (about 740).

- **Problems:** 1. Santarém's `source_url` (`https://www.cm-santarem.pt/`) returned HTTP 500 during the run; re-tested twice afterwards, it answers 200, so it was transient. No dead links.
- **Warnings:** 46 rows.
  - The offline ones above.
  - **80 URLs that load only without TLS verification**, i.e. an incomplete certificate chain on the server. Browsers and curl load them. These include DGT's own `snit-mais.dgterritorio.gov.pt`, which accounts for most of the SNIT copies in the list, and câmara sites such as Serpa, Fronteira, Grândola, Viana do Castelo and Santarém's PDM pages.
  - Per your decision, these are warnings, and the URLs are kept.
