# Runbook · Rollback de regras de autonomia

**Botão:** Governança → Contingência → "Rollback de regras" (só admin; confirma digitando `ROLLBACK DE REGRAS` e informa o motivo).

## O que acontece

1. `rules_rollback()` desativa a versão ativa e reativa a **versão aprovada imediatamente anterior** (aprovada por pessoa diferente de quem propôs). Auditoria `rules.rollback` com `from`, `to` e motivo.
2. Não pede aprovação nova: a versão de destino já passou pelas duas pessoas. Se não houver versão anterior aprovada, o botão não aparece e a função explica.
3. A versão desativada continua no histórico e pode ser proposta de novo (nova versão) em Control Center → Regras.
4. As decisões já tomadas não mudam; para reavaliar itens, use "Reprocessar a partir de regras" em Control Center → Execuções.

## Quando usar

- Versão nova mandou publicar sozinho algo que deveria ir para revisão (ou o contrário, em excesso).
- A simulação de 7 dias não representou o comportamento real.

## Como voltar ao normal

Proponha a versão corrigida em Control Center → Regras (simule antes) e peça a aprovação de outra pessoa.
