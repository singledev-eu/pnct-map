# PNCT: legal status of the parish list

Checked 2026-11-15. This is the record behind `data/pnct_status.csv` and the map's definition of PNCT:
**legal = the annex of Portaria n.º 208/2017 plus any amendment verified here (none found).** Where
the legal text and the IEFP list disagree, the parish is `disputed`, and no public claim rests on it.

## Sources read

| Document | What it is | Link | Read as |
|---|---|---|---|
| **Portaria n.º 208/2017, de 13 de julho** | The legal delimitation of the PNCT "territórios do interior" (tax benefits, art. 41.º-B EBF) | [DR 1.ª série n.º 134, pp. 3731–3734 (PDF)](https://files.diariodarepublica.pt/1s/2017/07/13400/0373103734.pdf), [DRE page](https://diariodarepublica.pt/dr/detalhe/portaria/208-2017-107684448) | Official DR PDF, text annex; SHA-256 `198e8b1b26f3d543baca4379d8d9e0503ea8cea23ca0c2fa7c0e75890be867ce` (the same file is mirrored at [pnaid.mne.gov.pt](https://pnaid.mne.gov.pt/images/portaria_n_208_de_2017_de_13_de_julho_identifica_territorios_do_interior.pdf)) |
| Portal das Finanças copy of the Portaria | The tax authority's own legislation entry | [PDF](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Portaria_208_2017.pdf) | Marked "Estado: vigente", "Histórico de alterações: -"; its annex is a scanned image |
| **CIC Portugal 2020, Deliberação n.º 20/2018** (12 Sep 2018) | Rectifies the *low-density* list for EU funds (Portugal 2020), not the Portaria | [COMPETE 2020 PDF](https://www.compete2020.gov.pt/admin/images/Deliberacoes_cic_territ%C3%B3rios_baixa_densidade.pdf) | Text, with its annex of 74 parishes in 21 municipalities |
| AT, *Guia Fiscal do Interior* (March 2023) | The tax authority's guide to the interior benefits | [PDF](https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/Guias/Documents/Guia_Fiscal_do_Interior.pdf) | Text |
| IEFP, *Territórios PNCT* (2026-02-04) | The list the map used until now | [PDF](https://www.iefp.pt/documents/10181/4287418/Territorios+PNCT_04-02-2026.pdf) (SHA-256 pinned in the `Makefile`) | Text; it names no legal basis |
| CCA, table of the Portaria's annex | A law firm's transcription | [PDF](https://www.cca.law/xms/files/INSIGHTS_AND_MEDIA/publications/Tabela_Portaria_208_PT.pdf) | Cross-check only. It omits Almeida (present in the DR original) and has typos |

## Findings

1. **No amendment or rectification of Portaria 208/2017 was found.**
   - The Portal das Finanças entry lists no amendments ("Histórico de alterações: -") and says the Portaria is in force ("vigente").
   - The AT guide of March 2023 still defines the territories as those "identificados no Anexo da Portaria n.º 208/2017", citing no other act.
   - Web searches of DRE content for "altera a Portaria n.º 208/2017", "retificação" and the Castelo de Paiva parishes returned only the original act. A homonym, Portaria n.º 208/2017 de 4 de agosto (Metropolitano de Lisboa), is unrelated.
   - **Limit:** the DRE consolidated page renders with JavaScript and could not be read from here, and dre.tretas.org answered 403. So this is "none found in the sources reachable", not a certified "none exists". The enquiry in `docs/reports/pnct-enquiry-pt.md` asks the authorities directly.
2. **The Portaria's preamble** says the adopted ANMP map "abrange 165 municípios e 73 freguesias".
3. **Castelo de Paiva in the Portaria annex lists only "Real".** The União das Freguesias da Raiva, Pedorido e Paraíso is not in the Portaria.
4. **CIC Deliberação 20/2018 added it to the low-density list** ("aditando-lhe a União de Freguesias da Raiva, Pedorido e Paraíso"), after a claim by the município. That list is the Portugal 2020 (EU funds) classification under DL 137/2014, not the Portaria. No act was found that carries the change into the Portaria.
5. **Dem (Caminha) and São Bento (Porto de Mós) are in the Portaria annex**, and also in the CIC annex. The IEFP list of 2026-02-04 has no line for either; its raw PDF text was checked, so this is not a parsing loss.
6. **Everything else agrees.** The Portaria's 165 whole municipalities are exactly the 165 that are PNCT in full in the IEFP list (Almeida checked in the DR original). Every other parish entry matches the IEFP list, after the 2025 splits of unions into their parishes.

## Resulting classification (`data/pnct_status.csv`)

| CAOP 2025 | Parish | Portaria 208/2017 | IEFP 2026-02-04 | Status | `legal_status` |
|---|---|---|---|---|---|
| 160209 | Dem (Caminha) | listed | missing | `disputed` | `pnct` |
| 101610 | São Bento (Porto de Mós) | listed | missing | `disputed` | `pnct` |
| 010615 | Raiva (Castelo de Paiva) | not listed (only Real) | listed | `disputed` | `not_pnct` |
| 010614 | Pedorido (Castelo de Paiva) | not listed | listed | `disputed` | `not_pnct` |
| 010613 | Paraíso (Castelo de Paiva) | not listed | listed | `disputed` | `not_pnct` |

Every other parish: `status` = `legal_status` = the IEFP list. They agree there.

If an amendment to the Portaria that adds Raiva, Pedorido and Paraíso turns up, set those three rows to `pnct` with that act as a source, and record it here.
