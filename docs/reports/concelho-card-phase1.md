# Concelho data card: phase 1 (investigation and proposal)

2026-10-18. Branch `feat/concelho-card` (not pushed, not merged). No UI was built. The branch adds:

- `scripts/explore_ine.py`: reproducible INE fetch and checks, cached in the gitignored `data/external/ine/`;
- `scripts/validate_contacts.py`: contacts CSV validator, offline plus `--online`;
- `data/contacts/camaras.sample.csv`: 10 curated rows.

## Summary

- **Population data:** all three figures come from INE's JSON API, with no key needed. Codes match for all **278/278** mainland concelhos in every series, names included, with no mismatches.
- **Population change:** the agreed "% change since Census 2011" **should not be computed against the latest estimate**. Since 2021, INE's annual estimates are administrative-based. In 2021, the same year as the Census, they differ from the Census by −17.4% to +22.4% per municipality. Against Census 2011 the comparison would show growth in **69** concelhos that lost population between the two censuses. I propose census-to-census change instead (open question 1).
- **Density:** density uses CAOP 2025 `cont_municipios.area_ha` at build time. We don't ship area today.
- **SNIT:** there is **no stable per-municipality link**. The fallback is the câmara's own PDM page, in the CSV.
- **Contacts:** 10 rows took about 20 minutes, with tooling doing most of the work. **185** concelhos contain at least one PNCT parish. I propose a candidate-extraction script, then review per row (by me or kiro), then the validator.

## 1. INE population data

### Indicators (verified via the metadata API)

| Figure | Indicator | What it is | Periods | Last update |
|---|---|---|---|---|
| Population (latest) | **0012917** | Resident population at 31 Dec, by place of residence (NUTS 2024), sex and life-cycle age group. Annual estimates. | 2021–2025 | 2026-06-22 |
| Ageing index | **0012909** | Ageing index (65+ per 100 aged 0–14), NUTS 2024, same estimates | 2021–2025 | 2026-06-22 |
| Census 2011 (and 2021) | **0011609** | Resident population at the Census, NUTS 2013, by sex and age group. Decennial, published with Census 2021 and carrying both 2011 and 2021. | 2011, 2021 | 2022-11-23 |

- **0012909 is the right ageing index.** It's on NUTS 2024 and the current series. As a check, I recomputed it as 65+ / 0–14 × 100 from 0012917 for every municipality, and it matches to within **0.05**.
- **Not 0012905**, although it looks like the obvious "population" series. It is by single year of age, and the API only publishes it down to NUTS 2 (it returns 13 rows and rejects municipal codes in `Dim2`). The same estimates at municipal level are in 0012917.
- **Census 2011 = 0011609 (period 2011).** It's the 2011 figure as INE republished it with Census 2021, on the same terms as the 2021 count. 0014527 (Census 2011 by population-size band) and 0005889 (historical series 2001–2011) also exist, but 0011609 is the cleanest.

### Requests (as used by `scripts/explore_ine.py`)

```
Metadata  https://www.ine.pt/ine/json_indicador/pindicaMeta.jsp?lang=PT&varcd=0012917
Pop 2025  https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&lang=PT&varcd=0012917&Dim1=S7A2025&Dim3=T&Dim4=T
0–14      https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&lang=PT&varcd=0012917&Dim1=S7A2025&Dim3=T&Dim4=1
65+       https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&lang=PT&varcd=0012917&Dim1=S7A2025&Dim3=T&Dim4=4
Ageing    https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&lang=PT&varcd=0012909&Dim1=S7A2025
Census    https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&lang=PT&varcd=0011609&Dim1=S7A2011&Dim3=T&Dim4=T   (and S7A2021)
```

- `Dim1` is the period (`S7A<year>`), `Dim3` the sex (`T` = both), `Dim4` the age group (`T` total, `1` 0–14, `4` 65+).
- Leaving out `Dim2` returns every geography: country, regions, NUTS 2/3 and municipalities. The Census table also includes parishes, 765 KB per year.

Sample response rows (Idanha-a-Nova and Portugal):

```json
0012917 2025  {"geocod": "1950505", "geodsg": "Idanha-a-Nova", "dim_3": "T", "dim_4": "T", "ind_string": "8 360", "valor": "8360"}
              {"geocod": "PT", "geodsg": "Portugal", "dim_3": "T", "dim_4": "T", "ind_string": "11 424 031", "valor": "11424031"}
0012909 2025  {"geocod": "1950505", "geodsg": "Idanha-a-Nova", "ind_string": "417,9", "valor": "417.9"}
              {"geocod": "PT", "geodsg": "Portugal", "ind_string": "188,8", "valor": "188.8"}
0011609 2011  {"geocod": "0505", "geodsg": "Idanha-a-Nova", "dim_3": "T", "dim_4": "T", "ind_string": "9 716", "valor": "9716"}
```

The responses also carry `IndicadorCod`, `DataUltimoAtualizacao` ("2026-06-22") and `UltimoPref` (the indicator's latest period, not the one requested).

**Reliability:** about 1 in 4 requests timed out at 30–60 s, so the fetcher retries up to 5 times with backoff. Every run so far completed.

### National reference values (same series and year)

| | Ageing index 2025 (0012909) | Population 2025 (0012917) | Census 2011 (0011609) |
|---|---|---|---|
| Portugal (`PT`) | **188.8** | 11,424,031 | 10,562,178 |
| Continente (`1`) | 190.2 | 10,912,573 | 10,047,621 |

For "312 (Portugal: 190)", the value from the same table is **Portugal 188.8**. (190.2 is the mainland figure.) I propose "Portugal: 189" (open question 2).

### Series break (important)

INE's own note on 0012917/0012909 says that from 2021 the annual estimates are administrative-based. Up to 2020 they were based on the earlier censuses, so the evolution 2020→2021 must be read with that change in mind. Fetching only 2021+ periods of these indicators keeps us on the current series; nothing older is mixed in.

But **the 2021+ estimates and the Census measure differently**, even in the same year:

| | Estimate 2021 (0012917) | Census 2021 (0011609) | Gap |
|---|---|---|---|
| Portugal | 10,599,117 | 10,343,066 | +2.5% |
| Per municipality | | | −17.4% … **+22.4%** (median +0.4%) |

The biggest gaps are in places with many residents the Census undercounts. Odemira's seasonal agricultural workers are the clearest case:

| Concelho | Estimate − Census 2021 | Naive 2025 est. vs Census 2011 | Census 2011→2021 | Estimates 2021→2025 |
|---|---|---|---|---|
| Odemira | +22.4% | +69.0% | +13.3% | +21.8% |
| Albufeira | +17.7% | +55.2% | +8.2% | +22.0% |
| Lisboa | +10.9% | +19.1% | −1.2% | +8.7% |
| Águeda | | +6.1% | −3.4% | |

So "latest estimate vs Census 2011" folds a method change into the trend. **69 concelhos** lost population between the censuses but would show growth.

Options:
- **(A) Recommended:** "−14.0% from 2011 to 2021 (Censuses)" next to the 2025 estimate. Both ends are censuses, on the same terms.
- **(B)** Change within the current estimate series, 2021→2025. It's consistent, but covers only 4 years.
- **(C)** The naive comparison, as specified. Not recommended.

### Code mapping

- **NUTS 2024 tables:** the municipal `geocod` is the 3-character NUTS-3 code plus the 4-digit DICO, e.g. `195` + `0505`. The DICO is `geocod[3:]`, mainland when it starts with `1`.
- **Census table (0011609):** uses the bare 4-digit DICO.
- **Result:** for 0012917, 0012909, and 0011609 (2011 and 2021), all **278/278** CAOP 2025 mainland DICOs are present. There are no extras besides the 30 island municipalities, and **0 name differences**.
- **Geography version:** municipal boundaries haven't changed since 1998. CAOP 2020 (INE's estimate geography) vs 2025 matters only for parishes, which this card doesn't use.

### Licence

INE's 2026 publications catalogue says its statistical information can be used under **CC BY 4.0**, provided the source is clearly identified. dados.gov.pt lists INE datasets the same way.

- Proposed source line: "Fonte: INE, Estimativas Anuais da População Residente 2025 e Censos 2011/2021 (CC BY 4.0)".
- Add it to `data/ATTRIBUTION.md`.

## 2. Density

- **What we ship today:** CAOP 2025 (`CAOP_Continente_2025-gpkg`, SHA-256 pinned in the Makefile). `web/data/pnct.topo.json` has no area field; its concelho properties are `name, distrito, pnct_count, parish_count`.
- **What we'd use:** `cont_municipios.area_ha` (278 rows, EPSG:3763).
  - It matches the sum of `cont_freguesias.area_ha` per concelho to within **0.03 ha**.
  - It matches the geometry area to within 1.8 × 10⁻⁶ relative.
  - The total is 89,102 km².
- **Range** with the 2025 population:

| | Concelho | People/km² |
|---|---|---|
| Lowest | Alcoutim | 4.3 |
| Median | | 67 |
| Highest | Amadora | 8,641 |

- **Caveat:** the area includes inland water (reservoirs) as CAOP defines it. That's the standard denominator; no change proposed.

## 3. SNIT / PDM link: no stable per-municipality URL

| Tried | Result |
|---|---|
| `https://snit.dgterritorio.gov.pt/` | Times out (60 s). The live portal is `https://snit-mais.dgterritorio.gov.pt/portalsnit/` (200). |
| Portal deep links | It's a single-page Hexagon GIS app. Its only URL formats are `Full.aspx?gpm={0}` and `?gpw={0}` (`mapDirectLinkFormat`, `workspaceDirectLinkFormat`), which are user-saved map and workspace IDs. `?gpm=1606` (Ponte da Barca's DICO) returns the same default page as plain `Full.aspx` (275 KB, identical shell). Municipality selection happens only inside the app. |
| CSW catalogue `…/sdisnitcsw/service.svc/get?service=CSW&request=GetCapabilities` | Answers, but describes map services, not pages a person can follow. `GetRecords` rejected `csw:Record` and `gmd:MD_Metadata` with this server's parameters. |
| `https://snit-mais.dgterritorio.gov.pt/SNIT/Diplomas/AVISO …pdf` | Stable PDFs, but one per amendment notice, not "the PDM in force". There's also no index by municipality. |

I couldn't run the five-concelho test you asked for, because the portal has no URL form that takes a municipality: I tried the one parameter it has (`gpm`) with Ponte da Barca's DICO. Instead, the fallback was tested on all 10 sample concelhos, mostly interior. Every câmara PDM page answered 200. I read 9 of them; Tabuaço's broken TLS chain blocked the reader. 8 clearly show the plan in force; Marvão's doesn't say which version is in force. See the sample notes.

**Verdict:** no stable, linkable per-municipality SNIT URL exists. **Fallback:** `pdm_url` in the CSV points to the câmara's own PDM page. Optionally, add one generic line under the block: "Plantas oficiais: SNIT (DGT)", with a link to the portal home (same for every concelho).

## 4. Contacts CSV

### Schema: `data/contacts/camaras.csv`

As proposed, with these rules:

| Column | Rule |
|---|---|
| `dico` | 4 digits, one of the 278 CAOP DICOs, unique |
| `name` | must equal the CAOP `municipio` (checked) |
| `website` | https, the câmara's home |
| `email` | one generic institutional mailbox on the câmara's own domain (geral@, municipio@, …). No `first.last@`; the validator flags that pattern. |
| `phone` | `+351 2xx xxx xxx`, the main switchboard |
| `urbanism_url` | optional. The urbanism / obras particulares service page. Empty if there is none. |
| `pdm_url` | the câmara page for the PDM **in force** (regulation and plantas), not a revision process |
| `source_url` | the page the email and phone were read from |
| `as_of` | ISO date of the check |
| `notes` | free text for reviewers; never shown in the UI |

### Sample (10 concelhos, all with PNCT parishes; Águeda is partly PNCT)

```csv
dico,name,website,email,phone,urbanism_url,pdm_url,source_url,as_of,notes
0101,Águeda,https://www.cm-agueda.pt/,geral@cm-agueda.pt,+351 234 610 070,https://www.cm-agueda.pt/viver/urbanismo-ordenamento-do-territorio-e-politicas-de-habitacao,https://www.cm-agueda.pt/pages/81,https://www.cm-agueda.pt/municipio/contactos-88,2026-10-18,"Partly PNCT. PDM page: 1.ª Revisão (Aviso 3341/2012) and amendments up to Aviso 13953/2026/2, with links to the regulation and plantas."
0209,Mértola,https://www.cm-mertola.pt/,geral@cm-mertola.pt,+351 286 610 100,https://www.cm-mertola.pt/viver/urbanismo,https://www.cm-mertola.pt/viver/urbanismo/planos,https://www.cm-mertola.pt/,2026-10-18,"JavaScript-rendered site (plain fetch shows only 'Aguarde...'). 'Gestão Urbanística' and 'Participar > PDM' are placeholders ('Em atualização...'), so urbanism_url is the Urbanismo section. PDM page: regulation and the 2010/2021 adaptations."
0310,Terras de Bouro,https://www.cm-terrasdebouro.pt/,geral@cm-terrasdebouro.pt,+351 253 350 010,https://www.cm-terrasdebouro.pt/servicos/urbanismo-e-ordenamento-do-territorio/requerimentos,https://www.cm-terrasdebouro.pt/servicos/urbanismo-e-ordenamento-do-territorio/pdm-online,https://www.cm-terrasdebouro.pt/,2026-10-18,"PDM in force: 2015, 1.ª alteração por adaptação (regulation, plantas, REN/RAN). 2.ª revisão in public discussion Oct–Dec 2025, on the same page."
0412,Vinhais,https://www.cm-vinhais.pt/,geral@cm-vinhais.pt,+351 273 770 300,https://www.cm-vinhais.pt/a-autarquia/servicos-municipais/divisao-de-ordenamento-do-territorio-urbanismo-e-obras-municipais,https://www.cm-vinhais.pt/a-autarquia/servicos-municipais/unidade-de-ambiente-e-mobilidade/plano-diretor-municipal-pdm,https://www.cm-vinhais.pt/,2026-10-18,"Two PDM pages: the one used (under Unidade de Ambiente e Mobilidade) has the plan in force (1.ª revisão); the other is the 2.ª revisão procedure started in 2022, with no regulation."
0505,Idanha-a-Nova,https://www.cm-idanhanova.pt/,geral@cm-idanhanova.pt,+351 277 200 570,https://www.cm-idanhanova.pt/areas/urbanismo-e-planeamento.aspx,https://www.cm-idanhanova.pt/areas/urbanismo-e-planeamento/pdm.aspx,https://www.cm-idanhanova.pt/contactos.aspx,2026-10-18,"No email or phone on the homepage; taken from the contacts page (8 addresses listed, geral@ is the Câmara's). PDM page: RCM 43/94 with amendments (latest Aviso 9789/2021); plantas only via SNIT; 1.ª revisão started 2022."
0612,Pampilhosa da Serra,https://www.cm-pampilhosadaserra.pt/,municipio@cm-pampilhosadaserra.pt,+351 235 590 320,,https://www.cm-pampilhosadaserra.pt/municipio/planos-municipais-de-ordenamento-do-territorio/plano-diretor-municipal,https://www.cm-pampilhosadaserra.pt/,2026-10-18,"No urbanism department page found. Generic address is municipio@, not geral@. PDM page: 2.ª alteração à 1.ª revisão, regulation PDF and plantas (TIFF folders), no DR reference."
0802,Alcoutim,https://cm-alcoutim.pt/,geral@cm-alcoutim.pt,+351 281 540 500,https://cm-alcoutim.pt/areas-de-atuacao/planeamento-e-urbanismo/urbanismo,https://cm-alcoutim.pt/areas-de-atuacao/planeamento-e-urbanismo/planeamento-e-ordenamento-do-territorio/plano-diretor-municipal,https://cm-alcoutim.pt/,2026-10-18,"JavaScript-rendered site (same platform as Mértola); no www. host. PDM page: regulation (RCM 167/95) and four amendments up to 2018."
1210,Marvão,https://www.cm-marvao.pt/,geral@cm-marvao.pt,+351 245 909 130,https://www.cm-marvao.pt/atividade-municipal/urbanismo/,https://www.cm-marvao.pt/atividade-municipal/urbanismo/pdm/,https://www.cm-marvao.pt/,2026-10-18,"PDM page: regulation and drawn/written elements uploaded 2021, but no Diário da República notice, so the version in force is not stated. A second number (245 909 526) is also listed."
1603,Melgaço,https://www.cm-melgaco.pt/,geral@cm-melgaco.pt,+351 251 410 100,https://www.cm-melgaco.pt/viver/areas-de-atividade/urbanismo/obras-particulares/,https://www.cm-melgaco.pt/viver/areas-de-atividade/urbanismo/pdm-e-revisao-do-pdm/,https://www.cm-melgaco.pt/,2026-10-18,"PDM in force: 2013 (Aviso 10929/2013) plus the 1.ª alteração (RERAE); 2.ª revisão in preparation (Aviso 1326/2019) on the same page. Plantas via the municipal geoportal."
1819,Tabuaço,https://www.cm-tabuaco.pt/,geral@cm-tabuaco.pt,+351 254 780 000,https://www.cm-tabuaco.pt/apoio-ao-municipe/urbanismo-e-ordenamento-do-territorio,https://www.cm-tabuaco.pt/apoio-ao-municipe/urbanismo-e-ordenamento-do-territorio/pdm-plano-diretor-municipal,https://www.cm-tabuaco.pt/,2026-10-18,"The server sends an incomplete TLS certificate chain: strict clients fail ('unable to verify the first certificate'); curl and browsers load it. PDM page content not checked in detail."
```

**Validation** (`uv run python scripts/validate_contacts.py data/contacts/camaras.sample.csv --online`):
- **Offline:** 0 problems. Names match CAOP; every email is generic and on the câmara's domain; phones are well-formed.
- **Online:** 39/40 URLs answer.
- **Tabuaço:** its 4 URLs answer only without TLS verification. The certificate chain is incomplete. Browsers cope, but it's reported for a human look.
- **Run time:** 2 min, for the slowest site.

### Effort and what was hard

- **Time:** about 20 minutes of agent time for the 10 rows, 19:08–19:32 including the validator.
  - A homepage scan (email, phone, links matching urbanism/PDM) filled 7 of 10 rows in one pass.
  - The rest went on judging PDM pages and on two JavaScript-rendered sites.
  - For a person working by hand, I'd estimate **5–8 minutes per concelho**. That's an estimate, not a measurement.
- **Two JavaScript sites:** Mértola and Alcoutim run on the same platform. A plain fetch sees only "Aguarde…", and their links are in an escaped JSON blob in `/mapadosite`. A Playwright render was needed.
- **"PDM" pages that aren't the plan in force:**
  - Vinhais has a revision page and a separate in-force page.
  - Mértola's "Participar > PDM" and "Gestão Urbanística" are placeholders ("Em atualização…").
  - Melgaço and Terras de Bouro mix the plan in force with a revision in progress on one page (fine to link).
  - Marvão's page doesn't say which version is in force.
  - Idanha's sends people to SNIT for the maps.
- **Contacts:**
  - Idanha has no contacts on its homepage and eight mailboxes on its contacts page.
  - Pampilhosa uses `municipio@`, not `geral@`.
  - Marvão lists two numbers.
  - No contact forms instead of emails in this sample. Every câmara had a generic mailbox.
- **Urbanism pages:** missing in 1 of 10 (Pampilhosa da Serra). Mértola's is a placeholder.
- **Broken sites:** none. One TLS chain problem (Tabuaço).

### Curation plan for the rest

**185** concelhos contain at least one PNCT parish (165 whole, 20 partly), so 175 remain after the sample. The other 93 come later.

1. **`scripts/contacts_candidates.py` (semi-automated):** for each DICO, take the domain from a seed list (`cm-<slug>.pt`, plus known exceptions), then:
   - fetch the homepage and `/contactos`;
   - for JavaScript sites, fall back to `/mapadosite` and then a Playwright render;
   - extract mailboxes, phones and links matching urbanismo / obras particulares / PDM / plano diretor;
   - write `data/contacts/candidates.csv` with ranked candidates per field and the evidence (link text).
2. **Review per row:** a person, or kiro-cli with a spec and an allowlist that says only `data/contacts/camaras.csv` may change. For each row:
   - choose the email, phone, urbanism page and PDM page;
   - open the PDM page and confirm it shows the plan **in force**, not just a revision;
   - fill in `notes`.

   Estimate: 2–3 minutes per row with candidates in hand, about **6–9 hours for 175 rows**, in batches of about 25. Kiro could do a first pass per batch; I'd review its diff and spot-check about 20% of rows against the sites.
3. **Validation gate:** `validate_contacts.py`, offline in pytest (every commit) plus `--online` before each data release. Coverage target: all 185 PNCT concelhos for v1.
4. **Refresh:** a yearly `--online` run. Every failing URL or `as_of` older than 12 months goes back to review. Plus user reports through the "Report outdated info" link.

## 5. Data pipeline

```
make concelhos-fetch   scripts/fetch_ine.py      → data/external/ine/<indicator>_<period>.json (cached, retries; REFRESH=1 re-downloads)
make concelhos         scripts/build_concelhos.py
                         inputs:  data/external/ine/*.json, CAOP cont_municipios (area_ha),
                                  data/contacts/camaras.csv, scripts/concelhos_config.py (indicator codes, periods)
                         outputs: data/concelhos.json            (committed; keyed by DICO, per-field meta)
                                  web/data/concelhos.json        (committed; what the app fetches lazily)
```

- **`scripts/concelhos_config.py`:** the single switch, like `protected_config.py`. It holds the indicator codes, the estimate year (`latest` resolved at fetch time and **recorded**), the census years, and the national reference geography (`PT`).
- **Offline only:** fetching happens in the build pipeline, never from the browser. The app gets one content-hashed file, imported with `?url` and fetched on the first card or section that opens, like `protection.json`. Estimated size: about 40 KB raw, about 12 KB gzipped for 278 concelhos with contacts.
- **Format** (both files; the web one may drop `notes`):

```json
{
  "fields": {
    "population":      {"source": "INE, Estimativas Anuais da População Residente (0012917)", "url": "https://www.ine.pt/bddXplorer/htdocs/minfo.jsp?var_cd=0012917&lingua=PT", "as_of": "2025-12-31", "licence": "CC BY 4.0", "updated": "2026-06-22"},
    "population_2011": {"source": "INE, Censos 2011 (0011609)", "url": "https://www.ine.pt/bddXplorer/htdocs/minfo.jsp?var_cd=0011609&lingua=PT", "as_of": "2011", "licence": "CC BY 4.0"},
    "population_2021": {"source": "INE, Censos 2021 (0011609)", "url": "…", "as_of": "2021", "licence": "CC BY 4.0"},
    "density":         {"source": "Computed: population / CAOP 2025 area", "as_of": "2025", "licence": "CC BY 4.0"},
    "ageing_index":    {"source": "INE (0012909)", "url": "…", "as_of": "2025", "licence": "CC BY 4.0"},
    "contacts":        {"source": "Câmara websites, curated", "url": "https://github.com/singledev-eu/pnct-map/blob/main/data/contacts/camaras.csv", "as_of": "<max as_of>"}
  },
  "national": {"ageing_index": 188.8, "population": 11424031},
  "concelhos": {
    "0505": {"population": 8360, "population_2011": 9716, "population_2021": 8355, "density": 5.9, "ageing_index": 417.9,
             "contacts": {"website": "…", "email": "…", "phone": "…", "urbanism_url": "…", "pdm_url": "…", "as_of": "2026-10-18"}}
  }
}
```

- **Missing values are `null`**, never estimated; the UI shows "—".
- **Protection:** `protection.json` keeps its own file. Merging the concelho-level protection block in later is an option, not part of v1.

### Tests (pytest)

- **Coverage:** all 278 DICOs present for every INE field, and contacts for every concelho with a PNCT parish (initially only those in the CSV, so the test lists the expected set).
- **Sanity ranges:**
  - population 1,000–700,000;
  - density 1–10,000 /km²;
  - ageing index 50–1,000;
  - census change −40%…+80%;
  - mainland population sums equal the `1` (Continente) row exactly;
  - the national ageing index equals 65+/0–14 recomputed, ±0.1.
- **Series guard:** the estimate year is ≥ 2021, and every field's `as_of` matches the period actually requested. The build fails if an indicator's metadata `PrimeiroPeriodo` or the note about administrative estimates changes.
- **Contacts:** `validate_contacts.py` offline checks as a test, plus no personal-looking emails.
- **Size budget** for `web/data/concelhos.json`.

### Yearly refresh

INE publishes new estimates about mid-June; this year's update was 2026-06-22.

1. `REFRESH=1 make concelhos-fetch`. The latest year comes from the metadata's `UltimoPeriodo`.
2. `make concelhos`.
3. pytest shows any range or coverage breaks.
4. Review the diff of `data/concelhos.json`. Year-on-year changes above ±5% per concelho get a closer look.
5. Run `validate_contacts.py --online` and review failures.
6. Release as a patch version, with the reference years in the CHANGELOG.

## 6. UI proposal (not built)

### Concelho panel (country zoom, click on a concelho)

Today it shows the badge, distrito and parish count, PNCT coverage, nature protection and (for whole-PNCT concelhos) property search. The card adds two sections after "PNCT coverage", in this order:

```
┌ Concelho ───────────────────────────── × ┐
│ Idanha-a-Nova                            │
│ [PNCT territory]  Distrito · Parishes    │
│ PNCT coverage …                          │
│ ── Population ────────────────────────── │
│ 8,360 people (2025)                      │
│ −14.0% from 2011 to 2021 (Censuses)      │
│ 5.9 people/km²                           │
│ Ageing index 418 (Portugal: 189)  ⓘ      │
│ Source: INE, estimates 2025, Censuses    │
│ 2011/2021 · CC BY 4.0                    │
│ ── Câmara Municipal ──────────────────── │
│ Website ↗ · geral@cm-idanhanova.pt       │
│ +351 277 200 570                         │
│ Urbanism ↗ · PDM in force ↗              │
│ Source: câmara website, checked 2026-10  │
│ · Report outdated info ↗                 │
│ ── Nature protection … (as today)        │
│ ── Property search … (as today)          │
└──────────────────────────────────────────┘
```

- **Desktop:** same 360 px side panel. A two-column `dl.facts` for the population numbers keeps the block compact.
- **Phone:** the same sections in the bottom sheet (scrolls; max-height 50vh as today). The email and phone are real `mailto:`/`tel:` links with 44 px tap targets.
- **ⓘ (ageing index):** a native `<details>` with one line: "People aged 65 and over per 100 under 15". No popover machinery is needed.
- **Report outdated info:** `https://github.com/singledev-eu/pnct-map/issues/new?title=Outdated%20info%3A%20Idanha-a-Nova%20(0505)&body=…&labels=data`. The body is pre-filled with the DICO, the current values, the `as_of` date and a "What changed?" prompt. Needs a `data` label in the repo.

### Parish panel (parish zoom)

A collapsed `<details class="concelho-card">` with the summary "Concelho: Idanha-a-Nova", placed after the "Concelho coverage" section. Opening it fetches the data, if not loaded yet, and renders **the same component** as the concelho panel.

```
│ Concelho coverage … Show all of X        │
│ ▸ Concelho: Idanha-a-Nova                │   (collapsed by default)
│ Nature protection …                      │
```

### Shared behaviour

- **One component:** `concelhoCard(dico)` (`web/src/concelho.ts`), following the `protectionSection` pattern. It shows "Loading…", fills in on arrival and shows an error line on failure. It ignores a stale response once the panel has moved on.
- **Missing data:** a missing value shows "—" plus a muted note, e.g. "— (not available from INE)" or "No urbanism page found on the câmara's site". Contacts not yet curated (the 93 later concelhos) show "Câmara contacts: not yet available" with the report link. Nothing is ever estimated or made up.
- **Strings** in `web/src/strings.ts` (PT/EN-ready):
  - section headings and the units ("people", "people/km²");
  - the ageing-index explanation;
  - the source-line templates;
  - "Report outdated info";
  - "not available".

  Numbers use `Intl.NumberFormat` for the active language, which gives "8 360" in PT and "8,360" in EN.
- **Themes:** only existing tokens (`--text`, `--muted`, `--accent`, `--border`); no new colours.
- **Accessibility:**
  - section headings are `h3`, as today;
  - links that open new tabs say so (↗ plus the existing pattern);
  - `tel:` and `mailto:` links have readable text;
  - the `<details>` summary is keyboard-operable;
  - the loading state uses `aria-live="polite"` through the panel's existing live region.
- **Tests (phase 2):**
  - unit: formatting and missing-value rendering;
  - e2e: the concelho card at country zoom, the collapsed section at parish zoom (lazy fetch happens only on open), "—" for a concelho without contacts, the issue-link URL, both themes, and a 375 px phone.

## Open questions

1. **Population change:** census-to-census (2011→2021, recommended), the estimate series (2021→2025), or the naive comparison as specified?
2. **National ageing reference:** Portugal 188.8 (shown as "189") or Continente 190.2? I'd use Portugal, as in your example.
3. **Contacts for later concelhos:** the 93 non-PNCT concelhos show "not yet available" in v1. OK, or hide the block for them?
4. **SNIT line:** add one generic "Plantas oficiais: SNIT (DGT)" link under the contacts block (same for all concelhos), or leave SNIT out?
5. **Curation:** kiro first pass plus my review per batch of about 25, or should you review the batches yourself? Do you want a `data` label created for the issue link?
6. **Partly-PNCT concelhos:** the card shows whole-concelho statistics. Should it say so ("whole concelho") when only some parishes are PNCT?
