# UI das telas públicas · Plano de implementação (v3)

> **Para quem executa:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Passos usam checkbox (`- [ ]`).

**Goal:** recompor as telas públicas do CityNews Cuiabá em torno de hierarquia noticiosa, imagem e fluxo (login em destaque, Pergunte em chat, imagens de capa e do texto), sem mudar marca nem tokens.

**Architecture:** fases independentes e publicáveis: medição e chrome, rótulos e cards, home e matéria, listas e descoberta, login, chat, marketing e conta. Componentes em `src/components/editorial` (chat em `src/components/ai`), textos em `src/content/pt-BR`, tokens em `src/styles/tokens.css`. O chat reaproveita `POST /api/ask` (NDJSON em streaming, já existente).

**Tech Stack:** Next.js App Router, Tailwind v4 com tokens, Vitest + Testing Library, Playwright + axe, Lighthouse CI, `impeccable detect`.

**Spec:** `docs/superpowers/specs/2026-10-02-ui-publica-design.md` (v3). Wireframes: `docs/superpowers/specs/2026-10-02-ui-publica-wireframes.html`.

## Global Constraints

- Marca "CityNews" e "Cuiabá" acentuado; pt-BR. Rótulos de origem em caixa alta são a exceção (CLAUDE.md §5.1).
- Só tokens: sem hex ou px crus em `src/components` (ESLint). Exceção documentada: o SVG oficial do "G" do Google, servido como arquivo estático em `public/brand/`.
- **Proibido `OriginStrip` ou qualquer faixa que agrupe rótulos de origem** (decisão do dono). Card com no máximo 1 plaqueta (ORIGINAL CITYNEWS ou AGREGADO · fonte); origem do texto derivado e revisão em texto.
- **Vocabulário público (spec §4.1):** só "Feito a partir de n fontes", "Revisado automaticamente", "Revisado por {nome}" e "Reprodução web · Fonte". **Nenhuma tela pública** exibe "normaliz…", "IA", "inteligência artificial", "resumo por IA" ou "publicado automaticamente" (exceção: páginas legais e o rótulo de imagem gerada, que hoje não existe). Nomes internos no código ficam.
- Proibido (DESIGN.md §10): card aninhado, card sem `<a>`, gradiente decorativo, emoji, texto < 4,5:1, `outline: 0`, contagem de curtidas/comentários, z-index arbitrário, carrossel automático, pop-up de cadastro na 1ª visita.
- Animação só CSS e sempre com `prefers-reduced-motion`. Framer Motion não entra.
- Origem principal sempre visível em texto (regra 3, na leitura da spec §4.1). O chat nunca responde sem fonte (regra 5). Login nunca obrigatório; todo convite tem "Agora não".
- `tripled-ui` só em blocos de marketing (newsletter, anuncie, app, sobre). Nunca no Estúdio.
- Imagem de terceiros só pela política `reproduction`: legenda "Reprodução web · Fonte", crédito, link para o original, sem recorte do crédito, remoção em 24 h; até 2 imagens por matéria (capa e texto).
- Alvos ≥ 44 px; contraste ≥ 4,5:1 (≥ 7:1 no escuro); `pnpm verify` verde antes de cada commit de fim de tarefa.

## Review Focus

1. Matéria com título de 140 caracteres em 360 px: nenhum texto truncado e `h1` visível na 1ª dobra (UI-T3, UI-T6).
2. Lista com 0, 1 e 12 itens, com e sem foto: sem salto de layout (CLS ≤ 0,1) e sem bloco chapado (UI-T4, UI-T8).
3. Consentimento pendente + `OfflineNotice` + `UrgentBar` em 360×640: soma dos fixos legível (UI-T1, UI-T7).
4. Provedor Google desligado, e-mail inválido e conta bloqueada por tentativas: login sem texto de "indisponível" solto e com mensagem de erro ligada ao campo (UI-T12).
5. Chat: pergunta de 300 caracteres, pergunta sem fonte suficiente, limite por hora, assistente indisponível, rede caindo no meio do streaming, duas perguntas seguidas enviadas rápido (UI-T13).
6. Matéria com 1 imagem boa, com 2 imagens de mesma fonte, com 2 imagens quase iguais (`phash` próximo), com corpo de 1 e de 3 parágrafos, e com uma das duas imagens removida a pedido (UI-T16).
7. Qualquer rota pública, em qualquer estado (vazio, erro, offline), sem as palavras proibidas (UI-T3).

---

### Task UI-T0: Baseline, capturas e detector no fluxo

**Files:** Create `scripts/shoot-public.mjs`, `docs/reports/ui-publica.md`, `tests/e2e/public-shots.spec.ts`; Modify `package.json` (`design:detect`, `design:shoot`), `.github/workflows/ci.yml` (passo `design:detect` não bloqueante até UI-T14).

**Interfaces:** Produces `pnpm design:shoot` (390 e 1280, claro e escuro, em `tmp/shots/`) e `pnpm design:detect` (`impeccable detect src/components "src/app/(public)" src/styles`).

- [ ] **Step 1: Teste.** `public-shots.spec.ts` visita as 16 rotas públicas do inventário e espera 200 e um `h1`.
- [ ] **Step 2: Rodar.** `pnpm test:e2e tests/e2e/public-shots.spec.ts`; esperado: passa.
- [ ] **Step 3: Implementar** o script com `@playwright/test` e gravar em `docs/reports/ui-publica.md` a tabela "Antes" (altura da home mobile, % do banner na dobra, itens antes do `h1`).
- [ ] **Step 4: Scripts** e `impeccable` como devDependency; baseline = 2 avisos em `ConsentBanner`.
- [ ] **Step 5: Commit** `chore(ui): baseline de capturas e detector [UI-T0]`.

### Task UI-T1: Consentimento compacto

**Files:** Modify `src/components/editorial/ConsentBanner.tsx`; Test `ConsentBanner.test.tsx` (novo), `tests/e2e/consent.spec.ts`.

**Interfaces:** `ConsentBanner()` mantém assinatura e as três ações.

- [ ] **Step 1: Teste (vermelho).** Em 360×640 o banner ocupa ≤ 15% da altura; em 1280 é barra de uma linha; foco inicial no primeiro botão; região nomeada; sem `border-t-2` com raio.
- [ ] **Step 2: Rodar** e ver falhar. **Step 3: Implementar** o layout compacto (botões em linha; empilha só abaixo de 400 px com 44 px de altura), `z-index` pelo token. **Step 4: Rodar** unit, `consent.spec.ts`, axe e `design:detect` (sem aviso no arquivo). **Step 5: Commit** `feat(ui): consentimento compacto [UI-T1]`.

### Task UI-T2: Cabeçalho e rodapé

**Files:** Modify `SiteHeader.tsx`, `SiteFooter.tsx`, `src/content/pt-BR/institutional.ts` (helper `isFilled(v: string): boolean`); Test `SiteHeader.test.tsx`, `SiteFooter.test.tsx` (novos).

- [ ] **Step 1: Testes.** Rodapé não renderiza linha cujo valor falha em `isFilled` e nunca mostra "[PREENCHER]"; cabeçalho: fileira de editorias com `aria-current`, indicação de borda rolável (`data-fade`), 4 destinos + Busca + AGORA, altura reduzida em `data-scrolled`.
- [ ] **Step 2–5:** falhar, implementar (editoria ativa centralizada via `scrollIntoView` respeitando movimento reduzido), rodar unit, `home.spec.ts`, `keyboard.spec.ts`, axe; commit `feat(ui): cabeçalho enxuto e rodapé sem campos pendentes [UI-T2]`.

### Task UI-T3: Vocabulário público e escala de card

**Files:** Modify `src/content/pt-BR/labels.ts` (textos exibidos), `src/lib/labels/index.ts` (qual rótulo aparece), `ArticleCard.tsx`, `OriginLabel.tsx`, `AggregatedCard.tsx`, `MetaRow.tsx`, `MadeHow.tsx`, `AiSummaryBlock.tsx`, `src/content/pt-BR/portal-card.ts`, `portal-article.ts`, `portal-section.ts`, `search.ts`, `src/styles/tokens.css` (degrau de manchete se faltar), `CLAUDE.md` §5.3 e `DESIGN.md` §5 (novo vocabulário); Test `cards.test.tsx`, `origin.test.tsx`, `src/lib/labels/labels.test.ts`, `tests/e2e/vocabulary.spec.ts` (novo), `src/components/adherence.test.ts` (ausência de `OriginStrip`).

**Interfaces:** `publicLabels(article): { plaque?: "original" | "aggregated"; originText?: string; reviewText?: string }` em `src/lib/labels`: `plaque` só para ORIGINAL CITYNEWS e AGREGADO; `originText` = "Feito a partir de {n} fonte(s)" para texto derivado; `reviewText` = "Revisado por {nome}" ou "Revisado automaticamente". `MetaRow` ganha `originText?` e `reviewText?`. Rótulos antigos (`normalized`, `ai_summary`, `auto_published`) continuam no dado e no Estúdio; só deixam de ser exibidos nas telas públicas.

- [ ] **Step 1: Testes (vermelho).** Unit: `publicLabels` devolve os 3 formatos; card com 4 rótulos de dados mostra no máximo 1 plaqueta e as duas frases em texto; nenhum arquivo em `src/` contém `OriginStrip`. e2e `vocabulary.spec.ts`: visita as 16 rotas públicas (e estados vazio/erro/offline) e falha se o HTML visível contiver `/normaliz|\bIA\b|inteligência artificial|resumo por ia|publicado automaticamente/i`, com allowlist para `/privacidade`, `/termos`, `/metodologia`, `/principios-editoriais` e a página legal de uso de IA. Review Focus 1 e 7.
- [ ] **Step 2: Rodar** e ver falhar. **Step 3: Implementar** `publicLabels`, trocar a pilha de plaquetas, renomear "Resumo por IA" para "Resumo em poucos segundos" sem rótulo de origem, ajustar `MadeHow` ("Como esta matéria foi feita": de quantas fontes, quem revisou, de onde vêm as imagens), aplicar a escala de manchete (lead 28→44, standard 20→22, list e compact 18) e atualizar `CLAUDE.md` e `DESIGN.md`. **Step 4: Rodar** unit, e2e, axe, `design:detect`. **Step 5: Commit** `feat(ui): vocabulário público sem IA e sem normalizado, escala de card [UI-T3]`.

### Task UI-T4: Capa tipográfica e imagem nos cards

**Files:** Modify `ArticleCard.tsx` (`TypographicCover`), `Photo.tsx`, `portal-card.ts`; Test `cards.test.tsx`.

- [ ] **Step 1: Testes.** `typographic-cover` no `lead` tem altura ≤ 96 px (faixa da editoria + ícone + metadado); em `standard`/`list` é miniatura Névoa com ícone; com foto renderiza `Photo` com legenda de origem fora do recorte; `aspect-ratio` fixo (CLS zero).
- [ ] **Step 2–5:** falhar, implementar, rodar unit e e2e de home/editoria, commit `feat(ui): capa tipográfica compacta e imagem sem salto [UI-T4]`.

### Task UI-T5: Home recomposta

**Files:** Modify `src/app/(public)/(inicio)/page.tsx`, `loading.tsx`, `NowList.tsx`, `PopularSourcesRail.tsx`, `TopicCard.tsx`, `CollectionCard.tsx`, `ServiceTile.tsx`, `portal-home.ts`; Create `Rail.tsx`; Test `home.spec.ts`, `Rail.test.tsx`.

**Interfaces:** `Rail({ label: string; children: ReactNode; itemWidth?: "sm"|"md" })`: `role="list"`, `scroll-snap-type: x mandatory`, teclado, sem autoplay.

- [ ] **Step 1: Testes.** 390×844: página ≤ 4.700 px; manchete, resumo e origem principal inteiros na 1ª dobra com consentimento fechado; Panorama abaixo da dobra; `h1` único. 1280: lead (8 col) ao lado de "Agora" (4 col). `Rail` por teclado.
- [ ] **Step 2–5:** falhar; implementar a ordem da spec §4.4 sem mudar consultas; rodar e2e, axe e `perf`; commit `feat(ui): home em trilhos e hierarquia 7h [UI-T5]`.

### Task UI-T6: Matéria como leitura

**Files:** Modify `src/app/(public)/materia/[slug]/page.tsx`, `ArticleActionBar.tsx`, `MadeHow.tsx`, `AiSummaryBlock.tsx`, `ReadingSettings.tsx`, `portal-article.ts`; Test `tests/e2e/article.spec.ts`, `ArticleActionBar.test.tsx` (novo).

- [ ] **Step 1: Testes.** Antes do `h1`: só kicker e status; autoria diz a origem e a revisão em frase ("Feito a partir de 2 fontes · Revisado por Marina Arruda" ou "Revisado automaticamente") sem plaqueta; bloco "Resumo em poucos segundos" sem rótulo de IA; legenda "Reprodução web · Fonte" em cada foto; barra de ações em uma linha (Salvar destacado, demais com nome acessível e texto a partir de 640 px); "Fontes" em `<details>`; modo escuro e texto no tamanho máximo sem sobreposição.
- [ ] **Step 2–5:** falhar, implementar, rodar e2e, axe, `JsonLd`/`UpdatedWhileReading` inalterados; commit `feat(ui): matéria com cabeçalho enxuto e leitura [UI-T6]`.

### Task UI-T7: Estados globais sem sobreposição

**Files:** Modify `BottomNav.tsx`, `UrgentBar.tsx`, `OfflineNotice.tsx`, `SystemState.tsx`, `ErrorState.tsx`, `loading.tsx` e `not-found.tsx` públicos; Test `BottomNav.test.tsx`, `keyboard.spec.ts`.

- [ ] **Step 1: Teste.** Review Focus 3; esqueletos no formato final. **Step 2–5:** falhar, empilhar fixos por tokens de camada, urgente e offline como linhas finas, rodar unit/e2e/axe; commit `feat(ui): estados globais sem sobreposição [UI-T7]`.

### Task UI-T8: Listas, Busca, Explorar e Assunto

**Files:** Modify `[editoria]/page.tsx`, `assuntos/page.tsx`, `explorar/page.tsx`, `busca/page.tsx`, `SearchResults.tsx`, `SearchFiltersBar.tsx`, `SectionFiltersForm.tsx`, `SectionTile.tsx`; Test `section.spec.ts`, `search.spec.ts`, `explore.spec.ts`.

- [ ] **Step 1: Testes.** Review Focus 2; título de página menor que a manchete; filtros numa barra com estado na URL; **Busca:** filtros aplicam sem botão "Aplicar", abas como chips, miniaturas, linha "Perguntar ao CityNews" no topo levando a `/pergunte?q=`; **Explorar:** editoria sem matéria não vira atalho com "Nenhuma matéria hoje"; a 1280 a lista usa `lead` + `standard`.
- [ ] **Step 2–5:** falhar, implementar, rodar e2e + axe, commit `feat(ui): listas, busca e explorar [UI-T8]`.

### Task UI-T9: Agenda e Evento

**Files:** Modify `agenda/page.tsx`, `agenda/[slug]/page.tsx`, `AgendaList.tsx`, `AgendaCalendar.tsx`, `EventDateBadge.tsx`, `portal-agenda.ts`; Test `tests/e2e/agenda.spec.ts`.

- [ ] **Step 1: Testes.** Atalhos "Hoje / Amanhã / Fim de semana / Grátis" na URL; dias agrupados com cards de evento (data, imagem ou capa tipográfica, título, local · hora, preço, Salvar, + Calendário); a 360 px sem rolagem horizontal; a 1280 lista + mini-calendário lateral; alternância Lista/Calendário com contraste ≥ 4,5:1; `.ics` e JSON-LD `Event` inalterados.
- [ ] **Step 2–5:** falhar, implementar, rodar, commit `feat(ui): agenda por dia com atalhos [UI-T9]`.

### Task UI-T10: Fontes e Panorama

**Files:** Modify `fontes/page.tsx`, `fontes/[slug]/page.tsx`, `SourceCard.tsx`, `SourceRow.tsx`, `panorama/page.tsx`, `AggregatedCard.tsx`, `AggregatedSection.tsx`; Test `tests/e2e/sources.spec.ts`.

- [ ] **Step 1: Testes.** Card de fonte mostra avatar, nome, categoria · local, uma justificativa, Seguir e Ver matérias; estatísticas em `<details>` "Detalhes"; "Ocultar" no menu `⋯` com desfazer; agregados com 1 plaqueta AGREGADO · fonte e resumo curto sem rótulo de IA; Panorama em `--surface-aggregated`; nenhuma fonte > 25% da lista (regra mantida).
- [ ] **Step 2–5:** falhar, implementar, rodar, commit `feat(ui): fontes e panorama enxutos [UI-T10]`.

### Task UI-T11: Marketing e institucional (tripled-ui)

**Files:** Modify `newsletter/page.tsx`, `anuncie/page.tsx`, `app/page.tsx`, `sobre/page.tsx`, `NewsletterForm.tsx`, `newsletter.ts`, `site.ts`; Create `src/components/editorial/marketing/{Hero,Benefits,Cta,Faq}.tsx`; Test `newsletter.spec.ts`, `adherence.test.ts`.

- [ ] **Step 1: Testes.** Cada bloco com um `h2` e CTA com nome acessível; nenhuma cor/px crua; animação só sob `prefers-reduced-motion`; formulário só com e-mail.
- [ ] **Step 2–5:** falhar, implementar com blocos hero/benefícios/CTA/FAQ do TripleD adaptados a tokens (sem gradiente), rodar, commit `feat(ui): blocos de marketing com tripled-ui [UI-T11]`.

### Task UI-T12: Login e cadastro com o Google em destaque

**Files:**
- Create: `public/brand/google-g.svg` (SVG oficial do "G"), `src/components/editorial/GoogleButton.tsx`, `GoogleButton.test.tsx`
- Modify: `SignInForm.tsx`, `SignUpForm.tsx`, `AccountShell.tsx`, `src/app/(public)/entrar/page.tsx`, `criar-conta/page.tsx`, `src/content/pt-BR/account.ts`
- Test: `tests/e2e/auth.spec.ts`, `tests/a11y/auth.spec.ts`

**Interfaces:**
- Produces: `GoogleButton({ action: (form: FormData) => Promise<void>; next: string; label?: string })`: botão branco, borda neutra, `<img src="/brand/google-g.svg" alt="">` decorativo (o nome acessível vem do texto), altura 56 px, largura total, elevação leve, texto "Continuar com o Google"; renderiza no cadastro com o mesmo texto ("Continuar com o Google").
- Consumes: `google: ((form: FormData) => Promise<void>) | null` já passado a `SignInForm`; quando `null`, `GoogleButton` e o divisor não renderizam e o texto `googleOff` deixa de aparecer.

- [ ] **Step 1: Testes (vermelho).** Unit: o botão tem nome acessível "Continuar com o Google", contém o logotipo, fundo claro (classe de token) e `min-h-14`; é o **primeiro controle focável** do formulário (antes de e-mail e senha); linha "Usamos seu nome e e-mail para criar a conta." abaixo; com `google = null` nada do Google aparece e não existe a frase "ainda não está disponível". e2e: login e cadastro mostram o botão no topo em 390 e 1280; divisor "ou use seu e-mail"; "Continuar sem entrar" presente; Review Focus 4.
- [ ] **Step 2: Rodar** e ver falhar.
- [ ] **Step 3: Implementar** `GoogleButton` e reordenar o formulário (Google → divisor → e-mail e senha → Entrar → "Entrar sem senha" secundário → rodapé). No desktop, cartão em duas colunas com os 3 benefícios (Salvos em todos os aparelhos · Alertas do seu bairro · Fontes que você segue); no celular os benefícios viram uma linha acima do botão. Texto do botão e do divisor em `account.ts`.
- [ ] **Step 4: Rodar** unit, e2e, axe (contraste do botão branco com borda ≥ 3:1) e `design:detect`. **Step 5: Commit** `feat(ui): login e cadastro com o Google em destaque [UI-T12]`.

### Task UI-T13: Pergunte ao CityNews como chat

**Files:**
- Create: `src/components/ai/ChatThread.tsx`, `ChatMessage.tsx`, `ChatComposer.tsx`, `ChatSources.tsx`, `useAskStream.ts`, `ChatThread.test.tsx`, `useAskStream.test.ts`
- Modify: `src/app/(public)/pergunte/page.tsx`, `src/components/ai/AiAnswer.tsx` (citações numeradas clicáveis), `Citation.tsx`, `SourceRail.tsx`, `src/content/pt-BR/ask.ts`
- Test: `tests/e2e/ask.spec.ts`, `tests/a11y/ask.spec.ts`

**Interfaces:**
- Produces: `useAskStream(): { send(question: string): void; messages: ChatTurn[]; busy: boolean }` sobre `POST /api/ask` (lê NDJSON: `status` e `answer`); `ChatTurn = { id: string; question: string; status: "processing" | "answer" | "refused" | "error" | "rate_limited" | "off"; answer?: AiAnswer; askedAt: string }`. `ChatComposer({ onSend, disabled, max = 300 })` com `Enter` envia, `Shift+Enter` quebra linha, contador a partir de 250 caracteres. `ChatSources({ answer, openId? })` lista as fontes numeradas com o rótulo de origem de cada uma.
- Consumes: `AiAnswer` de `@/lib/ai/answer` (tipos `facts`, `inferences`, `gaps`, `conflicts`, `kind: "insufficient" | "error"`) e `answerQuestion` por trás da rota.

- [ ] **Step 1: Testes (vermelho).** `useAskStream`: envia POST, passa por `processing`, aplica `answer`, ignora segunda pergunta enquanto `busy`; erro de rede vira turno `error` com "Tentar de novo"; fim de stream sem `answer` vira `error`. `ChatThread`: vazio mostra boas-vindas e 4 perguntas iniciais; cada turno tem bolha da pessoa e do CityNews; resposta separa "O que se sabe" (cada frase com citação numerada), "Inferência" (borda tracejada), "Ainda não se sabe" e conflito; `insufficient` explica o motivo (<2 fontes) e oferece "Buscar do jeito tradicional"; `rate_limited` mostra o horário de liberação; assistente indisponível mostra a busca tradicional; nenhum texto do chat contém "IA" ou "inteligência artificial" (aviso fixo: "Pode conter erros. Confira nas fontes."); `aria-live="polite"` anuncia o fim da resposta; foco volta ao campo após enviar; citação [n] abre/rola até a fonte n. e2e: `/pergunte?q=...` já abre com a pergunta enviada; campo fixo na base acima da `BottomNav` em 390; 3 áreas em 1280 (histórico só com Personalização aceita); Review Focus 5.
- [ ] **Step 2: Rodar** e ver falhar.
- [ ] **Step 3: Implementar** o chat (client components só aqui; página continua RSC para metadados e fallback sem JS: sem JS, o formulário `GET ?q=` atual continua funcionando). Histórico local em IndexedDB só com consentimento de Personalização. `Enter`/`Shift+Enter`, rolagem para a última mensagem sem roubar o foco de quem está lendo, aviso fixo de erro possível.
- [ ] **Step 4: Rodar** unit, e2e, axe, teclado e orçamento de JS (o chat é carregado só em `/pergunte`). **Step 5: Commit** `feat(ui): Pergunte ao CityNews como chat [UI-T13]`.

### Task UI-T16: Imagens: capa e imagem no texto, "Reprodução web"

**Files:**
- Create: `supabase/migrations/0052_article_media_role.sql`, `src/lib/media/score.ts`, `src/lib/media/score.test.ts`, `src/components/editorial/ArticleFigure.tsx`, `ArticleFigure.test.tsx`
- Modify: `src/lib/media/choose.ts` (e `types.ts`), `src/lib/pipeline/steps/media.ts` (+ `media.test.ts`), `src/lib/pipeline/ports.ts` (`MediaRepo.linkArticleMedia` com `role` e `position`), `src/lib/db/pipeline-store.ts`, `src/lib/db/queries/articles.ts` (`ArticleImage` → `{ cover?, inline? }`), `src/lib/db/types.ts` (via `pnpm db:types`), `src/app/(public)/materia/[slug]/page.tsx`, `ArticleCard.tsx` (usa só a capa), `src/content/pt-BR/labels.ts` (legenda), `src/lib/pipeline/reprocess.ts` (reprocesso de imagem)
- Test: `tests/integration/media-roles.test.ts`, `tests/e2e/article.spec.ts`

**Interfaces:**
- Produces: `scoreImage(c: Candidate): number` (0 a 100; resolução, proporção, marca d'água, texto sensacionalista, nitidez); `pickCoverAndInline(cands: Candidate[]): { cover?: Candidate; inline?: Candidate }` (inline de outra fonte e `phash` a mais de `DUPLICATE_MAX_DISTANCE` da capa); `inlinePosition(paragraphs: number): number | null` (3 se ≥ 4 parágrafos; 2 se 2 ou 3; `null` com menos de 2); migration: `alter table article_media add column role text not null default 'cover' check (role in ('cover','inline')), add column position int`; `unique (article_id) where role = 'cover'` e `unique (article_id) where role = 'inline'`; `ArticleFigure({ image, captionPrefix = "Reprodução web" })` com legenda "Reprodução web · Fonte" + crédito + link "Ver original".
- Consumes: `checkImage`, `fetchImage`, `watermarkHint`, `isSensationalText`, `phashNeighbors` existentes; política `reproduction` e flag `image_reproduction_enabled`.

- [ ] **Step 1: Testes (vermelho).** `score.test.ts`: maior resolução paisagem vence; marca d'água e título sensacionalista penalizam; retrato perde para paisagem. `pickCoverAndInline`: com 3 candidatas de 3 fontes escolhe capa e inline distintas; duas da mesma fonte não formam par; duas quase iguais (`phash` próximo) não formam par; 1 candidata dá só capa; 0 dá nenhuma. `inlinePosition`: 5→3, 3→2, 1→`null`. `media.test.ts`: o passo baixa até 4 candidatas, grava capa e inline com `role` e `position`, é idempotente e não troca capa aprovada por pessoa. Integração: remoção a pedido de um ativo não derruba o outro. `ArticleFigure`/e2e: capa sob o título e figura depois do parágrafo 3, ambas com "Reprodução web · Fonte", crédito e link; cards só mostram a capa; Review Focus 6.
- [ ] **Step 2: Rodar** e ver falhar.
- [ ] **Step 3: Implementar** a migration (e aplicar em produção só depois de aprovada, com hash conferido), `score.ts`, a nova escolha no passo de imagem (até 4 candidatas, limite de download e `robots.txt` como hoje), a leitura pública com `{ cover, inline }` e a figura no corpo da matéria. Reprocesso: comando que reenfileira o passo `image` das matérias publicadas só com capa ou sem imagem.
- [ ] **Step 4: Rodar** unit, integração, e2e, axe e o teste de CLS (`aspect-ratio` fixo nas duas figuras). **Step 5: Commit** `feat(imagens): capa e imagem no texto com legenda Reprodução web [UI-T16]`.

### Task UI-T14: Conta, favoritos, alertas e legais

**Files:** Modify `perfil`, `favoritos`, `alertas`, `recuperar-senha`, `redefinir-senha`, `privacidade`, `termos`, `metodologia`, `principios-editoriais`, `como-usamos-ia`, `DocPage.tsx`, `AccountShell.tsx`; Test `auth.spec.ts`, `favorites-alerts.spec.ts`, `docs.spec.ts`.

- [ ] **Step 1: Testes.** Grid e 68ch nas legais; todo convite com "Agora não"; estados vazio/erro/sucesso; formulários com rótulo visível e erro com ícone e exemplo.
- [ ] **Step 2–5:** falhar, implementar, rodar, commit `feat(ui): conta e páginas legais no mesmo grid [UI-T14]`.

### Task UI-T15: Gate da UI

**Files:** `docs/reports/ui-publica.md`, `.planning/progress.json`, `.planning/STATE.md`, `.planning/DECISIONS.md`, `.github/workflows/ci.yml` (`design:detect` passa a bloquear).

- [ ] **Step 1:** `pnpm design:shoot`, comparar antes/depois e preencher os 12 critérios da spec §6 com números medidos.
- [ ] **Step 2:** `pnpm verify`, `pnpm test:e2e`, `pnpm test:a11y`, Lighthouse CI nas 6 rotas, `pnpm design:detect` sem avisos.
- [ ] **Step 3:** roteiro de leitor de tela (`docs/runbooks/revisao-leitor-de-tela.md`) nas rotas alteradas; pendência humana em BLOCKERS se ainda não feita.
- [ ] **Step 4:** registrar decisões (A-###: rótulo junto do conteúdo, Google, chat), atualizar `STATE.md` e `progress.json`. **Step 5: Commit** `docs(ui): relatório do gate da UI pública [UI-T15]`.

## Execução e ordem

UI-T0 → UI-T1 ∥ UI-T2 → UI-T3 → UI-T4 → UI-T16 (pipeline e dados, em paralelo com UI-T5) → (UI-T5 ∥ UI-T6) → UI-T7 → (UI-T8 ∥ UI-T9 ∥ UI-T10) → (UI-T12 ∥ UI-T13) → (UI-T11 ∥ UI-T14) → UI-T15. Sugestão de prioridade para o dono ver resultado cedo: UI-T12 (login), UI-T1 (consentimento) e UI-T16 (imagens, o que mais muda a cara das matérias) primeiro, depois UI-T3 e UI-T13 (chat). Em cada grupo, rodar `critique` e `polish` do impeccable antes e depois e registrar os achados no relatório.
