# CityNews · Estado atual

**Última atualização:** 2026-09-27T11:40-04:00
**Atualizado por:** Claude Code

## Fase e tarefa

- **Fase ativa:** P0 Fundação
- **Tarefa ativa:** P0-T10
- **Próxima tarefa:** P0-T10 CI, GitHub e Vercel
- **Progresso:** 10/70 tarefas · 0/7 fases

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

1. Executar P0-T9 e T9b (UI). Em paralelo, T10: Vercel + `citynews-prod` (aplicar migrations 0001/0002, `seed_sources_real.sql`). Pilha local: `pnpm db:start && pnpm db:reset`; senha dos usuários de seed `citynews-local-123`.

## Últimos checkpoints

| Quando | Tarefa | Commit | Resultado |
|---|---|---|---|
| 2026-09-27 | kit | e14a386 | kit importado |
| 2026-09-27 | P0-T1..T6 | 93f0c13 | verify verde, 56 testes |
| 2026-09-27 | P0-T7..T8 | b076479 | verify verde, 178 testes (7 integração) |
| 2026-09-27 | P0-T9..T9b | 9559129 | verify verde, 227 testes; e2e 24/24; axe 0 serious |

## Degradados abertos

(nenhum)

## Decisão do dono necessária

- **Escrita em produção (B-009).** O classificador de permissões bloqueou aplicar migrations no `citynews-prod` e criar o projeto na Vercel. Pedido ao dono em 27/09: autorizar na conversa ou liberar as ferramentas MCP do Supabase e da Vercel. Todo o resto segue local.
