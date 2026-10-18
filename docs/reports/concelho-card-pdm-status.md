# Concelho card: PDM status (0.5.0 RC update)

2026-10-18. Branch `feat/concelho-card`, commit `7d46a51`. Not merged or released.

- **Preview:** https://preview.pnct-map.pages.dev (this deploy: https://21a4dbdf.pnct-map.pages.dev)

## What changed

- **`data/contacts/camaras.csv`:** new `pdm_status` column after `pdm_url`, set from the curation review by DICO (not parsed from the notes):

  | Value | Rows | Meaning |
  |---|---|---|
  | `in_force` | 158 | The review confirmed the plan in force |
  | `unclear` | 24 | The phase 2 report's "PDM unclear" list: Marvão, Cuba, Vieira do Minho, Torre de Moncorvo, Penamacor, Sertã, Miranda do Corvo, Aljezur, Tavira, Almeida, Figueira de Castelo Rodrigo, Gouveia, Mêda, Pinhel, Crato, Abrantes, Mação, Monção, Montalegre, Viana do Castelo, Paredes de Coura, Penedono, Tondela, Vouzela |
  | empty | 3 | No `pdm_url`: Mourão, Aguiar da Beira, Castro Daire |

- **`scripts/validate_contacts.py`:** `pdm_status` must be `in_force` or `unclear` whenever `pdm_url` is set, and empty when it isn't. The validator reports 185 rows, 0 problems.
- **`scripts/build_concelhos.py`:** carries `pdm_status` into `data/concelhos.json` and `web/data/concelhos.json` (`null` without a link).
- **Card (`web/src/concelho.ts`, `strings.ts`, `style.css`):**
  - `in_force` → "PDM in force ↗", as before;
  - `unclear` → "PDM documents ↗" with a muted line under it: "Version in force not stated — check with the câmara.";
  - no link → "— No PDM page found on the câmara's site", as before.
- **Report outdated info:** the issue body now includes "PDM status: in_force | unclear | —".
- **CHANGELOG and kiro spec:** updated, so future curation fills the column.

## Tests

`npm run deploy:preview`, all green, 0 flaky:

| Suite | Passed | New |
|---|---|---|
| pytest | 113 | review counts, the 3 empty rows, validator rules (missing, invalid or orphan status) |
| Vitest | 97 | data shape, issue body |
| Playwright | 87 | Marvão: "PDM documents", the note, `data-status="unclear"`, no "PDM in force", status in the issue body |

## Check on the phone

- **Unclear:** https://preview.pnct-map.pages.dev/#c=1210 (Marvão). "PDM documents ↗" with the note under it.
- **In force:** https://preview.pnct-map.pages.dev/#c=0505 (Idanha-a-Nova). "PDM in force ↗", unchanged.
