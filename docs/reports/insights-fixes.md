# PNCT Insights: pre-publication fixes (PR #4)

Follow-up on `feat/insights`. The verified figures are unchanged: 20 split concelhos, and Sernancelhe at 245 €/m².

## What changed

1. **20 vs 21 split concelhos.** The cause is found and recorded in `concelhos_split.assumptions` (and in a comment in `catalog/territory.py`). A test keeps it true.
2. **Coastline wording.** The captions of `closest_to_coast`, `coastal_pnct_parishes` and `cheapest_coastal_pnct` now say "coastline incl. estuaries and lagoons" / "linha de costa, incl. estuários e lagoas". The footnotes and assumptions say the same (PT "rias" → "lagoas"). **No sea-only variant:** CAOP's boundary segments have only *Limite e Linha de Costa* / *Limite em Terra* / *Limite na Água*, with no attribute that separates the open-sea shore from estuary and lagoon shores. A sea-only line would need another dataset or a hand-drawn cut, and that would be a judgement call.
3. **Sernancelhe.** `prepare` now ranks INE's 2025 €/m² across **all 308 municipalities**, islands included, and records the minimum in `national.json`. Sernancelhe (245 €/m²) is the unique lowest of the **305 with a value**. INE publishes none for Corvo, Lajes das Flores and Santa Cruz das Flores. The caption adds "That is the lowest of any municipality in Portugal in 2025" / "É o valor mais baixo de todos os municípios do país em 2025", and the footnote gives the 305-of-308 caveat. The claim is generated only when the table supports it (unique minimum = the headline concelho).
4. **Pedorido.** Verified: Pedorido, Raiva and Paraíso (CAOP 2025) all map to Census parish 010610, *União das freguesias de Raiva, Pedorido e Paraíso*, the union that CIC Deliberação 20/2018 added to the low-density list. The footnote appears on `closest_to_porto` (it names all three, since all three are in the top 5) and `closest_to_airports` (Pedorido).
5. **One public population share.** The `area_vs_population` caption and card label say "(Census 2021, all PNCT parishes)". `docs/reports/facebook-post.md` has a note: its 18 % is the INE 2025 estimate for the 165 whole-PNCT concelhos. The head counts nearly coincide (1,968,309 vs 1,968,418), which makes them easy to confuse. The note also says that "below 717 €/m²" should read "717 €/m² or less".
6. **Analytics.** Cloudflare Web Analytics is added via `web/analytics.ts`. The token comes from `CF_WEB_ANALYTICS_TOKEN` (env or the gitignored `web/.env.production.local`), never from code. One deferred beacon is injected at build time, with `spa: false`. The CSP allows `static.cloudflareinsights.com` (script) and `cloudflareinsights.com` (connect). There are Vitest tests, and the README has a section "Analytics" with the setup steps. Off by default: builds without the token are unchanged (checked: 0 occurrences in `dist/index.html`). The TODO for `most_viewed_parishes` is in `insights/catalog/usage.py`.
7. All 25 cards are re-rendered, and `INDEX.md` is regenerated. Full suite: pytest 221, Vitest 260, e2e 182, no flaky tests.

## 20 vs 21: the explanation

The official annexes, **Portaria 208/2017** (73 parishes) and **CIC Deliberação 20/2018** (+ União das Freguesias da Raiva, Pedorido e Paraíso = 74), list 74 parishes in 21 municipalities that are not low-density as a whole (2013 geography). I counted the Deliberação's annex programmatically: 21 municipalities, 74 parishes.

The **IEFP list of 2026-02-04**, which the map uses, has **no line for two of them**. I checked the PDF's raw text as well as our parse, so this isn't a parsing loss:

- **Dem (Caminha)**, CAOP 160209. Caminha still has two listed parishes (Arga and Gondar e Orbacém), so it stays a split concelho.
- **São Bento (Porto de Mós)**, CAOP 101610. It is the only listed parish in Porto de Mós, so **Porto de Mós drops out**: 21 − 1 = **20**.

The other 72 official entries are 72 Census 2021 parishes. They are **83 parishes today** after the 2025 de-aggregation (+11): three unions split in three (Belazaima/Castanheira/Agadão, Raiva/Pedorido/Paraíso, Querença/Tôr/Benafim), three split in two (Serra e Junceira, Matas e Cercal, Rio de Couros e Casal dos Bernardos), and the Associação de freguesias do Vale do Neiva is now Gaifar, Sandiães and Vilar das Almas. Every name matched, apart from spelling (the Deliberação's "Gondomil e Safins" is CAOP's "Gondomil e Sanfins").

**Not added**, as asked. The map shows Dem and São Bento as non-PNCT because the IEFP list does. Whether IEFP left them out on purpose or by mistake is something only IEFP can answer.

## What I couldn't verify

- **Why IEFP left out Dem and São Bento.** Nothing in the PDF explains it. If they should be PNCT, the map, the shapes and the insights all change. That would go through `data/overrides.csv` with your decision and a source.
- **The Portaria's annex itself is a scanned image** in both the Portal das Finanças copy and the DR original. I read the parish list from CCA's transcription of the Portaria and from the CIC Deliberação PDF (COMPETE 2020), and they agree, including São Bento and Dem. The "73" comes from the Portaria's own preamble text.
- **UTM tracking:** Cloudflare Web Analytics **doesn't record query strings** (its FAQ: UTM parameters "not yet" supported), and it doesn't follow hash routes. So once enabled, it shows Facebook traffic through the referrer, but not per insight (`utm_content`) and not per parish. Per-insight attribution would need, for example, distinct landing paths (`/i/<id>`, which the beacon records as a path) or a small Pages Function that logs events. I didn't build either: that's a decision for you.
- **The site token format:** the dashboard snippet uses 32 hex characters as far as I know. The build accepts any plain token of 16–128 letters, digits, `-` and `_`, so an unexpected format can't block a deploy.
- **Analytics is not live:** there's no token in the repo, and I didn't deploy. Enabling it takes a token and a deploy.
