# ADR-010 · Hierarquia de regras e resolução de conflitos

Status: Aceito · Data: 04/10/2026 · Origem: auditoria 360 (P1-01, conflitos C1, C4, C5, C16 de `docs/audit/RULES-INVENTORY.md`)

## Contexto

A ordem de autoridade de `CLAUDE.md` §1 dizia que a spec mestre vence. Depois dela vieram specs filhas e rodadas de respostas do dono que a substituem por decisão expressa (autonomia de publicação, UI pública, rodada 3), e `AUTONOMY.md` §2 trazia outra ordem de desempate. Agentes diferentes resolviam o mesmo conflito de formas diferentes, e regras de vocabulário em texto estavam mais frouxas que os testes.

## Decisão

1. **Camadas.** As regras se organizam em: (1) fundamentais — integridade, segurança, conformidade, direitos de terceiros; (2) negócio configurável; (3) preferências editoriais; (4) parâmetros operacionais; (5) experimentos. Definição e exemplos em `docs/audit/CONFIGURATION-STRATEGY.md` §1.
2. **Ordem de autoridade**, da mais forte para a mais fraca:
   1. Regra executável (teste, trigger, check, RLS, lint) — é o que o sistema faz de fato.
   2. Decisão do dono datada (spec filha, rodada de respostas, `A-###` marcada como decisão do dono) — a mais recente vence a mais antiga no mesmo tema.
   3. `CLAUDE.md` §5 a §8.
   4. Spec mestre e specs filhas sem decisão do dono.
   5. `DESIGN.md`, `PRODUCT.md`, `docs/screens.md`, `docs/architecture.md`, ADRs.
   6. Planos, relatórios, `.planning/`.
3. **Conflito.** Quando dois textos discordam: vale o mais forte pela ordem acima; o agente registra o conflito (`A-###` com status) e corrige o texto mais fraco no mesmo PR, ou abre a correção como pendência. Quando o texto discorda de uma regra executável, o teste vence e o texto é corrigido.
4. **Exceção da camada 1.** Decisão do dono que reduz uma garantia da camada 1 (exemplo: responder sem fonte, publicar sem atribuição) não é aplicada direto por agente: o agente registra a decisão como pendente, apresenta alternativa que preserva a garantia e pede confirmação. Foi o caso da R36 (D-01).
5. **Escopo.** Regra global fica em `CLAUDE.md` e é curta. Regra de módulo fica no documento do módulo ou no próprio código. Regra editorial fica em `docs/audit/EDITORIAL-POLICY.md` e `MEDIA-POLICY.md`. Regra operacional fica em `docs/runbooks/`.

## Alternativas consideradas

- **Manter "spec mestre vence" e emendá-la a cada decisão.** Exige reescrever a spec a cada rodada; foi o que deixou de acontecer.
- **"O documento mais recente vence."** Faria um relatório ou plano qualquer vencer `CLAUDE.md`.

## Consequências

- `CLAUDE.md` §1 e `AUTONOMY.md` passam a apontar para esta ordem.
- O teste de vocabulário é a referência do vocabulário público; textos que o repetem só apontam para ele.
- Decisões do dono que tocam a camada 1 podem esperar confirmação; o resto do trabalho segue.
