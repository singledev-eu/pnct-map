# PT/EN glossary

The reference for UI wording in `web/src/strings.en.ts` and `web/src/strings.pt.ts`. It was agreed during the 0.6.0 review ([report](reports/0.6.0-i18n-theme.md), [review](reports/0.6.0-i18n-theme-review.md)). Check new terms against it, and add a row when a new domain term appears.

## Rules

- **European Portuguese, AO 1990 spelling** ("atividades", "projetos", "Diretiva", "desatualizada"). Never Brazilian Portuguese.
- **Place names are never translated.** Parish, concelho and district names come from CAOP as they are. Basemap labels show OpenStreetMap's own `name:pt` / `name:en`.
- **Official terms win over plain ones:** concelho, freguesia, Câmara Municipal, PDM em vigor, RNAP, Rede Natura 2000, índice de envelhecimento, Censos. PNCT stays as is.
- **Tone:** plain, polite and impersonal, addressing the reader with the third-person "você" form implied by the verb ("Confirme…", "Tente novamente", "Aumente o zoom"), never "tu". Keep sentences short; the phone legend is narrow, and Portuguese runs ~20–30% longer than English.
- **No "de + place name" in sentences:** say "do concelho" and leave the name in the panel title ("Nenhuma freguesia do concelho é PNCT"), so "de Porto" / "do Porto" contractions can't go wrong.
- **Hedges:** data is "apenas indicativo", never a verdict, and the PDM do município decides.
- **Numbers and dates** use `Intl` in the active locale: "8 360", "4,2", "12,3%", "outubro de 2026". Never format them by hand.

### European vs Brazilian choices

| Use (PT-PT) | Not (PT-BR) | Where |
|---|---|---|
| ligação / ligações | link, conexão | property links; "Verifique a ligação" (network) |
| separador | aba | "abre num novo separador" |
| Contactos | Contatos | câmara contacts |
| A carregar… | Carregando… | every loading state |
| ecrã, telemóvel, transferir, registo | tela, celular, baixar, registro | not in the UI yet; use these if needed |
| na mesma; Em regra | mesmo assim; Em geral | explainer |
| corresponde-lhe (enclisis) | lhe corresponde | link descriptions |
| Site | Sítio | kept: the usual word in Portugal |

### Kept in Portuguese in the English UI too

- Idealista's own search terms: Comprar/Arrendar, Terrenos/Casas/Prédios, Urbano/Urbanizável/Não urbanizável.
- Administrative terms: "Freguesia" and "Concelho" (panel kickers, search tags), "Distrito", "Câmara Municipal", PDM, PIP (*Pedido de Informação Prévia*), *artigo urbano*, *urbano*/*rústico*, REN/RAN.
- ICNF's RNAP designations ("Parque Natural", "Reserva Natural", …), as in the data.

## Terms

| EN | PT |
|---|---|
| parish | freguesia |
| concelho / municipality | concelho (Idealista's page: "município") |
| district | distrito |
| Câmara Municipal | Câmara Municipal (in sentences: "a câmara") |
| PNCT territory (badge) | Território PNCT |
| Not PNCT | Fora do PNCT |
| Only PNCT (filter) | Só PNCT |
| Whole concelho PNCT / Partly PNCT | Concelho inteiro no PNCT / Parcialmente no PNCT |
| Concelho boundary | Limite de concelho |
| Legend | Legenda |
| Concelho coverage / PNCT coverage | Cobertura do concelho / Cobertura PNCT |
| Property search | Pesquisa de imóveis |
| Property type / Land type / Operation | Tipo de imóvel / Tipo de terreno / Operação |
| Search this parish on Idealista | Pesquisar esta freguesia no Idealista |
| link(s) | ligação / ligações |
| opens in a new tab | abre num novo separador |
| Nature protection | Proteção da natureza |
| Protected areas (RNAP) | Áreas protegidas (RNAP) |
| Natura 2000 (toggle) | Rede Natura 2000 |
| Under protection: X% | Sob proteção: X% |
| Indicator, not a verdict — check the municipal PDM. | Apenas indicativo — confirme no PDM do município. |
| Zoom in to see protected areas | Aumente o zoom para ver as áreas protegidas |
| Birds / Habitats Directive | Diretiva Aves / Diretiva Habitats |
| Population | População |
| N people (2025) | N habitantes (2025) |
| people/km² | hab./km² |
| ageing index | índice de envelhecimento |
| X older people (65+) per child | X idosos (65+) por jovem (0–14) |
| Censuses | Censos |
| PDM in force / PDM documents | PDM em vigor / Documentos do PDM |
| Urbanism | Urbanismo |
| Website | Site |
| Report outdated info | Comunicar informação desatualizada |
| Official PDM maps: SNIT (DGT) | Plantas oficiais do PDM: SNIT (DGT) |
| Boundaries / Basemap | Limites / Mapa de base |
| © OpenStreetMap contributors | © contribuidores do OpenStreetMap (OSM's own PT wording) |
| reuse terms not confirmed | condições de reutilização não confirmadas |
| not available (missing value) | não disponível (shown after "—") |
| Theme: Auto (system) / Light / Dark | Tema: automático (sistema) / claro / escuro |
| Language | Idioma |
| Expand / Collapse panel | Expandir / Recolher painel |
