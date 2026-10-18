# Concelho card: UI checkpoint (interim)

2026-10-18. Branch `feat/concelho-card` (commit `4230381`), not merged. Curation continues while you review.

- **Preview:** https://preview.pnct-map.pages.dev (this deploy: https://ce89bbb8.pnct-map.pages.dev)
- **Contacts in this build:** 10 of 185 PNCT concelhos (the phase 1 sample). Every other concelho shows "Câmara contacts: not yet available".

## Try it

| What | Link |
|---|---|
| Concelho card, curated, whole-PNCT | https://preview.pnct-map.pages.dev/#c=0505 (Idanha-a-Nova) |
| Partly PNCT ("Figures for the whole concelho") | https://preview.pnct-map.pages.dev/#c=0101 (Águeda) |
| Not curated yet | https://preview.pnct-map.pages.dev/#c=0104 (Arouca) |
| Parish panel, collapsed "Concelho" section | https://preview.pnct-map.pages.dev/#f=050505 (Ladoeiro, Idanha-a-Nova) |

## Screenshots (taken from the preview)

`docs/screenshots/concelho-card/`:

| | Light | Dark |
|---|---|---|
| Desktop, concelho card | `desktop-light-concelho-curated.jpg` | `desktop-dark-concelho-curated.jpg` |
| Desktop, parish section opened | `desktop-light-parish-open.jpg` | `desktop-dark-parish-open.jpg` |
| Desktop, not yet curated | `desktop-light-concelho-not-yet.jpg` | `desktop-dark-concelho-not-yet.jpg` |
| Phone (375×667), population block | `phone-light-concelho-curated.jpg` | `phone-dark-concelho-curated.jpg` |
| Phone, contacts block | `phone-light-concelho-contacts.jpg` | `phone-dark-concelho-contacts.jpg` |
| Phone, parish section opened | `phone-light-parish-open.jpg` | `phone-dark-parish-open.jpg` |
| Phone, not yet curated | `phone-light-concelho-not-yet.jpg` | `phone-dark-concelho-not-yet.jpg` |

Regenerate them with `node web/scripts/concelho_shots.mjs <out-dir>`; set `SHOT_BASE` to take them from a deployed build.

## What's in it

- **Concelho panel:** the card sits between "PNCT coverage" and "Nature protection", as two sections.
  - **Population:**
    - "8,360 people (2025)"
    - "−14.0% from 2011 to 2021 (Censuses)"
    - "5.9 people/km²"
    - "Ageing index 418 (Portugal: 189) ⓘ"
    - the source line
    - "Figures for the whole concelho" for the 20 partly-PNCT concelhos
  - **Câmara Municipal:** Website ↗, the email (`mailto:`), the phone (`tel:`), Urbanism ↗ (or "— No urbanism page found on the câmara's site"), PDM in force ↗, "Official PDM maps: SNIT (DGT) ↗", then "Source: câmara website, checked October 2026 · Report outdated info ↗".
- **Parish panel:** a collapsed "Concelho: <name>" `<details>` after "Concelho coverage". The data loads on the first open; reopening doesn't fetch again.
- **Report outdated info:** opens `github.com/singledev-eu/pnct-map/issues/new` with:
  - title: "Outdated info: Idanha-a-Nova (0505)";
  - body: the DICO, the current website, email, phone, urbanism and PDM pages, the population, "checked <as_of>" and "What changed?";
  - `labels=data`. The `data` label now exists in the repo.
- **Data file:** `web/data/concelhos.json`, 46 KB (8.7 KB gzipped), content-hashed. Fetched only when a card first renders; the initial load is unchanged.

## Please look at

1. **Length on the phone:** with the card, the concelho sheet (50vh) has more to scroll; the population block comes first. Should the card in the concelho panel also be collapsible, or is scrolling fine?
2. **Placement:** population and contacts come before nature protection. Swap them?
3. **Link labels:** "Website", "Urbanism" and "PDM in force" are generic, and the URLs aren't shown. Is that clear enough, or should the website show its domain (e.g. "cm-idanhanova.pt")?
4. **Ageing index ⓘ:** it expands inline to one line ("People aged 65 and over per 100 under 15.").
5. **Number formats:** "8,360" and "−14.0%" (en-GB, real minus sign). Density has one decimal below 100/km² and none above ("151 people/km²").
6. **"checked October 2026":** month precision for the contacts' `as_of`, from the CSV's ISO date.

## Tests in this build

`npm run deploy:preview`, all green, 0 flaky:

| Suite | Result | Includes |
|---|---|---|
| pytest | 102 passed, 1 xfailed | The xfail is strict, "every PNCT concelho is curated". It has to flip, and its marker come off, for the 0.5.0 release candidate. |
| Vitest | 91 passed | Data shape, `signedPct`, issue URL |
| Playwright | 80 passed | 10 in `concelho-card.spec.ts` |

## Next

- **Curation:** 175 remaining PNCT concelhos, 7 batches of 25.
  - `scripts/contacts_candidates.py` gathers candidates for each concelho. Batch 1: site found for 19/25, a generic email for 14, PDM links for 8.
  - Then a kiro-cli first pass, my diff review and a ~20% spot-check.
  - Then a commit with the validator output in the message.
- **Then 0.5.0:** version bump, CHANGELOG entry, full suite, preview, final report.
