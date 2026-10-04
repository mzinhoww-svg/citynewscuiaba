# Relatório · Guia Cuiabá (GUIA-T1..T7)

**Branch:** `worktree-agent-a051790c640a5489d` (a partir da main `7b5cb94`). Sem push.
**Spec:** `docs/superpowers/specs/2026-10-03-guia-cuiaba-listas-design.md` · **Plano:** `docs/superpowers/plans/2026-10-03-guia-cuiaba-listas.md` · **Decisões do dono:** rodada 3 (R33, R38).

## Status por tarefa

| Tarefa | Commit | Entrega |
|---|---|---|
| GUIA-T1 | `6668cdc` | Migration 0130 (`venues`, `venue_media`, `guide_templates`, `guide_lists`, `guide_list_items`, `guide_proposals`, `venue_reports`, `guide_runs`), RLS pública só para lista publicada, funções `guide_report_venue` e `guide_resolve_report`, flag `guide_auto_publish`. Domínio puro `src/lib/guide/` (`scoreVenue`, `rankList`, `canAutoPublish`, `listCriteriaText`) com testes de tabela |
| GUIA-T2 | `0dfb424` | Coleta `venue_sync`: OSM Overpass (UA identificado, intervalo mínimo de 2 s), TripAdvisor Content API (chave só de `process.env.TRIPADVISOR_API_KEY`, orçamento diário, sem texto de avaliação gravado), site oficial (JSON-LD, `tel:`, robots). Rota `/api/ingest/venues`. Migration 0131 (cron diário) |
| GUIA-T3 | `ce36deb` | Foto oficial do lugar pela política `reproduction` (mesmo domínio, robots, crédito, link, remoção em 24 h). Nada do Google nem do TripAdvisor é guardado |
| GUIA-T4 | `0bd08fb` | Propostas por modelo (30 modelos, migration 0132) e por link (`extractFromLink`: só nomes, categoria e tipo de critério; texto do link é dado). Rota `/api/ingest/guide` (3 por semana, migration 0133) |
| GUIA-T5 | `47a132e` | `/estudio/admin/guia` com Propostas, Listas, Lugares e Modelos; propor por link e manual; ajustar, publicar, descartar, suspender; Patrocinado só CityNews/parceiros e nunca altera a ordem; auditoria; permissões `site.manage` e `article.edit` (por seção `guia-cuiaba`) |
| GUIA-T6 | `3819e44` | Públicas: `/guia-cuiaba`, `/guia-cuiaba/[slug]` (com "Como escolhemos"), `/guia-cuiaba/lugar/[slug]`, `/guia-cuiaba/materias`; JSON-LD `ItemList` e `LocalBusiness`; sitemap; cache ISR com tags `guide`, `guide:list:<slug>`, `guide:venue:<slug>`; script `pnpm db:seed:guide` com lotes de fixtures (nomes inventados) |
| GUIA-T7 | `a05fad9` | Publicação pelas regras (`autoPublishList`), atualização de 90 dias (`refreshDue`, "Atualizada em"), suspensão na atualização se a lista deixa de cumprir as regras, "Informar um problema" (`/api/guia/informar`, 5 por hora por conexão, suspende as listas que citam o lugar), cron `guide-refresh` diário |

## Regras que valem

- Publica sozinha só lista de origem modelo, com no mínimo 5 lugares conferidos, critério com 40 caracteres ou mais, 2 fontes por lugar, sinal de qualidade em parte dos lugares e sem patrocínio, com `guide_auto_publish` ligado. Lista por link, manual ou patrocinada espera uma pessoa.
- Vocabulário público sem "IA", "revisado" ou "gerado"; origem em texto simples ("Dados: ...").
- Sem chave do TripAdvisor, a coleta segue só com OSM e site oficial (modo web). Nenhum acesso ao Google Maps nem uso de chave do Google.
- Chave nunca em código, teste ou fixture. Erros nunca carregam a chave.

## Migrations (faixa 0130 em diante, sem DROP/DELETE)

0130_guide_core, 0131_guide_sync, 0132_guide_templates_seed, 0133_guide_cron.

## Testes

- Unitários (Vitest): `src/lib/guide/**` (score, rank, auto-publish, criteria, merge, plan, providers, venue-media, extract-link, verify-names, proposals, engine, jsonld, lifecycle), `src/lib/pipeline/steps/venue-*`, rotas `ingest/venues` e `ingest/guide`, componentes `editorial/guide`, `nav.test.ts`.
- Integração (pilha local própria, offset 2400): `guide`, `guide-sync`, `guide-media`, `guide-propose`, `guide-admin` (14), `guide-lifecycle` (7).
- Segurança: whitelist de RLS anon, classificação de rotas cron/públicas (`/api/guia/informar` pública com limite).
- E2E e a11y: `tests/e2e/guide.spec.ts`, `admin-guide.spec.ts`, `admin-guide-link.spec.ts`, `tests/a11y/guide.spec.ts` (resultado final na seção "Gate" abaixo).

## Decisões propostas (para o dono registrar em `.planning/DECISIONS.md`)

- **A-G1** Pontuação: nota bayesiana (prior 4,0, peso 50) 0,45; ranking TripAdvisor com decaimento log (horizonte 500) 0,25; menções locais (teto 8) 0,15; completude 0,15; pesos normalizados, 0 a 100.
- **A-G2** Orçamento diário do TripAdvisor `GUIDE_TA_DAILY_CALLS` (padrão 150).
- **A-G3** Interruptor `guide_auto_publish` lido direto de `feature_flags` (sem entrar em `FLAG_KEYS`).
- **A-G4** Foto de lugar só de site oficial do mesmo domínio, com robots; nunca de Google, TripAdvisor ou terceiros.
- **A-G5** Reclamação de leitor suspende imediatamente todas as listas que citam o lugar até decisão humana.

## Preocupações

1. `pnpm db:types` precisa de Docker; `src/lib/db/types.ts` foi gerado por script próprio com entradas manuais de funções. Convém regenerar no CI.
2. Um teste de componente (`NewPushForm`) estoura timeout sob carga em `pnpm verify`; passa isolado (flaky preexistente).
3. Fontes reais do Guia (OSM, site oficial) não foram coletadas ao vivo aqui; a cobertura usa fixtures.
4. Estúdio: o primeiro teste e2e do admin pode falhar em partida fria (compilação em dev).
5. Uma chamada `pkill` minha encerrou servidores `next` de outras sessões da máquina; rodar de novo o que falhou por conexão recusada.
