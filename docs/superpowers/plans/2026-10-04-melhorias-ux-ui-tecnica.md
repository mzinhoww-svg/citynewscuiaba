# Melhorias de UX, UI e técnica — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tarefas marcadas `[paralelo]` dentro da mesma fase vão para superpowers:dispatching-parallel-agents, cada uma em worktree isolada.

**Goal:** Entregar os itens 1 a 93 da spec em cinco ondas (um PR por onda), corrigindo defeitos, completando o design system e melhorando fluxos do Estúdio, portal e performance.

**Architecture:** Primeiro os defeitos (W1), depois as primitivas de `src/components/ui` (W2), que W3 (Estúdio) e W4 (portal) consomem em paralelo; W5 (dados, bundle, imagens, testes) fecha. Dentro de cada onda, tarefas com arquivos disjuntos rodam em paralelo e são integradas no branch da onda.

**Tech Stack:** Next.js App Router (RSC), React 19, TypeScript strict, Tailwind v4 (tokens em `src/styles/tokens.css` e `globals.css`), Supabase, Vitest + Testing Library, Playwright + axe, Lighthouse CI, `sharp`.

**Spec:** `docs/superpowers/specs/2026-10-04-melhorias-ux-ui-tecnica-design.md` (cada tarefa cita os itens `#` que entrega; o critério de aceite está lá).

## Global Constraints

- Regras do CLAUDE.md §5 intocadas; nenhum texto público com "IA", "gerado por IA", "resumo por IA"; `src/content/vocabulary.test.ts` verde.
- Só tokens: nenhum hex, px cru (ESLint), z-index fora da escala `--z-*`. Media queries em rem (`64rem` = `lg`).
- Textos de interface em `src/content/pt-BR/*.ts`; pt-BR, frases curtas, sem exclamação. Marca `CityNews`, `Cuiabá` acentuado.
- Alvo de toque ≥ 44 px (`min-h-tap`, `size-tap` ou `hit-area`); contraste ≥ 4,5:1 nos dois temas; toda animação com `motion-safe:`/`prefers-reduced-motion`.
- Server Components por padrão; `"use client"` só com estado ou evento.
- TDD: teste escrito antes, visto falhando, depois passando. `pnpm verify` verde antes de cada commit de fim de tarefa (integração usa a pilha local: `scripts/local-stack/start.sh` e `pnpm db:reset`).
- Commits Conventional com o ID da tarefa: `feat(ui): … [UX-W2-T1]`. Decisões novas `A-141` em diante em `.planning/DECISIONS.md`; `.planning/STATE.md` atualizado no fim de cada onda.
- e2e que interagem com filtros no projeto `mobile` usam `openFilters` (`tests/e2e/helpers/filters.ts`); com o menu do Estúdio, `openStudioMenu` (`tests/e2e/helpers/studio-menu.ts`).
- Nenhum gasto: transformação de imagem por `sharp` (já dependência), não por plano pago.

## Review Focus

1. **Modo escuro em estado interativo** (hover, pressionado, desabilitado, selecionado): o leitor espera texto legível sempre. Teste: `tests/a11y/dark-interactive.spec.ts` (W1-T1) faz hover nos cards, chips, abas e botões com `colorScheme: "dark"` e roda o axe com `color-contrast`.
2. **Celular de 320 px**: nenhuma página com rolagem horizontal da página. Teste: `tests/e2e/overflow.spec.ts` (W4-T1) percorre as rotas públicas e as telas do Estúdio tocadas em 320×640 e verifica `document.documentElement.scrollWidth <= innerWidth`.
3. **Foco depois de mudança dinâmica** (remover favorito, fechar diálogo, toast, carregar mais): o foco nunca cai no `body`. Testes nas tarefas W2-T7, W2-T8, W1-T3 e W4-T4 verificam `document.activeElement`.
4. **Sem JavaScript**: filtros, paginação "Carregar mais" e formulários GET continuam funcionando como links ou forms. Teste: W1-T3 garante que "Carregar mais" é `<a href>`; W2-T1 garante que `Select` funciona em form GET sem handler.
5. **Texto longo em pt-BR** (e-mail longo, nome de fonte com 60 caracteres, rótulos de papel): nada estoura o contêiner. Testes de componente com strings de 80 caracteres em `StatusBadge`, `Table`, `StudioScreen` e no cabeçalho do Estúdio (W2-T4, W2-T5, W3-T6).

---

## Fase 1 · W1 · Erros e riscos

Branch: `claude/ux-w1`. Todas as tarefas são `[paralelo]`. Só `src/styles/tokens.css` e `globals.css` são tocados por mais de uma (T1, T7 e T9, em trechos diferentes): integrar essas três em sequência no branch da onda, resolvendo o conflito de texto se houver.

### Task W1-T1: Modo escuro (itens 1, 2, 3) `[paralelo]`

**Files:**
- Modify: `src/styles/tokens.css` (claro: `--surface-hover: var(--cn-nevoa-2)`; escuro: `--surface-hover: #1b2638`, `--cn-urucum-soft: #2e1810`)
- Modify: `src/styles/globals.css` (`--color-hover: var(--surface-hover)`; utilitário `plate-edge` = `border border-transparent` no claro e `border-line-subtle` no escuro)
- Modify: todos os arquivos com `hover:bg-nevoa-2`, `aria-pressed:bg-nevoa-2`, `bg-nevoa-2` (listar com `rg -l "nevoa-2" src`) → `hover:bg-hover` etc.; disabled do `Button` passa a `bg-section`
- Modify: `src/app/layout.tsx` (`themeColor` escuro = valor de `--bg-page` escuro, `#0b1320`)
- Modify: placas `bg-tinta` (`OriginLabel`, `SiteFooter`, `VideoLowerThird`, `PushPreview`, `NotificationBell`) com `plate-edge`
- Test: `src/styles/tokens.test.ts` (criar ou estender), `tests/a11y/dark-interactive.spec.ts`

**Interfaces:**
- Produces: classe `bg-hover` / `hover:bg-hover` (token `--surface-hover`), utilitário `plate-edge`. W2-T11 proíbe `nevoa-2` em estado interativo pelo lint.

- [ ] **Step 1: Teste de token falhando**

```ts
it("modo escuro redefine --surface-hover e --cn-urucum-soft", () => {
  const dark = darkBlock(readFileSync("src/styles/tokens.css", "utf8"));
  expect(dark).toMatch(/--surface-hover:\s*#1b2638/);
  expect(dark).toMatch(/--cn-urucum-soft:\s*#2e1810/);
});
it("contraste do texto forte sobre hover escuro ≥ 4.5", () => {
  expect(contrast("#e9edf3", "#1b2638")).toBeGreaterThanOrEqual(4.5);
  expect(contrast("#f39a78", "#2e1810")).toBeGreaterThanOrEqual(4.5);
});
it("nenhum nevoa-2 em estado interativo", () => {
  expect(rg(/(hover|aria-pressed|aria-\[current=page\]):bg-nevoa-2/, "src")).toEqual([]);
});
```

(`darkBlock`, `contrast` e `rg` são helpers locais do teste: recorte do bloco `@media (prefers-color-scheme: dark)`/`[data-theme=dark]`, fórmula WCAG de luminância relativa e busca com `fs` recursivo.)

- [ ] **Step 2:** `pnpm vitest run src/styles/tokens.test.ts` → FAIL.
- [ ] **Step 3:** Tokens, utilitários e migração das classes (substituição mecânica `nevoa-2` → `hover` só em prefixos de estado; `bg-nevoa-2` de fundo estático vira `bg-section`).
- [ ] **Step 4:** `tests/a11y/dark-interactive.spec.ts` @a11y: em `colorScheme: "dark"`, `hover()` no primeiro `NewsCard`, num `Chip` e numa aba de `/explorar`, axe `color-contrast` sem violação.
- [ ] **Step 5:** `pnpm vitest run src/styles` PASS; `pnpm verify` verde; commit `fix(design): hover e nota de correção legíveis no modo escuro [UX-W1-T1]`.

### Task W1-T2: Integridade do editor (itens 4, 5, 6) `[paralelo]`

**Files:**
- Modify: `src/components/studio/ArticleEditor.tsx` (expor `onDirtyChange(dirty: boolean)`; em conflito, gravar rascunho local antes de `router.refresh()` e mostrar aviso com "Restaurar meu texto"; `readOnly` repassado a todos os campos)
- Modify: `src/components/studio/PublishDialog.tsx` (prop `dirty: boolean` e `onSaveFirst: () => Promise<boolean>`; com `dirty`, o botão vira "Salvar e publicar")
- Modify: `src/app/estudio/materias/[id]/page.tsx` e o client wrapper que liga editor e diálogo (criar `src/components/studio/editor/EditorWithPublish.tsx` se não houver)
- Modify: `src/components/ui/Select.tsx` (`disabled?: boolean`)
- Create: `src/lib/studio/draft-store.ts` — `saveDraft(articleId: string, data: DraftData): void`, `loadDraft(articleId: string): DraftData | null`, `clearDraft(articleId: string): void` (localStorage, chave `cn:draft:<id>`, try/catch)
- Test: `src/components/studio/ArticleEditor.test.tsx`, `src/components/studio/PublishDialog.test.tsx` (estender), `src/lib/studio/draft-store.test.ts`, `src/components/ui/Select.test.tsx`

**Interfaces:**
- Produces: `draft-store` (usado por W3-T2 para o rascunho automático); `Select.disabled`; `ArticleEditor` props `onDirtyChange`.

- [ ] **Step 1: Testes falhando**

```tsx
it("com edição pendente, o diálogo oferece Salvar e publicar", async () => {
  render(<PublishDialog {...base} dirty onSaveFirst={vi.fn().mockResolvedValue(true)} />);
  expect(screen.getByRole("button", { name: "Salvar e publicar" })).toBeInTheDocument();
});
it("se salvar falhar, não publica", async () => {
  const publish = vi.fn();
  render(<PublishDialog {...base} dirty onSaveFirst={vi.fn().mockResolvedValue(false)} action={publish} />);
  await user.click(screen.getByRole("button", { name: "Salvar e publicar" }));
  expect(publish).not.toHaveBeenCalled();
});
it("conflito: recarregar guarda o texto local e oferece restaurar", async () => {
  /* render com conflito simulado; clica "Recarregar" */
  expect(loadDraft("a1")?.body).toBe("texto local");
  expect(screen.getByRole("button", { name: "Restaurar meu texto" })).toBeInTheDocument();
});
it("modo leitura desabilita todos os campos", () => {
  render(<ArticleEditor {...base} readOnly />);
  for (const el of screen.getAllByRole("combobox")) expect(el).toBeDisabled();
  for (const el of screen.getAllByRole("textbox")) expect(el).toHaveAttribute("readonly");
});
it("Select desabilitado", () => {
  render(<Select id="s" name="s" label="Editoria" options={[]} disabled />);
  expect(screen.getByLabelText("Editoria")).toBeDisabled();
});
```

- [ ] **Step 2:** rodar os testes → FAIL.
- [ ] **Step 3:** implementar; textos novos em `src/content/pt-BR/studio.ts` (`saveAndPublish: "Salvar e publicar"`, `restoreDraft: "Restaurar meu texto"`, `draftKept: "Guardamos o seu texto neste aparelho."`).
- [ ] **Step 4:** testes PASS; `pnpm verify`; commit `fix(estudio): publicar nunca descarta edição e conflito guarda o texto [UX-W1-T2]`.

### Task W1-T3: Listas que cortam em 100 (itens 7, 8) `[paralelo]`

**Files:**
- Modify: `src/lib/db/queries/queue.ts` — `listQueue(filters, { limit = 100, cursor }: { limit?: number; cursor?: string }): Promise<{ rows: QueueRow[]; total: number; nextCursor: string | null }>` (cursor opaco = base64 de `updated_at|id`)
- Modify: `src/app/estudio/fila/page.tsx` (lê `?cursor=`; mostra `QUEUE_TEXT.showing(rows.length, total)` e link "Carregar mais" com `cursor`)
- Modify: `src/lib/db/queries/agenda*.ts` (função que serve `/agenda`; mesmo contrato `{ rows, total, nextCursor }`) e `src/app/(public)/agenda/page.tsx`
- Create: `src/components/ui/LoadMore.tsx` — `LoadMore({ href, shown, total, label }: { href: string | null; shown: number; total: number; label: string })` (Server Component; `<p>` com contagem + `<a>`; foco devolvido pela âncora `#mais-<n>` no primeiro item novo)
- Test: `tests/integration/queue-pagination.test.ts`, `tests/integration/agenda-pagination.test.ts`, `src/components/ui/LoadMore.test.tsx`

**Interfaces:**
- Produces: `LoadMore` (W2-T5 `Pagination` não substitui: um é "carregar mais", o outro é paginação numerada).

- [ ] **Step 1:** testes falhando: com 130 itens no seed de teste, `listQueue({}, { limit: 100 })` devolve `rows.length === 100`, `total === 130`, `nextCursor !== null`; com o cursor, devolve os 30 restantes sem repetir ids. `LoadMore` com `href=null` não renderiza link; com href, link com texto "Carregar mais" e contagem "Mostrando 100 de 130".
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + `pnpm verify`. **Step 5:** commit `fix: fila e agenda mostram o total e carregam mais [UX-W1-T3]`.

### Task W1-T4: Cor como único sinal (itens 9, 10) `[paralelo]`

**Files:**
- Modify: `src/components/studio/QueueTable.tsx` (prazo vencido: `Icon clock` + texto visível `QUEUE_TEXT.overdue`)
- Modify: `src/app/estudio/calendario/page.tsx` (dia atual: rótulo visível "Hoje" + `aria-current="date"`)
- Modify: `src/components/editorial/AgendaCalendar.tsx` (`aria-current="date"` + `<span class="sr-only">hoje</span>`)
- Test: `src/components/studio/QueueTable.test.tsx` (criar), `src/components/editorial/AgendaCalendar.test.tsx`

- [ ] **Step 1:** testes: linha com `dueAt` no passado mostra o texto "Atrasada" visível (não `sr-only`: `expect(el).not.toHaveClass("sr-only")`); a célula do dia de hoje tem `aria-current="date"` e contém "hoje".
- [ ] **Step 2–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `fix(a11y): atraso e hoje com texto, não só cor [UX-W1-T4]`.

### Task W1-T5: Consentimento (itens 11, 12) `[paralelo]`

**Files:**
- Modify: `src/components/editorial/ConsentBanner.tsx` (texto `type-body-sm` 14 px sem `line-clamp` ou com botão "Ler tudo"; link `min-h-tap`; botões 14 px)
- Modify: `src/content/pt-BR/privacy.ts` (`acceptAll: "Aceitar métricas e recomendações"`)
- Test: `src/components/editorial/ConsentBanner.test.tsx`, `tests/e2e/privacy.spec.ts` (atualizar o nome do botão onde citado)

- [ ] **Step 1:** teste: botão `"Aceitar métricas e recomendações"` grava `{metrics: true, personalization: true}`; o link "Saiba mais" tem a classe `min-h-tap`; o parágrafo não tem `line-clamp-2`.
- [ ] **Step 2–4:** FAIL → implementar → PASS + `rg "Aceitar recomendações" tests src` vazio + `pnpm verify`. **Step 5:** commit `fix(privacidade): banner legível e botão diz o que liga [UX-W1-T5]`.

### Task W1-T6: Ticker sem movimento automático (item 13) `[paralelo]`

**Files:**
- Modify: `src/components/editorial/NewsTicker.tsx` (padrão = lista com rolagem manual, `snap-x`; manchete em caixa de frase, 14 px; se mantiver animação opcional, botão "Pausar"/"Continuar" `size-tap` com `aria-pressed`)
- Modify: `src/content/pt-BR/ticker.ts`
- Test: `src/components/editorial/NewsTicker.test.tsx`

- [ ] **Step 1:** teste: sem `animate-ticker` na primeira renderização; títulos sem `uppercase`; nenhum elemento com `aria-live`.
- [ ] **Step 2–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `fix(portal): ticker sem rolagem automática [UX-W1-T6]`.

### Task W1-T7: Colunas fixas e área segura (itens 14, 15) `[paralelo]`

**Files:**
- Modify: `src/styles/tokens.css` (`--h-sticky-public` igual à altura real do cabeçalho + 16 px de folga; medir no navegador e registrar o valor)
- Modify: `src/styles/globals.css` (utilitário `top-sticky-public` = `top: var(--h-sticky-public)`; `pt-safe-top` = `padding-top: max(var(--space-1), env(safe-area-inset-top))`)
- Modify: as 6 páginas com `lg:sticky lg:top-6` (`materia/[slug]/page.tsx`, `[editoria]/page.tsx`, `fontes/[slug]/page.tsx`, `agenda/[slug]/page.tsx`, `pergunte/page.tsx`, `newsletter/page.tsx`) e `agenda/page.tsx` (`lg:top-40`) → `lg:top-sticky-public`
- Modify: `src/app/layout.tsx` (`viewport.viewportFit = "cover"`), `src/components/editorial/SiteHeader.tsx` (`pt-safe-top`)
- Test: `tests/e2e/sticky-rail.spec.ts` (desktop), `src/app/layout.test.ts` (viewport)

- [ ] **Step 1:** e2e desktop: em `/materia/<seed>`, rolar 1200 px; `boundingBox` do topo da coluna lateral ≥ `boundingBox` do fundo do cabeçalho. Unit: `viewport.viewportFit === "cover"`. `rg "lg:top-6|lg:top-40" src/app/(public)` vazio.
- [ ] **Step 2–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `fix(portal): colunas fixas abaixo do cabeçalho e área segura do iPhone [UX-W1-T7]`.

### Task W1-T8: Sinal do Lighthouse (itens 16, 17) `[paralelo]`

**Files:**
- Modify: `.github/workflows/lighthouse.yml` (gatilhos `push: branches: [main]` e `schedule: cron: "17 9 * * 1"`; remover `continue-on-error`; `upload-artifact` com `include-hidden-files: true`; resumo em passo próprio com `if: always()`)
- Modify: `lighthouserc.json` (`resource-summary:script:size` 175000 nas URLs que hoje medem 170–172 KB; comentário/registro em `A-141` com a meta da W5)
- Modify: `.planning/DECISIONS.md` (A-141: orçamento provisório 175 KB, meta ≤ 165 KB depois da W5-T5)
- Test: `tests/ci/lighthouse-config.test.ts`

- [ ] **Step 1:** teste lê o YAML (com `yaml`, já dependência, ou parse simples) e o JSON: `on.push.branches` contém `main`; job sem `continue-on-error`; passo de upload com `include-hidden-files: true`; passo de resumo com `if: always()`; orçamento ≤ 175000.
- [ ] **Step 2–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `ci(lighthouse): mede a main, falha visível e relatório salvo [UX-W1-T8]`.

### Task W1-T9: CSS global em camada (item 18) `[paralelo]`

**Files:**
- Modify: `src/styles/tokens.css` (envolver as regras `:where(...):focus-visible`, `:where(h1,h2,h3)`, `:where(p)` em `@layer base`)
- Modify: `src/styles/globals.css` (`control-field`: tirar `!important`)
- Modify: `src/components/studio/StudioMobileNav.tsx` (`StudioPageTitle` pode voltar a `<p>`; manter `span` é aceitável, remover o comentário de contorno)
- Test: `tests/e2e/focus-ring.spec.ts`

- [ ] **Step 1:** e2e: Tab até um `card-link` em `/` → só um elemento com `outline-style != none` entre o card e o título; Tab até o campo de busca em `/busca` → o `input` tem `outline-style: none` e o contêiner `control-field` tem outline; um `<p class="truncate">` de teste em `/design-system` tem `white-space: nowrap`.
- [ ] **Step 2–4:** FAIL → implementar → PASS + `pnpm verify` (o `tests/e2e/keyboard.spec.ts` existente precisa continuar verde). **Step 5:** commit `fix(css): regras globais em @layer base [UX-W1-T9]`.

### Task W1-T10: Correções pequenas de comportamento (itens 19–23) `[paralelo]`

**Files:**
- Modify: `src/app/estudio/fila/[id]/page.tsx` (usar `a.sensitive`, não `slug === "seguranca"`)
- Modify: `src/components/studio/LiveMonitor.tsx` (relógio fora da região viva; região só com mudanças de estado)
- Modify: `src/app/(public)/pergunte/page.tsx` + `src/content/pt-BR/ask.ts` (`limitNoTime`)
- Modify: `materia/[slug]/page.tsx`, `assunto/[slug]/page.tsx`, `TopicSummaryCard.tsx`, `SearchResults.tsx` (remover `TopicStatus`)
- Modify: `src/components/editorial/UrgentBar.tsx` (`role="region"` + `aria-label`), `NowList.tsx` (sem `aria-live`)
- Test: `src/app/estudio/fila/[id]/sensitive.test.ts`, `LiveMonitor.test.tsx`, `src/content/pt-BR/ask.test.ts`, `src/app/(public)/no-topic-status.test.ts`

- [ ] **Step 1:** testes: a revisão de um item com `sensitive=true` e editoria `cidade` mostra o alerta de tema sensível; `LiveMonitor` não tem `aria-live` no nó do relógio; `ASK_TEXT.limit("")` não contém "às ."; nenhum arquivo em `src/app/(public)` importa `TopicStatus`; `UrgentBar` sem `role="alert"`.
- [ ] **Step 2–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `fix: tema sensível único, regiões vivas e textos [UX-W1-T10]`.

### Task W1-T11: Confirmar ações sensíveis (item 24) `[paralelo]`

**Files:**
- Modify: `src/components/studio/admin/StaffTable.tsx` (revogação abre `Dialog` com nome e efeito; botão "Revogar acesso de {nome}")
- Modify: `src/components/studio/admin/SecurityPanel.tsx` (mesma confirmação)
- Modify: `src/content/pt-BR/admin.ts`
- Test: `src/components/studio/admin/StaffTable.test.tsx`

- [ ] **Step 1:** teste: clicar "Aplicar revogação" não chama a action; abre diálogo com o nome da pessoa; confirmar chama a action uma vez; Cancelar fecha sem chamar.
- [ ] **Step 2–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `fix(estudio): revogar e ações de segurança pedem confirmação [UX-W1-T11]`.

### Fechamento da W1

- [ ] Integrar os 11 branches no `claude/ux-w1`, `pnpm verify`, revisão de branch (superpowers:requesting-code-review), PR, CI verde, merge.

---

## Fase 2 · W2 · Fundações do design system

Branch: `claude/ux-w2`. Ordem: **W2-T1 sozinha** (mexe em muitos arquivos), depois **W2-T2 a W2-T10 em paralelo** (primitivas novas, arquivos disjuntos), depois **W2-T11 a W2-T14 em paralelo** (migrações por área), por fim **W2-T15** (lint e docs).

### Task W2-T1: Rótulo de campo em 16 px (item 29)

**Files:**
- Modify: `src/styles/tokens.css` (`--type-label: 600 var(--fs-16)/1.25 var(--font-sans)` conforme R9)
- Modify: todos os arquivos com `type-label text-16` (remover `text-16`; `rg -l "type-label text-16" src`)
- Modify: `src/components/ui/Dialog.tsx` (título com `type-nav-title` no lugar de `text-18 font-semibold leading-snug`)
- Test: `src/styles/tokens.test.ts`

- [ ] **Step 1:** teste: `--type-label` usa `--fs-16`; `rg "type-label text-16" src` vazio.
- [ ] **Step 2–4:** FAIL → implementar (substituição mecânica) → PASS + `pnpm verify`. **Step 5:** commit `refactor(ui): rótulo de campo em 16 px pelo papel tipográfico [UX-W2-T1]`.

### Task W2-T2: Primitivas de formulário (itens 25, 26, 27, 28) `[paralelo]`

**Files:**
- Create: `src/components/ui/Field.tsx` — `describedBy(id: string, hint?: ReactNode, error?: string | null): string | undefined`; `FieldShell({ id, label, hint, error, required, aside, children, className })` (mover de `studio/sources/fields.tsx`; erro com `Icon circle-alert` 16 px e `id="<id>-erro"`, dica `id="<id>-dica"`)
- Modify: `src/components/ui/Select.tsx` — adicionar `size?: "sm" | "md"` (sm = `h-tap` compacto de tabela), `groups?: readonly { label: string; options: readonly SelectOption[] }[]`, `disabled` (de W1-T2); usar `FieldShell`; `control-field` aplicado ao contêiner
- Create: `src/components/ui/TextArea.tsx` — `TextArea({ id, name, label, value?, defaultValue?, onChange?: (v: string) => void, rows?: number, maxLength?: number, hint?, error?, required?, readOnly?, disabled?, className? })` (mostra contador quando `maxLength`)
- Create: `src/components/ui/DateField.tsx` — `DateField({ id, name, label, type?: "date" | "datetime-local" | "time", value?, defaultValue?, onChange?, min?, max?, hint?, error?, required?, disabled? })`
- Create: `src/components/ui/Checkbox.tsx` — `Checkbox({ id?, name, label, checked?, defaultChecked?, onChange?: (c: boolean) => void, hint?, disabled?, value? })` (caixa 20 px, linha `min-h-tap`, `accent-(--action-primary)`)
- Create: `src/components/ui/RadioGroup.tsx` — `RadioGroup({ name, legend, options: readonly { value: string; label: string; hint?: string }[], value?, defaultValue?, onChange?, error? })` (`fieldset`/`legend`)
- Modify: `src/styles/globals.css` (`control-field` cobre `select` e `textarea`)
- Modify: `src/components/index.ts` (exportar tudo)
- Modify: `src/components/studio/sources/fields.tsx` (reexporta `FieldShell`/`describedBy` de `ui/Field` temporariamente; `NativeSelect` vira wrapper de `Select size="sm"`, removido em W2-T11)
- Test: `src/components/ui/{Field,Select,TextArea,DateField,Checkbox,RadioGroup}.test.tsx`

**Interfaces:**
- Produces: as assinaturas acima; migrações W2-T11 a W2-T14 e W3/W4 usam só elas.

- [ ] **Step 1:** testes por componente: rótulo associado (`getByLabelText`); com `error`, `aria-invalid="true"` e `aria-describedby` contém `<id>-erro` e a mensagem é o texto desse id; com `hint` e `error`, `aria-describedby` tem os dois ids; `Select` com `groups` renderiza `optgroup`; `Select` sem `onChange` dentro de `<form method="get">` envia o valor (`new FormData(form).get(name)`); `TextArea` com `maxLength=120` mostra "0/120" e atualiza; `RadioGroup` tem `group` com nome da legenda; `Checkbox` alterna e chama `onChange(true)`.
- [ ] **Step 2–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `feat(ui): primitivas de formulário com erro ligado ao campo [UX-W2-T2]`.

### Task W2-T3: Painel, estatísticas e utilitários (itens 30, 41) `[paralelo]`

**Files:**
- Create: `src/components/ui/Panel.tsx` — `Panel({ as?: "section" | "div" | "article", tone?: "white" | "section", pad?: "sm" | "md" | "lg", children, className, "aria-labelledby"? })` (`rounded-lg border border-line-subtle`; white = `bg-card-white`, section = `bg-section`; pad sm/md/lg = p-3/p-4/p-6)
- Create: `src/components/ui/StatGrid.tsx` — `StatGrid({ items: readonly { label: string; value: ReactNode; hint?: ReactNode; href?: string }[], columns?: 2 | 3 | 4 | 5 })` (`<dl>`; item com `href` vira link com `min-h-tap`)
- Modify: `src/styles/globals.css` — utilitários `grid-rail` (`lg:grid-cols-[minmax(0,1fr)_var(--layout-rail)]`), `table-sm|md|lg|xl` (min-width 36/44/52/64rem)
- Test: `src/components/ui/Panel.test.tsx`, `src/components/ui/StatGrid.test.tsx`

- [ ] **Step 1:** testes: `Panel` renderiza a tag pedida e as classes de tom/pad; `StatGrid` renderiza `dt`/`dd` pareados e link quando `href`; valor com 80 caracteres quebra (`break-words`).
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(ui): Panel, StatGrid e utilitários de layout [UX-W2-T3]`.

### Task W2-T4: StatusBadge (item 31) `[paralelo]`

**Files:**
- Create: `src/components/ui/StatusBadge.tsx` — `type StatusTone = "success" | "warn" | "danger" | "info" | "neutral" | "ai" | "correction"`; `StatusBadge({ tone, icon, children, size?: "sm" | "md" })` (par `bg-*-soft text-*` por tom, ícone obrigatório para não depender de cor)
- Modify: `src/components/studio/sources/SourceStatusBadge.tsx`, `src/components/studio/push/PushStatusBadge.tsx` (viram mapas `status → { tone, icon, label }` sobre `StatusBadge`)
- Test: `src/components/ui/StatusBadge.test.tsx` e os testes existentes dos dois selos

- [ ] **Step 1:** testes: cada tom aplica as classes esperadas; ícone presente (`svg[aria-hidden]`); texto de 80 caracteres não estoura (`max-w-full truncate` com `title`).
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(ui): StatusBadge único [UX-W2-T4]`.

### Task W2-T5: Tabela e paginação (itens 32, 43) `[paralelo]`

**Files:**
- Create: `src/components/ui/Table.tsx` — `Table({ caption: string; headers: readonly (string | { label: string; srOnly?: boolean; align?: "left" | "right" })[]; minWidth?: "sm" | "md" | "lg" | "xl"; children; captionVisible?: boolean })` (região rolável `tabIndex=0` com `aria-label=caption`, `th scope="col"`, cabeçalho `type-meta text-meta`)
- Create: `src/components/ui/Pagination.tsx` — `Pagination({ page: number; totalPages: number; hrefFor: (p: number) => string; label: string })` (`nav` com anterior/próxima e "Página X de Y"; links, sem JS)
- Modify: `src/components/studio/admin/AdminStatus.tsx` (`AdminTable` vira wrapper de `Table`)
- Test: `src/components/ui/Table.test.tsx`, `src/components/ui/Pagination.test.tsx`

- [ ] **Step 1:** testes: `table` com `caption` (sr-only por padrão), região focável com nome; `th` com `scope="col"`; `Pagination` na página 1 sem link "Anterior", na última sem "Próxima", `aria-current="page"` no número atual.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(ui): Table e Pagination [UX-W2-T5]`.

### Task W2-T6: Botões de envio e destrutivos (itens 34, 35) `[paralelo]`

**Files:**
- Modify: `src/components/ui/Button.tsx` — `loading?: boolean` (desabilita, `aria-busy`, mostra `loadingLabel ?? "Salvando…"`), `loadingLabel?: string`, nova variante `"destructive"` (`bg-danger text-on-inverse` sólido, contraste verificado nos dois temas)
- Create: `src/components/ui/SubmitButton.tsx` — `"use client"`; `SubmitButton(props: Omit<ButtonProps, "type" | "loading"> & { pendingLabel?: string })` usando `useFormStatus`
- Create: `src/components/ui/ConfirmDialog.tsx` — `ConfirmDialog({ open, title, body, confirmLabel, onConfirm: () => void | Promise<void>, onClose, destructive?: boolean, pending?: boolean })` (Cancelar à esquerda, ação à direita; ação com verbo)
- Test: `Button.test.tsx`, `SubmitButton.test.tsx`, `ConfirmDialog.test.tsx`

- [ ] **Step 1:** testes: `loading` → `aria-busy="true"`, `disabled`, texto "Salvando…"; `destructive` com classe `bg-danger`; `SubmitButton` desabilita durante envio (mock `useFormStatus` com `pending: true`); `ConfirmDialog` ordem dos botões (Cancelar primeiro no DOM) e `onConfirm` chamado uma vez com cliques duplos.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(ui): botão com carregamento, SubmitButton e ConfirmDialog [UX-W2-T6]`.

### Task W2-T7: Toast e região viva (itens 36, 39) `[paralelo]`

**Files:**
- Create: `src/components/ui/Toast.tsx` — `ToastProvider({ children })`, `useToast(): { show(t: { message: string; tone?: "success" | "error" | "info"; action?: { label: string; onClick: () => void }; durationMs?: number }): void }` (região `role="status"` sempre montada; some em 6 s; pausa com hover/foco; `z-toast`; acima da barra inferior e da área segura)
- Create: `src/components/ui/FormStatus.tsx` — `FormStatus({ id?, tone, message })` (contêiner sempre montado com `role="status"` ou `role="alert"` conforme tom, `empty:hidden`)
- Modify: `src/app/estudio/layout.tsx` e `src/app/(public)/layout.tsx` (montar `ToastProvider`)
- Test: `Toast.test.tsx`, `FormStatus.test.tsx`

- [ ] **Step 1:** testes (fake timers): `show` → mensagem no `status`; some depois de 6 s; com foco no botão de ação não some; ação "Desfazer" chama `onClick` e fecha; `FormStatus` com mensagem vazia continua no DOM.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(ui): Toast e FormStatus [UX-W2-T7]`.

### Task W2-T8: Popover, menu, gaveta e diálogo (itens 37, 38) `[paralelo]`

**Files:**
- Create: `src/components/ui/Popover.tsx` — `Popover({ trigger: (p: { ref; props }) => ReactNode, children, label: string, align?: "start" | "end" })` (clique fora, Esc, foco devolvido ao gatilho, `aria-expanded`/`aria-controls`; `position: fixed` no celular como o sino faz hoje)
- Create: `src/components/ui/Menu.tsx` — `Menu({ label, items: readonly { label: string; onSelect: () => void; destructive?: boolean; icon?: IconName }[], trigger })` sobre `Popover` (`role="menu"`, setas, Home/End)
- Create: `src/components/ui/Drawer.tsx` — `Drawer({ open, onClose, title, side?: "left" | "right", children, footer? })` (`<dialog>` modal, `animate-drawer-in`, trava de rolagem, área segura; extraído de `StudioMobileNav`)
- Modify: `src/components/ui/Dialog.tsx` (chamar `close()` antes de desmontar; devolver foco ao elemento ativo anterior; `aria-describedby` para o corpo)
- Modify: `src/components/studio/StudioMobileNav.tsx` (usar `Drawer`)
- Test: `Popover.test.tsx`, `Menu.test.tsx`, `Drawer.test.tsx`, `Dialog.test.tsx`, `StudioMobileNav.test.tsx` (existente continua verde)

- [ ] **Step 1:** testes: Esc fecha e devolve o foco ao gatilho; clique fora fecha; `Menu` com seta para baixo move o foco; `Dialog` fechado devolve o foco ao botão que abriu; `aria-describedby` aponta para o corpo.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(ui): Popover, Menu, Drawer e Dialog que devolve o foco [UX-W2-T8]`.

### Task W2-T9: Pílulas de link, abas por rota e voltar com origem (itens 33, 58 base) `[paralelo]`

**Files:**
- Create: `src/components/ui/TagLink.tsx` — `TagLink({ href, children, active?: boolean, icon?: IconName })` (pílula `min-h-tap rounded-pill bg-section px-4 text-14 font-semibold hover:bg-hover`)
- Create: `src/components/ui/LinkTabs.tsx` — `LinkTabs({ label, items: readonly { href: string; label: string; count?: number; current?: boolean }[] })` (`nav` com `aria-current="page"`, rolagem horizontal com `scroll-fade`)
- Create: `src/lib/studio/origin.ts` — `withOrigin(href: string, origin: string): string` (anexa `?de=`), `originFrom(searchParams: Record<string, string | string[] | undefined>, fallback: string): string` (aceita só caminhos internos `/estudio...`)
- Test: `TagLink.test.tsx`, `LinkTabs.test.tsx`, `src/lib/studio/origin.test.ts`

- [ ] **Step 1:** testes: `originFrom({ de: "https://mal.example" }, "/estudio/fila")` devolve o fallback; `originFrom({ de: "/estudio/fila?aba=mine" }, …)` devolve a origem; `LinkTabs` marca `aria-current` e mostra a contagem em texto.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(ui): TagLink, LinkTabs e origem segura [UX-W2-T9]`.

### Task W2-T10: Ícones e detalhes (itens 42, 44) `[paralelo]`

**Files:**
- Modify: `src/components/ui/Icon.tsx` (docstring com a escala 14/16/18/20/24; tipo `IconSize = 14 | 16 | 18 | 20 | 24`; 22 vira 20 ou 24 nos 5 usos)
- Modify: os 6 `color="var(--…)"` → `className="text-…"`
- Modify: `src/app/estudio/calendario/page.tsx:129`, `src/app/estudio/denuncias/page.tsx:164`, `src/components/editorial/guide/CriteriaNote.tsx:27` (sem `border-l-4`: selo/ícone)
- Modify: checkbox: `accent-action-primary` → `accent-(--action-primary)` em todo o código
- Modify: `src/components/ui/Skeleton.tsx` (formas `line`, `block`, `card`) e os `loading.tsx` com esqueleto cru
- Test: `src/components/ui/Icon.test.tsx`, `tests/lint/no-side-stripe.test.ts`

- [ ] **Step 1:** testes: `rg "border-l-4" src` vazio; `rg "accent-action-primary" src` vazio; `Icon size={22}` não compila (teste de tipo com `expectTypeOf`).
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `refactor(ui): escala de ícones, sem bordas laterais e esqueletos [UX-W2-T10]`.

### Task W2-T11: Migração — Estúdio Control Center e Fontes `[paralelo, após T2–T10]`

**Escopo:** `src/app/estudio/control/**`, `src/components/studio/{sources,RuleProposalForm,AgentTable,WeightSliders,PromptVersions,RecForms,ModelTable,JobTable,RunsTable,CostChart,KpiStrip,LogExplorer,EvalRunner,Playground,SwitchBoard,ContingencyPanel,ApprovalInbox}*`.

- [ ] Trocar `NativeSelect`, `CONTROL`, `<select>`/`<textarea>`/`<input type=date|checkbox|radio>` crus por `Select`/`TextArea`/`DateField`/`Checkbox`/`RadioGroup`; cards por `Panel`; `<dl>` de estatística por `StatGrid`; tabelas por `Table`; paginação por `Pagination`; selos por `StatusBadge`; menus de linha por `Menu`; confirmações por `ConfirmDialog`; status locais por `useToast`/`FormStatus`.
- [ ] Apagar `NativeSelect` e `SelectField` de `studio/sources/fields.tsx` quando não houver mais uso (`rg "NativeSelect" src` vazio).
- [ ] Testes existentes verdes; `pnpm verify`; commit `refactor(estudio): Control Center nas primitivas do kit [UX-W2-T11]`.

### Task W2-T12: Migração — Estúdio Redação e Administração `[paralelo, após T2–T10]`

**Escopo:** `src/app/estudio/{page.tsx,fila,materias,correcoes,midia,denuncias,calendario,agenda,notificacoes,admin}/**`, `src/components/studio/{QueueTable,QueueFilters,DecisionPanel,PublishDialog,ArticleEditor,CorrectionForm,ImageApproval,MediaGrid,ReportResponder,SubmissionReview,LicenseActions,GenerateImageDrawer,admin/**,push/**,featured/**,editor/**}`.

- [ ] Mesmas trocas da W2-T11; `GenerateImageDrawer` e `PublishDialog` sobre `Drawer`/`Dialog`; `NotificationBell` sobre `Popover`.
- [ ] `pnpm verify`; commit `refactor(estudio): Redação e Administração nas primitivas do kit [UX-W2-T12]`.

### Task W2-T13: Migração — portal `[paralelo, após T2–T10]`

**Escopo:** `src/app/(public)/**`, `src/components/editorial/**`, `src/app/global-error-body.tsx`.

- [ ] Pílulas de link → `TagLink`; pílulas primárias feitas à mão → `Button`; `LoginInvite` e `IosInstallSteps` → `Dialog`/`BottomSheet`; formulários de conta (`SignInForm`, `SignUpForm`, `AccountForms`) com `FormStatus`; `DismissMenu`/`SourceRowMenu` → `Menu`; `TopicCoverage` select → `Select`; `FilterBar` mantém o select em pílula (decisão registrada em A-142: é o controle de filtro público, com variante `Select size="pill"` se a migração couber sem mudar o visual).
- [ ] `pnpm verify` + `pnpm test:e2e --project=mobile --grep "busca|agenda|editoria|fontes|conta"` quando a pilha local estiver de pé; commit `refactor(portal): portal nas primitivas do kit [UX-W2-T13]`.

### Task W2-T14: Migração — gráficos, guia e restante `[paralelo, após T2–T10]`

**Escopo:** o que sobrar em `rg -l "<select|<textarea|rounded-lg border border-line-subtle bg-card-white p-4|<table" src --glob '!src/components/ui/**'` depois de T11–T13, incluindo `src/components/editorial/guide/**`, `src/app/estudio/admin/guia/**`.

- [ ] Migrar; zero resultado para `<select` e `<textarea` fora de `ui/`; `pnpm verify`; commit `refactor: restante nas primitivas do kit [UX-W2-T14]`.

### Task W2-T15: Lint e documentação (item 40, fecha 43)

**Files:**
- Modify: `eslint.config.mjs` (regra de aderência em `src/app/**`; `no-restricted-syntax` para JSX `select`/`textarea` fora de `src/components/ui/**`; regex de className proibindo `(hover|aria-pressed|aria-\\[current=page\\]):bg-nevoa(-2)?`)
- Modify: `DESIGN.md` §7 (inventário real: Field, Select, TextArea, DateField, Checkbox, RadioGroup, Panel, StatGrid, StatusBadge, Table, Pagination, LoadMore, TagLink, LinkTabs, Button loading/destructive, SubmitButton, ConfirmDialog, Toast, FormStatus, Popover, Menu, Drawer; remover o que não existe)
- Test: `tests/lint/eslint-rules.test.ts` (roda ESLint em fixtures com `<select>` cru em `src/app` e espera erro)

- [ ] **Step 1–4:** teste FAIL → regra → PASS; `pnpm lint` verde no repositório inteiro. **Step 5:** commit `chore(lint): aderência ao kit em src/app e DESIGN §7 atualizado [UX-W2-T15]`.

### Fechamento da W2

- [ ] `pnpm verify`, axe nas telas do Estúdio e do portal (`pnpm test:a11y`), revisão de branch, PR, CI verde, merge.

---

## Fase 3 · W3 · Fluxos do Estúdio (paralela à W4)

Branch: `claude/ux-w3`. Tarefas `[paralelo]` com arquivos disjuntos.

### Task W3-T1: Decisão rápida (itens 45, 46, 55, 56) `[paralelo]`

**Files:**
- Modify: `src/components/studio/DecisionPanel.tsx` (abaixo de `xl`, ações numa barra `fixed inset-x-0 bottom-0 z-sticky pb-safe` com Aprovar, Pedir ajuste e menu "Mais"; espaço reservado no fim da página)
- Modify: `src/app/estudio/fila/[id]/page.tsx` (link de volta `originFrom`; "Aprovar e ir para o próximo" usa `nextQueueItem(filters, currentId): Promise<string | null>`)
- Create: `src/lib/db/queries/queue-next.ts` — `nextQueueItem(filters: QueueFilters, afterId: string): Promise<string | null>` (mesma ordenação de `listQueue`)
- Modify: `src/app/estudio/fila/actions.ts` — `approveRecommended(ids: string[]): Promise<{ approved: number; skipped: { id: string; reason: string }[] }>` (aprova só itens cuja decisão de regras é `recommend_publish`; auditoria `article.bulk_approve`)
- Modify: `src/components/studio/QueueTable.tsx` (justificativa visível em uma linha com "ver mais" em `details`; barra de lote só com seleção, fixa no rodapé no celular; estado com `StatusBadge`; versão em cartões abaixo de `md`)
- Modify: `src/components/studio/ImageApproval.tsx` + `MediaGrid.tsx` (seleção múltipla e "Aprovar selecionadas")
- Test: `QueueTable.test.tsx`, `DecisionPanel.test.tsx`, `tests/integration/queue-next.test.ts`, `tests/integration/approve-recommended.test.ts`, `tests/e2e/queue-flow.spec.ts` (mobile: barra fixa visível sem rolar; aprovar e ir para o próximo mantém `?aba=` e filtros)

- [ ] **Step 1:** testes falhando (assertivas acima; `approveRecommended` com 3 itens, 1 sem recomendação → `approved: 2`, `skipped[0].reason === "not_recommended"`).
- [ ] **Step 2–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `feat(estudio): aprovar ao alcance, em sequência e em lote [UX-W3-T1]`.

### Task W3-T2: Formulários seguros (itens 47, 48, 49) `[paralelo]`

**Files:**
- Create: `src/lib/studio/use-unsaved-guard.ts` — `useUnsavedGuard(dirty: boolean, message?: string): void` (`beforeunload` + interceptação de cliques em `a[href]` internos com `confirm`)
- Modify: `ArticleEditor.tsx` (barra de salvar fixa com estado "Salvo às {hora}" / "Alterações não salvas"; rascunho automático com `draft-store` a cada 5 s com debounce; contador de título com o limite de `ARTICLE_LIMITS.title`), `CorrectionForm.tsx`, `admin/HomeModulesEditor.tsx`, `RuleProposalForm.tsx`, `sources/SourceConfigForm.tsx` (guard)
- Modify: `src/app/estudio/materias/[id]/page.tsx` (link de volta `originFrom`)
- Modify: `PublishDialog.tsx` (data mínima = agora; ao menos um destino; erro com `FormStatus`/`aria-describedby`)
- Test: `use-unsaved-guard.test.ts`, `ArticleEditor.test.tsx`, `PublishDialog.test.tsx`

- [ ] **Step 1:** testes: com `dirty=true`, disparar `beforeunload` define `returnValue`; clicar num link interno chama `confirm`; editar o título mostra "Alterações não salvas" e o contador "12/110"; agendar no passado mostra erro ligado ao campo e não envia; desmarcar todos os destinos desabilita "Publicar".
- [ ] **Step 2–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `feat(estudio): proteção de alterações, rascunho automático e validação da publicação [UX-W3-T2]`.

### Task W3-T3: Navegação do Estúdio (itens 50, 51, 60) `[paralelo]`

**Files:**
- Modify: `src/app/estudio/nav.ts`, `src/app/estudio/admin/nav.ts` (subgrupos do Control Center: "Operação", "IA", "Fontes e regras"; grupo "Governança" passa a "Administração"; "Governança da IA" e "Governança editorial" mantidos como itens; ícones únicos; nomes: Redação, Testar prompts, Registros; Contingência como primeiro item do Control Center com `emphasis: true`)
- Modify: `src/components/studio/StudioShell.tsx` (`StudioNavItem.count?: number`, `StudioNavGroup.subgroups?`) e `StudioNav.tsx` (busca no trilho do desktop com `filterStudioNav`; grupos recolhíveis com `<details>` lembrados em localStorage `cn:nav:<grupo>`; contagem em texto ao lado do rótulo)
- Create: `src/lib/db/queries/studio-counts.ts` — `studioCounts(roles: RoleGrant[]): Promise<{ exceptions: number; reportsOverdue: number; approvals: number; failures: number; mediaPending: number }>` (uma RPC ou `Promise.all`; nunca derruba a casca: erro → zeros)
- Modify: `src/app/estudio/layout.tsx` (passa as contagens a `studioNav`), `src/app/estudio/fila/page.tsx` + `QueueTabs.tsx` (contagem por aba)
- Modify: `src/content/pt-BR/studio.ts` e páginas com texto solto apontadas na auditoria (E-29)
- Test: `src/app/estudio/nav.test.ts` (estender), `StudioNav.test.tsx`, `tests/integration/studio-counts.test.ts`, `tests/e2e/studio-nav.spec.ts` (atualizar nomes citados nos e2e: `rg "Newsroom|Playground|\"Logs\"" tests`)

- [ ] **Step 1:** testes: nenhum ícone repetido em `studioNav(adminRoles)`; Contingência é o primeiro item do Control Center; item com `count: 3` mostra "3" em texto e nome acessível "Exceções, 3 pendentes"; busca "regis" no desktop acha "Registros".
- [ ] **Step 2–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `feat(estudio): menu reorganizado, com busca, subgrupos e contagens [UX-W3-T3]`.

### Task W3-T4: Tabelas críticas em cartões e Falhas (itens 52, 54) `[paralelo]`

**Files:**
- Modify: `src/components/studio/JobTable.tsx` (cartões abaixo de `md`; "Selecionar todas em quarentena"; agrupamento por `step` + mensagem normalizada com contagem; links para item e execução)
- Modify: `src/app/estudio/correcoes/page.tsx`, `src/components/studio/ApprovalInbox.tsx` (cartões abaixo de `md`)
- Create: `src/lib/control/group-failures.ts` — `groupFailures(jobs: readonly Job[]): { key: string; step: string; message: string; count: number; ids: string[] }[]` (normaliza números e ids na mensagem)
- Test: `group-failures.test.ts`, `JobTable.test.tsx`, `tests/e2e/control-failures.spec.ts` (mobile: cartões visíveis, sem rolagem horizontal)

- [ ] **Step 1:** testes: `groupFailures` junta "timeout after 3000ms on item 12" e "timeout after 3000ms on item 99"; "Selecionar todas em quarentena" marca só as em quarentena.
- [ ] **Step 2–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `feat(estudio): falhas agrupadas e tabelas críticas em cartões no celular [UX-W3-T4]`.

### Task W3-T5: Atalhos de teclado (item 53) `[paralelo]`

**Files:**
- Create: `src/lib/studio/use-hotkeys.ts` — `useHotkeys(map: Record<string, (e: KeyboardEvent) => void>, opts?: { enabled?: boolean }): void` (ignora `input`, `textarea`, `select`, `[contenteditable]`, exceto combinações com Ctrl/⌘)
- Create: `src/components/studio/HotkeysHelp.tsx` (diálogo aberto por `?`, lista os atalhos da tela)
- Modify: `QueueTable.tsx` (j/k move o foco entre linhas, Enter abre), `DecisionPanel.tsx` (a, r), `ArticleEditor.tsx` (Ctrl/⌘+S), `QueueFilters`/`CollapsibleFilters` (`/` foca o primeiro campo)
- Test: `use-hotkeys.test.ts`, `HotkeysHelp.test.tsx`

> Conflito de arquivo com W3-T1 e W3-T2: esta tarefa roda **depois** delas (mesma onda, segundo lote).

- [ ] **Step 1:** testes: `j` com foco num `input` não dispara; `Ctrl+S` dispara mesmo no campo; `?` abre a ajuda.
- [ ] **Step 2–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `feat(estudio): atalhos de teclado e ajuda [UX-W3-T5]`.

### Task W3-T6: Moldura de tela e Redação (itens 57, 58, 59) `[paralelo]`

**Files:**
- Create: `src/components/studio/StudioScreen.tsx` — `StudioScreen({ section: string; title: string; intro?: ReactNode; actions?: ReactNode; breadcrumbs?: readonly { href: string; label: string }[]; error?: ReactNode; children })`
- Modify: `src/app/estudio/admin/screen.tsx` (`AdminScreen` vira wrapper), páginas do Control Center com cabeçalho feito à mão, `fila/page.tsx`, `calendario/page.tsx`, detalhes `control/fontes/[id]/*` (breadcrumbs)
- Modify: `src/app/estudio/page.tsx` (abas → `TagLink` "Ver na Fila"; KPIs "Publicadas hoje" e "Agendadas" com `href`)
- Test: `StudioScreen.test.tsx` (título de 80 caracteres quebra; breadcrumb com `aria-label="Caminho"` e `aria-current` no último)

- [ ] **Step 1–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `feat(estudio): StudioScreen, caminho de navegação e Redação com links [UX-W3-T6]`.

### Task W3-T7: Papel de admin numa ação só (item 61) `[paralelo]`

**Files:**
- Create: `supabase/migrations/0154_role_grant_self_approval.sql` (para `approvals.kind = 'role.grant'` e `'role.revoke'`, aceitar `approved_by = requested_by` quando o solicitante tem `users.manage`; mantém auditoria; demais tipos inalterados — B-026 continua para eles)
- Modify: `src/app/estudio/admin/usuarios/actions.ts` (conceder/revogar: valida papel, grava `approvals` com quem pediu e aprovou, aplica e audita numa transação)
- Modify: `src/components/studio/admin/StaffTable.tsx` (um botão "Conceder papel" com `ConfirmDialog`)
- Modify: `.planning/DECISIONS.md` (A-143) e `.planning/BLOCKERS.md` (B-026: `role.grant` resolvido)
- Test: `tests/integration/role-grant.test.ts`, `StaffTable.test.tsx`

- [ ] **Step 1:** integração: admin concede `editor` a outro usuário numa chamada; `approvals` tem `requested_by = approved_by = admin`; `studio_audit` tem `role.grant`; usuário sem `users.manage` recebe erro e nada muda.
- [ ] **Step 2–4:** FAIL → migration + implementação → PASS (`pnpm db:reset` aplica 0154) + `pnpm verify`. **Step 5:** commit `feat(admin): conceder papel numa ação auditada (A-128) [UX-W3-T7]`. A migration em produção segue a regra de B-009 (registrar em DECISIONS ao aplicar).

### Fechamento da W3

- [ ] `pnpm verify`, `pnpm test:a11y`, revisão de branch, PR, CI verde, merge.

---

## Fase 4 · W4 · Portal (paralela à W3)

Branch: `claude/ux-w4`. Tarefas `[paralelo]`.

### Task W4-T1: Moldura do portal (itens 62, 64, 69) `[paralelo]`

**Files:**
- Modify: `src/components/editorial/SiteHeader.tsx` + `SiteHeaderParts.tsx` (fileira de editorias com `data-hidden` ao rolar para baixo mais de 48 px e volta ao rolar para cima; transição `motion-safe:` de `transform`; com movimento reduzido, só alterna; `--h-sticky-public` atualizado via variável `--cn-header-h` por ResizeObserver)
- Modify: `src/components/editorial/AdSlotClient.tsx` (anúncio fixo grava `--cn-ad-h`; `globals.css` soma no `padding-bottom` do body e no `scroll-padding-bottom`)
- Modify: `src/components/editorial/LiveIndicator.tsx` (link para `/#agora`; pulsa só quando `pathname === "/"`)
- Test: `SiteHeader.test.tsx`, `AdSlotClient.test.tsx`, `tests/e2e/overflow.spec.ts` (Review Focus 2: rotas públicas em 320×640 sem rolagem horizontal), `tests/e2e/header-scroll.spec.ts`

- [ ] **Step 1–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `feat(portal): cabeçalho que recolhe as editorias e anúncio que reserva espaço [UX-W4-T1]`.

### Task W4-T2: Convite da primeira visita (item 63) `[paralelo]`

**Files:**
- Modify: `src/components/editorial/FirstVisitInvite.tsx` (renderiza como faixa compacta no fim da matéria — prop `placement: "article-end" | "home"` — com expansão sob demanda; reserva `--cn-invite-h`; "Agora não" mantido)
- Modify: `src/app/(public)/materia/[slug]/page.tsx` e home (ponto de montagem)
- Test: `FirstVisitInvite.test.tsx` (não monta no meio do corpo; tem "Agora não"; fechado não volta na mesma sessão)

- [ ] **Step 1–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `feat(portal): convite no fim da leitura, sem cobrir o texto [UX-W4-T2]`.

### Task W4-T3: Navegação e caminhos (itens 65, 66, 67, 68) `[paralelo]`

**Files:**
- Create: `src/lib/nav/tab-for-path.ts` — `tabForPath(pathname: string): "inicio" | "explorar" | "busca" | "salvos" | "perfil"` (agenda, fontes, panorama, assuntos, assunto, guia, coleções → explorar; entrar, criar-conta, alertas, newsletter → perfil; matéria → inicio)
- Modify: `src/components/ui/TabBar.tsx` / `BottomNav.tsx` (usar `tabForPath`)
- Modify: `src/app/(public)/explorar/page.tsx` (âncoras só das seções renderizadas; bloco "Perguntar ao CityNews"; atalhos com destino coerente), `src/content/pt-BR/explore.ts`, `ask.ts`, `search.ts` (nome único "Perguntar ao CityNews"), `SiteFooter.tsx` (link)
- Test: `tab-for-path.test.ts` (tabela com as rotas acima), `explorar.test.tsx` (sem âncora para seção ausente), `src/content/pt-BR/ask-name.test.ts`

- [ ] **Step 1–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `feat(portal): aba certa acesa, Pergunte fácil de achar e atalhos corretos [UX-W4-T3]`.

### Task W4-T4: Estados e retorno (itens 70, 71, 72, 73) `[paralelo]`

**Files:**
- Modify: `src/app/(public)/perfil/page.tsx` (erro de leitura → `InlineAlert` com "Tentar de novo"; sessões e "Sair" continuam)
- Modify: `src/app/(public)/favoritos/FavoritesClient.tsx` (foco no "Desfazer" depois de remover; "Desfazer" via `useToast`; aba em `?aba=` com `router.replace`)
- Modify: `src/components/editorial/NowList.tsx` (separador só entre partes existentes; estado vazio com texto de `portal-home.ts`)
- Modify: `src/app/(public)/panorama/PanoramaClient.tsx` (ordenação "Fontes mais lidas primeiro"; botão "Mostrar todas" no vazio; resumo "3 de 12 fontes" no `summary`)
- Test: `perfil.test.tsx`, `FavoritesClient.test.tsx` (Review Focus 3: `document.activeElement` é o botão "Desfazer"), `NowList.test.tsx`, `PanoramaClient.test.tsx`

- [ ] **Step 1–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `fix(portal): estados de erro, vazio e foco nas telas de conta e listas [UX-W4-T4]`.

### Task W4-T5: Matéria, busca e trilho (itens 74, 75, 76, 77) `[paralelo]`

**Files:**
- Modify: `src/components/editorial/ArticleActions.tsx` (sem "Informar problema"; botões `md` 44 px no celular, `gap-3`; "Ver favoritos" com `min-h-tap`)
- Modify: `src/app/(public)/busca/page.tsx` (linha do Pergunte depois dos 3 primeiros resultados no celular, compacta)
- Modify: `src/components/editorial/Rail.tsx` (`tabIndex` só quando rolável; `scroll-fade` no celular)
- Test: `ArticleActions.test.tsx`, `Rail.test.tsx`, `tests/e2e/search.spec.ts` (ordem no mobile)

- [ ] **Step 1–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `fix(portal): ações da matéria, ordem da busca e trilho acessível [UX-W4-T5]`.

### Fechamento da W4

- [ ] `pnpm verify`, `pnpm test:a11y`, revisão de branch, PR, CI verde (Lighthouse incluso), merge.

---

## Fase 5 · W5 · Performance e técnica

Branch: `claude/ux-w5`. Tarefas `[paralelo]`.

### Task W5-T1: Imagens responsivas e fallback (itens 78, 79)

**Files:**
- Create: `src/lib/media/variants.ts` — `VARIANT_WIDTHS = [480, 960, 1440] as const`; `variantPath(path: string, w: number): string`; `makeVariants(buf: Buffer): Promise<{ width: number; buf: Buffer }[]>` (sharp, WebP qualidade 75, sem ampliar)
- Modify: etapa de ingestão de mídia no pipeline (onde o original é gravado no Storage) para gravar as variantes
- Create: `scripts/media/backfill-variants.mjs` (idempotente, `--dry-run` padrão)
- Modify: `src/lib/media/serve.ts` + `src/app/api/media/[id]/route.ts` (`?w=` escolhe a variante mais próxima ≥ w; fallback ao original)
- Modify: `src/components/editorial/Photo.tsx` (`srcSet` com as 3 larguras e `sizes` do chamador; `onError` → substituto; manchete recebe `directSrc` resolvido no servidor)
- Modify: `src/app/(public)/layout.tsx` (`<link rel="preconnect">` para a origem do Storage)
- Test: `variants.test.ts`, `Photo.test.tsx`, `tests/integration/media-variants.test.ts`

- [ ] **Step 1:** testes: `makeVariants` de uma imagem 2000 px devolve 3 larguras; de uma 600 px devolve só 480 (sem ampliar); `Photo` tem `srcset` com `480w, 960w, 1440w`; `onError` troca para o substituto.
- [ ] **Step 2–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `perf(midia): variantes por largura, srcset e substituto [UX-W5-T1]`. Rodar o backfill em produção segue B-009 (registrar em DECISIONS).

### Task W5-T2: Leituras da home e da matéria (itens 80, 81) `[paralelo]`

**Files:**
- Modify: `src/lib/db/queries/home.ts` (slots de destaque, pinos e `public_most_read` no primeiro `Promise.all`; exclusões resolvidas em memória)
- Modify: `src/lib/db/queries/featured.ts` (`getFeaturedMany(slots: string[])` numa leitura)
- Modify: `src/lib/db/queries/articles.ts` (`getArticleBySlug` com `cache()` do React; sem repetir `public_article_gone` quando o proxy já checou — cabeçalho `x-cn-gone-checked`)
- Modify: páginas com `generateMetadata` (9) para usar o carregador com `cache()`
- Test: `tests/integration/home-queries.test.ts` (conta idas ao banco com um `fetch` instrumentado: ≤ 2 rodadas sequenciais), `articles-cache.test.ts`

- [ ] **Step 1–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `perf(dados): home sem cascata e matéria sem leituras repetidas [UX-W5-T2]`.

### Task W5-T3: Timeouts e erros no cliente (itens 82, 83, 88) `[paralelo]`

**Files:**
- Create: `src/lib/http/fetch-with-timeout.ts` — `fetchWithTimeout(timeoutMs: number): typeof fetch`
- Create: `src/lib/http/fetch-json.ts` — `fetchJson<T>(url: string, opts?: { timeoutMs?: number; init?: RequestInit; guard?: (v: unknown) => v is T }): Promise<Result<T, "timeout" | "http" | "parse">>`
- Modify: `src/lib/db/client.ts` (os 3 clientes com `global.fetch = fetchWithTimeout(8000)`; service role do cron com 20 s)
- Modify: `NewItemsPill.tsx`, `UpdatedWhileReading.tsx`, `AlertWatcher.tsx`, `NotificationBell.tsx` (usar `fetchJson`)
- Modify: `src/lib/anon/use-profile.ts` (`act` devolve `Result`), `SaveButton.tsx`, `SaveEventButton.tsx`, `RecommendationControls.tsx`, `FollowTopicButton.tsx` (mostram erro por `useToast`)
- Test: `fetch-with-timeout.test.ts`, `fetch-json.test.ts`, `use-profile.test.ts`

- [ ] **Step 1–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `fix(robustez): timeouts no banco e no polling, erros visíveis [UX-W5-T3]`.

### Task W5-T4: Consultas N+1 (item 84) `[paralelo]`

**Files:** `src/lib/db/queries/guide-admin.ts:172`, `src/lib/db/guide-list-store.ts:116`, `src/lib/db/queries/push-admin.ts:339`, `src/lib/db/guide-store.ts:145`, `src/lib/db/account.ts:192` (consulta agrupada, `in()`, upsert em lote ou RPC nova em `supabase/migrations/0155_batch_helpers.sql` se precisar)
- Test: integração para cada função com o mesmo resultado de antes e contagem de chamadas ≤ 2.

- [ ] **Step 1–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `perf(dados): sem consultas N+1 em guia, push e conta [UX-W5-T4]`.

### Task W5-T5: Bundle (itens 85, 86) `[paralelo]`

**Files:**
- Modify: `src/lib/ai/prompts.ts` e `src/lib/sources/{schema,activation}.ts` (separar constantes puras em `*-constants.ts`; schemas com `import "server-only"`)
- Modify: componentes cliente que importavam os schemas (usar as constantes)
- Modify: `src/app/estudio/materias/[id]/page.tsx` (editor com `next/dynamic`, `ssr: false`, esqueleto)
- Modify: `src/app/(public)/fontes/(lista)/page.tsx` + `SourcesClient.tsx` (lista e cards renderizados no servidor; cliente só com `Tabs`, personalização e "Ocultar")
- Modify: `lighthouserc.json` (orçamento = maior medida depois da tarefa + 3 %, alvo ≤ 165000; atualizar A-141)
- Test: `tests/ci/no-zod-in-client.test.ts` (procura `zod` nos chunks de `.next/static` referenciados por rotas do Estúdio depois de `pnpm build`; roda no CI), `SourcesClient.test.tsx`

- [ ] **Step 1–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `perf(bundle): zod fora do cliente, editor sob demanda e /fontes no servidor [UX-W5-T5]`.

### Task W5-T6: Carregamento perceptível (item 87) `[paralelo]`

**Files:**
- Create: `src/components/editorial/NavProgress.tsx` (`"use client"`; barra fina no topo do cabeçalho durante navegação pendente via `useLinkStatus`/`useTransition`; `motion-safe:`; `role="progressbar"` sem `aria-live`)
- Modify: `src/components/editorial/PublicShell.tsx` (montar), `src/app/(public)/(inicio)/loading.tsx` (`role="status"` fora do nó com `aria-busy`)
- Modify: páginas `materia/[slug]`, `[editoria]`, `agenda`: blocos secundários (relacionadas, mais lidas) em `<Suspense>` com `Skeleton`, depois do `notFound()`
- Test: `NavProgress.test.tsx`, `tests/e2e/not-found-status.spec.ts` (404/410 continuam com status certo — A-037)

- [ ] **Step 1–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `feat(portal): indicador de navegação e blocos secundários com carregamento [UX-W5-T6]`.

### Task W5-T7: Higiene de código (itens 89, 90) `[paralelo]`

**Files:**
- Create: `src/lib/text/fold.ts` — `fold(s: string): string` (NFD sem marcas, minúsculas); substituir as 25 cópias de `normalize("NFD")` onde a semântica for a mesma
- Modify: `src/lib/format/date.ts` (exportar `TIME_ZONE`; trocar os 14 literais `"America/Cuiaba"`)
- Create: `knip.json` (entradas: `src/app/**`, `src/sw/**`, `scripts/**`, `tests/**`); passo no CI `pnpm dlx knip --no-exit-code` (aviso)
- Modify: remover barris e reexports mortos confirmados pelo knip
- Test: `fold.test.ts`; `pnpm verify`

- [ ] **Step 1–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `chore: utilitários únicos e código morto removido [UX-W5-T7]`.

### Task W5-T8: Testes (itens 91, 92, 93) `[paralelo]`

**Files:**
- Modify: specs com `waitForTimeout` (19) → `expect.poll`/`waitForResponse`/estado da UI
- Modify: `playwright.config.ts` (projeto `serial-flags` com `fullyParallel: false` para `control-rules`, `admin-contingency` e demais que mudam flags globais; excluídos dos projetos paralelos)
- Modify: `lighthouserc.json` (URLs `/agenda`, `/cidade`, `/guia-cuiaba`) e `supabase/seed.sql` (uma peça de anúncio da casa ativa)
- Create: `RuleProposalForm.test.tsx`, `ApprovalInbox.test.tsx`, `SearchBox.test.tsx`, `PromptVersions.test.tsx` (comportamento principal, estados de erro e vazio)
- Test: `tests/ci/no-wait-for-timeout.test.ts` (`rg "waitForTimeout" tests` vazio)

- [ ] **Step 1–4:** FAIL → implementar → PASS + `pnpm verify`. **Step 5:** commit `test: e2e sem esperas fixas, flags em série e componentes críticos cobertos [UX-W5-T8]`.

### Fechamento da W5

- [ ] `pnpm verify`, Lighthouse no CI dentro do orçamento atualizado, revisão de branch, PR, merge; relatório `docs/reports/melhorias-ux-ui-tecnica.md` com o que mudou por item e o antes/depois do Lighthouse; `.planning/STATE.md` reescrito.
