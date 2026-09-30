# Relatório · PWA e notificações (PW-T1 a PW-T15)

**Status:** verificação concluída em 29/09/2026 no branch `pwa` (worktree `cn-pw`), depois da mescla de `claude/keen-hypatia-8qn86r` (P5 completo). Spec: `docs/superpowers/specs/2026-09-28-pwa-notificacoes-design.md`. Plano: `docs/superpowers/plans/2026-09-28-pwa-notificacoes.md`. Decisões: A-070…A-093 em `.planning/DECISIONS.md`.

## 1. Entregas por tarefa

| Tarefa | Commit | O que entrou |
|---|---|---|
| PW-T1 | `04327a8` | Migration 0040: `push_subscriptions`, `push_sends`, `push_batches`, `push_deliveries`, `push_send_counters`, `push_reserve` atômica, retenção, RLS |
| PW-T2 | `f8021da` | Regras puras: silêncio e limite efetivos, reserva, dia de Cuiabá, texto ≤ 60/120, payload, allowlist de endpoints e DNS |
| PW-T3 | `f189e66` | Service worker em TypeScript (esbuild → `public/sw.js`), cache offline com marcador `x-cn-offline`, LRU 25 MB, push, `/offline.html` |
| PW-T4 | `cd66ad7` | `manifest.webmanifest`, ícones da marca (`pnpm icons:build`), metadados de instalação |
| PW-T5 | `c2a13d8` | Migration 0041: pedidos, `guard_push_approvals`/`guard_push_sends` (duas pessoas no banco), pausa/retomada, `app_setting_set` por prefixo, `push_audience_estimate` |
| PW-T6 | `590edb6` | Rotas `/api/push/*` (inscrição, PATCH, rotação, recibo), sender VAPID (`web-push` + `fetch`), servidor de push falso |
| PW-T7 | `dd3d02e` | Registro do SW nas páginas públicas (nunca no Estúdio), aviso "Salva às…", Limpar leitura offline |
| PW-T8 | `1541a9a` | C07 faixa de instalação, C08 passos do iPhone, P26 `/app`, 8 eventos do app |
| PW-T9 | `8e82bbc` | Jobs `push_match`/`push_deliver`/`push_due` na fila `notify`, `push_dispatch_due` (cron e `beforeDrain`), retentativas, pausa |
| PW-T10 | `0b4841f` | C09 pré-prompt, bloco de push em Alertas (P18), `PushSync`, privacidade, e2e `push-reader` |
| PW-T11 | `42ced61` | `requireAnyRole`, menu "Notificações (n)", store e queries de A09, layout + Server Actions, E06 com push urgente, migration 0044 |
| PW-T12 | `af8ba82` | A09 Novo envio (prévia, alcance, agendamento) e Configurações (pausar com PAUSAR, retomar com outra pessoa, VAPID) |
| PW-T13 | `165dfbf` | A09 Fila (Revisar/Recusar/Cancelar, polling 10 s) e Histórico (filtros na URL, detalhe, detalhamento, CSV) |
| PW-T14 | `11a4308` | Migration 0042: funil diário + `push_funnel`; `/funil` com gráfico SVG, resumo textual e blocos laterais |
| merge | `5f94903` | Mescla do branch de trabalho; migration 0045 (união final de `studio_audit_actions`, `app_setting_set`, `guard_app_settings`) |
| PW-T15 | (este commit) | `pwa-flow.spec.ts`, `helpers/push.ts`, `tests/a11y/pwa.spec.ts`, capturas, `docs/screens.md`, este relatório |

## 2. Verificação final

Sequência do CI rodada localmente com a pilha de pé (30/09/2026): `pnpm db:reset && pnpm verify` e depois `CN_SHOW_DS=1 pnpm exec playwright test --project=fixtures`, que puxa desktop e mobile como dependências (o `a11y` roda dentro do `test:e2e` por `--grep` no CI).

| Etapa | Resultado |
|---|---|
| `pnpm verify` (lint, typecheck, unit + integração, build) | verde na PW-T14 e na PW-T15 |
| Vitest (unit + integração + scripts) | 2110 testes em 244 arquivos, todos verdes |
| Playwright (`CN_SHOW_DS=1 pnpm test:e2e`, todos os projetos) | 1129 testes verdes, 0 falhas, 114 pulados (roteiros exploratórios de `tests/roteiro` e casos só de WebKit); projetos desktop, mobile e fixtures em 29 min |
| Axe (`tests/a11y/pwa.spec.ts` + axe embutido nos specs de A09) | 0 violações serious/critical em todas as rotas e larguras (§4) |

Arquivos de teste do workstream: 42 arquivos unit/integração (`src/lib/push`, `src/sw`, `src/lib/app`, `src/lib/offline`, `src/offline-page`, `src/components/studio/push`, convites e Alertas, `tests/integration/push-*`) e 9 specs Playwright (`push-reader`, `offline`, `install`, `a09-new-settings`, `a09-queue-history`, `a09-funnel`, `pwa-flow`, `publish` (E06) e `tests/a11y/pwa`).

## 3. Critérios de aceite (spec §18)

| # | Critério | Situação | Evidência |
|---|---|---|---|
| 1 | Manifesto (name, short_name, start_url, standalone, ícones any/maskable, atalhos) | Atendido | `tests/e2e/pwa-flow.spec.ts` ("manifesto válido…"), `src/app/manifest.test.ts` |
| 2 | SW nas páginas públicas, nunca em `/estudio`; CSP sem `unsafe-inline`; `public/sw.js` = `pnpm sw:build` | Atendido | `pwa-flow.spec.ts` (controller `/sw.js`, CSP), `tests/e2e/offline.spec.ts` ("SW não é registrado no Estúdio"), passo "SW gerado confere" no CI |
| 3 | Salvar mantém offline; `cn-salvos-v1` intacto após atualizar v1 → nova | Atendido | `pwa-flow.spec.ts` ("atualização do SW v1…", fixture `tests/fixtures/sw/sw-v1.js`), `src/sw/core.test.ts` |
| 4 | Offline: home, editoria, 30 lidas com "Salva às…"; nunca aberta → Sem conexão com listas | Atendido | `offline.spec.ts` (1º teste), `src/sw/core.test.ts` (LRU de lidas), `src/offline-page/index.test.ts` |
| 5 | LRU 25 MB remove lidas, depois páginas, nunca salvas; nada de `/perfil`, `/estudio`, `/api`, `/busca`, `Set-Cookie` | Atendido | `src/sw/core.test.ts` (`evict`, `isCacheableResponse`), `offline.spec.ts` ("/perfil… não entram no cache") |
| 6 | Apagar histórico local / Limpar leitura offline apagam `cn-lidas` e `cn-paginas` | Atendido | `offline.spec.ts` ("Limpar leitura offline…"), `src/lib/offline/sw.test.ts` |
| 7 | Faixa de instalação (2ª visita ou 3 leituras; nunca standalone; vaga única; 14 dias; 3 recusas) | Atendido | `src/lib/app/invites.test.ts`, `src/lib/app/slot.test.ts`, `tests/e2e/install.spec.ts` |
| 8 | iPhone: passos Compartilhar → Adicionar; sem pré-prompt fora do app | Atendido | `install.spec.ts` (iPhone), `push-reader.spec.ts` ("iPhone fora do app") |
| 9 | Pré-prompt só por gatilho; "Agora não" nunca chama o nativo; inscrição só com alvos explícitos | Atendido | `push-reader.spec.ts` (Agora não espiado, alvos `source:mt-agora`), `src/lib/push/targets.test.ts`, `NotificationInvite.test.tsx`; pré-prompt só com permissão pendente (A-090) |
| 10 | Alertas: sem suporte, iPhone, desligado, negado com instruções, ativo (silêncio só aumenta, limite 1–3); Desativar apaga no servidor | Atendido | `PushSettings.test.tsx`, `push-reader.spec.ts` (Desativar, negada), `tests/a11y/pwa.spec.ts` (todos os estados) |
| 11 | Tocar abre a matéria; offline abre a cópia com rótulo | Atendido | `src/sw/core.test.ts` (`safeTarget`, notificationclick), `offline.spec.ts` (rótulo na cópia) |
| 12 | Publicação em `cidade` com bairro CPA gera `follow` para `section:cidade`/`bairro:cpa`; automática espera 10 min e despublicada não envia | Atendido | `pwa-flow.spec.ts` (jornada: servidor falso recebe o POST cifrado), `tests/integration/push-send-flow.test.ts`, `0043` (delay 600 para `auto`), migration 0044 (A-089) |
| 13 | ≤ 3 por dia de Cuiabá (10 reservas concorrentes), nunca a mesma matéria, silêncio adia `follow`/`highlight`, urgente passa | Atendido | `tests/integration/push-core-db.test.ts`, `push-reserve-parity.test.ts`, `src/lib/push/rules.test.ts` (`tests/fixtures/push/reserve-cases.json`) |
| 14 | 404/410 apaga; 429/5xx retry 1, 4, 10 min com `Retry-After`; 403 pausa e alerta | Atendido | `src/lib/push/sender.test.ts`, `src/lib/push/steps/steps.test.ts`, `push-send-flow.test.ts` |
| 15 | Inscrição recusa endpoint fora da allowlist, http, porta, IP privado, DNS interno — 400 sem requisição | Atendido | `src/lib/push/endpoints.test.ts`, `tests/integration/push-routes.test.ts` |
| 16 | Payload só `v,t,b,u,g,s`; `u` externo vira `/`; inválido → aviso genérico | Atendido | `src/lib/push/payload.test.ts`, `src/sw/core.test.ts`, `pwa-flow.spec.ts` ("push entregue…") |
| 17 | Sem Métricas: sem eventos, sem `receipt`, rota recusa; com Métricas: eventos sem `anonId`, contadores sem id de inscrição | Atendido | `pwa-flow.spec.ts` ("Só o necessário…"), `tests/integration/push-routes.test.ts` (recibo sem cookie), `tests/integration/push-funnel.test.ts` (Review Focus 5) |
| 18 | Sem sessão → `/entrar?next=`; sem ação → `motivo=sem-permissao` e sem menu; analista só o Funil | Atendido | `src/lib/auth/require-role.test.ts`, `src/app/estudio/nav.test.ts`, `a09-new-settings.spec.ts` ("analista entra pelo Funil…") |
| 19 | Novo envio: matéria publicada não patrocinada, contadores 60/120, prévia com rótulo, alcance arredondado, Urgente só agora, Destaque até 7 dias fora de 22h–7h | Atendido | `NewPushForm.test.tsx`, `PushPreview.test.tsx`, `tests/integration/push-admin.test.ts`, `a09-new-settings.spec.ts` |
| 20 | Urgente só com `push.approve` de outra pessoa (banco recusa quem pediu ou sem papel, também por SQL); expira em 60 min | Atendido | `tests/integration/push-admin-db.test.ts` (Review Focus 6), `push-admin.test.ts`, `a09-queue-history.spec.ts` |
| 21 | Editor: Destaque só da própria editoria, sem Urgente, não aprova, vê só o próprio e a editoria | Atendido | `push-admin.test.ts` ("Otávio…"), `a09-new-settings.spec.ts`, `a09-queue-history.spec.ts` |
| 22 | Fila: Aprovar, Recusar com motivo, Cancelar; Histórico com todos os números, detalhamento e CSV sem inscrição | Atendido | `PushQueueTable.test.tsx`, `PushBreakdown.test.tsx`, `push-admin.test.ts` (CSV), `a09-queue-history.spec.ts` |
| 23 | Pausar para tudo na hora; retomar só com outra pessoa; tudo no `audit_log` | Atendido | `push-admin-db.test.ts`, `push-admin.test.ts`, `a09-new-settings.spec.ts` ("pausar exige digitar PAUSAR…") |
| 24 | Configurações: limite, silêncio contendo 22h–7h, modelos, `settings.update`; sem VAPID só nomes | Atendido | `PushSettingsForm.test.tsx`, `push-admin.test.ts`, `src/lib/push/server.test.ts` |
| 25 | Funil: 7 etapas com número e %, filtros na URL, SVG com resumo, "Fora do convite", "não são pessoas" | Atendido | `src/lib/push/funnel.test.ts`, `FunnelChart.test.tsx`, `tests/integration/push-funnel.test.ts`, `a09-funnel.spec.ts` |
| 26 | Carregando, vazio, erro e sucesso em 360/768/1280; 0 violações serious/critical | Atendido | `loading.tsx`/`error.tsx` por rota de A09, `a09-new-settings.spec.ts` (360 px sem rolagem), `tests/a11y/pwa.spec.ts` (§4) |

## 4. Axe por rota e largura

`tests/a11y/pwa.spec.ts` (WCAG 2.0/2.1/2.2 A e AA, Chromium completo):

| Rota / estado | 390 | 768 | 1280 |
|---|---|---|---|
| `/app`, `/offline.html`, `/alertas` | 0 | — | 0 |
| C07 faixa de instalação e C09 pré-prompt abertos | 0 | — | 0 |
| C08 passos do iPhone (diálogo) | 0 | — | 0 |
| Alertas: desligado, ativo, negado, sem suporte, iPhone fora do app | 0 | — | 0 |
| A09 Novo envio, Fila, Histórico, detalhe do envio, Configurações, Funil | 0 | 0 | 0 |

Os specs `a09-new-settings`, `a09-queue-history` e `a09-funnel` repetem o axe (padrão do painel de fontes) e gravam as capturas.

## 5. Capturas (`docs/reports/pwa/`)

`a09-novo-envio-{390,768,1280}.png`, `a09-configuracoes-{390,768,1280}.png`, `a09-fila-{390,768,1280}.png`, `a09-historico-{390,768,1280}.png`, `a09-funil-{390,768,1280}.png`. Revisão visual: registro do Estúdio, tokens do brand kit (sem cor ou tamanho fora de `tokens.css`), estados vazio e erro com `EmptyState`/`ErrorState`, prévia do aviso em HTML com rótulo de origem, gráficos com barras sólidas (sem gradiente) e resumo textual. As capturas dos convites C07–C09, de `/offline.html` e dos estados de Alertas ficam nos `test-results` dos specs `install`, `offline` e `push-reader` (não versionadas: as telas são as mesmas das capturas de A09 em escala e já são cobertas pelo axe).

## 6. Review Focus

Spec §19: (1) aviso a mais ou fora de hora → `push_reserve` com trava e índice único (`push-core-db`, `push-reserve-parity`, `rules.test`); (2) urgente sem a segunda pessoa → banco e despacho reconferindo (`push-admin-db`, `push-send-flow` "aprovação adulterada"); (3) SSRF → `endpoints.test`, `push-routes`, `sender.test` (DNS privado no envio); (4) SW novo → `pwa-flow` (v1 → nova com salvas), `offline.spec` (Estúdio fora do cache, marcador); (5) medição sem consentimento → `pwa-flow` ("Só o necessário"), `push-routes` (recibo sem cookie), `push-funnel` (zero linhas).

Plano: (1) leitor logado/página dinâmica no cache → `core.test` (`isCacheableResponse`) e `offline.spec`; (2) virada de dia e silêncio em Cuiabá → `reserve-cases.json` contra `decideReservation` e `push_reserve`; (3) corrida entre envios → `push-core-db` (10 reservas), `push-send-flow` (duplicata e lote reprocessado); (4) SSRF e endpoint forjado → `endpoints.test`, `push-routes`, `sender.test`; (5) consentimento mudando depois → `client.test` (`syncPush`), `push-routes`, `pwa-flow`; (6) urgente sem a segunda pessoa → `push-admin-db`, `push-send-flow`.

## 7. Decisões (G1–G19 → A-070…A-088; novas A-089…A-093)

| G | A-### | Resumo |
|---|---|---|
| G1 | A-070 | Aprovações de push nas RPCs sob `guard_approvals` + `guard_push_approvals` |
| G2 | A-071 | Cache offline por marcador `x-cn-offline` (Next manda `no-store`) |
| G3 | A-072 | Jobs de push na fila `notify` com envelope `PipelineMessage` |
| G4 | A-073 | Lotes (`push_batches`) e contadores agregados |
| G5 | A-074 | `push_reserve(p_sub, p_send, p_now)` devolve `(outcome, delivery_id)` |
| G6 | A-075 | Silêncio efetivo = união; limite = mínimo |
| G7 | A-076 | Retentativas 1/4/10 min em `not_before`; `push_due` |
| G8 | A-077 | 403 pausa o envio e alerta o Control Center |
| G9 | A-078 | E06: justificativa do push depois da publicação |
| G10 | A-079 | Sem sino: "Notificações (n)" no menu e faixa em A09 |
| G11 | A-080 | Um item de menu; analista vai ao Funil |
| G12 | A-081 | Slugs de editoria de 0010 (`cidade`) |
| G13 | A-082 | `sw:build` encadeado em `dev`/`build`; `typecheck` dos dois tsconfigs |
| G14 | A-083 | `/offline.html` com CSS de tokens e textos gerados |
| G15 | A-084 | `PUSH_PROVIDER=fake|webpush`; `PUSH_ENDPOINT_TEST_HOSTS` só com `CN_E2E=1` em produção |
| G16 | A-085 | VAPID gerado ao carregar o Playwright; servidor de push falso no `globalSetup` |
| G17 | A-086 | `app_setting_set` por prefixo; `push.paused` só por pausar/retomar |
| G18 | A-087 | Credenciais da inscrição no IndexedDB `cn-sw` |
| G19 | A-088 | Tag = id da matéria sem hífens; `follow` agrupado |
| — | A-089 | Migration 0044: despublicar cancela os envios pendentes |
| — | A-090 | Pré-prompt só com permissão pendente; login (C01) tem prioridade |
| — | A-091 | E2E de push no Chromium completo com par ECDH real |
| — | A-092 | Migration 0045: união final de auditoria e `app_settings` depois da mescla |
| — | A-093 | Funil: maior perda a partir do pré-prompt; milhar com espaço |

## 8. Desvios em relação ao plano

- Migrations: além de 0040–0043, entraram 0044 (cancelamento por despublicação, spec §10.2) e 0045 (união de `studio_audit_actions()`, `app_setting_set` e `guard_app_settings` depois da mescla do branch de trabalho, a pedido do coordenador). A 0042 (funil) ficou na PW-T14 como no plano.
- `SW_SECTIONS` usa os 14 slugs de `0010_sections.sql` (superconjunto de `SECTION_DESCRIPTION`); `shared-db.ts` fica no tsconfig raiz; `SwRegistrar` não é `dynamic`; a configuração VAPID do Playwright (G16) foi antecipada para a PW-T10.
- `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` no `playwright.config.ts` para o `context.route` alcançar o `fetch` do SW (offline). Não pôde ir para `.planning/BLOCKERS.md` (só `DECISIONS.md` é editável neste workstream).
- Os specs de push usam `test.use({ channel: "chromium" })` (A-091); no CI o `playwright install chromium` traz o binário completo.
- O teste "pausar e retomar com aprovação de outra pessoa" do `pwa-flow` do plano não foi duplicado: já é a jornada de `a09-new-settings.spec.ts` (mesmas pessoas e asserções); duplicá-lo em paralelo pausaria os envios no meio dos outros specs.
- E06 na jornada do `pwa-flow`: `cidade` exige fonte primária confirmada no checklist, então o helper insere um `article_sources` confirmado antes de publicar.
- `lighthouserc.json` não existe no repositório; o orçamento da home instalada fica como pendência do gate final (P6).
- Ajustes de teste na verificação final da PW-T15 (nenhum teste desligado): `tests/e2e/system-states.spec.ts` passou a conferir o texto da nova página Sem conexão (spec §7.7: h1 "Sem conexão" e "Você está sem internet"; a página antiga dizia "Você está sem conexão"); a jornada do `pwa-flow` confere o estado `published` no banco em vez da mensagem "Matéria publicada", que some no `router.refresh()` quando a matéria vira pública; a limpeza de `push_subscriptions` em `pwa-flow` e `tests/a11y/pwa` apaga só as inscrições do próprio worker, porque os projetos desktop e mobile rodam a mesma jornada ao mesmo tempo; a jornada usa o bairro Morada da Serra em vez do CPA, porque `section.spec` conta as matérias de Cidade do seed com `bairro=cpa` e a matéria que a jornada publica ficaria nessa contagem enquanto o despacho roda; as esperas por aviso mostrado e recibo no `pwa-flow` passaram de 10 s para 20 s (o mesmo teto de `swReady`), porque na rodada completa a entrega pelo CDP a um SW ocioso demora mais; `deliverPush` (`tests/e2e/helpers/push.ts`) escolhe o registro cuja versão ativa controla um cliente (`workerVersionUpdated`), porque na rodada completa o `ServiceWorker.enable` ainda lista registros de contextos recém-fechados da mesma origem e o push ia para um SW morto.
- A verificação final rodou com log em arquivo e em etapas (verify; depois desktop, mobile e a rodada completa), porque a execução única excedia o limite de tempo do ambiente.

## 9. Pendências para o dono (spec §17)

1. **Chaves VAPID na Vercel** (Production e Preview): `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` do encarregado). Gerar uma vez com `pnpm push:keys` (nada é gravado no repositório). Sem elas o portal não oferece push e A09 mostra "Push indisponível: configure …" (só nomes). `PUSH_PROVIDER=webpush` em produção (padrão quando as chaves existem).
2. **Migrations em produção, nesta ordem:** 0040 → 0041 → 0042 → 0043 → 0044 → 0045 (a 0045 por último: refaz `studio_audit_actions()`, `app_setting_set` e `guard_app_settings` com todos os nomes de 0039 + push). `pg_cron` já ligado agenda `push-dispatch` (a cada minuto), `push-retention` (04:35 UTC) e `push-funnel` (04:40 UTC).
3. **Plantão com segunda pessoa**: urgente e retomada precisam de outra pessoa com `push.approve` (admin ou editor-chefe) alcançável a qualquer hora.
4. `pnpm sw:build` gera `public/sw.js`; o CI recusa build com o arquivo desatualizado.
