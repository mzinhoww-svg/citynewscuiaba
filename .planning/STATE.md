# CityNews · Estado atual

**Última atualização:** 2026-09-28T02:30-04:00
**Atualizado por:** Claude Code

## Fase e tarefa

- **Fases prontas:** P0, P1, P3, P2, P4 (5/7).
- **Fase ativa:** P5 Control Center e administração, com o Painel de Fontes (substitui P5-T4) em paralelo.
- **Em andamento:**
  - Painel de Fontes (worktree `../cn-fs`, branch `painel-fontes`, plano `docs/superpowers/plans/2026-09-27-painel-de-fontes.md`): FS-T1..T6 concluídas; FS-T7 em re-revisão; faltam FS-T8, FS-T9 e a revisão final. Ledger: `../cn-fs/.superpowers/sdd/2026-09-27-painel-de-fontes/progress.md`.
  - P5 (worktree `../cn-p5`, branch `p5-control`): T3 e T6 prontas; T1, T2, T5, T7, T8, T9, T10 esperam o merge do painel (que cria `src/lib/approvals`). Conflito conhecido: 0027 do P5 duplica a pausa automática do painel — vale a do painel (ruling R8).
  - Migrations do P4 (0015–0019, 0022–0026) sendo aplicadas em produção.
  - PWA (pedido do dono em 28/09): brainstorming com partes 1 (instalação, offline, convites) aprovada e 2 (envio e A09) apresentada; spec a escrever (A-061).
- **Progresso:** 54/70 tarefas do plano + painel 6/9.

## Próxima ação imediata

1. FS-T7 aprovada → FS-T8 (nova fonte e detalhe) → FS-T9 (verificação) → revisão final → merge do painel no branch de trabalho; aplicar 0011 e 0030–0032 em produção.
2. Merge de `p5-control` resolvendo 0027 × painel; P5-T1 (estende `src/lib/approvals`), T2, T5, T7, T8, T9 (sem A09, que vem do PWA), T10; gate do P5.
3. Spec + plano do PWA; execução por subagentes.
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

## Degradados abertos

- P4: geração de imagem por IA (sem gerador configurado).

## Decisão do dono necessária

(nenhuma; pendências de configuração do dono: B-012 repositório público, B-013 service role e CRON_SECRET na Vercel, B-008 chave OpenRouter, B-006 Google OAuth, B-010 secrets do GitHub, B-016 fontes reais pausadas)
