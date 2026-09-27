# CityNews · Estado atual

**Última atualização:** 2026-09-27T11:40-04:00
**Atualizado por:** Claude Code

## Fase e tarefa

- **Fase ativa:** P0 Fundação
- **Tarefa ativa:** P0-T1
- **Próxima tarefa:** P0-T1 Scaffold do projeto e qualidade
- **Progresso:** 0/70 tarefas · 0/7 fases

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
| Supabase remoto | org free com 2 projetos ativos, criação recusada | B-007 (decisão do dono) |
| Variáveis de `.env.example` | nenhuma presente (`OPENROUTER_API_KEY` ausente) | `AI_PROVIDER=fake` (A-018, B-008) |
| Branch de trabalho | `claude/keen-hypatia-8qn86r` | A-016 |

## Próxima ação imediata

1. Executar P0-T1 (scaffold) e seguir o plano P0.

## Últimos checkpoints

| Quando | Tarefa | Commit | Resultado |
|---|---|---|---|
| 2026-09-27 | kit | e14a386 | kit importado |

## Degradados abertos

(nenhum)

## Decisão do dono necessária

- **B-007 · Supabase de produção.** A conta Supabase atingiu o limite de 2 projetos free ativos (`listada-escola` e `ListaEscolar`). Para ter banco em produção é preciso pausar um deles (ou liberar cota). Eu não pausei nada porque é ação fora do repositório. Enquanto isso, tudo roda na pilha local e o portal em produção funciona em modo sem banco.
