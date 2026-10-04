# Runbook · Pausar publicação automática

**Botão:** Governança → Contingência → "Pausar publicação automática" (só admin; confirma digitando `PAUSAR PUBLICAÇÃO AUTOMÁTICA` e informa o motivo).

## O que acontece

1. `feature_flags.auto_publish` passa a `false` na hora; a ação fica em `audit_log` (`flag.set`, com motivo).
2. A etapa 15 (regras) passa a rotear tudo o que publicaria para **revisão** (`rule = auto_publish_off`); a etapa 17 (publicar) confere a flag de novo e também manda para revisão.
3. Itens do **ciclo em andamento** que as regras já tinham mandado publicar e ainda não foram publicados vão para a fila de revisão, com a justificativa em `decisions` (`contingency_pause_cycle`). Matérias com edição humana não são tocadas.
4. Nada é despublicado. Quem já publicou continua no ar; para tirar do ar, use "Despublicar automáticas" na fila do Estúdio.

## Quando usar

- Erro sistemático da IA (títulos errados, fontes trocadas) ou fonte comprometida.
- Incidente de segurança de prompt (evento `security` em série no Control Center).

## Como voltar ao normal

Religar é ação direta do admin (decisão do dono A-125, 04/10/2026): "Retomar publicação automática" em Control Center → Contingência, ou o interruptor em Interruptores, religa na hora, zera o disjuntor (`publish_breaker_reset`) e grava `flag.set` na auditoria. Não há segunda pessoa; o gatilho `guard_feature_flags` de 0035 foi removido em 0145.

## Verificação

- Control Center → Visão geral: "Publicação automática: pausada".
- `/estudio/fila` recebe os itens com o motivo "Publicação automática desligada…".
