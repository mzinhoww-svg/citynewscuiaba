---
description: Retoma a execução autônoma do CityNews a partir do último checkpoint
---

1. Leia `.planning/STATE.md`, `.planning/progress.json`, `.planning/BLOCKERS.md` e as últimas 20 linhas de `git log --oneline`.
2. Rode `git status`. Se houver tarefa `in_progress` sem commit correspondente, trate como tentativa interrompida: `git stash push -m "interrompido <tarefa>"`, mantenha `attempts` e recomece a tarefa pelo teste.
3. Releia `CLAUDE.md` e `docs/AUTONOMY.md` e só as seções da spec, do `DESIGN.md` e do plano que a tarefa atual usa. Não releia tudo, para poupar contexto.
4. Continue exatamente como `/citynews-build` a partir do passo 4.
5. Antes de o contexto encher, ou a cada 3 tarefas, faça o commit de checkpoint e atualize `STATE.md` com "Próxima ação imediata" precisa o bastante para outra sessão continuar sem ler esta conversa.
