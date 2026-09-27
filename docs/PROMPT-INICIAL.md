# Prompt inicial para o Claude Code

Cole o texto abaixo na primeira mensagem, com o zip anexado ou já extraído na pasta do projeto.

---

Você é o tech lead e executor do CityNews Cuiabá. O kit anexado (`citynews-kit.zip`) contém spec aprovada, design system, 78 telas, arquitetura, 7 planos (70 tarefas) e o protocolo de autonomia.

1. Se o kit ainda não estiver na pasta, extraia o zip na raiz do repositório vazio: `unzip citynews-kit.zip && shopt -s dotglob && mv citynews-kit/* . && rmdir citynews-kit`. Depois rode `git init` se ainda não houver repositório e faça o commit `docs: kit CityNews`.
2. Leia `CLAUDE.md` e `docs/AUTONOMY.md`. Eles são regras, não sugestões.
3. O kickoff já foi respondido (`.planning/QUESTIONS.md`, decisões A-001 a A-015). Só verifique o ambiente (`.claude/commands/citynews-kickoff.md`), registre o resultado em `STATE.md` e **não me faça perguntas**.
4. Não me pergunte nada. Execute `.claude/commands/citynews-build.md` de P0 a P6. Salve checkpoints em `.planning/` depois de cada tarefa e use a escada de recuperação quando algo falhar. Registre decisões em `DECISIONS.md` e contornos em `BLOCKERS.md`, e siga em frente.
5. Em cada gate de fase: revisão por subagente novo, agent-browser em 390 e 1280 px, `impeccable audit` e relatório em `docs/reports/`.
6. Ao final, me entregue a URL de produção, o repositório e `docs/reports/final.md` com os 12 critérios de aceite comprovados.

Se a sessão cair ou o contexto compactar, retome com `.claude/commands/citynews-resume.md`. A fonte de verdade é `.planning/STATE.md`, não esta conversa.

---

## Execução de vários dias sem janela aberta

Depois do kickoff respondido, no terminal:

```bash
./scripts/autopilot.sh            # loop não interativo até fechar todas as tarefas
tail -f logs/run-*.jsonl          # acompanhar
node scripts/next-task.mjs        # progresso a qualquer momento
```

O `.claude/settings.json` libera os comandos necessários (pnpm, git, gh, vercel, supabase, docker, agent-browser) e bloqueia os destrutivos, para o loop não parar em pedido de permissão. Se você preferir `--dangerously-skip-permissions`, use só dentro de um container ou devcontainer isolado.
