# UI das telas públicas · Plano de implementação

> **Para quem executa:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Passos usam checkbox (`- [ ]`).

**Goal:** recompor as telas públicas do CityNews Cuiabá em torno de hierarquia noticiosa e imagem, sem mudar marca nem tokens.

**Architecture:** fases independentes e publicáveis. Primeiro ferramenta de medição e chrome (banner, cabeçalho, rodapé), depois o sistema de origem e de card, depois home e matéria, listas, telas de produto, marketing e conta. Componentes ficam em `src/components/editorial`, textos em `src/content/pt-BR`, tokens em `src/styles/tokens.css`.

**Tech Stack:** Next.js App Router (RSC), Tailwind v4 com tokens, Vitest + Testing Library, Playwright + axe, Lighthouse CI, `impeccable detect` (CLI do pbakaus/impeccable).

**Spec:** `docs/superpowers/specs/2026-10-02-ui-publica-design.md` (vence em conflito de composição; `DESIGN.md` vence em identidade).

## Global Constraints

- Marca "CityNews" (CamelCase) e "Cuiabá" acentuado; pt-BR. Rótulos de origem em caixa alta são a exceção (CLAUDE.md §5.1).
- Só tokens: sem hex ou px crus em `src/components` (ESLint bloqueia). Sem fonte fora de Schibsted Grotesk e Source Serif 4.
- Proibido (DESIGN.md §10): card aninhado, card sem `<a>`, gradiente decorativo, emoji, texto < 4,5:1, `outline: 0`, contagem de curtidas/comentários, z-index arbitrário, carrossel automático, pop-up de cadastro na 1ª visita.
- Animação só CSS e sempre com `prefers-reduced-motion`. Framer Motion não entra.
- Origem sempre visível em texto (regra 3); no máximo 4 rótulos por card (DESIGN.md §5). Login nunca obrigatório; todo convite tem "Agora não".
- `tripled-ui` só em blocos de marketing (newsletter, anuncie, app, sobre). Nunca no Estúdio.
- Imagem de terceiros só pela política `reproduction` (rótulo REPRODUÇÃO · fonte, crédito, link, sem recorte do crédito).
- Alvos ≥ 44 px; contraste ≥ 4,5:1 (≥ 7:1 no escuro); `pnpm verify` verde antes de cada commit de fim de tarefa.

## Review Focus

Entradas e condições que a spec implica e nenhuma tarefa exercita sozinha; cada linha vira teste na tarefa dona:
1. Matéria com título de 140 caracteres e 4 rótulos em 360 px: nenhum rótulo truncado, `h1` visível sem rolar além de 1 dobra (UI-T3, UI-T6).
2. Lista com 0, 1 e 12 itens, com e sem foto, mistura de variantes: sem salto de layout (CLS ≤ 0,1) e sem bloco chapado (UI-T4, UI-T8).
3. Consentimento pendente + `OfflineNotice` + `UrgentBar` ao mesmo tempo em 360×640: o conteúdo continua legível e nada fixo passa de 15% da altura somado ao banner (UI-T1).
4. Modo escuro e texto aumentado em "Ajustar leitura" (maior tamanho) na matéria: sem sobreposição e contraste ≥ 7:1 (UI-T6).
5. Foto `reproduction` na variante `lead`: crédito e rótulo REPRODUÇÃO visíveis e sem recorte, em 390 e 1280 px (UI-T3).

---

### Task UI-T0: Baseline, capturas e detector no fluxo

**Files:**
- Create: `scripts/shoot-public.mjs`, `docs/reports/ui-publica.md`
- Modify: `package.json` (scripts `design:detect`, `design:shoot`), `.github/workflows/ci.yml` (passo opcional não bloqueante `design:detect` até UI-T9)
- Test: `tests/e2e/public-shots.spec.ts` (smoke: as 16 rotas respondem 200)

**Interfaces:**
- Produces: `pnpm design:shoot` (gera `tmp/shots/{m,d}-<rota>.png` em 390 e 1280, claro e escuro) e `pnpm design:detect` (`impeccable detect src/components src/app/(public) src/styles`, falha em erro).

- [ ] **Step 1: Teste.** `public-shots.spec.ts` visita as 16 rotas públicas do inventário (home, `/cidade`, `/busca?q=prefeitura`, `/pergunte`, `/fontes`, `/panorama`, `/agenda`, `/explorar`, `/assuntos`, `/favoritos`, `/alertas`, `/newsletter`, `/entrar`, `/perfil`, `/sobre`, `/como-usamos-ia`) e espera status 200 e um `h1`.
- [ ] **Step 2: Rodar.** `pnpm test:e2e tests/e2e/public-shots.spec.ts`. Esperado: passa (rotas já existem).
- [ ] **Step 3: Implementar `scripts/shoot-public.mjs`** com `@playwright/test`, viewports 390×844 e 1280×900, `colorScheme` light e dark, banner de consentimento fechado por cookie quando `--no-consent`; grava o relatório `docs/reports/ui-publica.md` "Antes" com a tabela de medidas (altura da home mobile, altura ocupada pelo banner, nº de chips antes do `h1`).
- [ ] **Step 4: Scripts.** `design:detect` usa `npx impeccable detect` (devDependency `impeccable`); registrar baseline (2 avisos em `ConsentBanner`).
- [ ] **Step 5: Commit.** `chore(ui): baseline de capturas e detector [UI-T0]`.

### Task UI-T1: Consentimento compacto

**Files:**
- Modify: `src/components/editorial/ConsentBanner.tsx`, `src/content/pt-BR/privacy.ts` (só se o texto precisar encurtar sem mudar o sentido jurídico)
- Test: `src/components/editorial/ConsentBanner.test.tsx` (novo), `tests/e2e/consent.spec.ts` (existente)

**Interfaces:** `ConsentBanner()` mantém a assinatura e as três ações ("Só o necessário", "Escolher", "Aceitar recomendações").

- [ ] **Step 1: Teste (vermelho).** Em 360×640 o banner ocupa ≤ 15% da altura (`getBoundingClientRect().height <= 0.15 * innerHeight`); em 1280 é uma barra de uma linha, `position: fixed` na base, sem `border-t-2` com raio; foco inicial no primeiro botão; `Esc` não fecha sem escolha; `role="region"` com nome.
- [ ] **Step 2: Rodar** e ver falhar.
- [ ] **Step 3: Implementar** layout compacto: texto em até 2 linhas com "Saiba mais", três botões em linha (empilha só abaixo de 400 px com altura de botão 44), `padding` pelos tokens, `z-index` pelo token `--z-sheet`. Mantém persistência e os eventos do plano de rastreio.
- [ ] **Step 4: Rodar** unit + `consent.spec.ts` + axe. Esperado: verdes. `pnpm design:detect` sem avisos no arquivo.
- [ ] **Step 5: Commit.** `feat(ui): consentimento compacto [UI-T1]`.

### Task UI-T2: Cabeçalho e rodapé

**Files:**
- Modify: `src/components/editorial/SiteHeader.tsx`, `SiteFooter.tsx`, `src/content/pt-BR/institutional.ts` (helper `isFilled(value)`)
- Test: `src/components/editorial/SiteHeader.test.tsx` (novo), `SiteFooter.test.tsx` (novo)

**Interfaces:** `isFilled(v: string): boolean` em `institutional.ts` (falso para vazio ou que contenha `[PREENCHER]`).

- [ ] **Step 1: Testes.** Rodapé não renderiza linha cujo valor falha em `isFilled` e não mostra "[PREENCHER]" em nenhum caso; cabeçalho: fileira de editorias com `aria-current` na ativa, rolável com indicação de borda (atributo `data-fade`), 4 destinos principais + Busca + AGORA, altura reduzida em `data-scrolled`.
- [ ] **Step 2: Rodar** e ver falhar.
- [ ] **Step 3: Implementar** (cabeçalho em uma linha principal, editoria ativa rolada ao centro no celular via `scrollIntoView({inline:"center"})` com `behavior` respeitando movimento reduzido; fade por máscara CSS com tokens).
- [ ] **Step 4: Rodar** unit, `home.spec.ts`, `keyboard.spec.ts`, axe. Verdes.
- [ ] **Step 5: Commit.** `feat(ui): cabeçalho enxuto e rodapé sem campos pendentes [UI-T2]`.

### Task UI-T3: OriginStrip e escala de card

**Files:**
- Create: `src/components/editorial/OriginStrip.tsx`, `OriginStrip.test.tsx`
- Modify: `ArticleCard.tsx`, `OriginLabel.tsx` (só exportar a lógica de texto), `src/styles/tokens.css` (escala `--type-headline*` se faltar degrau), `DESIGN.md` §5 (regra do `OriginStrip`)
- Test: `src/components/editorial/cards.test.tsx` (existente, estender)

**Interfaces:**
- Produces: `OriginStrip({ labels: OriginLabelData[]; size?: "sm"|"md"; className?: string })` renderiza uma linha: rótulo principal + até 3 rótulos secundários como ícone + texto curto; `title` e texto para leitor de tela com o conjunto completo (≤ 4). Nunca trunca (quebra para segunda linha só abaixo de 320 px).
- Consumes: `OriginLabel` e `ArticleSummary.labels` existentes.

- [ ] **Step 1: Testes (vermelho).** `OriginStrip` com 4 rótulos mostra o texto da origem principal e dos rótulos IA/revisado; nenhum nó com `text-overflow: ellipsis`; ordem texto → IA → imagem → publicação; `ArticleCard` usa `OriginStrip` em todas as variantes e continua com ≤ 4 rótulos; caso Review Focus 1 e 5 (título longo, foto `reproduction` na `lead` com crédito visível).
- [ ] **Step 2: Rodar** e ver falhar.
- [ ] **Step 3: Implementar** `OriginStrip` e trocar a pilha em `ArticleCard`; reaplicar escala de manchete por variante (lead 28→44, standard 20→22, list e compact 18).
- [ ] **Step 4: Rodar** `cards.test.tsx`, `anon-read.spec.ts`, axe. Verdes.
- [ ] **Step 5: Commit.** `feat(ui): OriginStrip e escala de manchetes [UI-T3]`.

### Task UI-T4: Capa tipográfica e imagem nos cards

**Files:**
- Modify: `ArticleCard.tsx` (`TypographicCover`), `Photo.tsx`, `src/content/pt-BR/portal-card.ts`
- Test: `cards.test.tsx`

- [ ] **Step 1: Testes.** `data-testid="typographic-cover"` no `lead` não usa fundo Tinta chapado de altura de imagem (altura ≤ 96 px, faixa da editoria + ícone); em `standard`/`list` é miniatura Névoa com ícone; com foto aprovada renderiza `Photo` com crédito/rótulo fora do recorte.
- [ ] **Step 2: Rodar** e ver falhar.
- [ ] **Step 3: Implementar** o novo `TypographicCover(variant)` (ícone da editoria do sprite existente, sem emoji) e garantir `aspect-ratio` fixo nas miniaturas (CLS zero).
- [ ] **Step 4: Rodar** unit e e2e de home/editoria. Verdes.
- [ ] **Step 5: Commit.** `feat(ui): capa tipográfica compacta e imagem sem salto [UI-T4]`.

### Task UI-T5: Home recomposta

**Files:**
- Modify: `src/app/(public)/(inicio)/page.tsx`, `loading.tsx`, `NowList.tsx`, `PopularSourcesRail.tsx`, `TopicCard.tsx`, `CollectionCard.tsx`, `ServiceTile.tsx`, `src/content/pt-BR/portal-home.ts`
- Create: `src/components/editorial/Rail.tsx` (trilho horizontal com `scroll-snap`, setas acessíveis e `aria-label`)
- Test: `tests/e2e/home.spec.ts` (estender), `Rail.test.tsx`

**Interfaces:** `Rail({ label: string; children: ReactNode; itemWidth?: "sm"|"md" })`: lista com `role="list"`, teclado (setas/Tab), `scroll-snap-type: x mandatory`, sem autoplay.

- [ ] **Step 1: Testes.** e2e a 390×844: altura total da página ≤ 4.700 px com o seed; manchete, resumo e `OriginStrip` inteiros na 1ª dobra com consentimento fechado; Panorama abaixo da dobra; `h1` único. A 1280: lead (8 col) + Agora (4 col) lado a lado. `Rail` navegável por teclado.
- [ ] **Step 2: Rodar** e ver falhar.
- [ ] **Step 3: Implementar** a ordem da spec §4.3 (lead, Agora, trilhos de Assuntos/Coleções/Agenda/Serviços no celular; grade 12 colunas no desktop; editorias em abas no celular), reaproveitando as consultas atuais (sem mudança de dados).
- [ ] **Step 4: Rodar** e2e, axe, `perf` (LCP/CLS da home). Verdes e dentro do orçamento.
- [ ] **Step 5: Commit.** `feat(ui): home em trilhos e hierarquia 7h [UI-T5]`.

### Task UI-T6: Matéria como leitura

**Files:**
- Modify: `src/app/(public)/materia/[slug]/page.tsx`, `ArticleActionBar.tsx`, `MadeHow.tsx`, `AiSummaryBlock.tsx`, `ReadingSettings.tsx`, `src/content/pt-BR/portal-article.ts`
- Test: `tests/e2e/article.spec.ts`, `ArticleActionBar.test.tsx` (novo)

- [ ] **Step 1: Testes.** Antes do `h1` há no máximo kicker + 1 chip de status; `OriginStrip` em uma linha abaixo do título em 360 px sem truncar; barra de ações em uma linha (Salvar destacado; Compartilhar, Ajustar leitura e Informar problema com nome acessível e texto a partir de 640 px); "Fontes" como `<details>` após o corpo; Review Focus 4 (escuro + tamanho máximo de texto).
- [ ] **Step 2: Rodar** e ver falhar.
- [ ] **Step 3: Implementar** (cabeçalho compacto, barra de ações, sidebar recolhível no celular, tipografia de leitura 18→20 px, primeira frase em negrito, progresso).
- [ ] **Step 4: Rodar** e2e do artigo, axe, `UpdatedWhileReading` e `JsonLd` inalterados. Verdes.
- [ ] **Step 5: Commit.** `feat(ui): matéria com cabeçalho enxuto e leitura [UI-T6]`.

### Task UI-T7: Chrome móvel e estados globais

**Files:**
- Modify: `BottomNav.tsx`, `UrgentBar.tsx`, `OfflineNotice.tsx`, `SystemState.tsx`, `ErrorState.tsx`, `src/app/(public)/loading.tsx` e `not-found.tsx`
- Test: `BottomNav.test.tsx`, e2e `keyboard.spec.ts`

- [ ] **Step 1: Testes.** Review Focus 3 (banner + offline + urgente em 360×640: soma dos fixos ≤ 15% da altura mais a barra inferior de 64 px, conteúdo rolável e legível); esqueletos no formato final (sem salto).
- [ ] **Step 2: Rodar** e ver falhar. **Step 3: Implementar** (empilhamento por tokens de camada; urgente e offline viram linhas finas; esqueletos por componente). **Step 4: Rodar** unit/e2e/axe. **Step 5: Commit** `feat(ui): estados globais sem sobreposição [UI-T7]`.

### Task UI-T8: Listas e descoberta

**Files:**
- Modify: `src/app/(public)/[editoria]/page.tsx`, `assuntos/page.tsx`, `explorar/page.tsx`, `busca/page.tsx`, `SearchResults.tsx`, `SearchFiltersBar.tsx`, `SectionFiltersForm.tsx`, `SectionTile.tsx`
- Test: `tests/e2e/section.spec.ts`, `search.spec.ts`, `explore.spec.ts`

- [ ] **Step 1: Testes.** Review Focus 2 (0, 1 e 12 itens; com e sem foto); título de página menor que a manchete lead; filtros numa barra única com estado na URL; a 1280 a lista usa `lead` + `standard`; vazio com ação.
- [ ] **Step 2–5:** falhar, implementar (cabeçalho de página em escala `--type-screen-title`, lista image-led, ranking lateral com `list`), rodar e2e + axe, commit `feat(ui): listas image-led e hierarquia de página [UI-T8]`.

### Task UI-T9: Telas de produto (Pergunte, Fontes, Panorama, Agenda)

**Files:**
- Modify: `src/app/(public)/pergunte/page.tsx`, `src/components/ai/*`, `fontes/page.tsx`, `SourceCard.tsx`, `panorama/page.tsx`, `agenda/page.tsx`, `AgendaList.tsx`, `AgendaCalendar.tsx`, `src/content/pt-BR/ask.ts`
- Test: `tests/e2e/ask.spec.ts`, `sources.spec.ts`, `agenda.spec.ts`

- [ ] **Step 1: Testes.** `/pergunte`: coluna central, cartão-exemplo rotulado "Exemplo" com fato, inferência e lacuna separados; 4 sugestões; limite e recusa (<2 fontes) preservados; `/agenda` a 360 px lista agrupada por dia sem rolagem horizontal; `/fontes` e `/panorama` alinhados ao grid e com `--surface-aggregated` no Panorama.
- [ ] **Step 2–5:** falhar, implementar, rodar e2e + axe, commit `feat(ui): telas de produto alinhadas [UI-T9]`.

### Task UI-T10: Marketing e institucional (tripled-ui)

**Files:**
- Modify: `newsletter/page.tsx`, `anuncie/page.tsx`, `app/page.tsx`, `sobre/page.tsx`, `NewsletterForm.tsx`, `src/content/pt-BR/newsletter.ts`, `site.ts`
- Create: `src/components/editorial/marketing/{Hero,Benefits,Cta,Faq}.tsx` (Tailwind puro, tokens, sem gradiente)
- Test: `tests/e2e/newsletter.spec.ts`, `adherence.test.ts`

- [ ] **Step 1: Testes.** Cada bloco tem um `h2`, CTA com nome acessível, nenhuma cor/px crua (teste de aderência), animação só com `prefers-reduced-motion` (`@media` presente), formulário só com e-mail.
- [ ] **Step 2–5:** falhar, implementar a partir dos blocos hero/benefícios/CTA/FAQ do TripleD adaptados aos tokens, rodar tudo, commit `feat(ui): blocos de marketing com tripled-ui [UI-T10]`.

### Task UI-T11: Conta, favoritos, alertas e legais

**Files:**
- Modify: `entrar`, `criar-conta`, `perfil`, `favoritos`, `alertas`, `privacidade`, `termos`, `metodologia`, `principios-editoriais`, `como-usamos-ia`, `DocPage.tsx`, `AccountShell.tsx`
- Test: `tests/e2e/auth.spec.ts`, `favorites-alerts.spec.ts`, `docs.spec.ts`

- [ ] **Step 1: Testes.** Grid e largura de leitura (68ch) nas páginas legais; todo convite com "Agora não"; estados vazio/erro/sucesso; formulários com rótulo visível e erro com ícone e exemplo.
- [ ] **Step 2–5:** falhar, implementar, rodar, commit `feat(ui): conta e páginas legais no mesmo grid [UI-T11]`.

### Task UI-T12: Gate da UI

**Files:** `docs/reports/ui-publica.md`, `.planning/progress.json`, `.planning/STATE.md`, `.planning/DECISIONS.md`, `.github/workflows/ci.yml` (`design:detect` passa a bloquear)

- [ ] **Step 1:** `pnpm design:shoot` e comparar antes/depois (390 e 1280, claro e escuro); preencher a tabela dos 9 critérios da spec §5 com os números medidos.
- [ ] **Step 2:** `pnpm verify`, `pnpm test:e2e`, `pnpm test:a11y`, Lighthouse CI nas 6 rotas; `pnpm design:detect` sem avisos.
- [ ] **Step 3:** rodar o roteiro `docs/runbooks/revisao-leitor-de-tela.md` nas rotas alteradas (pendência humana registrada em BLOCKERS se ainda não feita).
- [ ] **Step 4:** registrar decisões (A-###), atualizar `STATE.md` e `progress.json`.
- [ ] **Step 5: Commit.** `docs(ui): relatório do gate da UI pública [UI-T12]`.

## Execução e ordem

UI-T0 → UI-T1 ∥ UI-T2 → UI-T3 → UI-T4 → (UI-T5 ∥ UI-T6) → UI-T7 → (UI-T8 ∥ UI-T9) → (UI-T10 ∥ UI-T11) → UI-T12. Cada fase fecha com `pnpm verify` e pode ir para produção sozinha. Em cada grupo de telas, antes de editar rodar `critique` e depois `polish` do impeccable sobre as rotas do grupo e registrar os achados no relatório.
