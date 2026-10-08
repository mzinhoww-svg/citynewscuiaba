# CityNews · Estado atual

**Última atualização:** 2026-10-08 · Agenda multifonte (A-217, AGM-T1 a T9); antes, auditoria das decisões do dono (A-215), Guia com fotos e texto (A-212, A-214), R42.
**Atualizado por:** Claude Code

Arquivo curto, reescrito a cada entrega (ADR-011). Histórico: `.planning/DECISIONS.md`, `docs/reports/`, `git log`.

## Última entrega

- **Agenda multifonte (A-217):** fontes do Radar @citycuiabaa no coletor da Agenda (extração estruturada ou por página com trecho de evidência, confirmação entre fontes, teto e prazo), fontes de eventos no Painel de Fontes com prévia, `/estudio/agenda` com cadastro, edição e retirada, e origem/confirmação na página pública. Relatório: `docs/reports/agenda-multifonte.md`. Falta em produção: aplicar 0195 a 0199 e ativar as fontes uma a uma.
- **Guia Cuiabá:**
  - ordem por popularidade, com mínimo de 300 avaliações (A-213, PRs #70 e #71);
  - fotos do Google com crédito do autor (A-212);
  - texto de abertura e comentário por lugar, sem o quadro "Como escolhemos" (A-214, PR #73);
  - texto em rodadas que cabem nos 60 s da rota (PR #74).
- **R42:** telefone e WhatsApp (65) 99622-7110 no portal (PR #74).
- **Produção:**
  - aplicadas 0155, 0159 e 0182 a 0186;
  - regras v4 ativas desde 05/10;
  - disjuntor em 300 por hora e 3.000 por dia.

## Próximas ações (agente)

1. D-06: tirar `publish_mode`, `agent_id` e `confidence` do acesso `anon`.
2. A-155: reprocessar as fotos antigas em variantes (`scripts/media/backfill-variants.mjs`).
3. A-152: propor ao dono um texto novo para "Temas sensíveis" em `/principios-editoriais`.
4. B-022: ligar o patrocínio nativo no portal (`placeSponsored`).
5. Segurança, segunda rodada: os 18 achados adiados (spec `2026-10-04-seguranca-p1-design.md`).
6. Fechar ou atualizar o PR #68 (B-031).

## Decisão ou ação do dono

- **SQL Editor:** rodar `supabase/bootstrap/2026-10-08-sql-editor-dono.sql` (0143 parte C, 0158 `role_set`, 0160). Sem a 0158, "Salvar papéis" falha.
- **Chaves:**
  - OpenRouter, que vence por volta de 28/10;
  - TripAdvisor, que a própria TripAdvisor recusa.
- **Configuração pendente (BLOCKERS):**
  - B-001: dados da empresa;
  - B-002: revisão jurídica de imagens;
  - B-005: provedor de e-mail;
  - B-006: Google OAuth;
  - B-012: repositório público;
  - B-021: projeto para o teste de restauração;
  - B-023: "Confirm email".
- **Vercel:** o plano gratuito tem limite de 100 deploys por dia; subir de plano é gasto.

## Ambiente

Container de nuvem sem Docker. A pilha Supabase local (`scripts/local-stack/`) roda aqui. O conector do Supabase não executa SQL com `delete` ou `drop` (B-029).
