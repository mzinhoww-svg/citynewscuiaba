---
description: Kickoff único do CityNews. Lê tudo, faz até 15 perguntas de uma vez e prepara a execução autônoma
---

1. Leia, nesta ordem: `CLAUDE.md`, `docs/AUTONOMY.md`, `docs/superpowers/specs/2026-09-27-citynews-design.md`, `DESIGN.md`, `PRODUCT.md`, `docs/screens.md`, `docs/architecture.md`, `docs/tracking-plan.md`, `docs/testing.md`, `docs/superpowers/plans/README.md`, `design-system/README.md`, `.planning/QUESTIONS.md`.
2. Verifique o ambiente sem alterar nada: `node -v`, `pnpm -v`, `git --version`, `gh auth status`, `vercel whoami`, `supabase --version`, `docker info`, `agent-browser --help`, e as variáveis de `.env.example` presentes no ambiente.
3. **Se `kickoff.answered` já for `true` em `.planning/progress.json` (é o caso deste kit), não faça perguntas.** Registre a verificação do ambiente em `STATE.md` e siga direto para `/citynews-build`. Caso contrário, monte **uma única mensagem** com:
   - o resultado da verificação do ambiente (o que falta e qual contorno de `docs/AUTONOMY.md` §4 será usado);
   - as perguntas de `.planning/QUESTIONS.md` que precisam de resposta, no máximo 15, numeradas, cada uma com o padrão que será usado se não houver resposta;
   - a frase: "Responda o que quiser mudar. O que ficar sem resposta usa o padrão. Depois disso sigo sozinho até o P6."
4. Pare e aguarde a resposta.
5. Ao receber a resposta: preencha a coluna Resposta em `.planning/QUESTIONS.md`, registre `A-001` em diante em `.planning/DECISIONS.md`, marque `kickoff.questionsAsked` e `kickoff.answered` como `true` em `.planning/progress.json`, atualize `.planning/STATE.md`, faça o commit `chore(kickoff): respostas e decisões iniciais` e continue direto com `/citynews-build`.
