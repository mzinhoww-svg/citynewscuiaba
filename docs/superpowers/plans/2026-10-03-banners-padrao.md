# Banners padrão Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** Campos de banner padrão no site (padrão B), peças genéricas de produtos do CityNews, métricas e administração no Estúdio.
**Architecture:** `ad_slots`/`ad_creatives`/`ad_placements`/`ad_stats`; `selectCreative` puro; `AdSlot` server component; contagem agregada sem identificador; peças PNG geradas por HTML+Playwright com os tokens da marca.
**Tech Stack:** Next.js 16, Supabase, Playwright (render das peças), Vitest.
**Spec:** `docs/superpowers/specs/2026-10-03-banners-padrao-design.md` (campos §2, regras §3, admin §4b; wireframes ao lado). Padrão **B**: TOP, RAIL-A, RAIL-B, MID 1, ART-1, ART-2, STICKY (celular); HUB só com parceiro.

## Global Constraints
- Rótulo "Publicidade" em todo campo; altura reservada (CLS 0); `rel="sponsored noopener"`; `alt` obrigatório.
- Sem anúncio em política, urgência, segurança, saúde sensível, nem em `/estudio`.
- Métricas agregadas por dia, sem identificador de pessoa; clique via rota `/api/ads/click/[placement]` com redirecionamento 302 e contagem.
- Sem IA/"revisado" no texto público; marca "CityNews", "Cuiabá" acentuado; tokens de design, sem hex/px crus em `src/components`.
- Peças genéricas vendem produtos do próprio CityNews: Newsletter diária, Alertas no celular (PWA), Agenda de Cuiabá, Guia Cuiabá, "Anuncie no CityNews", "Envie seu evento". Sem foto de pessoa real, sem logos de terceiros.

## Review Focus
- Campo sem peça deve colapsar ou mostrar house ad, nunca vazio. 
- Duas peças no mesmo campo alternam de forma estável por sessão.
- Matéria de política/urgência não recebe campo. 
- Contagem não dobra em recarga rápida nem conta bot.
- Clique em link inválido nunca quebra a página.

### Task ADS-T1: Banco, seleção e componente
**Files:** `supabase/migrations/0069_ads_slots.sql` (renumerar se já usado), `src/lib/ads/select.ts` + `.test.ts`, `src/lib/ads/stats.ts`, `src/components/editorial/AdSlot.tsx`, `src/app/api/ads/click/[id]/route.ts`, `src/app/api/ads/view/route.ts`.
- [ ] Teste: `selectCreative({slot, section, now, sessionKey, placements})` cobre período, editoria proibida, peso/rotação estável, vazio→house.
- [ ] Migration com RLS (público lê só campanha no ar via view; escrita só `site.manage`), seed dos 8 campos e dos house ads.
- [ ] `AdSlot` com altura reservada por formato, rótulo, fallback; contagem de impressão por `IntersectionObserver` com 1 envio por peça por sessão; clique pela rota de redirecionamento.
- [ ] `pnpm verify`; commit `feat: campos de banner e seleção de peças [ADS-T1]`.

### Task ADS-T2: Posições no site
**Files:** `PublicShell`, home `page.tsx`, página da matéria, rail das editorias, `BottomNav` (STICKY).
- [ ] Montar TOP abaixo do ticker, RAIL-A e RAIL-B na lateral, MID 1 entre módulos da home, ART-1 após o 4º parágrafo, ART-2 antes de Relacionadas, STICKY no celular após 40% de rolagem e dispensável (lembrar em `sessionStorage`).
- [ ] Máximo de campos por tela; sem TOP+STICKY juntos; regra de editoria proibida.
- [ ] Testes de componente e e2e (presença, rótulo, ausência em política); axe; CLS no Playwright.
- [ ] Commit `feat: campos de banner nas páginas públicas [ADS-T2]`.

### Task ADS-T3: Peças genéricas do CityNews
**Files:** `scripts/ads/render-creatives.ts`, `public/ads/*.png` (ou Storage), seed das peças.
- [ ] Renderizar com Playwright, a partir de HTML com tokens da marca, PNGs nos tamanhos 970×250, 728×90, 970×120, 300×250, 300×600, 320×100, 320×50 para 6 mensagens (Newsletter, Alertas, Agenda, Guia Cuiabá, Anuncie, Envie seu evento); texto curto em pt-BR com chamada e link interno; `alt` por peça; peso <= 200 KB.
- [ ] Cadastrar como house ads e como uma campanha "CityNews" no ar em todos os campos.
- [ ] Conferir visualmente 3 peças por screenshot. Commit `feat: peças dos produtos do CityNews [ADS-T3]`.

### Task ADS-T4: Administração e métricas
**Files:** `src/app/estudio/admin/publicidade/*`, `src/components/studio/admin/*`, `src/lib/db/queries/admin-ops.ts`.
- [ ] Abas Painel (mapa de ocupação e alertas), Campanhas, Peças (upload validado), Calendário, Relatórios (impressões, cliques, CTR por campo/dia, CSV), House ads, Auditoria; interruptor "Pausar tudo" com duas pessoas para religar.
- [ ] Testes de validação de peça e do relatório; axe; e2e do fluxo criar campanha → no ar.
- [ ] Commit `feat: administração de banners e métricas [ADS-T4]`.
