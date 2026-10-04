# Closure ledger · CityNews Cuiabá

Fonte de verdade do modo closure. Cada linha só fica `CLOSED` com evidência do comportamento no
destino (produção). Estados: IDENTIFIED, ANALYZED, PLANNED, IMPLEMENTED, TESTED, REVIEWED, MERGED,
DEPLOYED, APPLIED, INTEGRATED, VERIFIED, CLOSED, OWNER_ACTION_REQUIRED, BLOCKED_EXTERNAL, DEFERRED,
OBSOLETE, CONFLICTING. Níveis de entrega: CODE_READY, TESTED_LOCALLY, READY_FOR_PRODUCTION,
PRODUCTION_APPLIED, PRODUCTION_VERIFIED.

Dois trilhos que não se misturam:

- **PLATFORM_PERMISSION_BLOCKER**: limite do Claude Code (classificador do modo `auto`), não do projeto.
- **CITYNEWS_TECHNICAL_BLOCKER**: defeito, configuração ou dependência do CityNews.

Versão legível por máquina: `closure-ledger.json` (mesmos IDs).

Última atualização: 04/10/2026, sessão `claude/clever-bohr-lf2k2e`.

| ID | Categoria | Item | Estado | Evidência | Próxima ação |
|---|---|---|---|---|---|
| L-001 | produção / banco | Regressão A-128: código de `e30f542` em produção desde ~13h03 UTC com o banco ainda exigindo `approved_by <> requested_by` (CHECK `rules_check`, `rec_weights_check`, `approvals_check`). Toda ação "pedir e aprovar numa ação só" falhava | VERIFIED (esquema) | 0149 aplicada; consulta: 0 CHECK de aprovador diferente; funções com corpo A-128; histórico `0149_single_approver` | Teste de fluxo real com admin logado (regras, prompt, fonte crítica, push) |
| L-002 | produção / banco | 0148 (A-127): banco recusava ativar fonte sem termos revisados; travou a recuperação A-126 | PRODUCTION_VERIFIED | corpo de `guard_source_changes` sem a recusa; histórico `0148_source_activation_without_terms` | — (CLOSED quando a recuperação rodar sem esse erro) |
| L-003 | produção / banco | 0147 (A-126): reescrita de matéria no ar | PRODUCTION_VERIFIED (sem linha no histórico) | `save_pipeline_draft` contém `v_live`; duas chamadas do MCP expiraram em 60 s; a segunda deixou o corpo aplicado | Registrar a linha de histórico quando houver janela; observar a 1ª reescrita `live` |
| L-004 | produção / banco | 0146 (A-126): publicação forçada não é edição humana | PRODUCTION_VERIFIED | função com `'ai'`; 0 versões humanas de publicação forçada; padrões 300/3000 aplicados nesta sessão | — |
| L-005 | produção / banco | 0145 (A-125): religar `auto_publish` sem segunda pessoa | PRODUCTION_VERIFIED (sem linha no histórico) | sem trigger `feature_flags_two_person` (aplicada por outra sessão entre 12h47 e 13h20) | — |
| L-006 | segurança | 0143 (C1-01, C1-02, C1-03) não aplicada em produção | READY_FOR_PRODUCTION | `email_ownership_proven` ausente; política `article_versions_read_public` presente | Precheck: nenhuma página pública lê `article_versions` como anon (a leitura do código foi bloqueada pelo classificador nesta sessão; PLATFORM_PERMISSION_BLOCKER). Depois aplicar e verificar |
| L-007 | pipeline / HNT | A-114: fonte sem `enrich` explícito (HNT, RDNews) nunca recebe `source_text` em produção | ANALYZED | RDNews 11h–12h: `enrich ok` sem texto; mesmo código, mesma URL, fora da Vercel: 2.905 caracteres; Folhamax (`enrich: true`) recebe texto; descartados: config, robots, cota, Cloudflare genérico. HNT não teve item novo entre 23h14 e 12h45 UTC (feed parado), então não houve teste real ainda | Commit `b0a277d` registra o motivo do desvio em `pipeline_events`; depois do deploy ler `details.reason` dos itens da RDNews/HNT e corrigir a causa (TDD) |
| L-008 | pipeline / observabilidade | `enrich` pulava em silêncio (sem motivo em lugar nenhum) | TESTED_LOCALLY | `StepContext.note` + drain junta a nota ao evento `ok`; 3 testes novos (vermelho → verde), 506 testes de pipeline verdes, typecheck e lint verdes | PR, CI, merge, deploy, conferir `pipeline_events.details.enrich` |
| L-009 | operação / A-126 | Recuperação A-126 nunca rodou (transação inteira revertida pela recusa de termos): disjuntor 60/800 tripado desde 04h45, `auto_publish` desligado, 22 fontes pausadas, orçamento do redator R$ 9 | PLANNED | consulta: `publish_breaker` 60/800 `tripped_at` 04:45; 0 jobs `recuperacao-a126`; `ai_agents.write` 9.00 | `scripts/ops/recuperar-materias-v2.sql` (por fonte, sem reverter tudo por uma) está CODE_READY; rodar depois do deploy de L-008, para medir o `enrich` |
| L-010 | operação | `auto_publish` desligado desde o disparo do disjuntor | OWNER_ACTION_REQUIRED | `feature_flags.auto_publish = false` | Religar é ação do admin (A-125) em Contingência; só depois da recuperação (L-009), para não publicar em massa o acúmulo |
| L-011 | governança | Spec mestre, `docs/architecture.md`, `docs/screens.md`, `PRODUCT.md` e specs do painel e do PWA ainda dizem "duas pessoas" | IDENTIFIED | `2026-09-27-citynews-design.md:179`, `architecture.md:125-141`, `screens.md:188,257`, `PRODUCT.md:23` (ver `governance-matrix.md`) | Atualizar com nota "substituído por A-128" |
| L-012 | governança / segurança | Caminho direto pela tabela: `rules` e `rec_weights` aceitam aprovar e ativar a própria versão por `update` sem linha em `approvals`, sem checagem de 24 h e sem `audit_log`; em `rules` também contorna "só admin para safety.disable" | IDENTIFIED | `guard_proposal` 0149:98-110 + RLS `rules_approve`, `rec_weights_approve`; `rls-two-person.test.ts:120-137,384-412` aceita | Decidir: fechar o caminho direto (só via `approval_apply`) ou auditar por trigger. Proposta em `decision-conflicts.md` |
| L-013 | governança | `APPROVER_ACTION` de `push.*` aponta para `article.publish`, não `push.approve` | IDENTIFIED | `src/lib/approvals/targets.ts:64-66`; admin não vê a decisão de push na caixa | Corrigir mapeamento + teste |
| L-014 | estado | `DECISIONS.md` A-127/A-128 com 4 colunas (cabeçalho tem 7); STATE/progress sem A-128 | IDENTIFIED | `.planning/DECISIONS.md:114-115` | Completar colunas, atualizar STATE |
| L-015 | banco | Histórico de migrations incompleto em produção (0052–0054, 0070–0073, 0080, 0090, 0120, 0130–0133 parciais, 0140–0142, 0145, 0147) | IDENTIFIED | `supabase_migrations.schema_migrations` vs objetos existentes | Inserir linhas de histórico para as já verificadas, antes de qualquer `supabase db push` |
| L-016 | processo | Outra sessão escreve em produção ao mesmo tempo (0145 apareceu entre 12h47 e 13h20) | IDENTIFIED | consultas sucessivas | Toda escrita: ler → aplicar uma → verificar |
| L-017 | pipeline | Cron e fila executam de verdade | VERIFIED | `cron.job_run_details` 2 h: `jobs-drain*` 120/120 sucesso, `ingest-tick` 4, `review-tick` 24; 1.235 publicações em 24 h | — |
| L-018 | testes | Testes de integração não rodam neste container (sem `NEXT_PUBLIC_SUPABASE_URL`/service role local) | BLOCKED_EXTERNAL (ambiente) | `SupabaseEnvError` em todos os arquivos `tests/integration` | Rodam no CI do GitHub |
| L-019 | plataforma | PLATFORM_PERMISSION_BLOCKER: modo `auto` ativo, MCP Supabase disponível, sem `allow` persistente para `mcp__Supabase__*`, agente não pode alterar as próprias permissões (`[Self-Modification]`); classificador também negou um `grep` de leitura que antecedia a 0143 | OWNER_ACTION_REQUIRED | negações registradas nesta sessão | Dono adiciona em `.claude/settings.json`: `"defaultMode": "auto"` e `allow` com `mcp__Supabase__execute_sql`, `mcp__Supabase__apply_migration`, `mcp__Supabase__list_migrations` (nome com S maiúsculo) |
| L-020 | auth | Google OAuth (B-006) | IDENTIFIED (não auditado nesta sessão) | — | Auditar provedor no Supabase, flag `google_login`, fluxo real |
| L-021 | backlog anterior | B-001 (dados institucionais), B-005 (e-mail), B-011/B-018/B-020 (performance), B-021 (restore), B-022 (2FA, leitor de tela), B-023/B-024 (posse de e-mail) | IDENTIFIED (não auditado nesta sessão) | `.planning/BLOCKERS.md` | Auditar na próxima rodada |
