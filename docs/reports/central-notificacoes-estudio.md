# Central de notificações do Estúdio (sino) · BELL-T1

Pedido do dono: um sino em todas as páginas do Estúdio como central de notificações da equipe, com tudo o que pede ação cadastrado ali, e as telas de push (A09) descobríveis.

## O que entrou

### Banco (migration `0080_studio_notifications.sql`)

- `studio_notifications` (id, kind, severity `info|warn|urgent`, title, body, href, object_ref, audience jsonb `{roles[], userIds[], excludeUserIds[]}`, dedupe_key único, created_at, expires_at, push_sent_at) e `studio_notification_reads` (user_id, notification_id, read_at, dismissed_at).
- RLS: a pessoa lê só a notificação cujo papel (ou id) consta na audiência; grava só a própria leitura; a notificação em si só é escrita por service role e por triggers. `studio_notify(...)` (produtor, security definer) é restrito a service role e engole qualquer erro: um aviso que falha nunca derruba a denúncia, a aprovação ou a publicação de origem.
- Funções security definer com `auth.uid()` explícito: `studio_notifications_for(p_limit, p_cursor, p_only_unread, p_kind, p_history)`, `studio_unread_count()`, `studio_notifications_mark_read(ids)`, `studio_notifications_mark_all_read()`.
- Aditiva e idempotente. Nenhum `DROP` nem `DELETE` (policies por bloco `DO` que confere `pg_policies`, triggers por `create or replace trigger`; só os `on delete cascade` das chaves estrangeiras, que não são comandos).
- Fontes de evento (triggers, defensivos): 3 denúncias na mesma matéria em 24 h (urgente, quem modera), direito de resposta pedido, correção pendente, aprovação duas-pessoas pendente (rules, force_review, safety, prompt, pesos, papel admin, fonte crítica, push highlight/resume; quem pediu não é avisado), disjuntor aberto (urgente), fonte pausada por falhas/robots/opt-out/legal ou bloqueada, push urgente aguardando aprovação (urgente), publicação forçada concluída, sugestão de evento de leitor, backlog liberado (disjuntor religado e fim de `scripts/release-backlog.mjs`).
- Varredura `studio_notifications_sweep()` (pg_cron a cada 10 min quando existe; também roda no pré-passo do drain): revisão com itens vencidos (> 6 h em `in_review`), denúncias fora do prazo de 24 h, falhas de IA em pico (>= 5 na hora). Dedupe por dia/hora.
- `push_subscriptions.staff_alerts` (opt-in das urgências), `studio_urgent_push_due()` e `studio_urgent_push_done()`.

### Servidor

- `src/lib/studio-notifications/` (tipos, agrupamento por severidade, ordenação, merge com dedupe, leitura otimista, href seguro) e `push.ts` (despacho das urgências com o mesmo `PushSender` do push do leitor, sem segundo canal; só quem ligou `staff_alerts` e tem papel na audiência).
- `src/lib/db/queries/studio-notifications.ts`, `src/lib/db/studio-notifications-store.ts`, rotas `GET /api/estudio/notificacoes` e `POST /api/estudio/notificacoes/ler` (sessão, mesma origem, zod).
- `drainPrelude` em `src/lib/pipeline/deps.ts`: depois do despacho do push do leitor, roda a varredura e o push das urgências (erro nunca derruba o drain).

### Interface

- `NotificationBell` (Client Component) no cabeçalho de `StudioShell` (prop `bell`), então em todas as páginas do Estúdio e do admin: contador, painel em popover agrupado por severidade, marcar uma/todas como lida, filtro "Só não lidas", Alt + N, `aria-live="polite"`, estados carregando, vazio e erro com "Tentar de novo", atalhos "Ver todas" e "Ver push" (só com ação de push). Atualização por polling de 30 s (o repo não usa Realtime), pausa em aba oculta e atualiza ao voltar. No celular o painel é fixo à largura da tela.
- Página `/estudio/notificacoes`: histórico com filtros por tipo e situação, "Abrir", "Marcar como lida", paginação por cursor, opt-in das urgências.
- Push descobrível: item de primeiro nível "Notificações push" (com contagem de pendentes para quem aprova) no grupo Redação; saiu do grupo Governança (onde só aparecia como "Notificações"). Item "Notificações da equipe" para qualquer papel. Cartão "Notificações push" na home (fila, aguardando aprovação, última entrega) e opt-in de urgências no navegador.
- `docs/screens.md`: E15 e ajuste do shell e do A09.

## Testes

| Camada | Arquivo | Resultado |
|---|---|---|
| Unit | `src/lib/studio-notifications/group.test.ts` (ordenação, agrupamento, dedupe/merge, contagem, href seguro) | passa |
| Unit | `src/lib/studio-notifications/push.test.ts` (payload, só quem optou, falha isolada) | passa |
| Unit | `src/components/studio/NotificationBell.test.tsx` (contador, abrir/fechar, Esc, Alt+N, agrupamento, marcar uma/todas, filtro, vazio, carregando/erro, rollback, aria-live, aba oculta) | 11 passam |
| Unit | `src/components/studio/push/PushHomeCard.test.tsx` | passa |
| Unit | `src/app/estudio/nav.test.ts` (push visível com ação de push, oculto sem; contagem; primeiro nível; central para qualquer papel) | passa |
| Integração | `tests/integration/studio-notifications.test.ts` (RLS por papel e por pessoa, select direto, escrita negada, dedupe, leitura individual, expiradas, gatilhos de denúncia/aprovação/disjuntor, varredura, push só para quem optou) | 15 passam |
| E2E | `tests/e2e/studio-notifications.spec.ts` (sino em 3 páginas, marcar lida, Alt + N, papéis, página completa, push descobrível, axe @a11y) | 6 passam em desktop e 6 em mobile |
| E2E | `tests/e2e/a09-queue-history.spec.ts` (rótulo "Notificações push (n)") | passa |

`pnpm lint`, `pnpm typecheck` e `pnpm build` verdes.

## Numeração das migrations

`0080_studio_notifications.sql`. A última na base era `0073_breaker.sql` (0055 a 0069 ficaram livres para outros agentes). Se outro branch usar 0080, renumere esta.

## Preocupações

- **Polling, não Realtime** (nenhum uso de Realtime no repo): até 30 s de atraso no contador. Para urgências existe o push.
- **Push da equipe depende da inscrição feita com a sessão aberta** (`push_subscriptions.user_id`); o botão "Ativar urgências" faz o fluxo existente e liga `staff_alerts` em todas as inscrições da pessoa. O envio sai do pré-passo do drain (a cada minuto), não do pg_cron SQL.
- **`src/lib/db/types.ts` editado à mão** (`pnpm db:types` não conectou ao Postgres local); conferir com a geração oficial quando houver CLI.
- **Limiares da varredura** (6 h de revisão, 5 falhas de IA/hora) foram escolhidos por mim; ajuste conforme a operação.
- **"Backlog liberado"** não tinha evento próprio no repo: emito no religar do disjuntor e no fim de `release-backlog.mjs`.
- `tests/e2e/keyboard.spec.ts` (2 testes de diálogo, só mobile, indicador de foco do botão "Confirmar") falhou na minha rodada; é a comparação de captura do anel de foco de um diálogo que não toquei, mas não rodei a linha de base para confirmar que já falhava.
- Uma rodada completa de `pnpm test` mostrou `tests/integration/db.test.ts` (contagem de `profiles` = 22) por resíduo de outra suíte; passa isolada e depois de `pnpm db:reset`.
