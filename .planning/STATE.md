# CityNews · Estado atual

**Última atualização:** 2026-10-04 — auditoria 360 (`docs/audit/`), branch `claude/vigilant-babbage-ndnhwp`.
**Atualizado por:** Claude Code

Arquivo curto, reescrito a cada entrega (ADR-011). Histórico: `.planning/DECISIONS.md`, `docs/reports/`, `git log`.

## Onde o projeto está

- **P0 a P6 concluídos** (69/70 tarefas; P6-T4, exercício de restauração, degradado por falta de 2º projeto Supabase, B-021). Painel de Fontes, PWA, UI pública, autonomia de publicação (regras v3), destaques, publicidade (ADS-T1..T4), Guia Cuiabá e segurança P1 entregues depois.
- **Produção:** https://citynewscuiaba.vercel.app, projeto Supabase `citynews-prod`. Pipeline com regras v3 e disjuntor.
- **Auditoria 360 (04/10):** diagnóstico, inventário de regras, arquitetura-alvo e roadmap em `docs/audit/`; ADR-010 a ADR-014 em `docs/adr/`. Corrigido o revisor noturno que podia publicar rascunho sem IA (A-129, que também fecha a promessa de B-015 "nunca publica sozinho"); linhagens independentes medidas em sombra (A-130); governança (A-131).

## Próximas ações

1. **Produção:** aplicar `0150_reviewer_skips_ai_fallback.sql` (depois das 0148 e 0149 da main, se ainda não aplicadas); conferir a linha de `publish_breaker` (60/800 ou 300/3.000? A migration 0146 mudou só o padrão da coluna); conferir se 0074 e 0143 já estão aplicadas; conferir qual chave do OpenRouter vence em 28/10.
2. **Decisões do dono D-01 a D-06** (abaixo).
3. **Roadmap** (`docs/audit/EVOLUTION-ROADMAP.md`): EV-03 conferência de afirmações em sombra, EV-04 alertas fora do banco, EV-05 avaliação por agente e portão de prompt, EV-07 deduplicação resiliente, EV-10 índice vetorial.

## Degradados abertos

- P6-T4: exercício de restauração (B-021).
- Geração de imagem por IA: sem gerador configurado (A-037, A-038).

## Decisão do dono necessária

Detalhe e recomendação de cada uma em `docs/audit/EVOLUTION-ROADMAP.md` §1. O trabalho que não depende delas continua.

- **D-01** R36 (Pergunte responde sem fonte): não aplicada por reduzir garantia de integridade (A-132); confirmar depois de ver a alternativa.
- **D-02** Reprodução de imagem de terceiros sem permissão (B-002 aberto): manter com restrições, restringir ou suspender até revisão jurídica.
- **D-03** Linhagens independentes valem nas regras depois de 2 semanas em sombra?
- ~~D-04~~ Aprovação para operação de uma pessoa: resolvida pelo dono (A-128, migration 0149, uma pessoa pede, aprova e aplica).
- **D-05** À noite, conflito confirmado e conteúdo duvidoso vão ao revisor automático ou esperam pessoa?
- **D-06** Rótulo discreto para imagem e texto gerados no público.

Pendências de configuração do dono (BLOCKERS): B-001 dados institucionais, B-002 revisão jurídica de imagens, B-005 provedor de e-mail, B-006 Google OAuth, B-012 repositório público, B-021 projeto para teste de restauração, B-022 2FA e patrocínio, B-023 "Confirm email" no Supabase, B-024 reverificação de contas legadas.

## Ambiente

Container de nuvem sem Docker e sem Supabase CLI: testes unitários rodam (`pnpm vitest run --project unit`); integração e e2e dependem da pilha local (`scripts/local-stack/`, A-017) ou do CI. GitHub e Vercel pelos conectores MCP.
