# Agenda rica e distribuição (B + C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evento com imagem (reprodução web), organizador, faixa etária, vínculo com o Guia, destaque e salvar; newsletter "Agenda do fim de semana" montada toda quinta; pacote Instagram "Agenda da semana" no Estúdio.

**Architecture:** Colunas novas em `event_listings` alimentadas pelo coletor do subprojeto A (`src/lib/agenda/collect*.ts`) e pelo Estúdio (`/estudio/agenda`); imagem pelo Media Registry com um helper extraído do fluxo do Guia; newsletter e pacote social como tabelas próprias montadas por jobs com `CRON_SECRET` e funções puras de montagem; PNGs com `satori` + `@resvg/resvg-js` no servidor.

**Tech Stack:** Next.js App Router, TypeScript strict, Supabase (Postgres, RLS, Storage, pg_cron), Vitest, Playwright, axe, sharp, satori, @resvg/resvg-js.

**Spec:** `docs/superpowers/specs/2026-10-08-agenda-rica-e-distribuicao-design.md`

## Global Constraints

- Branch `claude/agenda-rica-distribuicao`; migrations a partir de `0200`; decisão `A-221` em `.planning/DECISIONS.md` (escrita na T7).
- `pnpm verify` verde antes de cada commit de fim de tarefa (capturar o código de saída real; banco local recriado com `pnpm db:reset` antes). Commit com `[ARD-T#]`.
- Sem `any`, sem `@ts-ignore`; `Result<T, E>`; textos em `src/content/pt-BR/*.ts`; tokens em componentes (sem hex/px crus em `src/components`; as cores da marca do pacote Instagram ficam num módulo de render server-only fora de `src/components`).
- Tela pública: nunca "IA", "gerado", "normalizado"; imagem de terceiros sempre com "Foto: reprodução web · {fonte}" e "Ver original"; sem emoji.
- Fixtures fictícias (`*.example`), `AI_PROVIDER=fake`, `CRAWLER_FIXTURES=1` nos e2e; segredos de teste com 32+ caracteres.
- Faixas etárias exatas: `livre`, `10`, `12`, `14`, `16`, `18`, `consulte`.
- Imagem: só `https`, largura ≥ 400 px, 1 por evento, teto 20 por execução, respeita `image_reproduction_enabled`.
- Newsletter: lista `agenda-fds`, sexta a domingo, até 12 itens, mínimo 3; status `draft|published|aguardando_provedor|sent|failed`.
- Instagram: PNG 1080×1350; até 6 eventos, máx. 2 por local; cores `#111111`, `#FFFFFF`, `#F2C94C`, `#F58220`, `#969696`; aviso final "Confirme horários e valores na fonte oficial antes de sair de casa.".
- Crons: `newsletter-agenda` `45 15 * * 4` (UTC); `social-agenda` `0 12 * * 1` (UTC).

## Review Focus

1. Imagem de host diferente da página (hotlink, CDN, redirect para outro domínio) — aceitar só host registrável da página ou CDN referenciada na própria página; redirect para fora rejeitado. Teste em T2.
2. Evento editado no Estúdio (organizer/age/media travados) e coletado de novo — nada sobrescrito. Teste em T2.
3. Fim de semana sem eventos ou só com eventos retirados — edição fica `draft`, nada publicado. Teste em T5.
4. Semana sem imagens — pacote sai com fundo liso, sem quebrar o render; texto longo não estoura o slide (corte com reticências não, quebra de linha e redução de corpo até um mínimo). Teste em T6.
5. Local com nome ambíguo no Guia (dois "Teatro Municipal") — sem vínculo automático. Teste em T3.

---

### Task 1 (ARD-T1): Banco

**Files:** Create `supabase/migrations/0200_event_rich_fields.sql`, `0201_newsletter_editions.sql`, `0202_social_packages.sql`, `0203_agenda_distribution_cron.sql`; modify `src/lib/db/types.ts` (à mão no formato do gerador, se `pnpm db:types` divergir), `src/lib/audit/actions.ts`; test `tests/integration/agenda-rich-schema.test.ts`.

- `event_listings`: `media_id uuid references media_assets(id) on delete set null`, `organizer text`, `venue_id uuid references venues(id) on delete set null`, `featured_until timestamptz`; `update event_listings set age_rating = 'consulte' where age_rating not in (...)`; check `event_listings_age_rating_check`.
- `newsletter_editions` e `social_packages` como na spec §3, RLS: `newsletter_editions` leitura pública para `status in ('published','aguardando_provedor','sent')`; `social_packages` só seção `agenda` (mesmo predicado de escrita de `event_listings`); bucket Storage privado `social-packages`.
- Auditoria: `event.feature`, `social.approve`, `social.publish`, `social.discard` em `studio_audit_actions()` (união, como 0198) e em `AGENDA_AUDIT_ACTIONS`.
- Cron: dois jobs pg_cron no molde de `agenda-collect` (vault `app_url`/`cron_secret`), só se `pg_cron`/`pg_net` existirem.
- [ ] Teste de integração (falha): check de faixa recusa `'adulto'`; anônimo lê edição `published` e não lê `draft`; anônimo não lê `social_packages`; colunas novas existem.
- [ ] Migrations, `db:reset`, tipos, verify. Commit `feat(agenda): campos ricos, edições e pacotes sociais no banco [ARD-T1]`.

### Task 2 (ARD-T2): Imagem, organizador e faixa no coletor

**Files:** Create `src/lib/media/external.ts` (+ test); modify `src/lib/guide/venue-media.ts` (usa o helper), `src/lib/agenda/types.ts` (`RawEvent.imageUrl?`, `organizer?`, `ageRating?`; `NormalizedEvent.imageUrl`, `organizer`, `ageRating`, `mediaId`), extratores `jsonld.ts`, `tribe.ts`, `ai-page.ts` (organizador e faixa com trecho; `og:image` lido do HTML pelo código, não pela IA), `normalize.ts`, `merge.ts` (`LOCKABLE_COLUMNS` += `organizer`, `age_rating`, `media_id`), `collect*.ts`/`reconcile.ts` (registro de imagem com teto 20), `src/lib/db/agenda-store.ts` (grava as colunas).
- `registerExternalImage(deps, { url, pageUrl, sourceName }): Promise<Result<{ mediaId: string }, 'flag_off'|'host'|'size'|'type'|'fetch'|'blocked'>>`.
- `normalizeAgeRating(text): AgeRating` (`"livre"`, `"16 anos"`, `"classificação 14"` → valores fechados; resto `consulte`).
- [ ] Testes (falham): host diferente/redirect para outro domínio → `host`; 300 px → `size`; flag desligada → `flag_off` sem fetch; mesmo sha → mesmo `mediaId`; Tribe e JSON-LD trazem organizador e imagem; `ai_page` traz organizador e faixa só com trecho; reconciliação respeita `organizer`/`age_rating`/`media_id` travados; teto 20 por execução.
- [ ] Implementação, verify. Commit `feat(agenda): imagem, organizador e faixa etária na coleta [ARD-T2]`.

### Task 3 (ARD-T3): Vínculo com o Guia

**Files:** Create `src/lib/agenda/venue-match.ts` (+ test); modify coletor (`venue_id` na gravação), `src/lib/db/queries/events.ts` (`EventView.venueSlug`), Guia `src/app/(public)/guia-cuiaba/lugar/[slug]/page.tsx` (seção "Próximos eventos aqui", até 5), query `upcomingEventsAtVenue(venueId)`.
- `matchVenue(text: string, venues: {id, name, status}[]): string | null` — fold, remove prefixos (`teatro`, `espaco`, `casa`, `centro`) só para comparar, igualdade ou similaridade ≥ 0,9 com candidato único ativo.
- [ ] Testes: exato, com acento, prefixo, ambíguo → null, inativo → null; página do lugar mostra evento futuro e não mostra retirado.
- [ ] Implementação, verify. Commit `feat(agenda): evento ligado ao lugar do Guia [ARD-T3]`.

### Task 4 (ARD-T4): Tela pública e Estúdio

**Files:** `src/components/editorial/EventCard.tsx` (miniatura + crédito), `src/app/(public)/agenda/[slug]/page.tsx` (imagem com `ImageCaption`, fato "Organização", faixa, "Ver no Guia", `SaveEventButton`), `src/app/(public)/agenda/page.tsx` (faixa "Em destaque", filtro `?idade=`), `src/lib/filters/agenda.ts`, `src/lib/db/queries/events.ts` (+ `home.ts`: destacados primeiro, até 3), Estúdio `EventForm` (organizador, faixa, local do Guia), ações "Destacar até" / "Tirar destaque" (`event.feature`), textos em `src/content/pt-BR/portal-agenda.ts` e `studio-agenda.ts`.
- [ ] Testes: filtro de faixa (≤ escolhida; `consulte` só sem filtro); card e página com legenda "Foto: reprodução web · Fonte" e "Ver original"; destaque vencido não aparece; e2e de destacar e de faixa; axe 360/768/1280.
- [ ] Implementação, verify, e2e/axe. Commit `feat(agenda): imagem, organizador, faixa, Guia e destaque nas telas [ARD-T4]`.

### Task 5 (ARD-T5): Newsletter "Agenda do fim de semana"

**Files:** Create `src/lib/newsletter/agenda-edition.ts` (`buildAgendaEdition`, `weekendRange(now)`), `src/lib/newsletter/email-html.ts` (`renderEditionEmail(edition): { html, text }`), `src/lib/newsletter/sender.ts` (`EmailSender`, `noProviderSender`), `src/lib/db/newsletter-editions.ts`, `src/app/api/jobs/newsletter-agenda/route.ts`, `src/app/(public)/newsletter/agenda/[data]/page.tsx`; modify `src/app/(public)/newsletter/page.tsx` (amostra = última edição).
- [ ] Testes: < 3 eventos → `draft`; retirados fora; ordem dia/confirmados; HTML sem `<script>`, com link de descadastro e versão texto; rota exige `CRON_SECRET` e é idempotente por `(list, edition_date)`; sem provedor → `aguardando_provedor`; página pública renderiza e passa no axe e no vocabulário.
- [ ] Implementação, verify. Commit `feat(newsletter): edição automática da Agenda do fim de semana [ARD-T5]`.

### Task 6 (ARD-T6): Pacote Instagram no Estúdio

**Files:** add deps `satori`, `@resvg/resvg-js` (server-only); create `src/lib/social/pick-week.ts`, `src/lib/social/slides.tsx` (JSX → SVG → PNG), `src/lib/social/caption.ts`, `src/lib/db/social-packages.ts`, `src/app/api/jobs/social-agenda/route.ts`, `src/app/estudio/agenda/instagram/page.tsx` (+ `actions.ts`, `loading.tsx`, `error.tsx`), ZIP download route; fonts Liberation (licença OFL/GPL-exception no repo, como no pacote do Radar) em `src/lib/social/fonts/`.
- [ ] Testes: seleção (até 6, máx. 2 por local, com imagem primeiro); PNG 1080×1350 (ler header); texto longo quebra e reduz até mínimo; sem imagem → fundo liso; legenda com créditos e aviso, sem emoji; aprovar exige papel da seção e audita; ZIP só depois de aprovado; e2e de aprovar/baixar; axe.
- [ ] Implementação, verify. Commit `feat(social): pacote Agenda da semana para o Instagram [ARD-T6]`.

### Task 7 (ARD-T7): Fechamento

- [ ] `.planning/DECISIONS.md` A-221 (E1–E4 e decisões de implementação), `STATE.md`, `docs/screens.md` (telas novas), `docs/reports/agenda-rica-distribuicao.md` (critérios §10 → evidência).
- [ ] `pnpm verify`, e2e e axe completos; PR; merge; aplicar 0200–0203 em produção pelo conector (partes sem `drop`); conferir no ar.
