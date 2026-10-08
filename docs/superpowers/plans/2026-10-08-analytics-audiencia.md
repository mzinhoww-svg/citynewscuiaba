# Analytics e audiência: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Medir a audiência do CityNews de ponta a ponta. São quatro peças:
- contador agregado sem cookie;
- eventos que faltam;
- tela Audiência no Estúdio;
- integrações externas: Search Console, Speed Insights, Sentry, e GA4 via GTM com consentimento.

**Architecture:**
- **Contador próprio.** `POST /api/metrics/hit`, com deduplicação por hash diário. Função `metric_track` (`security definer`) soma em tabelas `*_stats_daily`. É o mesmo padrão de `ad_track`, da migration 0082.
- **Estúdio.** Lê só as funções `audience_*`, que conferem `metrics.view`.
- **GA4.** Espelho externo: carrega via GTM só com flag ligada e consentimento de Métricas. Nunca alimenta o Estúdio.

**Tech Stack:** Next.js 16.3 (App Router, `after()`, `next/script`), Supabase (Postgres, RLS, `pg_cron`), zod, Vitest, Playwright e axe, `@vercel/speed-insights`, `@sentry/nextjs`, `googleapis` (só a parte webmasters) ou `fetch` com JWT da conta de serviço.

**Spec:** `docs/superpowers/specs/2026-10-08-analytics-audiencia-design.md`. Decisão do dono: A-127.

## Global Constraints
- **Contador agregado:** nenhum identificador de pessoa, nenhum cookie, nenhum `localStorage`. A chave é `sha256(sal:ip:ua:alvo:evento:janela30min)`, sumindo no dia seguinte. O sal é o de `rateLimitSalt()`.
- **Dia:** sempre o dia civil de `America/Cuiaba`.
- **Medição nunca quebra a página.** Toda falha de envio é engolida. As rotas respondem:
  - 204 para sucesso ou robô;
  - 400 para corpo inválido;
  - 413 acima de 1 KB;
  - 503 sem sal ou sem banco.
- **Nada é medido em `/estudio`.** Nem contador, nem GTM, nem Speed Insights. O Sentry é a exceção: vale em todo lugar.
- **GA4/GTM:** carrega só com `ga4_enabled` ligada, `NEXT_PUBLIC_GTM_ID` definido e `consent.metrics === true`. Consent Mode v2:
  - padrão `denied`;
  - `ad_storage`, `ad_user_data` e `ad_personalization` sempre `denied`;
  - nada de termo de busca, e-mail, `user_id` ou `anonId` no dataLayer.
- **CSP:** muda só se `NEXT_PUBLIC_GTM_ID` estiver definido. Os hosts exatos:
  - `connect-src` e `img-src` ganham `https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com`;
  - `frame-src` ganha `https://www.googletagmanager.com`.
- **Busca:** termos passam por `normalizeSearchQuery`. Na tela aparecem só os que têm 3 ou mais buscas no período.
- **Interface:** pt-BR, "CityNews", "Cuiabá" acentuado. Textos em `src/content/pt-BR/audience.ts`. Tokens de design, sem hex ou px crus em `src/components`.
- **Rotas de cron:** validam `Authorization: Bearer ${CRON_SECRET}`.
- **Retenção:**
  - agregados: 25 meses;
  - termos de busca com menos de 3 buscas: 90 dias;
  - `metric_keys`: até ontem.
- **Migrations:** 0148, 0149 e 0150. Se o número estiver ocupado na hora da execução, renumerar na sequência e anotar em DECISIONS. Toda tabela nova tem RLS na mesma migration.
- **Fim de tarefa:** um commit por tarefa com `[ANL-T#]`, `pnpm verify` verde e `progress.json`/`STATE.md` atualizados.

## Review Focus
- **Navegação no cliente** (link interno sem recarregar) precisa contar 1 `view` por troca de rota. Não pode contar 0, nem 2 por causa do StrictMode ou de re-render. Teste em ANL-T1.
- **Leitor com "Só o necessário"** precisa ser contado no agregado e **não** pode gerar nenhum pedido a `googletagmanager.com` nem cookie `_ga`. Teste e2e em ANL-T9.
- **Editor com editoria** que abre a Audiência só vê as suas editorias, inclusive no CSV e na aba Busca, que é global. Na aba Busca ele vê o vazio "disponível para quem vê todas as editorias". Teste em ANL-T5.
- **Busca com dado pessoal** (`maria@x.com`, `65 99999-1234`, CPF) nunca é gravada. Termo com acento e caixa diferentes soma no mesmo registro. Teste em ANL-T3.
- **Recarga rápida e robôs** (`curl`, `facebookexternalhit`, Lighthouse) não somam visita. Teste em ANL-T1.

---

### Task ANL-T1: Contador agregado de visitas (banco, rota e cliente)

**Files:**
- Create: `supabase/migrations/0148_metrics_aggregate.sql`
- Create: `src/lib/metrics/classify.ts` + `classify.test.ts` (`classifyReferrer`, `deviceClass`, `pageKind`, `cleanUtm`)
- Create: `src/lib/metrics/schema.ts` + `schema.test.ts` (`metricHitSchema`)
- Create: `src/lib/metrics/api.ts` + `api.test.ts` (`handleMetricHit`)
- Create: `src/lib/metrics/key.ts` (reuso de `trackKey` e `isBot` de `src/lib/ads/track.ts`; extrair para `src/lib/security/hit-key.ts` se precisar compartilhar, sem mudar o comportamento dos anúncios)
- Create: `src/lib/metrics/send.ts` (`sendHit`, cliente)
- Create: `src/app/api/metrics/hit/route.ts`
- Create: `src/components/editorial/PageMetrics.tsx` + `.test.tsx`
- Modify: `src/components/editorial/PublicShell.tsx` (monta `PageMetrics`)
- Modify: `src/lib/db/writes.ts` (`trackMetric`)
- Modify: `docs/architecture.md` (emenda da ADR-008), `docs/tracking-plan.md` (§7 nova: contador agregado), `.planning/DECISIONS.md` (A-127)
- Modify: texto de `/privacidade` (`src/content/pt-BR/privacy*.ts`)

**Interfaces:**
- Produces:
  - `type RefClass = "google"|"google_news"|"social"|"whatsapp"|"telegram"|"push"|"newsletter"|"interna"|"direta"|"outra"`
  - `type PageKind = "home"|"editoria"|"materia"|"assunto"|"busca"|"agenda"|"guia"|"fontes"|"panorama"|"outra"`
  - `type DeviceClass = "mobile"|"tablet"|"desktop"`
  - `classifyReferrer(referrer: string, pageUrl: string, siteOrigin: string): RefClass`
  - `cleanUtm(search: string): { source?: string; medium?: string; campaign?: string }`
  - `deviceClass(width: number): DeviceClass` (menos de 768 = mobile, menos de 1024 = tablet)
  - `pageKind(pathname: string): PageKind`
  - `metricHitSchema`: união discriminada por `t`, os quatro tipos da spec §3
  - `type MetricHit = z.infer<typeof metricHitSchema>`
  - `sendHit(hit: MetricHit): void`
  - SQL: `metric_track(p_kind text, p_payload jsonb, p_key text, p_visitor_key text) returns boolean`
  - SQL: tabelas `site_stats_daily`, `content_stats_daily`, `page_stats_daily`, `traffic_stats_daily`, `outbound_stats_daily`, `metric_keys`

- [ ] **Step 1: Testes que falham (classificação)**
  - `classifyReferrer`:
    - `"https://www.google.com/"` → `google`
    - `"https://news.google.com/..."` → `google_news`
    - `"android-app://com.google.android.googlequicksearchbox/"` → `google_news`
    - `"https://l.facebook.com/"` → `social`
    - `"https://wa.me/"` e `"https://web.whatsapp.com/"` → `whatsapp`
    - mesma origem → `interna`
    - `""` → `direta`
    - página com `?utm_source=push` → `push`, vencendo o referrer
    - `?utm_medium=email` → `newsletter`
    - `"https://exemplo.org"` → `outra`
  - `deviceClass`: 375 → mobile, 800 → tablet, 1280 → desktop.
  - `pageKind`:
    - `/` → home
    - `/materia/x` → materia
    - `/cidades` (editoria) → editoria
    - `/busca?q=a` → busca
    - `/guia-cuiaba/y` → guia
    - `/termos` → outra
  - `cleanUtm`:
    - `"?utm_source=Insta Gram&utm_campaign=x"` → `{ source: "instagram", campaign: "x" }`
    - descarta caracteres fora de `[a-z0-9_-]` e corta em 60 caracteres.
- [ ] **Step 2:** `pnpm vitest run src/lib/metrics/classify.test.ts`. Esperado: FAIL (módulo ausente).
- [ ] **Step 3:** Implementar `classify.ts`.
  - `pageKind` usa a lista de editorias de `src/lib/taxonomy` (ou o mesmo matcher do `[editoria]`), nunca uma lista duplicada.
- [ ] **Step 4:** Testes de `handleMetricHit`, com dependências injetadas como em `AdApiDeps` (`track`, `salt`, `now`):
  - UA de robô → 204 sem chamar `track`;
  - corpo de 1.025 bytes → 413;
  - `t` desconhecido → 400;
  - `salt: null` → 503;
  - `track` lança → 503;
  - `read` com `seconds: 5000` → `track` recebe 1.800;
  - mesma requisição duas vezes na mesma janela → mesma chave;
  - `visitorKey` muda por dia e **não** por página.
- [ ] **Step 5:** Implementar `schema.ts`, `api.ts` e a rota.
  - A rota aplica `checkRateLimit` (120 por 10 min, como `/api/events`) e cabeçalhos `no-store` e `noindex`.
- [ ] **Step 6:** Escrever a migration 0148.
  - Tabelas da spec §3, com PK composta por dia e dimensões, e `content_id`/`source_id` com `on delete set null`.
  - `metric_track` deduplica em `metric_keys` (`on conflict do nothing`; se não inseriu, devolve `false`) e faz upsert somando no dia de Cuiabá.
  - `visitors` sobe quando `p_visitor_key` é novo no dia (`metric_keys` com prefixo `v:`).
  - RLS ligada, sem políticas para `anon`/`authenticated`. `grant execute` só ao `service_role`.
  - Crons:
    - `metric-keys-cleanup` às 03h52 UTC: apaga `day < hoje-1`;
    - `metric-stats-retention`, dia 2 às 04h07 UTC: apaga mais de 25 meses.
- [ ] **Step 7:** Teste de integração (`*.integration.test.ts`, roda no CI):
  - duas chamadas com a mesma chave → `views = 1`;
  - chaves diferentes → 2;
  - `visitors` conta 1 para duas páginas do mesmo visitante.
- [ ] **Step 8:** Teste de `PageMetrics`:
  - render inicial envia 1 `view`;
  - trocar o `usePathname` mockado envia outro;
  - re-render com o mesmo caminho não envia;
  - montado sob `StrictMode`, envia 1 só. Guardar o último caminho enviado em `useRef` e enviar em `useEffect`.
- [ ] **Step 9:** Implementar `PageMetrics` e `sendHit` (`navigator.sendBeacon` com `Blob` JSON e reserva `fetch` com `keepalive`, tudo em try/catch). Montar no `PublicShell`.
- [ ] **Step 10:** Atualizar os documentos:
  - emenda da ADR-008 em `docs/architecture.md`;
  - §7 em `docs/tracking-plan.md`;
  - A-127 em `.planning/DECISIONS.md`;
  - parágrafo em `/privacidade`: "Contamos visitas de forma agregada, sem cookie e sem identificar você".
- [ ] **Step 11:** `pnpm verify`. Esperado: verde.
- [ ] **Step 12:** Commit `feat: contador agregado de visitas sem cookie [ANL-T1]`.

### Task ANL-T2: Leitura, compartilhamento, saída e eventos que faltam

**Files:**
- Modify: `src/components/editorial/ReadTracker.tsx` (+ teste)
- Modify: `src/components/editorial/ShareSheet.tsx` (+ teste)
- Modify: o card ou link de agregado que leva ao original. Achar com `grep -rn "canonical_url\|originalUrl" src/components/editorial`.
- Create: `src/components/editorial/ArticleOpened.tsx` (cliente, montado em `src/app/(public)/materia/[slug]/page.tsx`)
- Modify: `src/app/(public)/busca/page.tsx` (cliente pequeno `SearchSubmitted.tsx` para o evento com consentimento)

**Interfaces:**
- Consumes: `sendHit` e `MetricHit` (T1); `useTrack()` de `src/lib/events/use-track.ts`; `SHARE_CHANNELS` e `ARTICLE_KINDS` de `src/lib/events/names.ts`.
- Produces: emissão de `article_opened`, `article_shared` e `search_submitted` na camada `events`, mais os hits `read`, `share` e `out`.

- [ ] **Step 1: Testes que falham**
  - `ReadTracker`, ao atingir a regra de leitura, chama `sendHit({ t: "read", contentId, section, seconds })` **sem** consentimento, além do `article_read` atual, que continua dependendo do consentimento.
  - `ShareSheet`, no clique, chama `sendHit({ t: "share", contentId, channel })` e `track("article_shared", { channel, ... })`.
  - O link de saída do agregado chama `sendHit({ t: "out", sourceId, contentId })` no `onClick`, sem `preventDefault`.
  - `ArticleOpened` emite `article_opened` uma vez por montagem, com `surface: "materia"`, `kind` e `sourceId`.
  - `SearchSubmitted` emite `search_submitted` com `resultsCount` e `query` (o `buildEvent` já tira a `query` sem Personalização).
- [ ] **Step 2:** Rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** Implementar. O `ShareSheet` precisa receber `contentId` e `section` como props novas, opcionais, para não quebrar outros usos.
- [ ] **Step 4:** Teste de integração: `refresh_source_stats_daily` com `article_opened` e `article_shared` na fixture preenche `sessions` e `shares` maiores que 0.
- [ ] **Step 5:** `pnpm verify`. Esperado: verde.
- [ ] **Step 6:** Commit `feat: leitura, compartilhamento e saída contados; eventos que faltavam [ANL-T2]`.

### Task ANL-T3: Busca agregada

**Files:**
- Create: `src/lib/metrics/search-query.ts` + `.test.ts` (`normalizeSearchQuery`)
- Modify: `supabase/migrations/0148_metrics_aggregate.sql`
  - Só se T1 ainda não estiver em produção. Senão, criar `0148b`, renumerada na sequência.
  - Acrescenta a tabela `search_stats_daily (day, query, searches, zero_results)` e o ramo `search` em `metric_track`, mais o cron de 90 dias para termos raros.
- Modify: `src/app/(public)/busca/page.tsx` (`after(() => trackSearch(...))`)
- Modify: `src/lib/db/writes.ts` (`trackSearch`)

**Interfaces:**
- Produces: `normalizeSearchQuery(q: string): string | null` e `trackSearch(query: string, resultsCount: number, headers: Headers): Promise<void>`.

- [ ] **Step 1: Testes que falham** (`normalizeSearchQuery`)
  - `"  Ônibus   CPA  "` → `"onibus cpa"`
  - `"maria@x.com"` → `null`
  - `"(65) 99999-1234"` → `null`
  - `"123.456.789-09"` → `null`
  - `"processo 12345"` → `null`
  - `"a"` → `null`
  - string de 200 caracteres → 80 caracteres
  - `"Saúde"` e `"saude"` → mesmo valor.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar e gravar por `after()` com a chave `trackKey` (alvo = termo).
  - Robô (`isBot`) não grava.
  - Erro engolido.
- [ ] **Step 4:** Teste da página: `after` recebe a função com `resultsCount = 0` quando não há resultado (mock de `next/server`).
- [ ] **Step 5:** `pnpm verify`. Esperado: verde.
- [ ] **Step 6:** Commit `feat: busca agregada com filtro de dado pessoal [ANL-T3]`.

### Task ANL-T4: Partições mensais de `events`

**Files:**
- Create: `supabase/migrations/0150_events_partitions.sql`
- Test: `src/lib/db/events-partitions.integration.test.ts`

**Interfaces:**
- Produces: SQL `events_ensure_partitions(p_months_ahead int default 2) returns int`, que devolve quantas partições criou.

- [ ] **Step 1:** Teste de integração que falha:
  - depois de `select events_ensure_partitions()`, existem as partições `events_YYYY_MM` do mês atual e dos 2 seguintes;
  - um insert com `received_at = now()` cai na partição do mês, e não em `events_default`;
  - uma segunda chamada devolve 0.
- [ ] **Step 2:** Rodar no CI ou na pilha local. Esperado: FAIL.
- [ ] **Step 3:** Migration:
  - função idempotente;
  - move as linhas de `events_default` em lotes de 10 mil por mês, com `detach` e `attach` só se o volume pedir; senão, insert-select e delete em transação curta;
  - cron `events-partitions`: `11 4 25 * *`.
- [ ] **Step 4:** `pnpm verify` e o teste de integração. Esperado: verde.
- [ ] **Step 5:** Commit `chore: partições mensais da tabela de eventos [ANL-T4]`.

### Task ANL-T5: Tela Audiência: Visão geral e Matérias

**Files:**
- Create: `supabase/migrations/0149_audience.sql`
  - funções `audience_overview`, `audience_articles`, `audience_traffic`, `audience_search`, `audience_sources`, `audience_google`, com o mesmo padrão de checagem de `ai_cost_daily`;
  - flag `ga4_enabled` desligada (usada em T9);
  - tabela `search_console_daily` (usada em T7).
- Create: `src/lib/audience/period.ts` + `.test.ts` (`resolvePeriod`, `previousPeriod`, `delta`, `readRate`)
- Create: `src/lib/db/queries/audience.ts`
- Create: `src/content/pt-BR/audience.ts`
- Create: `src/app/estudio/audiencia/layout.tsx` (abas), `page.tsx` (Visão geral), `materias/page.tsx`, `export/route.ts` (CSV)
- Create: `src/components/studio/audience/*` (`KpiRow`, `DailySeries`, `ArticlesTable`)
- Modify: `src/app/estudio/nav.ts` (item "Audiência" no grupo Redação, `action: "metrics.view"`)
- Modify: sprite de ícones (acrescentar `chart-line`, como `menu` em A-123)

**Interfaces:**
- Consumes: as tabelas de T1 a T3.
- Produces:
  - `resolvePeriod(input: { preset?: "hoje"|"7d"|"30d"|"90d"; from?: string; to?: string }, now: Date): Result<{ from: string; to: string }, "invalid"|"too_long">` (dia de Cuiabá, máximo de 400 dias)
  - `previousPeriod(p): { from; to }` (mesmo tamanho, imediatamente antes)
  - `delta(cur: number, prev: number): number | null` (`null` se `prev = 0`)
  - `readRate(reads: number, articleViews: number): number | null`
  - Queries: `audienceOverview(db, p, sections)`, `audienceArticles(db, p, sections, filters, page)`, e as das abas seguintes com a mesma assinatura.

- [ ] **Step 1: Testes que falham** (`period.test.ts`)
  - `"7d"` em 08/10/2026 às 02h UTC (07/10 em Cuiabá) → `from: 2026-10-01`, `to: 2026-10-07`;
  - intervalo de 401 dias → `too_long`;
  - `from > to` → `invalid`;
  - `previousPeriod` de 01/10 a 07/10 → 24/09 a 30/09;
  - `delta(120, 100) = 0.2`;
  - `delta(5, 0) = null`.
- [ ] **Step 2:** Implementar `period.ts`. Rodar. Esperado: PASS.
- [ ] **Step 3:** Migration 0149 e teste de integração:
  - analista vê todas as editorias;
  - editor de `cidades` recebe só linhas de `cidades` em `audience_articles` e um erro de permissão em `audience_search`;
  - leitor sem papel recebe um erro.
- [ ] **Step 4:** Telas:
  - Visão geral: KPIs com variação, série diária, top 10, 5 origens, aparelhos;
  - Matérias: tabela ordenável, paginada de 50 em 50, com filtros editoria, autor, modo de publicação e origem; linha abre `/estudio/materias/[id]` (ou a rota de edição existente);
  - estados carregando (`loading.tsx`), vazio, erro (`loadOrNull`) e sucesso;
  - CSV pela rota `export` com `requireRole("metrics.view")`.
- [ ] **Step 5:** Testes de componente:
  - `KpiRow` mostra "sem comparação" quando `delta` é `null` e nunca usa só cor (ícone mais texto);
  - `ArticlesTable` com lista vazia mostra o texto de vazio.
- [ ] **Step 6:** e2e `@a11y` da Audiência com dados fake, sem violação do axe nos quatro estados.
- [ ] **Step 7:** `pnpm verify`. Esperado: verde.
- [ ] **Step 8:** Commit `feat: Audiência no Estúdio: visão geral e matérias [ANL-T5]`.

### Task ANL-T6: Audiência: Origens, Busca e Fontes agregadas

**Files:**
- Create: `src/app/estudio/audiencia/origens/page.tsx`, `busca/page.tsx`, `fontes/page.tsx`
- Create: `src/components/studio/audience/{TrafficTable,SearchTermsTable,SourcesTable}.tsx`
- Modify: `src/lib/db/queries/audience.ts`

**Interfaces:**
- Consumes: `audience_traffic`, `audience_search` e `audience_sources` (T5); `rec_events_summary` (0037) para o CTR por fonte.

- [ ] **Step 1: Testes que falham**
  - `SearchTermsTable` tem duas listas, "Mais buscados" e "Sem resultado", e mostra a ação "Criar pauta" com link `/estudio/materias/nova?titulo=<termo>` (ou a rota de rascunho existente).
  - Teste de integração: termo com 2 buscas não aparece; com 3 aparece.
  - `SourcesTable` ordena por cliques de saída e mostra leituras, seguidores e CTR.
- [ ] **Step 2:** Implementar as três abas com os quatro estados. A aba Busca, para quem só tem `metrics.view` por editoria, mostra o vazio "Disponível para quem vê todas as editorias".
- [ ] **Step 3:** e2e `@a11y` das três abas.
- [ ] **Step 4:** `pnpm verify`. Esperado: verde.
- [ ] **Step 5:** Commit `feat: Audiência: origens, busca e fontes agregadas [ANL-T6]`.

### Task ANL-T7: Google Search Console

**Files:**
- Modify: `src/app/layout.tsx` (`metadata.verification.google` a partir de `GOOGLE_SITE_VERIFICATION`)
- Create: `src/lib/gsc/client.ts` + `.test.ts`
  - `fetchSearchAnalytics`: JWT da conta de serviço assinado com `node:crypto`, troca por token em `oauth2.googleapis.com`, chamada à `searchanalytics.query`;
  - dependências injetáveis para teste.
- Create: `src/app/api/jobs/search-console/route.ts` (Bearer `CRON_SECRET`)
- Create: `supabase/migrations/0151_gsc_cron.sql` (cron às 05h17 UTC chamando a rota por `pg_net`, como os crons do Guia em 0133)
- Create: `src/app/estudio/audiencia/google/page.tsx`
- Modify: `src/lib/db/queries/admin-ops.ts` (`integrationsOverview`: linhas Search Console, GTM, Sentry, Speed Insights)
- Modify: `.env.example` (`GOOGLE_SITE_VERIFICATION`, `GSC_SERVICE_ACCOUNT_JSON`, `GSC_SITE_URL`)
- Modify: `.planning/BLOCKERS.md`: B-026, ação do dono:
  - criar a propriedade;
  - adicionar a conta de serviço como usuário;
  - enviar os sitemaps.

**Interfaces:**
- Produces: `fetchSearchAnalytics(opts: { siteUrl: string; day: string; rowLimit: number }, deps): Promise<Result<GscRow[], "auth"|"http"|"quota">>` e `type GscRow = { page: string; query: string; clicks: number; impressions: number; ctr: number; position: number }`.

- [ ] **Step 1: Testes que falham**
  - rota sem Bearer → 401;
  - sem `GSC_SERVICE_ACCOUNT_JSON` → 200 `{ skipped: "not_configured" }`;
  - com `fetch` fake devolvendo 2 linhas → upsert de 2 linhas para cada um dos 3 dias;
  - 429 → `Err("quota")` e 200 com `{ error: "quota" }`, sem lançar.
  - layout: com a variável, o `<meta name="google-site-verification">` aparece; sem ela, não aparece.
- [ ] **Step 2:** Implementar. Upsert idempotente por `(day, page, query)`, limite de 5.000 linhas por dia.
- [ ] **Step 3:** Aba Google:
  - consultas e páginas, cliques, impressões, CTR e posição;
  - aviso "Dados do Google chegam com 2 a 3 dias de atraso";
  - vazio sem credencial com link para Integrações.
- [ ] **Step 4:** `pnpm verify`. Esperado: verde.
- [ ] **Step 5:** Commit `feat: Search Console: verificação, importação diária e aba Google [ANL-T7]`.

### Task ANL-T8: Speed Insights e Sentry

**Files:**
- Modify: `package.json` (`@vercel/speed-insights`, `@sentry/nextjs`, versões estáveis atuais)
- Modify: `src/app/(public)/layout.tsx` (`<SpeedInsights />` só se `process.env.VERCEL_ENV === "production"`)
- Create: `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation.ts`, `src/instrumentation-client.ts` (ou o padrão atual do SDK para Next 16)
- Create: `src/lib/observability/scrub.ts` + `.test.ts` (`scrubEvent`)
- Modify: `next.config.ts` (`withSentryConfig`, `tunnelRoute: "/monitoring"`, sem upload de source map se faltar `SENTRY_AUTH_TOKEN`)
- Modify: `src/proxy.ts`, para não aplicar o redirecionamento de auth nem o rate limit à rota `/monitoring`, se o proxy interferir

**Interfaces:**
- Produces: `scrubEvent<E extends { request?: { url?: string; cookies?: unknown; headers?: unknown; data?: unknown }; user?: unknown }>(e: E): E`.

- [ ] **Step 1: Testes que falham** (`scrubEvent`)
  - remove a query string da URL (`/busca?q=maria` vira `/busca`);
  - zera cookies, headers e data;
  - `user` fica só com `{ segment: <papel> }` ou ausente.
- [ ] **Step 2:** Implementar.
  - `Sentry.init` com `dsn: process.env.SENTRY_DSN` (sem DSN, não inicializa), `sendDefaultPii: false`, `tracesSampleRate: 0.1`, sem replay e `beforeSend: scrubEvent`.
- [ ] **Step 3:** Confirmar que a CSP não precisou mudar.
  - O envio vai para `/monitoring`, na mesma origem.
  - O Speed Insights usa `/_vercel/speed-insights/*`.
  - Teste de `buildCsp` igual ao de hoje sem GTM.
- [ ] **Step 4:** Orçamento de JS público (Lighthouse CI) sem regressão além de 3 kB. Se passar disso, carregar o Sentry do cliente com `lazyLoadIntegration` ou só no Estúdio, e anotar em DECISIONS.
- [ ] **Step 5:** `pnpm verify`. Esperado: verde.
- [ ] **Step 6:** Commit `feat: Speed Insights e Sentry com dados limpos [ANL-T8]`.

### Task ANL-T9: GA4 via GTM com Consent Mode

**Files:**
- Create: `src/lib/analytics/gtm.ts` + `.test.ts` (`consentModeState`, `gtmCspSources`, `toDataLayerEvent`)
- Create: `src/components/editorial/GoogleTagManager.tsx` (`"use client"` com `next/script` e `nonce`)
- Modify: `src/lib/security/headers.ts` (`CspInput.gtm?: boolean` acrescenta os hosts)
- Modify: `src/proxy.ts` (passa `gtm: Boolean(process.env.NEXT_PUBLIC_GTM_ID)`)
- Modify: `src/components/editorial/PublicShell.tsx` (monta o GTM quando a flag `ga4_enabled` está ligada; lê como as outras flags no servidor)
- Modify: `src/lib/events/send.ts` (espelha os eventos permitidos no `dataLayer` via `toDataLayerEvent`, só se o GTM estiver carregado)
- Modify: `src/lib/consent/index.ts`
  - `CONSENT_VERSION = "v2"`;
  - padrão `/^v2\|m([01])\|p([01])$/`;
  - cookie `v1` passa a valer como não decidido.
- Modify: banner e `/privacidade`, com o texto do Google Analytics na categoria Métricas.
- Modify: `src/lib/studio/switches.ts` (`ga4_enabled` na lista, admin, auditado)
- Modify: `docs/architecture.md` (regra: sem tag de HTML personalizada no GTM; publicação do contêiner só pelo dono)
- Modify: `.planning/BLOCKERS.md`: B-027, ação do dono:
  - criar o contêiner GTM e a tag GA4;
  - retenção de 2 meses;
  - Google Signals desligado;
  - definir `NEXT_PUBLIC_GTM_ID` na Vercel.
- Test: `e2e/analytics-consent.spec.ts`

**Interfaces:**
- Consumes: `Consent` de `src/lib/consent`; `EventName`.
- Produces:
  - `consentModeState(c: Consent): { analytics_storage: "granted"|"denied"; ad_storage: "denied"; ad_user_data: "denied"; ad_personalization: "denied" }`
  - `gtmCspSources(): { connect: string[]; img: string[]; frame: string[] }` (os hosts exatos das Global Constraints)
  - `toDataLayerEvent(name: EventName, props: Record<string, unknown>): { event: string; [k: string]: string|number } | null`
    - devolve `null` para eventos fora da lista da spec §8;
    - remove `query`, `userId`, `anonId` e qualquer chave fora da lista branca `content_id`, `section`, `article_kind`, `channel`, `results_count`, `page_kind`.

- [ ] **Step 1: Testes que falham**
  - `consentModeState(NECESSARY_ONLY).analytics_storage === "denied"` e com Métricas `"granted"`; os campos `ad_*` são sempre `"denied"`.
  - `buildCsp({ ..., gtm: false })` fica idêntico ao snapshot atual; com `gtm: true`, contém os três grupos de hosts.
  - `toDataLayerEvent("search_submitted", { query: "x", resultsCount: 3 })` → `{ event: "search_submitted", results_count: 3 }`, sem `query`.
  - `toDataLayerEvent("login_started", {})` → `null`.
  - Cookie `v1|m1|p1` → `decided: false` (o banner volta).
- [ ] **Step 2:** Implementar.
  - `GoogleTagManager`: com `consent.metrics` falso, não renderiza nada.
  - Com consentimento:
    - um `Script` inline com nonce define `dataLayer`, `gtag('consent','default', …denied)` e `gtag('consent','update', consentModeState(c))`;
    - em seguida, o `Script` do `gtm.js?id=…` com nonce.
  - Envia `page_view` a cada troca de `usePathname()`.
  - Retirar o consentimento apaga os cookies `_ga` e `_ga_*` do domínio e recarrega a página.
- [ ] **Step 3:** e2e, com `NEXT_PUBLIC_GTM_ID=GTM-TESTE` e uma rota interceptada que devolve um `gtm.js` falso:
  - (a) flag desligada → zero pedidos a `googletagmanager.com`;
  - (b) flag ligada e "Só o necessário" → zero pedidos e nenhum cookie `_ga`;
  - (c) flag ligada e "Aceitar" → exatamente 1 pedido a `gtm.js`, e o `dataLayer` contém `consent update` com `analytics_storage: "granted"`;
  - (d) `/estudio` nunca pede o GTM;
  - (e) sem violação de CSP no console em (c).
- [ ] **Step 4:** `pnpm verify` e `pnpm test:e2e e2e/analytics-consent.spec.ts`. Esperado: verde.
- [ ] **Step 5:** Commit `feat: GA4 via GTM com Consent Mode e consentimento v2 [ANL-T9]`.

### Task ANL-T10: Gate do módulo

**Files:**
- Create: `docs/reports/analytics-audiencia.md`
- Modify: `.planning/STATE.md`, `.planning/progress.json`

- [ ] **Step 1:** `pnpm verify`, `pnpm test:e2e`, `pnpm test:a11y` e Lighthouse CI.
  - Esperado: verde.
  - Esperado: CLS 0 e o orçamento de JS público sem regressão quando o GTM está desligado.
- [ ] **Step 2:** Revisão `impeccable` nas telas da Audiência. Corrigir os achados.
- [ ] **Step 3:** Revisão de segurança do diff (`/security-review`), com foco em:
  - a CSP;
  - o `metric_track` (`security definer`, `search_path`);
  - as funções `audience_*` (checagem de papel e editoria);
  - a rota de cron.
- [ ] **Step 4:** Relatório com:
  - o que entrou;
  - as migrations a aplicar em produção (0148 a 0151, nessa ordem, antes do deploy);
  - as pendências do dono, B-026 e B-027;
  - como ligar o GA4: interruptor `ga4_enabled` depois de publicar o contêiner.
- [ ] **Step 5:** Commit `docs: gate do analytics e audiência [ANL-T10]`.
