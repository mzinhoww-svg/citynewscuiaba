# Política editorial

Data: 04/10/2026. Princípios de qualidade, originalidade, verificação, atribuição, correção e revisão, ligados ao que o código impõe. Legenda [O]/[I]/[R] em `AUDIT-REPORT.md`. Onde há decisão pendente do dono, a seção diz.

## 1. Princípios

1. **Fato tem fonte.** Toda afirmação de fato tem uma fonte que a sustenta, citada no texto.
2. **Cópia não é confirmação.** Várias matérias que repetem o mesmo release contam como uma fonte.
3. **Alegação é atribuída.** O que uma fonte diz, e ninguém mais confirmou, aparece como dito por ela ("segundo a polícia", "de acordo com a prefeitura").
4. **Valor próprio.** A matéria do CityNews acrescenta síntese, contexto, comparação ou serviço. Paráfrase de uma matéria de terceiros não é produção própria.
5. **Incerteza aparece.** Divergência entre fontes é mostrada, não escondida; lacuna é dita.
6. **Erro se corrige à vista.** Correção é registrada e datada.
7. **Pessoas protegidas.** Presunção de inocência; menor de idade e vítima de violência sexual nunca identificáveis; nada de método em caso de suicídio; saúde sem orientação clínica.

## 2. O que já é imposto pelo código [O]

| Princípio | Mecanismo | Evidência |
|---|---|---|
| Fato tem fonte | parágrafo sem citação de item válido é descartado | `write.ts:111-127` |
| Valor próprio (parcial) | parágrafo com 8 palavras seguidas da fonte é descartado; resumo de agregado ≤ 2 frases e sem cópia | `write.ts`, `schemas/aggregate-summary.ts` |
| Alegação atribuída (parcial) | regra de atribuição e linha "Com informações de {fonte}" | `write.ts:55-58`, `credit-line.ts` |
| Incerteza | conflito confirmado por regra manda para revisão | `verify.ts:76-99`, `rules/index.ts:139` |
| Pessoas protegidas (parcial) | regras de redação no prompt para segurança, política, saúde e sensível | `write.ts:55-56` |
| Correção | correção e direito de resposta só por pessoa; prazo de 24 h; histórico público por matéria | `studio/corrections.ts`, `materia/[slug]/historico` |
| Pergunte | sem fonte recusa; 1 veículo responde atribuído (A-134); fato sem citação cai; fato, inferência, lacuna e conflito separados | `ai/answer.ts` |

## 3. O que falta

| Princípio | Lacuna | Iniciativa |
|---|---|---|
| Cópia não é confirmação | independência conta veículos | P0-02, ADR-012, D-03 |
| Fato tem fonte | número, data, nome ou citação errados num parágrafo com citação válida passam | P0-03, EV-03 |
| Pessoas protegidas | regras só no prompt; nada verifica a saída | EV-03 |
| Valor próprio | nenhuma medida de quanto a matéria acrescenta; corpo de fonte "só link" usado como material | §5 |
| Erro se corrige | matéria publicada não incorpora fonte nova nem divergência nova | P1-04, EV-08 |

## 4. Conferência de afirmações (proposta para EV-03) [R]

Função pura `checkClaims(paragraph, citedItems)` rodando no `write` depois da guarda de cópia:

1. Extrai do parágrafo números (reaproveitando `extractNumbers` de `verify.ts:51-66`), datas, nomes próprios (sequências com inicial maiúscula fora do começo de frase) e trechos entre aspas.
2. Cada número e data precisa aparecer, normalizado, no material dos itens citados no parágrafo.
3. Cada trecho entre aspas precisa existir literalmente (com normalização de espaço e acento) no material citado.
4. Nome próprio ausente do material citado e do dicionário de lugares marca o parágrafo como "não conferido".
5. Parágrafo com número, data ou citação sem suporte cai, como já cai o parágrafo sem citação. Nome não conferido sobe o nível de risco da matéria (R3 em `EDITORIAL-INTELLIGENCE.md` §4).
6. Em segurança e acusação a pessoa: "culpado", "criminoso", "assassino" aplicado a pessoa nomeada sem "condenado" no material vira parágrafo descartado; menção a idade < 18 junto a nome próprio vira bloqueio (R4).

Medida antes de ligar: rodar em sombra por uma semana, gravando em `decisions` quantos parágrafos cairiam, e só então derrubar.

## 5. Originalidade e direitos

- **Agregado** (card de outro veículo): título original, data, resumo próprio de até 2 frases quando a política da fonte permite, link. Nunca o corpo. [O, mantido]
- **Matéria do CityNews a partir de fontes:** síntese própria com citação. O corpo da fonte (`collected_items.source_text`, até 6.000 caracteres) é material de apuração interno, nunca publicado [O]. **Decisão pendente:** fonte cuja política é "só link" deveria entrar como material de escrita? Proposta: sim para extrair fatos, com a guarda de cópia e a conferência de afirmações ligadas; o texto final precisa citar a fonte e acrescentar contexto de pelo menos uma outra linhagem ou do acervo, senão vira resumo curto com link (formato "resumo factual com atribuição") [R].
- **Fonte única:** publica como resumo factual atribuído, curto, com link em destaque. O mínimo de 30 linhas (R41) não deve forçar enchimento: o próprio R41 já prevê `short_reason = insufficient_source` [O].

## 6. Pergunte (D-01, resolvida em A-134)

O dono escolheu a proposta segura (04/10/2026: "não recusa, passa com 1 fonte"). A R36 original, responder sem fonte, não vale.

| Situação | Comportamento |
|---|---|
| ≥ 2 veículos | Responde com fatos citados |
| 1 veículo | Responde **só** com o que essa fonte diz, cada fato atribuído ("Segundo {fonte}…"), confiança baixa e a lacuna "nenhuma outra fonte confirmou" |
| 0 veículos | Não responde o fato; explica e mostra a busca tradicional |

Assim o leitor quase nunca fica sem resposta e o sistema nunca afirma sem fonte.

## 7. Revisão por risco

Os níveis R0 a R4 estão em `EDITORIAL-INTELLIGENCE.md` §4. O revisor automático noturno decide R1 a R3 que subiram para a fila; nunca decide rascunho sem IA (P0-01, implementado), correção, direito de resposta, denúncia ou mudança de regra. **Decisão pendente (D-05):** conflito confirmado e conteúdo duvidoso à noite vão ao revisor automático (leitura da A12) ou esperam pessoa (leitura da §1 da spec de autonomia, "humano só em dois casos: duvidoso ou fontes divergentes")? Até a decisão, o revisor recebe esses dois sinais explicitamente no contexto (implementado) e a política recomendada é esperar pessoa.

## 8. Correção, atualização e retirada

- Correção e direito de resposta: humanos, prazo de 24 h, registro público (mantido).
- Atualização: item novo com fato novo numa matéria publicada gera **acompanhamento** (bloco datado "Atualização às HHh") em vez de só aviso, quando a matéria não foi editada por pessoa (EV-08). Hoje só a operação manual faz reescrita ao vivo (0147).
- Retirada: matéria automática pode ser despublicada em um clique; 3 denúncias em 24 h ligam o banner "em revisão" (mantido).
