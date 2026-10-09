# Relatório · Agenda rica e distribuição (ARD-T1 a ARD-T7)

Spec: `docs/superpowers/specs/2026-10-08-agenda-rica-e-distribuicao-design.md`. Plano: `docs/superpowers/plans/2026-10-08-agenda-rica-e-distribuicao.md`. Decisão: A-221.

Execução por subagentes, com revisão de especificação e qualidade a cada tarefa (ARD-T1 a T6), rodadas de correção até a aprovação e revisão final do branch inteiro.

## Critérios de aceite (spec §10)

| # | Critério | Evidência |
|---|---|---|
| 1 | Evento coletado com imagem mostra a foto com "Foto: reprodução web · fonte" e link; flag desligada não baixa nada | `src/lib/media/external.ts` + `external.test.ts` (host, redirect, IP, tamanho, flag sem fetch, dedupe, bloqueado); `src/lib/agenda/images.ts` + `collect.test.ts` (teto, rodízio); `tests/integration/external-media.test.ts`; `EventCard.test.tsx`, `EventDetail`; `tests/e2e/agenda-rica.spec.ts` |
| 2 | Página do evento mostra organizador e faixa; filtro por faixa funciona | `src/lib/agenda/age-rating.test.ts`; `src/lib/filters/agenda.ts` + testes; `tests/e2e/agenda-rica.spec.ts` |
| 3 | Evento casado com lugar do Guia mostra "Ver no Guia"; o lugar mostra os próximos eventos | `src/lib/agenda/venue-match.test.ts`; `tests/integration/venue-events.test.ts`, `agenda-venue-candidates.test.ts`; `VenueEvents` |
| 4 | Estúdio destaca até uma data; aparece primeiro na home e na Agenda | `tests/integration/agenda-feature.test.ts`; `home.ts` (`featuredFirst`) + testes; `tests/e2e/agenda-rica.spec.ts` |
| 5 | Toda quinta a edição sai em `/newsletter/agenda/{data}`; sem provedor fica `aguardando_provedor` | `src/lib/newsletter/agenda-edition.test.ts`, `run-edition.test.ts`, `email-html.test.ts`, `sender.test.ts`; `tests/integration/newsletter-agenda.test.ts`; `tests/e2e/newsletter-agenda.spec.ts`; cron em `0203` |
| 6 | Toda segunda o pacote Instagram aparece no Estúdio com PNGs 1080×1350, legenda e créditos; aprovar libera o ZIP | `src/lib/social/*.test.ts` (seleção, PNG 1080×1350, texto longo, legenda); `tests/integration/social-agenda.test.ts` (rota, papéis, ZIP, gatilho 0208); `tests/e2e/social-agenda.spec.ts` |
| 7 | `pnpm verify` verde; axe sem serious/critical nas telas novas | `pnpm verify` em banco limpo (ver fim); axe 360/768/1280 em `agenda-rica.spec.ts`, `newsletter-agenda.spec.ts`, `social-agenda.spec.ts` |

## Pendências

- Produção: aplicar 0200 a 0208 (ver A-221 e STATE). A 0205 também esconde do público imagem de matéria retirada ou vencida (regra D-02).
- B-005: provedor de e-mail. Antes de ligar: trava de envio, descadastro sem validade com `List-Unsubscribe` e a mensagem de link expirado.
- Fotos de eventos com a flag `image_reproduction_enabled`: o aviso não é autorização (B-002).
- `src/lib/db/types.ts` ajustado à mão com as colunas e funções novas.
