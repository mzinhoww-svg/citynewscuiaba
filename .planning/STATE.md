# CityNews · Estado atual

**Última atualização:** 2026-10-04 — decisões D-01 a D-06 (PR #44); migrations 0151 a 0153 e proposta v4 aplicadas em produção com autorização do dono.
**Atualizado por:** Claude Code

> 2026-10-04 · Melhorias W4 (itens 62–77): editorias recolhem ao rolar e voltam ao subir, anúncio fixo reserva espaço, "Agora" leva ao bloco da home, convite da primeira visita no fim da leitura, aba certa acesa na barra inferior, "Perguntar ao CityNews" no Explorar e no rodapé, estados de erro e vazio em Perfil, Favoritos ("Desfazer" com foco), Agora e Panorama, ações da matéria com 44 px, Pergunte depois dos 3 primeiros resultados no celular, trilho acessível e ticker rolável no desktop.

> 2026-10-04 · Melhorias W2 (itens 25–44): kit completo em `src/components/ui` (Field, Select, TextArea, DateField, Checkbox, RadioGroup, Panel, StatGrid, StatusBadge, Table, Pagination, Button com carregamento e destrutivo, SubmitButton, ConfirmDialog, Toast, FormStatus, Popover, Menu, Drawer, TagLink, LinkTabs, origem segura), rótulo de campo em 16 px, escala de ícones, Estúdio e portal migrados, ESLint barra controles crus fora do kit (exceções comentadas) e DESIGN §7 com o inventário real. A-149.

> 2026-10-04 · Melhorias W1 (itens 1–24 do plano `docs/superpowers/plans/2026-10-04-melhorias-ux-ui-tecnica.md`): modo escuro legível, editor que não perde texto, fila e agenda com total e "Carregar mais", atraso e hoje com texto, banner de consentimento e ticker legíveis, colunas fixas abaixo do cabeçalho, CSS global em camada, Lighthouse visível (A-146), confirmações sensíveis. A-147 e A-148.

> 2026-10-04 · Telas públicas no celular (A-152): faixa preta do Safari sob o cabeçalho (máscara da fileira de editorias) removida; `[PREENCHER]` fora das telas públicas; Favoritos e Alertas com o conteúdo antes do convite; Guia vazio mostra as matérias recentes. Pendente do dono: texto de "Temas sensíveis" em /principios-editoriais contradiz as regras v3.

> 2026-10-04 · Filtros recolhíveis (A-140): `CollapsibleFilters` em todos os filtros do portal e do Estúdio; recolhido no celular, aberto no desktop, contagem de ativos e "Limpar" no cabeçalho.

> 2026-10-04 · Sino do Estúdio: cada notificação mostra quando chegou ("há 12 min", "há 3 h"; depois de 24 h, data e hora), com a data completa no `title`. 2808 testes unitários e build verdes.

Arquivo curto, reescrito a cada entrega (ADR-011). Histórico: `.planning/DECISIONS.md`, `docs/reports/`, `git log`.

## Onde o projeto está

- **P0 a P6 concluídos** (69/70 tarefas; P6-T4, exercício de restauração, degradado por falta de 2º projeto Supabase, B-021). Painel de Fontes, PWA, UI pública, autonomia de publicação (regras v3), destaques, publicidade (ADS-T1..T4), Guia Cuiabá e segurança P1 entregues depois.
- **Produção:** https://citynewscuiaba.vercel.app, projeto Supabase `citynews-prod`. Pipeline com regras v3 e disjuntor.
- **Retomada (A-140, PR #43 mergeada, 04/10):** login e cadastro com o Google em destaque, Pergunte como chat, Fontes e Panorama, blocos de marketing, Conta e legais, pauta quente (HOT-T1..T3). Produção (A-142): 0154 e 0156 aplicadas; leitura das páginas iniciais ligada em 8 portais locais. Relatórios: `docs/reports/ui-publica.md` (fechamento) e `docs/reports/destaques-e-profundidade.md`. Pendentes: 0155 (dono, SQL Editor), capturas antes e depois, LCP da home (L-026), CONF-T2/T3.
- **Closure (04/10, PR #41, `docs/orchestrator/`):** 0146 a 0150 aplicadas e verificadas; disjuntor 300/3.000 e `auto_publish` ligado (A-126). **0143 segue NÃO aplicada.**
- **Auditoria 360 (PR #42) e decisões do dono D-01 a D-06 (A-133 a A-138, PR #44):** relatório em `docs/reports/decisoes-auditoria-360.md`.
  - D-01 Pergunte responde com uma fonte relevante, atribuída; sem fonte informa.
  - D-02 "Foto: reprodução web" e Media Registry (0152).
  - D-03 linhagens só como indicador.
  - D-04 flags com antes e depois na auditoria (regras já versionadas e reversíveis).
  - D-05 risco em quatro níveis (0151) e regras v4 como proposta inativa.
  - D-06 sem selo público de IA; colunas internas fora da chave anônima (0153).
- **Produção, 04/10 (autorizado pelo dono, A-139):** 0151, 0152 e 0153 aplicadas e conferidas; proposta das regras v4 inserida (versão 4, inativa) com pedido `safety.disable` pendente. A v3 continua ativa.

## Próximas ações

1. **Merge do PR #44** (autorizado) assim que o CI ficar verde; o deploy da Vercel sai do merge.
2. **Regras v4:** no painel de governança, conferir a simulação de 7 dias e aprovar o pedido `rules:4` (uma pessoa, A-128). Rollback: `rules_rollback()`.
3. **Medir** por 2 semanas: `editorial_risk_daily` e `verify_lineage_daily`.
4. **Produção:** aplicar 0143 depois da pré-checagem (`docs/orchestrator/migration-matrix.md`); conferir qual chave do OpenRouter vence em 28/10.
5. **Roadmap:** EV-03 conferência de afirmações, EV-04 alertas fora do banco, fechar `publish_mode`/`agent_id`/`confidence` ao `anon`.

## Degradados abertos

- P6-T4: exercício de restauração (B-021).
- Geração de imagem por IA: sem gerador configurado (A-037, A-038).

## Decisão do dono necessária

Nenhuma bloqueando. Evoluções que, se desejadas, pedem decisão explícita: linhagens como critério de confiança (D-03), aprovação proporcional ao risco (D-04), `og:image` só com escopo `social` e fim do recorte da reprodução (D-02), rótulo para imagem gerada quando houver gerador (D-06).

Pendências de configuração do dono (BLOCKERS): B-001 dados institucionais, B-002 revisão jurídica de imagens (o aviso "Foto: reprodução web" não equivale a autorização), B-005 provedor de e-mail, B-006 Google OAuth, B-012 repositório público, B-021 projeto para teste de restauração, B-022 2FA e patrocínio, B-023 "Confirm email" no Supabase, B-024 reverificação de contas legadas.

## Ambiente

Container de nuvem sem Docker; a pilha Supabase local sem Docker (`scripts/local-stack/`, A-017) roda aqui: `pnpm db:reset` aplica 0001 a 0153 e a integração roda. e2e e Lighthouse rodam no CI. GitHub e Vercel pelos conectores MCP.
