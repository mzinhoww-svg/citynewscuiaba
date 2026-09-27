# Registro inicial de fontes reais · Cuiabá, Várzea Grande e Mato Grosso

Primeira lista de relevância para abrir e validar. A **relevância (1 a 5) é hipótese editorial**, não é medição de audiência. Os critérios foram: foco em Cuiabá e Várzea Grande, fonte primária oficial, presença nas listas públicas de clipping de veículos de MT e citação em estudos acadêmicos como portais principais da região metropolitana (Gazeta Digital, RDNews e Olhar Direto). O ranking real vem do uso (`docs/tracking-plan.md`).

**Status de todas: `paused`.** No P3 (Task 3), o Claude Code descobre o feed (autodiscovery `<link rel="alternate">`, `/feed`, `/rss`, `sitemap-news.xml`), confere o `robots.txt` e os termos de uso, roda `testConnection` e só então ativa. Quando uma fonte não tem feed nem sitemap, vira `page` com extração por Readability, limitada a 1 requisição por minuto. Os domínios marcados "a confirmar" podem ter mudado.

| Relev. | Camada | Fonte | Domínio | Editorias | Localidade | Texto | Imagem | Observação |
|---|---|---|---|---|---|---|---|---|
| 5 | 1 Oficial | Governo de Mato Grosso (Secom) | www.mt.gov.br | cidade, servicos, economia, saude, agenda | mt | resumo 2 frases | reprodução | Notícias oficiais do Estado; verificar termos de uso das fotos (costuma permitir com crédito) |
| 5 | 1 Oficial | Prefeitura de Cuiabá | www.cuiaba.mt.gov.br | cidade, servicos, agenda, saude | cuiaba | resumo 2 frases | reprodução | Serviços, obras, trânsito, agenda municipal |
| 5 | 1 Oficial | Prefeitura de Várzea Grande | www.varzeagrande.mt.gov.br | cidade, servicos, agenda | varzea-grande | resumo 2 frases | reprodução | Serviços e obras de VG |
| 5 | 2 Portal local | Gazeta Digital | www.gazetadigital.com.br | cidade, politica, economia, esportes, cultura | cuiaba | só link | reprodução | Citado como um dos principais portais da região metropolitana |
| 5 | 2 Portal local | Olhar Direto | www.olhardireto.com.br | cidade, politica, economia | cuiaba | só link | reprodução | Também Olhar Conceito, Agro Olhar, Olhar Jurídico, Olhar Esportivo |
| 5 | 2 Portal local | RDNews | www.rdnews.com.br | politica, cidade, cultura | cuiaba | só link | reprodução | Citado como um dos principais portais da região metropolitana |
| 5 | 2 Portal local | MidiaNews | www.midianews.com.br | politica, cidade, economia | cuiaba | só link | reprodução |  |
| 5 | 2 Portal local | g1 Mato Grosso | g1.globo.com/mt/mato-grosso/ | cidade, politica, economia, esportes | mt | só link | reprodução | TV Centro América; feed do g1 por estado a confirmar |
| 4 | 1 Oficial | Assembleia Legislativa de MT | www.al.mt.gov.br | politica | mt | resumo 2 frases | reprodução | Votações, leis estaduais |
| 4 | 1 Oficial | Câmara Municipal de Cuiabá | www.camaracuiaba.mt.gov.br | politica, cidade | cuiaba | resumo 2 frases | reprodução | Domínio a confirmar |
| 4 | 1 Oficial | Defesa Civil de MT | www.defesacivil.mt.gov.br | servicos, clima | mt | resumo 2 frases | reprodução | Alertas; domínio a confirmar |
| 4 | 1 Oficial | INMET | portal.inmet.gov.br | clima | nacional | resumo 2 frases | nenhuma | Alertas e previsão para Cuiabá e VG |
| 4 | 2 Portal local | FolhaMax | www.folhamax.com | politica, cidade | cuiaba | só link | reprodução |  |
| 4 | 2 Portal local | HiperNotícias | www.hnt.com.br | cidade, politica | cuiaba | só link | reprodução | Domínio a confirmar |
| 4 | 3 Temático | Olhar Conceito | www.olhardireto.com.br/conceito/ | cultura, entretenimento, gastronomia | cuiaba | só link | reprodução | Cultura e agenda de Cuiabá |
| 4 | 3 Temático | Agro Olhar | www.olhardireto.com.br/agro/ | economia | mt | só link | reprodução | Agronegócio |
| 3 | 1 Oficial | Tribunal de Justiça de MT | www.tjmt.jus.br | politica, cidade | mt | resumo 2 frases | reprodução | Decisões e serviços do Judiciário |
| 3 | 1 Oficial | Ministério Público de MT | www.mpmt.mp.br | politica, cidade | mt | resumo 2 frases | reprodução |  |
| 3 | 1 Oficial | Tribunal de Contas de MT | www.tce.mt.gov.br | politica, economia | mt | resumo 2 frases | reprodução |  |
| 3 | 1 Oficial | TRE-MT | www.tre-mt.jus.br | politica | mt | resumo 2 frases | reprodução | Relevante no ciclo eleitoral |
| 3 | 1 Oficial | Diário Oficial de MT (IOMAT) | www.iomat.mt.gov.br | politica, cidade | mt | resumo 2 frases | nenhuma | Atos oficiais; sem imagens |
| 3 | 2 Portal local | Repórter MT | www.reportermt.com.br | cidade, politica | mt | só link | reprodução | Domínio a confirmar |
| 3 | 2 Portal local | Diário de Cuiabá | www.diariodecuiaba.com.br | cidade, politica | cuiaba | só link | reprodução |  |
| 3 | 2 Portal local | Circuito Mato Grosso | circuitomt.com.br | politica, economia | mt | só link | reprodução | Domínio a confirmar |
| 3 | 2 Portal local | O Documento | www.odocumento.com.br | politica | mt | só link | reprodução | Domínio a confirmar |
| 3 | 2 Portal local | Leia Agora | www.leiagora.com.br | cidade, politica | mt | só link | reprodução | Domínio a confirmar |
| 3 | 3 Regional | Só Notícias | www.sonoticias.com.br | cidade, economia | mt | só link | reprodução | Norte de MT (Sinop); útil para pauta estadual |
| 3 | 3 Temático | Olhar Esportivo | www.olhardireto.com.br/esportes/ | esportes | mt | só link | reprodução | Cuiabá EC, Mixto, Arena Pantanal |
| 3 | 3 Temático | Imea | www.imea.com.br | economia | mt | resumo 2 frases | nenhuma | Boletins do agro; dados, sem imagem |
| 3 | 4 Nacional | Agência Brasil (EBC) | agenciabrasil.ebc.com.br | politica, economia, cidade | nacional | resumo 2 frases | reprodução | Conteúdo sob licença Creative Commons com atribuição; confirmar termos vigentes |
| 2 | 4 Nacional | Canal Rural | www.canalrural.com.br | economia | nacional | só link | reprodução | Agro nacional |
| 2 | 4 Nacional | CNN Brasil · Mato Grosso | www.cnnbrasil.com.br/nacional/centro-oeste/mt/ | cidade, politica | nacional | só link | reprodução | Cobertura nacional sobre MT |

## Regras de coleta (valem para todas)

- User-agent identificado: `CityNewsBot/1.0 (+https://<dominio>/sobre#robo)`. Respeitar `robots.txt`, `Crawl-delay` e o limite de `rate_limit_per_hour`.
- Texto: título original, data, link e, quando a política for `summary_2_sentences`, resumo de até 2 frases escrito pelo CityNews. Nunca copiar o corpo.
- Imagem: política `reproduction` (decisão A-010): a imagem da matéria original aparece com o rótulo **REPRODUÇÃO · nome da fonte**, crédito do fotógrafo quando houver e link para o original. Não pode haver recorte que remova crédito ou marca d'água. A remoção a pedido do titular acontece em até 24 h (`/contato` e `reports.kind = 'image'`).
- Opt-out: qualquer veículo pode pedir exclusão ou mudança de política. O pedido é atendido no Control Center (O04) e registrado na auditoria.
- Fontes de segurança pública (Sesp, polícias) ficaram fora desta primeira lista porque a editoria Segurança é bloqueada para publicação automática. Elas entram depois, com revisão humana.

## Próximas a avaliar

Cuiabá Mais, MT Mídia, Página Única, Estadão Mato Grosso, emissoras de rádio e TV com portal próprio, e perfis oficiais de secretarias (SES, Sinfra, Detran, Sema). Entram após o primeiro mês de dados, pelo painel de recomendação (O17).
