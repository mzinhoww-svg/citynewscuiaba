# ADR-013 · O que o revisor automático nunca decide

Status: Aceito · Data: 04/10/2026 · Origem: auditoria 360 (P0-01)

## Contexto

O revisor automático (spec de autonomia A11/A12) decide à noite as matérias que venceram o prazo na fila. Ele já ficava fora de correção, direito de resposta, denúncia, escalada e edição humana. Mas recebia o **rascunho sem IA** — a lista de títulos, trechos e links das fontes que o `write` grava quando o modelo falha — e podia publicá-lo, republicando texto de terceiros. Também decidia sem saber se havia conflito confirmado ou conteúdo duvidoso.

## Decisão

1. O revisor nunca decide rascunho sem IA. Filtro em dois lugares: `review_due_articles` (migration 0150), para esses itens não ocuparem as vagas do lote, e `isReviewable`, para o código recusar mesmo com a função antiga.
2. O contexto do revisor sempre informa "Fontes divergentes confirmadas" e "Conteúdo marcado como duvidoso".
3. Se conflito e duvidoso devem ou não chegar ao revisor à noite é decisão do dono (D-05); até lá chegam, com o sinal explícito.

## Alternativas consideradas

- Filtrar só no código: itens recusados voltariam a cada 5 min e encheriam o lote de 8, travando a fila do revisor.
- Filtrar só no SQL: o código continuaria aceitando se a função antiga estivesse no banco.

## Consequências

- Rascunho sem IA fica na fila humana até alguém escrever a matéria ou a IA voltar e o item ser reprocessado.
- Rollback: reaplicar a função de 0141 e reverter o commit.
