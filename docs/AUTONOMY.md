# Protocolo de execução autônoma · CityNews

Objetivo: o Claude Code executa P0 a P6 (70 tarefas) do começo ao fim. A única interação humana é o kickoff, com no máximo 15 perguntas feitas de uma vez. Depois disso ele diagnostica, contorna, registra e segue. Cada decisão fica rastreável e a execução pode ser retomada de qualquer ponto.

## 1. O que foi replicado das execuções longas anteriores

Estas práticas vêm dos projetos ListaCerta e AN. Site do dono do produto. As fontes foram `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `DECISIONS.md` e os relatórios de QA com estado logado simulado. Elas foram adaptadas aqui:

| Prática observada | Como entra aqui |
|---|---|
| `STATE.md` como fonte de verdade da sessão, com "Próxima ação imediata" e "Bloqueios" | `.planning/STATE.md`, reescrito a cada tarefa concluída |
| `DECISIONS.md` separado do estado | `.planning/DECISIONS.md` com IDs `A-###` para decisões autônomas |
| Hierarquia Milestone > Slice > Task, spec antes de código, must-haves verificáveis (GSD2) | Plano = fase, tarefa = slice com teste; critérios de aceite da spec §11 no gate final |
| Verificador independente ao fim de cada fase (gsd-verifier) | Revisor em subagente novo no gate de fase (§5) |
| QA de telas protegidas simulando sessão logada, o que expôs estados vazios e de erro | Usuários de seed + `storageState` do Playwright por papel; roteiro de estados em toda tela |
| Fases com "Plans: TBD" travaram o início da execução | Todos os planos já vêm detalhados; nada de TBD no caminho crítico |
| Kill switch e definição de pronto explícitos | Gates de fase e critério de parada da §7 |

## 2. Kickoff (a única conversa)

1. Leia `CLAUDE.md` e os documentos da ordem de leitura.
2. Leia `.planning/QUESTIONS.md`. Pergunte **em uma única mensagem** somente as perguntas cujo padrão não serve ou que dependem de algo que só o dono sabe. O limite é 15.
3. Aguarde uma resposta. Se o dono responder "use os padrões" ou deixar alguma sem resposta, aplique o padrão.
4. Registre as respostas em `QUESTIONS.md` (coluna Resposta) e em `DECISIONS.md` (A-001 em diante). Marque `kickoff.answered = true` em `progress.json`.
5. **A partir daqui não pergunte mais nada.** Toda dúvida nova é resolvida pela ordem: spec → `DESIGN.md` → `docs/screens.md` → `docs/architecture.md` → escolha mais conservadora e reversível → registro em `DECISIONS.md`.

## 3. Loop de execução

```
enquanto houver tarefa pending ou degraded revisitável:
  1. ler .planning/STATE.md e .planning/progress.json
  2. escolher a próxima tarefa: primeira pending da fase ativa cujas dependências de fase estão done
     (tarefas [paralelo] da mesma fase podem ir juntas via dispatching-parallel-agents)
  3. marcar in_progress, attempts += 1, salvar progress.json
  4. executar a tarefa pelo plano (superpowers:subagent-driven-development; TDD; revisor por tarefa)
  5. verificação da tarefa: testes da tarefa + pnpm verify
  6. sucesso → commit "feat(...): ... [P#-T#]", status done, commit hash, atualizar STATE.md
     falha → escada de recuperação (§4)
  7. a cada 3 tarefas ou antes de compactar contexto: commit "chore(checkpoint): P#-T#" com .planning/
  8. fim da fase → gate (§5)
```

## 4. Escada de recuperação (nunca parar no primeiro erro)

| Nível | Quando | O que fazer | Limite |
|---|---|---|---|
| L1 Corrigir | Teste falha, build quebra, lint | `superpowers:systematic-debugging`: reproduzir, isolar, hipótese, corrigir a causa raiz | 3 ciclos por falha |
| L2 Alternativa | L1 esgotado ou biblioteca ou API incompatível | Trocar de abordagem mantendo a interface do plano (outra lib, outra API do Next.js, outra forma de query). Registrar `A-###` com o motivo | 2 alternativas |
| L3 Isolar e seguir | L2 esgotado, ou dependência externa indisponível | Implementar a interface com fallback seguro: `FakeProvider`, flag desligada ou dado de seed. Teste marcado `test.fixme` com link para o BLOCKER. Status `degraded`. Registrar em `BLOCKERS.md` com condição de revisita | Seguir para a próxima tarefa independente |
| L4 Revisitar | Gate de fase | Tentar de novo todos os `degraded` da fase com contexto limpo | 1 rodada por gate |
| L5 Aceitar com evidência | Ainda degradado após L4 | Fase fecha com o item listado no relatório. Nunca bloqueia a fase seguinte, salvo se a interface dela faltar; nesse caso, entregar o contrato mínimo | n/a |

Falhas externas e como contornar:

| Situação | Contorno |
|---|---|
| Segredo de IA ausente | `AI_PROVIDER=fake` em todo o fluxo; BLOCKER "ativar provedor real" |
| Supabase remoto indisponível ou sem cota | Supabase local via CLI; deploy de migrations fica pendente no BLOCKER |
| Vercel ou GitHub fora ou sem permissão | Seguir localmente com commits; `pnpm build && pnpm start` substitui o preview; agent-browser roda em `localhost:3000` |
| Extensão (pgmq, pg_cron, pg_net) indisponível | Tabela `jobs` com `select ... for update skip locked` e o tick chamado pelo watchdog; mesma interface de `enqueue/readBatch/ack` |
| Limite de `maxDuration` baixo | Diminuir o lote do `drain` e chamar com mais frequência |
| Serviço de e-mail ausente | Transport de console em dev e fila `notify` persistida |
| Dependência com breaking change | Fixar a última versão compatível e registrar em `A-###` |
| Flaky em E2E | Repetir 2 vezes; se a falha for intermitente, estabilizar com espera por estado (nunca `waitForTimeout` novo) antes de seguir |

Proibições durante a recuperação: desativar ou apagar teste para passar, `@ts-ignore`, `any`, reduzir o limiar de a11y, mudar a spec em silêncio, `git push --force` em `main`, apagar migration aplicada, gastar dinheiro (plano pago, compra de domínio), mexer fora do repositório.

## 5. Gate de fase

1. `pnpm verify` verde, `pnpm test:e2e` e `pnpm test:a11y` verdes, ou com `fixme` justificados.
2. Revisão de branch inteira por um subagente novo (`superpowers:requesting-code-review`), olhando a spec e o plano. As correções entram antes do merge.
3. Preview da Vercel, ou `localhost` no contorno. Roteiro do agent-browser da fase (`docs/testing.md` §3) em 390 × 844 e 1280 × 800, com screenshots em `docs/reports/P#/`.
4. `impeccable audit` nas telas da fase. Severidade alta é corrigida na hora; média vai para o relatório.
5. `docs/reports/P#.md`: entregas, desvios (`A-###`), degradados, evidências e métricas (testes, cobertura, Lighthouse).
6. PR, merge, tag `p#-done`, fase `done` em `progress.json`, `STATE.md` atualizado.

## 6. Retomada (nova sessão, compactação ou queda)

- `SessionStart` (hook em `.claude/settings.json`) imprime `STATE.md` e a próxima tarefa.
- `/citynews-resume` relê `STATE.md` e `progress.json`, confere `git status` e o último commit. Um `in_progress` sem commit é tratado como tentativa interrompida: descarta o diff não commitado da tarefa e recomeça pelo teste.
- `scripts/autopilot.sh` roda o Claude Code em modo não interativo em loop até `progress.json` não ter mais tarefas abertas. Assim uma queda de sessão não para o projeto.

## 7. Critério de parada

A execução termina quando as 7 fases estão `done` e `docs/reports/final.md` traz os 12 critérios de aceite da spec §11, cada um com evidência.

Ela também para antes, e só nesse caso chama o dono, se acontecer uma de três coisas:

- o mesmo BLOCKER impediu 3 fases seguidas;
- uma ação exigiria gasto ou exclusão fora do repositório;
- a spec se contradiz de forma que muda o produto (não a implementação).

Nesse caso ele escreve a pergunta em `STATE.md` na seção "Decisão do dono necessária" e continua em tudo que não depende dela.
