# CityNews · Estado atual

**Última atualização:** 2026-10-02 — P0 a P6 concluídos; verify verde (2546 testes). Falta só merge da PR #1 na main, deploy e teste em produção. Pendências do dono em BLOCKERS (B-012, B-013, B-016, B-021, B-022).
**Atualizado por:** Claude Code

> 2026-10-04 · retomada (A-127): UI-T12, UI-T13, HOT-T1..T3, UI-T10, UI-T11, UI-T14 e fechamentos em execução pelo plano `docs/superpowers/plans/2026-10-04-retomada-ui-e-pauta-quente.md` (branch `claude/peaceful-turing-6oaw2k`). TXT-T1..T3 encerradas por outro caminho.

> 2026-10-04 · GUIA-T1..T7 (A-124): Guia Cuiabá integrado à main (PR #34, mergeado e em produção); migrations 0130–0133 aplicadas em produção (30 modelos, 3 crons agendados). Lint e typecheck verdes; testes de integração rodam no CI (sem pilha Supabase local aqui). `TRIPADVISOR_API_KEY` cadastrada (B-025 resolvido); falta só a primeira coleta (cron 03h23 UTC) e a rotação da chave pelo dono.

> 2026-10-04 · ADS-T1 (A-117): campos de banner, seleção, `AdSlot` e contagem (impressão, visualização >= 50% por 1 s, clique), migration 0082. Verify verde (3198 testes). Ainda sem campo montado nas páginas (ADS-T2).

> 2026-10-04 · Estúdio no celular (A-123): menu em gaveta com busca, cabeçalho com a tela atual. Testes unitários verdes (2569) e build verde; integração depende da pilha local (não subiu neste container).

> 2026-10-04 · ADS-T4 (A-122): Publicidade no Estúdio em 4 abas (Campos, Banners com envio de imagem ao Storage, Relatório com CSV, Patrocinados); interruptor `ads_enabled` (migration 0144). Peças da casa no ar em produção (78 veiculações).

> 2026-10-04 · segurança P1 (spec `docs/superpowers/specs/2026-10-04-seguranca-p1-design.md`, branch `claude/saas-security-audit-v2-p5kwh9`): C1-01 `af13470`, C1-03 `59f7d70`, C3-01 `1e26999`, C1-02 `d9c5196` (migration 0143), C4-01 `bb408fd`; main mesclada (`ff028b1`) e CI de destaques/OfflineNotice estabilizado. Verify verde (3513 testes; provedores fora da allowlist cobertos; expurgo C1-02 no projeto de integração). Pendente do dono: B-023 (ligar Confirm email no Supabase de produção; só corrige contas novas). Contas legadas auto-confirmadas e só de magic-link/OTP nunca provam posse: exportação por e-mail null e expurgo mantém newsletter/alertas `email:` (fail-closed aceito); follow-up B-024 (reverificação própria), até lá pedidos LGPD dessas contas são atendidos manualmente. Falta aplicar 0143 em produção.

> 2026-10-04 · ADS-T3 (A-121): 48 peças da casa em `public/ads` e cadastro por `scripts/ads/house-ads.mjs` (78 veiculações). Próxima: ADS-T4.

> 2026-10-04 · ADS-T2 (A-120): campos de banner montados na home, editorias e matéria; tablet com formato próprio, lateral abaixo do "Agora", rodapé fixo empilhado sobre a barra (decisões do dono). Migration 0083. Verify verde (3492 testes); e2e de anúncios 6/6 (desktop, tablet, celular, axe, CLS). Sem peça cadastrada, nada aparece no site.

> 2026-10-04 · ADS-T1 (A-119): campos de banner, seleção, `AdSlot` e contagem (impressão, visualização >= 50% por 1 s, clique), migration 0082. Verify verde (3198 testes). Ainda sem campo montado nas páginas (ADS-T2).

> 2026-10-04 · MS-T2 (A-118): peça tipada por `kind` e anunciante estruturado (migration 0081). Verify verde (3174 testes). Próxima: ADS-T1.

> 2026-10-04 · MS-T1 (A-115): flag `sponsored_native_enabled` e trava do patrocinado nativo (migration 0075), Justiça bloqueada, editoria e assunto sem matéria patrocinada, patrocinado visível no celular. Verify verde (3110 testes); 0075 aplicada em produção em 04/10. Inventário de mídia em `docs/media-slots.md`.

> 2026-10-04 · correção A-114: matéria da HNT com 2 frases. O redator passa a receber o corpo da página da fonte (`enrich` automático para feed curto, `collected_items.source_text`, migration 0074). Branch `claude/fonte-texto-completo`; verify verde (3101 testes). Falta aplicar 0074 em produção junto com o deploy.

## Fase e tarefa

- **Fases prontas:** P0, P1, P3, P2, P4 (5/7).
- **Fase ativa:** P5 Control Center e administração, com o Painel de Fontes (substitui P5-T4) em paralelo.
- **Em andamento:**
  - Painel de Fontes: FS-T1..T9 concluídas, revisadas e mescladas no branch de trabalho (`9ca7d6d`, correções `841a029`; relatório `docs/reports/painel-fontes.md`). Migrations 0011 → 0030 → 0031 → 0032 → 0033 sendo aplicadas em produção (A-065).
  - P5 (worktree `../cn-p5`, branch `p5-control`): T3 e T6 prontas; falta integrar (0027 × painel: vale o painel, R8) e fazer T1, T2, T5 (coberta pelo painel), T7, T8, T9 (sem A09), T10; gate do P5.
  - PWA: spec (`docs/superpowers/specs/2026-09-28-pwa-notificacoes-design.md`) e plano (`docs/superpowers/plans/2026-09-28-pwa-notificacoes.md`, PW-T1..T15) prontos; execução por subagentes agora que o painel entrou.
- **Progresso:** 54/70 tarefas do plano + painel 9/9 + PWA 0/15.

## Próxima ação imediata

1. Conferir produção após as migrations do painel (cron, `/api/ingest/status`, `RATE_LIMIT_SALT`/`CRON_SECRET` na Vercel).
2. Integrar `p5-control` ao branch de trabalho (R8) e concluir P5; gate do P5.
3. Executar o plano do PWA (PW-T1..T15) com subagentes; gate.
4. P6 e relatório final `docs/reports/final.md`.

## Verificação do ambiente (kickoff, 27/09/2026)

| Item | Resultado | Contorno |
|---|---|---|
| Node | v22.22.2 | — |
| pnpm | 10.33.0 | — |
| git | 2.43.0 | — |
| gh CLI | ausente | GitHub pelo conector MCP; push pelo proxy git do container |
| vercel CLI | ausente | Vercel pelo conector MCP (time `mzinhoww-gmailcoms-projects`) |
| supabase CLI | ausente | Pilha local sem Docker (A-017); CI do GitHub usa o CLI oficial |
| docker | ausente | A-017 |
| agent-browser | ausente | Playwright + Chromium pré-instalado (`/opt/pw-browsers`) fazem o roteiro exploratório com screenshots |
| Postgres | 16.13 + pgvector + pg_cron instalados via apt | — |
| Supabase remoto | `citynews-prod` criado (ref `vmvirmemxfdtxfdmivuu`, sa-east-1) após pausar `listada-escola` | A-019 |
| Variáveis de `.env.example` | nenhuma presente (`OPENROUTER_API_KEY` ausente) | `AI_PROVIDER=fake` (A-018, B-008) |
| Branch de trabalho | `claude/keen-hypatia-8qn86r` | A-016 |

## Últimos checkpoints

| Quando | Tarefa | Commit | Resultado |
|---|---|---|---|
| 2026-09-27 | kit | e14a386 | kit importado |
| 2026-09-27 | P0-T1..T6 | 93f0c13 | verify verde, 56 testes |
| 2026-09-27 | P0-T7..T8 | b076479 | verify verde, 178 testes (7 integração) |
| 2026-09-27 | P0-T9..T9b | 9559129 | verify verde, 227 testes; e2e 24/24; axe 0 serious |
| 2026-09-27 | P0-GATE | f734ecb | 356 testes, e2e 24/24, CI verde; tag p0-done |
| 2026-09-27 | P1/P3-GATE | 56516ba | gate P1+P3; tags p1-done/p3-done |
| 2026-09-28 | P2-GATE | 8c4782b | 21 achados corrigidos; 1188 testes; e2e 620; 0020/0021 em produção |
| 2026-09-28 | P4-GATE | 96a31b4 | 20 achados corrigidos; 1272 testes; e2e 722 |
| 2026-09-28 | P5-T3, P5-T6 | 8e16648 (branch p5-control) | 1337 testes; e2e 791 — aguardando merge após o painel |
| 2026-10-04 | SEC-P1 (C1-01..03, C3-01, C4-01) | ver nota do topo | 3509 testes; B-023 pendente do dono |

## Degradados abertos

- P4: geração de imagem por IA (sem gerador configurado).

## Decisão do dono necessária

(nenhuma; pendências de configuração do dono: B-012 repositório público, B-013 service role e CRON_SECRET na Vercel, B-008 chave OpenRouter, B-006 Google OAuth, B-010 secrets do GitHub, B-016 fontes reais pausadas)
