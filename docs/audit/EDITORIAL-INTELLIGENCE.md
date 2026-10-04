# Inteligência editorial · como o sistema capta, entende, verifica, escreve e publica

Data: 04/10/2026. Legenda [O]/[I]/[R] em `AUDIT-REPORT.md`. Cada etapa traz o arquivo responsável, entrada e saída, regra de decisão, erro e recuperação, ponto de intervenção humana e status (**completo**, **parcial**, **experimental**, **inexistente**).

## 1. Pipeline etapa por etapa

| # | Etapa | Arquivo | Entrada → saída | Regra de decisão | Erro e recuperação | Humano | Status |
|---|---|---|---|---|---|---|---|
| 1 | Descoberta | `pipeline/tick.ts:65-111`, `fast-tick.ts`, `steps/fetch.ts:102-230`, `sources/frequency.ts` | fontes `active`/`degraded` → job `fetch` por fonte | frequência ≥ 30 min (rápida < 30 min até `fast_lane_max`), `Crawl-delay` ×2, termos | 429/5xx transitório; 3ª falha final pausa a fonte e avisa | "Coletar agora", pausar/retomar | Completo |
| 2 | Coleta e metadados | `steps/validate.ts`, `extract.ts`, `enrich.ts` | feed ou página → entradas sanitizadas; corpo em `collected_items.source_text` (até 6.000 caracteres) | robots antes de cada pedido; SSRF, 3 redirecionamentos, 10 s, 5 MB; `enrich` quando trecho < 600 caracteres | campo com injeção descartado; `enrich` falho segue sem corpo | não | Completo |
| 3 | Fonte original × secundária | `steps/verify.ts:128-136` | itens → papel `primary`/`secondary`/`context` | `primary` só pelo cadastro (`reliability='primary'`), nunca pela IA | — | cadastro da fonte | **Parcial**: sem detecção de agência, release ou `rel=canonical` entre domínios |
| 4 | Normalização | `steps/normalize.ts:22-56`, `canonical-url.ts` | entradas → `collected_items` | URL canônica sem `utm_*`, `fbclid`, `gclid`; único por `canonical_url` | injeção → quarentena + alerta de segurança | não | Completo |
| 5 | Duplicidade | `steps/dedupe.ts:7-60`, `simhash.ts` | item → duplicado de / novo | simhash do **título** com Hamming ≤ 3 **ou** cosseno ≥ 0,90 (título + trecho), 72 h, 20 candidatos anteriores | sem embedding → erro transitório (trava o item) | não | Completo, com risco (P1-04) |
| 6 | Classificação | `steps/classify.ts:19-89`, `locate.ts` | item → editoria, relevância, sensível, ≤ 8 tags, comoção nacional, bairro/município | IA; bairro só se existir no dicionário | IA falha → retentativas → quarentena; `locate` cai na localidade da fonte | não | **Parcial**: urgência não classificada, `relevance` não usada |
| 7 | Confiabilidade | `steps/verify.ts`, `confidence/index.ts`, `sources/trusted.ts`, `rules/dubious.ts` | assunto → independentes, primárias, conflito, duvidoso, confiança | conflito vale só se os valores existirem no texto de cada item; score = 0,3·indep + 0,3·primária + 0,25·sem conflito + 0,15·frescor | IA falha → quarentena do assunto | fila de revisão | **Parcial**: independência = veículos (P0-02) |
| 8 | Entidades | — | — | — | — | — | **Inexistente** (só bairros e tags) |
| 9 | Enriquecimento | `steps/enrich.ts`, `aggregate-summary.ts` | página da fonte; resumo de 2 frases para agregados | resumo só com política `summary_2_sentences`, não sensível, sem cópia de 8 palavras | falha ignorada (card mostra título, data, link) | não | Parcial: sem contexto do acervo próprio |
| 10 | Agrupamento | `steps/cluster.ts:8-72` | item → assunto | centróide com cosseno ≥ 0,82 em assuntos de 72 h; senão assunto novo | — | não | **Parcial**: sem fusão, sem distinguir atualização de fato novo |
| 11 | Geração | `steps/write.ts:151-273` | assunto → matéria | todos os itens como material; parágrafo sem citação válida ou com 8 palavras copiadas cai; regras de redação para segurança, política, saúde e sensível; linha "Com informações de {fonte}" | IA falha → rascunho sem IA (`in_review`) | edição no Estúdio | Completo para um formato; sem conferência de afirmações (P0-03) |
| 12 | Imagem | `steps/media.ts:103-434`, `media/choose.ts` | assunto → capa e imagem interna | cascata: acordo → reprodução (flag) → licenciada (vazia) → acervo → IA (desligada) → cartão tipográfico | sem capa em 10 min → cartão | aprovar, trocar, remover | Completo, com risco jurídico (P0-04) |
| 13 | Título, SEO, tags | `write.ts`, `steps/auto-checklist.ts:112-165` | matéria → `seoTitle` (70), `seoDescription` (160), tags, alt | completa o que falta | — | edição | Parcial: SEO por recorte, sem geração própria |
| 14 | Revisão | `rules/index.ts:116`, `steps/decide.ts:139-169`, `steps/auto-reviewer.ts` | rascunho → publicar, revisar, reter | regras v3 (ver §4); revisor noturno decide vencidos | regras não carregam → padrão com `forceReview` (falha fechado) | fila, "Publicar mesmo assim", desfazer | Completo |
| 15 | Publicação | `steps/publish.ts`, `studio/publish.ts` | aprovado → `published` | checklist, completude (30 linhas), ≤ 2 reescritas, disjuntor | — | agendar, publicar | Completo; reescrita ao vivo sem reindexação (P1-09) |
| 16 | Distribuição | `0043_push_cron.sql`, `seo/sitemap.ts` | publicada → push, sitemap de notícias | push automático com 600 s de atraso, nunca urgente nem patrocinado | — | push urgente com aprovação | **Parcial**: sem RSS de saída, newsletter sem envio, sem redes sociais |
| 17 | Atualização e retirada | `0147_live_rewrite.sql`, `studio/corrections.ts`, `media/takedown.ts`, `0140` | nova fonte, correção, denúncia, remoção | matéria publicada só gera aviso de fonte nova; 3 denúncias em 24 h → banner "em revisão" | — | correção e direito de resposta são humanos por lei | Parcial |
| 18 | Desempenho e retorno | `pipeline_events`, `ai_calls`, `ranking/signals.ts`, `featured/score.ts` | eventos → métricas e ranking | alertas no Control Center | alerta não sai do banco (P1-02) | Control Center | Parcial: nenhum retorno para regras, fontes ou geração |

## 2. Inteligência de fontes

**Como está [O].**

- Cadastro em `sources` com tipo, frequência, limite por hora, `reliability` (`primary`, `verified`, `standard`, `low`), `trusted`, `image_policy`, `republish_policy`, `may_be_sole_source`, termos, nota editorial 1 a 5 e camada 1 a 4 (`0001_init.sql:27-54`, `0011_source_admin.sql:16-53`, `0071`).
- Descoberta: uma pessoa cola um link; o sistema tenta a própria URL, RSS/Atom, `Sitemap:` do robots, JSON Feed, caminhos conhecidos e lista por seletores; o agente `source_profiler` sugere editorias e localidade, nunca política de imagem ou de republicação (`sources/discover.ts:1-10`, `profile.ts:1-11`).
- 32 fontes reais semeadas como pausadas; ativação depende de robots, termos e feed (`docs/sources-registry.md`, `docs/reports/ativacao-fontes.md`).
- Mudança que amplia `image_policy` ou `reliability` exige segunda pessoa (`sources/critical.ts`, trigger `guard_source_changes`).
- Saúde (disponibilidade 30 dias, erros 24 h, frescor) é separada da confiança (`sources/health.ts`).

**Lacunas.** Reputação é um enum manual sem histórico; não há medida de acerto, correção ou exclusividade por fonte; não há sinal de independência entre fontes (quem copia quem); não há descoberta autônoma; fonte pausada automaticamente não tem sonda de retomada; o bloqueio por robots é silencioso.

**Modelo proposto [R].** Separar quatro dimensões, cada uma com histórico e peso configurável, em vez de um enum:

| Dimensão | O que mede | De onde vem | Uso |
|---|---|---|---|
| Reputação histórica | Acerto ao longo do tempo: correções contra a fonte, divergências que ela perdeu, desmentidos | `corrections`, conflitos confirmados, decisões humanas que rejeitam itens dela | Peso no score, nunca portão sozinho |
| Natureza | Oficial, veículo, agência, assessoria, opinião, patrocinado | Cadastro + detecção (`og:type`, seção "opinião", "publieditorial") | Papel (`primary` só para oficial) e rótulo |
| Independência | Quanto do conteúdo é próprio | Linhagens (ADR-012): fração dos itens da fonte que caem em linhagem de outra fonte | Desconto na contagem de fontes |
| Atualidade | Frescor e cadência | `collected_items.published_at`, `source_fetch_outcomes` | Frescor da confiança, prioridade de coleta |

A evidência de **uma matéria** (o texto confirma? há citação de documento? há número conferível?) fica separada da reputação da **fonte**. É a distinção que o `verify` já faz para conflito e que falta para confirmação.

## 3. Agrupamento e consolidação

**Como está [O].** Duas camadas: duplicata (simhash do título ou cosseno ≥ 0,90) e assunto (cosseno ≥ 0,82 com centróide em 72 h). Duplicata herda o assunto e não conta como fonte. Assunto nunca é fundido nem dividido.

**O que o sistema precisa distinguir e como cada caso cai hoje:**

| Caso | Hoje | Proposto [R] |
|---|---|---|
| Idênticas | Duplicata (URL ou simhash/cosseno) | Igual |
| Republicação da mesma matéria em outro veículo | Às vezes duplicata (título igual), às vezes item independente | Item próprio, mesma **linhagem** (conta como 1 confirmação) |
| Independentes sobre o mesmo fato | Mesmo assunto se cosseno ≥ 0,82 | Igual, com linhagens distintas |
| Atualização de fato anterior | Mesmo assunto em 72 h; depois disso assunto novo e matéria nova | Ligação explícita `topics.parent_topic_id` + matéria de acompanhamento |
| Relacionada, outro fato | Pode cair no mesmo assunto se o texto for parecido | Exigir coincidência de entidade e data além do cosseno |
| Opinião e análise | Tratada como notícia | Natureza da fonte/item = opinião; nunca confirma fato |
| Versões divergentes | Mesmo assunto + `centralConflict` | Igual; conflito vira bloco "o que cada fonte diz" |

Princípio: **preservar o item, juntar só a referência**. O assunto aponta para os itens; nenhum item perde fonte, data ou texto.

## 4. Verificação e confiança

**Portões atuais (regras v3, `rules/index.ts:116-169`, `decide.ts:139-169`)** em ordem: entrada inválida → `breaking`/sensível só se a regra mantém → `forceReview` → `neverAuto` → categoria desconhecida ou bloqueada → **conflito confirmado** → **duvidoso** → **fonte não confiável + assunto grave + < 2 fontes** → mínimo de fontes e primária → imagem → score < 0,30 → modo. Fora das regras: rascunho sem IA, `auto_publish` desligado e `read_only` mandam para revisão; disjuntor de 300/h e 3.000/dia.

**Níveis de risco propostos [R]**, para tornar a autonomia progressiva e explicável:

| Nível | Critério objetivo | Destino |
|---|---|---|
| R0 serviço | Agenda, clima, serviço com fonte oficial | Publica |
| R1 comum | Score ≥ 0,30, sem conflito, sem duvidoso, afirmações conferidas | Publica |
| R2 grave com evidência | Segurança, política, saúde, acusação a pessoa **com** ≥ 2 linhagens ou fonte oficial **e** afirmações conferidas | Publica com linha de atribuição (decisão A2/A4 do dono) |
| R3 grave com evidência fraca | Assunto grave com 1 linhagem não oficial, ou afirmação não conferida | Revisor automático com contexto completo ou humano (D-03, D-05) |
| R4 bloqueio | Conflito confirmado, duvidoso, rascunho sem IA, menor ou vítima identificável | Humano |

O que muda em relação a hoje é só a régua de R2/R3 (linhagens e conferência de afirmações). R0, R1 e R4 já existem.

## 5. Geração editorial

**Hoje [O].** Um formato: matéria "normalizada" de 30 linhas, 8 a 12 parágrafos com citação por item, a partir de todos os itens do assunto. O resumo de agregado (2 frases) é o segundo formato, restrito ao card.

**Formatos possíveis e quando usar [R]:**

| Formato | Gatilho objetivo | Insumo que já existe |
|---|---|---|
| Resumo factual com atribuição | 1 linhagem, sem conflito | `write` atual em modo curto |
| Síntese multifonte | ≥ 2 linhagens | `write` atual |
| Comparação de versões | `centralConflict` confirmado | `verify.conflict` com valores por item |
| Linha do tempo | Assunto com ≥ 3 itens em ≥ 2 dias ou assunto-pai | `topic_items`, datas |
| Acompanhamento | Item novo em assunto com matéria publicada | aviso `new_sources` já existe |
| Explicador de impacto, serviço, perguntas frequentes | Editoria serviço/saúde/cidade e pergunta recorrente no Pergunte | eventos de busca |
| Dossiê | Tag ou entidade com ≥ N assuntos no mês | depende de entidades (EV-11) |

A escolha do formato deve ser uma função pura (`chooseFormat(topic, verify, rules)`), versionada como as regras, e não decisão livre do modelo.

## 6. Originalidade e atribuição

Ver `EDITORIAL-POLICY.md`. Resumo do que o código já garante [O]: citação por parágrafo, descarte de 8 palavras copiadas, linha de atribuição, resumo de agregado de no máximo 2 frases. Do que falta: conferência de afirmações (P0-03), regra de valor próprio (a matéria precisa acrescentar algo além da paráfrase) e o corpo da fonte usado como material quando a política dela é "só link" (C12 do `RULES-INVENTORY.md`).

## 7. Experiência do leitor e do editor

**Leitor [O].** Home com urgente, manchete, "Agora", destaques e módulos configuráveis; matéria com JSON-LD `NewsArticle` (inclui `citation` das fontes), histórico, denúncia; busca híbrida; Pergunte com fatos citados; agenda e guia; PWA e push; consentimento antes de qualquer evento. Lacunas: sem RSS de saída, sem home personalizada, origem da imagem gerada por IA invisível, matéria publicada não incorpora fonte nova.

**Editor [O].** Fila com motivo da revisão, alerta de conflito e de rascunho sem IA, diferença IA × humano, fontes com papel, tabela de justificativas por etapa (agente, versão do prompt, versão das regras). Control Center cobre fontes, regras com simulação de 7 dias, falhas e reprocessamento, logs, custos, agentes, modelos, prompts versionados, avaliações, contingência. Lacunas: divergência é um booleano, sem quadro "o que cada fonte diz"; sem linha do tempo do assunto; sem métricas editoriais (tempo até publicar, taxa de correção por agente e por fonte, cobertura de imagem); sem lista do que o revisor noturno publicou para conferência na manhã seguinte.

Funcionalidades que reduzem trabalho manual sem tirar o controle do editor [R]: relatório matinal do revisor noturno com desfazer em um clique; quadro de divergência por afirmação; "por que esta matéria" com os portões que passou; sonda automática de fonte pausada com proposta de retomada.
