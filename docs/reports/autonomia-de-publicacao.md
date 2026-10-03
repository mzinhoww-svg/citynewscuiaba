# Autonomia de publicação alta: AUT-T1 a T4 e script do T8

Data: 03/10/2026. Branch do worktree: `worktree-agent-a281f8cc1a073cacb`. Spec: `docs/superpowers/specs/2026-10-03-autonomia-de-publicacao-design.md` (A1 a A16) e R32/R41 da rodada 3. Plano: `docs/superpowers/plans/2026-10-03-autonomia-de-publicacao.md`. Decisões: `.planning/DECISIONS.md` A-106 a A-112.

**Nada foi ativado nem rodado em produção.** As regras v3 são só uma proposta inativa e o script nunca foi apontado para a produção.

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

## Testes

`pnpm verify` verde no último commit (2.939 testes, 301 arquivos, com a pilha local própria em `.local/offset` 1500). Novos: `src/lib/rules/v3.test.ts`, `src/lib/pipeline/steps/{decide,credit-line,scope-decide,auto-checklist,publish-gate}.test.ts`, `src/lib/pipeline/breaker.test.ts`, `src/lib/geo/news-scope.test.ts`, `src/components/editorial/CreditLine.test.tsx`, `scripts/release-backlog.test.ts`, `tests/integration/aut-db.test.ts` (colunas, funções, gatilho de abertura do assunto, disjuntor, comandos do Estúdio) e `tests/integration/release-backlog.test.ts` (ensaio sem escrita, trava das regras antigas, liberação em lotes com o worker real e teto da hora). Ajustados por mudança de decisão do dono: testes de integração que fixavam "Segurança nunca automática" e "D12" (`p5-gate-*`, `topics-visibility`), seed da v1 e `write-depth`.

Não rodados: Playwright (e2e) e Lighthouse. O e2e "linha de crédito visível" do plano fica sem teste de navegador; a linha tem teste de componente e de leitura do corpo.

## Preocupações

1. **Matéria curta em massa.** Hoje o `write` só recebe título e trecho (RSS) de cada item. Abaixo de 1.500 caracteres de material, a R41 manda publicar com `short_reason = insufficient_source`; é provável que a maioria saia assim até haver texto extraído ou a busca de páginas de apoio. Falta mostrar `short_reason` no Estúdio (só gravado).
2. **Matéria antiga sendo publicada agora.** O acúmulo de 660 sai com data de publicação de hoje. `--max-age-days` existe, mas o padrão é liberar tudo.
3. **Risco editorial assumido pelo dono** (spec §5): crime, saúde e política sem humano, mitigados por redação, fonte citada, disjuntor, desfazer em um clique. A regra de duas pessoas continua para ativar a v3 (via `safety.disable`).
4. `rules_loosens` (0048) não enxerga os campos novos (`neverAuto` e companhia); a proteção de duas pessoas vem do pedido `safety.disable` aberto pela proposta e por `weakensSafety` nas propostas pelo painel.
5. `trusted` é campo comum do Painel (um admin ou editor chefe liga sem segunda pessoa). A spec não exige duas pessoas, mas ele equivale a liberar a publicação direta de uma fonte.
6. O `contingency_pause_cycle` só move para revisão o que é do ciclo em andamento; o disjuntor em si desliga `auto_publish`, que só volta com duas pessoas.
7. Fora do escopo pedido e não feito: AUT-T5 (denúncias e banner), AUT-T6 (revisor automático e prazos), AUT-T7 (estado do assunto e agenda de leitor) e os passos 1 a 4 do AUT-T8 em produção. O disjuntor já conta denúncias e falhas de IA, mas sem o banner nem o revisor.
8. Dependência de ordem: aplicar as migrations antes do deploy; o worker falha em `understandItem` sem `sources.trusted`.
9. Várzea Grande entra como escopo `cuiaba` (região metropolitana). Se o dono quiser VG como `mt`, é uma linha em `news-scope.ts`.

## Antes e depois (a preencher depois da ativação)

| | Antes (7 dias, spec §1) | Depois (24 h) |
|---|---|---|
| Publicadas sozinhas | cerca de 147 | |
| Paradas em `in_review` | cerca de 615 (660 hoje) | |
| Publicadas por hora (pico) | | |
| Disjuntor aberto | | |
| Denúncias | | |
