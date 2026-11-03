# 10: Ideas, design notes only (no code)

**Status:** done (write-ups) · **Branch:** `docs/10-ideas` (report only, so no preview)

Effort: S ≤ 1 day, M 2–4 days, L a week or more. Each note covers source + licence, effort, risks and a recommendation.

## 1. Emprego Interior MAIS "What could I get?" calculator

- **What:** pick contract type and household members moving with you, get the support amount, with a link to IEFP's page and the application.
- **Source:** Portaria n.º 174/2020 (amended by Portaria 283/2021 and later). Legislation in the Diário da República is public law: no licence issue, but **no machine-readable source**. The parameters would be transcribed by hand.
- **Rule as found (2020–2022 summaries; not verified for 2026):** 6 × IAS, plus 20% per household member who moves too, with the increase capped at 3 × IAS. IAS 2026 = €537.13 (Portaria n.º 480-A/2025/1). Derived, **unverified**: base ≈ €3,222.78, maximum increase ≈ €1,611.39.
- **Effort:** S (UI + a small parameter file with the legal reference and the IAS year).
- **Risks:** stale or wrong amounts. The rules have changed before (eligibility, contract length, whether the employer must be in the interior). The "no invented values" invariant means **showing only parameters cited to the legal text in force**, with "confirm with IEFP". A yearly IAS update is needed.
- **Recommendation:** do it, as a simple formula display ("6 × IAS + 20% per family member, max …") with the legal citation and an "as of" date, after checking the current Portaria and IEFP's ficha síntese by hand. Not a personalised "you will get €X".

## 2. "Ask the câmara" message templates (concelho card)

- **What:** 3–4 prefilled `mailto:` templates in PT (and an EN explanation), e.g. available municipal lots or housing programmes, PDM classification of an article/parcel, local incentives for newcomers, urbanism appointment. They go to the card's generic `geral@` address.
- **Source:** our own text plus the existing `camaras.csv` contacts. No new data, no licence question.
- **Effort:** S.
- **Risks:** câmaras receiving low-quality mass mail. Keep the templates specific (they ask the user to fill in the article/parcel and their situation); one click, no automation. PT text must follow the glossary (polite "você" form).
- **Recommendation:** **yes**: cheap and useful. Pair it with the shortlist (task 08): "ask about all my shortlisted concelhos" can come later.

## 3. Municipal building-lots layer (manual curation + user reports)

- **What:** points or areas for lots that câmaras sell or rent cheaply ("lotes municipais", "loteamentos para fixação de jovens"), with price, conditions and a link to the official notice.
- **Source:** câmara websites and Diário da República / Boletim Municipal notices. **No licence**: facts plus links are fine, but copying the notice text or plans isn't. User reports would come through GitHub issues or a form (no backend today).
- **Effort:** L. It's an ongoing curation job: notices expire, so each entry needs an `as_of` and an expiry check; geocoding the lots needs the plans.
- **Risks:** stale or expired offers presented as current; liability if a price is wrong; spam in user reports; personal data in reports.
- **Recommendation:** pilot it on 5–10 PNCT concelhos as a **list in the concelho card** (link + date + "check with the câmara"), not a map layer. Decide on a map layer once there are enough entries and a refresh routine. Reports via the existing "Report outdated info" issue flow.

## 4. Travel time to hospital / motorway / airport / Porto–Lisbon

- **Sources:**
  - Road network and motorway junctions: **OpenStreetMap** (ODbL, already credited), Geofabrik Portugal extract.
  - Hospitals: OSM `amenity=hospital` (ODbL), cross-checked with the SNS hospital list (SNS Transparência portal; check its licence) to keep only SNS hospitals with an emergency service (urgência).
  - Airports: OPO, LIS, FAO (+ Beja), fixed.
- **How:** offline routing with OSRM or Valhalla on the Portugal extract, from each parish centroid (or population-weighted centroid from the Census grid), to the nearest of each class. Store minutes per parish in `web/data/`, shown in the panel ("45 min to the nearest hospital with an emergency service").
- **Effort:** M, mostly pipeline: routing setup ~1 day, the rest validation.
- **Risks:**
  - free-flow car times understate real times (traffic, mountain roads), so label them "approx. by car, no traffic";
  - "hospital" quality varies, so the emergency filter needs care;
  - a derived ODbL database: share-alike on the data file is fine for a public repo.
- **Recommendation:** **yes, high value** for people choosing where to move. Start with hospital (urgência) + motorway junction + nearest of Porto/Lisboa.

## 5. Further layers

| Layer | Source (licence) | Granularity | Effort | Risks | Recommendation |
|---|---|---|---|---|---|
| **Unemployment** | INE Census 2021 unemployment rate per parish/concelho (CC BY 4.0, via the INE API like the card). IEFP registered unemployment per concelho, monthly ("Estatísticas mensais por concelho"; licence not stated on the page, so to check) | Census: parish; IEFP: concelho, monthly | S (Census, card line); M (IEFP) | The Census is a 2021 snapshot; IEFP counts registered job-seekers, not a rate | Add the Census rate to the card now (S); IEFP after checking its licence |
| **Crime** | INE **0012260** "Taxa de criminalidade (‰)" by municipality and crime category (DGPJ data; dados.gov.pt lists it cc-by) | concelho, annual | S | Small concelhos jump year to year, so use a **multi-year average** (e.g. 3 years) as the backlog suggests; sensitive topic | Card line with a 3-year average and Portugal's value; no map layer |
| **Fibre coverage** | ANACOM: parish list in 4 coverage bands (≤ 1%, 1–25%, 25–50%, > 50%) for high-speed fixed networks, and GEO.ANACOM (quarterly). **Reuse licence not found** | parish | S–M | Licence unclear; bands are coarse; operator-reported | **Blocked: ask ANACOM** about reuse terms; then a parish band in the panel |
| **Fire hazard** | ICNF "Carta de perigosidade de incêndio rural" (structural hazard, methodology V2020; legally published yearly; dados.gov.pt has an entry with no licence field) | 25 m raster | M (raster → tiles, like task 06) | **Licence unclear** (same ICNF question as RNAP); the 2022 map had a contested legal status (it never fully came into force in some versions); high-stakes reading for buyers | Blocked with the ICNF licence question (bundle it with RNAP's) |
| **REN / RAN** | DGT SNIT (municipal PDM conditions: REN/RAN delimitations), mostly WMS per municipality | parcel | L | No national vector download; delimitations are legal documents that vary by PDM version; a wrong map here is costly | Keep linking to SNIT (as the card does); no layer |
| **Flood risk** | APA: ARPSI (areas of potential significant flood risk) and flood hazard/risk maps under the EU Floods Directive (SNIAmb; licence to check, likely open as EU reporting data, also on the EEA side) | areas | M | Coverage only for ARPSI (not everywhere), so absence ≠ no risk | Investigate the APA/EEA licence; an overlay like Natura with a clear "only designated areas" note |

## Suggested order

1. "Ask the câmara" (S).
2. Census unemployment + 3-year crime average in the card (S, INE CC BY).
3. Travel times (M, the biggest value).
4. The Emprego Interior MAIS formula, after a manual check of the law.
5. Licence questions in one batch: ICNF (RNAP + fire hazard), ANACOM (fibre), APA (flood).
