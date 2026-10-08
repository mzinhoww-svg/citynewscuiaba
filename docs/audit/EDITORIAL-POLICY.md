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
| Pergunte | < 2 veículos recusa; fato sem citação cai; fato, inferência, lacuna e conflito separados | `ai/answer.ts` |

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

## 6. Pergunte (D-01, decidida e implementada)

Decisão do dono: **com fontes relevantes, responder; sem fontes relevantes, informar a limitação** (A-133, substitui a R36 e o mínimo de 2 fontes).

| Situação | Comportamento [O] (`src/lib/ai/answer.ts`) |
|---|---|
| ≥ 2 veículos | Responde com fatos citados; divergências em bloco próprio, com a versão de cada fonte |
| 1 veículo (ou várias matérias do mesmo veículo) | Responde só o que ele sustenta, atribuído ("Segundo {veículo}"), com o aviso "Baseada em uma única fonte, ainda sem confirmação de outro veículo" |
| Fontes encontradas, mas nenhuma responde | O modelo devolve `facts` vazio; o leitor vê "Não encontramos fontes suficientes", as fontes relacionadas e a busca tradicional |
| Nenhuma fonte | Mesma tela, com sugestão de pauta; nada é inventado nem citado |
| Fonte com mais de 72 h | Responde e mostra "Informação de {data}: pode ter mudado desde então" |
| Busca ou provedor fora | Erro explícito ("serviço falhou"), nunca confundido com falta de fonte |

Guardas que não dependem do modelo continuam: fato sem citação válida cai, frase que copia a fonte cai, patrocinado nunca é fonte, pergunta com instrução embutida não vai ao modelo.

## 7. Revisão por risco

Implementado pela D-05 (A-137) em quatro níveis, por motivo explícito (`src/lib/rules/risk.ts`):

| Nível | Motivos | Destino |
|---|---|---|
| 1 baixo | nenhum | Publica sozinho |
| 2 moderado | fonte única não oficial; divergência em assunto comum; urgente com dado preliminar | Publica sozinho quando o núcleo está sustentado; o redator atribui cada versão e marca o preliminar (`DIVERGENCE_RULE`) |
| 3 alto | duvidoso; divergência sobre fato central em assunto grave; acusação de fonte não confiável sem segunda fonte | Fila de revisão; o revisor noturno decide com o nível no contexto e só publica se o texto relata apenas o sustentado e atribui as versões |
| 4 crítico | rascunho sem IA (sem processamento suficiente) | Nunca publica sozinho; reavaliado quando chega fonte nova ou a IA volta |

A publicação da divergência comum (nível 2) só passa a valer com as regras v4 ativas (`riskLevels`); até a ativação no painel, a regra v3 manda toda divergência para revisão. O nível e os motivos ficam gravados em toda decisão e em `articles.risk_level`. O revisor nunca decide correção, direito de resposta, denúncia ou mudança de regra.

## 8. Correção, atualização e retirada

- Correção e direito de resposta: humanos, prazo de 24 h, registro público (mantido).
- Atualização: item novo com fato novo numa matéria publicada gera **acompanhamento** (bloco datado "Atualização às HHh") em vez de só aviso, quando a matéria não foi editada por pessoa (EV-08). Hoje só a operação manual faz reescrita ao vivo (0147).
- Retirada: matéria automática pode ser despublicada em um clique; 3 denúncias em 24 h ligam o banner "em revisão" (mantido).
