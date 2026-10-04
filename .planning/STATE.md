# CityNews · Estado atual

**Última atualização:** 2026-10-04 — decisões D-01 a D-06 da auditoria 360 implementadas no branch `claude/vigilant-babbage-ndnhwp`, enviado com autorização do dono e aberto como PR #44 (rascunho). Merge, deploy e produção seguem dependendo de autorização explícita.
**Atualizado por:** Claude Code

Arquivo curto, reescrito a cada entrega (ADR-011). Histórico: `.planning/DECISIONS.md`, `docs/reports/`, `git log`.

## Onde o projeto está

- **P0 a P6 concluídos** (69/70; P6-T4 degradado, B-021). Depois: Painel de Fontes, PWA, UI pública, autonomia (regras v3), destaques, publicidade, Guia Cuiabá, segurança P1, auditoria 360 (PR #42, integrado).
- **Decisões do dono D-01 a D-06 (A-133 a A-138):** implementadas e testadas no banco local; relatório em `docs/reports/decisoes-auditoria-360.md`.
  - D-01 Pergunte responde com uma fonte relevante, atribuída; sem fonte informa.
  - D-02 "Foto: reprodução web" e Media Registry (0152).
  - D-03 linhagens só como indicador.
  - D-04 flags com antes e depois na auditoria (regras já versionadas e reversíveis).
  - D-05 risco em quatro níveis (0151) e regras v4 como proposta inativa.
  - D-06 sem selo público de IA; colunas internas fora da chave anônima (0153).

## Próximas ações

1. **Com autorização do dono:** merge do PR #44; deploy.
2. **Produção, depois do deploy:** aplicar 0150 (se pendente), 0151, 0152, 0153; conferir `publish_breaker` (60/800 ou 300/3.000); rodar `supabase/bootstrap/rules-v4-proposal.sql`, conferir a simulação de 7 dias e aplicar a v4 no painel.
3. **Medir** por 2 semanas: `editorial_risk_daily` e `verify_lineage_daily`.
4. **Roadmap:** EV-03 conferência de afirmações, EV-04 alertas fora do banco, fechar `publish_mode`/`agent_id`/`confidence` ao `anon`.

## Degradados abertos

- P6-T4: exercício de restauração (B-021).
- Geração de imagem por IA: sem gerador configurado (A-037, A-038).

## Decisão do dono necessária

Nenhuma bloqueando. Evoluções que, se desejadas, pedem decisão explícita: linhagens como critério de confiança (D-03), aprovação proporcional ao risco (D-04), `og:image` só com escopo `social` e fim do recorte da reprodução (D-02), rótulo para imagem gerada quando houver gerador (D-06).

Pendências de configuração do dono (BLOCKERS): B-001 dados institucionais, B-002 revisão jurídica de imagens (o aviso "Foto: reprodução web" não equivale a autorização), B-005 provedor de e-mail, B-006 Google OAuth, B-012 repositório público, B-021 projeto para teste de restauração, B-022 2FA e patrocínio, B-023 "Confirm email" no Supabase, B-024 reverificação de contas legadas.

## Ambiente

Container de nuvem sem Docker; a pilha Supabase local sem Docker (`scripts/local-stack/`, A-017) roda aqui: `pnpm db:reset` aplica 0001 a 0153 e a integração roda. e2e e Lighthouse rodam no CI. GitHub e Vercel pelos conectores MCP.
