# 07: Concelho card v2, data investigation (+ the fields that qualify)

**Status:** done (3 fields implemented; 3 report-only, IMI blocked: needs Mike) · **Branch:** `task/07-concelho-card-v2` (from main) · **Preview:** https://task-07-concelho-card-v2.pnct-map.pages.dev

## The candidates

Coverage was measured live on 2026-11-02: latest period, values for the 278 mainland municipalities. Probe output: `docs/reports/night/07-ine-probe.json`.

| Candidate | Source / code | Licence | Frequency | Coverage (of 278) | Format / fetch | Verdict |
|---|---|---|---|---|---|---|
| **Median sale €/m²** (all dwellings) | INE 0012255, "Valor mediano das vendas de alojamentos familiares (Metodologia 2022)", NUTS 2024, Dim3 = H1 Total | CC BY 4.0 | annual (latest 2025); quarterly 12-month series 0012234 | **278** (annual); 277 (quarterly) | INE JSON API (`fetch_ine.py`) | **Implemented** (annual) |
| Median rent €/m², new leases | INE 0012600 (Metodologia 2021, annual, 2024); 0014698 (Metodologia 2026, annual, 2025) | CC BY 4.0 | annual / semestral / quarterly | **200** (2021 series); **233** (2026 series) | INE JSON API | Not implemented: 45–78 concelhos are confidential (few contracts), mostly exactly the small PNCT ones. "—" for a quarter of the card isn't useful. Revisit if INE widens coverage, or show it only where present (a decision). |
| IMI rate | Autoridade Tributária, Portal das Finanças ("Taxas IMI") | No open licence stated by AT. The only machine-readable copy is a **third-party** dataset on dados.gov.pt ("Flat In Portugal", CC BY, published 2026-10-01) that republishes AT's table | annual | 300 of 308 municipalities have a single rate; **8 set it per parish** | CSV (third party) or AT portal (no API; scraping not allowed) | **blocked: needs Mike**: licence/provenance (third-party republication of AT data) and the per-parish rates |
| **IRS gross income per taxpayer** | INE 0012748, "Rendimento bruto declarado por sujeito passivo" (AT data via INE), NUTS 2024 | CC BY 4.0 | annual (latest 2024) | **278** | INE JSON API | **Implemented** |
| **Average monthly earnings** (Quadros de Pessoal) | INE 0012656, "Ganho médio mensal" (MTSSS/GEP, Quadros de Pessoal), NUTS 2024 | CC BY 4.0 | annual (latest 2024) | **278** | INE JSON API | **Implemented** (one line) |
| Junta de freguesia contacts | No national open dataset (dados.gov.pt: nothing). DGAL's Portal Autárquico lists entities (no stated reuse licence); ANAFRE has a member directory (no licence) | — | — | — | would be per-site curation like the câmaras | Not implemented: a curation project (3,049 parishes; ~400 PNCT ones first), same rules as `camaras.csv` (generic contacts only) |

INE codes and licences were found through the dados.gov.pt API, which lists every INE indicator with its API link and `cc-by` licence.

## What's implemented

- **Pipeline:**
  - `concelhos_config.py`: three queries with a new `period="latest"` (each indicator's own UltimoPeriodo);
  - `fetch_ine.py` resolves it;
  - `build_concelhos.py` adds `sale_price_m2`, `income_per_taxpayer` and `monthly_earnings` per DICO, Portugal's value in `national`, `periods`, and per-field meta (source, INE code, URL, as_of, licence, INE update date).
  - **The build fails if any of the 278 concelhos lacks a value** (these fields are in the card only because coverage is complete).
- **Card** (`concelho.ts`): a "Housing and income" / "Habitação e rendimentos" section between Population and Câmara:
  - "€1,042/m² median price of homes sold (2025; Portugal: €…/m²)"
  - "€14,388 gross income declared per taxpayer (IRS, 2024; Portugal: €…)"
  - "€1,258 average monthly earnings of employees (2024; Portugal: €…)"
  - Source line: "INE, housing prices 2025, local income statistics 2024, MTSSS/GEP Quadros de Pessoal 2024 · CC BY 4.0".
  - Whole euros in the UI locale. A missing value shows "— (not available)" (no invented values). An old data file without the fields simply omits the section.

## Result

- **Values:** Coruche €1,326/m² (Portugal €2,076/m², matching INE's published 2025 figure), €14,637 per taxpayer (Portugal €17,063), €1,300/month (Portugal €1,576).
- **Refetch:** none of the existing fields changed in value.
- **Size:** `web/data/concelhos.json` grows 100 → 123 KB raw, 19.8 KB gzipped (lazy). The raw budget is raised to 140 KB; the gzip budget stays at 30 KB.
- **Screenshots:** `.artifacts/night07-card-{light-en,dark-pt}.png`.

## Tests

- pytest **118**: 3 new tests (coverage and sane range for every concelho, meta and periods); the period and budget checks updated.
- Vitest **148**: fields, Portugal values and periods; EN/PT wording.
- e2e **140**: the card shows the three lines with the period and Portugal's value; "— (not available)" when null; the i18n spec checks the new heading in PT/EN.

None flaky.

## Decisions for Mike

1. **Rents:** leave out (implemented), or show them where INE publishes them (233 of 278 with the 2026 series) with "—" elsewhere.
2. **IMI:** use the third-party CSV (CC BY, but a private republication of AT's table), ask AT, or skip. And how to show the 8 per-parish municipalities.
3. **Junta contacts:** start a curation pass for the PNCT parishes (like `camaras.csv`)?
4. Wording: "median price of homes sold" (INE: "valor mediano das vendas de alojamentos familiares") and "gross income declared per taxpayer". Both carry the period and Portugal's value; say if you'd rather have a short ⓘ explainer like the ageing index's.
