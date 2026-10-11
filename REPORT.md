# pnct-map — Phase 1 report (data pipeline)

## CAOP edition: **CAOP 2025** (Continente), not 2024

**Source:** https://geo2.dgterritorio.gov.pt/caop/CAOP_Continente_2025-gpkg.zip
- Landing page: https://www.dgterritorio.gov.pt/cartografia/cartografia-tematica/caop
- Approved 2026-01-28 and published in DR on 2026-02-18.
- Downloaded 2026-10-11. SHA-256 `87cd67f4b1fbadf23d9324e6fb231ff05531e4db347af36ccc7c6cbabe3ecd1d`.
- License: CC-BY-4.0.

**Editions checked:**
| Edition | Continente parishes | State |
|---|---|---|
| CAOP 2024 | 2882 | pre-split |
| CAOP 2024.1 (extraordinary, Aug 2025, applies Lei 25-A/2025) | 3049 | post-split |
| CAOP 2025 | 3049 | identical codes and names to 2024.1 |

**Why 2025:** your hypothesis that the list is pre-split is contradicted by the PDF itself.
- 18 of the 83 explicit rows name parishes that exist only after the split:
  - Águeda: Agadão, Belazaima do Chão, Castanheira do Vouga
  - Castelo de Paiva: Raiva, Pedorido, Paraíso
  - Loulé: Querença, Tôr, Benafim
  - Ourém: Matas, Cercal, Rio de Couros, Casal dos Bernardos
  - Tomar: Serra, Junceira
  - Ponte de Lima: Gaifar, Sandiães, Vilar das Almas
- Against CAOP 2024, exactly those 18 rows fail. In 2024 each is only part of a larger union, such as 010123.
- Every "U.F." the list still names is a union that was **not** split, and it exists unchanged in CAOP 2025.
- Result: every row matches against CAOP 2025. No U.F. needs mapping onto successor parishes and no rows are flagged.

## Counts
| | |
|---|---|
| PDF rows (after dedupe) | 161 (162 raw; "Viseu / São Pedro do Sul / todas" appeared twice) |
| District wildcard rows ("TODOS OS CONCELHOS") | 7 |
| Municipality wildcard rows ("TODAS AS FREGUESIAS") | 71 |
| Explicit parish rows | 83 |
| Mainland parishes total | 3049 |
| PNCT parishes | **1861** |
| By match method | wildcard 1778 · exact 65 · normalized 16 · override 2 · fuzzy 0 |

**PNCT parishes per district:**
| District | PNCT / total |
|---|---|
| Aveiro | 35 / 174 |
| Beja | 84 / 84 |
| Braga | 144 / 371 |
| Bragança | 226 / 226 |
| Castelo Branco | 128 / 128 |
| Coimbra | 90 / 161 |
| Évora | 75 / 75 |
| Faro | 28 / 76 |
| Guarda | 245 / 245 |
| Leiria | 20 / 116 |
| Lisboa | 0 / 141 |
| Portalegre | 72 / 72 |
| Porto | 25 / 275 |
| Santarém | 63 / 150 |
| Setúbal | 19 / 60 |
| Viana do Castelo | 144 / 213 |
| Vila Real | 200 / 200 |
| Viseu | 263 / 282 |

## Overrides applied (`data/overrides.csv`)
1. **LEIRIA / CASTANHEIRA DE PERA → Castanheira de Pêra.** Concelho alias. Accent stripping alone would also have matched it.
2. **PORTO / MARCO DE CANAVESES / VÁRZEA, ALIVIADA E FOLHADA → 130740.** Note that CAOP 2025's official name is also "Várzea, Aliviada e Folhada", with no "União das freguesias" prefix. The quirk you expected is not one in the data, and the row would have matched exactly anyway. I kept the pin to make it explicit.
3. **VIANA DO CASTELO / PONTE DE LIMA / VILAR ALMAS → 160763 Vilar das Almas.** New. The fuzzy score was 84.6, below 90, so the pipeline correctly left it unmatched. The runner-up scored 48.3, so I pinned it manually. Please confirm.

Dedupe: "VISEU / SÃO PEDRO DO SUL / TODAS AS FREGUESIAS DO CONCELHO" appeared twice. `parse_pdf.py` keeps the first.

## unmatched.csv
none (header only)

## Tests
`uv run make all` from a clean state: **19 passed**. The rebuild reproduces byte-identical outputs.
- **Row mapping:** every explicit and wildcard PDF row maps to at least one parish, and `unmatched.csv` is empty.
- **Uniqueness and consistency:** no duplicate dicofre in the CSV or the GeoJSON. The PNCT set in the CSV equals the `pnct=true` set in the GeoJSON.
- **Coverage:** 3049 parishes across 18 districts. The 7 wildcard districts are each 100% PNCT.
- **Loulé:** exactly Alte, Ameixial, Salir, Querença, Tôr and Benafim are PNCT.
- **Porto district:** PNCT parishes appear only in Amarante, Baião and Marco de Canaveses. That is Baião in full, the 10 listed Amarante parishes, and only 130740 in Marco.
- **GeoJSON format:** 4.65 MB (under 5 MB), at most 5 decimals, lon/lat within mainland bounds. The concelhos layer has 278 features.

## Delegated to kiro-cli
Invocation: `kiro-cli chat --no-interactive --trust-tools=… --model claude-sonnet-5.5`. Specs and logs are in `.kiro-logs/`, which is gitignored.

1. **CAOP research → `docs/caop_research.md`** (web tools only, single-file scope).
   - Good: the URLs, the 2024 / 2024.1 / 2025 timeline, the field names, and Lei 25-A/2025 (302 parishes restored, 135 unions).
   - Fixed: the counts it marked UNVERIFIED are now verified from the GeoPackages (2882 and 3049), as is 2024.1 being identical to 2025.
   - **Rejected:** its recommendation to use CAOP 2024. It reasoned from dates only, and the data shows the list is post-split.
2. **Matching module → `scripts/build_parishes.py`**, with a written spec covering normalisation, method order, fuzzy only within the municipality, a ≥90 threshold with a margin, and override semantics.
   - I reviewed the diff and needed **no code fixes**. It stayed within its allowed files.
   - It correctly refused to auto-accept "Vilar Almas" at 84.6 and asked for a decision instead. I added override 3.

Done by me: the PDF parser, the GeoJSON/mapshaper step, the tests, the Makefile, the README, the cross-edition checks, and the edition decision.

## Notes and open questions
1. **Edition:** OK to use CAOP 2025, the post-split edition that the list itself follows? It is also the current one.
2. **Vilar Almas:** confirm it is Vilar das Almas (160763).
3. **Committed outputs:** the generated GeoJSON (4.6 MB + 1.5 MB) and the CSVs are committed so the map phase can use them without running the pipeline. Prefer to gitignore them?
4. **Simplification:** 6%, keep-shapes. Small parishes in Lisbon and Porto become coarse at high zoom. If the UI needs more detail, consider per-zoom tiles or TopoJSON. TopoJSON would also be considerably smaller, because it stores shared borders once.
5. **Concelhos layer:** dissolved from the simplified parishes so the borders align, rather than taken from CAOP's `cont_municipios` layer.
6. **Environment:** uv was installed globally via Homebrew (you approved). mapshaper is pinned to 0.7.68 and runs via npx, with its cache in `./.npm-cache` (gitignored). The PDF was renamed to `data/raw/territorios-pnct-2026-02-04.pdf`.
