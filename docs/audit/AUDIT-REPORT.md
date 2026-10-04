# Auditoria 360 · relatório executivo e técnico

Data: 04/10/2026 · Base: `claude/vigilant-babbage-ndnhwp` a partir de `e80c0e1` (main) · Escopo: repositório inteiro (código, 78 arquivos de migration numerados até 0147, documentação, planejamento, workflows).

Convenção usada em toda a pasta `docs/audit/`:

- **[O] Observado:** visto no código, no SQL ou no documento citado (`arquivo:linha`).
- **[I] Inferido:** leitura do código sem execução contra produção.
- **[R] Recomendação:** proposta, ainda não decidida.

Nada aqui foi verificado contra o banco de produção. Onde o estado de produção importa, o achado diz "conferir em produção".

## 1. Diagnóstico em uma página

O CityNews é um **monólito modular bem construído**: Next.js 16 na Vercel, Supabase como estado, fila, autenticação e storage, e um pipeline de 20 etapas idempotentes sobre uma fila própria em Postgres. Os pontos fortes são reais e raros num projeto deste tamanho:

- regras de publicação puras, versionadas no banco, simuláveis e com aprovação de duas pessoas imposta por trigger (`src/lib/rules/index.ts:116`, `0002_rls.sql:455-527`);
- IA atrás de um único ponto (`src/lib/ai/call-agent.ts:139-231`), com modelos, prompts e orçamentos no banco, fallback de modelo, custo por chamada e sanitização de texto externo;
- RLS em todas as tabelas, segredos fora do repositório, cron autenticado com comparação em tempo constante (`src/lib/security/cron-auth.ts:11-17`);
- 304 arquivos de teste unitário e 85 de integração, vocabulário público imposto por teste (`src/content/vocabulary.test.ts`), zero `any` e zero `@ts-ignore`.

Os problemas não estão na fundação técnica. Estão em quatro lugares:

1. **Integridade editorial sob autonomia alta.** O dono decidiu publicar segurança, política e saúde sem humano (spec `2026-10-03-autonomia-de-publicacao-design.md`). Os controles que deveriam compensar essa decisão estão desiguais: a independência das fontes conta veículos e não apurações, o texto gerado não é conferido contra as fontes em números, nomes e citações, e o revisor noturno podia publicar o rascunho sem IA (corrigido nesta auditoria).
2. **Governança documental que envelheceu mais rápido que o código.** O protocolo de execução (CLAUDE.md §2, AUTONOMY.md) foi escrito para construir P0 a P6 e terminou. As decisões do dono de 02 a 04/10 foram aplicadas ao código, mas só em parte aos documentos. Há regras contraditórias em vigor ao mesmo tempo, IDs de decisão repetidos e nenhum mecanismo de "superado por".
3. **Observabilidade que não sai do banco.** Tudo é registrado (`pipeline_events`, `decisions`, `ai_calls`, `audit_log`), mas nenhum alerta chega a uma pessoa fora do Control Center: o e-mail de plantão fica `queued` para sempre e `SENTRY_DSN` não é lido.
4. **Inteligência editorial rasa onde o produto quer ser profundo.** Não há entidades, linha do tempo, fusão de assuntos, atualização automática de matéria publicada nem formatos editoriais além de "matéria normalizada". O pipeline já tem os dados para isso; falta a camada.

## 2. Principais achados

A ordem é a da gravidade. Os IDs são usados em todos os outros documentos.

### P0 · crítico (integridade editorial, publicação indevida, conformidade)

| ID | Achado | Evidência | Estado |
|---|---|---|---|
| **P0-01** | O revisor automático noturno recebia e podia publicar o **rascunho sem IA**, que é a lista de títulos e trechos das fontes. Publicá-lo republicaria texto de terceiros (regra 4) e não é matéria. Além disso, o revisor decidia sem saber se havia fontes divergentes ou conteúdo duvidoso. | [O] `auto-reviewer.ts:77-86` não checava `aiFallback`; `0141_auto_reviewer.sql:114-139` não filtrava `ai_fallback`; `systemOf` não passava `centralConflict` nem `dubious`. | **Corrigido** (migration 0150, `isReviewable`, contexto do revisor; testes unitários e de integração). |
| **P0-02** | **Consenso de cópias conta como confirmação independente.** `independentSources` é o número de veículos distintos. Três portais que republicam o mesmo release valem 3 fontes, sobem a confiança e destravam o portão "fonte não confiável com assunto grave e sem segunda fonte". | [O] `verify.ts:137`, `rules/index.ts:141`, `confidence/index.ts:40-45`, `topics/state.ts:38-45` | **Medida implementada**; por decisão do dono (D-03, A-135) fica como indicador informativo, sem efeito em portões. |
| **P0-03** | **O texto gerado não é conferido contra as fontes** em números, nomes próprios e citações. Há guarda de cópia (8 palavras) e de citação por parágrafo, mas um parágrafo pode citar o item certo e trazer o número errado. Com segurança, política e saúde publicando sozinhas, este é o maior risco jurídico. | [O] `write.ts:111-127` (só citação e cópia); contraste com `verify.ts:76-99`, que já confere valores no texto da fonte. | Aberto. Proposta em `EDITORIAL-POLICY.md` §4 e iniciativa EV-03. |
| **P0-04** | **Reprodução de imagem de terceiros sem permissão registrada**, com revisão jurídica ainda pendente (B-002) e lançamento já feito. A regra 4 diz "imagem apenas com permissão registrada" e a regra 11 autoriza a reprodução. Além disso, a capa reproduzida vira `og:image` sem crédito, e `object-cover` recorta a foto apesar do "sem recorte". | [O] `CLAUDE.md:68` vs `:75`; `.planning/BLOCKERS.md:4`; `materia/[slug]/page.tsx:58-76`; `Photo.tsx:75` | **Decidido (D-02, A-134):** "Foto: reprodução web" + Media Registry (0152). Revisão jurídica (B-002), `og:image` e recorte seguem abertos. |
| **P0-05** | **Decisão do dono R36 ("o Pergunte não recusa; responde sem fonte com ressalva")** contradiz a regra 5 e o princípio de integridade factual. Não foi implementada: o código e o e2e ainda recusam com menos de 2 fontes. O risco é ela ser implementada como está por um agente seguindo a ordem das rodadas. | [O] `respostas-do-dono-rodada-3.md:18`; `answer.ts:4,264`; `tests/e2e/vocabulary.spec.ts:131-142` | **Resolvido (D-01, A-133):** responde com uma fonte relevante, atribuída; sem fonte informa a limitação. R36 superada. |

### P1 · alto (bloqueia evolução ou prejudica a operação)

| ID | Achado | Evidência |
|---|---|---|
| **P1-01** | Governança documental contraditória: "spec mestre vence" mas specs filhas a substituem; `STATE.md` diz P5 ativo e 54/70; ADS-T1 duas vezes com IDs diferentes; A-117 citado e inexistente; A-123 usado para duas decisões; regras de vocabulário de CLAUDE.md e DESIGN.md mais frouxas que os testes; regra de não perguntar "até o fim do P6" vencida e sem sucessora. | `RULES-INVENTORY.md` §3 (C1 a C17). **Parte corrigida nesta auditoria** (CLAUDE.md, STATE.md, DECISIONS.md, ADR-010/011). |
| **P1-02** | Alertas não saem do banco: `oncall_email` fica `queued` (B-005), sem envio; `SENTRY_DSN` não é lido; sem tracing. Falhas silenciosas: fonte bloqueada por robots é pulada para sempre sem contar falha; erros de `review-tick` e da publicação agendada viram `console.error` ou `.catch(() => null)`. | [O] `0004_pipeline.sql:736`, `notify.ts:257-261`, `fetch.ts:161-164`, `review-tick/route.ts:22` |
| **P1-03** | O disjuntor pode estar em 60/800 em produção, não em 300/3.000. A migration 0146 mudou só o *default* da coluna; a linha única já existente fica como estava, salvo se o script de operação foi rodado. | [O] `0073_breaker.sql:19-20`, `0146:141-142`, `breaker.ts:18-23`. **Conferir em produção.** |
| **P1-04** | Clusterização produz duplicatas do mesmo fato: simhash só do título, janela de 72 h, sem fusão de assuntos, clusters paralelos podem criar dois assuntos. Matéria publicada não é atualizada quando chega fonte nova; só gera aviso. | [O] `dedupe.ts:7-60`, `cluster.ts:8-72`, `write.ts:170-171` |
| **P1-05** | Avaliação de IA quase inexistente: 6 casos, só para `answer`, rodando contra o provedor falso no CI. Nenhuma avaliação de `classify`, `verify`, `write` ou `reviewer`, que publicam sozinhos. Resultado de avaliação não bloqueia publicação de prompt. | [O] `tests/fixtures/eval/answer.json`, `regression.yml:26-38`, `src/lib/ai/eval.ts` |
| **P1-06** | Busca vetorial sem índice: colunas `vector` sem dimensão impedem HNSW/IVFFlat; toda busca semântica e toda deduplicação fazem varredura sequencial. | [O] `0001_init.sql:83,101,131`, `0007_search.sql:269-274` |
| **P1-07** | Operação sem rede de segurança: backup em artifact de 7 dias, arquivos do Storage fora do dump, migrations aplicadas à mão, sem staging (B-004), restauração mensal sem evidência. | [O] `backup.yml`, `docs/runbooks/restore.md` (corrigido), A-054/A-095 |
| **P1-08** | Governança de duas pessoas numa operação de uma pessoa. "Alterar regras" exige segundo aprovador que não existe (A-102 admite), e o admin não tem `article.publish`. A-125 já precisou derrubar a regra para religar a publicação. A próxima mudança de regra vai travar ou forçar outro atalho. | [O] `CLAUDE.md:72`, `permissions.ts:72`, `0145_auto_publish_single_admin.sql` **Resolvida pelo dono em 04/10 (A-128, PR #37):** fim da regra de duas pessoas em todas as mudanças críticas; uma pessoa com o papel de aprovar pede, aprova e aplica numa ação só, com `approvals` e auditoria registrando quem fez (migration 0149). |
| **P1-09** | Matéria reescrita ao vivo (status `updated`) não é reindexada nem revalidada: o passo de publicação devolve `[]` fora de `published`. | [O] `steps/publish.ts:46-47`, `0147_live_rewrite.sql` |
| **P1-10** | Orçamento de IA verificado por leitura antes da chamada, sem reserva: workers paralelos podem estourar o teto de R$ 30/dia. A busca pública cria um `AiStore` novo por consulta, então o cache de 60 s nunca aquece. | [O] `call-agent.ts:162-167`, `search/server.ts:38` |

### P2 · médio (arquitetura, qualidade, automação, experiência)

Resumo; o detalhamento está nos documentos temáticos.

- **Inteligência:** sem extração de entidades; urgência inferida só de tags livres; `relevance` do `classify` gravada e nunca usada; `mainFact` do `verify` não chega ao `write`; `classify` e `locate` poderiam ser uma chamada (`EDITORIAL-INTELLIGENCE.md`, `AI-ORCHESTRATION.md`).
- **Prompts:** o prompt do `write` pede "rascunho curto" e a tarefa exige 30 linhas; 12 parágrafos cabem mal em 2.048 tokens de saída; guarda de injeção repetida em três camadas (`AI-ORCHESTRATION.md` §5).
- **Mídia:** sem envio de foto própria ou licenciada (`original`, `licensed` e `illustrative` vazios na prática); sem variantes ou `srcset`; `licensed_only` nunca consumido; prazo de 24 h de remoção não é medido; imagem gerada por IA aparece ao público só como "Imagem ilustrativa" (`MEDIA-POLICY.md`).
- **Fontes:** descoberta só por link colado; fonte pausada automaticamente não tem sonda de retomada; reputação é um enum manual sem histórico (`EDITORIAL-INTELLIGENCE.md` §2).
- **Distribuição:** sem RSS de saída; newsletter só coleta inscrição; e-mail de plantão não envia.
- **Código:** `pipeline/unpublish.ts` e `pipeline/activate-source.ts` sem uso em produção; `STEP_NAMES` com 5 etapas sem handler; três camadas de aprovações; "texto curto" medido de dois jeitos (75 caracteres e 12 palavras por linha); funções SQL redefinidas em várias migrations sem índice de "versão vigente".

### P3 · evolutivo

Linha do tempo por assunto, dossiês, comparação de versões, grafo de entidades, detecção de tendência, pauta por lacuna, home personalizada, vídeo e áudio. Ver `EVOLUTION-ROADMAP.md`.

## 3. Pontos fortes que devem ser preservados

1. **Domínio puro e testável:** `decidePublication`, `computeConfidence`, `chooseImage`, `sanitizeExternalText` e `confirmConflict` são funções puras com dependências injetadas. Toda evolução deve continuar nesse padrão.
2. **Idempotência por construção:** `unique(queue, dedupe_key)`, `canonical_url` único, uma matéria por assunto, decisões com hash de entrada (`inputHash`) que servem de cache de IA.
3. **Regras no banco, não no código:** `rules`, `ai_agents`, `ai_models`, `ai_prompts`, `feature_flags`, `app_settings`, `sources.*`. A maior parte do que a auditoria pede como "configurável" **já é**.
4. **Defesa em profundidade no banco:** a publicação só acontece pela função (`articles_guard_direct`), patrocinado nunca em política (trigger e check), licença vencida bloqueada no banco.
5. **Rastreabilidade:** cada etapa grava `decisions` com agente, versão do prompt, versão das regras e justificativa; o Estúdio mostra isso por matéria (`fila/[id]/page.tsx:168-225`).
6. **Guardas que não dependem do modelo:** `primary` vem do cadastro e não da IA; conflito só vale se os valores existirem no texto; resposta da busca descarta fato sem citação; bairro só vale se estiver no dicionário.

## 4. Gargalos

| Gargalo | Efeito | Saída |
|---|---|---|
| Uma pessoa operando um sistema desenhado para várias | Regras de duas pessoas viram atalhos ad hoc (A-125) | Resolvido pelo dono (A-128): uma pessoa aprova e aplica, com auditoria |
| Embedding no caminho crítico da deduplicação | Queda do provedor ou orçamento de R$ 1/dia esgotado trava a coleta | Deduplicação degradada por simhash quando o embedding falha (EV-07) |
| Reescrita completa a cada item novo | Custo de IA cresce com o número de itens do assunto | Reescrita incremental e teto de itens por chamada (EV-09) |
| Documentos de governança como fonte de regra | Agentes seguem texto vencido | Regra testável primeiro, texto depois (ADR-010 §3) |

## 5. Recomendações prioritárias

1. **Decisões do dono** (lista completa em `EVOLUTION-ROADMAP.md` §1): D-01 R36, D-02 reprodução de imagem, D-03 ligar linhagens às regras, D-05 revisor noturno e itens com conflito ou duvidosos.
2. **Conferência de afirmações no `write`** (EV-03): números, datas e nomes da saída precisam existir no material das fontes; senão o parágrafo cai, como já acontece com parágrafo sem citação.
3. **Alerta que chega a uma pessoa** (EV-04): envio do `oncall_email` por um provedor de e-mail e erro do servidor em um rastreador, com o tick atrasado e o disjuntor como primeiros gatilhos.
4. **Conferir em produção** o disjuntor (P1-03) e aplicar a migration 0150.
5. **Avaliações por agente** (EV-05) antes de qualquer aumento de autonomia, e avaliação como portão da publicação de prompt.
6. **Higiene de governança** contínua: decisões com status, `STATE.md` curto, specs filhas registradas como emendas (ADR-010, ADR-011).

## 6. O que esta auditoria mudou

| Mudança | Arquivos | Validação |
|---|---|---|
| P0-01: revisor não decide rascunho sem IA e recebe conflito e duvidoso no contexto | `src/lib/pipeline/steps/auto-reviewer.ts`, `supabase/migrations/0150_reviewer_skips_ai_fallback.sql` | Testes unitários (`auto-reviewer.test.ts`, 2 novos) e de integração (`aut-t6-reviewer.test.ts`, 1 novo, roda no CI) |
| P0-02: linhagens independentes em sombra | `src/lib/confidence/lineage.ts`, `src/lib/pipeline/steps/verify.ts` | `lineage.test.ts` (7 casos), `understand.test.ts` (1 novo); confiança e portões inalterados |
| P1-01: governança | `CLAUDE.md` §1, §2, §5; `.planning/STATE.md`; `.planning/DECISIONS.md`; `docs/architecture.md` | Revisão de texto |
| Operação | `.env.example` (6 variáveis em uso que faltavam), `docs/runbooks/restore.md` (alinhado ao `backup.yml`), `docs/media-slots.md` (aviso de desatualização) | Revisão de texto |

O relatório de conclusão, com o que foi validado e o que ficou pendente, está em `EVOLUTION-ROADMAP.md` §5.

## 7. Mapa da documentação desta auditoria

| Documento | Conteúdo |
|---|---|
| `CURRENT-ARCHITECTURE.md` | Arquitetura e fluxos como estão, com diagramas |
| `EDITORIAL-INTELLIGENCE.md` | Fontes, agrupamento, verificação, geração e publicação, etapa por etapa |
| `RULES-INVENTORY.md` | Inventário de regras, conflitos e matriz KEEP/MODIFY/RELAX/… |
| `TARGET-ARCHITECTURE.md` | Arquitetura-alvo e critérios de desacoplamento |
| `AI-ORCHESTRATION.md` | Agentes, modelos, prompts, custos, fallback |
| `MEDIA-POLICY.md` | Imagens e multimídia |
| `EDITORIAL-POLICY.md` | Qualidade, originalidade, verificação, correção |
| `CONFIGURATION-STRATEGY.md` | O que é fixo, configurável, automatizado ou experimental |
| `EVOLUTION-ROADMAP.md` | Iniciativas priorizadas, decisões do dono, relatório de conclusão |
| `MIGRATION-PLAN.md` | Etapas incrementais, compatibilidade, rollback |
| `../adr/` | ADR-010 a ADR-014 |

## 8. Decisões do dono e implementação (04/10/2026)

As decisões D-01 a D-06 foram tomadas pelo dono e implementadas no mesmo dia (A-133 a A-138, migrations 0151 a 0153, ADR-015). Matriz, validação e pendências em `docs/reports/decisoes-auditoria-360.md`. Este relatório continua como retrato datado do diagnóstico; os documentos temáticos foram atualizados com o comportamento implementado.

