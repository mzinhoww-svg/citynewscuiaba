# Runbook: reverter as regras de autonomia

Use quando uma versão de regras recém-ativada publica o que não devia, ou bloqueia demais. O rollback **não burla a aprovação dupla**: é uma nova proposta com o conteúdo da versão anterior, aprovada por outra pessoa.

## Antes de tudo

Se o dano está acontecendo agora, **pause a publicação automática** primeiro ([pausar-automatico](pausar-automatico.md)). É imediato, não depende de segunda pessoa e dá tempo para o rollback.

## Quem pode

- Propor: admin, editor-chefe e operação de IA.
- Aprovar: admin ou editor-chefe, **diferente de quem propôs**. Se a versão anterior tinha desligado `forceReview` ou afrouxado segurança, a proposta pede também as aprovações "Desligar revisão obrigatória" e "Desligar regra de segurança", e só ativa quando todas estiverem aprovadas.

## Passo a passo

1. **Administração > Contingência** > cartão "Reverter regras" > **Abrir regras e aprovações** (leva a `/estudio/control/regras`).
2. Na lista de versões, use **Comparar a versão N com a em vigor** na versão que você quer restaurar. Veja o que muda.
3. Ajuste a proposta para ficar igual à versão anterior (mesmos valores por categoria e `forceReview`), rode **Simular com os últimos 7 dias** e leia quantos itens mudariam de destino.
4. Escreva a justificativa ("Rollback da versão N: motivo") e clique em **Propor nova versão**.
5. Peça a outra pessoa (admin ou editor-chefe) para abrir **Control Center > Aprovações** e aprovar. Quem propôs vê "A aprovação precisa ser de outra pessoa" se tentar aprovar sozinho.
6. Ao aprovar, a versão nova entra em vigor na mesma transação e a anterior é desativada.

## Como verificar

- Regras: o cartão "Versão em vigor" mostra o novo número e quem aprovou.
- Auditoria: `approval.request`, `approval.approve` e a ativação, com as duas pessoas.
- Control Center > Execuções: no ciclo seguinte, a decisão registra `rulesVersion` = a nova versão.

## Se a aprovação demorar

A publicação automática pausada mantém o portal seguro. Se o motor precisa voltar a publicar antes, retome a publicação automática: as regras em vigor (mesmo as ruins) são as que decidem, então só faça isso se o problema for de outra natureza. Reativar uma versão antiga por UPDATE direto só existe pelo service role (A-065) e não deve ser usado em emergência.

## Como reverter o rollback

Repita o processo: proponha a versão que estava em vigor antes.
