# Autonomia de publicação alta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar sozinho quase tudo, inclusive segurança, política, saúde, sensível e urgente local, com humano só para conteúdo extremamente duvidoso ou fontes divergentes, e escopo regional para destaque e urgência.

**Architecture:** Novos portões em `decidePublication`, regras v3 (proposta inativa que o dono aprova), fonte confiável, escopo da notícia (`news_scope`), checklist e disjuntor automáticos, escalada por denúncias, revisor automático noturno, prazos de fila e estados do assunto automáticos.

**Tech Stack:** TypeScript strict, Supabase (Postgres, RLS, funções, `pg_cron`), Vitest, Playwright, zod, OpenRouter pelo AI SDK existente.

**Spec:** `docs/superpowers/specs/2026-10-03-autonomia-de-publicacao-design.md` (e R20 a R23 de `2026-10-03-destaques-e-profundidade-design.md`).

## Global Constraints

- Score mínimo 0,30; `forceReview false`; todas as editorias `auto`, segurança incluída; `sensitiveTopics` vazia; `neverAuto = []`.
- Só sobe para aprovação: fontes divergentes confirmadas, conteúdo `dubious`, rascunho sem IA, `read_only` ou `auto_publish` desligado, fonte não confiável com assunto grave e sem segunda fonte, score < 0,30.
- Toda matéria publicada cita a fonte: linha final "Com informações de {fonte}" com link, e "segundo {fonte}" no texto de segurança, política e saúde.
- Disjuntor: 60 por hora e 800 por dia, pico de denúncias, falha de IA; pausa a publicação automática e avisa.
- Denúncias: 3 em 24 h na mesma matéria abrem item urgente no admin e ligam o banner público "Esta matéria está em revisão".
- Revisor automático: modos `off`, `night` (20h às 6h, America/Cuiabá, padrão), `always`; decide `publish`, `hold` ou `archive` com justificativa; nunca decide correção, direito de resposta, denúncia nem mudança de regra.
- `news_scope` ∈ {`cuiaba`,`mt`,`national`}; urgente e destaque só local/regional ou comoção nacional.
- Duas pessoas continuam para: alterar regras, religar `auto_publish`, push urgente, retomar envios, papéis de admin. **A v3 das regras é criada como proposta inativa e o dono a aprova no painel de governança.**
- Migrations aditivas e idempotentes; funções novas sem `DELETE` (o conector Supabase retém `DELETE`); numeração a partir de 0061.
- Sem menção pública a IA, revisão ou automação (spec 2026-10-03, R16); Estúdio e Control Center mostram tudo.
- TDD, `pnpm verify` verde por tarefa, commits Conventional com o ID da tarefa, sem push no meio de tarefa.

## Review Focus

1. Notícia de segurança de fonte confiável publica sozinha e traz "Com informações de {fonte}" (AUT-T1/T2).
2. Fontes divergentes confirmadas continuam indo para aprovação mesmo com score alto (AUT-T1).
3. Notícia nacional sem comoção nunca vira urgente nem lead (AUT-T3).
4. Terceira denúncia liga o banner e abre urgência uma única vez, sem duplicar (AUT-T5).
5. O revisor automático não decide fora da janela noturna no modo `night` e respeita o orçamento de IA (AUT-T6).

---

### Task AUT-T1: Regras v3 e portões de `decidePublication`

**Files:**
- Modify: `src/lib/rules/index.ts:99-148`, `src/lib/rules/defaults.ts`, `src/lib/pipeline/steps/decide.ts:12-92` (`NEVER_AUTO`, `breaking`), `src/lib/rules/load.ts`
- Create: `supabase/bootstrap/rules-v3-proposal.sql` (proposta inativa, `proposed_by` = sistema, sem ativar), `src/lib/rules/dubious.ts`
- Test: `src/lib/rules/rules.test.ts`, `src/lib/pipeline/steps/decide.test.ts`

**Interfaces:**
- Produces: `decidePublication(c: Candidate, rules: RuleSet): Decision` com os portões da spec §4; `Candidate` ganha `dubious: boolean`, `sourceTrusted: boolean`, `grave: boolean` (acusação a pessoa, saúde individual, segurança), `newsScope`; `RuleSet.neverAuto: string[]` (padrão `[]`); `isDubious(a: ClassifyOutput & VerifyOutput): boolean` em `dubious.ts` (agente marcou `dubious` ou sem atribuição possível).
- A v3 em `rules-v3-proposal.sql`: `minScore 0.30`, `minSources 1`, `requirePrimary false`, `requireApprovedImage false`, modo `auto` em todas as categorias, `forceReview false`, `sensitiveTopics []`.

- [ ] **Step 1: Testes (vermelho):** segurança com fonte confiável e score 0,35 → `publish`; política com 1 veículo independente → `publish`; saúde com fonte citada → `publish`; urgente local → `publish`; `breaking` e `sensitive` deixam de ser portão; conflito central confirmado → `review`; `dubious` → `review`; fonte não confiável + `grave` + 1 fonte → `review`; score 0,29 → `review`, 0,30 → `publish`; `read_only` e `auto_publish` desligado → `review`; rascunho sem IA → `review`; `NEVER_AUTO` vazio por padrão.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm exec vitest run src/lib/rules src/lib/pipeline/steps/decide.test.ts`.
- [ ] **Step 3: Implementar** e o SQL da proposta v3 (inativa).
- [ ] **Step 4: Rodar** vitest `src/lib/rules src/lib/pipeline`, integração, `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(regras): portões novos e proposta v3 de autonomia [AUT-T1]`.

### Task AUT-T2: Fonte confiável e atribuição obrigatória

**Files:**
- Create: `supabase/migrations/0061_source_trusted.sql` (`sources.trusted boolean not null default false`, backfill `reliability in ('primary','verified')`), `src/lib/pipeline/steps/credit-line.ts`
- Modify: `src/lib/pipeline/steps/write.ts` (regras de redação e linha final), `src/lib/pipeline/steps/verify.ts` (expõe `sourceTrusted`), Painel de Fontes (`src/components/studio/sources/*`, campo "Fonte confiável"), `src/app/(public)/materia/[slug]/page.tsx` (exibe a linha final)
- Test: `src/lib/pipeline/steps/credit-line.test.ts`, `write.test.ts`

**Interfaces:**
- Produces: `appendCreditLine(doc, sources: { name: string; url: string }[]): Doc` ("Com informações de {fonte}" com link, uma ou mais); `WRITE_TASK` ganha as regras de redação da spec §3 (presunção de inocência, nenhum menor ou vítima identificados, sem método de suicídio, saúde sem orientação clínica, atribuição "segundo {fonte}"); `sourceTrusted(item)`.

- [ ] **Step 1: Testes (vermelho):** matéria de 1 fonte termina com "Com informações de X" com link; matéria sem fonte citável não passa; o prompt de segurança/política/saúde contém as regras de redação; o campo "Fonte confiável" salva e audita; backfill marca primary e verified.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm exec vitest run src/lib/pipeline/steps`.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** vitest, e2e `article` (linha de crédito visível), vocabulary, `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(pipeline): fonte confiável e atribuição obrigatória [AUT-T2]`.

### Task AUT-T3: Escopo regional da notícia e urgência local

**Files:**
- Create: `supabase/migrations/0062_news_scope.sql` (`articles.news_scope`, `national_commotion`), `src/lib/geo/news-scope.ts`
- Modify: `src/lib/pipeline/steps/classify.ts` e `locate` (grava o escopo), `src/lib/pipeline/steps/decide.ts` (rebaixa `urgent` nacional sem comoção), push de urgente (`src/lib/push/*`), faixa Urgente da home
- Test: `src/lib/geo/news-scope.test.ts`

**Interfaces:**
- Produces: `newsScope(input: { neighborhoods: string[]; municipality: string | null; sourceLocality: "cuiaba"|"mt"|"br"; text: string }): "cuiaba"|"mt"|"national"`; `isEligibleForFeature(a: { newsScope; nationalCommotion: boolean }): boolean`.

- [ ] **Step 1: Testes (vermelho):** bairro de Cuiabá → `cuiaba`; município de MT fora da capital → `mt`; matéria de Brasília de fonte nacional → `national`; urgente nacional sem comoção vira não urgente e não gera push; com `national_commotion` fica elegível.
- [ ] **Step 2 a 5:** vermelho, implementar, rodar vitest `src/lib/geo src/lib/pipeline src/lib/push`, commit `feat(regional): escopo da notícia e urgência local [AUT-T3]`.

### Task AUT-T4: Checklist automático e disjuntor

**Files:**
- Create: `src/lib/pipeline/steps/auto-checklist.ts`, `src/lib/pipeline/breaker.ts`, `supabase/migrations/0063_breaker.sql` (`publish_counters`)
- Modify: `src/lib/pipeline/steps/publish.ts`, `src/lib/studio/switches.ts` (limites editáveis), `src/lib/pipeline/steps/notify.ts`
- Test: `auto-checklist.test.ts`, `breaker.test.ts`

**Interfaces:**
- Produces: `autoChecklist(article): { fixed: string[]; blockers: ("no_source"|"no_title")[] }` (gera `alt`, SEO e taxonomia que faltam; só `no_source` e `no_title` bloqueiam); `breaker.check(now, counts): { open: boolean; reason: "hourly"|"daily"|"reports"|"ai_failures"|null }` (60 por hora, 800 por dia, pico de denúncias, falhas de IA); abrir o disjuntor chama `contingency_pause_cycle` e notifica.

- Portão de completude (spec A16): `isComplete(article): { ok: boolean; missing: ("body"|"source"|"cover")[] }` em `auto-checklist.ts`; faltando algo, `publish` espera até 10 min reprocessando o passo que falta e, depois, publica com cartão tipográfico se só faltar a capa; corpo curto abaixo do mínimo da editoria vai ao revisor automático. Testes: corpo cortado não publica; capa pendente espera e depois cai no cartão; nunca há publicação com capa "a caminho".
- [ ] **Step 1: Testes (vermelho):** matéria sem alt ganha alt e publica; sem fonte não publica; 61ª publicação na hora abre o disjuntor; pico de denúncias abre; fechado depois do reset manual no admin.
- [ ] **Step 2 a 5:** vermelho, implementar, vitest, commit `feat(pipeline): checklist automático e disjuntor [AUT-T4]`.

### Task AUT-T5: Denúncias escalam e banner "em revisão"

**Files:**
- Create: `supabase/migrations/0064_report_escalate.sql` (`report_escalate()` sem `DELETE`, `articles.review_banner boolean`), `src/lib/studio/report-escalate.ts`
- Modify: `src/lib/studio/moderation.ts`, `src/components/editorial/ReviewBanner.tsx` (novo), `src/app/(public)/materia/[slug]/page.tsx`, fila do admin (item urgente)
- Test: `src/lib/studio/report-escalate.test.ts`, `tests/e2e/report-banner.spec.ts`

**Interfaces:**
- Produces: ao registrar a 3ª denúncia aberta em 24 h para o mesmo artigo, abre item `kind = 'report_urgent'` na fila (uma vez) e liga `review_banner`; resolver o item desliga o banner; `ReviewBanner` mostra "Esta matéria está em revisão" (sem outra explicação).

- [ ] **Step 1: Testes (vermelho):** 2 denúncias não escalam; a 3ª escala uma só vez; a 4ª não duplica; resolver desliga o banner; e2e: banner aparece e some; texto do banner passa no vocabulary.
- [ ] **Step 2 a 5:** vermelho, implementar, vitest, e2e, commit `feat(denuncias): 3 denúncias abrem urgência e banner [AUT-T5]`.

### Task AUT-T6: Revisor automático e prazos da fila

**Files:**
- Create: `src/lib/pipeline/steps/auto-reviewer.ts`, `src/lib/ai/schemas/review.ts`, `supabase/migrations/0065_auto_reviewer.sql` (seed do agente `reviewer`, flag `ai_reviewer_mode`, `articles.due_at` por trigger), `src/app/api/ingest/review-tick/route.ts`
- Modify: `src/lib/studio/switches.ts` e `src/content/pt-BR/switches.ts` (modo `off|night|always`), `src/lib/studio/queue.ts` (prazos: urgente 10 min, demais 30 min), cron `review-tick` a cada 5 min
- Test: `auto-reviewer.test.ts`, `queue.test.ts`

**Interfaces:**
- Produces: `autoReview(item, deps): Promise<Result<{ verdict: "publish"|"hold"|"archive"; reason: string }, ReviewError>>` (saída validada por zod; texto externo como dado); `isReviewerActive(mode, now): boolean` (`night` = 20h às 6h em America/Cuiabá); o tick pega itens `in_review` vencidos (`due_at`), exceto correção, direito de resposta, denúncia e mudança de regra; grava `decisions` com a justificativa; respeita o orçamento diário de IA e cai para fila humana se o orçamento acabar.

- [ ] **Step 1: Testes (vermelho):** em `night`, às 14h não decide e às 22h decide; `always` decide a qualquer hora; `off` nunca; item de denúncia nunca; veredito inválido do modelo vira `hold`; orçamento estourado deixa o item na fila; `due_at` preenchido ao entrar em revisão.
- [ ] **Step 2 a 5:** vermelho, implementar, vitest, commit `feat(revisao): revisor automático e prazos da fila [AUT-T6]`.

### Task AUT-T7: Estado do assunto e agenda de leitor automáticos

**Files:**
- Create: `src/lib/topics/state.ts`, `src/lib/studio/event-auto-approve.ts`
- Modify: `src/lib/pipeline/steps/verify.ts` e `cluster.ts` (chamam `nextTopicState`), `src/lib/studio/moderation.ts:53-110`, páginas do Estúdio que mostram o estado
- Test: `state.test.ts`, `event-auto-approve.test.ts`

**Interfaces:**
- Produces: `nextTopicState(t: { state; independentOutlets: number; hasOfficial: boolean; hasCorrection: boolean; daysSinceLastItem: number }): TopicState` (confirmado com 2 veículos ou 1 oficial; corrigido com correção; encerrado após 7 dias); `canAutoApproveEvent(e: EventSubmission, ctx: { knownVenues: string[]; submittedTodayByUser: number }): boolean` (data futura, local conhecido, sem link nem palavrão, limite diário).

- [ ] **Step 1 a 5:** testes, implementar, vitest, commit `feat(topicos): estado e agenda automáticos [AUT-T7]`.

### Task AUT-T8: Ativação da v3 e liberação do acúmulo

**Files:**
- Create: `scripts/release-backlog.mjs` (lote de 50, reenfileira `rules`, acompanha o disjuntor), `docs/reports/autonomia-de-publicacao.md`
- Modify: `.planning/DECISIONS.md` (A-106 em diante), `CLAUDE.md` §5 regra 8

- [ ] **Step 1:** conferir em produção (somente leitura) que a proposta v3 existe e que as colunas das migrations 0061 a 0065 foram aplicadas (hash conferido).
- [ ] **Step 2:** o dono aprova a v3 no painel de governança (aprovador diferente do proponente); só então ativar.
- [ ] **Step 3:** rodar `release-backlog` em lotes de 50, medir publicadas por hora, disjuntor e denúncias nas primeiras 24 h.
- [ ] **Step 4:** relatório com antes e depois, decisões A-106 a A-114 e a atualização da regra 8; commit `docs: ativação da autonomia de publicação [AUT-T8]`.
