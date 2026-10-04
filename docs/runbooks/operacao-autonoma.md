# Runbook · Operação autônoma (A-133, A-134)

O CityNews resolve sozinho falha de IA, fila crescendo, disjuntor e pedidos de mudança. Este runbook diz onde olhar e quando uma pessoa entra. Desenho em `docs/superpowers/specs/2026-10-04-governanca-autonoma-design.md`.

## Onde olhar

- **Saúde da fila:** `select public.autonomy_queue_health();` (profundidade, idade do mais antigo, novas tentativas, itens mortos, reprocessos, quarentena em 24 h, exceções humanas, incidentes abertos).
- **Decisões do sistema:** `governance_decisions` (actor = system, política, versão, regra, motivo, hash das entradas) e `decisions.output.autonomy` de cada matéria (nível A0–A4, scores, próxima ação).
- **Incidentes:** `pipeline_incidents` (uma linha por causa comum, não uma por item).
- **Varredura:** a resposta de `POST /api/ingest/review-tick` traz `autonomy` (reescritas, reavaliações, itens mortos classificados e reenviados, incidentes, disjuntor).

## Disjuntor

1. Abre sozinho (volume, denúncias ou falha final de IA): desliga `auto_publish`, segura o ciclo como rascunho (`breaker_recovery`), avisa o Control Center e o plantão.
2. A cada 5 min, `publish_breaker_auto_recover` confere: resfriamento (30 min, `publish_breaker.cooldown_minutes`) e contagens abaixo de 80% dos limites. Passou: religa o que ele mesmo desligou, libera as matérias seguradas e audita `breaker.auto_recover` (actor = system).
3. Override do admin: reset manual em Interruptores/Contingência continua valendo. Para impedir o religamento automático: `update publish_breaker set auto_resume = false where id;`.
4. `auto_publish` desligado pelo dono (não pelo disjuntor) nunca é religado sozinho.

## Falha de IA

Nada vai para a fila humana. O redator tenta de novo (1 e 4 min), troca de modelo e, se o problema é formato, usa o prompt estrito. Sem sucesso, o rascunho sem IA fica em rascunho e o motor agenda nova redação em 30 min, 2 h e 6 h. Esgotado, a matéria vai para quarentena com a recomendação "reescrever quando a IA voltar"; a notícia continua no Panorama como link para o original. Para reprocessar um lote depois de um incidente: Control Center → Falhas → reprocessar, ou `update articles set quarantined_at = null, next_action = 'rewrite', next_attempt_at = now(), reprocess_count = 0 where quarantine_reason like 'IA%';`.

## Quarentena

Estado terminal fora do ar, com motivo e recomendação (`articles.quarantine_reason`). Origens: conteúdo duvidoso, duplicata, notícia com mais de 72 h, reprocessos esgotados com risco alto, falha de IA esgotada. Pessoa decide só se quiser republicar (Estúdio, como qualquer rascunho).

## Pedidos de mudança (regras, prompts, pesos, push)

O motor de política valida e aplica na hora quando seguro (`approvals.decision_mode = 'system'`), recusa quando inválido e abre exceção com prazo só quando falta papel ou o pedido afrouxa a segurança das regras sem ser admin. Pedido vencido expira sozinho (`governance_sweep`, 15 min). Push: limite por hora (`governance_policies.body.push.urgentMaxPerHour`, padrão 4) e destaques por dia (`highlightMaxPerDay`, padrão 8); acima disso, recusado com motivo.

## Quando uma pessoa entra

Só exceção real: fontes divergentes com confiança baixa ou tema sensível, configuração explícita do dono (categoria em revisão, regras antigas), corpo cortado depois das reescritas, falta de fonte ou título (proveniência), desbloqueio de fonte bloqueada por motivo legal ou pedido do veículo, remoção legal, pedido LGPD.
