# Autonomia de publicação alta — design

Data: 03/10/2026. Origem: respostas do dono ao grill-me sobre regras de publicação, apuração e revisão. Filha da spec mestre; em conflito com a regra 8 de `CLAUDE.md` §5 ("Segurança e breaking news nunca publicam sozinhas"), **vale esta spec por decisão expressa do dono**, e a regra deve ser atualizada.

## 1. Entendimento

O dono quer o nível de automação sem humano muito alto, volume e atualização frente aos portais concorrentes, e nenhum atraso de publicação. Humano só em dois casos: conteúdo **extremamente duvidoso** ou **fontes que divergem entre si**.

Retrato de partida (7 dias em produção): cerca de 147 publicadas sozinhas e cerca de 615 paradas (política 285, segurança 170, saúde 36, cidade 61, economia 27). Principais travas: modo `review` em política, saúde e segurança, bloqueio de segurança, mínimo de 0,5 de score (notícia de 1 fonte com mais de 6 h cai a 0,44) e `neverAuto` para sensível e urgente.

## 2. Decisões do dono (rulings)

- **A1** Score mínimo global **0,30**.
- **A2** Publicam sozinhos: segurança, política, saúde, tema sensível e urgente.
- **A3** Política: 1 veículo independente **ou** 1 fonte oficial, score > 0,30.
- **A4** Segurança sem bloqueio: publica sempre.
- **A5** Saúde: publica tudo desde que a **fonte original seja citada** (efeito legal).
- **A6** Notícia de 1 fonte: se a fonte é confiável (grandes sites, fonte oficial), publica direto, **sem espera**, sempre citando a fonte.
- **A7** Sem varredura extra de tema sensível: publica se a fonte for confiável.
- **A8** Limites maiores: sem atraso de publicação. Teto de 60 por hora e 800 por dia só como disjuntor contra erro de pipeline, não como freio editorial.
- **A9** 3 denúncias na mesma matéria: gera urgência no admin e um banner de aviso "em revisão" na própria matéria (a matéria continua no ar).
- **A10** O estado "em apuração" some do público; só admin e editor o veem.
- **A11** Fila de revisão com prazos curtos e sem arquivar notícia por "expirou": o que vence o prazo passa pelo revisor automático.
- **A12** À noite (20h às 6h, America/Cuiabá) o **revisor automático** decide o que subiu para aprovação, sempre privilegiando o conteúdo; de dia o humano liga ou desliga esse revisor no painel.
- **A13** Continuam com duas pessoas: alterar regras, religar a publicação automática, push urgente, retomar envios, papéis de admin.
- **A14** Evento enviado por leitor: aprovação automática quando a data é futura, o local é conhecido, não há link nem palavrão e o leitor não passou do limite diário; o resto vai para humano.
- **Ficam humanos por lei:** correção, direito de resposta e resposta a denúncia.

- **A15** Portal regional (pedido do dono): destaque, manchete e **urgência** só para notícia local ou regional (`news_scope` `cuiaba` ou `mt`, ver spec de destaques, R20 a R23); nacional só em área de destaque ou urgência quando for de comoção nacional. Notícia nacional sem comoção continua publicando sozinha nas editorias, mas **sem** o rótulo de urgente e sem push urgente. O marcador `urgent` do `classify` é rebaixado quando `news_scope = national` e não há `national_commotion`.

- **A16** Publicar **por inteiro e 100% disponível** (pedido do dono, com print da página de assunto): nada vai ao ar incompleto nem com bloco "ainda será preenchido". Antes de publicar, a matéria precisa ter corpo completo (acima do mínimo de palavras da editoria, sem parágrafo cortado), fonte citada e capa já decidida (foto aprovada ou cartão tipográfico final, nunca "imagem depois"); o que faltar espera no passo anterior por até 10 minutos (reprocessa imagem ou texto) e, se não completar, cai no cartão tipográfico e publica. Páginas públicas nunca mostram estados vazios do tipo "Nada registrado até agora"; bloco sem conteúdo não aparece.

## 3. Regras de redação que substituem o portão humano (em vez de depender de revisão)

Como segurança, política e saúde publicam sozinhas, o agente `write` ganha regras fixas de redação: presunção de inocência ("suspeito", "acusado", "segundo a polícia", nunca "culpado" antes de condenação), nenhuma identificação de menor de idade nem de vítima de violência sexual, nenhum detalhe de método em caso de suicídio, saúde sem orientação clínica nem promessa de cura, atribuição sempre à fonte ("segundo {fonte}"), e a linha final "Com informações de {fonte}" com link. Conteúdo que o próprio agente marque `dubious` (não conseguiu atribuir, fonte única não confiável com acusação grave a pessoa, conflito) sobe para o revisor automático ou para humano.

## 4. Arquitetura

- **Regras v3** (`rules` ativa nova): `minScore 0.30`, `forceReview false`, todas as editorias `auto` (segurança incluída), `minSources 1`, `requirePrimary false`, `requireApprovedImage false`; `sensitiveTopics` vazia e `neverAuto = []`. Nova proposta nasce inativa; a ativação exige o aprovador (duas pessoas) e é feita pelo dono no painel de governança.
- **`decidePublication`:** os portões passam a ser, em ordem: entrada inválida; `read_only` ou `auto_publish` desligado; rascunho sem IA; **fontes divergentes confirmadas**; **duvidoso**; fonte não confiável com assunto grave (acusação a pessoa, saúde individual, segurança) e sem segunda fonte; score < 0,30; modo. `breaking`, `sensitive` e segurança deixam de ser portões.
- **Fonte confiável:** coluna `sources.trusted boolean` (padrão `reliability in ('primary','verified')`); o Painel de Fontes ganha o campo; grandes sites começam `trusted = true` por decisão do admin.
- **Checklist automático** na publicação automática: conserta (gera `alt`, SEO, taxonomia) e só retira o que não dá para consertar (matéria sem fonte citada).
- **Disjuntor** de volume e de erro (60 por hora, 800 por dia; pico de denúncias; falha de IA) que pausa a publicação automática e avisa.
- **Denúncias:** função `report_escalate` na terceira denúncia em 24 h: abre item urgente na fila do admin e liga `articles.review_banner`; o banner público diz "Esta matéria está em revisão"; um humano resolve e desliga.
- **Revisor automático** (`ai_reviewer`): modos `off`, `night` (padrão), `always`, configurado no Interruptores; lê itens `in_review` por `review_reason` e decide `publish`, `hold` ou `archive` com justificativa gravada em `decisions`; nunca decide correção, direito de resposta, denúncia nem mudança de regra; respeita orçamento de IA.
- **Prazos da fila:** `articles.due_at` preenchido por regra (urgente 10 min, demais 30 min); vencido, passa ao revisor automático.
- **`topics.state`:** transições automáticas (confirmado com 2 veículos ou 1 oficial; corrigido ao publicar correção; encerrado após 7 dias sem novidade); visível só no Estúdio.
- **Backlog:** ao ativar a v3, reprocessar `rules` dos itens `in_review` em lotes e acompanhar o disjuntor.

## 5. Riscos assumidos pelo dono e mitigações

Publicar crime, saúde e política sem revisão humana aumenta o risco de ação por difamação, de exposição de menores e de dano a terceiros. Mitigações incluídas: regras de redação da §3, fonte sempre citada, desfazer em um clique (`unpublishAuto`), banner e retirada por denúncia, disjuntor, revisor automático, trilha de auditoria. A decisão e a responsabilidade são do dono; fica registrada em `.planning/DECISIONS.md` e na regra 8 de `CLAUDE.md`.

## 6. Testes

Unitários de `decidePublication` para cada portão e para o caminho "publica" de segurança, política e saúde com fonte confiável; de `explain`/regras v3; da escalada de denúncia; do revisor automático (janela noturna, modos, orçamento); do disjuntor; do preenchimento de `due_at`; das transições de `topics.state`. e2e: matéria de segurança aparece publicada com "Com informações de {fonte}", banner de revisão aparece após 3 denúncias, estado de apuração não aparece no público. Relatório de impacto: contagem de publicadas por hora antes e depois nas primeiras 24 h.
