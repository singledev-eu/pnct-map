# Pedido de esclarecimento: freguesias PNCT (rascunho, não enviado)

Two drafts in pt-PT: one to IEFP and one for the Finanças e-Balcão. They cite the documents in `data/sources/pnct-legal-status.md`. Not sent. Review them, then send from your own email or the e-Balcão.

---

## 1. Para o IEFP

**Para:** IEFP, I.P. (contacto geral / Centro de Contacto)
**Assunto:** Lista «Territórios PNCT» de 04-02-2026: freguesias de Dem, São Bento e União das Freguesias da Raiva, Pedorido e Paraíso

Exmos. Senhores,

Mantenho um mapa informativo, não oficial, das freguesias abrangidas pelo Programa Nacional para a Coesão Territorial (PNCT), em https://pnct.singledev.eu. Ao comparar a lista «Territórios PNCT» publicada pelo IEFP com data de 04-02-2026 (https://www.iefp.pt/documents/10181/4287418/Territorios+PNCT_04-02-2026.pdf) com o anexo da Portaria n.º 208/2017, de 13 de julho (Diário da República, 1.ª série, n.º 134, de 13 de julho de 2017, pp. 3731–3734), encontrei três diferenças. Agradecia um esclarecimento:

a) **Dem (concelho de Caminha) e São Bento (concelho de Porto de Mós).** Ambas constam do anexo da Portaria n.º 208/2017 (Alto Minho: Caminha; Região de Leiria: Porto de Mós), e também do anexo da Deliberação n.º 20/2018 da CIC Portugal 2020. Não constam, porém, da lista do IEFP de 04-02-2026. Trata-se de uma omissão, ou há um fundamento para a sua exclusão? Nesse caso, qual é o diploma?

b) **União das Freguesias da Raiva, Pedorido e Paraíso (concelho de Castelo de Paiva; desde 2025, as freguesias de Raiva, Pedorido e Paraíso).** Para Castelo de Paiva, o anexo da Portaria n.º 208/2017 indica apenas a freguesia de Real. A União das Freguesias da Raiva, Pedorido e Paraíso foi aditada à lista de territórios de baixa densidade pela Deliberação n.º 20/2018 da CIC Portugal 2020, de 12 de setembro de 2018. A lista do IEFP inclui as três freguesias. Qual é o fundamento legal desta inclusão? A Portaria n.º 208/2017 foi alterada nesse sentido?

Gostaria ainda de saber qual o diploma ou critério que serve de base à lista do IEFP, uma vez que o documento não o refere.

Com os melhores cumprimentos,

Mike Kostenko, pnct.singledev.eu

---

## 2. Variante para o e-Balcão das Finanças (AT)

**Tema sugerido:** Benefícios fiscais / Estatuto dos Benefícios Fiscais, territórios do interior
**Assunto:** Freguesias abrangidas pela Portaria n.º 208/2017 (territórios do interior)

Exmos. Senhores,

Mantenho um mapa informativo, não oficial, dos territórios do interior (PNCT), em https://pnct.singledev.eu, e pretendo indicar corretamente, para efeitos fiscais, que freguesias estão abrangidas. A delimitação consta do anexo da Portaria n.º 208/2017, de 13 de julho (Diário da República, 1.ª série, n.º 134, pp. 3731–3734), que regulamenta o n.º 4 do artigo 41.º-B do Estatuto dos Benefícios Fiscais. Agradecia o vosso esclarecimento sobre dois pontos:

a) **Dem (Caminha) e São Bento (Porto de Mós)** constam do anexo da Portaria n.º 208/2017, mas não da lista «Territórios PNCT» publicada pelo IEFP em 04-02-2026. Para efeitos dos benefícios fiscais que remetem para a Portaria, estas freguesias consideram-se territórios do interior?

b) **União das Freguesias da Raiva, Pedorido e Paraíso (Castelo de Paiva; desde 2025, Raiva, Pedorido e Paraíso).** Não consta do anexo da Portaria n.º 208/2017, que para Castelo de Paiva indica apenas Real. Foi aditada à lista de territórios de baixa densidade pela Deliberação n.º 20/2018 da CIC Portugal 2020 (fundos europeus). A lista do IEFP de 04-02-2026 inclui-a. Estas freguesias contam como territórios do interior para os benefícios fiscais? A Portaria n.º 208/2017 foi alterada ou retificada nesse sentido? A versão consultada no Portal das Finanças indica «Histórico de alterações: -».

Pergunto ainda: nas uniões de freguesias desagregadas em 2025 (Lei n.º 25-A/2025), as novas freguesias herdam a classificação da união que consta do anexo?

Com os melhores cumprimentos,

Mike Kostenko, pnct.singledev.eu

---

### Notes (EN, not part of the emails)

- **Documents cited:**
  - Portaria 208/2017: https://files.diariodarepublica.pt/1s/2017/07/13400/0373103734.pdf
  - Deliberação CIC 20/2018: https://www.compete2020.gov.pt/admin/images/Deliberacoes_cic_territ%C3%B3rios_baixa_densidade.pdf
  - IEFP list: https://www.iefp.pt/documents/10181/4287418/Territorios+PNCT_04-02-2026.pdf
  - AT legislation entry: https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Portaria_208_2017.pdf
- **The AT question is the one that decides the tax benefits.** An answer from the e-Balcão isn't a binding ruling (*informação vinculativa*). For certainty on a specific case, a binding-ruling request is the formal route.
- **When answers arrive:** update `data/pnct_status.csv` (status, legal_status, sources, checked) and `data/sources/pnct-legal-status.md`, then rebuild (`make web-data`, `python -m insights prepare`).
