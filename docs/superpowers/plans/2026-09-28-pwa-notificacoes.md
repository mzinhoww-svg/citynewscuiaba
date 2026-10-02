# PWA, leitura offline e notificações · Implementation Plan

> **Status: plano final (writing-plans). Spec aprovada sob A-061, A-062 e A-063 em 28/09/2026.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tarefas `[paralelo]` vão para superpowers:dispatching-parallel-agents, cada uma no seu worktree, só com os arquivos listados nela.

**Goal:** Tornar o CityNews instalável (manifesto, ícones, convites C07/C08, `/app`), legível sem conexão (home, editorias, 30 lidas, 20 salvas, `/offline.html` com a lista e rótulo de cópia antiga) e capaz de avisar o leitor por Web Push próprio (VAPID, `web-push`, fila `notify`) do que ele segue, de urgências e de Destaques aprovados por outra pessoa, com A09 Notificações e Funil do app no Estúdio.

**Architecture:** Regras puras primeiro: `src/lib/push/*` (silêncio, limite, reserva, alvos, texto, payload, endpoints, UA), `src/sw/core.ts` (allowlist de cache, LRU, payload, rótulos) e `src/lib/app/invites.ts` (convites). O banco é a autoridade dos trilhos: `push_reserve` trava a inscrição e decide cada entrega, `guard_push_approvals` impõe as duas pessoas e `app_settings` guarda pausa e padrões. O envio roda no drain existente como três jobs novos na fila `notify` (`push_match` → `push_deliver` → `push_due`), disparados pelo trigger de publicação e por `push_dispatch_due()` (pg_cron a cada minuto e pré-etapa do drain). O service worker é escrito em TypeScript em `src/sw/`, empacotado por esbuild em `public/sw.js` e conferido no CI.

**Tech Stack:** Next.js 16 (App Router, Server Actions, `next start` em produção no Playwright), Supabase (Postgres, RLS, pg_cron, pgmq via `jobs`), `web-push` (VAPID, aes128gcm), esbuild (SW e `offline.js`), sharp (ícones), zod, Vitest + Testing Library, Playwright + `@axe-core/playwright` + CDP (`ServiceWorker.deliverPushMessage`).

**Spec:** `docs/superpowers/specs/2026-09-28-pwa-notificacoes-design.md` (D-P01…D-P25, critérios de aceite §18 1–26, Review Focus §19) · spec mestre §5.2, §5.3, §5.4, §8, §10 · `docs/tracking-plan.md` §1–§2 · `docs/architecture.md` ADR-003, ADR-004, §6, §7 · telas P17, P18, P22, P25, P26, C07–C09, E06, A09.

**Pré-condição (bloqueante):** o branch `painel-fontes` já está mesclado no branch de trabalho. Este plano usa o estado mesclado: `src/lib/approvals/{index,approvals}.ts` (`CRITICAL_KINDS` com `push.urgent`), `app_settings` + `guard_app_settings()` + `app_setting_set(p_key, p_value, p_ctx, p_ip_hash)` de `0011_source_admin.sql`, e as migrations 0030–0032. Antes da PW-T1 rodar `git log --oneline -1 -- src/lib/approvals/index.ts supabase/migrations/0011_source_admin.sql`; se faltar, parar e registrar em `.planning/BLOCKERS.md` (não copiar o módulo). O P5-T1 ainda vai estender `approvals` com outros kinds; aqui só entram `push.highlight` e `push.resume`.

## Global Constraints

- Migrations só na faixa **0040–0049**: `0040_push_core.sql`, `0041_push_admin.sql`, `0042_push_metrics.sql`, `0043_push_cron.sql`; 0044–0049 para correções desta funcionalidade.
- Web Push só por `web-push` com VAPID; nenhum SDK ou serviço de push de terceiros. `PUSH_PROVIDER=fake` em unit, CI e e2e; `VAPID_PRIVATE_KEY` só em `src/lib/push/server.ts` (`import "server-only"`); `NEXT_PUBLIC_VAPID_PUBLIC_KEY` e `VAPID_SUBJECT` (`mailto:`). Nenhuma chave em código, teste ou fixture: testes geram o par em tempo de execução (`webpush.generateVAPIDKeys()`).
- Sem `VAPID_*` o push degrada (D-P25): pré-prompt não aparece, Alertas mostra "Avisos pelo celular ainda não estão disponíveis.", A09 lista só os nomes das variáveis que faltam.
- Service worker: fonte em `src/sw/`, `pnpm sw:build` (esbuild, `format: "iife"`, `bundle: true`, sem nada externo, saída determinística) gera `public/sw.js` e `public/offline.js`; os dois arquivos são versionados e o CI roda `pnpm sw:build && git diff --exit-code public/sw.js public/offline.js public/offline.css`. `cn-salvos-v1` nunca é apagado nem entra no LRU; mensagem `cache-saved` e `notificationclick` com `data.href` legado continuam funcionando.
- CSP intacta: nenhum `unsafe-inline`/`unsafe-eval` novo em `script-src`, nenhuma origem nova em `connect-src`; `worker-src 'self'` e `manifest-src 'self'` já existem. `/offline.html` usa só `/offline.js` e `/offline.css`. O teste `src/lib/security/headers.test.ts` não muda.
- SW registrado em toda página pública depois do `load` e em ocioso, nunca em `/estudio`; nunca guarda `/estudio`, `/api`, `/entrar`, `/criar-conta`, `/perfil`, `/privacidade`, `/busca`, `/pergunte`, `/alertas`, resposta com `Set-Cookie` ou sem o marcador `x-cn-offline: 1` (decisão G2).
- Login nunca é obrigatório: instalar, ler offline, ativar e ajustar avisos funcionam sem conta. Todo convite tem "Agora não". Um convite por vez: consentimento (P22) > login (C01) > notificações (C09) > instalação (C07).
- Consentimento (spec §9): eventos §9.1 só com Métricas (ou Personalização), sempre sem `anonId` quando só Métricas; o SW só chama `/api/push/receipt` com `consent.metrics` recebido da página; a rota confere o cookie `cn_consent` de novo. Inscrição, alvos e contadores de envio são operação do serviço pedido (Necessários). A inscrição leva só alvos explícitos `source:`/`section:`/`topic:`/`bairro:`; nunca histórico, interesses ou `anonId`.
- Trilhos (D-P07, D-P08, D-P16, D-P17): máx. 3 por dia de Cuiabá por inscrição, urgente conta; silêncio 22h–7h adia `follow`/`highlight` (urgente passa); a mesma matéria nunca duas vezes na mesma inscrição; 404/410 apaga a inscrição; leitor só aumenta o silêncio (início 18–22, fim 7–10) e escolhe limite 1–3.
- Duas pessoas (D-P14): `push.urgent`, `push.highlight` e `push.resume` exigem uma aprovação de outra pessoa com `push.approve` (admin, editor-chefe), imposta no banco; o despacho confere de novo e marca `applied`.
- Textos em pt-BR em `src/content/pt-BR/{offline,app,notifications,notifications-admin}.ts`; `CityNews` e `Cuiabá` sempre com essa grafia; texto do pré-prompt exatamente "Avisamos só do que você segue e de urgências, no máximo 3 por dia. Entre 22h e 7h, só urgências." (D-P09).
- Visual: só tokens de `src/styles/tokens.css`; sem hex/px crus em `src/components`; sem emoji, sem gradiente, alvos ≥ 44 px, `prefers-reduced-motion`; convites carregados sob demanda (`next/dynamic`) para manter JS da home ≤ 170 kB.
- A11y: 0 violações `serious`/`critical` no axe em 390 e 1280 px (telas do Estúdio também em 768); estados carregando, vazio, erro e sucesso; diálogos nativos com foco preso e devolvido.
- Rotas públicas `/api/push/*`: só `POST`/`PATCH`/`PUT`/`DELETE`, zod, `Origin` igual ao do site (403), corpo ≤ 4 KB, `Cache-Control: no-store`, limites de `hit_rate_limit` da spec §13, IP só em hash com sal diário.
- Testes só com dados fictícios; `AI_PROVIDER=fake`; nenhum acesso à rede real (servidor de push falso em `127.0.0.1`, `fakeResolve` de `src/lib/pipeline/testing/fake-http.ts`). Seções reais do seed: `cidade` (a spec §18.12 escreve "cidades"; vale `section:cidade`, G12).
- Cada tarefa termina com `pnpm verify` verde e commit com `[PW-T#]`; `.planning/progress.json` e `.planning/STATE.md` atualizados conforme `docs/AUTONOMY.md`.

## Decisões do plano (lacunas da spec)

Registradas pela PW-T1 em `.planning/DECISIONS.md` como os próximos `A-###` livres (A-063 já cobre D-P01…D-P25).

- **G1** · Aprovações de push por RPCs transacionais (`push_approve`, `push_reject`, `push_resume_request`, `push_resume_approve`) que escrevem em `approvals` sob `guard_approvals` + `guard_push_approvals`; `src/lib/approvals` só ganha os kinds e continua servindo leitura de pendentes.
- **G2** · Todas as páginas públicas são dinâmicas (nonce, A-042), então o Next manda `Cache-Control: private, no-store` em todas; a regra "sem `private`/`no-store`" da spec §8.2 desligaria a leitura offline. Vale um marcador positivo: o proxy põe `x-cn-offline: 1` só em rota da allowlist sem cookie `sb-*-auth-token`; o SW guarda só resposta 200 com o marcador e sem `Set-Cookie`, e ignora o `Cache-Control` do Next. As salvas continuam como hoje.
- **G3** · Jobs de push usam o envelope `PipelineMessage` existente com três passos fora das 20 etapas: `push_match` (`itemRef` `article:<id>` ou `push:<sendId>`), `push_deliver` (`push:<sendId>:<lote>`), `push_due` (`due:<sendId>`), todos na fila `notify`, `runId: "push"`. A chave de dedupe da spec `push-follow:<article_id>` vira `push_match:article:<id>`.
- **G4** · Tabela `push_batches` (lote = faixa de `id` de inscrição) para fim de envio, pausa e retomada sem reenviar; `push_send_counters` e `push_receipt_hit` vão para 0040 (a rota de recibo vem antes do funil); `push_deliveries` guarda `device_class`, `browser` e `measurable` (etapa 5 do funil por aparelho e navegador).
- **G5** · `push_reserve(p_sub, p_send, p_now)` lê matéria e tipo do próprio envio e devolve `table(outcome text, delivery_id bigint)`.
- **G6** · Silêncio efetivo = união do padrão da plataforma com o do leitor (menor início, maior fim); limite efetivo = mínimo dos dois.
- **G7** · Retentativas (429/5xx: 1, 4, 10 min, `Retry-After` até 30 min) e adiados ficam em `push_deliveries.not_before`; `push_dispatch_due()` enfileira `push_due` por envio.
- **G8** · 403 do serviço pausa o envio corrente (`paused`, motivo `vapid_invalid`) e abre `notify_once` crítico "Chaves VAPID inválidas"; volta pelo mesmo "Retomar envios".
- **G9** · E06: marcar "Push urgente" mostra "Justificativa do push" (obrigatória, ≤ 300) e só existe para quem pode pedir urgente; o pedido nasce depois da publicação bem-sucedida.
- **G10** · Não há sino no Estúdio: a contagem de pendentes aparece no item de menu "Notificações (n)" para quem tem `push.approve` e no banner de A09.
- **G11** · Menu: um item "Notificações" visível com qualquer ação de push; quem só tem `push.metrics` (analista) é levado a `/funil`.
- **G12** · Slugs de editoria do push são os do seed e de `0010_sections.sql` (`cidade`, não "cidades" como a spec §18.12 escreve); alvo `section:cidade`; `SW_SECTIONS` e `articleTargets` usam a mesma lista, conferida por teste contra `SECTION_DESCRIPTION`.
- **G13** · `sw:build` encadeado explicitamente em `dev` e `build` (não depende de `prebuild`); `src/sw/tsconfig.json` com `lib: ["es2022", "webworker"]`, excluído do tsconfig raiz; `typecheck` roda os dois.
- **G14** · `public/offline.css` = `src/styles/tokens.css` + `src/offline-page/offline.css` (só `var(--…)`); `public/offline.js` vem de `src/offline-page/index.ts` com textos de `src/content/pt-BR/offline.ts`.
- **G15** · `PUSH_PROVIDER=fake` usa sender em memória; `webpush` usa `web-push`. `PUSH_ENDPOINT_TEST_HOSTS` (`127.0.0.1:<porta>`, aceita `http`) é ignorada com `VERCEL_ENV=production` ou `NODE_ENV=production` fora do Playwright (`CN_E2E=1`).
- **G16** · `playwright.config.ts` gera o par VAPID ao carregar e passa ao `webServer` (a pública é embutida no build); o e2e confere o aviso por `registration.getNotifications()`, não por espião.
- **G17** · `app_setting_set` passa a validar permissão por prefixo (`sources.*` → `source.manage`; `push.*` → `push.settings`); `push.paused` só muda por `push_settings_pause` e `push_resume_approve`.
- **G18** · Credenciais da inscrição (`id`, `token`, chave pública) ficam no IndexedDB `cn-sw` (store `meta`), legível pela página e pelo SW (`pushsubscriptionchange`).
- **G19** · Tag do aviso = id da matéria sem hífens (32 caracteres, cabe no `Topic`); `follow` adiado e agrupado usa tag `follow`.

## Review Focus

1. **Leitor logado ou página dinâmica no cache** (G2): Next manda `no-store` em toda página pública e a home de quem entrou traz o nome no cabeçalho. Esperado: sem marcador nada entra em cache (e o recurso não fica mudo: com marcador entra); com cookie `sb-…-auth-token` o proxy não marca; resposta servida do cache mantém o próprio cabeçalho `content-security-policy` (nonce do HTML bate) → testes em PW-T3 (`isCacheableResponse`) e PW-T7 (proxy + e2e offline).
2. **Virada de dia e silêncio em Cuiabá com servidor em UTC**: reserva às 03:59Z e 04:00Z (23:59 e 00:00 de Cuiabá) zera `day_count` só na segunda; relógio em 21:59/22:00/06:59/07:00 local; leitor com silêncio 20h–9h e plataforma 22h–7h adia às 20:30 e libera às 09:00 → casos em `tests/fixtures/push/reserve-cases.json` (PW-T2), rodados contra `decideReservation` (PW-T2) e contra `push_reserve` no banco (PW-T5, paridade).
3. **Corrida entre envios diferentes na mesma inscrição**: 10 `push_reserve` paralelos de 10 envios diferentes (3 já usados hoje → só 0 passam; 0 usados → 3 passam); Destaque de uma matéria que já saiu como `follow` para a inscrição → `skipped_duplicate`; lote reprocessado depois de retry não reenvia nem conta pulo duplicado → PW-T1 (banco) e PW-T9 (fluxo).
4. **SSRF e endpoint forjado**: `https://fcm.googleapis.com.evil.example/x`, `https://FCM.GOOGLEAPIS.COM./x`, `https://u:p@fcm.googleapis.com/x`, `:8443`, `http://`, e host permitido que resolve para `10.0.0.5` na criação ou só no envio → 400 sem nenhuma requisição ao destino; envio recusa e marca `failed` sem chamar `web-push` → PW-T2 (`endpointProblem`) e PW-T6 (rota e sender com `fakeResolve`).
5. **Consentimento mudando depois da inscrição**: leitor com Métricas ativa avisos e depois escolhe "Só o necessário" → página manda `consent` falso ao SW e `PATCH metrics_consent=false`; push seguinte não gera `receipt`; rota com cookie `v1|m0|p0` responde 204 sem gravar; `events` e `push_send_counters` ficam com zero linhas → PW-T6 (rota), PW-T10 (cliente) e PW-T15 (e2e).
6. **Urgente sem a segunda pessoa**: Marina aprova o próprio pedido pela interface e por SQL como `authenticated`; Otávio (editor) e Thiago (analista) tentam aprovar; segunda decisão no mesmo pedido; aprovação feita, mas o registro é trocado para `rejected` por SQL de service role antes do despacho → só a aprovação de Helena passa, e o despacho reconfere e recusa o envio adulterado → PW-T5 (banco) e PW-T9 (despacho).

## Ordem, dependências e paralelismo

```
Onda 1:  PW-T1 banco núcleo   PW-T2 domínio push   PW-T3 service worker   PW-T4 manifesto   [todas paralelas]
Onda 2:  PW-T5 banco admin ◀── T1,T2   PW-T6 rotas+sender ◀── T1,T2   PW-T7 offline no portal ◀── T2,T3   [paralelas]
Onda 3:  PW-T8 convites de instalação ◀── T4,T7          PW-T9 envio (jobs, cron) ◀── T5,T6   [paralelas]
Onda 4:  PW-T10 avisos do leitor ◀── T6,T8               PW-T11 A09 servidor + E06 ◀── T5,T9 [paralelas]
Onda 5:  PW-T12 Novo envio + Config ◀── T11   PW-T13 Fila + Histórico ◀── T11   PW-T14 Funil ◀── T8,T11 [paralelas]
Onda 6:  PW-T15 verificação ◀── todas
```

Posse de arquivos (tarefas da mesma onda nunca se tocam; tarefas de ondas diferentes podem editar o mesmo arquivo em seções distintas, indicadas entre parênteses):

| Tarefa | Arquivos |
|---|---|
| PW-T1 | `supabase/migrations/0040_push_core.sql`, `tests/integration/push-core-db.test.ts`, `src/lib/db/types.ts`, `package.json` (deps `web-push`, `@types/web-push`, `esbuild` exato; script `push:keys`), `.env.example`, `.planning/DECISIONS.md` |
| PW-T2 | `src/lib/push/{types,rules,text,payload,endpoints,ua,targets,schemas}.ts` e testes, `tests/fixtures/push/reserve-cases.json` |
| PW-T3 | `src/sw/**`, `src/offline-page/**`, `src/content/pt-BR/offline.ts`, `scripts/build-sw.mjs`, `public/{sw.js,offline.html,offline.js,offline.css}`, `tsconfig.json` (exclude), `package.json` (scripts `sw:build`, `dev`, `build`, `typecheck`), `eslint.config.mjs`, `.prettierignore`, `.github/workflows/ci.yml` (passo do SW), `tests/fixtures/sw/sw-v1.js` |
| PW-T4 | `src/app/manifest.ts` e teste, `scripts/build-icons.mjs`, `scripts/build-icons.test.ts`, `public/icons/*`, `src/lib/theme/css-token.ts` e teste, `src/app/(public)/layout.tsx` (metadata/viewport), `package.json` (script `icons:build`) |
| PW-T5 | `supabase/migrations/0041_push_admin.sql`, `tests/integration/{push-admin-db,push-reserve-parity}.test.ts`, `src/lib/auth/permissions{,.test}.ts`, `src/lib/approvals/approvals.ts` (kinds), `src/lib/push/permissions{,.test}.ts`, `docs/architecture.md` (§6), `src/lib/db/types.ts` |
| PW-T6 | `src/lib/push/{server,public,token,sender,fake-sender,api}.ts` e testes, `src/lib/db/push-store.ts`, `src/app/api/push/**`, `tests/support/fake-push-server.ts`, `tests/integration/{push-routes,push-sender}.test.ts` |
| PW-T7 | `src/lib/offline/sw.ts` e teste, `src/components/editorial/{SwRegistrar,OfflineNotice}.tsx` e testes, `src/components/editorial/PublicShell.tsx` (montagem), `src/proxy.ts` e `src/proxy.test.ts`, `src/components/editorial/RecommendationControls.tsx` (limpar caches), `src/app/(public)/privacidade/page.tsx` (botão), `src/content/pt-BR/privacy.ts` (botão), `tests/e2e/offline.spec.ts` |
| PW-T8 | `src/lib/app/**`, `src/components/editorial/{InstallInvite,IosInstallSteps}.tsx` e testes, `src/components/editorial/{ConsentBanner,LoginInvite,PublicShell,SiteFooter}.tsx` (vaga de convite, links), `src/app/(public)/app/**`, `src/content/pt-BR/{app,nav,explore}.ts`, `src/lib/events/{names,schema,api}.ts`, `src/lib/events/events.test.ts`, `docs/tracking-plan.md` (§2), `tests/e2e/install.spec.ts` |
| PW-T9 | `supabase/migrations/0043_push_cron.sql`, `src/lib/pipeline/{types,drain,deps}.ts` e testes, `src/lib/pipeline/steps/index.ts`, `src/lib/push/steps/**`, `src/lib/db/push-send-store.ts`, `tests/integration/push-send-flow.test.ts`, `src/lib/db/types.ts` |
| PW-T10 | `src/lib/push/client.ts` e teste, `src/components/editorial/{NotificationInvite,NotificationInviteSlot,PushSettings}.tsx` e testes, `src/components/editorial/{AlertWatcher,SourceFollow,FollowTopicButton}.tsx`, `src/app/(public)/alertas/AlertsClient.tsx`, `src/app/(public)/materia/[slug]/page.tsx` (vaga urgente), `src/app/(public)/perfil/actions.ts`, `src/lib/db/account.ts` (exportação), `src/app/(public)/privacidade/page.tsx` e `src/content/pt-BR/privacy.ts` (seções), `src/content/pt-BR/notifications.ts`, `tests/e2e/push-reader.spec.ts` |
| PW-T11 | `src/lib/db/{push-admin-store,queries/push-admin}.ts`, `src/app/estudio/admin/notificacoes/{layout,actions}.ts(x)`, `src/lib/auth/require-role{,.test}.ts` (`requireAnyRole`), `src/app/estudio/{nav,nav.test}.ts`, `src/components/studio/push/{PushStatusBadge,PushTabsNav,PushBanners}.tsx`, `src/content/pt-BR/notifications-admin.ts`, `src/components/studio/PublishDialog.tsx`, `src/app/estudio/actions.ts`, `src/content/pt-BR/studio.ts` (push), `tests/integration/push-admin.test.ts` |
| PW-T12 | `src/app/estudio/admin/notificacoes/{page,loading,error}.tsx`, `src/app/estudio/admin/notificacoes/configuracoes/**`, `src/components/studio/push/{NewPushForm,PushPreview,ArticlePicker,AudienceField,PushSettingsForm,PauseDialog}.tsx` e testes, `tests/e2e/a09-new-settings.spec.ts` |
| PW-T13 | `src/app/estudio/admin/notificacoes/{fila,historico}/**`, `src/components/studio/push/{PushQueueTable,DecideDialog,PushHistoryTable,PushTimeline,PushBreakdown}.tsx` e testes, `tests/e2e/a09-queue-history.spec.ts` |
| PW-T14 | `supabase/migrations/0042_push_metrics.sql`, `src/lib/push/funnel{,.test}.ts`, `src/lib/db/queries/push-funnel.ts`, `src/app/estudio/admin/notificacoes/funil/**`, `src/components/studio/push/FunnelChart.tsx` e teste, `tests/integration/push-funnel.test.ts`, `tests/e2e/a09-funnel.spec.ts`, `src/lib/db/types.ts` |
| PW-T15 | `tests/e2e/pwa-flow.spec.ts`, `tests/e2e/helpers/push.ts`, `tests/a11y/pwa.spec.ts`, `playwright.config.ts`, `docs/reports/pwa.md`, `docs/reports/pwa/*.png`, `docs/screens.md` (P17, P18, E06, A09, P25, P26), `lighthouserc.json` (se existir) |

---

### Task PW-T1: Migration 0040 · núcleo do push no banco

**Files:**
- Create: `supabase/migrations/0040_push_core.sql`, `tests/integration/push-core-db.test.ts`
- Modify: `src/lib/db/types.ts` (`pnpm db:types`), `package.json` (`web-push`, `@types/web-push`, `esbuild` com versão exata; `"push:keys": "web-push generate-vapid-keys --json"`), `.env.example` (`NEXT_PUBLIC_VAPID_PUBLIC_KEY=`, `VAPID_PRIVATE_KEY=`, `VAPID_SUBJECT=mailto:`, `PUSH_PROVIDER=fake`, `PUSH_ENDPOINT_TEST_HOSTS=`), `.planning/DECISIONS.md` (G1–G19 como `A-###`)

**Interfaces:**
- Produces (SQL):
  - `push_subscriptions` exatamente como spec §11.1, com `check` de `endpoint` (`^https?://`, ≤ 1024; o `https`/host é conferido na rota), `p256dh` (`^[A-Za-z0-9_-]{80,100}$`), `auth` (`^[A-Za-z0-9_-]{16,32}$`), `targets` (`cardinality ≤ 200` e todos casando `^(source|section|topic|bairro):[a-z0-9-]{1,80}$` via função `immutable` `push_targets_valid(text[])`), `quiet_start between 18 and 22`, `quiet_end between 7 and 10`, `daily_limit between 1 and 3`; índice GIN em `targets`; view `my_push_subscriptions` (`security_invoker`, sem `endpoint`, `p256dh`, `auth`, `manage_token_hash`).
  - `push_sends` como spec §11.2 mais `batches_total int not null default 0`, `batches_done int not null default 0`, `approval_id uuid null`; `check (kind = 'follow' or requested_by is not null)`; `create unique index push_sends_follow_article_uidx on push_sends (article_id) where kind = 'follow'`.
  - `push_batches (send_id uuid references push_sends on delete cascade, batch_no int, after_id uuid null, until_id uuid not null, status text check (status in ('queued','done','paused','expired')), primary key (send_id, batch_no))`.
  - `push_deliveries` como spec §11.3 mais `device_class text`, `browser text`, `measurable boolean not null default false`; `create unique index push_deliveries_once_uidx on push_deliveries (subscription_id, article_id) where status in ('queued','deferred','sent')`; `skip_reason` ∈ `pref|limit|quiet|duplicate|coalesced|expired|gone`.
  - `push_send_counters` (spec §11.4).
  - `push_local_day(p_ts timestamptz) returns date` (`America/Cuiaba`); `push_settings_int(p_key text, p_default int) returns int` (lê `app_settings`, padrão se ausente).
  - `push_reserve(p_sub uuid, p_send uuid, p_now timestamptz default now()) returns table (outcome text, delivery_id bigint)` (G5): `for update` na inscrição; zera `day_count` quando `day_key <> push_local_day(p_now)`; ordem de decisão = a de `decideReservation` (PW-T2); `deferred` grava `not_before` = fim do silêncio efetivo (G6) e, para `follow`, passa a `skipped/coalesced` os `deferred` `follow` anteriores da mesma inscrição; conflito no índice único → `skipped_duplicate` (grava a linha pulada); `ok` grava `queued`, soma `day_count`, copia `device_class`/`browser`/`metrics_consent`→`measurable`; soma o contador correspondente em `push_sends`. TTL a partir de `coalesce(started_at, p_now)`: 6 h `follow`, 2 h `urgent`, 12 h `highlight`.
  - `push_claim_due(p_delivery bigint, p_now timestamptz) returns text` (`ok` | `skipped_limit` | `expired` | `coalesced` | `gone`): reconfere limite do dia para linhas `deferred`, TTL e existência da inscrição.
  - `push_delivery_result(p_delivery bigint, p_outcome text, p_http int, p_error text, p_retry_at timestamptz) returns void`: `accepted` → `sent`, `accepted_n+1`, `sent_measurable_n+1` se `measurable`, `last_success_at`, zera falhas; `gone` → apaga a inscrição, `removed_n+1`; `retry` → `queued`, `attempts+1`, `not_before = p_retry_at`; `failed` → `failed`, `failed_n+1`, `consecutive_failures+1` (5 em dias diferentes → apaga).
  - `push_receipt_hit(p_send uuid, p_event text, p_device text, p_browser text, p_now timestamptz) returns boolean`: só se o envio existe e `started_at > p_now - interval '48 hours'`; upsert em `push_send_counters`.
  - `push_retention(p_now timestamptz) returns jsonb`: apaga `push_deliveries` > 30 dias e inscrições sem `last_seen_at` há 180 dias.
  - RLS ligada em todas; `anon` sem acesso; `authenticated` só `select` em `my_push_subscriptions` (`user_id = auth.uid()`); funções acima só `service_role`.
  - `web-push` e `esbuild` instalados; `pnpm push:keys` imprime o par e não grava nada.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/push-core-db.test.ts (pilha local; inscrições e envios criados pelo teste)
it("anon não lê nada; leitor vê só as próprias sem chaves; equipe não lê a tabela", async () => {
  await expect(asAnon.from("push_subscriptions").select("id")).resolves.toMatchObject({ data: [] });
  const mine = await as(readerA).from("my_push_subscriptions").select("*");
  expect(mine.data).toHaveLength(1);
  expect(Object.keys(mine.data![0])).not.toEqual(expect.arrayContaining(["endpoint", "p256dh", "auth", "manage_token_hash"]));
  await expect(as(helena).from("push_subscriptions").select("id")).resolves.toMatchObject({ data: [] });
});
it("alvo fora do formato e mais de 200 alvos são recusados", async () => {
  await expect(insertSub({ targets: ["interesse:politica"] })).rejects.toThrow(/check/);
  await expect(insertSub({ targets: Array.from({ length: 201 }, (_, i) => `topic:t${i}`) })).rejects.toThrow(/check/);
});
it("10 reservas paralelas de envios diferentes nunca passam do limite (Review Focus 3)", async () => {
  const sub = await insertSub({ daily_limit: 3 });
  const sends = await Promise.all(range(10).map(() => insertSend({ kind: "urgent" })));
  const r = await Promise.all(sends.map((s) => rpc("push_reserve", { p_sub: sub, p_send: s, p_now: "2026-09-28T15:00:00Z" })));
  expect(r.filter((x) => x[0].outcome === "ok")).toHaveLength(3);
  expect(r.filter((x) => x[0].outcome === "skipped_limit")).toHaveLength(7);
});
it("a mesma matéria nunca duas vezes; pulada não bloqueia depois", async () => {
  const [a, b] = [await insertSend({ kind: "follow", article: ART }), await insertSend({ kind: "highlight", article: ART })];
  expect((await reserve(sub, a))[0].outcome).toBe("ok");
  expect((await reserve(sub, b))[0].outcome).toBe("skipped_duplicate");
});
it("follow no silêncio fica deferred e agrupa: só o mais recente continua", async () => {
  const at = "2026-09-29T02:30:00Z"; // 22:30 de Cuiabá
  const r1 = await reserve(sub, await insertSend({ kind: "follow", article: A1 }), at);
  const r2 = await reserve(sub, await insertSend({ kind: "follow", article: A2 }), at);
  expect([r1[0].outcome, r2[0].outcome]).toEqual(["skipped_quiet", "skipped_quiet"]); // fim do silêncio 07:00 > TTL 6 h
  const early = "2026-09-29T09:30:00Z"; // 05:30, fim 07:00 cabe no TTL
  await reserve(sub, await insertSend({ kind: "follow", article: A3 }), early);
  await reserve(sub, await insertSend({ kind: "follow", article: A4 }), early);
  expect(await deliveryStatuses(sub)).toEqual(expect.arrayContaining([{ article: A3, status: "skipped", skip_reason: "coalesced" }, { article: A4, status: "deferred", not_before: "2026-09-29T11:00:00+00:00" }]));
});
it("dia de Cuiabá vira às 04:00Z (Review Focus 2, parte banco)", async () => {
  const sub = await insertSub({ daily_limit: 1 });
  expect((await reserve(sub, await urgent(), "2026-09-29T03:59:00Z"))[0].outcome).toBe("ok");
  expect((await reserve(sub, await urgent(), "2026-09-29T03:59:30Z"))[0].outcome).toBe("skipped_limit");
  expect((await reserve(sub, await urgent(), "2026-09-29T04:00:00Z"))[0].outcome).toBe("ok");
});
it("404/410 apaga a inscrição; retry reagenda; 5 falhas em dias diferentes apagam", async () => { /* push_delivery_result gone | retry | failed */ });
it("recibo só para envio iniciado há menos de 48 h e sem id de inscrição", async () => {
  expect(await rpc("push_receipt_hit", { p_send: old, p_event: "clicked", p_device: "mobile", p_browser: "chrome", p_now: NOW })).toBe(false);
  expect(await rpc("push_receipt_hit", { p_send: recent, p_event: "delivered", p_device: "mobile", p_browser: "chrome", p_now: NOW })).toBe(true);
  expect(Object.keys(await counterRow(recent))).not.toContain("subscription_id");
});
it("retenção: entregas > 30 dias e inscrições sem visita há 180 dias", async () => {});
```

- [ ] **Step 2: Run** `pnpm db:reset && pnpm vitest run tests/integration/push-core-db.test.ts` → FAIL (tabelas não existem).
- [ ] **Step 3: Implement** a migration na ordem tabelas → índices → funções → RLS → grants; `pnpm db:types`; registrar G1–G19 em `.planning/DECISIONS.md`; `pnpm add web-push esbuild@<exata> && pnpm add -D @types/web-push`.
- [ ] **Step 4: Run** `pnpm verify` → PASS (inclui `tests/integration/{rls-hardening,rls-two-person}.test.ts`).
- [ ] **Step 5: Commit** `feat(push): migration 0040 com inscrições, envios, entregas e reserva atômica [PW-T1]`

### Task PW-T2: Domínio puro do push [paralelo]

**Files:**
- Create: `src/lib/push/{types,rules,text,payload,endpoints,ua,targets,schemas}.ts`, testes `*.test.ts` ao lado, `tests/fixtures/push/reserve-cases.json` (≥ 20 casos `{ name, input, expected }` no formato de `ReserveInput`, usados também pela PW-T5)

**Interfaces:**
- Consumes: `urlProblem`, `isForbiddenAddress`, `ResolveHost` (`src/lib/pipeline/net.ts`, sem editar); `fakeResolve` (`src/lib/pipeline/testing/fake-http.ts`, só em teste); `AnonProfile` (`src/lib/anon/types.ts`); `Result` (`src/lib/result.ts`).
- Produces:
  - `types.ts`: `PushKind = "follow" | "urgent" | "highlight"`; `TargetKey` (template `source:|section:|topic:|bairro:`); `Audience = { type: "targets" } | { type: "all" } | { type: "section"; slug: string } | { type: "bairro"; slug: string }`; `BrowserFamily = "chrome" | "safari" | "firefox" | "edge" | "samsung" | "other"`; `DeviceClass = "mobile" | "tablet" | "desktop"`; `Platform = "android" | "ios" | "macos" | "windows" | "linux" | "other"`; `ReserveOutcome = "ok" | "skipped_pref" | "skipped_duplicate" | "skipped_quiet" | "skipped_limit" | "deferred"`; `PushPayload = { v: 1; t: string; b: string; u: string; g: string; s: string }`.
  - `rules.ts`: `TTL_HOURS = { follow: 6, urgent: 2, highlight: 12 }`; `PLATFORM_QUIET = { start: 22, end: 7 }`; `QuietWindow = { start: number; end: number }`; `effectiveQuiet(sub, platform): QuietWindow` (G6); `effectiveLimit(sub, platform): number`; `cuiabaDay(now): string` (`YYYY-MM-DD`); `isQuiet(q, now): boolean`; `quietEndsAt(q, now): Date`; `ReserveInput = { kind; want: Record<PushKind, boolean>; quiet: QuietWindow; limit: number; dayKey: string | null; dayCount: number; hasArticle: boolean; ttlEndsAt: string; now: string }`; `decideReservation(i): { outcome: ReserveOutcome; notBefore: string | null }` com ordem fixa: preferência desligada → `skipped_pref`; `hasArticle` → `skipped_duplicate`; silêncio e tipo ≠ `urgent` → `deferred` com `notBefore = quietEndsAt` se ≤ `ttlEndsAt`, senão `skipped_quiet`; contagem do dia (zerada se `dayKey ≠ cuiabaDay(now)`) ≥ limite → `skipped_limit`; senão `ok`. `RETRY_DELAYS_SEC = [60, 240, 600]`; `retryDelay(attempt: number, retryAfterSec: number | null): number | null` (`max(tabela, min(retryAfter, 1800))`, `null` depois da 3ª). `articleTargets(a: { sourceSlugs: string[]; sectionSlug: string; topicSlug: string | null; neighborhoods: string[] }): TargetKey[]`. `scheduleProblem(kind: "urgent" | "highlight", when: { type: "now" } | { type: "at"; at: string }, now: string): null | "urgent_now_only" | "past" | "too_far" | "quiet"` (7 dias; 22h–7h de Cuiabá).
  - `text.ts`: `sanitizeNotificationText(raw: string, max: number): string` (sem tags, sem controle, espaços normalizados, corte por grafema com `Intl.Segmenter` e "…" dentro do máximo); `withOriginLabel(label: string, body: string): string` (`"<RÓTULO> · <texto>"`, prefixo fora dos 120).
  - `payload.ts`: `buildPayload(p: { title: string; body: string; originLabel: string; url: string; tag: string; sendId: string }): Result<PushPayload, "bad_url" | "too_large">` (título ≤ 60, corpo ≤ 120 + rótulo, `u` interno, JSON ≤ 1024 bytes); `pushHeaders(kind: PushKind, tag: string): { TTL: number; Urgency: "high" | "normal"; Topic?: string }` (TTL em segundos; `Topic` só se casar `^[A-Za-z0-9_-]{1,32}$`); `tagFor(articleId: string): string` (G19).
  - `endpoints.ts`: `PUSH_HOSTS = ["fcm.googleapis.com", "*.push.apple.com", "updates.push.services.mozilla.com", "push.services.mozilla.com", "*.notify.windows.com"]`; `EndpointProblem = "invalid" | "too_long" | "scheme" | "credentials" | "port" | "host"`; `endpointProblem(raw: string, testHosts: readonly string[]): EndpointProblem | null` (host em minúsculas e sem ponto final, `*.` casa só subdomínio real, porta 443 implícita; host de teste aceita `http` e a porta dada); `testHostsFromEnv(env: Record<string, string | undefined>): string[]` (G15); `endpointResolvesSafely(url: URL, resolve: ResolveHost, testHosts: readonly string[]): Promise<boolean>`.
  - `ua.ts`: `browserFamily(ua: string): BrowserFamily` (Edge antes de Chrome, Samsung antes de Chrome, Safari só sem `Chrome|CriOS|FxiOS`), `deviceClass(ua): DeviceClass`, `platformOf(ua): Platform`.
  - `targets.ts`: `TARGET_RE`; `targetsFromProfile(p: Pick<AnonProfile, "follows" | "alerts">): TargetKey[]` (follows `source`/`section`/`topic`; alertas ativos de canal `browser`: `bairro`→`bairro:`, `tema`→`section:`, `assunto`→`topic:`; `collection`, `agenda` e `urgentes` fora; sem repetição; ≤ 200).
  - `schemas.ts` (zod, mensagens pt-BR): `subscribeBodySchema` (`{ endpoint, keys: { p256dh, auth }, targets, installed, prefs?: { follow, urgent, highlight, quietStart, quietEnd, dailyLimit }, metricsConsent, oldToken? }`), `patchBodySchema` (parcial + `seen: true`), `rotateBodySchema` (`{ oldEndpoint, endpoint, keys }`), `receiptBodySchema` (`{ s: uuid, e: "delivered" | "clicked", d, b }`, `.strict()`), `pushRequestSchema` (A09: `kind`, `articleId`, `title` ≤ 60, `body` ≤ 120, `audience`, `when`, `justification` obrigatória em `urgent`).

- [ ] **Step 1: Write the failing tests**

```ts
// rules.test.ts
it.each(cases)("paridade: $name", ({ input, expected }) => expect(decideReservation(input)).toEqual(expected)); // reserve-cases.json
it("silêncio efetivo é a união: leitor 20h–9h com plataforma 22h–7h", () =>
  expect(effectiveQuiet({ start: 20, end: 9 }, PLATFORM_QUIET)).toEqual({ start: 20, end: 9 }));
it("21:59 não é silêncio; 22:00 é; 06:59 é; 07:00 não (Cuiabá)", () => {
  const q = PLATFORM_QUIET;
  expect([isQuiet(q, new Date("2026-09-29T01:59:00Z")), isQuiet(q, new Date("2026-09-29T02:00:00Z")),
          isQuiet(q, new Date("2026-09-29T10:59:00Z")), isQuiet(q, new Date("2026-09-29T11:00:00Z"))]).toEqual([false, true, true, false]);
});
it("urgente passa no silêncio mas respeita o limite", () => {
  expect(decideReservation(input({ kind: "urgent", now: "2026-09-29T03:00:00Z" })).outcome).toBe("ok");
  expect(decideReservation(input({ kind: "urgent", dayCount: 3, dayKey: "2026-09-28", now: "2026-09-29T03:00:00Z" })).outcome).toBe("skipped_limit");
});
it("retry 1, 4, 10 min respeitando Retry-After até 30 min", () => {
  expect([1, 2, 3].map((a) => retryDelay(a, null))).toEqual([60, 240, 600]);
  expect(retryDelay(1, 900)).toBe(900);
  expect(retryDelay(1, 7200)).toBe(1800);
  expect(retryDelay(4, null)).toBeNull();
});
it("alvos da matéria: fontes, editoria, assunto e bairros", () =>
  expect(articleTargets({ sourceSlugs: ["folha-do-cerrado"], sectionSlug: "cidade", topicSlug: null, neighborhoods: ["cpa"] }))
    .toEqual(["source:folha-do-cerrado", "section:cidade", "bairro:cpa"]));
it("Destaque agendado: passado, > 7 dias e 22h–7h recusados; urgente só agora", () => {
  expect(scheduleProblem("urgent", { type: "at", at: "2026-09-28T20:00:00Z" }, NOW)).toBe("urgent_now_only");
  expect(scheduleProblem("highlight", { type: "at", at: "2026-09-29T03:00:00Z" }, NOW)).toBe("quiet");
  expect(scheduleProblem("highlight", { type: "at", at: "2026-10-06T15:00:00Z" }, NOW)).toBe("too_far");
});

// endpoints.test.ts (Review Focus 4)
it.each([
  ["https://fcm.googleapis.com.evil.example/x", "host"], ["https://u:p@fcm.googleapis.com/x", "credentials"],
  ["https://fcm.googleapis.com:8443/x", "port"], ["http://fcm.googleapis.com/x", "scheme"],
  ["https://push.apple.com/x", "host"], ["notaurl", "invalid"],
])("%s → %s", (raw, problem) => expect(endpointProblem(raw, [])).toBe(problem));
it("aceita maiúsculas e ponto final", () => expect(endpointProblem("https://FCM.GOOGLEAPIS.COM./fcm/send/abc", [])).toBeNull());
it("host permitido que resolve para IP privado é recusado", async () =>
  expect(await endpointResolvesSafely(new URL("https://fcm.googleapis.com/x"), fakeResolve({ "fcm.googleapis.com": ["10.0.0.5"] }), [])).toBe(false));
it("hosts de teste são ignorados em produção", () => expect(testHostsFromEnv({ PUSH_ENDPOINT_TEST_HOSTS: "127.0.0.1:9999", VERCEL_ENV: "production" })).toEqual([]));

// text.test.ts / payload.test.ts
it("remove HTML e controle, corta por grafema", () => expect(sanitizeNotificationText("<b>Chuva</b>\u0007 forte\n em Cuiabá", 60)).toBe("Chuva forte em Cuiabá"));
it("payload só com v,t,b,u,g,s e ≤ 1 KB; URL externa recusada", () => {
  const r = buildPayload({ title: "Chuva forte", body: "Defesa Civil alerta", originLabel: "ORIGINAL CITYNEWS", url: "/materia/chuva", tag: "a1", sendId: SEND });
  expect(r.ok && Object.keys(r.value).sort()).toEqual(["b", "g", "s", "t", "u", "v"]);
  expect(r.ok && r.value.b).toBe("ORIGINAL CITYNEWS · Defesa Civil alerta");
  expect(buildPayload({ ...base, url: "//evil.example" })).toEqual(err("bad_url"));
});
it("Urgency high só no urgente; TTL 6/2/12 h", () => {
  expect(pushHeaders("urgent", "x")).toMatchObject({ TTL: 7200, Urgency: "high" });
  expect(pushHeaders("highlight", "x")).toMatchObject({ TTL: 43200, Urgency: "normal" });
});

// ua.test.ts / targets.test.ts
it("família do navegador", () => { expect(browserFamily(EDGE_UA)).toBe("edge"); expect(browserFamily(SAMSUNG_UA)).toBe("samsung"); expect(browserFamily(IOS_SAFARI_UA)).toBe("safari"); expect(browserFamily(CRIOS_UA)).toBe("chrome"); });
it("alvos só de escolhas explícitas", () =>
  expect(targetsFromProfile({ follows: [f("source", "mt-agora"), f("collection", "c1")], alerts: [alert("bairro", "cpa", "browser"), alert("tema", "esportes", "email"), alert("urgentes", "", "browser")] }))
    .toEqual(["source:mt-agora", "bairro:cpa"]));
```

- [ ] **Step 2: Run** `pnpm vitest run src/lib/push` → FAIL.
- [ ] **Step 3: Implement** funções puras, sem banco e sem rede (a única I/O é o `ResolveHost` injetado). Os casos do JSON incluem os horários de Review Focus 2.
- [ ] **Step 4: Run** `pnpm verify` → PASS.
- [ ] **Step 5: Commit** `feat(push): regras puras de silêncio, limite, reserva, texto, payload e endpoints [PW-T2]`

### Task PW-T3: Service worker em TypeScript, build e página "Sem conexão" [paralelo]

**Files:**
- Create: `src/sw/{contract,core,shared-db,sections,index}.ts`, `src/sw/tsconfig.json`, `src/sw/{core,sections}.test.ts`, `src/offline-page/{index.ts,offline.css,index.test.ts}`, `src/content/pt-BR/offline.ts`, `scripts/build-sw.mjs`, `tests/fixtures/sw/sw-v1.js` (cópia byte a byte do `public/sw.js` atual, para o teste de atualização)
- Modify: `public/sw.js` e `public/offline.js`, `public/offline.css`, `public/offline.html` (gerados/reescritos), `tsconfig.json` (`exclude: ["src/sw/**"]`), `package.json` (`"sw:build": "node scripts/build-sw.mjs"`, `"dev": "pnpm sw:build && next dev"`, `"build": "pnpm sw:build && next build"`, `"typecheck": "next typegen && tsc --noEmit && tsc --noEmit -p src/sw"`), `eslint.config.mjs` e `.prettierignore` (ignoram `public/sw.js`, `public/offline.js`, `public/offline.css`), `.github/workflows/ci.yml` (passo "SW gerado confere" antes do build)

**Interfaces:**
- Produces:
  - `contract.ts`: `SW_VERSION = "2026.09.28-1"`; `CACHES = { shell: "cn-shell-v1", salvos: "cn-salvos-v1", paginas: "cn-paginas-v1", lidas: "cn-lidas-v1", assets: "cn-assets-v1" }`; `LIMITS = { salvos: 20, paginas: 12, lidas: 30, capBytes: 25 * 1024 * 1024, networkTimeoutMs: 4000, assetSweepEvery: 50 }`; `OFFLINE_MARKER_HEADER = "x-cn-offline"`; `NEVER_CACHE = ["/estudio", "/api", "/entrar", "/criar-conta", "/perfil", "/privacidade", "/busca", "/pergunte", "/alertas"]`; `SwInbound = { type: "cache-saved"; paths: string[] } | { type: "consent"; metrics: boolean; device: DeviceClass; browser: BrowserFamily } | { type: "served-from-cache"; url: string } | { type: "list-offline" } | { type: "clear-offline" }` (respostas pelo `MessagePort`: `{ cachedAt: string | null }`, `OfflineListing`, `{ cleared: true }`).
  - `core.ts` (puro): `routeKind(path: string, sections: readonly string[]): "pagina" | "materia" | "favoritos" | null`; `isCacheableResponse(r: { method: string; status: number; sameOrigin: boolean; headers: Headers }): boolean` (200, GET, mesma origem, `x-cn-offline: 1`, sem `set-cookie`; G2); `IndexEntry = { url: string; cache: string; title: string | null; bytes: number; cachedAt: string; lastAccess: string }`; `overBucketLimit(entries, cache, max): IndexEntry[]`; `planEviction(entries: IndexEntry[], capBytes: number, extraBytes?: number): IndexEntry[]` (ordem `cn-lidas` → `cn-paginas` → assets órfãos, por `lastAccess`; nunca `cn-salvos`/`cn-shell`; com `extraBytes` libera o dobro); `titleFromHtml(html: string): string | null` (sem " · CityNews Cuiabá"); `parsePayload(raw: unknown): { title: string; body: string; tag: string; url: string; sendId: string | null }` (inválido → `SW_TEXT.genericTitle`, `SW_TEXT.genericBody`, `url: "/"`); `safeTarget(data: unknown, origin: string): string` (aceita `data.url` e o legado `data.href`, só caminho interno); `staleLabel(cachedAt: Date, now: Date): string` (Cuiabá: "Salva às 14h32, pode estar desatualizada." / "Salva em 27/09 às 14h32, pode estar desatualizada."); `OfflineListing = { paginas: Item[]; salvas: Item[]; lidas: Item[] }`, `offlineListing(entries, now): OfflineListing` (lidas mais recentes primeiro); `cachedAtFor(clientMap: Map<string, string>, clientId: string, url: string, entries: IndexEntry[], online: boolean): string | null`; `assetUrlsFromHtml(html: string): string[]`.
  - `shared-db.ts` (página e SW): `SwMeta = { consent: { metrics: boolean; device: DeviceClass; browser: BrowserFamily }; push: { id: string; token: string; publicKey: string } }`; `getMeta<K extends keyof SwMeta>(k: K): Promise<SwMeta[K] | null>`; `setMeta`, `delMeta`; `putEntry(e: IndexEntry)`, `allEntries()`, `deleteEntries(urls: string[])`, `touch(url, at)` (IndexedDB `cn-sw` v1, stores `entries` e `meta`, tudo em `try/catch`, falha = `null`/no-op).
  - `sections.ts`: `SW_SECTIONS` (slugs das editorias; teste confere com `Object.keys(SECTION_DESCRIPTION)` e `0010_sections.sql`).
  - `index.ts`: `install` (pré-cache `cn-shell-v1`: `/offline.html`, `/offline.js`, `/offline.css`, `/icons/icon-192.png`, `/icons/badge-72.png`, `/manifest.webmanifest`, falhas ignoradas; `skipWaiting`), `activate` (apaga caches fora de `CACHES`, nunca `cn-salvos-v1`; `clients.claim`; varre assets órfãos), `fetch` (spec §8.4; rede com tempo de 4 s; grava com `isCacheableResponse`; `QuotaExceededError` → `planEviction` com `extraBytes` e uma nova tentativa), `push` (sempre `showNotification`, `icon: "/icons/icon-192.png"`, `badge: "/icons/badge-72.png"`, `lang: "pt-BR"`, `renotify: false`, `data: { url, s }`; recibo só com `consent.metrics`), `notificationclick`, `pushsubscriptionchange` (reinscreve com `meta.push.publicKey` e `PUT /api/push/subscriptions/rotate` com `Authorization: Bearer <token>`), `message` (`SwInbound`; `cache-saved` com a mesma lógica de hoje).
  - `offline.ts` (conteúdo): `OFFLINE_TEXT` (h1 "Sem conexão", "Você está sem internet. Estas páginas estão guardadas neste aparelho:", "Páginas", "Salvas", "Lidas recentemente", vazio "Nada guardado ainda. Com internet, as páginas que você abrir ficam disponíveis aqui.", "Tentar de novo", `staleNotice`, "Conexão de volta.", "Atualizar"); `SW_TEXT = { genericTitle: "CityNews", genericBody: "Há novidades no CityNews." }`.
  - `offline-page/index.ts`: pede `list-offline` ao SW e monta as três listas no DOM (sem `innerHTML`); "Tentar de novo" recarrega.
  - `build-sw.mjs`: esbuild `src/sw/index.ts` → `public/sw.js` e `src/offline-page/index.ts` → `public/offline.js` (`iife`, `target: "es2020"`, `minify: false`, `legalComments: "none"`, banner fixo sem data); `public/offline.css` = `src/styles/tokens.css` + `src/offline-page/offline.css` (G14).

- [ ] **Step 1: Write the failing tests**

```ts
// src/sw/core.test.ts
it("allowlist de rota", () => {
  expect(["/", "/cidade", "/materia/chuva-forte", "/favoritos"].map((p) => routeKind(p, SW_SECTIONS))).toEqual(["pagina", "pagina", "materia", "favoritos"]);
  for (const p of ["/estudio", "/api/events", "/perfil", "/busca", "/alertas", "/privacidade", "/pergunte", "/nao-existe"]) expect(routeKind(p, SW_SECTIONS)).toBeNull();
});
it("só guarda com marcador, 200 e sem Set-Cookie; ignora o no-store do Next (Review Focus 1)", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  const base = { method: "GET", status: 200, sameOrigin: true };
  expect(isCacheableResponse({ ...base, headers: h({ "x-cn-offline": "1", "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate" }) })).toBe(true);
  expect(isCacheableResponse({ ...base, headers: h({ "cache-control": "public, max-age=60" }) })).toBe(false);
  expect(isCacheableResponse({ ...base, headers: h({ "x-cn-offline": "1", "set-cookie": "a=1" }) })).toBe(false);
  expect(isCacheableResponse({ ...base, status: 410, headers: h({ "x-cn-offline": "1" }) })).toBe(false);
});
it("LRU acima de 25 MB tira lidas, depois páginas, nunca salvas", () => {
  const out = planEviction([e("cn-salvos-v1", 10, "08:00"), e("cn-paginas-v1", 8, "09:00"), e("cn-lidas-v1", 6, "10:00"), e("cn-lidas-v1", 6, "11:00")].map(mb), 25 * MB);
  expect(out.map((x) => x.cache)).toEqual(["cn-lidas-v1"]);
  expect(planEviction(big, 25 * MB).some((x) => x.cache === "cn-salvos-v1")).toBe(false);
});
it("31ª lida sai a mais antiga; 13ª página sai a mais antiga", () => {
  expect(overBucketLimit(lidas(31), "cn-lidas-v1", 30).map((x) => x.url)).toEqual(["/materia/l-0"]);
});
it("payload inválido vira aviso genérico; u externo vira /", () => {
  expect(parsePayload("lixo")).toEqual({ title: "CityNews", body: "Há novidades no CityNews.", tag: "cn", url: "/", sendId: null });
  expect(parsePayload({ v: 1, t: "T", b: "B", u: "//evil.example", g: "g", s: SEND }).url).toBe("/");
  expect(parsePayload({ v: 1, t: "T", b: "B", u: "https://evil.example/x", g: "g", s: SEND }).url).toBe("/");
});
it("toque aceita data.url e o data.href legado", () => {
  expect(safeTarget({ url: "/materia/x" }, ORIGIN)).toBe("/materia/x");
  expect(safeTarget({ href: "/alertas" }, ORIGIN)).toBe("/alertas");
  expect(safeTarget({ href: "https://evil.example" }, ORIGIN)).toBe("/");
});
it("rótulo de cópia antiga em Cuiabá", () => {
  expect(staleLabel(new Date("2026-09-28T18:32:00Z"), new Date("2026-09-28T20:00:00Z"))).toBe("Salva às 14h32, pode estar desatualizada.");
  expect(staleLabel(new Date("2026-09-27T18:32:00Z"), new Date("2026-09-28T20:00:00Z"))).toBe("Salva em 27/09 às 14h32, pode estar desatualizada.");
});
it("título sem o sufixo da marca", () => expect(titleFromHtml("<title>Chuva forte · CityNews Cuiabá</title>")).toBe("Chuva forte"));

// src/sw/sections.test.ts
it("editorias do SW = editorias do portal", () => expect([...SW_SECTIONS].sort()).toEqual(Object.keys(SECTION_DESCRIPTION).sort()));

// src/offline-page/index.test.ts (jsdom, SW falso respondendo list-offline)
it("lista páginas, salvas e lidas; tudo vazio mostra a frase de vazio", async () => {});

// scripts: build determinístico
it("dois builds seguidos geram o mesmo sw.js", async () => { /* roda build-sw.mjs duas vezes em pasta temporária, compara hashes */ });
```

- [ ] **Step 2: Run** `pnpm vitest run src/sw src/offline-page` → FAIL.
- [ ] **Step 3: Implement.** `index.ts` só liga eventos e delega ao `core`; nenhuma lógica de decisão fora do `core`. Rodar `pnpm sw:build` e versionar os gerados. Passo do CI: `pnpm sw:build && git diff --exit-code public/sw.js public/offline.js public/offline.css`.
- [ ] **Step 4: Run** `pnpm verify` → PASS; `grep -c "cn-salvos-v1" public/sw.js` ≥ 1; `public/offline.html` sem `<script>` inline nem `style=`.
- [ ] **Step 5: Commit** `feat(pwa): service worker em TypeScript com cache offline, push e página Sem conexão [PW-T3]`

### Task PW-T4: Manifesto, ícones e metadados de instalação [paralelo]

**Files:**
- Create: `src/app/manifest.ts`, `src/app/manifest.test.ts`, `src/lib/theme/css-token.ts` e teste, `scripts/build-icons.mjs`, `scripts/build-icons.test.ts`, `public/icons/{icon-192,icon-512,maskable-192,maskable-512,apple-touch-icon-180,badge-72,splash-1170x2532,splash-1179x2556,splash-1284x2778}.png`
- Modify: `src/app/(public)/layout.tsx` (`metadata.appleWebApp = { capable: true, statusBarStyle: "black-translucent", title: "CityNews", startupImage: [...] }`, `icons.apple`, `viewport.themeColor` claro/escuro por `media`), `package.json` (`"icons:build": "node scripts/build-icons.mjs"`)

**Interfaces:**
- Produces:
  - `readCssToken(name: string, css?: string): string | null` (lê `src/styles/tokens.css` no build; `server-only`).
  - `manifest(): MetadataRoute.Manifest` exatamente como spec §7.10 (`name` "CityNews Cuiabá", `short_name` "CityNews", `lang` "pt-BR", `dir` "ltr", `id` "/", `start_url` "/?origem=app", `scope` "/", `display` "standalone", `background_color`/`theme_color` = `readCssToken("--cn-tinta")`, ícones 192/512 `any` e `maskable`, atalhos Últimas `/#ultimas`, Salvos `/favoritos`, Busca `/busca`).
  - `build-icons.mjs`: sharp a partir de `public/brand/citynews-symbol.png`; `any` = símbolo sobre `--cn-tinta`; `maskable` com zona segura de 80%; `badge-72` monocromático; splash com símbolo centralizado sobre `--cn-tinta`. Cor lida dos tokens, nunca hex no script.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/manifest.test.ts
it("manifesto da spec §7.10", () => {
  const m = manifest();
  expect(m).toMatchObject({ name: "CityNews Cuiabá", short_name: "CityNews", start_url: "/?origem=app", display: "standalone", scope: "/", lang: "pt-BR" });
  expect(m.theme_color).toBe(readCssToken("--cn-tinta"));
  expect(m.icons!.map((i) => `${i.sizes}:${i.purpose}`)).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "192x192:maskable", "512x512:maskable"]));
  expect(m.shortcuts!.map((s) => [s.name, s.url])).toEqual([["Últimas", "/#ultimas"], ["Salvos", "/favoritos"], ["Busca", "/busca"]]);
});
// scripts/build-icons.test.ts
it("ícones existem com o tamanho declarado", async () => {
  for (const [f, w] of [["icon-192.png", 192], ["icon-512.png", 512], ["maskable-512.png", 512], ["apple-touch-icon-180.png", 180], ["badge-72.png", 72]] as const)
    expect((await sharp(`public/icons/${f}`).metadata()).width).toBe(w);
});
it("css-token lê --cn-tinta", () => expect(readCssToken("--cn-tinta", ":root{--cn-tinta: #0f1b2d;}")).toBe("#0f1b2d"));
```

- [ ] **Step 2: Run** `pnpm vitest run src/app/manifest.test.ts scripts/build-icons.test.ts src/lib/theme` → FAIL.
- [ ] **Step 3: Implement**; rodar `pnpm icons:build` e versionar `public/icons/*`.
- [ ] **Step 4: Run** `pnpm verify` → PASS; `pnpm build && pnpm start` e `curl -s localhost:3000/manifest.webmanifest | jq .short_name` → `"CityNews"`.
- [ ] **Step 5: Commit** `feat(pwa): manifesto, ícones da marca e metadados de instalação [PW-T4]`

### Task PW-T5: Migration 0041 · pedidos, duas pessoas, configurações e permissões

Depende de PW-T1 e PW-T2.

**Files:**
- Create: `supabase/migrations/0041_push_admin.sql`, `tests/integration/push-admin-db.test.ts`, `tests/integration/push-reserve-parity.test.ts`, `src/lib/push/permissions.ts` e teste
- Modify: `src/lib/auth/permissions.ts` e teste, `src/lib/approvals/approvals.ts` (`CRITICAL_KINDS` + `"push.highlight"`, `"push.resume"`), `docs/architecture.md` §6 (4 linhas novas), `src/lib/db/types.ts`

**Interfaces:**
- Produces (TS):
  - `ACTIONS` + `"push.request"`, `"push.approve"`, `"push.settings"`, `"push.metrics"`; `PERMISSIONS`: `push.request = { admin: "all", editor_chefe: "all", editor: "section" }`, `push.approve = { admin: "second", editor_chefe: "second" }`, `push.settings = { admin: "all", editor_chefe: "all" }`, `push.metrics = { admin: "all", editor_chefe: "all", analista: "all" }`.
  - `pushKindsFor(roles: RoleGrant[], section?: string): ("urgent" | "highlight")[]` (urgente só admin/editor-chefe; Destaque com `can(…, "push.request", { section })`); `canSeeAllPushes(roles): boolean`.
- Produces (SQL):
  - `create table if not exists app_settings` (mesma definição de 0011); sementes `push.default_daily_limit = 3`, `push.quiet_start = 22`, `push.quiet_end = 7`, `push.templates = []`, `push.paused = {"on": false, "by": null, "at": null, "reason": null}` (`on conflict do nothing`); `guard_app_settings()` recriada com as validações de `sources.*` intactas e as de `push.*` (limite 1–3, início 18–22, fim 7–10, até 20 modelos com `name`, `title` ≤ 60, `body` ≤ 120 e só `{titulo}`/`{linha_fina}`); política `app_settings_read_push` (`key like 'push.%'`, admin, editor-chefe, editor).
  - `app_setting_set` recriada com a mesma assinatura (G17): `sources.*` exige os papéis de `source.manage`; `push.*` exige `push_can(uid, 'push.settings')`; `push.paused` recusado ("use pausar/retomar").
  - `push_can(p_uid uuid, p_action text, p_section text default null) returns boolean` (espelha a matriz TS).
  - `guard_push_approvals()` (before insert or update em `approvals` quando `kind like 'push.%'`): no insert, `push.urgent` exige `push_can(uid, 'push.request')` com papel admin/editor-chefe, `push.highlight` exige `push.request` na editoria da matéria do envio, `push.resume` exige `push.settings`; na decisão, aprovador precisa de `push_can(uid, 'push.approve')` (mensagem "A aprovação precisa ser de quem tem permissão de aprovar avisos."). `check (approved_by <> requested_by)` e `guard_approvals` continuam valendo.
  - `guard_push_sends()`: transições válidas (`pending_approval`→`queued|scheduled|rejected|cancelled|expired`; `queued|scheduled`→`dispatching|paused|cancelled|expired`; `dispatching`→`sent|paused|cancelled`; `paused`→`queued|dispatching|expired|cancelled`); `title`, `body`, `audience`, `article_id`, `kind`, `scheduled_at` imutáveis depois do insert; `authenticated` só insere `pending_approval` com `requested_by = auth.uid()`; isentos `postgres`/`service_role`.
  - RPCs `security invoker` (erros com mensagens pt-BR): `push_request(p jsonb) returns uuid` (matéria `published`, não patrocinada; urgente só `now`; Destaque agendado por `scheduleProblem` equivalente; cria `push_sends` + `approvals` `target_ref = 'push:<id>'` e grava `approval_id`); `push_approve(p_send uuid) returns text` (`queued` ou `scheduled`); `push_reject(p_send uuid, p_reason text)`; `push_cancel(p_send uuid, p_reason text)` (quem pediu ou `push.settings`); `push_settings_pause(p_reason text)`; `push_resume_request(p_reason text) returns uuid` (`target_ref = 'push-resume:<uuid>'`); `push_resume_approve(p_approval uuid)` (aplica: `push.paused.on = false`, agendados vencidos há > 1 h → `expired`, `paused` → `queued`, aprovação `applied`); `push_expire_requests(p_now timestamptz) returns int` (urgente pendente > 60 min; Destaque pendente até `scheduled_at` ou 24 h).
  - `push_audience_estimate(p_kind text, p_audience jsonb) returns int` (`security definer`, confere `push.request`; arredonda para dezenas; < 20 devolve 0 = "menos de 20").
  - RLS `push_sends`: `select` para `push.approve`/`push.settings`; editor vê próprios e da editoria da matéria.
  - Auditoria `audit_push_changes()` (after insert/update em `push_sends`; `object_ref = 'push:<id>'`): `push.request`, `push.approve`, `push.reject`, `push.cancel`, `push.dispatch`, `push.finish`, `push.pause`, `push.resume_requested`, `push.resume_applied`, `actor = coalesce(auth.uid()::text, 'sistema')`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/auth/permissions.test.ts
it("push: matriz da spec §10.1", () => {
  expect(can([{ role: "editor", sections: ["cidade"] }], "push.request", { section: "cidade" })).toBe(true);
  expect(can([{ role: "editor", sections: ["cidade"] }], "push.approve")).toBe(false);
  expect(canAccess([{ role: "analista", sections: [] }], "push.metrics")).toBe(true);
  expect(canAccess([{ role: "analista", sections: [] }], "push.request")).toBe(false);
});
// src/lib/push/permissions.test.ts
it("editor só Destaque da própria editoria", () => {
  expect(pushKindsFor([{ role: "editor", sections: ["cidade"] }], "cidade")).toEqual(["highlight"]);
  expect(pushKindsFor([{ role: "editor", sections: ["cidade"] }], "esportes")).toEqual([]);
  expect(pushKindsFor([{ role: "editor_chefe", sections: [] }], "esportes")).toEqual(["urgent", "highlight"]);
});

// tests/integration/push-admin-db.test.ts (Review Focus 6)
it("quem pede não aprova, nem por SQL; editor e analista não aprovam; Helena aprova", async () => {
  const id = await rpcAs(marina, "push_request", { p: urgentReq(ART) });
  await expect(rpcAs(marina, "push_approve", { p_send: id })).rejects.toThrow(/outra pessoa|quem pede não decide/);
  await expect(as(marina).from("approvals").update({ status: "approved", approved_by: MARINA }).eq("target_ref", `push:${id}`)).rejects.toThrow(/quem pede não decide/);
  await expect(rpcAs(otavio, "push_approve", { p_send: id })).rejects.toThrow();
  await expect(rpcAs(thiago, "push_approve", { p_send: id })).rejects.toThrow();
  expect(await rpcAs(helena, "push_approve", { p_send: id })).toBe("queued");
  await expect(rpcAs(helena, "push_reject", { p_send: id, p_reason: "tarde" })).rejects.toThrow(/decisão já tomada/);
});
it("editor pede Destaque só da própria editoria e não pede urgente", async () => {
  await expect(rpcAs(otavio, "push_request", { p: highlightReq(ART_ESPORTES) })).rejects.toThrow(/editoria/);
  await expect(rpcAs(otavio, "push_request", { p: urgentReq(ART_CIDADE) })).rejects.toThrow();
  await expect(rpcAs(otavio, "push_request", { p: highlightReq(ART_CIDADE) })).resolves.toBeTruthy();
});
it("pedido: matéria patrocinada ou não publicada recusada; urgente agendado recusado", async () => {});
it("texto e público imutáveis depois do pedido", async () => {
  await expect(asService.from("push_sends").update({ title: "outro" }).eq("id", id)).rejects.toThrow(/imutáve/);
});
it("pausar vale na hora; retomar exige outra pessoa com push.approve", async () => {
  await rpcAs(helena, "push_settings_pause", { p_reason: "incidente" });
  await expect(rpcAs(helena, "app_setting_set", { p_key: "push.paused", p_value: { on: false }, p_ctx: {} })).rejects.toThrow(/pausar\/retomar/);
  const a = await rpcAs(helena, "push_resume_request", { p_reason: "resolvido" });
  await expect(rpcAs(helena, "push_resume_approve", { p_approval: a })).rejects.toThrow(/outra pessoa|quem pede não decide/);
  await rpcAs(marina, "push_resume_approve", { p_approval: a });
  expect((await setting("push.paused")).on).toBe(false);
  expect(await auditActions("push:")).toEqual(expect.arrayContaining(["push.pause", "push.resume_requested", "push.resume_applied"]));
});
it("configurações: limite 1–3, silêncio contém 22h–7h, operador de IA não mexe em push", async () => {
  await expect(rpcAs(helena, "app_setting_set", { p_key: "push.quiet_start", p_value: 23, p_ctx: {} })).rejects.toThrow();
  await expect(rpcAs(diego, "app_setting_set", { p_key: "push.default_daily_limit", p_value: 2, p_ctx: {} })).rejects.toThrow();
  await expect(rpcAs(diego, "app_setting_set", { p_key: "sources.fast_lane_max", p_value: 5, p_ctx: {} })).resolves.not.toThrow();
});
it("expiração: urgente sem aprovação em 60 min", async () => {});
it("alcance arredondado e 'menos de 20'", async () => {});

// tests/integration/push-reserve-parity.test.ts (Review Focus 2)
it.each(cases)("push_reserve = decideReservation: $name", async ({ input, expected }) => {
  const { sub, send } = await materialize(input); // inscrição e envio a partir do caso
  const [r] = await rpc("push_reserve", { p_sub: sub, p_send: send, p_now: input.now });
  expect({ outcome: r.outcome, notBefore: await notBeforeOf(r.delivery_id) }).toEqual(expected);
});
```

- [ ] **Step 2: Run** `pnpm db:reset && pnpm vitest run tests/integration/push-{admin-db,reserve-parity}.test.ts src/lib/auth src/lib/push/permissions.test.ts` → FAIL.
- [ ] **Step 3: Implement**; conferir que `tests/integration/source-admin*.test.ts` (do painel de fontes) continuam verdes com o novo `app_setting_set`; `pnpm db:types`.
- [ ] **Step 4: Run** `pnpm verify` → PASS.
- [ ] **Step 5: Commit** `feat(push): migration 0041 com pedidos, regra de duas pessoas, pausa e permissões [PW-T5]`

### Task PW-T6: Rotas públicas do push, sender e servidor falso [paralelo com PW-T5 e PW-T7]

Depende de PW-T1 e PW-T2.

**Files:**
- Create: `src/lib/push/{server,public,token,sender,fake-sender,api}.ts` e testes, `src/lib/db/push-store.ts`, `src/app/api/push/subscriptions/route.ts`, `src/app/api/push/subscriptions/[id]/route.ts`, `src/app/api/push/subscriptions/rotate/route.ts`, `src/app/api/push/receipt/route.ts`, `tests/support/fake-push-server.ts`, `tests/integration/push-routes.test.ts`, `tests/integration/push-sender.test.ts`

**Interfaces:**
- Consumes: `endpointProblem`, `endpointResolvesSafely`, `testHostsFromEnv`, schemas, `PushPayload`, `pushHeaders`, `retryDelay`, UA helpers (PW-T2); `push_receipt_hit` e tabelas (PW-T1); `hitRateLimit` (`src/lib/db/writes.ts`), `clientIp`, `ipKey`, `rateLimitSalt`, `readConsentCookie`.
- Produces:
  - `server.ts` (`server-only`): `VapidConfig = { publicKey: string; privateKey: string; subject: string }`; `vapidConfig(env?): VapidConfig | null`; `missingVapidVars(env?): string[]` (só nomes).
  - `public.ts` (cliente): `VAPID_PUBLIC_KEY: string | null` (de `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY`).
  - `token.ts`: `newManageToken(): { token: string; hash: string }` (32 bytes base64url, SHA-256 hex); `hashToken(token): string`; `bearer(req: Request): string | null`.
  - `sender.ts`: `SendOutcome = { kind: "accepted" } | { kind: "gone"; status: 404 | 410 } | { kind: "retry"; status: number | null; retryAfterSec: number | null } | { kind: "failed"; status: number; vapidInvalid: boolean }`; `PushSender = { send(sub: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload, headers: ReturnType<typeof pushHeaders>): Promise<SendOutcome> }`; `createWebPushSender(cfg: VapidConfig, deps: { resolve: ResolveHost; testHosts: string[]; timeoutMs?: number }): PushSender` (reconfere `endpointProblem` e DNS antes de cada envio; bloqueado → `failed` 400 sem chamar `web-push`; tempo 10 s → `retry`); `pushSender(): PushSender` (por `PUSH_PROVIDER`; `fake` sem VAPID também).
  - `fake-sender.ts`: `createFakeSender(): PushSender & { sent: { endpoint: string; payload: PushPayload; headers: Record<string, unknown> }[]; respondWith(endpointSuffix: string, outcome: SendOutcome): void }`.
  - `push-store.ts` (service role): `createPushSubscriptionStore(db)` → `findByEndpoint(endpoint): Promise<{ id: string; tokenHash: string } | null>`, `insert(row): Promise<{ id: string }>`, `replace(id, row)`, `get(id): Promise<SubscriptionRow | null>`, `update(id, patch)`, `remove(id)`, `rotate(id, endpoint, keys)`, `receiptHit(sendId, event, device, browser, now): Promise<boolean>`.
  - `api.ts`: `PushApiDeps = { store; hitLimit(bucket: string, key: string, limit: number, windowSec: number): Promise<boolean>; salt: string | null; now(): Date; siteOrigin: string; resolve: ResolveHost; testHosts: string[]; enabled: boolean }`; `handleSubscribe(req, deps)`, `handlePatch(req, id, deps)`, `handleDelete(req, id, deps)`, `handleRotate(req, deps)`, `handleReceipt(req, deps)`: `Origin` ≠ site → 403; corpo > 4 KB → 413; zod → 400; limites spec §13 (buckets `push-sub`, `push-patch:<id>`, `push-del`, `push-rotate`, `push-receipt`) → 429 `{ error: "Muitas tentativas. Tente de novo em alguns minutos." }`; sem VAPID (`enabled = false`) → 503. Subscribe: endpoint novo → 201 `{ id, token }`; existente com `oldToken` que confere → 200 `{ id, token }` novo; existente sem prova → 409. `browser`, `device_class`, `platform` derivados do `User-Agent` no servidor (UA não é gravado); `user_id` só com sessão de leitor. PATCH com token errado ou id inexistente → 404 (sem distinguir). Receipt: sem cookie `cn_consent` com Métricas → 204 sem gravar.
  - Rotas: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, só os métodos listados.
  - `tests/support/fake-push-server.ts`: `startFakePushServer(): Promise<{ origin: string; host: string; received: { path: string; headers: Record<string, string>; body: Buffer }[]; respond(pathSuffix: string, status: number, headers?: Record<string, string>): void; decrypt(body: Buffer, keys: { privateKey: CryptoKey | Buffer; auth: Buffer }): Promise<unknown>; close(): Promise<void> }>` (HTTP em `127.0.0.1:<porta livre>`; decifra aes128gcm com o par ECDH gerado no teste).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/push/api.test.ts (deps em memória)
it("cria inscrição só com alvos explícitos e devolve token; banco guarda só o hash", async () => {
  const res = await handleSubscribe(post({ endpoint: FCM, keys, targets: ["bairro:cpa"], installed: false, metricsConsent: false }), deps);
  expect(res.status).toBe(201);
  const { id, token } = await res.json();
  expect(store.rows.get(id)).toMatchObject({ targets: ["bairro:cpa"], manageTokenHash: hashToken(token) });
  expect(JSON.stringify(store.rows.get(id))).not.toContain(token);
});
it("campos fora do schema (anonId, history) são recusados", async () =>
  expect((await handleSubscribe(post({ ...valid, anonId: UUID }), deps)).status).toBe(400));
it("endpoint existente sem prova de posse → 409; com oldToken → token novo", async () => {});
it("SSRF: fora da allowlist, http, porta, credenciais e DNS privado → 400 sem requisição (Review Focus 4)", async () => {
  const resolve = spyResolve({ "fcm.googleapis.com": ["10.0.0.5"] });
  for (const endpoint of ["https://evil.example/x", "http://fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://u:p@fcm.googleapis.com/x", "https://fcm.googleapis.com/x"])
    expect((await handleSubscribe(post({ ...valid, endpoint }), { ...deps, resolve })).status).toBe(400);
  expect(store.rows.size).toBe(0);
});
it("Origin de outro site → 403; corpo > 4 KB → 413; limite → 429", async () => {});
it("PATCH com token errado → 404; silêncio 23h ou limite 4 → 400", async () => {});
it("receipt sem Métricas no cookie não grava (Review Focus 5)", async () => {
  const res = await handleReceipt(post({ s: SEND, e: "clicked", d: "mobile", b: "chrome" }, { cookie: "cn_consent=v1|m0|p0" }), deps);
  expect(res.status).toBe(204);
  expect(store.receipts).toHaveLength(0);
});
it("sem VAPID responde 503", async () => expect((await handleSubscribe(post(valid), { ...deps, enabled: false })).status).toBe(503));

// tests/integration/push-sender.test.ts (servidor falso + web-push real, sem rede externa)
it("201 aceito; payload decifrado só com v,t,b,u,g,s; cabeçalhos TTL, Urgency e Topic", async () => {
  const sender = createWebPushSender(await generatedVapid(), { resolve: fakeResolve({}), testHosts: [server.host] });
  expect(await sender.send(sub(server, "/ok"), payload, pushHeaders("urgent", TAG))).toEqual({ kind: "accepted" });
  const [r] = server.received;
  expect(Object.keys((await server.decrypt(r.body, browserKeys)) as object).sort()).toEqual(["b", "g", "s", "t", "u", "v"]);
  expect(r.headers).toMatchObject({ ttl: "7200", urgency: "high", topic: TAG });
});
it("404 e 410 → gone; 429 com Retry-After → retry com o valor; 500 → retry; 403 → failed vapidInvalid; 413 → failed", async () => {});
it("host permitido resolvendo para IP privado no envio → failed sem requisição (Review Focus 4)", async () => {});

// tests/integration/push-routes.test.ts
it("POST, PATCH, rotate e DELETE ponta a ponta no banco local", async () => {});
it("receipt com Métricas soma em push_send_counters sem id de inscrição", async () => {});
```

- [ ] **Step 2: Run** `pnpm vitest run src/lib/push/api.test.ts tests/integration/push-{routes,sender}.test.ts` → FAIL.
- [ ] **Step 3: Implement** seguindo o padrão de `src/lib/events/api.ts` (handler puro com deps, rota fina). Nenhum `console.log` de endpoint ou token.
- [ ] **Step 4: Run** `pnpm verify` → PASS.
- [ ] **Step 5: Commit** `feat(push): rotas de inscrição e recibo, sender VAPID e servidor de push falso [PW-T6]`

### Task PW-T7: Leitura offline no portal [paralelo com PW-T5 e PW-T6]

Depende de PW-T2 e PW-T3.

**Files:**
- Create: `src/components/editorial/{SwRegistrar,OfflineNotice}.tsx` e testes, `src/proxy.test.ts`, `src/lib/offline/sw.test.ts`, `tests/e2e/offline.spec.ts`
- Modify: `src/lib/offline/sw.ts`, `src/components/editorial/PublicShell.tsx` (monta `SwRegistrar` e `OfflineNotice`), `src/proxy.ts` (marcador G2; `matcher` exclui também `icons/` e `manifest.webmanifest`), `src/components/editorial/RecommendationControls.tsx` ("Apagar histórico local" chama também `clearOffline()`), `src/app/(public)/privacidade/page.tsx` e `src/content/pt-BR/privacy.ts` (botão "Limpar leitura offline" com status "Leitura offline apagada deste aparelho.")

**Interfaces:**
- Consumes: `OFFLINE_MARKER_HEADER`, `SwInbound`, `OfflineListing`, `staleLabel`, `OFFLINE_TEXT` (PW-T3); `browserFamily`, `deviceClass` (PW-T2); `useConsent` (`src/lib/consent/client`).
- Produces:
  - `src/lib/offline/sw.ts` (mantém `registerSw`, `cacheSaved`, `showNotification`, `MAX_OFFLINE_SAVED`): `registerSwOnIdle(pathname: string): void` (nunca em `/estudio`; depois do `load` e em `requestIdleCallback`, com `setTimeout` de 2 s como reserva); `askSw<T>(msg: SwInbound, timeoutMs?: number): Promise<T | null>` (`MessageChannel`); `queryCachedAt(url: string): Promise<string | null>`; `listOffline(): Promise<OfflineListing | null>`; `clearOffline(): Promise<boolean>`; `sendConsentToSw(c: { metrics: boolean }): Promise<void>` (acrescenta `device` e `browser` do `navigator.userAgent`).
  - `offlineMarker(pathname: string, cookieHeader: string | null, sections: readonly string[]): boolean` exportada de `src/proxy.ts` (rota da allowlist e sem cookie `sb-*-auth-token`); o proxy grava `x-cn-offline: 1` quando verdadeiro.
  - `SwRegistrar` (`"use client"`, carregado por `next/dynamic` sem SSR): registra, manda o consentimento ao montar e a cada mudança.
  - `OfflineNotice` (`"use client"`): ao montar pergunta `served-from-cache`; com resposta, faixa `role="status"` no topo com `staleLabel`; evento `online` → "Conexão de volta." + botão "Atualizar" (`location.reload()`); nada quando a página veio da rede.

- [ ] **Step 1: Write the failing tests**

```ts
// src/proxy.test.ts
it("marca rotas da allowlist sem sessão; nunca com cookie de sessão nem fora da allowlist (Review Focus 1)", () => {
  expect(offlineMarker("/", null, SW_SECTIONS)).toBe(true);
  expect(offlineMarker("/materia/chuva", "cn_consent=v1|m1|p0", SW_SECTIONS)).toBe(true);
  expect(offlineMarker("/materia/chuva", "sb-abc-auth-token=xyz", SW_SECTIONS)).toBe(false);
  expect(offlineMarker("/materia/chuva", "sb-abc-auth-token.0=xyz", SW_SECTIONS)).toBe(false);
  for (const p of ["/perfil", "/busca", "/estudio", "/alertas"]) expect(offlineMarker(p, null, SW_SECTIONS)).toBe(false);
});
it("matcher não passa ícones nem manifesto pelo proxy", () => {});

// OfflineNotice.test.tsx
it("página servida do cache mostra o rótulo; online troca por Conexão de volta + Atualizar", async () => {
  mockAskSw({ cachedAt: "2026-09-28T18:32:00Z" });
  render(<OfflineNotice now={() => new Date("2026-09-28T20:00:00Z")} />);
  expect(await screen.findByRole("status")).toHaveTextContent("Salva às 14h32, pode estar desatualizada.");
  act(() => window.dispatchEvent(new Event("online")));
  expect(screen.getByRole("button", { name: "Atualizar" })).toBeVisible();
});
it("página da rede não mostra nada", async () => {});

// SwRegistrar.test.tsx / sw.test.ts
it("não registra em /estudio; registra depois do load em página pública", () => {});
it("manda consent ao SW ao montar e quando a escolha muda", async () => {});

// tests/e2e/offline.spec.ts (Chromium; context.setOffline)
test("home, editoria, matéria lida e salva abrem offline com 'Salva às…'; matéria nunca aberta cai em Sem conexão com a lista", async ({ page, context }) => {
  await page.goto("/"); await swReady(page);
  await page.goto("/cidade"); await page.goto(`/materia/${LIDA}`); await saveArticle(page, SALVA);
  await context.setOffline(true);
  for (const path of ["/", "/cidade", `/materia/${LIDA}`, `/materia/${SALVA}`]) {
    await page.goto(path);
    await expect(page.getByRole("status")).toContainText(/Salva (às|em) .*pode estar desatualizada\./);
  }
  await page.goto(`/materia/${NUNCA_ABERTA}`);
  await expect(page.getByRole("heading", { level: 1, name: "Sem conexão" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Lidas recentemente" })).toContainText(LIDA_TITULO);
});
test("página de /perfil e resposta de leitor logado não entram no cache", async ({ page }) => { /* caches.keys + match por caminho */ });
test("Limpar leitura offline apaga cn-lidas e cn-paginas e mantém cn-salvos", async ({ page }) => {});
test("SW não é registrado no Estúdio", async ({ page }) => { /* loginAs; navigator.serviceWorker.getRegistration('/estudio') controla? não; nenhuma resposta /estudio em caches */ });
```

- [ ] **Step 2: Run** `pnpm vitest run src/proxy.test.ts src/lib/offline src/components/editorial/{OfflineNotice,SwRegistrar}.test.tsx && pnpm test:e2e tests/e2e/offline.spec.ts` → FAIL.
- [ ] **Step 3: Implement.** Se o Chromium do Playwright não aplicar `setOffline` à rede do SW, usar `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` com `context.route("**/*", (r) => r.abort("internetdisconnected"))` e registrar o contorno em `.planning/BLOCKERS.md` (nunca pular o teste).
- [ ] **Step 4: Run** `pnpm verify` → PASS.
- [ ] **Step 5: Commit** `feat(pwa): registro do SW nas páginas públicas, aviso de cópia antiga e limpar leitura offline [PW-T7]`

### Task PW-T8: Convites de instalação, `/app` e eventos do app [paralelo com PW-T9]

Depende de PW-T4 e PW-T7.

**Files:**
- Create: `src/lib/app/{invites,storage,install,slot}.ts` e testes, `src/components/editorial/{InstallInvite,IosInstallSteps}.tsx` e testes, `src/app/(public)/app/{page.tsx,InstallButton.tsx}`, `src/content/pt-BR/app.ts`, `tests/e2e/install.spec.ts`
- Modify: `src/components/editorial/ConsentBanner.tsx` e `LoginInvite.tsx` (ocupam a vaga de convite), `PublicShell.tsx` (monta `InstallInvite` por `next/dynamic`), `SiteFooter.tsx` ("Baixar o app"), `src/content/pt-BR/{nav,explore}.ts` (link no menu Perfil mobile e em Explorar), `src/lib/events/{names,schema,api}.ts`, `src/lib/events/events.test.ts`, `docs/tracking-plan.md` §2 (8 eventos, §9.1 da spec)

**Interfaces:**
- Produces:
  - `invites.ts` (puro): `AppState = { visits: number; reads: number; install: { refusals: number; silencedUntil: string | null; installed: boolean }; notif: { refusals: number; silencedUntil: string | null }; lastVisitDay: string | null; lastVisitAt: string | null }`; `EMPTY_APP_STATE`; `SILENCE_DAYS = 14`; `MAX_REFUSALS = 3`; `recordVisit(s, now, newTabSession: boolean): AppState` (2ª visita = sessão nova em dia diferente ou ≥ 30 min depois); `recordRead(s): AppState`; `InstallContext = { standalone: boolean; canPrompt: boolean; ios: boolean; iosSafari: boolean; path: string }`; `shouldOfferInstall(s, ctx, now): false | "visits" | "reads"`; `NotifContext = { pushAvailable: boolean; permission: NotificationPermission; subscribed: boolean; ios: boolean; standalone: boolean; path: string }`; `shouldOfferNotifications(s, ctx, now): boolean`; `recordRefusal(s, which: "install" | "notif", now): AppState`; `BLOCKED_PATHS = ["/estudio", "/entrar", "/criar-conta", "/perfil", "/privacidade"]`.
  - `storage.ts`: `readAppState(): AppState | null` (`null` sem `localStorage` ⇒ nenhum convite), `writeAppState(s)`, chave `cn_app`, sessão de aba em `sessionStorage` `cn_app_tab`.
  - `install.ts`: `captureInstallPrompt(): void` (guarda `beforeinstallprompt` e chama `preventDefault`), `installPromptAvailable(): boolean`, `promptInstall(): Promise<"accepted" | "dismissed" | "unavailable">`, `isStandalone(): boolean`, `platformForInvite(): "android" | "ios" | "desktop"`, `isIosSafari(ua): boolean`, `handleFirstStandaloneOpen(track)` (com `?origem=app` e `standalone`: marca instalado, registra `app_installed` `via` e remove o parâmetro com `history.replaceState`).
  - `slot.ts`: `InviteKind = "consent" | "login" | "notif" | "install"`; `claimInviteSlot(kind): boolean` (prioridade fixa; quem está na frente adia os demais para a próxima navegação); `releaseInviteSlot(kind)`; `useInviteSlot(kind, wanted: boolean): boolean`.
  - Eventos: `EVENT_NAMES` + `install_prompt_shown`, `install_prompt_dismissed`, `app_installed`, `notif_preprompt_shown`, `notif_preprompt_dismissed`, `notif_permission_granted`, `notif_permission_denied`, `push_unsubscribed` com as props exatas da spec §9.1 (`platform`, `trigger`, `refusals`, `via`, `from`) e `z.strictObject`; `APP_EVENTS` (lista dos 8); `/api/events` acrescenta `props.browser = browserFamily(User-Agent)` só nesses 8, sem gravar o UA.
  - `InstallInvite`: `role="region"` `aria-label="Instalar o app"`, texto "Leia o CityNews como app: abre mais rápido e funciona sem internet.", "Instalar" e "Agora não"; reserva espaço acima da barra inferior; `install_prompt_shown` depois de 1 s visível.
  - `IosInstallSteps`: `<dialog>` com título "Adicionar o CityNews à Tela de Início", lista ordenada de 3 passos da spec §7.3 (variante "Toque em Compartilhar na barra de endereço" fora do Safari), nota, "Entendi" e "Agora não" (conta recusa), ícone Compartilhar em SVG próprio com texto.
  - `/app` (P26): instruções por plataforma (spec §7.9), botão "Instalar" com `beforeinstallprompt`, "Já instalado" em `standalone`; `metadata.title` "Baixar o app".

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/app/invites.test.ts
it("oferece na 2ª visita ou depois de 3 leituras", () => {
  expect(shouldOfferInstall({ ...EMPTY_APP_STATE, visits: 1, reads: 2 }, android, NOW)).toBe(false);
  expect(shouldOfferInstall({ ...EMPTY_APP_STATE, visits: 2 }, android, NOW)).toBe("visits");
  expect(shouldOfferInstall({ ...EMPTY_APP_STATE, reads: 3 }, android, NOW)).toBe("reads");
});
it("Agora não silencia 14 dias; 3 recusas = nunca mais; nunca em standalone nem em /perfil", () => {
  let s = recordRefusal({ ...EMPTY_APP_STATE, visits: 5 }, "install", NOW);
  expect(shouldOfferInstall(s, android, addDays(NOW, 13))).toBe(false);
  expect(shouldOfferInstall(s, android, addDays(NOW, 15))).toBe("visits");
  s = recordRefusal(recordRefusal(s, "install", NOW), "install", NOW);
  expect(shouldOfferInstall(s, android, addDays(NOW, 400))).toBe(false);
  expect(shouldOfferInstall({ ...EMPTY_APP_STATE, visits: 5 }, { ...android, standalone: true }, NOW)).toBe(false);
  expect(shouldOfferInstall({ ...EMPTY_APP_STATE, visits: 5 }, { ...android, path: "/perfil" }, NOW)).toBe(false);
});
it("sem beforeinstallprompt e fora do iPhone não oferece (Firefox)", () => expect(shouldOfferInstall({ ...EMPTY_APP_STATE, visits: 5 }, { ...android, canPrompt: false }, NOW)).toBe(false));
it("2ª visita = sessão nova em outro dia ou 30 min depois", () => {});
it("notificações: iPhone só em standalone; permissão já decidida nunca", () => {
  expect(shouldOfferNotifications(EMPTY_APP_STATE, { ...notifCtx, ios: true, standalone: false }, NOW)).toBe(false);
  expect(shouldOfferNotifications(EMPTY_APP_STATE, { ...notifCtx, permission: "denied" }, NOW)).toBe(false);
  expect(shouldOfferNotifications(EMPTY_APP_STATE, { ...notifCtx, pushAvailable: false }, NOW)).toBe(false);
});
// slot.test.ts
it("um convite por vez: consentimento vence login, login vence notificações, notificações vencem instalação", () => {});

// events.test.ts
it("8 eventos do app com props estritas; browser vem do servidor", async () => {
  expect(parseEvent(json(ev("app_installed", { via: "prompt" }))).ok).toBe(true);
  expect(parseEvent(json(ev("app_installed", { via: "prompt", anonId: "x" }))).ok).toBe(false);
  const saved = await postEvent(ev("install_prompt_shown", { platform: "android", trigger: "visits" }), { "user-agent": SAMSUNG_UA });
  expect(saved.props).toEqual({ platform: "android", trigger: "visits", browser: "samsung" });
  expect(JSON.stringify(saved)).not.toContain("SamsungBrowser");
});

// tests/e2e/install.spec.ts
test("faixa na 2ª visita com beforeinstallprompt sintético; Agora não some 14 dias; 3 recusas nunca mais", async ({ page }) => {
  await page.addInitScript(fakeBeforeInstallPrompt); // dispara o evento com prompt()/userChoice falsos
  await acceptConsent(page, "metrics");
  await visit(page, 1); await expect(page.getByRole("region", { name: "Instalar o app" })).toHaveCount(0);
  await visit(page, 2); await expect(page.getByRole("region", { name: "Instalar o app" })).toBeVisible();
  await page.getByRole("button", { name: "Agora não" }).click();
  await page.clock.fastForward("13d"); await visit(page, 3); await expect(page.getByRole("region", { name: "Instalar o app" })).toHaveCount(0);
  /* 15d → volta; mais duas recusas → nunca; "Baixar o app" continua no rodapé */
});
test("oculta com display-mode standalone emulado", async ({ page }) => {});
test("nunca junto do banner de consentimento", async ({ page }) => {});
test("iPhone (mobile-webkit): Instalar abre os 3 passos e Agora não conta recusa", async ({ page }) => {});
test("/app mostra instruções e 'Já instalado' em standalone", async ({ page }) => {});
test("?origem=app em standalone registra app_installed e limpa a URL", async ({ page }) => {});
```

- [ ] **Step 2: Run** `pnpm vitest run src/lib/app src/lib/events src/components/editorial/{InstallInvite,IosInstallSteps}.test.tsx && pnpm test:e2e tests/e2e/install.spec.ts` → FAIL.
- [ ] **Step 3: Implement**; `QUALIFIED_READ_EVENT` (`src/lib/anon/invite-storage.ts`) alimenta `recordRead`. Eventos só por `trackWithConsent`.
- [ ] **Step 4: Run** `pnpm verify` → PASS.
- [ ] **Step 5: Commit** `feat(pwa): convite de instalação, passos no iPhone, página /app e eventos do app [PW-T8]`

### Task PW-T9: Envio pela fila `notify`, despacho e pausa [paralelo com PW-T8]

Depende de PW-T5 e PW-T6.

**Files:**
- Create: `supabase/migrations/0043_push_cron.sql`, `src/lib/push/steps/{match,deliver,due,index}.ts` e testes, `src/lib/db/push-send-store.ts`, `tests/integration/push-send-flow.test.ts`
- Modify: `src/lib/pipeline/types.ts` e `types.test.ts` (`PUSH_STEPS`, `JOB_STEPS`), `src/lib/pipeline/steps/index.ts` (registra os três), `src/lib/pipeline/drain.ts` e `drain.test.ts` (`beforeDrain`), `src/lib/pipeline/deps.ts` (`defaultDrainDeps` chama `push_dispatch_due`), `src/lib/db/types.ts`

**Interfaces:**
- Consumes: `push_reserve`, `push_claim_due`, `push_delivery_result`, `push_batches` (PW-T1); `push.paused`, `push_expire_requests`, aprovações (PW-T5); `PushSender`, `pushSender()` (PW-T6); `buildPayload`, `pushHeaders`, `tagFor`, `retryDelay`, `articleTargets` (PW-T2); `labelsFor` (`src/lib/labels`) para o rótulo principal (D-P18).
- Produces:
  - `types.ts`: `PUSH_STEPS = ["push_match", "push_deliver", "push_due"] as const`; `JOB_STEPS = [...STEP_NAMES, ...PUSH_STEPS]`; `PipelineMessageSchema.step` aceita `JOB_STEPS`; `queueFor(push_*) === "notify"`; `STEP_NAMES` continua com 20 itens.
  - `DrainDeps.beforeDrain?: () => Promise<void>` (erro é registrado e não impede o drain).
  - SQL (0043): trigger `articles_push_follow` (after insert or update of `status` em `articles`; ao virar `published`, sem `urgent`, sem `sponsored`, sem envio `follow` da matéria) → `queue_enqueue('notify', 'push_match:article:<id>', {runId:"push",step:"push_match",itemRef:"article:<id>",attempt:1}, case publish_mode when 'auto' then 600 else 0 end)`; `push_dispatch_due(p_now timestamptz default now()) returns jsonb` (chama `push_expire_requests`; com `push.paused.on` só conta; `queued` e `scheduled` vencidos → confere a aprovação de novo (`approved`, `approved_by <> requested_by`, `push_can(approved_by, 'push.approve')`), marca `applied`, `dispatching`, enfileira `push_match:push:<id>`; aprovação inválida → `cancelled` motivo "Aprovação inválida"; `paused` retomados → reenfileira lotes `paused`; entregas `queued` com `attempts > 0` ou `deferred` com `not_before ≤ now` → `push_due:due:<sendId>`); jobs pg_cron `push-dispatch` (`* * * * *`) e `push-retention` (`35 4 * * *`, `push_retention(now())`) só se `pg_cron` existir (sem ele o `beforeDrain` cobre o despacho).
  - `PushSendStore` (`push-send-store.ts`, service role): `paused(): Promise<boolean>`; `articleForPush(id): Promise<PushArticle | null>` (`PushArticle = { id; slug; status; title; dek; urgent; sponsored; publishMode; sectionSlug; topicSlug: string | null; neighborhoods: string[]; sourceSlugs: string[]; originLabel: string }`); `ensureFollowSend(a: PushArticle, notBefore: string | null): Promise<{ id: string; status: string } | null>`; `getSend(id)`; `planBatches(sendId: string, targets: TargetKey[] | null, audience: Audience, kind: PushKind, pageSize: 500, batchSize: 100): Promise<number>` (cursor por `id`, grava `push_batches` e `batches_total`, `dispatching`); `batchSubscriptions(sendId, batchNo): Promise<{ status: string; subs: DeliverySub[] }>`; `reserve(subId, sendId, now)`; `deliveryResult(id, outcome, http, error, retryAt)`; `finishBatch(sendId, batchNo): Promise<{ allDone: boolean }>` (último → `sent`, `push.finish`); `pauseSend(sendId, reason)`; `cancelSend(sendId, reason)`; `pauseBatch(sendId, batchNo)`; `dueDeliveries(sendId, now, limit: 100): Promise<DueDelivery[]>`; `claimDue(deliveryId, now)`; `notifyVapidInvalid(sendId)` (`notify_once` crítico "Chaves VAPID inválidas", Control Center).
  - `createPushSteps(deps: { store: PushSendStore; sender: PushSender; now: () => Date; concurrency?: 10 }): Pick<StepHandlers, "push_match" | "push_deliver" | "push_due">`:
    - `push_match`: matéria despublicada → `cancelled` "Matéria despublicada" (nada enviado); pausado → envio `paused`, ack sem lotes; `follow` → `ensureFollowSend` + alvos = `articleTargets`; `urgent`/`highlight` → público do pedido e `want_urgent`/`want_highlight`; devolve uma mensagem `push_deliver` por lote.
    - `push_deliver`: pausado → `pauseBatch`, ack; para cada inscrição do lote (concorrência 10): `reserve` → `ok` envia (`buildPayload` com `withOriginLabel`, tag `tagFor`, `pushHeaders`) e grava o resultado (`gone`, `retry` com `retryDelay`, `failed`; 403 → `pauseSend(…, "vapid_invalid")` + `notifyVapidInvalid`, para o lote); ao fim `finishBatch`.
    - `push_due`: `dueDeliveries` → `claimDue` → envia como acima; `follow` agrupado sai com tag `follow` e a matéria mais recente.
  - Payload nunca leva dado do leitor, id de inscrição ou alvo.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/push/steps/match.test.ts / deliver.test.ts (store em memória + fake sender)
it("follow: matéria de cidade com bairro CPA vai para quem segue section:cidade ou bairro:cpa com want_follow (critério 12)", async () => {
  const store = memoryPushStore({ subs: [sub("a", ["section:cidade"]), sub("b", ["bairro:cpa"]), sub("c", ["section:esportes"]), sub("d", ["bairro:cpa"], { wantFollow: false })] });
  await runAll(msg("push_match", "article:A1"), steps(store, fake));
  expect(fake.sent.map((s) => s.endpoint).sort()).toEqual([EP.a, EP.b]);
  expect(fake.sent[0].payload.b).toMatch(/^ORIGINAL CITYNEWS · /);
});
it("despublicada antes do envio: cancelado e nada sai", async () => {});
it("pausado: match e deliver não enviam; lote fica paused e volta ao retomar sem reenviar", async () => {});
it("403 pausa o envio, alerta o Control Center e para o lote", async () => {
  fake.respondWith("/b", { kind: "failed", status: 403, vapidInvalid: true });
  await runAll(msg("push_match", "article:A1"), steps(store, fake));
  expect(store.send("A1").status).toBe("paused");
  expect(store.notifications).toEqual([expect.objectContaining({ title: "Chaves VAPID inválidas", severity: "critical" })]);
});
it("429 com Retry-After 900 reagenda a entrega em 15 min; na 4ª falha vira failed", async () => {});
it("lote reprocessado depois de queda não reenvia nem conta pulo duplicado (Review Focus 3)", async () => {});

// src/lib/pipeline/types.test.ts / drain.test.ts
it("STEP_NAMES segue com 20 etapas; push_* vão para notify", () => { expect(STEP_NAMES).toHaveLength(20); expect(queueFor("push_deliver")).toBe("notify"); });
it("beforeDrain roda antes da leitura e erro nele não derruba o drain", async () => {});

// tests/integration/push-send-flow.test.ts (banco local + servidor falso + web-push real)
it("publicada por pessoa sai na hora; automática espera 10 min e despublicada no meio não envia (critério 12)", async () => {
  await publishAs("human", ART_H); await drainOnce();
  expect(server.received).toHaveLength(1);
  await publishAs("auto", ART_A); await drainOnce(); expect(server.received).toHaveLength(1);
  await unpublish(ART_A); await advanceQueue(600); await drainOnce();
  expect(server.received).toHaveLength(1);
});
it("fan-out de 1 200 inscrições em 3 lotes de páginas e 12 lotes de entrega, contadores fechados", async () => {});
it("urgente aprovado por Helena sai no silêncio; Destaque no silêncio fica deferred e sai às 07:00 (critério 13)", async () => {});
it("despacho reconfere a aprovação: registro adulterado para rejected → cancelado sem enviar (Review Focus 6)", async () => {
  const id = await approvedUrgent(); // Marina pede, Helena aprova
  await asService.from("approvals").update({ status: "rejected" }).eq("target_ref", `push:${id}`);
  await rpc("push_dispatch_due", { p_now: NOW });
  expect((await send(id)).status).toBe("cancelled");
  expect(server.received).toHaveLength(0);
});
it("404/410 no envio apaga a inscrição e soma removed_n (critério 14)", async () => {});
it("urgente pendente há 61 min expira", async () => {});
```

- [ ] **Step 2: Run** `pnpm vitest run src/lib/push/steps src/lib/pipeline && pnpm db:reset && pnpm vitest run tests/integration/push-send-flow.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Lotes respeitam `DRAIN_BUDGET_RATIO` (o drain devolve a mensagem; o envio por inscrição é idempotente pelo índice único). `STEP_MIN_MS.push_deliver = 15_000`.
- [ ] **Step 4: Run** `pnpm verify` → PASS (inclui `tests/integration/{pipeline,queue,tick}.test.ts`).
- [ ] **Step 5: Commit** `feat(push): envio automático e aprovado pela fila notify com trilhos, retentativas e pausa [PW-T9]`

### Task PW-T10: Avisos do leitor: pré-prompt, Alertas e privacidade [paralelo com PW-T11]

Depende de PW-T6 e PW-T8.

**Files:**
- Create: `src/lib/push/client.ts` e teste, `src/components/editorial/{NotificationInvite,NotificationInviteSlot,PushSettings}.tsx` e testes, `src/content/pt-BR/notifications.ts`, `tests/e2e/push-reader.spec.ts`
- Modify: `src/app/(public)/alertas/AlertsClient.tsx` (bloco "Avisos no celular e no computador"), `src/components/editorial/AlertWatcher.tsx` (D-P20), `src/components/editorial/{SourceFollow,FollowTopicButton}.tsx` (disparam o convite), `src/app/(public)/materia/[slug]/page.tsx` (vaga no topo do corpo de matéria urgente), `src/app/(public)/perfil/actions.ts` e `src/lib/db/account.ts` (exportação lista inscrições sem chaves), `src/app/(public)/privacidade/page.tsx` e `src/content/pt-BR/privacy.ts` (seções "Avisos pelo celular" e "Leitura offline")

**Interfaces:**
- Consumes: `VAPID_PUBLIC_KEY` (PW-T6), rotas `/api/push/*` (PW-T6), `targetsFromProfile`, `browserFamily` (PW-T2), `getMeta`/`setMeta` `push` (PW-T3, G18), `sendConsentToSw` (PW-T7), `shouldOfferNotifications`, `recordRefusal`, `useInviteSlot`, eventos do app (PW-T8), `getAnonStore`.
- Produces:
  - `client.ts`: `PushSupport = "unsupported" | "no_keys" | "ios_needs_install" | "default" | "denied" | "granted"`; `pushSupport(): PushSupport`; `PushState = { status: "off" } | { status: "on"; id: string; prefs: PushPrefs; targets: TargetKey[] } | { status: "lost" }`; `PushPrefs = { follow: boolean; urgent: boolean; highlight: boolean; quietStart: number; quietEnd: number; dailyLimit: 1 | 2 | 3 }`; `enablePush(trigger: "follow" | "alert" | "urgent_article" | "settings"): Promise<Result<PushState, "denied" | "subscribe_failed" | "server_failed" | "rate_limited">>` (só em gesto; negada registra `notif_permission_denied`; falha no `POST` chama `unsubscribe()`); `disablePush(): Promise<Result<void, "server_failed">>` (`unsubscribe()` + `DELETE` + `push_unsubscribed`); `updatePushPrefs(patch: Partial<PushPrefs>): Promise<Result<PushState, "server_failed" | "lost">>`; `syncPush(consentMetrics: boolean): Promise<PushState>` (no carregamento: alvos atuais, `metrics_consent`, `seen`; `getSubscription()` sem token → `unsubscribe()` e `lost`; 404 → `lost`); `usePushState()`.
  - `notifications.ts`: `NOTIF_TEXT` com os textos exatos da spec §7.4, §7.5 e §15 (título "Quer receber avisos?", texto D-P09, "Ativar", "Agora não", toast "Avisos ativados. Ajuste em Alertas.", negada "Tudo bem. Se mudar de ideia, veja em Alertas como reativar.", erros, estados de P18, instruções por navegador, "Urgentes podem chegar no silêncio.", "Os avisos deste navegador foram desativados. Ativar de novo?").
  - `NotificationInvite`: `role="region"` `aria-labelledby`; "Ativar" chama `enablePush`; "Agora não" nunca chama `Notification.requestPermission`; `notif_preprompt_shown` depois de 1 s visível.
  - `NotificationInviteSlot({ trigger })`: renderiza o convite logo abaixo do gatilho quando `requestNotificationInvite(trigger)` é disparado e as regras deixam; no iPhone fora do app abre C08 se a faixa estiver elegível.
  - `PushSettings`: estados sem suporte, iPhone fora do app ("Como adicionar" abre C08), desligado, negado (instruções do navegador detectado + "Já reativei"), ativo (3 Switches que salvam na hora, dois Selects de silêncio 18–22/7–10, "Máximo por dia" 1–3, "O que você segue" com os alvos enviados, "Desativar avisos"), carregando (skeleton), erro ao salvar (valor anterior restaurado + "Tentar de novo"), inscrição perdida.
  - `AlertWatcher`: com `PushState.status === "on"`, não mostra avisos `immediate` (resumos continuam).

- [ ] **Step 1: Write the failing tests**

```ts
// client.test.ts (PushManager, Notification e fetch falsos)
it("Ativar concedido inscreve com os alvos explícitos e nada mais (critério 9)", async () => {
  profile.set({ follows: [f("source", "mt-agora")], alerts: [alert("bairro", "cpa", "browser")], history: [h("x")], interests: [i("politica")], anonId: UUID });
  await enablePush("follow");
  expect(JSON.parse(fetchCalls[0].body)).toEqual({ endpoint: EP, keys, targets: ["source:mt-agora", "bairro:cpa"], installed: false, metricsConsent: false });
  expect(await getMeta("push")).toMatchObject({ id: "s1", token: "t1" });
});
it("POST falhou depois do subscribe → unsubscribe e erro, sem contar recusa", async () => {});
it("token perdido com permissão concedida → unsubscribe e estado lost", async () => {});
it("Métricas desligadas depois: PATCH metrics_consent=false e consent falso ao SW (Review Focus 5)", async () => {
  await syncPush(false);
  expect(fetchCalls.at(-1)).toMatchObject({ method: "PATCH", body: expect.stringContaining('"metricsConsent":false') });
  expect(swMessages.at(-1)).toMatchObject({ type: "consent", metrics: false });
});

// NotificationInvite.test.tsx
it("Agora não nunca chama o pedido nativo e silencia 14 dias", async () => {
  const spy = vi.spyOn(Notification, "requestPermission");
  render(<NotificationInvite trigger="follow" />);
  expect(screen.getByText("Avisamos só do que você segue e de urgências, no máximo 3 por dia. Entre 22h e 7h, só urgências.")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Agora não" }));
  expect(spy).not.toHaveBeenCalled();
});
// PushSettings.test.tsx
it("silêncio só oferece 18–22 e 7–10; limite 1–3; erro restaura o valor anterior", async () => {});
it("negado mostra as instruções do Chrome/Edge para UA de Chrome", async () => {});
// AlertWatcher.test.tsx
it("com push ativo não mostra imediatos; resumo diário continua", async () => {});

// tests/e2e/push-reader.spec.ts (Chromium; permissões concedidas; PushManager.prototype.subscribe trocado por addInitScript com endpoint do servidor falso)
test("seguir fonte mostra o pré-prompt; Ativar cria a inscrição; Alertas mostra ativo com o que você segue", async ({ page, context }) => {});
test("Agora não não chama requestPermission (espião no addInitScript)", async ({ page }) => {});
test("iPhone (mobile-webkit) fora do app: nenhum pré-prompt; Alertas mostra 'No iPhone, os avisos funcionam com o CityNews na Tela de Início.'", async ({ page }) => {});
test("Desativar avisos apaga a inscrição no servidor", async ({ page }) => {});
test("sem VAPID no build (projeto sem chave): Alertas mostra 'Avisos pelo celular ainda não estão disponíveis.'", async ({ page }) => { /* PushSettings com VAPID_PUBLIC_KEY nulo via rota de teste de componente */ });
```

- [ ] **Step 2: Run** `pnpm vitest run src/lib/push/client.test.ts src/components/editorial && pnpm test:e2e tests/e2e/push-reader.spec.ts` → FAIL.
- [ ] **Step 3: Implement.** Tudo sem login; nada de `anonId` na inscrição; `syncPush` no `SwRegistrar`-irmão (mesmo `next/dynamic`).
- [ ] **Step 4: Run** `pnpm verify` → PASS.
- [ ] **Step 5: Commit** `feat(push): pré-prompt de avisos, controles em Alertas e transparência em privacidade [PW-T10]`

### Task PW-T11: A09 no servidor, menu e E06 [paralelo com PW-T10]

Depende de PW-T5 e PW-T9.

**Files:**
- Create: `src/lib/db/push-admin-store.ts`, `src/lib/db/queries/push-admin.ts`, `src/app/estudio/admin/notificacoes/{layout.tsx,actions.ts}`, `src/components/studio/push/{PushStatusBadge,PushTabsNav,PushBanners}.tsx` e testes, `src/content/pt-BR/notifications-admin.ts`, `tests/integration/push-admin.test.ts`
- Modify: `src/lib/auth/require-role.ts` e teste (`requireAnyRole`), `src/app/estudio/nav.ts` e `nav.test.ts`, `src/components/studio/PublishDialog.tsx`, `src/app/estudio/actions.ts` (`publishAction` com push), `src/content/pt-BR/studio.ts` (`push`, `pushNote`, `pushJustification`)

**Interfaces:**
- Consumes: RPCs de PW-T5; `push_audience_estimate`; `missingVapidVars` (PW-T6); `pushKindsFor` (PW-T5); `scheduleProblem`, `sanitizeNotificationText`, `pushRequestSchema` (PW-T2).
- Produces:
  - `requireAnyRole(actions: Action[], options?: { next?: string }): Promise<Session>` (mesmos redirecionamentos de `requireRole`).
  - `nav.ts`: item "Notificações" (`icon: "bell"`) no grupo Governança com `anyOf: ["push.request", "push.approve", "push.settings", "push.metrics"]`; `href` = `/estudio/admin/notificacoes/funil` quando a pessoa só tem `push.metrics`; `label` "Notificações (n)" com `n` pendentes para `push.approve` (G10, `studioNav(roles, { pendingPush })`).
  - `createPushAdminStore(db)` (sessão da pessoa): `request(input): Promise<Result<{ id: string }, PushAdminError>>`, `approve(id)`, `reject(id, reason)`, `cancel(id, reason)`, `pause(reason)`, `requestResume(reason)`, `approveResume(approvalId)`, `setSetting(key, value, ctx)`; `PushAdminError = "self_approval" | "forbidden" | "not_pending" | "invalid" | "article_invalid" | "conflict"` com textos em `notifications-admin.ts` ("A aprovação precisa ser de outra pessoa.").
  - `queries/push-admin.ts`: `pendingCount(): Promise<number>`; `queueRows(filter): Promise<Result<QueueRow[], QueryError>>`; `historyRows(f: HistoryFilter): Promise<Result<{ rows: HistoryRow[]; total: number }, QueryError>>` (`parseHistoryFilter(sp)`: período, tipo, estado; inválidos ignorados); `historyDetail(id): Promise<Result<HistoryDetail | null, QueryError>>` (linha do tempo, pulos por motivo, falhas por código, recebidos/tocados por `(device, browser)`); `historyCsv(f): Promise<string>` (sem nenhum dado de inscrição); `searchArticles(q, roles): Promise<ArticleOption[]>` (publicadas, não patrocinadas; editor só da editoria); `audienceEstimate(kind, audience): Promise<number>`; `pushSettings(): Promise<PushSettingsView>` (`{ dailyLimit; quietStart; quietEnd; templates; paused: { on; by; at; reason }; vapid: { ok: boolean; missing: string[] } }`).
  - `actions.ts` (`"use server"`; cada uma com `requireAnyRole`/`requireRole` e `hit_rate_limit`; `ActionState` igual ao do painel de fontes): `requestPushAction`, `decidePushAction` (`approve` | `reject` com motivo), `cancelPushAction`, `pausePushAction` (exige digitar "PAUSAR"), `requestResumeAction`, `approveResumeAction`, `saveSettingsAction`, `estimateAudienceAction`, `searchArticlesAction`.
  - `layout.tsx`: `requireAnyRole([...4 ações], { next: "/estudio/admin/notificacoes" })`, `dynamic = "force-dynamic"`, cabeçalho h1 "Notificações", `PushTabsNav` (subrotas com `aria-current="page"`, D-P23; abas só para quem tem as ações), link "Funil do app" só com `push.metrics`, `PushBanners` (pausa "Envios pausados por {pessoa} às {hora}: {motivo}", pendentes, VAPID ausente).
  - E06: com `pushKindsFor(roles).includes("urgent")`, "Push urgente" ativo; marcado mostra "Justificativa do push" (obrigatória, ≤ 300); publicar com sucesso chama `request` com título e linha fina da matéria (título cortado em 60, linha fina em 120 por `sanitizeNotificationText`), público "todos", "Agora"; toast "Pedido de push criado. Aguardando aprovação de outra pessoa." com link para `/estudio/admin/notificacoes/fila`; falha no pedido não desfaz a publicação e mostra o erro.

- [ ] **Step 1: Write the failing tests**

```ts
// nav.test.ts
it("analista vê Notificações apontando para o Funil; jornalista não vê", () => {
  expect(findItem(studioNav([{ role: "analista", sections: [] }]), "Notificações")?.href).toBe("/estudio/admin/notificacoes/funil");
  expect(findItem(studioNav([{ role: "jornalista", sections: [] }]), "Notificações")).toBeUndefined();
  expect(findItem(studioNav([{ role: "editor_chefe", sections: [] }], { pendingPush: 2 }), "Notificações (2)")).toBeDefined();
});
// require-role.test.ts
it("requireAnyRole: sem sessão → /entrar?next; sem nenhuma ação → motivo=sem-permissao", async () => {});

// tests/integration/push-admin.test.ts (critérios 18, 20, 21, 23)
it("Marina pede urgente, tenta aprovar e recebe a mensagem; Helena aprova", async () => {
  const r = await asUser(MARINA, () => requestPushAction(form(urgent(ART))));
  expect(r).toMatchObject({ ok: true });
  expect(await asUser(MARINA, () => decidePushAction(form({ id: r.data.id, decision: "approve" })))).toMatchObject({ ok: false, message: "A aprovação precisa ser de outra pessoa." });
  expect(await asUser(HELENA, () => decidePushAction(form({ id: r.data.id, decision: "approve" })))).toMatchObject({ ok: true });
});
it("Otávio (editor) não vê urgente e só vê pedidos próprios e da editoria", async () => {});
it("CSV do histórico não tem endpoint, token, id de inscrição nem alvo", async () => {
  expect(await historyCsv({})).not.toMatch(/endpoint|p256dh|auth|token|subscription|source:|bairro:/);
});
it("configurações sem VAPID listam só os nomes das variáveis", async () => {
  expect((await pushSettings()).vapid).toEqual({ ok: false, missing: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] });
});
it("E06: publicar com Push urgente sem justificativa é recusado; com justificativa cria o pedido", async () => {});
// PublishDialog.test.tsx
it("Push urgente só aparece habilitado para quem pode pedir urgente", () => {});
```

- [ ] **Step 2: Run** `pnpm vitest run src/app/estudio src/lib/auth src/components/studio && pnpm vitest run tests/integration/push-admin.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Nenhuma ação por `GET`; `ctx` das RPCs com `ipHash` como no painel de fontes. Linha `A09` e ações novas conferidas contra `docs/architecture.md` §6 (atualizada na PW-T5).
- [ ] **Step 4: Run** `pnpm verify` → PASS.
- [ ] **Step 5: Commit** `feat(estudio): A09 no servidor, menu de notificações e push urgente no diálogo de publicação [PW-T11]`

### Task PW-T12: A09 · Novo envio e Configurações [paralelo com PW-T13 e PW-T14]

Depende de PW-T11.

**Files:**
- Create: `src/app/estudio/admin/notificacoes/{page,loading,error}.tsx`, `src/app/estudio/admin/notificacoes/configuracoes/{page,loading,error}.tsx`, `src/components/studio/push/{NewPushForm,PushPreview,ArticlePicker,AudienceField,PushSettingsForm,PauseDialog}.tsx` e testes, `tests/e2e/a09-new-settings.spec.ts`

**Interfaces:**
- Consumes: ações, queries, textos e componentes base de PW-T11; `scheduleProblem` (PW-T2).
- Produces: Novo envio conforme spec §10.2 (nota fixa "Avisos do que o leitor segue são automáticos e não passam por aqui."; tipo em radio, editor só Destaque; `ArticlePicker` com busca e rótulos; título/texto com contadores `aria-live="polite"` "{n} de 60"; `PushPreview` Android, iPhone e desktop em HTML/SVG com tokens, rótulo de origem e corte aproximado; `AudienceField` com alcance "cerca de {n} inscrições" ou "menos de 20 inscrições"; Quando: urgente só "Agora", Destaque "Agora"/"Agendar" até 7 dias fora de 22h–7h; justificativa obrigatória no urgente; aviso de envios pausados; toast "Pedido criado. Aguardando aprovação de outra pessoa."). Configurações conforme §10.5 (limite padrão 1–3, silêncio 18–22/7–10 com o texto "Sempre contém 22h–7h.", até 20 modelos com `{titulo}` e `{linha_fina}`, `PauseDialog` com motivo e "PAUSAR" digitado, "Retomar envios" cria pedido, estado das chaves VAPID). Configurações só para `push.settings`; sem ela, a aba some e a rota redireciona com `motivo=sem-permissao`.

- [ ] **Step 1: Write the failing tests**

```ts
// NewPushForm.test.tsx
it("urgente não oferece Agendar; Destaque às 23h mostra o erro de silêncio", async () => {});
it("contadores 60/120 e bloqueio acima do limite", async () => {});
// PushPreview.test.tsx
it("prévia leva o rótulo de origem e é texto acessível, não imagem", () => {
  render(<PushPreview title="Chuva forte" body="Defesa Civil alerta" originLabel="ORIGINAL CITYNEWS" />);
  expect(screen.getAllByText(/ORIGINAL CITYNEWS · Defesa Civil alerta/)).toHaveLength(3);
});
// tests/e2e/a09-new-settings.spec.ts
test("Marina pede urgente com justificativa e vê o toast", async ({ page }) => {
  await loginAs(page, "marina", "/estudio/admin/notificacoes");
  await page.getByRole("radio", { name: "Urgente" }).check();
  await page.getByLabel("Matéria").fill("Chuva");
  await page.getByRole("option", { name: /Chuva forte/ }).click();
  await expect(page.getByText(/cerca de \d+0 inscrições|menos de 20 inscrições/)).toBeVisible();
  await page.getByLabel("Justificativa").fill("Alerta da Defesa Civil para hoje à tarde");
  await page.getByRole("button", { name: "Enviar para aprovação" }).click();
  await expect(page.getByRole("status")).toContainText("Pedido criado. Aguardando aprovação de outra pessoa.");
});
test("Otávio vê só Destaque e só matérias de cidade, serviços, clima e agenda", async ({ page }) => {});
test("pausar exige digitar PAUSAR; banner aparece; retomar cria pedido para outra pessoa", async ({ page }) => {});
test("configurações recusam silêncio que não contém 22h–7h e salvam limite 2", async ({ page }) => {});
test("estados: carregando, erro com Tentar de novo, 360 px sem rolagem horizontal", async ({ page }) => {});
```

- [ ] **Step 2: Run** `pnpm vitest run src/components/studio/push && pnpm test:e2e tests/e2e/a09-new-settings.spec.ts` → FAIL.
- [ ] **Step 3: Implement** com os componentes do kit (Field, Select, Switch, Dialog nativo, Toast, InlineAlert, Skeleton, EmptyState, ErrorState).
- [ ] **Step 4: Run** `pnpm verify` → PASS.
- [ ] **Step 5: Commit** `feat(estudio): A09 Novo envio com prévia e alcance, e Configurações com pausa [PW-T12]`

### Task PW-T13: A09 · Fila e Histórico [paralelo com PW-T12 e PW-T14]

Depende de PW-T11.

**Files:**
- Create: `src/app/estudio/admin/notificacoes/fila/{page,loading,error}.tsx`, `src/app/estudio/admin/notificacoes/historico/{page,loading,error}.tsx`, `src/app/estudio/admin/notificacoes/historico/[id]/{page,not-found}.tsx`, `src/app/estudio/admin/notificacoes/historico/exportar/route.ts`, `src/components/studio/push/{PushQueueTable,DecideDialog,PushHistoryTable,PushTimeline,PushBreakdown}.tsx` e testes, `tests/e2e/a09-queue-history.spec.ts`

**Interfaces:**
- Consumes: `queueRows`, `historyRows`, `parseHistoryFilter`, `historyDetail`, `historyCsv`, `decidePushAction`, `cancelPushAction`, `PushStatusBadge` (PW-T11).
- Produces: Fila (spec §10.3: colunas tipo · matéria · título · público e alcance · pedido por e quando · aprovação "Pendente"/"Aprovado por Marina Arruda às 14h32" · agendado · estado · ações; `DecideDialog` com prévia, texto e justificativa, Recusar com motivo obrigatório; Cancelar para quem pediu ou `push.settings`; atualização a cada 10 s sem perder foco, anúncio `aria-live` só quando a contagem muda). Histórico (spec §10.4: colunas completas, CTR "entre quem permite métricas", filtros na URL; detalhe com linha do tempo, pulos por motivo, falhas por código, `PushBreakdown` com tabela + barras SVG e resumo textual; "Exportar CSV" por `GET` em `exportar/route.ts` com `requireAnyRole` e `Content-Disposition`). `<th scope="col">` em todas as tabelas.

- [ ] **Step 1: Write the failing tests**

```ts
// PushQueueTable.test.tsx
it("aprovação em texto, não só cor; Recusar exige motivo", async () => {});
// PushBreakdown.test.tsx
it("gráfico tem resumo textual e tabela equivalente", () => {});
// tests/e2e/a09-queue-history.spec.ts (critérios 20, 22)
test("Marina pede, Marina não aprova, Helena aprova, histórico mostra quem pediu e aprovou", async ({ browser }) => {
  const marina = await studioPage(browser, "marina"); const helena = await studioPage(browser, "helena");
  const id = await requestUrgentVia(marina, ART_TITLE);
  await marina.goto("/estudio/admin/notificacoes/fila");
  await marina.getByRole("button", { name: `Aprovar ${ART_TITLE}` }).click();
  await marina.getByRole("dialog").getByRole("button", { name: "Aprovar" }).click();
  await expect(marina.getByRole("alert")).toContainText("A aprovação precisa ser de outra pessoa.");
  await helena.goto("/estudio/admin/notificacoes/fila");
  await helena.getByRole("button", { name: `Aprovar ${ART_TITLE}` }).click();
  await helena.getByRole("dialog").getByRole("button", { name: "Aprovar" }).click();
  await drainAndDispatch(); // helper chama /api/jobs/drain com CRON_SECRET
  await helena.goto(`/estudio/admin/notificacoes/historico/${id}`);
  await expect(helena.getByText("Pedido por Marina Arruda")).toBeVisible();
  await expect(helena.getByText(/Aprovado por Helena Costa/)).toBeVisible();
});
test("filtros do histórico ficam na URL; vazio mostra Sem envios no período", async ({ page }) => {});
test("CSV baixado não tem colunas de inscrição", async ({ page }) => {});
test("Otávio vê só os próprios pedidos e envios de cidade", async ({ page }) => {});
```

- [ ] **Step 2: Run** `pnpm vitest run src/components/studio/push && pnpm test:e2e tests/e2e/a09-queue-history.spec.ts` → FAIL.
- [ ] **Step 3: Implement.** O polling usa `router.refresh()` a cada 10 s só com a aba visível (`document.visibilityState`).
- [ ] **Step 4: Run** `pnpm verify` → PASS.
- [ ] **Step 5: Commit** `feat(estudio): A09 Fila com aprovação de outra pessoa e Histórico com detalhamento e CSV [PW-T13]`

### Task PW-T14: Funil do app [paralelo com PW-T12 e PW-T13]

Depende de PW-T8 e PW-T11.

**Files:**
- Create: `supabase/migrations/0042_push_metrics.sql`, `src/lib/push/funnel.ts` e teste, `src/lib/db/queries/push-funnel.ts`, `src/app/estudio/admin/notificacoes/funil/{page,loading,error}.tsx`, `src/components/studio/push/FunnelChart.tsx` e teste, `tests/integration/push-funnel.test.ts`, `tests/e2e/a09-funnel.spec.ts`
- Modify: `src/lib/db/types.ts`

**Interfaces:**
- Consumes: eventos do app (PW-T8); `push_deliveries.measurable/device_class/browser`, `push_send_counters` (PW-T1); layout de A09 (PW-T11).
- Produces:
  - SQL: `push_funnel_daily` (spec §9.4); `push_funnel_refresh(p_day date) returns int` (etapas 1–4 de `events` por `name`, `session.device`, `props.browser`, com `install_prompt_shown`, `app_installed` só `via in (prompt, ios_steps)`, `notif_preprompt_shown`, `notif_permission_granted` só `trigger <> 'settings'`; etapa 5 de `push_deliveries` `sent` e `measurable`; 6 e 7 de `push_send_counters`; estágios auxiliares `out_install` (`via = browser`/`unknown`), `out_permission` (`trigger = settings`), `denied`, `sent_total`); `push_funnel(p_from date, p_to date, p_device text, p_browser text) returns table (stage text, n bigint)` (`security definer`, confere `push_can(auth.uid(), 'push.metrics')`, soma dias fechados + dia corrente ao vivo); `push_active_by_browser() returns table (browser text, n bigint)`; job pg_cron `push-funnel` `40 4 * * *` (`push_funnel_refresh(current_date - 1)`), só com `pg_cron`.
  - `funnel.ts`: `FUNNEL_STAGES = ["install_prompt_shown", "app_installed", "notif_preprompt_shown", "notif_permission_granted", "sent_measurable", "delivered", "clicked"] as const`; `funnelRows(counts: Record<string, number>): { stage; n; pctOfPrevious: number | null }[]`; `biggestDrop(rows): { from; to; pct } | null`; `funnelSummary(rows, days: number): string` (ex.: "Em 30 dias, 1 240 convites de instalação viraram 180 instalações (14,5%). A maior perda está entre o pré-prompt e a permissão (38% aceitam)."; números em pt-BR com espaço fino de milhar); `parseFunnelFilter(sp): { days: 7 | 30 | 90 | null; from?: string; to?: string; device?: DeviceClass; browser?: BrowserFamily }`.
  - Página (spec §10.6): filtros na URL, `FunnelChart` (barras horizontais SVG, número e % da anterior, cores dos tokens de dados, sem gradiente, `role="img"` + resumo textual), tabela equivalente, blocos "Fora do convite", "Negadas", inscrições ativas por navegador, aviso fixo "Contagens de eventos de quem permite métricas; não são pessoas.", vazio "Sem dados no período.". Só `push.metrics`.

- [ ] **Step 1: Write the failing tests**

```ts
// funnel.test.ts
it("conversão é etapa ÷ anterior; zero anterior dá null", () => {
  expect(funnelRows({ install_prompt_shown: 1240, app_installed: 180 })[1]).toEqual({ stage: "app_installed", n: 180, pctOfPrevious: 14.5 });
});
it("resumo textual da spec", () => expect(funnelSummary(rows, 30)).toBe("Em 30 dias, 1 240 convites de instalação viraram 180 instalações (14,5%). A maior perda está entre o pré-prompt e a permissão (38% aceitam)."));
// tests/integration/push-funnel.test.ts
it("permissão dada em Alertas e instalação pelo navegador ficam fora da conversão", async () => {});
it("com 'Só o necessário' não há linhas em events nem em push_send_counters (Review Focus 5)", async () => {});
it("push_funnel recusa quem não tem push.metrics; analista lê", async () => {});
it("período antigo vem da tabela diária depois da retenção de events", async () => {});
// tests/e2e/a09-funnel.spec.ts
test("Thiago (analista) vê só o Funil com 7 etapas, filtros na URL e o aviso 'não são pessoas'", async ({ page }) => {});
```

- [ ] **Step 2: Run** `pnpm db:reset && pnpm vitest run src/lib/push/funnel.test.ts tests/integration/push-funnel.test.ts && pnpm test:e2e tests/e2e/a09-funnel.spec.ts` → FAIL.
- [ ] **Step 3: Implement**; semente de teste do funil só no helper do e2e (service role), nunca em `seed.sql`.
- [ ] **Step 4: Run** `pnpm verify` → PASS.
- [ ] **Step 5: Commit** `feat(estudio): funil do app com agregação diária, gráfico e resumo textual [PW-T14]`

### Task PW-T15: Verificação (e2e, axe, capturas e relatório)

Depende de todas.

**Files:**
- Create: `tests/e2e/pwa-flow.spec.ts`, `tests/e2e/helpers/push.ts`, `tests/a11y/pwa.spec.ts`, `docs/reports/pwa.md`, `docs/reports/pwa/*.png`
- Modify: `playwright.config.ts` (G16: `webPush.generateVAPIDKeys()` ao carregar; `webServer.env` com `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:teste@citynews.local`, `PUSH_PROVIDER=webpush`, `PUSH_ENDPOINT_TEST_HOSTS=127.0.0.1:<porta do servidor falso>`, `CN_E2E=1`; `globalSetup` sobe o servidor de push falso), `docs/screens.md` (P17, P18, E06, A09, P25, P26 conforme spec §5.1), `lighthouserc.json` (se existir: orçamento da home instalada)

**Interfaces:**
- Produces: `tests/e2e/helpers/push.ts`: `swReady(page)`, `deliverPush(page, payload: PushPayload | string)` (CDP `ServiceWorker.enable` → `registrationId` de `workerRegistrationUpdated` → `ServiceWorker.deliverPushMessage`), `shownNotifications(page)` (`registration.getNotifications()` → `{ title, body, data }[]`), `stubPushManager(page, endpoint)` (`addInitScript` trocando `PushManager.prototype.subscribe`/`getSubscription`), `drainAndDispatch(request)`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/e2e/pwa-flow.spec.ts (Chromium)
test("manifesto válido e SW registrado em página pública, nunca no Estúdio (critérios 1, 2)", async ({ page, request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m).toMatchObject({ name: "CityNews Cuiabá", short_name: "CityNews", display: "standalone" });
  for (const i of m.icons) expect((await request.get(i.src)).ok()).toBe(true);
  await page.goto("/"); await swReady(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toMatch(/\/sw\.js$/);
  const csp = (await page.request.get("/")).headers()["content-security-policy"];
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
});
test("atualização do SW v1 para a nova versão mantém as salvas (critério 3, Review Focus 4 da spec)", async ({ page, context }) => {
  await context.route("**/sw.js", (r) => r.fulfill({ path: "tests/fixtures/sw/sw-v1.js", contentType: "text/javascript" }));
  await page.goto("/"); await swReady(page); await saveArticle(page, SALVA);
  await context.unroute("**/sw.js");
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
  await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining(["cn-salvos-v1", "cn-shell-v1"]));
  expect(await page.evaluate((p) => caches.match(p).then(Boolean), `/materia/${SALVA}`)).toBe(true);
});
test("push entregue mostra o aviso; com Métricas gera recibo; sem Métricas não (critérios 16, 17)", async ({ page, context }) => {
  await context.grantPermissions(["notifications"]);
  await acceptConsent(page, "metrics"); await swReady(page);
  await deliverPush(page, { v: 1, t: "Chuva forte", b: "ORIGINAL CITYNEWS · Defesa Civil alerta", u: `/materia/${SLUG}`, g: TAG, s: SEND });
  await expect.poll(() => shownNotifications(page)).toEqual([expect.objectContaining({ title: "Chuva forte", data: expect.objectContaining({ url: `/materia/${SLUG}` }) })]);
  await expect.poll(() => counters(SEND)).toMatchObject({ delivered: 1 });
  await deliverPush(page, "lixo"); // aviso genérico
  await expect.poll(() => shownNotifications(page)).toEqual(expect.arrayContaining([expect.objectContaining({ title: "CityNews", body: "Há novidades no CityNews." })]));
});
test("Só o necessário: nenhum evento do app e nenhum recibo (Review Focus 5)", async ({ page }) => {});
test("jornada: seguir bairro CPA, ativar avisos, publicar matéria de cidade com CPA no Estúdio, servidor falso recebe um push (critérios 9, 12)", async ({ browser }) => {});
test("pausar e retomar com aprovação de outra pessoa (critério 23)", async ({ browser }) => {});

// tests/a11y/pwa.spec.ts
const PUBLIC = ["/app", "/offline.html", "/alertas"];
const STUDIO = ["/estudio/admin/notificacoes", "/estudio/admin/notificacoes/fila", "/estudio/admin/notificacoes/historico", `/estudio/admin/notificacoes/historico/${SEND}`, "/estudio/admin/notificacoes/configuracoes", "/estudio/admin/notificacoes/funil"];
for (const width of [390, 1280]) {
  for (const path of PUBLIC) test(`@a11y ${path} em ${width}px`, async ({ page }) => { await page.setViewportSize({ width, height: 900 }); await page.goto(path); await expectNoSerious(page); });
  test(`@a11y convites C07, C08 e C09 abertos em ${width}px`, async ({ page }) => { /* abre cada convite pelo gatilho e roda o axe com ele visível */ });
  test(`@a11y Alertas em todos os estados em ${width}px`, async ({ page }) => { /* sem suporte, iPhone, desligado, negado, ativo */ });
}
for (const width of [390, 768, 1280]) for (const path of STUDIO)
  test(`@a11y ${path} em ${width}px`, async ({ page }) => { await page.setViewportSize({ width, height: 900 }); await loginAs(page, "helena", path); await expectNoSerious(page); });
```

- [ ] **Step 2: Run** `pnpm test:e2e tests/e2e/pwa-flow.spec.ts && pnpm test:a11y` e depois `pnpm test:e2e` inteiro (Playwright usa `next start` do build de produção) → corrigir o que falhar na tarefa dona do código (nunca desativar teste).
- [ ] **Step 3:** Capturas em `docs/reports/pwa/` em 390 e 1280: C07, C08, C09, `/offline.html` com listas e vazia, faixa "Salva às…", `/app`, Alertas (5 estados), A09 Novo envio (com prévia), Fila com pedido pendente e diálogo, Histórico e detalhe, Configurações com pausa, Funil com dados e vazio; revisão independente contra `DESIGN.md` (skill `impeccable`). Lighthouse CI da home: JS ≤ 170 kB, LCP/INP/CLS dentro do orçamento.
- [ ] **Step 4:** `docs/reports/pwa.md` com: critérios de aceite 1–26 da spec §18, cada um com "atendido" e a evidência (teste com caminho e nome, ou captura); Review Focus da spec §19 1–5 e deste plano 1–6 com o teste que cobre; axe por rota e largura; contagem de testes (unit, integração, e2e); decisões G1–G19 com os `A-###`; pendências para o dono (chaves VAPID na Vercel com `pnpm push:keys`, escala de plantão com segunda pessoa de `push.approve`, spec §17). `docs/screens.md` atualizado. `pnpm verify` verde.
- [ ] **Step 5: Commit** `test(pwa): e2e, axe, capturas e relatório do PWA e das notificações [PW-T15]`
