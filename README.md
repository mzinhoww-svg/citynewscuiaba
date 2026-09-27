# CityNews Cuiabá · kit completo para execução autônoma no Claude Code

Spec aprovada, brand kit integrado e refinado, 78 telas, arquitetura, 7 planos com 70 tarefas TDD, protocolo de autonomia com checkpoints e recuperação, schema SQL, seed fictício, CI e comandos do Claude Code.

## Começo rápido

1. Crie uma pasta vazia (ou use o repositório `mzinhoww-svg/citynewscuiaba`), extraia o kit na raiz e faça o primeiro commit.
2. Abra o Claude Code na pasta e cole o prompt de `docs/PROMPT-INICIAL.md`.
3. Responda uma vez as perguntas do kickoff (até 15, todas com padrão).
4. Deixe rodar: `/citynews-build` na sessão, ou `./scripts/autopilot.sh` para vários dias sem janela aberta.

Pré-requisitos: Node LTS, pnpm, Docker, `gh`, `vercel` e `supabase` autenticados, agent-browser, e as skills `superpowers`, `impeccable`, `design-intelligence`, `ui-ux-pro-max` e `tripled-ui`.

## Mapa

| Caminho | Conteúdo |
|---|---|
| `CLAUDE.md` | Regras permanentes, modo autônomo, stack, comandos, definição de pronto |
| `docs/AUTONOMY.md` | Kickoff único, loop, escada de recuperação, gates, retomada, critério de parada |
| `docs/PROMPT-INICIAL.md` | Prompt para colar no Claude Code |
| `.planning/` | `STATE.md`, `progress.json` (70 tarefas), `DECISIONS.md`, `BLOCKERS.md`, `QUESTIONS.md` |
| `.claude/commands/` | `/citynews-kickoff`, `/citynews-build`, `/citynews-resume` |
| `.claude/settings.json` | Permissões para rodar sem prompts e hook de início de sessão |
| `scripts/` | `autopilot.sh` (loop headless) e `next-task.mjs` (próxima tarefa e progresso) |
| `PRODUCT.md` / `DESIGN.md` | Produto e sistema visual v2 (brand kit + refinamentos R1 a R14, contrastes medidos) |
| `src/styles/tokens.css` | Tokens de produção com nomes do brand kit |
| `design-system/` | Brand kit do Claude Design: componentes JSX e `.prompt.md`, guidelines, UI kits, logos, fontes, PDF de identidade |
| `docs/superpowers/specs/…-design.md` | Spec mestre com 18 decisões e 12 critérios de aceite |
| `docs/screens.md` | 78 telas com rota, blocos, estados, dados e aceite |
| `docs/architecture.md`, `docs/tracking-plan.md`, `docs/testing.md` | Arquitetura, eventos e ranking, testes e roteiros do agent-browser |
| `docs/superpowers/plans/` | P0 a P6 no formato writing-plans |
| `supabase/` | Migration inicial e seed fictício |
| `.github/workflows/` | CI e vigia do ciclo de 30 minutos |
