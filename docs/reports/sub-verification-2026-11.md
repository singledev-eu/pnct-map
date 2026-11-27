# SUB position verification (2026-11-27)

Four SNS basic emergency services (Serviço de Urgência Básica, SUB) in `data/services/sns_urgencias.csv` were flagged in the night 11 report: Loulé, Lagos and Albufeira kept the official coordinate, and Estremoz had no second source.

Each one was checked against at least two independent sources:
- the SNS export itself (address and coordinate, data period May 2023);
- OpenStreetMap: the Overpass API (maps.mail.ru mirror, OSM base 2026-11-27T08:32Z) and the pinned Geofabrik extract `portugal-261125`;
- municipal, hospital-directory and news pages.

The main Overpass server returned 502 and the kumi mirror timed out, so I used the mail.ru mirror.

The rows were changed only in the curated source, `sns_urgencias.csv` (columns `position`, `osm`, `lon`, `lat`, `note`). I then rebuilt with `uv run make services`.

## Decisions

| SUB | Before (lon, lat) | After (lon, lat) | Moved | Decision |
|---|---|---|---|---|
| Loulé | -8.017458, 37.141949 (SNS, `position=sns`) | -8.012607, 37.145526 (OSM way 1060369440) | 586 m | Moved onto the Centro de Saúde de Loulé building |
| Lagos | -8.670200, 37.099600 (SNS, `position=sns`) | -8.682069, 37.097885 (OSM way 93276413) | 1,070 m | Moved to Hospital Terras do Infante: the SUB moved there in July 2022 |
| Albufeira | -8.255000, 37.098000 (SNS, `position=sns`) | -8.254972, 37.098197 (OSM way 760612149) | 22 m | Moved onto the Centro de Saúde de Albufeira building |
| Estremoz | -7.585896, 38.848688 (OSM node 9723349238) | unchanged | 0 | Confirmed operating; kept on UCSP Estremoz in the Centro de Saúde |

Each "after" point is the centre of the OSM building, as returned by Overpass `out center`.

### SUB Loulé: moved

1. **SNS export:** address "Av. Eng. Laginha Serafim – Centro de Saúde de Loulé", 8100-740. The export's coordinate is 586 m south-west of that building, in the town centre. It looks like a geocode of the town, not of the building.
2. **OpenStreetMap:** way 1060369440 is `building=yes`, `name=Centro de Saúde de Loulé`. The SNS units on Avenida Engenheiro Laginha Serafim are mapped at the same building: USF SerraMar (node 9743903021), USF Lauroé (node 9742234787) and UCC Gentes de Loulé (node 9743915233).
3. **ARS Algarve:** the notice on the Algarve emergency network says the Loulé SUB works at the Centro de Saúde de Loulé. Source: [4 Serviços Urgência Básica, 1 SUMC e 1 SUP no Algarve](https://www.arsalgarve.min-saude.pt/noticias/4-servicos-urgencia-basica1-servico-urgencia-medico-cirurgica-e-1-servico-urgencia-polivalivalente-no-algarve/).
4. **Câmara Municipal de Loulé (2 May 2014):** "O Serviço de Urgência Básica do Centro de Saúde de Loulé…". Source: [cm-loule.pt](https://www.cm-loule.pt/noticias/6221/servico-de-urgencia-basica-do-centro-de-sa%C3%BAde-de-loule-sem-medicos-durante-feriado-e-manha-de-hoje.aspx).
5. **Health-centre directory:** the address is "Av. Engenheiro Laginha Serafim – Centro de Saúde de Loulé 8100-740 Loulé". Source: [centrosaude.pt](https://www.centrosaude.pt/faro/centro-de-saude-de-loule).
6. **Sul Informação (November 2025):** according to the search snippet, the SNS urgências work beside the "old" Centro de Saúde in an undersized space, and a new SUB is planned at the entrance to the town. Source: [sulinformacao.pt](https://www.sulinformacao.pt/2025/11/parque-de-saude-e-novo-servico-de-urgencia-basica-reforcam-resposta-do-sns-no-concelho-de-loule/). The page itself returned 403.

**Decision:** sources 1 to 5 agree on the building, so the point moved onto its centre. If the new SUB opens at the town entrance, this row must move again (see "Still open").

### SUB Lagos: moved

1. **SNS export:** H. Lagos, Rua Castelo dos Governadores, 8600-563. This is the old hospital in the historic centre.
2. **Correio de Lagos (5 July 2022):** "O Serviço de Urgência Básica (SUB) das Terras do Infante entrou, ontem, 5 de Julho, em funcionamento, encerrando nesse momento a SUB da Unidade de Lagos (antigo Hospital de Lagos)". The article sends patients to the Hospital Terras do Infante "localizado na Avenida Dom Sebastião". Source: [correiodelagos.com](https://correiodelagos.com/saude/abertura-do-servico-de-urgencia-basica-das-terras-do-infante/).
3. **Hospitais Online:** Hospital Terras do Infante, "Avenida Dom Sebastião 8600-502 Lagos", with a "Serviço de Urgência Básica (SUB), disponível 24 horas por dia". Source: [hospitaisonline.pt](https://www.hospitaisonline.pt/faro/hospital-terras-do-infante-lagos).
4. **OpenStreetMap:** way 93276413 is `name=Hospital Terras do Infante`, `amenity=hospital`, `healthcare=hospital`, `emergency=yes`, `addr:street=Avenida Dom Sebastião`, `addr:housenumber=129`. The town bus has a route to it ("Onda Cinza – Hospital Terras do Infante", relation 16887236).
5. **Inauguration coverage:** the minister of health inaugurated the hospital on 4 November 2022, with a SUB, replacing the old Hospital de Lagos. The building is the former private Hospital São Gonçalo de Lagos. Sources: [barlavento](https://barlavento.sapo.pt/destaque/ministro-da-saude-inaugurou-infraestruturas-do-chua-em-lagos-e-faro), [Polígrafo](https://poligrafo.sapo.pt/fact-check/governo-do-ps-inaugurou-um-novo-hospital-publico-em-lagos-ao-contrario-do-que-tem-dito-montenegro).

**Decision:** four independent sources (2, 3, 4 and 5) agree on the building, so the point moved there. The SNS export (May 2023) is out of date for this row: it still gives the address that closed in July 2022.

The displayed name stays "SUB do Hospital de Lagos". The build matches each CSV row to the SNS export by this name, and the name is still accurate: Terras do Infante is Lagos's SNS hospital.

### SUB Albufeira: moved (22 m)

1. **SNS export:** Urbanização dos Caliços, 8200-200, phone 289 598 400. The coordinate is 22 m from the health-centre building.
2. **CHUA "Como chegar" page for the SUBs:** "Urbanização dos Caliços 8200-200 Albufeira Telefone: 289598400". Source: [chualgarve.min-saude.pt](https://www.chualgarve.min-saude.pt/como-chegar/servicos-de-urgencia-basica-subs/), according to the search result; the host didn't resolve from here.
3. **ARS Algarve:** the same network notice as for Loulé says the Albufeira SUB works at the Centro de Saúde de Albufeira.
4. **OpenStreetMap:** way 760612149 is `building=public`, `name=Centro de Saúde de Albufeira`. The SNS units USF Sol Nascente, USF Albufeira and UCC Al-Buhera (nodes 9743903175, 1208020694, 9743903176) are at the same building.
5. **Still operating:** a 2026 report says the ULS do Algarve runs the Albufeira SUB, open 24 hours. Sources: [Observador, 2026-08-04](https://observador.pt/2026/08/04/uls-do-algarve-ja-pode-alojar-medicos-num-t2-em-abufeira-ao-abrigo-de-protocolo/), [Postal](https://postal.pt/edicaopapel/albufeira-disponibiliza-t2-para-atrair-medicos-e-assegurar-urgencia-24-horas/).

**Decision:** the sources agree, so the point moved onto the building centre. The move is only 22 m, but the row is now tied to the OSM building and no longer to a rounded coordinate.

A detail that doesn't change the decision: the municipal contact list gives the SUB its own phone number, 289 588 770, while 289 598 400 belongs to the health centre. Source: [albufeira.com](https://albufeira.com/info/pt/contactos/).

### SUB Estremoz: confirmed operating, kept

1. **SNS export:** SUB Estremoz, Av. 9 de Abril, 7100-500. The export's coordinate is 422 m south-east of the health centre, which looks like a geocode of the town again.
2. **OpenStreetMap:** way 573923685 is `name=Centro de Saúde de Estremoz` (operator ULS Alentejo Central). The existing point, node 9723349238 "UCSP Estremoz" with `addr:street=Avenida 9 de Abril`, sits on that building, about 30 m from its centre.
3. **Câmara Municipal de Estremoz, minutes no. 17/2026 (meeting of 19 August 2026):** according to the search summary, the concelho has a basic emergency service working 24 hours, which also serves neighbouring concelhos. Source: [cm-estremoz.pt](https://www.cm-estremoz.pt/anexos/view/ata-n-o-17-2026-reuniao-ordinaria-de-19-de-agosto-de-2026-070926044341).
4. **ULS Alentejo Central:** an urgent public tender for medical services at the SUB de Estremoz, for 1 February to 31 December 2026. Source: [O Digital](https://odigital.sapo.pt/uls-alentejo-central-lanca-concurso-publico-urgente-para-reforco-medico-no-sub-de-estremoz/).
5. **Location:** a municipal news item headed "Serviço de urgência do centro de saúde de Estremoz reabre…" (2020) places the service in the health centre. Source: [cm-estremoz.pt](https://www.cm-estremoz.pt/noticias/servico-de-urgencia-do-centro-de-saude-de-estremoz-reabre-este-sabado).

**Decision:** the SUB exists and is operating in 2026 (sources 3 and 4), and it is in the health centre (sources 1, 2 and 5). The point stays where it was. The note now records the second sources in the existing `note` column; no new mechanism was needed.

## Effect on the data

- The nearest emergency service changed for 38 parishes and 6 concelhos. Nothing else changed. In each case the facility is the same SUB, and only the distance and time changed. Concelhos, measured from the seat:
  - Lagos: 1 min, 0.6 km → 3 min, 2.4 km
  - Aljezur: 33 min, 33.1 km → 31 min, 31.9 km
  - Vila do Bispo: 26 min, 25.0 km → 24 min, 23.9 km
  - Loulé: 2 min, 1.2 km → 2 min, 1.9 km
  - São Brás de Alportel: 15 min, 13.0 km → 15 min, 12.6 km
  - Albufeira: 3 min, 2.2 km → 3 min, 2.1 km
- Grid: `grid-37e2a144` → `grid-f0407dde`, still 419 files and 2.2 MiB. The old directory was removed by the build.

## Tests

- **pytest** (`tests/test_services.py`):
  - `test_verified_sub_positions`: each of the four rows has the verified OSM object, coordinate and note, and has moved more than 20 m off the old point.
  - `test_verified_sub_positions_built`: the built `web/data/services.json` has each one within 10 m.
- **e2e** (`nearby-services.spec.ts`), "the overlay draws … at its verified position" ×4: an emergency dot is rendered within 15 m of the verified point. For Loulé and Lagos, nothing is rendered within 300 m of the old point. These also run against production.

## Still open

- **Loulé:** a new SUB is planned at the entrance to the town (Sul Informação, November 2025). Once it opens, this row must move.
- **SNS export:** the export is from May 2023 and was out of date for Lagos. Other rows could be stale in the same way, through moves after the 2024 ULS reform. A newer SNS list would settle it.
