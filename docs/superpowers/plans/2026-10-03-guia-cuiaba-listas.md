# Guia Cuiabá: listas editoriais automatizadas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Listas como "As 5 melhores padarias de Cuiabá" geradas a partir de dados públicos, com painel no admin para propor, ajustar e publicar, e páginas públicas de lista e de lugar.

**Architecture:** Tabelas de lugares e listas, domínio puro de pontuação e ranking, passo de sincronização de dados (Google Places, OpenStreetMap, TripAdvisor por API oficial), motor de propostas por modelo e por link, admin em `/estudio/admin/guia` e rotas públicas `/guia-cuiaba/[slug]` e `/guia-cuiaba/lugar/[slug]`.

**Tech Stack:** Next.js 16, TypeScript strict, Supabase, Vitest, Playwright, zod, AI SDK com OpenRouter (extração de link).

**Spec:** `docs/superpowers/specs/2026-10-03-guia-cuiaba-listas-design.md`

## Global Constraints

- Dados só por API oficial (Google Places API, TripAdvisor Content API) ou fonte aberta (OpenStreetMap); **nunca raspagem**. Chaves `GOOGLE_PLACES_API_KEY` e `TRIPADVISOR_API_KEY` são do dono; sem chave, o passo usa OpenStreetMap e sites oficiais e registra "sem chave" no painel.
- Exibir atribuição exigida pelos termos (logotipo e link do Google e do TripAdvisor); atualizar nota e contagem a cada 30 dias; não guardar texto de avaliação.
- Foto só oficial do lugar (site ou rede oficial), política `reproduction`: "Reprodução web · nome", link para a origem, retirada em 24 h a pedido; nada de foto copiada do Google Places.
- Lista nunca publica sem "Como escolhemos"; patrocínio só do CityNews e parceiros, com a flag Patrocinado, e nunca altera a ordem das listas editoriais.
- Sem menção pública a IA; origem em texto simples ("Dados: Google, TripAdvisor e sites dos lugares").
- Migrations aditivas e idempotentes, sem `DELETE` em função nova; numeração 0066 a 0068.
- TDD, `pnpm verify` verde por tarefa, commits Conventional com o ID, sem push no meio de tarefa.

## Review Focus

1. Lista com menos lugares verificados que o mínimo nunca publica sozinha (GUIA-T4).
2. Link colado nunca copia texto do portal de origem; só nomes e fatos verificados de novo (GUIA-T4).
3. Foto sem política de uso cai no cartão tipográfico, nunca é guardada do Google (GUIA-T3).
4. Reclamação de um lugar suspende todas as listas que o citam (GUIA-T7).
5. Lista patrocinada nunca muda a ordem de uma lista editorial (GUIA-T5).

---

### Task GUIA-T1: Banco e domínio de lugares e listas

**Files:**
- Create: `supabase/migrations/0066_guide_core.sql`, `src/lib/guide/{index,types,score,rank,criteria,auto-publish}.ts` e `*.test.ts`, `tests/integration/guide.test.ts`

**Interfaces:**
- Produces (SQL): `venues`, `venue_media`, `guide_lists`, `guide_list_items`, `guide_templates`, `guide_proposals` (campos da spec §4), RLS pública só de lista `published` e lugar ativo.
- Produces (TS): `scoreVenue(v: VenueSignals, w: Weights): { score: number; breakdown: Record<string, number> }` (nota Google ponderada pela contagem, posição no ranking TripAdvisor, menções nas nossas matérias, completude de dados); `rankList(items: ScoredVenue[], take: number): ScoredVenue[]` (desempate estável por nome); `listCriteriaText(t: Template, weights): string`; `canAutoPublish(list: ListDraft, minVenues = 5): { ok: boolean; missing: string[] }`.

- [ ] **Step 1: Testes (vermelho):** nota 4,8 com 20 avaliações pontua menos que 4,6 com 900; ranking TripAdvisor melhora o score; menções locais somam; completude penaliza lugar sem endereço; `rankList` estável; `canAutoPublish` falha com 4 lugares verificados, sem critério ou sem 2 fontes por lugar; RLS: anon não lê proposta nem rascunho.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm exec vitest run src/lib/guide` e `pnpm db:reset && pnpm exec vitest run tests/integration/guide.test.ts`.
- [ ] **Step 3: Implementar** o domínio e a migration.
- [ ] **Step 4: Rodar** os mesmos comandos, `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 5: Commit** `feat(guia): lugares, listas e pontuação [GUIA-T1]`.

### Task GUIA-T2: Sincronização de dados dos lugares

**Files:**
- Create: `src/lib/guide/providers/{google-places,osm,tripadvisor}.ts` e testes, `src/lib/pipeline/steps/venue-sync.ts`, `src/app/api/ingest/venues/route.ts` (Bearer `CRON_SECRET`), cron semanal e atualização a cada 30 dias
- Modify: `src/lib/pipeline/types.ts`, `deps.ts`

**Interfaces:**
- Produces: `interface VenueProvider { search(q: { category: string; area: string }): Promise<VenueRecord[]>; details(id: string): Promise<VenueRecord | null> }` com as três implementações; o passo mescla por `place_ids`, preenche `venues`, registra cota e custo, e sem chave devolve `skipped: "no_key"`.

- [ ] **Step 1: Testes (vermelho):** cada provedor com resposta fictícia mapeada para `VenueRecord`; mescla de duplicatas por nome e coordenada; sem chave pula e avisa; limite de custo diário respeitado; nota nunca guarda texto de avaliação.
- [ ] **Step 2 a 5:** vermelho, implementar com `fetch` identificado e respeitando termos, rodar vitest `src/lib/guide src/lib/pipeline`, commit `feat(guia): sincronização de lugares por API oficial [GUIA-T2]`.

### Task GUIA-T3: Fotos oficiais dos lugares

**Files:**
- Create: `src/lib/guide/venue-media.ts`, `venue-media.test.ts`
- Modify: `src/lib/pipeline/steps/media.ts` (entrada por lugar), `src/lib/media/choose.ts`, página de mídia do Estúdio

**Interfaces:**
- Produces: `officialPhotoFor(v: Venue): Promise<Result<MediaCandidate, "none"|"blocked"|"low_res">>` (só do site ou rede oficial do lugar, passa pelas mesmas verificações de tamanho mínimo 600 px, duplicata e `robots.txt`); crédito "Reprodução web · {nome}"; sem foto, cartão tipográfico; retirada em 24 h pelo mesmo `takedownReproduction`.

- [ ] **Step 1 a 5:** testes (foto de domínio oficial passa, de terceiro não; cartão tipográfico quando falta; retirada marca todas as listas), implementar, vitest, commit `feat(guia): foto oficial do lugar [GUIA-T3]`.

### Task GUIA-T4: Motor de propostas (modelos e link)

**Files:**
- Create: `src/lib/guide/proposals.ts`, `src/lib/guide/extract-link.ts`, `src/lib/ai/schemas/guide.ts`, `supabase/migrations/0067_guide_templates_seed.sql` (cerca de 30 modelos), cron `guide-propose` (3 por semana) e `guide-refresh` (a cada 90 dias)
- Test: `proposals.test.ts`, `extract-link.test.ts`

**Interfaces:**
- Produces: `proposeFromTemplate(t: Template, venues: Venue[]): ListDraft`; `extractFromLink(url: string, deps): Promise<Result<{ names: string[]; category: string | null; criteria: string | null; notes: string[] }, ExtractError>>` (busca a página respeitando `robots.txt`, extrai nomes e fatos com saída validada por zod, descarta qualquer texto copiado e trata a página como dado, nunca instrução); `verifyNames(names, providers): Promise<VerifiedVenue[]>` confere cada nome nos provedores antes de entrar na lista.

- [ ] **Step 1: Testes (vermelho):** modelo "padarias em Cuiabá" propõe 5 lugares mais bem pontuados com ≥ 2 fontes de dados; link com página fictícia extrai só nomes; texto copiado do portal não aparece na proposta; nome que não existe nos provedores é descartado; instrução embutida na página é ignorada.
- [ ] **Step 2 a 5:** vermelho, implementar, vitest, commit `feat(guia): propostas por modelo e por link [GUIA-T4]`.

### Task GUIA-T5: Painel do admin do Guia

**Files:**
- Create: `src/app/estudio/admin/guia/{page,propostas/page,listas/page,lugares/page,modelos/page}.tsx`, `src/components/studio/guide/*`, `src/lib/studio/guide.ts`, ações em `actions.ts`
- Modify: `src/lib/auth/permissions.ts` (`guide.manage` para admin e editor), `src/lib/audit/actions.ts`, menu do admin
- Test: `src/lib/studio/guide.test.ts`, `tests/e2e/admin-guide.spec.ts`, `tests/a11y/admin-guide.spec.ts`

**Interfaces:**
- Produces: abas Propostas, Listas, Lugares e Modelos; cartão de proposta com pontuação por lugar e botões Publicar, Ajustar e Descartar; "Propor por link" e "Propor manualmente"; flag **Patrocinado** com nome do patrocinador (só CityNews e parceiros) e a regra de que patrocinada nunca reordena as editoriais; histórico com auditoria `guide.publish|suspend|propose`; estados carregando, vazio, erro, sucesso.

- [ ] **Step 1 a 5:** testes (permissão, propor por link, publicar com critério, flag Patrocinado, auditoria), implementar, vitest e e2e e axe, commit `feat(guia): painel no admin [GUIA-T5]`.

### Task GUIA-T6: Páginas públicas do Guia

**Files:**
- Create: `src/app/(public)/guia-cuiaba/page.tsx`, `[slug]/page.tsx`, `lugar/[slug]/page.tsx`, `src/components/editorial/guide/{ListCard,VenueCard,CriteriaNote}.tsx`, `src/lib/db/queries/guide.ts`
- Modify: rota de matérias do Guia para `/guia-cuiaba/materias`, `src/content/pt-BR/nav.ts`, JSON-LD, sitemap
- Test: `tests/e2e/guide.spec.ts`, `src/components/editorial/guide/*.test.tsx`

**Interfaces:**
- Produces: índice de listas; lista com cards (foto, nota, bairro, "Como escolhemos", "Dados: Google, TripAdvisor e sites dos lugares", "Atualizado em"); página do lugar (endereço, telefone, horário, site, fotos oficiais com crédito); JSON-LD `ItemList` e `LocalBusiness`; sem OriginStrip nem rótulo de revisão ou IA.

- [ ] **Step 1 a 5:** testes (estados, vocabulário, JSON-LD, 390 e 1280, axe), implementar, vitest e e2e, commit `feat(guia): índice, lista e lugar [GUIA-T6]`.

### Task GUIA-T7: Publicação automática, atualização e suspensão

**Files:**
- Create: `src/lib/guide/lifecycle.ts`, `lifecycle.test.ts`
- Modify: crons, `src/lib/studio/guide.ts`, formulário "Informar problema" do lugar

**Interfaces:**
- Produces: `autoPublishList(draft)` usa `canAutoPublish`; `refreshList(list)` reordena a cada 90 dias e atualiza "Atualizado em"; `reportVenue(venueId, reason)` suspende todas as listas que citam o lugar até um humano decidir.

- [ ] **Step 1 a 5:** testes (publica quando cumpre os critérios, suspende com reclamação, atualiza o "Atualizado em", amostragem de revisão listada no painel), implementar, vitest, commit `feat(guia): publicação, atualização e suspensão [GUIA-T7]`.

### Task GUIA-GATE: Fechamento

- [ ] **Step 1:** `pnpm db:reset && pnpm verify`, e2e e axe das telas novas, claro e escuro.
- [ ] **Step 2:** aplicar as migrations 0066 e 0067 em produção (hash conferido) e, se as chaves existirem, rodar a primeira sincronização; publicar as 10 primeiras listas em até 30 dias e medir.
- [ ] **Step 3:** relatório `docs/reports/guia-cuiaba.md`, decisões em `.planning/DECISIONS.md` e commit `docs: gate do guia [GUIA-GATE]`.
