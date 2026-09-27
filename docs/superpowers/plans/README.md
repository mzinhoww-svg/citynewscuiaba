# Planos de implementação

| Ordem | Plano | Arquivo | Pode paralelizar com |
|---|---|---|---|
| 1 | P0 Fundação | `2026-09-27-p0-fundacao.md` | n/a |
| 2 | P1 Portal público | `2026-09-27-p1-portal-publico.md` | P3 |
| 2 | P3 Pipeline e busca | `2026-09-27-p3-pipeline-busca.md` | P1 |
| 3 | P2 Fontes, personalização e conta | `2026-09-27-p2-fontes-personalizacao-conta.md` | P4 (após P3) |
| 3 | P4 Estúdio editorial | `2026-09-27-p4-estudio-editorial.md` | P2 |
| 4 | P5 Control Center e administração | `2026-09-27-p5-control-center-admin.md` | n/a |
| 5 | P6 Endurecimento e lançamento | `2026-09-27-p6-endurecimento-lancamento.md` | n/a |

Método de execução pré-escolhido: **subagent-driven**, porque os planos têm muitas tarefas com interfaces compartilhadas (rótulos, regras, ranking, callAgent) e um erro enviado para produção num portal de notícias custa caro; revisão independente por tarefa compensa.

Mapeamento tela → plano: ver coluna "Rota" em `docs/screens.md`. P1 cobre P01–P11 e P24–P25; P3 cobre P12 e P13; P2 cobre P14–P23 e C01–C06; P4 cobre E01–E14; P5 cobre O01–O18 e A01–A15.
