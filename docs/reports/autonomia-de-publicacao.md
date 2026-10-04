# Autonomia de publicação alta: AUT-T1 a T7, script e consulta do T8

Data: 03/10/2026 (rodada 1) e 04/10/2026 (rodada 2, AUT-T5 a T7). Branch do worktree da rodada 1: `worktree-agent-a281f8cc1a073cacb`; da rodada 2: `worktree-agent-adfa9a52cb5f1aaa0`. Spec: `docs/superpowers/specs/2026-10-03-autonomia-de-publicacao-design.md` (A1 a A16) e R32/R41 da rodada 3. Plano: `docs/superpowers/plans/2026-10-03-autonomia-de-publicacao.md`. Decisões: `.planning/DECISIONS.md` A-106 a A-112.

**Nada foi ativado nem rodado em produção.** As regras v3 são só uma proposta inativa e o script nunca foi apontado para a produção. A rodada 2 (seção abaixo) também não tocou a produção: as migrations 0140 a 0142 só foram aplicadas na pilha local.

## O que entrou

| Tarefa | Entrega |
|---|---|
| AUT-T1 | `decidePublication` com os portões novos (conflito confirmado, `dubious`, fonte não confiável com assunto grave e sem segunda fonte, score 0,30); `breaking`, `sensitive` e segurança deixam de ser portão nas regras v3. `RuleSet` ganha `neverAuto`, `breakingReview` e `sensitiveFlagReview`. `RULES_V3` e `supabase/bootstrap/rules-v3-proposal.sql` (inativa, com pedido `safety.disable` pendente). `src/lib/rules/dubious.ts`. |
| AUT-T2 | `sources.trusted` (0071, backfill primary/verified) editável no Painel de Fontes; `appendCreditLine` ("Com informações de {fonte}" com link, bloco `credit` na leitura pública, componente `CreditLine`); regras de redação no `write` (reforçadas em segurança, política e saúde); `verify` expõe `dubious` e `sourceTrusted`. |
| AUT-T3 | `src/lib/geo/news-scope.ts`; `articles.news_scope` e `national_commotion` (0072); a etapa de regras grava o escopo e rebaixa `urgent` de nacional sem comoção; `classify` marca comoção; push urgente recusado para nacional sem comoção (as duas portas do Estúdio); faixa Urgente da home aceita matéria automática local. |
| AUT-T4 | `auto-checklist.ts` (`autoChecklist`, `isComplete`, mínimo de 30 linhas, `short_reason`), `breaker.ts` e `breaker-store.ts`, migration 0073 (`publish_breaker`, `publish_counts`, `publish_breaker_trip/reset/set_limits`, `articles.short_reason`), comandos de limite e reset em `src/lib/studio/switches.ts`, aviso `breaker_open`. |
| AUT-T8 (script) | `scripts/release-backlog.mjs`. |

### Como as regras antigas continuam fechadas

O corpo de regras sem o campo `neverAuto` (v1 e v2 em produção) é lido como antes: segurança bloqueada, breaking e sensível em revisão. Só o corpo v3 explícito (`neverAuto: []`, `breakingReview: false`, `sensitiveFlagReview: false`) libera. Assim o deploy do código não muda o comportamento até o dono ativar a v3.

### Portões na ordem

invalid_input → breaking (se a regra o mantém) → tema sensível da tabela → sensível do agente (idem) → forceReview → `neverAuto` (hold) → categoria desconhecida → modo `blocked` → conflito confirmado → `dubious` → fonte não confiável + grave + 1 fonte → fontes mínimas → fonte primária → imagem → score → modo. Em `routeArticle`: rascunho sem IA, `auto_publish` desligado e `read_only` continuam levando à revisão.

No `publish` (depois da regra): disjuntor → checklist (só `no_source` e `no_title` barram) → completude (corpo, fonte, capa) → publica.

## Migrations (numeração 0070+, a pedido)

| Arquivo | Conteúdo |
|---|---|
| `0070_auto_publish_unblock.sql` | remove a constraint `rules_seguranca_blocked`; remove a trava D12 de `promote_topic_on_publish` (sem isso a matéria automática de segurança ou urgente ficaria sem página de assunto); `dubious` no contexto de decisão |
| `0071_source_trusted.sql` | `sources.trusted`, backfill, `source_admin_update` com `trusted`, `sourceTrusted` no contexto |
| `0072_news_scope.sql` | `articles.news_scope`, `articles.national_commotion`, bairros e localidades no contexto |
| `0073_breaker.sql` | `articles.short_reason`, `publish_breaker`, contagens, abrir, resetar e editar limites |

Todas aditivas e idempotentes, nenhuma função nova usa `DELETE`. **Aplicar as quatro antes do deploy do app**: o código lê colunas novas (`sources.trusted`, `articles.news_scope` e outras) e falha sem elas. As migrations 0070 a 0072 redefinem `pipeline_decision_context` por inteiro (a última vence); o seed de desenvolvimento foi alinhado (corpo da v1 com os campos novos e `trusted` para primary e verified).

## Ativação (com o dono, nesta ordem)

1. Conferir em produção, só leitura: migrations 0070 a 0073 aplicadas (hash) e `select version, active, approved_by from rules`.
2. Aplicar `supabase/bootstrap/rules-v3-proposal.sql` (cria a versão seguinte, inativa, e o pedido `safety.disable` pendente).
3. No painel de governança, o dono aprova (aprovador diferente do proponente de sistema) e ativa a v3.
4. Ligar `auto_publish` se estiver desligado (duas pessoas).
5. Ensaio: `node --env-file=<env produção> scripts/release-backlog.mjs`.
6. Liberar: `node --env-file=<env produção> scripts/release-backlog.mjs --apply --confirm-host=<host> --wait` (ou sem `--wait`, repetindo a cada hora).
7. Acompanhar 24 h: publicadas por hora, disjuntor, denúncias; preencher o "antes e depois" abaixo.

### `scripts/release-backlog.mjs`

- Padrão é ensaio (`--dry-run`): lê regras ativas, flags, contadores do disjuntor, elegíveis e motivos de revisão; não escreve nada. `--apply` é explícito e não convive com `--dry-run`; fora do banco local exige `--confirm-host=<host>` igual ao host.
- Elegíveis: `in_review`, sem `publish_mode`, do pipeline (`agent_id` e assunto), sem rascunho sem IA e sem edição humana. Do mais recente para o mais antigo (`--max-age-days` limita).
- Lotes de 50 (até 100): enfileira a etapa `rules` na fila `pipeline` (`queue_enqueue`, chave `rules:article:<id>`) e espera o worker.
- Recusa liberar: regras antigas ativas (`--allow-legacy-rules` ignora), `auto_publish` desligado, modo leitura, disjuntor aberto, pico de denúncias ou de falha de IA. Respeita o teto da hora e do dia (`--wait` espera a janela abrir).
- Relatório: lote a lote, publicadas por hora nas últimas 24 h (fuso de Cuiabá), motivos de revisão e em revisão antes e depois (`--out` grava JSON).
- No teto de 60 por hora, 660 matérias levam cerca de 11 h. O teto vem do disjuntor (A8) e é editável pelo admin.

## Rodada 2: AUT-T5, AUT-T6 e AUT-T7 (A9 a A14)

Migrations 0140 a 0142 (faixa exclusiva da rodada, sem comando de remoção nos arquivos; aditivas e idempotentes). Aplicar depois das 0070 a 0073, antes do deploy do app.

| Tarefa | Entrega |
|---|---|
| AUT-T5 | `report_escalate()` (gatilho em `reports`, 0140): a 3ª denúncia aberta em 24 h na mesma matéria abre **um** item `review_escalations` (`report_urgent`) e liga `articles.review_banner`; a 4ª só atualiza a contagem. Não contam direito de resposta (fluxo próprio), denúncia respondida, fora das 24 h nem as anteriores à última resolução humana. Aviso em `notifications` (Control Center e plantão, `notify_once`, crítico), auditoria `report.escalate` e `pg_notify('studio_event')` como gancho para a central do Estúdio (a tabela `studio_notifications` ainda não existe no main). Banner público `ReviewBanner`: "Esta matéria está em revisão", sem explicação, `aside` (nunca `role="status"`, para não disputar com o aviso de atualização); a matéria segue no ar. `report_escalation_resolve` (moderação e admin) encerra o item e desliga o banner; `resolveEscalation` no Estúdio e bloco "Urgente" no topo de `/estudio/denuncias`; contagem na Governança. |
| AUT-T6 | Agente `reviewer` (R$ 1 por dia, cedido por `write`, que passa a R$ 9; teto global segue R$ 30) e `ReviewSchema` (`publish`, `hold`, `archive` + justificativa). `ai_reviewer_settings.mode` (`off`, `night`, `always`; padrão `night`, 20h às 6h em America/Cuiaba) editável por admin nos Interruptores com motivo. `articles.due_at` por gatilho (urgente 10 min, demais 30 min; o que já estava em revisão nasce vencido). `review_due_articles` entrega só matéria do pipeline, sem edição de pessoa, sem denúncia, direito de resposta, correção ou escalada abertos e que o revisor ainda não segurou. Rota `POST /api/ingest/review-tick` a cada 5 min (pg_cron na 0141, mais o watchdog do GitHub). `runReviewTick`: respeita o modo e a janela, só age com `auto_publish` ligado e fora do modo leitura, para no orçamento de IA, grava a decisão `review` com a justificativa. Publicar passa pelos mesmos portões do passo de publicação (disjuntor, título, fonte citada, corpo cortado; capa que não veio vira cartão tipográfico; corpo curto publica com `short_reason`). Manter deixa a justificativa em `review_reason` para a pessoa ler. Arquivar só pelo conteúdo: motivo de prazo ("expirou", "venceu") vira manter. Veredito inválido ou texto com instrução embutida vira manter; falha do provedor não decide e tenta de novo. |
| AUT-T7 | `nextTopicState` (confirmado com 2 veículos ou 1 fonte oficial; corrigido ao publicar correção; encerrado após 7 dias sem novidade; só avança; novidade reabre o encerrado). A etapa `verify` grava `topics.state`; gatilho em `corrections` marca `corrigido` (0142); `topic_close_stale` encerra por tempo (chamada a cada 5 min pela rota do revisor, independente do modo). Estado visível só no Estúdio (linha "Assunto · Situação" na matéria); o público segue sem nenhum estado. Agenda de leitor: `canAutoApproveEvent` (data futura, local já presente na agenda confirmada, sem link nem palavrão, até 3 sugestões por e-mail por dia de Cuiabá); `autoApproveSubmission` cria o evento (`origin = reader`, categoria inferida do título), marca a sugestão aprovada sem `decided_by` e grava a decisão `event_auto`; o resto segue para a fila humana (E13). O formulário mostra "Evento publicado na Agenda" quando entrou na hora. |

### Decisões desta rodada (para o `DECISIONS.md`)

- **A-113 (T5).** Escalada por denúncias: 3 abertas em 24 h na mesma matéria; direito de resposta não conta; só denúncias posteriores à última resolução humana contam; um item aberto por matéria. `review_escalations.article_id` sem chave estrangeira (apagar matéria nunca prende a fila). Resolver reaproveita a ação de auditoria `report.respond` (a lista de ações é fechada e repetida em várias migrations; ficou fora dela de propósito).
- **A-114 (T6).** O revisor é agente novo (`reviewer`, R$ 1 de `write`); o modo mora em `ai_reviewer_settings` (três valores, não cabe em `feature_flags`); mudar o modo é do admin, sem segunda pessoa (A13 não lista o revisor); o revisor só age com a publicação automática ligada. O que já estava em `in_review` na 0141 nasce vencido. Decisão gravada em `decisions` com `step = review`.
- **A-115 (T7).** Verificar é novidade (reabre assunto encerrado); o encerramento por tempo é só a varredura. Agenda automática: limite de 3 por e-mail por dia; "local conhecido" = `event_listings` confirmados; falha na aprovação automática nunca perde a sugestão.

### Preocupações da rodada 2

1. **Backlog sem linha de crédito.** Matéria escrita antes do AUT-T2 não termina com "Com informações de {fonte}". O passo `publish` e o revisor tratam isso como `no_source` e seguram (o `forced_publish_batch` do banco é o único que acrescenta a linha). Os 660 do acúmulo provavelmente ficam retidos até serem reescritos ou receberem a linha; vale decidir antes de rodar o `release-backlog`.
2. **Orçamento do revisor.** R$ 1 por dia comporta algumas dezenas de decisões; o acúmulo de 660 não zera sozinho pelo revisor (o script de liberação continua sendo o caminho). Se o dono quiser mais, é redistribuir o teto de R$ 30 no Control Center (duas pessoas).
3. **Assunto encerrado sai de "em andamento".** `fetchActiveTopics` (home, módulos de assuntos) já exclui `encerrado`; com a varredura, assunto parado há 7 dias deixa esses blocos. É o efeito esperado, mas muda o público.
4. **Primeira passada do revisor.** Com o acúmulo marcado como vencido, à noite ele pega 8 por passada (urgente primeiro, depois o mais antigo) até o orçamento acabar.
5. **Reuso de ações de auditoria.** Modo do revisor usa `flag.set` (objeto `flag:ai_reviewer`); resolver escalada usa `report.respond`. Evita mexer na lista fechada que outras frentes também alteram.
6. **Tipos do banco.** `src/lib/db/types.ts` foi editado à mão (colunas e funções novas); vale rodar `pnpm db:types` quando houver acesso ao gerador.
7. **Vocabulário público.** O banner diz só "em revisão"; o teste de vocabulário continua verde. O e2e existente de denúncias (`article.spec`) faz mais de 3 denúncias na matéria do seed: no banco local de e2e ela passa a exibir o banner por 24 h (sem efeito nos testes, o banner não usa `role="status"`).
8. **Testes sob carga.** Com a máquina em carga média acima de 30, alguns testes de componente do Estúdio estouram os 5 s padrão; passam com o tempo maior (`--testTimeout=90000`). Não é regressão.

## Consulta de antes e depois (T8)

`scripts/ops/autonomia-antes-depois.sql`: só `select`, com janela por parâmetro. Cobre publicadas por hora (automáticas x por pessoa) e o pico, em revisão e vencidas, motivos de revisão, vereditos do revisor, estado e histórico do disjuntor, denúncias, itens urgentes e matérias com banner, estado dos assuntos e sugestões de evento aprovadas sozinhas.

```bash
# antes: os 7 dias anteriores à ativação da v3
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 \
  -v inicio="'2026-09-26 00:00-04'" -v fim="'2026-10-03 00:00-04'" \
  -f scripts/ops/autonomia-antes-depois.sql
# depois: as primeiras 24 h depois de release-backlog --apply (ajuste os horários)
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 \
  -v inicio="'<ativação>'" -v fim="'<ativação + 24 h>'" \
  -f scripts/ops/autonomia-antes-depois.sql
```

Os blocos 2 (em revisão) e 5 (assuntos) são fotos do momento da consulta; rode o "antes" antes de ativar. Testada na pilha local (3 migrations aplicadas); nunca foi apontada para a produção.

## Testes

`pnpm verify` verde no último commit (2.939 testes, 301 arquivos, com a pilha local própria em `.local/offset` 1500). Novos: `src/lib/rules/v3.test.ts`, `src/lib/pipeline/steps/{decide,credit-line,scope-decide,auto-checklist,publish-gate}.test.ts`, `src/lib/pipeline/breaker.test.ts`, `src/lib/geo/news-scope.test.ts`, `src/components/editorial/CreditLine.test.tsx`, `scripts/release-backlog.test.ts`, `tests/integration/aut-db.test.ts` (colunas, funções, gatilho de abertura do assunto, disjuntor, comandos do Estúdio) e `tests/integration/release-backlog.test.ts` (ensaio sem escrita, trava das regras antigas, liberação em lotes com o worker real e teto da hora). Ajustados por mudança de decisão do dono: testes de integração que fixavam "Segurança nunca automática" e "D12" (`p5-gate-*`, `topics-visibility`), seed da v1 e `write-depth`.

**Rodada 2 (T5 a T7).** `pnpm verify` verde no último commit de código (328 arquivos, 3.190 testes, lint, tipos e build), com pilha local própria em `.local/offset` 2300. Commits: T5 `d52634b`, T6 `8e4562e`, T7 `f741c6a`. Novos: `src/lib/studio/report-escalate.test.ts`, `src/components/editorial/ReviewBanner.test.tsx`, `src/lib/pipeline/steps/auto-reviewer.test.ts` (janela noturna, modos, orçamento, exclusões, portões), `src/app/api/ingest/review-tick/route.test.ts`, `src/lib/topics/state.test.ts`, `src/lib/pipeline/steps/verify-state.test.ts`, `src/lib/studio/event-auto-approve.test.ts` e, contra o banco, `tests/integration/aut-t5-report-escalate.test.ts`, `aut-t6-reviewer.test.ts` e `aut-t7-topics-events.test.ts`. Ajustados: orçamentos do registro de IA (`write` R$ 9, `reviewer` R$ 1), lista de rotas de cron (segurança), `agenda.spec` (o envio de teste passou a usar local desconhecido, que segue na fila humana). Playwright (desktop e mobile, com axe) rodou só para os specs novos e `agenda.spec`: `report-banner`, `reviewer-mode`, `agenda-auto`, `topic-state-studio`; a suíte e2e inteira e o Lighthouse não rodaram.

Não rodados: Playwright (e2e) e Lighthouse. O e2e "linha de crédito visível" do plano fica sem teste de navegador; a linha tem teste de componente e de leitura do corpo.

## Preocupações

1. **Matéria curta em massa.** Hoje o `write` só recebe título e trecho (RSS) de cada item. Abaixo de 1.500 caracteres de material, a R41 manda publicar com `short_reason = insufficient_source`; é provável que a maioria saia assim até haver texto extraído ou a busca de páginas de apoio. Falta mostrar `short_reason` no Estúdio (só gravado).
2. **Matéria antiga sendo publicada agora.** O acúmulo de 660 sai com data de publicação de hoje. `--max-age-days` existe, mas o padrão é liberar tudo.
3. **Risco editorial assumido pelo dono** (spec §5): crime, saúde e política sem humano, mitigados por redação, fonte citada, disjuntor, desfazer em um clique. A regra de duas pessoas continua para ativar a v3 (via `safety.disable`).
4. `rules_loosens` (0048) não enxerga os campos novos (`neverAuto` e companhia); a proteção de duas pessoas vem do pedido `safety.disable` aberto pela proposta e por `weakensSafety` nas propostas pelo painel.
5. `trusted` é campo comum do Painel (um admin ou editor chefe liga sem segunda pessoa). A spec não exige duas pessoas, mas ele equivale a liberar a publicação direta de uma fonte.
6. O `contingency_pause_cycle` só move para revisão o que é do ciclo em andamento; o disjuntor em si desliga `auto_publish`, que só volta com duas pessoas.
7. AUT-T5 (denúncias e banner), AUT-T6 (revisor automático e prazos) e AUT-T7 (estado do assunto e agenda de leitor) entraram na rodada 2 (seção abaixo). Segue fora, por ser em produção: os passos 1 a 4 do AUT-T8.
8. Dependência de ordem: aplicar as migrations antes do deploy; o worker falha em `understandItem` sem `sources.trusted`.
9. Várzea Grande entra como escopo `cuiaba` (região metropolitana). Se o dono quiser VG como `mt`, é uma linha em `news-scope.ts`.

## Antes e depois (a preencher depois da ativação)

| | Antes (7 dias, spec §1) | Depois (24 h) |
|---|---|---|
| Publicadas sozinhas | cerca de 147 | |
| Paradas em `in_review` | cerca de 615 (660 hoje) | |
| `in_review` vencidas (`due_at`) | | |
| Publicadas por hora (pico) | | |
| Decisões do revisor (publicar, manter, arquivar) | | |
| Disjuntor aberto | | |
| Denúncias (total e abertas) | | |
| Itens urgentes por 3 denúncias e matérias com banner | | |
| Assuntos por estado (só Estúdio) | | |
| Sugestões de evento aprovadas sozinhas | | |
