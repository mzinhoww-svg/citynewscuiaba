# ADR-012 · Sombra antes de portão; linhagens independentes

Status: Aceito (fase 1) · Data: 04/10/2026 · Origem: auditoria 360 (P0-02, P0-03)

## Contexto

A independência das fontes é contada como número de veículos distintos (`verify.ts:137`). Portais que republicam o mesmo release somam fontes "independentes", sobem a confiança e destravam o portão "fonte não confiável + assunto grave + < 2 fontes". Trocar a contagem direto mudaria o volume de publicação, que o dono decidiu manter alto (spec de autonomia), sem que ninguém saiba de quanto.

## Decisão

1. **Toda regra nova de decisão de publicação roda primeiro em sombra:** calcula e grava em `decisions.output` o que faria, sem mudar rota, score nem estado. Só depois de dados suficientes (padrão: 2 semanas ou a simulação de 7 dias) e decisão do dono ela vira portão, numa nova versão de `rules`.
2. **Linhagens independentes** (`src/lib/confidence/lineage.ts`): itens do mesmo veículo, ou cujos trechos compartilham ≥ 80% das sequências de 4 palavras do menor (trechos com ≥ 15 palavras), formam uma linhagem. Título sozinho nunca junta veículos. O `verify` grava `independentLineages` ao lado de `independentSources`.
3. A conferência de afirmações (EV-03) segue o mesmo caminho.

## Alternativas consideradas

- **Embedding para detectar cópia:** mais caro, depende do provedor, e similaridade semântica não distingue "mesmo texto" de "mesmo fato". Cópia é fenômeno lexical.
- **Detectar agência por nome ("Agência Brasil", "com informações de"):** útil como sinal extra, frágil sozinho; fica como evolução.
- **Aplicar direto:** rejeitado pelo impacto desconhecido no volume.

## Consequências

- Nenhuma decisão de publicação muda nesta fase. Testes garantem que a confiança é a mesma com ou sem cópias.
- A fase 2 exige nova versão de `rules` com campo explícito, mantendo o comportamento antigo para regras sem o campo.
