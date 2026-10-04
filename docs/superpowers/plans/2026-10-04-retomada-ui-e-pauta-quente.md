# Retomada da UI pública e da pauta quente · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (com superpowers:dispatching-parallel-agents nas ondas) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar as tarefas pendentes dos planos de 02 e 03/10 (login, chat, pauta quente, fontes, marketing, conta e os dois fechamentos), com as correções de desvio da spec de retomada.

**Architecture:** Cada tarefa é a do plano-mãe, executada como lá está escrita, salvo as emendas abaixo. As tarefas de UI ficam em `src/components/editorial` e `src/components/ai`, com textos em `src/content/pt-BR`. A pauta quente acrescenta o domínio puro `src/lib/featured/hot.ts`, o passo `frontpage` do pipeline e a gravação de pinos `kind='hot'`, que o `resolveSlot` já sabe ler.

**Tech Stack:** Next.js 16 (RSC), TypeScript strict, Tailwind v4 com tokens, Supabase (Postgres, RLS, pg_cron, pg_net), Vitest, Testing Library, Playwright, axe, linkedom.

**Spec:** `docs/superpowers/specs/2026-10-04-retomada-ui-e-pauta-quente-design.md`, que remete a `2026-10-02-ui-publica-design.md` e `2026-10-03-destaques-e-profundidade-design.md`.

**Planos-mãe (fonte dos passos detalhados):** `docs/superpowers/plans/2026-10-02-ui-publica.md` (UI-T10 a T15) e `docs/superpowers/plans/2026-10-03-destaques-e-profundidade.md` (HOT-T1 a T3, GATE).

## Global Constraints

- CLAUDE.md §5 inteiro, em especial §5.2 (login nunca obrigatório, "Agora não"/"Continuar sem entrar") e §5.3 (nenhuma tela pública diz "IA", "inteligência artificial", "normalizado", "gerado por IA"; o aviso do chat é "Pode conter erros. Confira nas fontes.").
- Regra 5: o chat nunca responde sem fonte; com menos de 2 fontes relevantes, recusa e oferece "Buscar do jeito tradicional".
- Só tokens em `src/components` (ESLint bloqueia hex e px crus). Única exceção: `public/brand/google-g.svg`, com as cores oficiais do Google.
- Alvos ≥ 44 px; botão do Google com 56 px (`min-h-14`); contraste ≥ 4,5:1 no texto e ≥ 3:1 na borda do botão branco.
- Pauta quente: ≥ 3 fontes distintas (`hot_min_sources`, padrão 3), rank ≤ 3, janela de 6 h; pino de 3 h, renovável até o teto de 12 h; só eleva matéria **já publicada** e não patrocinada; nunca publica nem tira de revisão.
- `frontpage`: GET identificado como CityNewsBot, `robots.txt` respeitado, limite por hora da fonte, até 512 KB; guarda só URL, posição e hora; cron a cada 20 min.
- Migrations: 0151 (aditiva e idempotente: `front_signals`, `featured_items.topic_id`, `featured_items.dismissed_at`, flags `hot_featured_enabled` ligada e `hot_min_sources` = 3, cron `ingest-frontpage`) e 0152 (só `front_signals_purge()` com `delete` e o agendamento dela; aplicada pelo dono no SQL Editor).
- TDD: teste vermelho antes. Commits Conventional com o ID da tarefa. `pnpm lint && pnpm typecheck && pnpm test` verdes por tarefa e `pnpm build` no fechamento de cada onda.

## Review Focus

1. Provedor Google desligado (`AUTH_GOOGLE_ENABLED` ausente): login e cadastro sem botão, sem divisor e sem a frase de indisponível (UI-T12, teste unitário com `google = null`).
2. Chat com rede caindo no meio do stream, ou stream que termina sem o evento `answer`: o turno vira `error` com "Tentar de novo" e o campo volta a aceitar a pergunta (UI-T13, `useAskStream.test.ts`).
3. Chat sem JS: o formulário `GET /pergunte?q=` atual continua respondendo (UI-T13, e2e com `javaScriptEnabled: false`).
4. Uma mesma fonte com três links no topo conta como 1 fonte, e uma URL sem item coletado não conta (HOT-T1 `detectHot` e HOT-T2).
5. Pino quente nunca vence pino manual vigente e nunca aponta para matéria despublicada ou patrocinada. Pauta dispensada não volta pelo mesmo sinal (HOT-T3 `hot-pin.test.ts`).

---

## Onda 0: rastreio

### Task R0: Planos no `progress.json`

**Files:** Modify `.planning/progress.json`, `.planning/STATE.md`, `.planning/DECISIONS.md`.

- [ ] **Step 1:** acrescentar em `progress.json` as chaves `uiPublica` (tarefas UI-T0 a T16, com as feitas marcadas pelos commits existentes) e `destaques` (BTN-T1, ART-T1, FD-T1 a T4, LAB-T1, CONF-T1 feitas; TXT-T1 a T3 `superseded` com referência a A-114, R41/AUT-T4 e A-126; CONF-T2, CONF-T3, HOT-T1 a T3 e GATE pendentes).
- [ ] **Step 2:** registrar em `DECISIONS.md` a A-133 (TXT-T1 a T3 encerradas por outro caminho; R22 por portais nacionais fora desta rodada; HOT com numeração 0151/0152) e uma nota no topo do `STATE.md`.
- [ ] **Step 3: Commit** `docs: planos da UI e dos destaques no progress.json [R0]`.

## Onda 1 (paralela): UI-T12 ∥ UI-T13 ∥ HOT-T1

### Task UI-T12: Login e cadastro com o Google em destaque

Exatamente como no plano-mãe (`2026-10-02-ui-publica.md`, UI-T12: arquivos, interfaces e passos 1 a 5), com estas emendas:
- O SVG do "G" é o logotipo oficial de 4 cores, com viewBox 0 0 48 48 e `width`/`height` definidos por classe de token no `<img>`.
- Os 3 benefícios e o rodapé "Continuar sem entrar" ficam no `AccountShell` só quando a página passa a prop nova `benefits` (login e cadastro). As demais páginas de conta não mudam nesta tarefa.
- O texto `googleOff` sai de `account.ts`, e o teste garante que nenhuma página de conta contém "não está disponível".

### Task UI-T13: Pergunte ao CityNews como chat

Exatamente como no plano-mãe (UI-T13), com estas emendas:
- `useAskStream` lê o NDJSON atual: `{"type":"status","step":"sources"}` e depois `{"type":"answer", answer, aiOff, limit}`. O indicador de passos é local ("Buscando fontes", "Comparando" depois de 2 s, "Escrevendo" depois de 5 s) e termina quando chega o `answer`. `aiOff = true` vira o turno `off`; `limit` com `remaining = 0` vira `rate_limited`.
- O histórico local (IndexedDB) fica atrás de `hasConsent("personalization")`, com o mesmo helper de consentimento já usado pelos favoritos. Sem consentimento, a conversa vive só na memória da aba.
- A página continua RSC. O fallback sem JS (`?q=` renderizado no servidor) é mantido, e o chat client é carregado por `next/dynamic` só nesta rota.

### Task HOT-T1: Sinal dos portais e pauta quente no domínio

Como no plano-mãe (HOT-T1), com estas emendas:
- Migration `supabase/migrations/0151_hot_signals.sql`, que **não** recria `featured_items.kind` (já existe na 0090). Ela acrescenta `topic_id uuid null references topics(id)` e `dismissed_at timestamptz null`; cria `front_signals(id uuid pk default gen_random_uuid(), source_id uuid not null references sources(id) on delete cascade, topic_id uuid null, item_id uuid null, url text not null, rank int not null check (rank between 1 and 10), seen_at timestamptz not null default now())` com índice `(topic_id, seen_at)`; liga RLS sem policy para anon/authenticated (só o service role escreve e lê); grava as flags `hot_featured_enabled` (true) e `hot_min_sources` (3) no mesmo mecanismo de `feature_flags` já usado pelos interruptores. O cron `ingest-frontpage` (`*/20 * * * *`, `pg_net` com `CRON_SECRET`, no mesmo formato dos crons existentes) entra aqui, apontando para a rota da HOT-T2.
- `supabase/migrations/0152_front_signals_purge.sql`: `front_signals_purge()` apaga linhas com mais de 7 dias, mais o agendamento diário dela.
- O domínio `src/lib/featured/hot.ts` é exportado em `src/lib/featured/index.ts`. Os tipos e assinaturas são os do plano-mãe (`FrontSignal`, `HotTopic`, `detectHot`, `supportScore`).
- Teste de integração `tests/integration/hot-signals.test.ts` (roda no CI): anon não lê `front_signals`.

## Onda 2 (paralela): HOT-T2 ∥ UI-T10 ∥ UI-T11 ∥ UI-T14

### Task HOT-T2: Passo `frontpage`

Como no plano-mãe (HOT-T2). Correções de caminho: a rota é `src/app/api/ingest/frontpage/route.ts` (Bearer `CRON_SECRET`, mesmo guard de `src/app/api/ingest/tick`); `checkRobots` e `crawlGet` vêm de `src/lib/pipeline/http.ts`; a canonicalização usa `src/lib/pipeline/canonical-url.ts`. O passo grava em `front_signals` por meio de uma porta nova `FrontSignalRepo.record(signals)` em `ports.ts`, implementada em `src/lib/db/`. O `topic_id` vem do item casado (`collected_items` → tópico).

### Task UI-T10: Fontes e Panorama

Exatamente como no plano-mãe (UI-T10).

### Task UI-T11: Marketing e institucional

Exatamente como no plano-mãe (UI-T11). Sem Framer Motion: blocos em Tailwind com tokens, e a animação, quando houver, fica atrás de `motion-safe:`.

### Task UI-T14: Conta, favoritos, alertas e legais

Exatamente como no plano-mãe (UI-T14). Começa depois que a UI-T12 estiver integrada (as duas mexem em `AccountShell`).

## Onda 3: HOT-T3

### Task HOT-T3: Pauta quente vira destaque

Como no plano-mãe (HOT-T3), com estas emendas:
- `resolveSlot` **já** aceita `hot` e devolve `source: "hot"` (`src/lib/featured/resolve.ts`). A tarefa só passa a alimentar `hot` em `src/lib/db/queries/featured.ts`, lendo `featured_items` com `kind='hot'`, ativos e `dismissed_at is null`. O pino manual continua lido como hoje (`kind='manual'`).
- `applyHotPins` é chamado no fim do handler `tick` e depois do `publish` (idempotente), lendo `hot_featured_enabled` e `hot_min_sources` das flags.
- O rótulo público "Em alta em Cuiabá" é texto de chamada sobre o título, sem plaqueta (CLAUDE.md §5.3: plaqueta só de origem). No Estúdio, a pílula diz "Em alta · n portais" e o botão "Dispensar" grava `dismissed_at`, com auditoria `featured.dismiss_hot`.
- O interruptor `hot_featured_enabled` aparece em Interruptores (`src/lib/studio/switches.ts`, `src/content/pt-BR/switches.ts`).

## Onda 4: fechamentos

### Task UI-T15: Gate da UI

Como no plano-mãe (UI-T15). As capturas usam `pnpm design:shoot` com o servidor local e o seed fictício. Os critérios que dependem de produção (Lighthouse em produção, leitor de tela humano) vão para `BLOCKERS.md` como pendência, se não puderem ser medidos aqui.

### Task GATE: Fechamento de destaques e profundidade

Como no plano-mãe (GATE), com estas emendas: a Step 3 ("Aprofundar matérias curtas") sai, porque já foi feita pela A-126. As Steps 2 (aplicar 0151 em produção, ligar `consumption.frontpage` nas fontes com `robots.txt` permitindo `/`, conferir o lead em dois reloads) ficam para depois do merge da PR e entram no relatório como próxima ação. CONF-T2 e CONF-T3 seguem pendentes, registradas no relatório e no `progress.json`.
