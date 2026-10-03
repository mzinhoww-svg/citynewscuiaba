# Destaques gerenciáveis, matéria mais funda e barra de ações enxuta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Barra de ações proporcional na matéria, texto de 350 a 600 palavras gerado a partir do corpo das fontes, e destaques estáveis e gerenciáveis pelo admin em todas as páginas.

**Architecture:** Domínio puro `src/lib/featured/` (janela de 3 h, pino manual, resolução por posição) consumido pelas consultas da home, editorias e `/explorar`; tabelas `featured_slots` e `featured_items` com escrita só por função com checagem de papel; admin em `/estudio/admin/destaques` via `studioAction`. No pipeline, `enrich` guarda o corpo da página (`collected_items.body_text`) e `write` usa contexto maior, 5 a 9 parágrafos e uma guarda de 250 palavras.

**Tech Stack:** Next.js 16 (RSC), TypeScript strict, Supabase (Postgres, RLS, funções), Vitest, Playwright, zod, tokens CSS.

**Spec:** `docs/superpowers/specs/2026-10-03-destaques-e-profundidade-design.md` (filha de `2026-09-27-citynews-design.md` e `2026-10-02-ui-publica-design.md`).

## Global Constraints

- Vocabulário público (CLAUDE.md §5.3): nunca "IA", "agente", "normalizado"; origem em texto simples ("Feito a partir de n fontes", "Revisado automaticamente").
- Alvos de toque ≥ 44 px (token `--tap-min`); botões visuais `sm` = 36 px (`h-button-sm`).
- Janela do destaque automático: 3 h, fuso `America/Cuiaba`, múltiplos de 3 h a partir de 00h. Candidatas: publicadas antes do início da janela, últimos 2 dias.
- Prazos do pino: 1 h, 3 h, 6 h, 12 h, 24 h, 3 dias ou data/hora final.
- Texto: 5 a 9 parágrafos, 350 a 600 palavras; abaixo de 250 (agenda/serviço: 120) uma nova tentativa e depois `in_review` com `short_body`; `copyGuard` de 8 palavras e citação por item continuam.
- `body_text` até 8.000 caracteres; ao modelo, até 3.500 por item e 14.000 por matéria.
- Auditoria `featured.pin`, `featured.unpin`, `featured.update`; permissão `site.manage` ou `editor_chefe`; modo leitura bloqueia.
- Migrations só aditivas e idempotentes (`if not exists`), sem `DELETE` nas funções novas (o conector Supabase retém `DELETE`); numeração 0053 (destaques) e 0054 (`body_text`).
- TDD (teste vermelho antes), `pnpm verify` verde por tarefa, commits Conventional com o ID da tarefa, sem push no meio, sem OriginStrip, sem hex/px crus em `src/components`.

## Review Focus

1. Dois reloads seguidos, e instâncias com cache diferente, trazem o mesmo lead (teste em FD-T3).
2. Pino manual expira exatamente em `ends_at` e volta ao automático; matéria despublicada ou patrocinada pinada cai no automático sem erro na página (FD-T1/T3).
3. Virada de janela às 00h, 03h e na mudança de dia (fuso Cuiabá) não escolhe candidata publicada dentro da janela (FD-T1).
4. Barra de ações em 360, 390, 800 e 1280 px: nunca mais alta que o resumo e sem scroll horizontal (BTN-T1).
5. Matéria com uma só fonte curta não publica sozinha (`short_body`) e matéria com corpo longo na fonte sai com ≥ 350 palavras (TXT-T2).

---

### Task BTN-T1: Barra de ações da matéria enxuta

**Files:**
- Modify: `src/app/(public)/materia/[slug]/page.tsx:187-216`, `src/components/editorial/SaveButton.tsx`, `ShareSheet.tsx`, `ReadingSettings.tsx`, `ReportProblemForm.tsx`, `MadeHow.tsx`
- Test: `tests/e2e/article.spec.ts`, `src/components/editorial/article-actions.test.tsx`

**Interfaces:**
- Produces: `ArticleActions({ article, saved }: …)` em `src/components/editorial/ArticleActions.tsx` (usa os quatro componentes existentes); `Informar problema` vira `<ReportProblemForm variant="link" />`.

- [ ] **Step 1: Testes (vermelho).** Unit: três botões `sm` (`h-button-sm`) no grupo e o link "Informar problema" fora dele; "Salvo. Ver favoritos" é `role="status"` fora da linha dos botões. e2e: em 1280 e 800 a barra tem 1 linha (altura ≤ 56 px) e em 390 e 360 no máximo 2 linhas; altura da barra < altura do bloco "Resumo em poucos segundos"; sem scroll horizontal; área clicável ≥ 44 px (padding invisível).
- [ ] **Step 2: Rodar e ver falhar:** `pnpm exec vitest run src/components/editorial/article-actions.test.tsx` e `pnpm exec playwright test tests/e2e/article.spec.ts --project=desktop --grep barra`.
- [ ] **Step 3: Implementar** `ArticleActions` com `Button size="sm"` e `collapseLabel` abaixo de `lg`; o contêiner sai de `max-w-read` (largura da coluna principal); `SaveButton` deixa de usar `basis-full` e o status vai abaixo; "Informar problema" também aparece no painel `MadeHow`.
- [ ] **Step 4: Rodar tudo:** vitest `src/components`, e2e `article` e `keyboard` em desktop e mobile, axe da matéria. Esperado: verde.
- [ ] **Step 5: Commit** `fix(ui): barra de ações da matéria enxuta [BTN-T1]`.

### Task ART-T1: Foto e legenda coladas à matéria

**Files:**
- Modify: `src/components/editorial/ArticleFigure.tsx`, `ImageCaption.tsx`, `src/app/(public)/materia/[slug]/page.tsx`, `src/lib/db/queries/articles.ts` (nome do crédito), `src/content/pt-BR/portal-card.ts`
- Test: `src/components/editorial/ArticleFigure.test.tsx`, `tests/e2e/article.spec.ts`

**Interfaces:**
- Produces: `ArticleFigure` renderiza `<figure>` com a imagem e a legenda no mesmo bloco: legenda a 8 px da foto (`mt-2`), foto a 16 px da linha fina e do texto seguinte (`my-4`), largura igual à coluna do texto (sem sangria nem vão lateral), `figcaption` com `Reprodução web · {nome do veículo}` e "Ver original"; o crédito usa o nome de exibição da fonte (`display_name`/`name`), nunca o host do CDN.

- [ ] **Step 1: Testes (vermelho).** Unit: a legenda é filha do mesmo `<figure>` e vem logo depois da `<img>`; o crédito mostra "RDNews" para imagem de `cdn.rdnews.com.br`, não o host. e2e (1280, 800, 390): distância vertical entre a base da foto e o topo da legenda ≤ 16 px; entre a base da legenda e o próximo bloco ≤ 32 px; entre o fim do cabeçalho e o topo da foto ≤ 32 px; a foto tem a mesma largura da coluna do texto; foto e título aparecem juntos na primeira dobra em 390 e 1280.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm exec vitest run src/components/editorial/ArticleFigure.test.tsx` e `pnpm exec playwright test tests/e2e/article.spec.ts --project=desktop --grep figura`.
- [ ] **Step 3: Implementar** com tokens de espaço do `tokens.css` (sem px crus), ordem do cabeçalho: categoria e título, linha fina, assinatura e data, barra de ações, foto com legenda, resumo e texto.
- [ ] **Step 4: Rodar** vitest `src/components`, e2e `article`, `keyboard`, `vocabulary` e axe em desktop e mobile, `pnpm typecheck`.
- [ ] **Step 5: Commit** `fix(ui): foto e legenda coladas à matéria, crédito com o nome do veículo [ART-T1]`.

### Task FD-T1: Banco e domínio dos destaques

**Files:**
- Create: `supabase/migrations/0053_featured.sql`, `src/lib/featured/{index,window,score,resolve,validate,types}.ts` e `*.test.ts`
- Test: `tests/integration/featured.test.ts`

**Interfaces:**
- Produces (TS): `type SlotKey = string`; `type Slot = { key: SlotKey; page: "home"|"editoria"|"explorar"; label: string; capacity: number }`; `type Pin = { id: string; slotKey: SlotKey; sectionSlug: string|null; articleId: string; position: number; startsAt: Date; endsAt: Date; endedAt: Date|null }`; `windowStart(now: Date): Date` (início da janela de 3 h em Cuiabá); `scoreArticle(a: Candidate, now: Date): number`; `pickAutomatic(cands: Candidate[], now: Date, take: number): Candidate[]` (usa só publicadas antes de `windowStart(now)`, últimos 2 dias, não patrocinadas); `resolveSlot(input: { slot: Slot; pins: Pin[]; candidates: Candidate[]; now: Date; eligible: (articleId: string) => boolean }): { items: Candidate[]; source: "manual"|"automatic"; until: Date|null }`; `validatePin(input): Result<PinInput, "duration"|"ineligible"|"capacity"|"slot">`.
- Produces (SQL): tabelas `featured_slots(key pk, page, label, capacity, position)`, `featured_items(id uuid pk, slot_key fk, section_slug, article_id fk, position int, starts_at, ends_at, ended_at, created_by, note, created_at)`; seed `home.lead` (1), `home.destaques` (3), `editoria.lead` (1), `explorar.topo` (1); RLS: leitura pública só de pino ativo cuja matéria está publicada; funções `featured_pin(p_slot, p_section, p_article, p_ends_at, p_note)`, `featured_unpin(p_id)` e `featured_reorder(p_slot, p_ids uuid[])` com `security definer`, checagem `has_any_role('{admin,editor_chefe}')`, sem `DELETE` (usa `ended_at`).

- [ ] **Step 1: Testes (vermelho).** `window.test.ts`: `windowStart` para 00:00, 02:59, 03:00, 14:10 e 23:59 (America/Cuiaba) e na virada de dia. `resolve.test.ts`: pino ativo vence o automático; pino expirado em `endsAt` exato volta ao automático; matéria inelegível some do pino e a posição cai no automático; capacidade 3 ordena por `position`; duas chamadas com `now` diferentes na mesma janela devolvem o mesmo `items`. `validate.test.ts`: prazos aceitos 1 h a 3 dias e data final futura; recusa passado, mais de 14 dias, matéria patrocinada, rascunho. Integração: anon lê só pino ativo de matéria publicada; anon não escreve; `featured_pin` por usuário sem papel falha.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm exec vitest run src/lib/featured` e `pnpm db:reset && pnpm exec vitest run tests/integration/featured.test.ts`.
- [ ] **Step 3: Implementar** os módulos puros e a migration (idempotente, índice por `(slot_key, ends_at)`, trigger que impede mais pinos ativos que `capacity`).
- [ ] **Step 4: Rodar:** os mesmos comandos mais `pnpm typecheck` e `pnpm lint`. Esperado: verde.
- [ ] **Step 5: Commit** `feat(destaques): janela, resolução e tabelas [FD-T1]`.

### Task FD-T2: Home, editorias e explorar usam as posições

**Files:**
- Create: `src/lib/db/queries/featured.ts`
- Modify: `src/lib/db/queries/home.ts:151-204`, `src/lib/db/queries/sections.ts:125-160`, `src/lib/db/queries/explore.ts`, `src/app/(public)/(inicio)/page.tsx`, `src/app/(public)/[editoria]/page.tsx`, `src/app/(public)/explorar/page.tsx`
- Test: `src/lib/db/queries/featured.test.ts`, `tests/e2e/featured-public.spec.ts`

**Interfaces:**
- Consumes: `resolveSlot`, `Slot`, `Pin` de FD-T1.
- Produces: `getFeatured(db, slotKey: SlotKey, opts: { section?: string; now?: Date }): Promise<{ items: ArticleSummary[]; source: "manual"|"automatic"; until: Date|null }>`; na home `lead` e `destaques` saem de `getFeatured`; urgência (`urgent`) continua na frente; se a tabela estiver vazia ou a consulta falhar, cai no comportamento atual.

- [ ] **Step 1: Testes (vermelho).** Unit com banco fictício: pino manual aparece como lead; sem pino, o lead é o mesmo para `now` e `now + 2 h 59 min` e muda em `now` na janela seguinte; falha da tabela cai no antigo. e2e: dois `page.goto('/')` seguidos trazem o mesmo `h1`; após pinar uma matéria (via função do banco no teste) a home e a editoria mostram a matéria no topo; urgente passa na frente.
- [ ] **Step 2: Rodar e ver falhar** (vitest do arquivo e `pnpm exec playwright test tests/e2e/featured-public.spec.ts --project=desktop`).
- [ ] **Step 3: Implementar** `getFeatured`, trocar `lead` em `home.ts`, o destaque das editorias e o topo de `/explorar`; invalidar `revalidateTag` de `home`, `section:<slug>` ao pinar (tag já existente + nova); `revalidate` das páginas continua.
- [ ] **Step 4: Rodar:** vitest `src/lib/db`, e2e `home`, `section`, `explore`, `featured-public` (desktop e mobile), `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(destaques): home, editorias e explorar por posição [FD-T2]`.

### Task FD-T3: Ações do admin para destaques

**Files:**
- Create: `src/lib/studio/featured.ts`, `src/app/estudio/admin/destaques/actions.ts`
- Modify: `src/lib/audit/actions.ts` (ações `featured.pin|unpin|update`), `src/lib/auth/permissions.ts` (permissão `featured.manage` para `admin` e `editor_chefe`), `src/lib/db/queries/admin.ts`
- Test: `src/lib/studio/featured.test.ts`

**Interfaces:**
- Consumes: `validatePin`, `featured_pin|unpin|reorder` de FD-T1.
- Produces: `pinArticle(input: { slotKey: SlotKey; sectionSlug?: string; articleId: string; duration: "1h"|"3h"|"6h"|"12h"|"24h"|"3d"|{ until: Date }; note?: string }): Promise<Result<{ id: string }, StudioFailure>>`; `unpin(id: string)`; `reorder(slotKey: SlotKey, ids: string[])`; `searchEligibleArticles(q: string, limit = 10): Promise<ArticleSummary[]>`; `currentBoard(now?: Date): Promise<BoardSlot[]>` (cada posição com ocupante e `until`). Todas via `studioAction("featured.manage", …)`, com auditoria e `revalidateTag`.

- [ ] **Step 1: Testes (vermelho):** papel sem permissão → `forbidden`; modo leitura → bloqueio; prazo inválido → `invalid`; sucesso grava auditoria e invalida as tags; `unpin` antes do prazo grava `ended_at`; `searchEligibleArticles` só devolve publicadas não patrocinadas.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm exec vitest run src/lib/studio/featured.test.ts`.
- [ ] **Step 3: Implementar** seguindo o padrão de `src/lib/studio/admin-home.ts`.
- [ ] **Step 4: Rodar** vitest de `src/lib/studio`, `src/lib/auth`, `src/lib/audit`; `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(destaques): ações do admin com auditoria [FD-T3]`.

### Task FD-T4: Tela do admin `/estudio/admin/destaques`

**Files:**
- Create: `src/app/estudio/admin/destaques/{page,loading,error}.tsx`, `src/components/studio/featured/{FeaturedBoard,PinForm,PinHistory}.tsx` e testes
- Modify: menu do admin (`src/content/pt-BR/studio*.ts`), `src/app/estudio/admin/page.tsx`
- Test: `tests/e2e/admin-featured.spec.ts`, `tests/a11y/admin-featured.spec.ts`

**Interfaces:**
- Consumes: `currentBoard`, `pinArticle`, `unpin`, `reorder`, `searchEligibleArticles` de FD-T3.
- Produces: tela com um cartão por posição (ocupante, manual ou automático, "até 15h", botão Trocar e Remover), formulário de pino (busca por título, prazo em botões 1 h/3 h/6 h/12 h/24 h/3 d/data final), reordenar `home.destaques` por botões subir/descer (sem arrastar), histórico dos últimos 30 pinos, pré-visualização do que a página mostrará; estados carregando, vazio ("Sem pino: o automático ocupa até 15h"), erro e sucesso.

- [ ] **Step 1: Testes (vermelho).** Componente: cada estado; remover pede confirmação digitada só se faltar mais de 24 h. e2e: admin pina, a home mostra; remove, volta ao automático; jornalista sem permissão recebe 403; teclado e axe.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** (Server Components, formulário com server action, textos em `src/content/pt-BR`).
- [ ] **Step 4: Rodar** vitest `src/components/studio`, e2e e axe da tela em desktop e mobile.
- [ ] **Step 5: Commit** `feat(destaques): tela de gestão no admin [FD-T4]`.

### Task TXT-T1: Corpo da página em `body_text`

**Files:**
- Create: `supabase/migrations/0054_body_text.sql`
- Modify: `src/lib/pipeline/steps/enrich.ts` (`parseEnrichment`, `EnrichmentPatch`), `src/lib/pipeline/ports.ts`, `src/lib/db/*` (repositório do enrich), `src/lib/pipeline/steps/extract.ts`
- Test: `src/lib/pipeline/steps/enrich.test.ts`

**Interfaces:**
- Produces: coluna `collected_items.body_text text null` (check `length ≤ 8000`); `parseEnrichment(html, pageUrl, siteName): Enrichment & { bodyText: string|null }` (parágrafos de `<article>` ou `main`, sem navegação, sem scripts, sanitizado por `sanitizeExternalText`, ≥ 400 caracteres para valer); `EnrichmentPatch.bodyText?: string` gravado só se o item não tinha.

- [ ] **Step 1: Testes (vermelho):** HTML com `<article>` de 6 parágrafos devolve `bodyText` com os parágrafos separados por linha em branco; ignora menu, rodapé e "leia também"; descarta texto com instrução embutida (`rejected` inclui `"body"`); corta em 8.000; página sem `article` e com menos de 400 caracteres devolve `null`; patch não sobrescreve `body_text` existente.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm exec vitest run src/lib/pipeline/steps/enrich.test.ts`.
- [ ] **Step 3: Implementar** com `linkedom` já usado; migration idempotente.
- [ ] **Step 4: Rodar** vitest `src/lib/pipeline`; `pnpm db:reset`; `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(pipeline): enrich guarda o corpo da página [TXT-T1]`.

### Task TXT-T2: `write` com contexto maior e guarda de tamanho

**Files:**
- Modify: `src/lib/pipeline/steps/write.ts` (`WRITE_TASK`, `createWriteStep`, `citedParagraphs`), `src/lib/pipeline/ports.ts` (`DraftItem.bodyText`), `src/lib/db/*` (`draftContext` traz `body_text`), regras (`DEFAULT_RULES.categories[*].minBodyWords`), `src/lib/pipeline/steps/rules.ts`
- Test: `src/lib/pipeline/steps/write-depth.test.ts`

**Interfaces:**
- Consumes: `body_text` de TXT-T1.
- Produces: `buildItemText(item: DraftItem, budget: number): string` (usa `bodyText` quando há, senão `excerpt`; fonte primária primeiro; 3.500 por item, 14.000 no total); `WRITE_TASK` pede 5 a 9 parágrafos e 350 a 600 palavras, com "Contexto" e "O que não se sabe"; `countWords(doc): number`; após gerar, se `countWords < minBodyWords` (padrão 250, agenda/serviço 120) e `materialChars ≥ 1500`, uma nova tentativa com "expanda usando só o material abaixo"; se ainda curto, `status = "in_review"` e `decision.flags` com `short_body`.

- [ ] **Step 1: Testes (vermelho):** matéria com `bodyText` longo gera ≥ 350 palavras (modelo fictício `AI_PROVIDER=fake` devolve o tamanho pedido); primeira resposta curta dispara 1 nova tentativa; continuando curta vira `in_review` + `short_body`; sem material suficiente (< 1.500) não tenta e não bloqueia a editoria que permite breve; `buildItemText` respeita 3.500 e 14.000 e ordem por papel; `copyGuard` e citação seguem valendo.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm exec vitest run src/lib/pipeline/steps/write-depth.test.ts`.
- [ ] **Step 3: Implementar** (idempotência por hash inclui `bodyText` e a versão nova do prompt).
- [ ] **Step 4: Rodar** vitest `src/lib/pipeline`, `tests/integration`, `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(pipeline): matéria mais funda a partir do corpo das fontes [TXT-T2]`.

### Task TXT-T3: Aprofundar matérias curtas já publicadas

**Files:**
- Modify: `src/lib/pipeline/reprocess.ts` (`deepenShortArticles`), `src/lib/db/control-store.ts`, `src/app/estudio/control/actions.ts`, tela do Control Center de reprocesso
- Create: `supabase/migrations/0055_short_articles_rpc.sql` (função `short_articles_candidates(p_limit int, p_after_at timestamptz, p_after_id uuid)`)
- Test: `src/lib/pipeline/reprocess.test.ts`

**Interfaces:**
- Produces: `deepenShortArticles(deps, input: { limit: number; after?: Cursor }): Promise<{ targets: number; enqueued: number; next: Cursor|null }>` (candidatas: publicadas, < 250 palavras, sem edição humana, com item de fonte com `enrich`; enfileira `enrich` do item e depois `write` com `mode: "update"`, que grava nova versão `updated` e mantém slug e data); ação do Control Center "Aprofundar matérias curtas" (lote de 20, confirmação digitada, auditoria).

- [ ] **Step 1: Testes (vermelho):** só candidatas válidas; nunca humana editada; lote máximo 20; cursor paginado; nova versão registrada e `published_at` preservado.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm exec vitest run src/lib/pipeline/reprocess.test.ts`.
- [ ] **Step 3: Implementar** reaproveitando `reprocessImages` como modelo; função SQL sem `DELETE`.
- [ ] **Step 4: Rodar** vitest, integração, `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(pipeline): aprofundar matérias curtas publicadas [TXT-T3]`.

### Task LAB-T1: Varrer rótulos de revisão, geração e IA do público

**Files:**
- Modify: `src/lib/labels/index.ts` (`publicLabels` deixa de devolver rótulo de revisão), `src/content/pt-BR/{labels,portal-card,portal-topic,ask,institutional,newsletter,notifications}.ts`, `src/components/editorial/{ArticleByline,MadeHow,OriginNotes,ArticleCard,SummaryBox,AggregatedCard}.tsx`, `src/app/(public)/materia/[slug]/page.tsx`, metadados (`generateMetadata`, JSON-LD), RSS (`src/app/**/rss*`), e-mails (`src/lib/email/*`), push (`src/lib/push/*`), cartões de compartilhamento
- Test: `tests/e2e/vocabulary.spec.ts`, `src/lib/labels/index.test.ts`, `src/components/editorial/*.test.tsx`

**Interfaces:**
- Produces: `publicLabels(article)` devolve só `{ origin: "Feito a partir de n fontes" | null; plaque: "ORIGINAL CITYNEWS" | "AGREGADO · fonte" | null; sponsored: boolean; photoCredit: string | null }`; `MadeHow` vira "De onde veio" (fontes, imagens, histórico de versões, link para metodologia só se a página legal estiver ativa).

- [ ] **Step 1: Varredura e testes (vermelho).** Também saem do público os selos de estado do assunto (`TOPIC_STATE_TEXT` em `portal-card.ts`: "Em apuração", "Confirmado", "Encerrado") em cards, matéria e assunto, mantendo "Corrigido" com a nota de correção; o estado continua no Estúdio. Rodar `rg -i "revisad|gerad|automátic|automatic|inteligência|\bIA\b|agente|manipulad|autonomia" src/content src/components src/app/(public) src/lib/{labels,email,push}` e listar cada ocorrência pública num arquivo `.superpowers/sdd/2026-10-03-destaques/lab-sweep.md` (arquivo:linha, texto, destino: remover ou manter por ser Estúdio/legal). Testes: `vocabulary.spec.ts` com a lista de proibidos do R16 em home, editoria, matéria, assunto, busca, explorar, agenda, fontes, panorama, newsletter, entrar, perfil, resposta do Pergunte e nos `<title>`, `<meta>` e JSON-LD de matéria e home; unit de `publicLabels`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm exec playwright test tests/e2e/vocabulary.spec.ts --project=desktop` e `pnpm exec vitest run src/lib/labels`.
- [ ] **Step 3: Implementar** remoções e renomeações; o texto "Resumo em poucos segundos" fica sem rodapé de revisão; Estúdio e Control Center intocados (testes que os cobrem continuam).
- [ ] **Step 4: Rodar** vitest `src/components src/lib`, e2e `vocabulary`, `article`, `home`, `newsletter`, `ask`, `seo` em desktop e mobile, axe, `pnpm typecheck`.
- [ ] **Step 5: Commit** `fix(ui): nenhum rótulo público de revisão, geração ou IA [LAB-T1]`.

### Task CONF-T1: Tirar a confiança da tela pública

**Files:**
- Modify: `src/components/editorial/ArticleCard.tsx:194`, `TopicSummaryCard.tsx:57`, `src/app/(public)/materia/[slug]/page.tsx:322`, `src/app/(public)/assunto/[slug]/page.tsx:67,168-174`, `src/app/(public)/metodologia/page.tsx:27-31,103-108`, `src/components/ai/AiAnswer.tsx:63,68-69`, `src/content/pt-BR/{portal-card,portal-topic,institutional,ask}.ts`, `src/components/index.ts` (`ConfidenceMeter` fica só para o Estúdio: mover para `src/components/studio/`)
- Test: `tests/e2e/vocabulary.spec.ts`, `src/components/editorial/*.test.tsx`

**Interfaces:**
- Produces: nenhum componente público exibe o nível; `ConfidenceMeter` passa a viver em `src/components/studio/ConfidenceMeter.tsx` (mesma API `{ level }`); `/metodologia` descreve em texto simples como as matérias são feitas, sem níveis.

- [ ] **Step 1: Testes (vermelho):** `vocabulary.spec.ts` ganha "confiança" e "confianca" na lista de termos proibidos nas rotas públicas (home, editoria, matéria, assunto, metodologia, pergunte com resposta); testes de `ArticleCard` lead, `TopicSummaryCard` e `AiAnswer` afirmam que não existe `role="img"` de confiança nem o texto "Confiança".
- [ ] **Step 2: Rodar e ver falhar:** `pnpm exec vitest run src/components/editorial src/components/ai` e `pnpm exec playwright test tests/e2e/vocabulary.spec.ts --project=desktop`.
- [ ] **Step 3: Implementar** a remoção e a mudança do componente; ajustar importações do Estúdio.
- [ ] **Step 4: Rodar** vitest `src/components`, e2e `vocabulary`, `home`, `article`, `topic`, `ask` e `a11y` em desktop e mobile, `pnpm typecheck`.
- [ ] **Step 5: Commit** `fix(ui): confiança sai da tela pública [CONF-T1]`.

### Task CONF-T2: Painel "Por que esta verificação" no Estúdio

**Files:**
- Modify: `src/lib/confidence/index.ts` (`explainConfidence`), `src/components/studio/SourcesEditor.tsx:106-115`, `src/app/estudio/materias/[id]/page.tsx:121,249-259`, `src/app/estudio/fila/[id]/page.tsx:97`, `src/content/pt-BR/studio.ts`
- Create: `src/components/studio/ConfidenceExplainer.tsx`, `ConfidenceExplainer.test.tsx`
- Test: `src/lib/confidence/index.test.ts`, `tests/e2e/studio-confidence.spec.ts`

**Interfaces:**
- Produces: `explainConfidence(input: ConfidenceInput, rule: { minSources: number; requirePrimary: boolean; minScore: number | null }): { level; score; factors: { key: "sources"|"primary"|"conflict"|"freshness"; label: string; weight: number; earned: number }[]; reasons: string[]; checks: { key: "min_sources"|"primary"|"min_score"|"conflict"; ok: boolean; need: string; have: string }[]; suggestions: string[] }`; `computeConfidence` não muda.

- [ ] **Step 1: Testes (vermelho):** 1 fonte sem primária fresca: score 0,40 (0,10+0+0,25+0,15), nível baixa, `suggestions` inclui "Confirmar uma fonte primária" e "Esperar uma segunda fonte"; 2 fontes + 1 primária fresca: 0,80 alta; conflito central: baixa e `checks.conflict.ok = false`; soma de `earned` = score; `checks` comparam com a regra da editoria. Componente: mostra cada fator com barra e texto (sem depender só de cor), lista de cumprimento e sugestões; e2e: o editor vê o painel na matéria e na revisão da fila.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm exec vitest run src/lib/confidence src/components/studio/ConfidenceExplainer.test.tsx`.
- [ ] **Step 3: Implementar** `explainConfidence` e o painel dentro do `SourcesEditor` (recalcula ao vivo ao mudar papéis).
- [ ] **Step 4: Rodar** vitest `src/lib/confidence`, `src/components/studio`, e2e e axe do Estúdio, `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(estudio): painel que explica a verificação da matéria [CONF-T2]`.

### Task CONF-T3: Revisão do padrão de confiável

**Files:**
- Modify: `src/lib/confidence/index.ts` (`levelFromScore`), `src/lib/pipeline/steps/verify.ts:124-159` (fontes independentes por veículo), `src/lib/media/fetch-image.ts` (reutilizar `registrableDomain`, mover para `src/lib/url/registrable-domain.ts`)
- Test: `src/lib/confidence/index.test.ts`, `src/lib/pipeline/steps/verify.test.ts`, `src/lib/rules/rules.test.ts` (garantir que `decidePublication` não mudou)

**Interfaces:**
- Produces: `levelFromScore(score: number, centralConflict: boolean): "alta"|"média"|"baixa"` (alta ≥ 0,80, média ≥ 0,55, baixa < 0,55; conflito → baixa); `countIndependentOutlets(sources: { id: string; baseUrl: string }[]): number` (por domínio registrável); `computeConfidence` usa os dois sem mudar a fórmula do score.

- [ ] **Step 1: Testes (vermelho):** cortes 0,80 e 0,55 exatos; conflito força baixa; Olhar Direto e Olhar Conceito contam 1 veículo; `decidePublication` dá a mesma decisão que antes para um conjunto fixo de candidatos (teste de regressão); relatório de impacto: função `simulateLevelChange` conta quantas matérias publicadas mudam de nível.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm exec vitest run src/lib/confidence src/lib/pipeline/steps/verify.test.ts src/lib/rules`.
- [ ] **Step 3: Implementar** e rodar a simulação no banco de produção só de leitura (contagem por nível antes e depois) para o relatório.
- [ ] **Step 4: Rodar** vitest completo de `src/lib`, integração, `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(verificacao): nível pelo score e fontes por veículo [CONF-T3]`.

### Task HOT-T1: Sinal de destaque dos portais (banco e domínio)

**Files:**
- Create: `supabase/migrations/0056_hot_signals.sql`, `src/lib/featured/hot.ts`, `hot.test.ts`, `tests/integration/hot-signals.test.ts`
- Modify: `featured_items` (coluna `kind text not null default 'manual' check (kind in ('manual','hot'))`, `topic_id uuid null`, `dismissed_at timestamptz null`), flag `hot_featured_enabled` (padrão ligada) e `hot_min_sources` (padrão 3) em `feature_flags`/regras

**Interfaces:**
- Produces (SQL): tabela `front_signals(id, source_id fk, topic_id fk null, item_id fk null, url text, rank int, seen_at timestamptz)` com índice `(topic_id, seen_at)`; toda leitura ignora linhas com mais de 7 dias. A limpeza (`front_signals_purge()`, com `delete`) vai num arquivo separado `0057_front_signals_purge.sql`, agendado por `pg_cron`; o conector Supabase retém instruções com `DELETE`, então esse arquivo é aplicado pelo dono no SQL Editor e a pauta quente não depende dele.
- Produces (TS): `type FrontSignal = { sourceId: string; topicId: string; rank: number; seenAt: Date }`; `detectHot(signals: FrontSignal[], now: Date, opts: { minSources: number; windowHours: number; maxRank: number }): HotTopic[]` com `HotTopic = { topicId: string; sources: number; lastSeenAt: Date }` (fontes distintas com `rank ≤ maxRank` dentro da janela; padrão 3, 6 h, 3); `supportScore(coverage: { topicId: string; sources: number }[], now): Map<string, number>` (apoio por cobertura simultânea ≥ 3 fontes em 3 h, só pontuação).

- [ ] **Step 1: Testes (vermelho):** 3 fontes distintas no rank 1 a 3 dentro de 6 h → quente; 2 fontes não; a mesma fonte repetida conta 1; rank 4 não conta; sinal de 7 h atrás não conta; `minSources = 4` exige 4; apoio por cobertura nunca devolve `HotTopic`. Integração: anon não lê `front_signals`; escrita só service role.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm exec vitest run src/lib/featured/hot.test.ts`.
- [ ] **Step 3: Implementar** o domínio puro e a migration idempotente.
- [ ] **Step 4: Rodar** vitest, `pnpm db:reset` e integração, `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(destaques): sinal de portais e pauta quente no domínio [HOT-T1]`.

### Task HOT-T2: Passo `frontpage` (ler o topo da página inicial das fontes)

**Files:**
- Create: `src/lib/pipeline/steps/frontpage.ts`, `frontpage.test.ts`, `src/app/api/ingest/frontpage/route.ts` (Bearer `CRON_SECRET`), migration de cron (`ingest-frontpage` a cada 20 min, via `pg_net` como as demais)
- Modify: `src/lib/pipeline/types.ts` (`STEP_NAMES` com `frontpage`), `src/lib/pipeline/deps.ts`, `src/lib/pipeline/drain.ts` (`STEP_MIN_MS`), regras do Painel de Fontes (campo `consumption.frontpage`)

**Interfaces:**
- Produces: `parseFrontTop(html: string, baseUrl: string, take = 3): { url: string; rank: number }[]` (links de matéria do mesmo domínio, no topo da página, na ordem do documento, sem repetidos; ignora menu, rodapé, tags e links de editoria curtos); `createFrontpageStep(deps): StepHandler` (por fonte com `consumption.frontpage === true` e status ativa: robots permite `/`, atraso e limite por hora da fonte, 1 GET de até 512 KB; casa cada URL canônica com `collected_items` e grava `front_signals`; não grava nada além de URL, posição e hora).

- [ ] **Step 1: Testes (vermelho):** HTML de portal fictício com menu, hero e lista: os 3 primeiros links de matéria saem em ordem e o menu é ignorado; link de outro domínio ignorado; sem `frontpage` na fonte nada acontece; `robots.txt` que proíbe `/` pula; 429 e limite por hora da fonte pulam sem erro; URL sem item coletado grava só com `item_id` nulo e é descartada na detecção.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm exec vitest run src/lib/pipeline/steps/frontpage.test.ts`.
- [ ] **Step 3: Implementar** com `linkedom`, reaproveitando `checkRobots`, `crawlGet`, limites de `enrich.ts` e o canonicalizador de URL do `normalize`.
- [ ] **Step 4: Rodar** vitest `src/lib/pipeline`, rota com `CRON_SECRET` inválido → 401, `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 5: Commit** `feat(pipeline): lê o topo da página inicial das fontes [HOT-T2]`.

### Task HOT-T3: Pauta quente vira destaque (precedência e admin)

**Files:**
- Create: `src/lib/featured/hot-pin.ts`, `hot-pin.test.ts`
- Modify: `src/lib/featured/resolve.ts` (precedência manual > quente > automático), `src/lib/db/queries/featured.ts`, `src/lib/studio/featured.ts` (`dismissHot(id)`), `src/components/studio/featured/FeaturedBoard.tsx` (pílula "Em alta · n portais", botão Dispensar), `src/lib/studio/switches.ts` e `src/content/pt-BR/switches.ts` (`hot_featured_enabled`), rótulo público "Em alta em Cuiabá"
- Test: `tests/e2e/featured-hot.spec.ts`

**Interfaces:**
- Consumes: `detectHot`, `front_signals` (HOT-T1), `getFeatured`/`resolveSlot` (FD-T1/T2), ações do admin (FD-T3).
- Produces: `applyHotPins(deps: { db; now: () => Date }): Promise<{ pinned: number; renewed: number; skipped: number }>` (roda após cada coleta e após a publicação; para cada assunto quente com matéria publicada e não patrocinada, grava `featured_items` `kind='hot'` por 3 h, renova enquanto o sinal durar, teto de 12 h, ocupa `home.lead`, `editoria.lead` e vagas livres de `home.destaques`; respeita `hot_featured_enabled`, `dismissed_at` e pino manual vigente; nunca publica nem altera status de matéria).

- [ ] **Step 1: Testes (vermelho):** assunto quente com matéria publicada vira lead; sem matéria publicada nada é pinado; matéria em revisão nunca; pino manual vigente vence o quente; quente dispensado não volta pelo mesmo sinal; `hot_featured_enabled = false` desliga; renovação respeita o teto de 12 h; assunto sensível/segurança sem matéria publicada não é forçado; e2e: com 3 fontes sinalizando, a home mostra a matéria como lead com "Em alta em Cuiabá" em dois reloads seguidos; sem sinal, volta ao automático da janela.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `applyHotPins` e a precedência; chamar no fim de `tick` e de `publish` (idempotente).
- [ ] **Step 4: Rodar** vitest `src/lib/featured`, `src/lib/studio`, integração, e2e `featured-hot` e `featured-public`, axe do quadro.
- [ ] **Step 5: Commit** `feat(destaques): pauta quente com precedência e admin [HOT-T3]`.

### Task GATE: Fechamento

**Files:** `docs/reports/destaques-e-profundidade.md`, `.planning/DECISIONS.md` (A-106 a A-109), `.planning/STATE.md`, `.planning/progress.json`

- [ ] **Step 1:** `pnpm db:reset && pnpm verify` e e2e do conjunto (home, editorias, explorar, matéria, admin-featured, keyboard, vocabulary), axe das telas novas, claro e escuro.
- [ ] **Step 2:** aplicar as migrations 0053, 0054, 0055 e 0056 em produção (hash conferido; a 0057, com `delete`, fica para o dono) e ligar `consumption.frontpage` nas fontes ativas com robots permitindo `/` e, depois do deploy, pinar um destaque de teste, conferir que dois reloads trazem o mesmo lead e remover o pino.
- [ ] **Step 3:** rodar "Aprofundar matérias curtas" em produção (lote de 20 por vez) e medir antes e depois (palavras por matéria).
- [ ] **Step 4:** relatório com medidas (altura da barra, palavras antes e depois, trocas de lead por dia antes e depois), decisões e pendências; commit `docs: gate de destaques e profundidade [GATE]`.
