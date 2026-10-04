# Relatório da rodada de fechamento · 04/10/2026

Relatório parcial (o final é `docs/reports/closure-final.md`, quando o backlog crítico só tiver
CLOSED, OWNER_ACTION_REQUIRED e BLOCKED_EXTERNAL).

## O que estava marcado como pronto e não estava

- **A-128 em produção sem a 0149**: o código de "uma pessoa aprova" foi para o ar às ~13h03 UTC com
  o banco ainda exigindo aprovador diferente. Corrigido nesta sessão (0148 e 0149 aplicadas e
  verificadas).
- **A-126 "recuperação"**: a decisão registra disjuntor 300/3.000 e orçamento R$ 15; em produção
  continuam 60/800 e R$ 9, porque a transação da recuperação foi revertida inteira.
- **A-114 (HNT)**: o STATE dizia "falta aplicar 0074"; a 0074 está aplicada e o código está no ar,
  mas fonte sem `enrich` explícito não recebe o texto em produção (RDNews 0 de 56).
- **0143 (segurança)**: STATE dizia "falta aplicar"; continua não aplicada.
- **0145 e 0147**: aplicadas sem linha no histórico de migrations.

## O que foi feito

| Ação | Nível | Evidência |
|---|---|---|
| 0148 aplicada | PRODUCTION_VERIFIED | corpo sem a recusa de termos; histórico |
| 0149 aplicada | PRODUCTION_VERIFIED (esquema) | 0 CHECK de aprovador diferente; corpos A-128; histórico |
| 0147 aplicada | PRODUCTION_VERIFIED | `save_pipeline_draft` com `v_live` |
| 0146 completada (padrões 300/3.000) | PRODUCTION_VERIFIED | `column_default`; histórico |
| `enrich` registra o motivo do desvio | TESTED_LOCALLY (commit `b0a277d`) | 3 testes novos; 506 testes de pipeline verdes; typecheck e lint |
| Recuperação A-126 v2 (por fonte, sem reverter tudo) | CODE_READY | `scripts/ops/recuperar-materias-v2.sql` |
| Ledger, matrizes, mapa de dependências | — | `docs/orchestrator/` |

## Skills usadas

systematic-debugging (enrich: hipóteses de config, robots, cota e Cloudflare testadas e
descartadas por evidência), test-driven-development (vermelho → verde), dispatching-parallel-agents
(auditorias de A-128 e de migrations; afirmações reconferidas — duas estavam desatualizadas e uma
inferida), update-config (bloqueado pela plataforma).

## Pendências do dono

1. Permissão persistente do Claude Code (L-019): `allow` para `mcp__Supabase__execute_sql`,
   `mcp__Supabase__apply_migration`, `mcp__Supabase__list_migrations` e `"defaultMode": "auto"`.
2. Religar `auto_publish` na Contingência depois da recuperação (L-010).
3. B-023 (Confirm email no Supabase), já registrado.

## Dashboard (rodada)

| Indicador | Valor |
|---|---|
| TOTAL IDENTIFIED | 21 |
| TOTAL CLOSED | 0 |
| TOTAL VERIFIED (inclui PRODUCTION_VERIFIED) | 6 |
| TOTAL OWNER_ACTION_REQUIRED | 2 |
| TOTAL BLOCKED_EXTERNAL | 1 |
| TOTAL DEFERRED / OBSOLETE / CONFLICTING | 0 / 0 / 0 |
| IMPLEMENTED_NOT_APPLIED | 1 (0143) |
| IMPLEMENTED_NOT_WIRED | 0 confirmados |
| APPLIED_NOT_VERIFIED | 1 (fluxo A-128 na tela) |
| TESTED_ONLY_LOCAL | 1 (L-008) |
| VERIFIED_PRODUCTION | 6 |
| CLOSURE SCORE | 6 verificados em produção de 21 identificados = **29 %** (nenhum CLOSED: falta o fluxo de ponta a ponta ou a documentação em cada um) |
