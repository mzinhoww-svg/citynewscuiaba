# Roteamento de skills

Skills disponíveis nesta sessão (listadas pelo harness): superpowers (brainstorming,
systematic-debugging, test-driven-development, verification-before-completion,
dispatching-parallel-agents, subagent-driven-development, executing-plans, writing-plans,
requesting-code-review, receiving-code-review, finishing-a-development-branch,
using-git-worktrees, diagnosing-superpowers), impeccable, anthropic-skills:ui-ux-pro-max,
update-config, code-review, simplify, security-review.

| Problema | Skill primária | Auxiliares | Motivo | Quando | Como validar |
|---|---|---|---|---|---|
| Comportamento errado em produção (enrich, fila, cron) | systematic-debugging | test-driven-development, verification-before-completion | causa raiz antes de correção | ao detectar divergência código × produção | teste que falha antes, passa depois; consulta em produção depois do deploy |
| Migrations pendentes | verification-before-completion | — | provar estado antes e depois de cada escrita | antes de toda escrita em produção | consulta de fingerprint (corpo da função, constraint, histórico) |
| Auditorias independentes (governança, migrations) | dispatching-parallel-agents | — | tarefas só de leitura, sem estado compartilhado | quando há 2+ frentes independentes | o orquestrador reconfere as afirmações principais (relatório = UNTRUSTED CLAIM) |
| Mudança de código | test-driven-development | requesting-code-review | vermelho → verde | toda correção | `pnpm test --project unit`, typecheck, lint |
| UI/UX | impeccable | ui-ux-pro-max | só com problema visual concreto | depois de identificar o problema | e2e + axe + captura em 390 px |
| Configuração do Claude Code | update-config | — | permissões e hooks | quando o dono pedir | arquivo válido; a gravação pelo agente é bloqueada (`[Self-Modification]`) |
| Fim de branch | finishing-a-development-branch | — | PR, CI, merge | código verificado | CI verde no PR |

Uso nesta sessão: systematic-debugging (enrich), test-driven-development (nota do enrich),
dispatching-parallel-agents (A-128 e migrations), update-config (bloqueado pela plataforma).
