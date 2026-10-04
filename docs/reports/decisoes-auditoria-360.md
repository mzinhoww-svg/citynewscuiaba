# Implementação das decisões da auditoria 360 (D-01 a D-06)

Data: 04/10/2026 · Branch: `claude/vigilant-babbage-ndnhwp`, reiniciado a partir da `main` em `b7381b6` (o PR #42 da auditoria já estava integrado pelo dono) · Commits locais `c8d9b94` a `fcc6a03`, **não enviados ao remoto** (pedido do dono: sem push, merge, deploy ou operação em produção sem autorização explícita).

## Resumo executivo

As seis decisões do dono estão implementadas no código e no banco local, com testes. Nenhuma operação foi feita em produção.

- **D-01:** o Pergunte responde com uma fonte relevante, atribuída, e só recusa sem fonte ou sem fato sustentado.
- **D-02:** imagens da web levam o aviso "Foto: reprodução web" e todo ativo entra num Media Registry.
- **D-03:** linhagens viram indicador informativo, sem efeito em confiança ou publicação.
- **D-04:** regras e interruptores mudam livremente, com antes e depois na auditoria e reversão.
- **D-05:** toda decisão de publicação ganha nível de risco de 1 a 4 com motivos. As regras v4, que publicam a divergência comum com as versões atribuídas, ficam prontas como proposta inativa para ativar no painel.
- **D-06:** continua sem selo público de IA, e a chave anônima deixa de ler os metadados internos da matéria.

## B. Matriz de decisões

| ID | Decisão | Implementação | Banco | Prompts | Testes | Resultado | Riscos residuais | Status |
|---|---|---|---|---|---|---|---|---|
| D-01 | Responder com fontes; sem fontes, informar | `src/lib/ai/answer.ts` (`MIN_ANSWER_SOURCES = 1`, `basis`, `staleSince`), `AiAnswer.tsx`, `content/pt-BR/ask.ts` | — | Instruções do `answer` (fonte única atribuída, `facts` vazio quando as fontes não respondem, preservar datas e números, preliminar) | `answer.test.ts` (7 novos cenários), `ai.test.tsx`, `eval.test.ts`, fixture `uma-fonte-relevante`, `ask.test.ts`, e2e ajustados | Aprovado | Relevância depende da busca (termos mínimos) e do modelo devolver `facts` vazio; com o provedor falso só a lógica é testada | Concluído |
| D-02 | Imagens da web com crédito e "Foto: reprodução web"; Media Registry | `src/lib/media/rights.ts`, `reusableAsset` em `steps/media.ts`, legenda em `content/pt-BR/labels.ts` e no Guia, detalhe da mídia no Estúdio | 0152: `media_assets.rights_status/usage_scope/disclaimer/updated_at/archived_at`, `article_media.credit_shown`, gatilhos, visão `media_registry` | — | `rights.test.ts`, `media.test.ts`, `media-registry.test.ts` (integração), testes de legenda | Aprovado | O aviso não é autorização (B-002 aberto); `og:image` ainda usa a capa reproduzida; `object-cover` ainda recorta | Concluído (1ª etapa) |
| D-03 | Linhagens só como indicador (C) | `lineage.ts` (`LINEAGE_METHOD`, `safeIndependentLineages`), `verify.ts` | 0151: visão `verify_lineage_daily` | — | `lineage.test.ts` (paráfrase, mesmo fato com dados diferentes, falha), `understand.test.ts` (persistência), `risk.test.ts` (não altera nível) | Aprovado | Método lexical: paráfrase de release conta como linhagem distinta | Concluído |
| D-04 | Alterações livres com histórico (C) | `flags/index.ts` (`previous`), `studio/switches.ts`, `studio/contingency.ts`, `studio/rules.ts` (herda `riskLevels`) | — (regras versionadas e `rules_rollback` já existiam, 0149) | — | `flags.test.ts`, `contingency.test.ts` (from/to na auditoria) | Aprovado | Limites do disjuntor e modo do revisor não gravam o valor anterior na auditoria | Concluído |
| D-05 | Risco em níveis, publicação flexível, cobertura noturna (B) | `rules/risk.ts`, `rules/index.ts` (`conflict_grave`), `RULES_V4`, `steps/decide.ts` (risco em toda decisão), `auto-reviewer.ts`, `write.ts` (`DIVERGENCE_RULE`) | 0151: `articles.risk_level`, `review_due_articles` sem nível 4, visão `editorial_risk_daily`; proposta inativa `supabase/bootstrap/rules-v4-proposal.sql` | `write` (divergência atribuída, preliminar); `reviewer` (nível e motivos, critério por nível) | `risk.test.ts`, `v4.test.ts`, `decide.test.ts`, `auto-reviewer.test.ts`, `credit-line.test.ts`, `aut-t6-reviewer.test.ts`, `contingency.test.ts` | Aprovado | A publicação da divergência comum só vale depois de ativar a v4; "conteúdo fabricado" não tem detector (o nível 4 hoje é só o rascunho sem IA); sem verificação de afirmações (EV-03) | Concluído; ativação pendente |
| D-06 | Sem rótulo público de IA; rastreabilidade interna | Vocabulário público já testado; JSON-LD testado | 0153: `anon` sem leitura de `ai_fallback`, `review_reason`, `rules_version`, `short_reason`, `studio_snapshot`, `field_origins`, `assignee_id`, `due_at`, `risk_level` | — | `d06-internal-columns.test.ts` (falha sem a 0153, passa com ela), `jsonld.test.ts` | Aprovado | `publish_mode`, `agent_id` e `confidence` ainda legíveis pelo `anon`; usuário logado comum ainda lê todas as colunas | Concluído em parte |

## A. Alterações por decisão

**D-01, Pergunte.** A recusa por "menos de 2 veículos" saiu. Uma fonte relevante basta, e a resposta vem marcada `single_source`, com o aviso "Baseada em uma única fonte (X), ainda sem confirmação de outro veículo". Quando a fonte mais recente tem mais de 72 h, aparece "Informação de {data}: pode ter mudado desde então".

Recusa (`insufficient`) só em dois casos: nenhuma fonte, ou nenhum fato sustentado pelas fontes. Nos dois, o leitor vê o que foi encontrado e a busca tradicional. Busca ou provedor fora geram erro, não recusa. Os textos da tela deixaram de falar em "2 fontes independentes".

**D-02, Media Registry.** O registro estende `media_assets` em vez de duplicar estrutura.

- O status de direitos é derivado no banco a cada inserção ou mudança: bloqueio, validade, tipo.
- `pending` é marcação manual; só bloqueio ou vencimento a sobrescreve.
- O crédito exibido em cada uso fica em `article_media.credit_shown`, e `chosen_at` já era a data do uso.
- A visão `media_registry` mostra origem, autor, URLs, licença, direitos efetivos, escopo, crédito, aviso, hash, metadados e as matérias que usaram o ativo.
- Ativo `blocked` ou `expired` nunca é reaproveitado.
- A legenda pública passou a "Foto: reprodução web · Fonte".

**D-03, Linhagens.** Mantido o cálculo em sombra. A decisão do `verify` grava o método (`shingle4-containment0.8-min15`), e um erro no cálculo vira `null` em vez de derrubar a etapa. Nenhum portão, score ou revisor lê o indicador.

**D-04, Histórico.** As regras já eram versionadas e imutáveis depois de aprovadas, aplicadas por uma pessoa (A-128) e reversíveis por `rules_rollback`. Faltava o "antes" nas flags: Interruptores e Contingência agora gravam `from` e `to` no `audit_log`.

**D-05, Risco.** `classifyRisk` devolve o nível e os motivos (`no_ai_draft`, `dubious`, `divergence_grave`, `untrusted_grave`, `single_source`, `divergence`, `preliminary`). Toda decisão da etapa de regras grava o risco, e a matéria guarda `risk_level`.

Com `riskLevels` (regras v4):
- divergência em assunto comum segue para publicação, e o redator recebe a instrução de atribuir cada versão;
- divergência central em assunto grave vai para revisão (`conflict_grave`).

O revisor noturno calcula o nível com a mesma função, recebe nível e motivos e decide os níveis 2 e 3. Ele nunca decide o 4, e a função SQL usa o mesmo critério.

**D-06, IA.** Nenhum selo foi acrescentado e nenhum metadado interno foi apagado. A 0153 fecha para a chave anônima as colunas internas que o portal não usa. A autoria no JSON-LD continua "Organização · Redação CityNews" para matérias do pipeline, o que corresponde ao que de fato aconteceu.

## C. Registro de alterações

77 arquivos: 1.541 linhas acrescentadas e 166 removidas. Nenhum arquivo removido.

- **Criados:**
  - `src/lib/rules/risk.ts` e `risk.test.ts`, `src/lib/rules/v4.test.ts`: classificação de risco e regras v4.
  - `src/lib/media/rights.ts` e `rights.test.ts`: status de direitos espelhando o SQL.
  - Migrations `0151_editorial_risk_levels.sql`, `0152_media_registry.sql` e `0153_hide_internal_article_columns.sql`.
  - `supabase/bootstrap/rules-v4-proposal.sql`: proposta inativa.
  - `tests/integration/media-registry.test.ts` e `d06-internal-columns.test.ts`.
  - Este relatório.
- **Alterados no código:** Pergunte (`answer.ts`, `AiAnswer.tsx`, `ask.ts`); regras (`index.ts`, `types.ts`, `load.ts`, `defaults.ts`, `simulate.ts`); pipeline (`decide.ts`, `auto-reviewer.ts`, `write.ts`, `verify.ts`, `media.ts`, `ports.ts`, `pipeline-store.ts`); flags e Estúdio (`flags/index.ts`, `switches.ts`, `contingency.ts`, `studio/rules.ts`, `studio-media.ts`, detalhe da mídia); legendas (`labels.ts`, `labels/index.ts`, `ImageCaption.tsx`, Guia); tipos do banco (`types.ts`, editado à mão, porque a regeneração reordenava 1.700 linhas).
- **Testes ajustados:** onde esperavam "Reprodução web", a recusa com uma fonte, ou o corpo do seed sem `riskLevels`. Isso inclui o seed `supabase/seed.sql`, que espelha `DEFAULT_RULES`.
- **Documentação:**
  - `CLAUDE.md`: regras 3, 5, 8 e 11.
  - `.planning/DECISIONS.md`: A-133 a A-138 e supersessões.
  - `.planning/STATE.md`.
  - `docs/audit/`: roadmap, políticas editorial e de mídia, matriz de regras, configuração, orquestração de IA, relatório.
  - `docs/adr/ADR-015`.

## D. Validação

| Verificação | Comando | Resultado |
|---|---|---|
| Lint (eslint + prettier) | `pnpm lint` | Verde |
| Typecheck | `tsc --noEmit` e `tsc --noEmit -p src/sw` | Verde |
| Unitários e scripts | `vitest --project unit --project scripts` | 312 arquivos, 2.860 testes verdes |
| Migrations | `pnpm db:reset` na pilha local sem Docker (A-017), 0001 a 0153 | Aplicam limpo |
| Integração e segurança | `vitest --project integration --project security` sobre banco recriado (0001 a 0153) | 92 arquivos, 1.050 testes verdes |
| Testes que provam a correção | 0153 revogada → `d06-internal-columns` falha 5/6; reaplicada → 6/6 | Confirmado |
| Build de produção | `pnpm build` | Verde |
| e2e (Playwright) | — | **Não executado** neste ambiente; os specs alterados (`ask`, `vocabulary`, `article`) rodam no CI |

Na primeira execução completa da integração, três testes falharam (`rls-two-person` ×2 e `db.test`). A causa era o corpo da regra v1 no seed, que espelha `DEFAULT_RULES` e não tinha o campo novo `riskLevels`. Corrigi o seed, e os dois arquivos passaram (28/28).

### Execução final

Depois da correção do seed: `pnpm db:reset` aplicou 0001 a 0153; integração e segurança completas passaram com 92 arquivos e 1.050 testes; `pnpm build` terminou sem erro.

## E. Pendências

| Depende de | Pendência |
|---|---|
| Autorização do dono | Push do branch e PR; merge; deploy |
| Produção | Aplicar as migrations 0150 (se ainda não aplicada), 0151, 0152 e 0153. Depois do deploy, rodar `supabase/bootstrap/rules-v4-proposal.sql`, conferir a simulação de 7 dias e aplicar a v4 no painel de governança |
| Revisão jurídica | B-002 (reprodução de imagens com aviso). Confirmar a ausência de obrigação de rótulo de IA em jornalismo (A-138) |
| Decisão futura do dono | Linhagens como critério de confiança (D-03, C → B); aprovação proporcional ao risco (D-04); `og:image` só com escopo `social` e fim do recorte da reprodução (D-02) |
| Trabalho técnico | Tirar `publish_mode`, `agent_id` e `confidence` das consultas públicas e fechá-las ao `anon` (D-06); gravar o valor anterior nos limites do disjuntor e no modo do revisor (D-04); detector de conteúdo fabricado e conferência de afirmações (EV-03) para enriquecer os níveis 3 e 4 (D-05) |
| Monitoramento após ativação | Acompanhar `editorial_risk_daily` (publicadas, retidas, motivos) e `verify_lineage_daily` por 2 semanas antes de fixar metas |

## F. Próximos passos

Coerentes com as decisões, sem reabrir nenhuma:

1. Ativar a v4 depois da simulação e medir pela `editorial_risk_daily`.
2. EV-03, conferência de afirmações no `write`: aumenta a publicação segura nos níveis 2 e 3.
3. EV-04, alertas fora do banco: o revisor noturno e o disjuntor passam a avisar alguém.
4. Fechar as três colunas restantes ao `anon` (D-06).
