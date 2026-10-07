# CityNews · Estado atual

**Última atualização:** 2026-10-07 — Guia com Google Places no ar (#65, #67; 0161 e 0180 em produção), esperando a ativação da API pelo dono (B-031).
**Atualização anterior:** 2026-10-07 — plano de melhorias de UX, UI e técnica concluído (W1 a W5, itens 1–93). Relatório: `docs/reports/melhorias-ux-ui-tecnica.md`.
**Atualizado por:** Claude Code

Arquivo curto, reescrito a cada entrega (ADR-011). Histórico: `.planning/DECISIONS.md`, `docs/reports/`, `git log`.

## Última entrega

- **Melhorias W1 a W5** (plano `docs/superpowers/plans/2026-10-04-melhorias-ux-ui-tecnica.md`). PRs: #59 (W1), #60 (W2), #62 (W3), #61 (W4) e o PR da W5. Decisões: A-146 a A-151, A-155 e A-156.
  - **W1:** defeitos.
  - **W2:** kit `src/components/ui`, com lint de aderência.
  - **W3:** fluxos do Estúdio.
  - **W4:** portal.
  - **W5:**
    - imagens responsivas com variantes;
    - home e matéria sem leituras em cascata;
    - timeouts e erros visíveis;
    - consultas sem N+1;
    - zod fora do cliente e editor sob demanda;
    - `/fontes` renderizado no servidor;
    - indicador de navegação, `fold`/`TIME_ZONE` e knip;
    - e2e sem esperas fixas e com as flags em série.
- **Lighthouse:** orçamento de JS de 178,2 kB (home e busca) e 187,4 kB (matéria e Fontes), pela A-156. A meta de 165 kB não foi atingida. As rotas novas (agenda, cidade e guia) ficam em 179,1 kB, a medida do CI mais 3%.
- Antes, na mesma semana:
  - logotipos das fontes (A-153);
  - perfil redesenhado (A-154);
  - telas públicas no celular (A-152);
  - filtros recolhíveis (A-140).

## Onde o projeto está

- **P0 a P6 concluídos:** 69 de 70 tarefas. A P6-T4 ficou degradada (B-021). Depois disso foram entregues:
  - Painel de Fontes e PWA;
  - UI pública;
  - autonomia de publicação (regras v3);
  - destaques e publicidade;
  - Guia Cuiabá;
  - segurança P1;
  - Auditoria 360 (D-01 a D-06);
  - pauta quente;
  - melhorias W1–W5.
- **Produção:** https://citynewscuiaba.vercel.app, com o projeto Supabase `citynews-prod`. O pipeline roda com as regras v3 e o disjuntor de 300 por hora e 3.000 por dia (A-126). A v4 está inserida como proposta inativa.

## Próximas ações

1. **Produção (B-009):** aplicar as migrations 0158 (`role_set`), 0159 (aprovação em lote) e 0161 (RPCs em lote). Rodar o backfill de variantes (`scripts/media/backfill-variants.mjs --apply --confirm-host=<host>`). Registrar tudo na A-150 e na A-155.
2. **Dono:** rodar `supabase/bootstrap/2026-10-04-sql-editor-dono.sql` (0143 parte C e 0155, B-029) e conferir qual chave do OpenRouter vence em 28/10.
3. **Regras v4:** conferir a simulação de 7 dias e aprovar `rules:4` no painel de governança (A-128). O rollback é `rules_rollback()`.
4. **Medir por 2 semanas:** `editorial_risk_daily` e `verify_lineage_daily`.
5. **Lighthouse:** investigar o corte rumo a 165 kB e o LCP da home (L-026).
6. **Roadmap:**
   - EV-03, conferência de afirmações;
   - EV-04, alertas fora do banco;
   - fechar `publish_mode`, `agent_id` e `confidence` ao `anon`.

## Degradados abertos

- **P6-T4:** exercício de restauração (B-021).
- **Imagem gerada por IA:** sem gerador configurado (A-037, A-038).

## Decisão do dono necessária

- **Guia (B-031):** ativar a Places API (New) no projeto 252656977141 do Google Cloud. O código do Google Places (#65, #67) e as migrations 0161 e 0180 já estão em produção; falta só a API responder.

- **Vercel:** o plano gratuito tem limite de 100 deploys por dia, e as ondas o atingiram. Subir de plano é gasto.
- **`/principios-editoriais`:** o texto de "Temas sensíveis" contradiz as regras v3 (A-152).
- **Configuração pendente (BLOCKERS):**
  - B-001: dados institucionais;
  - B-002: revisão jurídica de imagens;
  - B-005: provedor de e-mail;
  - B-006: Google OAuth;
  - B-012: repositório público;
  - B-021: projeto para o teste de restauração;
  - B-022: 2FA e patrocínio;
  - B-023: "Confirm email";
  - B-024: reverificação de contas legadas.

## Ambiente

Container de nuvem sem Docker. A pilha Supabase local sem Docker (`scripts/local-stack/`, A-017) roda aqui, e `pnpm db:reset` precisa rodar do checkout principal. e2e e Lighthouse rodam também no CI. GitHub e Vercel são acessados pelos conectores MCP.
