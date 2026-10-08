# CityNews · Estado atual

**Última atualização:** 2026-10-08 · fim da auditoria das decisões do dono: D-06, B-022, segurança (segunda rodada) e incidente de crédito da IA.
**Atualizado por:** Claude Code

Arquivo curto, reescrito a cada entrega (ADR-011). Histórico: `.planning/DECISIONS.md`, `docs/reports/`, `git log`.

## Última entrega

- **D-06 (PR #75):** `anon` sem `publish_mode`, `agent_id` e `confidence`; faixa Urgente lê `urgent_strip`.
- **B-022 (PR #76):** patrocínio nativo no portal, atrás de `sponsored_native_enabled` (desligada).
- **Segurança, segunda rodada (PR #77, A-218):** oráculo de papéis, colunas internas, eventos, recibos de push, ICS e CSV, segredos fracos.
- **A-217 (PR #80):** o agente usa Vercel e Supabase sem pedir aprovação; gasto e ação irreversível continuam pedindo.
- **Log do erro de IA (PR #81):** status e mensagem do OpenRouter no log, sem a chave.
- **Antes, no mesmo dia:** Guia com fotos do Google, texto e popularidade (A-212 a A-214), R42, A-152, A-155.
- **Produção:**
  - aplicadas 0155, 0159 e 0182 a 0189 (0188 sem `drop`, mesmo estado final; A-218);
  - regras v4 ativas desde 05/10;
  - disjuntor em 300 por hora e 3.000 por dia.

## Incidente aberto

- **B-034:** a conta do OpenRouter está sem crédito desde 17:32 de 08/10 (`402`). Toda a IA está parada: pipeline, texto do Guia e Pergunte. A busca tradicional e o portal funcionam. Volta sozinha quando o dono puser crédito.

## Próximas ações (agente)

1. Depois do crédito: conferir `ai_calls` com `ok = true` e o texto dos restaurantes no Guia (o cron `guide-write` roda a cada 2 h).
2. C4-03: tirar o fallback para `CRON_SECRET` em `newsletter/token.ts` e `security/rate-limit.ts` quando o dono criar os segredos próprios (B-033).

## Decisão ou ação do dono

- **Crédito no OpenRouter (B-034):** https://openrouter.ai/settings/credits. A chave também vence por volta de 28/10.
- **SQL Editor:** rodar `supabase/bootstrap/2026-10-08-sql-editor-dono.sql` (0143 parte C, 0158 `role_set`, 0160). Sem a 0158, "Salvar papéis" falha.
- **Segredos (B-033):** `NEWSLETTER_TOKEN_SECRET` e `RATE_LIMIT_SALT` na Vercel; `BACKUP_PASSPHRASE` no GitHub (sem ele o backup diário não roda).
- **Analytics (B-031, B-032):** Search Console; GA4 e GTM.
- **TripAdvisor:** a própria TripAdvisor recusa a chave.
- **Configuração pendente (BLOCKERS):** B-001, B-002, B-005, B-006, B-012, B-021, B-023.
- **Vercel:** o plano gratuito tem limite de 100 deploys por dia; subir de plano é gasto.

## Ambiente

Container de nuvem sem Docker. A pilha Supabase local (`scripts/local-stack/`) roda aqui. O conector do Supabase não executa SQL com `delete` ou `drop` (B-029): migration com `drop` é reescrita sem ele quando o estado final é o mesmo, ou vai para o SQL do dono.
