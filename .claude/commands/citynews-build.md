---
description: Executa o CityNews de P0 a P6 sem interação, com checkpoints e recuperação
---

Execução autônoma pré-aprovada. Não pergunte nada ao dono (o kickoff já foi feito). Siga `docs/AUTONOMY.md` à risca.

1. Rode `node scripts/next-task.mjs` e leia `.planning/STATE.md`.
2. Se `kickoff.answered` for `false` em `.planning/progress.json`, rode `/citynews-kickoff` primeiro.
3. Rode `node .claude/skills/impeccable/scripts/context.mjs` uma vez por sessão, se a skill estiver instalada.
4. Loop (`docs/AUTONOMY.md` §3), pela ordem de `progress.json` (P0 → P1 ∥ P3 → P2 ∥ P4 → P5 → P6):
   - Execute cada tarefa com `superpowers:subagent-driven-development`. Tarefas `[paralelo]` da mesma fase vão em conjunto com `superpowers:dispatching-parallel-agents`. Para planos em paralelo, use `superpowers:using-git-worktrees`.
   - Em falha, suba a escada de recuperação (§4). Não pare.
   - Depois de cada tarefa: commit, `progress.json`, `STATE.md`. A cada 3 tarefas: commit de checkpoint.
   - No fim da fase, rode o gate (§5), incluindo o agent-browser e o `impeccable audit`.
5. Ao terminar P6: `docs/reports/final.md` com os 12 critérios de aceite e evidências, tag `v1.0.0`, deploy de produção. Informe as URLs de produção e do repositório.
