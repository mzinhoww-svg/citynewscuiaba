# Orquestrador de fechamento

Estado do modo closure do CityNews. Ordem de leitura:

1. `closure-ledger.md` — cada item com estado e evidência (versão JSON: `closure-ledger.json`).
2. `production-state.md` — o que está de fato em produção, lido por consulta.
3. `migration-matrix.md` — código × migration × banco × produção (0143–0149).
4. `publication-policy-matrix.md` e `governance-matrix.md` — regras normativas e quem aprova o quê.
5. `decision-conflicts.md` — decisões que se contradizem e qual vale.
6. `dependency-map.md` — o que destrava o quê.
7. `skill-routing.md` — que skill usar para cada tipo de problema.
8. `closure-report.md` — relatório da rodada.

Regras: nenhum item vira CLOSED sem evidência no destino; toda escrita em produção segue
ler → aplicar uma → verificar; relatório de subagente é afirmação não confiável até reconferida.
