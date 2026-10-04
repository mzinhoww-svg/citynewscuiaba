# Orquestração de IA

Data: 04/10/2026. Inventário de agentes, modelos, prompts, ferramentas, dependências, custos e fallback, como estão no código e no banco. Legenda [O]/[I]/[R] em `AUDIT-REPORT.md`.

## 1. Arquitetura da chamada

Um único ponto chama modelos: `createCallAgent` e `createEmbedder` em `src/lib/ai/call-agent.ts`. Só `src/lib/ai/openrouter.ts:43` importa `ai` e `@ai-sdk/openai-compatible` [O].

```mermaid
sequenceDiagram
  participant Etapa as Etapa do pipeline
  participant CA as callAgent
  participant DB as ai_agents / ai_prompts / ai_models
  participant P as Provedor (OpenRouter | falso)
  participant L as ai_calls
  Etapa->>CA: agentId, {system, data[], task}, schema zod
  CA->>DB: agente, prompt em produção, modelo + fallback (cache 60 s)
  CA->>CA: sanitiza cada bloco (6.000 car.); injeção recusa a chamada
  CA->>DB: gasto do dia (ai_spend_since) vs orçamento do agente e teto R$ 30
  CA->>P: SYSTEM_GUARD + prompt + contexto + JSON Schema; dados em <fonte_externa id>
  P-->>CA: texto JSON
  CA->>CA: valida com zod; falha → modelo de fallback
  CA->>L: tokens, custo em R$, latência, fallback, erro
  CA-->>Etapa: Result<saída tipada, AiError>
```

**Troca de modelo sem deploy [O]:** sim, para qualquer modelo servido pelo OpenRouter: o Control Center edita modelo, fallback e prompt (`src/lib/studio/ai-prompts.ts:323`, auditado como `ai.model.update`). Modelo inativo sai da cadeia (`call-agent.ts:147-150`).

**Troca de provedor [O]:** exige um novo `ModelProvider` (`src/lib/ai/types.ts:87-104`). Só existem `openrouter` e `fake`. Sem `OPENROUTER_API_KEY` o sistema cai **silenciosamente** no provedor falso (`server.ts:35-39`) [O]; em produção isso deveria ser alerta, não silêncio [R].

**Parâmetros [O]:** temperatura 0,2 e 2.048 tokens de saída para todos; `maxRetries: 0` no SDK; raciocínio desligado; timeouts por agente em `registry.ts:11-22`.

## 2. Agentes

| # | Agente | Onde roda | Responsabilidade | Saída (zod) | Timeout | Orçamento/dia | Idempotência | Sem IA |
|---|---|---|---|---|---|---|---|---|
| 1 | `classify` | `steps/classify.ts:56` | editoria, relevância 0–1, sensível, ≤ 8 tags, comoção nacional | `schemas/classify.ts:20-29` | 20 s | R$ 3 | hash (item, prompt, texto) | retentativa → quarentena |
| 2 | `aggregate_summary` | `steps/aggregate-summary.ts:51`, dentro do `classify` | resumo próprio ≤ 2 frases/280 car. de item agregado | `schemas/aggregate-summary.ts:84-91` | 15 s | R$ 1 | hash | card só com título, data, link |
| 3 | `locate` | `steps/locate.ts:38`, só se o dicionário falhar | município e bairro | `schemas/locate.ts:4-8` | 20 s | R$ 2 | hash | localidade da fonte |
| 4 | `verify` | `steps/verify.ts:120` | fato principal, papel dos itens, conflito central, duvidoso, sem atribuição | `schemas/verify.ts:9-31` | 30 s | R$ 4 | hash (assunto, revisão, prompt) | retentativa → quarentena; **matéria não sai** |
| 5 | `write` | `steps/write.ts:190` | título, linha fina, resumo, 1–12 parágrafos citados | `schemas/write.ts:4-18` | 45 s | R$ 9 | hash | **rascunho sem IA** (`in_review`) |
| 6 | `reviewer` | `steps/auto-reviewer.ts:125`, a cada 5 min, lote 8 | publicar, manter ou arquivar matéria vencida na fila | `schemas/review.ts:11-14` | 30 s | R$ 1 | decisão `review` depois da última mudança | manter; orçamento esgotado encerra a passada |
| 7 | `answer` | `ai/answer.ts:267` via `search/ask.ts` | resposta do Pergunte com fatos, inferências, lacunas, conflitos citados | `schemas/answer.ts:12-24` | 25 s | R$ 6 | não | busca tradicional |
| 8 | `source_profiler` | `sources/profile.ts:104` (ação do Estúdio) | sugere editorias, localidade, seletores | `schemas/source-profile.ts:30-39` | 20 s (padrão) | R$ 1 | não | sugestões por regra |
| 9 | `image` | `studio/media.ts:335` (só Estúdio) | decide se cabe ilustração e descreve | `schemas/image.ts:7-12` | 20 s | R$ 2 | não | mensagem ao editor; **não há gerador** |
| 10 | `embed` | `call-agent.ts:239-288` | vetores de 1.536 dimensões para deduplicação, assunto, indexação, busca | comprimento e finitude | 15 s | R$ 1 | uma vez por item | deduplicação trava; busca e índice ficam só em FTS |
| — | extrator de links do Guia | `guide/extract-link.ts:36` | nomes de lugares | `schemas/guide.ts` | — | — | — | **gancho nunca ligado** (`studio/guide.ts:94`) |

Modelos padrão [O]: todos os agentes de texto com `google/gemini-2.5-flash` e fallback `openai/gpt-4o-mini`; embedding `openai/text-embedding-3-small` sem fallback (`defaults.ts:9-24,131-138`). A produção usa outros modelos registrados direto no banco (A-094) [O]; seeds e migrations não refletem isso de propósito. Consequência: o estado real de modelos só se conhece consultando `ai_agents` em produção [R: exportar o registro para `docs/` a cada mudança, ou mostrar no Control Center com data].

## 3. Guardas que não dependem do modelo

| Guarda | Agente | Evidência |
|---|---|---|
| Texto externo sanitizado, NFKC, homóglifos, padrões de injeção pt/en, delimitado | todos | `security/sanitize.ts:127-232`, `call-agent.ts:153-160` |
| Papel `primary` só pelo cadastro | `verify` | `verify.ts:129-136` |
| Conflito só vale se cada valor existir no texto do item (números normalizados) | `verify` | `verify.ts:51-99` |
| Parágrafo sem citação válida cai; 8 palavras copiadas cai | `write` | `write.ts:111-127` |
| Resumo de agregado descartado se copiar 8 palavras | `aggregate_summary` | `schemas/aggregate-summary.ts:20-33` |
| Bairro só se existir no dicionário | `locate` | `locate.ts:61-68` |
| < 2 veículos → recusa antes de chamar o modelo; fato sem citação cai | `answer` | `answer.ts:78,187-245,264` |
| Arquivar "por prazo" vira manter; rascunho sem IA nunca chega (P0-01) | `reviewer` | `auto-reviewer.ts:77-99` |
| Ilustração bloqueada para crime, saúde, tragédia; nada fotorrealista | `image` | `media/choose.ts:36-92` |

**Lacuna principal (P0-03):** não há guarda de afirmação no `write` nem no `answer`. A técnica já existe no `verify` (`extractNumbers`, comparação de lugares) e pode ser reaproveitada: todo número, data e nome próprio de um parágrafo precisa aparecer no material do item citado. Ver `EDITORIAL-POLICY.md` §4.

## 4. Custos, orçamento e risco de gasto

- Custo por chamada em R$ em `ai_calls` (`call-agent.ts:186-197`); orçamento por agente e teto global de R$ 30/dia imposto por trigger (`0036_ai_prompts_playground.sql:141-152`); visão `ai_cost_daily` [O].
- Pior caso por item em `classify` ou `verify`: 4 tentativas × 2 modelos = 8 chamadas pagas [I]. Pior caso por assunto no `write`: até 3 chamadas (2 reescritas por texto curto) × 2 modelos, repetido a cada item novo no assunto [I].
- Verificação de orçamento por leitura, sem reserva: drains paralelos podem passar do teto (P1-10) [I].
- A busca pública cria `createProductionAi()` por consulta (`search/server.ts:38`): o cache de 60 s nunca aquece e cada busca custa 3 a 4 consultas extras ao banco [O].
- Embedding compartilha R$ 1/dia e está no caminho crítico da deduplicação: esgotar o orçamento trava a coleta [I].

Custo por notícia processada não é medido como métrica [R: `ai_calls` já tem o necessário; falta agregar por `topic_id` e mostrar no Control Center].

## 5. Redundâncias, prompts longos e oportunidades

| Item | Situação [O] | Proposta [R] |
|---|---|---|
| Guarda de injeção | `SYSTEM_GUARD` + prompt do `reviewer` + prompt do `source_profiler` repetem a mesma instrução | Só o `SYSTEM_GUARD` |
| JSON Schema completo no system prompt | Anexado a toda chamada, além de `Output.json()` | Manter só se o provedor não aceitar saída estruturada; medir tokens |
| `write` | Prompt pede "rascunho curto"; tarefa exige ≥ 30 linhas e 8–12 parágrafos; 12 parágrafos + JSON em 2.048 tokens é apertado | Alinhar o prompt à tarefa; `max_tokens` do `write` em 4.096 no registro |
| `write` reescreve tudo a cada item novo | Custo cresce com o assunto | Reescrita só quando o item traz fato novo (linhagem nova ou valor novo) |
| `classify` + `locate` | Mesma entrada, duas chamadas | Uma chamada; `locate` vira campo do `classify` com validação pelo dicionário |
| `aggregate_summary` em série dentro do `classify` | Latência somada | Rodar em paralelo |
| `verify.mainFact` | Gravado, nunca lido | Passar ao `write` como âncora do lide |
| `classify.relevance` | Gravado, nunca usado | Usar no score de destaque ou remover do schema |
| `source_profiler` sem timeout próprio | Usa o padrão de 20 s | Registrar |
| Rascunho sem IA só no `write` | `verify`/`classify` falhos vão para quarentena | Assunto em quarentena por IA vira item no Control Center com "reprocessar quando a IA voltar" (já há reprocessamento manual) |

Não recomendo agentes novos por tendência. As duas camadas que se pagam são **verificação de afirmações** (regra, não agente) e **extração de entidades** (um campo a mais no `classify`, quando houver uso concreto: linha do tempo e dossiê).

## 6. Avaliação

[O] `tests/fixtures/eval/answer.json` tem 6 casos (3 respondem, 3 recusam) só para `answer`; limites em `eval.ts:87-94` (precisão ≥ 0,9, cobertura ≥ 0,8, 0 sem fonte, ≤ 2 alucinações em 100, p95 ≤ 8 s); o CI roda com o provedor falso (`regression.yml`), o que testa as regras e não o modelo. `eval_cases` no banco pode rodar contra o provedor real pelo Estúdio, sem casos semeados. Avaliação não bloqueia publicação de prompt.

**Conjuntos de avaliação propostos [R]** (fixtures fictícias, como manda ED-15):

| Agente | Casos | Métrica e limite inicial |
|---|---|---|
| `dedupe`/`cluster` (regras + embedding) | idênticas com títulos diferentes; mesmo release em 3 veículos; mesmo tema, fatos diferentes; atualização 4 dias depois | precisão de agrupamento ≥ 0,9; nenhuma fusão de fatos distintos |
| `verify` | fontes que concordam; divergência de número, data, local; release copiado (linhagem); opinião | precisão de conflito ≥ 0,9; falso conflito ≤ 5% |
| `classify` | um caso por editoria; sensível; comoção nacional; local × nacional | acerto de editoria ≥ 0,85; recall de sensível ≥ 0,95 |
| `write` | fonte única; multifonte; dados incompletos; alegação não verificada; segurança com suspeito; saúde | 0 afirmação sem suporte (após EV-03); 0 violação das regras de redação; ≥ 30 linhas quando há material |
| `reviewer` | conflito; duvidoso; fonte única não confiável com acusação; matéria boa vencida | 0 publicação de R4; concordância com rótulo humano ≥ 0,8 |
| `answer` | os 6 atuais + pergunta local sem cobertura + pergunta com conteúdo enganoso | os limites atuais |

Portão: `prompt_publish` só aceita versão com `eval_runs` aprovado nas últimas 24 h para o agente (EV-05).
