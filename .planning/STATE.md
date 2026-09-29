# CityNews · Estado atual

**Última atualização:** 2026-09-28
**Atualizado por:** Claude Code

## Fase e tarefa

- **Fase ativa:** P5 Control Center e administração
- **Tarefa ativa:** P5-T5 Agentes, modelos, prompts e playground
- **Próxima tarefa:** P5-T6 ∥ T7 ∥ T8 ∥ T9, depois T10 e gate
- **Progresso:** 58/70 tarefas · P0 a P4 concluídas · P5 T1–T4 prontas

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

## Próxima ação imediata

1. Container novo precisa de `pnpm install`, `pnpm db:start` e `pnpm db:reset` antes dos testes de integração.
2. P5: T1–T4 prontas (T4 = painel de fontes, plano FS-T1..T9, migrations 0011/0030/0031). Falta T5 → (T6 ∥ T7 ∥ T8 ∥ T9) → T10 + gate. E2E com fixtures roda em `next dev` (projetos `fixtures-*`, A-160).
3. Branch de trabalho desta sessão: `claude/optimistic-ramanujan-ckpt98`.

## Últimos checkpoints

| Quando | Tarefa | Commit | Resultado |
|---|---|---|---|
| 2026-09-27 | kit | e14a386 | kit importado |
| 2026-09-27 | P0-T1..T6 | 93f0c13 | verify verde, 56 testes |
| 2026-09-27 | P0-T7..T8 | b076479 | verify verde, 178 testes (7 integração) |
| 2026-09-27 | P0-T9..T9b | 9559129 | verify verde, 227 testes; e2e 24/24; axe 0 serious |
| 2026-09-27 | P0-GATE | f734ecb | 356 testes, e2e 24/24, CI verde; tag p0-done |
| 2026-09-27 | P1/P3-GATE | 3c5a6b9 | correções A-051/A-053 mescladas |
| 2026-09-28 | P2-GATE | 8c4782b | 1188 testes; e2e 620 |
| 2026-09-28 | P4-GATE | 96a31b4 | 1272 testes; e2e 722 |

## Degradados abertos

(nenhum)

## Decisão do dono necessária

(vazio; B-009 autorizado em 27/09. Pendências de configuração do dono: B-012 repositório público, B-013 service role e CRON_SECRET na Vercel, B-008 chave OpenRouter, B-006 Google OAuth, B-010 secrets do GitHub)
