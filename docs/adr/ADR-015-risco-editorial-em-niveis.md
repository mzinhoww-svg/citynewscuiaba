# ADR-015 · Risco editorial em quatro níveis

Status: Aceito · Data: 04/10/2026 · Origem: decisões do dono D-03 e D-05 (A-135, A-137)

## Contexto

A publicação automática decidia por portões isolados: conflito, duvidoso, fonte não confiável com assunto grave, score. Qualquer divergência entre fontes mandava a matéria para revisão, inclusive divergência secundária em assunto comum, e de noite isso segurava cobertura. O dono decidiu classificar por nível de risco, publicar o máximo de notícia relevante com o núcleo sustentado e manter a linhagem de texto só como indicador.

## Decisão

1. `classifyRisk` (src/lib/rules/risk.ts), função pura: nível 1 a 4, sempre a partir de motivos explícitos, nunca de pontuação opaca. Os motivos ficam na decisão (`decisions.output.risk`) e o nível em `articles.risk_level`.
2. O nível é registrado com qualquer versão de regras. O comportamento muda só com `riskLevels: true` no corpo da regra (v4): divergência em assunto comum deixa de ser portão (o redator atribui as versões), e divergência sobre fato central em assunto grave vira `conflict_grave` (revisão).
3. O revisor automático usa a mesma função: recebe nível e motivos, decide níveis 2 e 3 e nunca o 4. `review_due_articles` aplica o mesmo critério no SQL.
4. Linhagens de texto ficam fora de `classifyRisk` e de qualquer portão (D-03). Passar a usá-las é decisão futura do dono.

## Alternativas consideradas

- **Pontuação única de risco:** mistura evidência, reputação, independência e relevância num número difícil de explicar e auditar.
- **Trocar o comportamento direto na v3:** mudaria a publicação em produção sem simulação; a v4 inativa permite simular 7 dias e reverter com `rules_rollback`.

## Consequências

- Toda decisão passa a ser explicável por nível e motivo, e as visões `editorial_risk_daily` e `verify_lineage_daily` permitem medir antes de fixar metas.
- O nível 4 hoje só tem o motivo "rascunho sem IA"; um detector de conteúdo fabricado ou a conferência de afirmações (EV-03) podem acrescentar motivos sem mudar o modelo.
