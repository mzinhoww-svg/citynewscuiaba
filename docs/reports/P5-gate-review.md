# Revisão do gate P5 · Control Center e Administração

**Revisor:** subagente novo, só leitura (gate `docs/AUTONOMY.md` §5 item 2).
**Branch:** `claude/keen-hypatia-8qn86r` @ `5fc7917`.
**Escopo lido:** `CLAUDE.md`, `docs/AUTONOMY.md` §5, plano P5, `docs/screens.md` (O01–O18, A01–A15), `docs/reports/P5.md`, migrations 0027–0039 (mais 0002, 0011, 0033, 0045 de que dependem), `src/lib/{approvals,flags,rules,ads,seo,admin,control,studio}`, `src/app/api/control/*`, `src/app/estudio/{control,admin}`, componentes de `src/components/studio`.
**Verificação executada:** `pnpm typecheck` verde. Greps de hex/px cru, `z-index`, `@ts-ignore`, `any`, emoji e `onClick` em elemento não interativo nos arquivos alterados: nenhum achado. Não rodei lint, vitest, e2e nem axe (dependem de banco local); o que digo sobre eles vem do relatório e não foi reverificado.
**Contagem:** bloqueante 0 · alto 3 · médio 11 · baixo 9.

## Situação (correções do gate)

**Branch das correções:** `worktree-agent-acb55e3e1f486e1fb` (a partir de `claude/keen-hypatia-8qn86r` @ `6740d2a`), migration única `supabase/migrations/0048_p5_gate_fixes.sql` (0027–0046 intocadas). Numeração abaixo é a dos achados desta revisão. Testes novos escritos antes (falha → passa): `tests/integration/p5-gate-db.test.ts`, `p5-gate-db-2.test.ts`, `p5-gate-app.test.ts` e unitários ao lado do código.

| # | Grav. | Situação | O que foi feito / por que não |
|---|---|---|---|
| 1 | Alto | Corrigido, com ressalva | `staff_invites.invited_by` passou a aceitar `null` (0048). Não procede a parte "erro desfaz a execução inteira": o laço de `purge_deleted_accounts` já tem `begin … exception when others` por conta desde a 0024 (a conta do convidante só não era excluída e gerava `account.delete_failed` todo dia). Testes: convidante ex-staff é apagado; conta que falha não desfaz as outras. |
| 2 | Alto | Parcial: sessão e retenção aplicadas; 2FA declarado "ainda não aplicado" | Retenção: `security.retention_days` vai de 30 a 90 (teto da spec §10, trigger `guard_security_settings`; valor antigo de 365 caiu para 90) e o cron `events-retention` passou a chamar `anonymize_old_events(security_retention_days())`. Sessão: `getSession` lê `security_session_hours()` e, vencido o limite desde `last_sign_in_at`, devolve a sessão sem papéis (`expired`), o Estúdio manda entrar de novo com o motivo `sessao-expirada`. 2FA: o Estúdio não tem cadastro de segundo fator (TOTP/AAL2), então exigir travaria a equipe; o banco recusa ligar `security.require_2fa`, a tela mostra o interruptor desligado com "Ainda não aplicado" e a A14 rotula a chave igual. **Pendência (BLOCKERS, revisita no P6):** tela de cadastro de fator, `requireRole` exigindo AAL2 e só então liberar a chave. |
| 3 | Alto | Corrigido | `approvals.content_hash` (sha256 do conteúdo, calculado no banco no pedido, não pelo cliente) conferido em `approval_apply`, `prompt_publish` e `rec_weights_activate`; alvo com conteúdo e sem hash falha fechado (pedido antigo: pedir de novo). Com pedido `pending`/`approved` aberto, o proponente também não edita regra, pesos nem prompt (`guard_frozen_content`). Testes: editar depois do pedido falha; adulterar por fora faz aplicar/publicar/ativar falhar. |
| 4 | Médio | Corrigido | `consume_role_admin_ref`: 24 h desde a decisão e aprovador com papel `admin` no banco. Consequência: o seed tem uma só admin; conceder admin passa a exigir duas pessoas admin de verdade (o teste `admin-core` usa uma segunda admin de fixture). |
| 5 | Médio | Corrigido | Revogar (ou rebaixar) `admin` só com pedido `role.admin` de alvo `revoke:<uuid>` decidido por outra pessoa admin, nunca o próprio papel (`guard_user_roles_revoke`). A tela abre o pedido, mostra "Revogação aprovada" e "Aplicar revogação". "Último admin": não é alcançável por pessoa (só admin remove, ninguém remove a si), então não há trava extra. |
| 6 | Médio | Corrigido, caminho diferente da sugestão | `rules_rollback` compara a versão de destino com a ativa (`rules_loosens`: revisão obrigatória, temas sensíveis, modo, mínimos de fonte/primária/imagem/confiança) e recusa quando afrouxa. Em vez de "mesmo pedido de aprovação": `approval_apply` só ativa versão ainda não aprovada, então a mensagem manda propor o destino como versão nova (duas pessoas). Runbook atualizado. |
| 7 | Médio | Corrigido | `decidePublication`: Segurança e `seguranca-*` sempre `hold`, seja qual for o modo na tabela; `validateRuleSet` recusa modo diferente de `blocked`; CHECK `rules_seguranca_blocked` (`not valid`, vale para linhas novas); proposta que tira tema sensível abre `safety.disable` (só admin aprova; `approval_apply` passou a aplicar versão de regras por esse tipo). |
| 8 | Médio | Corrigido, com pendência baixa | `taxonomy_merge_tags` recusa mesclar tag sensível (mesma correspondência por raiz do TypeScript) em tag não sensível; a ação mostra mensagem clara. Pendente (baixo): auditar o antes/depois das tags por matéria (a auditoria guarda origem, destino e nº de vínculos). |
| 9 | Médio | Corrigido | Convite grava só papel e editorias (sem e-mail); notas de pedido LGPD ficam fora da auditoria (`notesChanged`); CSV sem coluna `nome`, com e-mail e chaves de texto livre removidos dos detalhes para qualquer papel e ator pseudonimizado (`pessoa-xxxxxxxx`) fora da administração. Teste varre o CSV por `@`. |
| 10 | Médio | Corrigido para `audit_log`; `pipeline_events` pendente | `audit_log` só é legível por admin; os demais papéis de `audit.view` leem `audit_log_view`, que mascara IP nos detalhes e oculta `ip_hash` (a A10, o export e as leituras do Painel de Fontes passaram a usá-la). **Pendente:** máscara equivalente para `pipeline_events` (O08): são 5 pontos de leitura em `control.ts`/`ai-control.ts`/`control-store.ts` e a máscara hoje é aplicada na aplicação; fica para o P6 com o mesmo desenho de view. |
| 11 | Médio | Corrigido | Export lê por páginas de `id` (`collectAuditRows`) até 5000 linhas + 1; passou de 1000 sem perder linha (teste com 1100 no banco real); truncamento aparece na resposta, na auditoria (`truncated`), no cabeçalho `x-export-truncated`, numa linha `AVISO` do arquivo e na nota da tela. Confirmar o `max_rows` do projeto hospedado continua valendo (o código não depende dele). |
| 12 | Médio | Corrigido | `ai_enabled = false` só recusa o agente `answer` (busca com IA); o pipeline (classify, locate, verify, write, image, aggregate_summary, embed) segue, como diz `ia-fora.md` e o diálogo. |
| 13 | Médio | Corrigido em parte; entrega de anúncios pendente | `href` e `imageUrl` só `https://` no servidor (e no formulário); subeditoria herda a proibição (comando confere `autonomy_category`, trigger `guard_sponsored_sections` no banco, `isNeverSection` em `placeSponsored`). **Pendente (degradado):** nada no portal chama `placeSponsored`, então `deliveries` segue em 0; ligar exige decisão de produto (B-003: patrocínio desligado até migrar para Vercel Pro). |
| 14 | Médio | Corrigido | `accepted_at` gravado no primeiro acesso (trigger em `auth.users`), `staff_invites_sweep()` (cron horário) revoga o papel de convite vencido sem aceite (`revoked_at`), A01 e A02 usam a mesma regra (`invitePending`). Mantido: o papel entra na hora do convite, agora com prazo de 7 dias. |
| 15 | Baixo | Corrigido | Pedido pendente só é reaproveitado se for da mesma pessoa e do mesmo tipo. |
| 16 | Baixo | Corrigido | `sameOriginHost` devolve 403 para `Origin: null` e valor ilegível. |
| 17 | Baixo | Corrigido | `\` e `%5c` recusados na aplicação e no CHECK `redirects_path_safe` (`not valid`). |
| 18 | Baixo | Parcial | Rascunho da home deixou de ser público (leitura anônima só `published`). Pendente: validar "≥ 1 módulo ligado" e ids conhecidos dentro de `home_layout_publish`. |
| 19 | Baixo | Pendente | Registrar em DECISIONS o uso do service role no playground/avaliação (restrito ao `recordCall`); não é mudança de código. |
| 20 | Baixo | Pendente | Invariantes do A/B (promover duas vezes, dois `running`). |
| 21 | Baixo | Corrigido | CHECK `rec_weights_valid` (chaves conhecidas, não negativos, soma 1,00 ± 0,001, `cap` ≤ 0,25), `not valid`. Testes de RLS ajustados para pesos válidos. |
| 22 | Baixo | Pendente | `listUsers({ perPage: 500 })` (só passa de 500 contas). |
| 23 | Baixo | Pendente | Lista `CRITICAL_KINDS` duplicada e teste de espelho de tipos. |
| Conformidade | — | Parcial | `docs/reports/P5.md` foi atualizado (T3/T6, cobertura, números A-###, resultado do gate). Pendentes: "salvar como caso de regressão" no O15 (sem `A-###`), reclassificar "mesclagem sugerida pela IA" da A05 (é heurística) e exigir regressão aprovada em `prompt_publish`. |

**O que o caller precisa registrar em `.planning/` (esta rodada não editou `.planning/`):** BLOCKERS: 2FA da equipe não aplicado (revisita: cadastro de fator + AAL2); máscara de `pipeline_events`; `placeSponsored` sem chamada no portal. DECISIONS (próximo número livre após A-096): trava dura de Segurança + `safety.disable` para tema sensível removido; conteúdo amarrado ao pedido (`content_hash`) e congelado com pedido aberto; `role.admin` com 24 h, aprovador admin e revogação em duas pessoas; rollback recusa versão mais frouxa; `audit_log` só para admin + `audit_log_view`; retenção com teto de 90 dias e sessão aplicada; `ai_enabled` só governa a busca com IA; retirada da coluna `nome` e pseudônimo de ator no CSV.

## Pontos fortes (verificados no código)

- Toda função `security definer` nova das migrations 0027–0039 tem `set search_path = public`, `revoke ... from public, anon` e guarda de papel (`control_guard_view`, `has_any_role`, `is_staff`). `approval_apply`, `prompt_publish` e `rec_weights_activate` repetem a regra de duas pessoas (aprovador diferente de quem pediu, só quem aprovou aplica, 24 h, papel do aprovador conferido no banco).
- RLS ligada em todas as tabelas novas (`eval_*`, `rec_*`, `staff_invites`, `teams`, `team_members`, `places`, `home_layouts`, `redirects`, `privacy_requests`, `integration_keys`); `eval_runs` e `audit_log` imutáveis por trigger e sem update/delete para `authenticated`.
- `guard_feature_flags` impede religar `auto_publish` fora de `approval_apply`; `decidePublication` mantém `breaking` e tema sensível como regras duras.
- `studio_audit_actions()` da 0045 contém todos os nomes das listas de 0036–0039 (conferi por diferença de conjuntos).
- Rotas `/api/control/*` exigem sessão e papel; `run-now` confere `Origin`; CSV neutraliza fórmula (`csvCell`); `integrationsOverview` mostra só presença de variável.

## Achados

### Alto

**1. Uma ex-pessoa da equipe que convidou alguém bloqueia a exclusão LGPD de todas as contas.**
- `supabase/migrations/0038_admin_core.sql:21`: `invited_by uuid not null references public.profiles(id) on delete set null`. `NOT NULL` com `SET NULL` é contraditório.
- Cenário: a admin A convida B (`staff_invites.invited_by = A`). A perde o papel (a exclusão só vale para quem não tem papel, `0014_account_deletion.sql` linhas 26-33) e pede exclusão. Às 04:10 o cron chama `purge_deleted_accounts(7)`; `delete from profiles where id = A` falha com 23502. Como a função é um único laço numa transação, o erro desfaz a execução inteira: nenhuma outra conta é excluída, todo dia, até alguém apagar a linha à mão.
- Correção: nova migration `alter column invited_by drop not null` (o gate do P4 já corrigiu o mesmo padrão em 0024) e teste de integração "purge com convidante ex-staff". Endurecer o laço com `begin ... exception when others` por conta.

**2. Políticas de segurança da A11 (2FA, duração de sessão, retenção) são gravadas, auditadas e não fazem nada.**
- `src/app/estudio/admin/ops-actions.ts:61-63`, `supabase/migrations/0039_admin_ops.sql` (`guard_app_settings`, `app_setting_set`). Nenhum código lê `security.require_2fa`, `security.session_hours` ou `security.retention_days`: `grep` em `src/` e `supabase/` só acha a própria tela/RPC; o cron de retenção (`0009_events_retention.sql:31,44`) usa dias fixos.
- Cenário: o admin liga "Exigir segundo fator da equipe", vê "Políticas salvas" e o painel de acessos mostra "Sem 2FA" para todos, mas ninguém é obrigado. Pior, `retention_days` aceita até 3650, contra a spec §10 (eventos individuais 90 dias).
- Correção: ou ligar de fato (`requireRole` recusa papel sem AAL2 quando a chave está ligada; cron de retenção lê a chave com teto de 90 dias para eventos individuais; `session_hours` no cookie/refresh), ou tirar a tela editável e marcar como "não aplicado" (degradado no BLOCKERS). Não fechar a fase com controle de segurança que só finge.

**3. Aprovação de duas pessoas não é amarrada ao conteúdo aprovado (TOCTOU do proponente).**
- `supabase/migrations/0002_rls.sql:513` (`guard_proposal`: `elsif content_changed and uid <> old.proposed_by` só bloqueia terceiros; o proponente edita regra/pesos enquanto inativos e sem aprovação) e `0002_rls.sql:604-608` (`guard_ai_prompts`: autor edita `body` de versão `draft` **ou `pending`**). `approval_apply`, `prompt_publish` e `rec_weights_activate` aplicam o conteúdo que a linha tem no momento de aplicar; o pedido em `approvals` guarda só `rules:<v>`, `prompt:<agente>:<v>`, `rec:<v>`, não um hash.
- Cenário 1: P propõe a regra v5 inócua e pede aprovação. A abre a tela, lê o diff, clica "Aprovar" (`approveAndApply`). Entre a leitura e o clique, P faz `PATCH /rest/v1/rules` (RLS de `rules` não impede, ele é o proponente) trocando `forceReview` para `false` e Segurança para `auto`. A aprova e o banco ativa o texto novo. Cenário 2 (prompt/pesos): "Aprovar" e "Aplicar" são passos separados com janela de 24 h; o autor edita o `body` do prompt `pending` depois da aprovação e o aprovador publica sem ver a mudança.
- Correção: (a) travar conteúdo quando existe pedido aberto (`guard_proposal`/`guard_ai_prompts`: `pending` imutável; para editar, cancelar o pedido); e (b) gravar `content_hash` (sha256 do corpo) em `approvals` no pedido e conferir em `approval_apply`/`prompt_publish`/`rec_weights_activate`. Teste: editar depois do pedido → aplicar falha.

### Médio

**4. `role.admin` aprovado nunca expira e o banco não confere o papel de quem aprovou.**
- `supabase/migrations/0002_rls.sql:636-660` (`consume_role_admin_approval`): só exige `status = 'approved'` e `approved_by <> requested_by`. Os outros consumidores (`approval_apply`, `prompt_publish`, `rec_weights_activate`, `consume_source_critical_approval` na 0033) exigem menos de 24 h. `APPROVER_ACTION['role.admin'] = users.manage` (admin) só existe na aplicação; `approvals_decide` (RLS) deixa `editor_chefe` decidir qualquer tipo.
- Cenário: a editora-chefe aprova um `role.admin` direto pela API; o pedido fica "aprovado" por meses e qualquer admin o consome depois com um `INSERT` em `user_roles`.
- Correção: replicar 24 h com `decided_at` e exigir `has_role(approved_by,'admin')` em `consume_role_admin_approval`.

**5. Revogar o papel de admin (e de qualquer papel) é ação de uma pessoa só.**
- `supabase/migrations/0002_rls.sql:664-687` (`guard_user_roles` só dispara em `insert or update`); `src/lib/admin/roles.ts:46` (`revoke` inclui `admin`); `src/lib/studio/admin-users.ts` (`setRolesCommand`, laço `plan.revoke`).
- Cenário: um admin comprometido remove todos os outros admins numa sequência de `DELETE` sem segunda pessoa. Spec §8 lista "papéis de admin" como mudança crítica.
- Correção: tratar revogação de `admin` como `role.admin` (ou `safety.disable`) com aprovação; no mínimo bloquear remover o último admin e auditar `user.role.revoke` com alerta.

**6. Rollback de regras por uma pessoa pode desligar `forceReview` ou reabilitar um conjunto mais frouxo.**
- `supabase/migrations/0035_contingency.sql:124-128` (`rules_rollback`): volta para a versão aprovada anterior sem comparar com a ativa; a regra "já passou por duas pessoas" vale para aquele momento, não para reverter uma decisão de endurecimento posterior.
- Cenário: v2 desliga `forceReview` (duas aprovações), o incidente leva a v3 com `forceReview = true`; um admin clica "Rollback de regras" e v2 volta a valer, publicando automático sem segunda pessoa.
- Correção: se o destino tiver `force_review = false` com a ativa `true`, ou modo mais permissivo em alguma categoria, exigir o mesmo pedido (`force_review.disable`/`rules.activate`) em vez de rollback direto.

**7. Nenhuma trava dura para "Segurança nunca publica sozinha" fora do valor padrão da tabela.**
- `src/lib/rules/simulate.ts:46-62` (`validateRuleSet`) e `src/lib/rules/index.ts:117` (só `mode === "blocked"` retém). `CLAUDE.md` §5.8: "Segurança e breaking news nunca publicam sozinhas"; `breaking` tem trava dura, Segurança não.
- Cenário: uma proposta `rules.activate` (duas pessoas, mas sem o tipo `safety.disable`, sem alerta) muda `seguranca` para `auto` ou zera `sensitiveTopics`; o diff mostra, mas o fluxo é o mesmo de uma regra qualquer.
- Correção: em `decidePublication`, `seguranca` (e sua subárvore) sempre `hold`; em `validateRuleSet`, recusar `mode != blocked` para `seguranca`; mudança em `sensitiveTopics` que remova termos abre `safety.disable`, não `rules.activate`.

**8. Mesclar tags neutraliza tema sensível sem duas pessoas.**
- `supabase/migrations/0038_admin_core.sql` (`taxonomy_merge_tags`, `security definer`, roda como dono) e `src/lib/studio/admin-taxonomy.ts` (`mergeTagsCommand`, ação `site.manage`, editora-chefe sozinha). `decidePublication` classifica sensível por `tags` (`rules/index.ts:108-111`).
- Cenário: mesclar `crime` em `cidade` reescreve `articles.tags` e `collected_items.tags`; itens em curso deixam de casar com `sensitiveTopics` e podem sair pelo modo automático da categoria.
- Correção: recusar mescla cuja origem case com `sensitiveTopics` da regra ativa (ou exigir aprovação), e auditar o antes/depois das tags afetadas.

**9. O CSV de auditoria carrega dado pessoal.**
- `src/lib/admin/audit-export.ts:82-95` inclui `ator` (uuid), `nome` (nome da pessoa) e `detalhes` completos. Os detalhes trazem e-mail em `user.invite` (`src/lib/studio/admin-users.ts:76`) e o `patch` inteiro, com as notas livres do pedido LGPD, em `privacy.request.save` (`src/lib/studio/admin-ops.ts:233`). O comentário de `admin-ops.ts:244` reconhece que o e-mail é dado pessoal e o tira só da criação, não do convite nem das notas.
- Cenário: exportação de auditoria enviada a terceiros (auditor, consultoria) expõe e-mail e notas de titulares. O `audit_log` é imutável, então o dado também não pode ser apagado a pedido do titular.
- Correção: gravar convite sem e-mail (só `userId`), notas fora da auditoria (só `notesChanged: true`), CSV sem coluna `nome` e com `ator` pseudonimizado para quem não é admin; teste que varre o CSV por `@`.

**10. Máscara de IP e ocultação do hash só existem na aplicação; a RLS entrega tudo.**
- `supabase/migrations/0002_rls.sql:381-382` (`audit_log_read` para `admin, editor_chefe, operador_ia, leitura`) e `src/lib/admin/audit-export.ts:64-67`. A regra do plano ("IPs mascarados para quem não é admin") é aplicada só em `presentAuditRow`.
- Cenário: uma pessoa com papel `leitura` chama `GET /rest/v1/audit_log?select=ip_hash,details` com o próprio JWT e recebe `ip_hash` e IPs em `details` sem máscara. O mesmo vale para `pipeline_events` (logs, O08).
- Correção: revogar `select` direto em `audit_log` para `authenticated`, expor uma view/função que mascara para quem não é admin (como `public_sources`) e usar só ela na tela e no export.

**11. Exportações prometem 5000 linhas e entregam 1000 sem avisar.**
- `src/lib/studio/admin-ops.ts:183,191` (`EXPORT_LIMIT = 5000`) contra `supabase/config.toml:18` (`max_rows = 1000`), que o PostgREST aplica sobre o `.limit()` do cliente. O relatório P5 e a tela dizem "limitada a 5000 linhas".
- Cenário: o auditor pede o período todo, recebe 1000 linhas, o detalhe da auditoria `audit.export` registra `rows: 1000` e nada indica truncamento; parece um export completo.
- Correção: paginar por `id` no servidor até o limite, ou devolver `truncated` na resposta e no cabeçalho do CSV; ajustar o texto. Confirmar o `max_rows` do projeto hospedado.

**12. "Desligar busca com IA" desliga também o pipeline, ao contrário do runbook.**
- `src/lib/ai/call-agent.ts:136,238` (`aiEnabled()` em toda chamada de agente) e `docs/runbooks/ia-fora.md` item 3 ("O pipeline de matérias não é afetado por esta flag"). A flag é a mesma `ai_enabled`.
- Cenário: o admin desliga a IA por incidente na `/pergunte`; o próximo ciclo de 30 min recebe `disabled` em `summarize`/`write`, cai no rascunho de fallback (o B-015 do gate P4 mostra que ele copia trecho da fonte) e nada é publicado; ninguém foi avisado.
- Correção: separar `ai_search_enabled` de `ai_enabled` (ou a chamada do pipeline ignorar a flag e ter a própria), ou corrigir runbook e diálogo para dizer que o pipeline pausa. Teste de integração cobrindo `ai_enabled = false` no pipeline.

**13. Publicidade: link sem restrição de esquema no servidor, subeditoria burla a lista proibida, e o anúncio nem chega ao portal.**
- `src/lib/studio/admin-ops.ts:36`: `href: z.string().trim().url()` aceita `javascript:` e `data:`; só o formulário (`CampaignsPanel.tsx:158`) exige `https?://`. `imageUrl` também é livre (rastreamento e imagem de terceiros fora da política de reprodução).
- `src/lib/ads/rules.ts:76-77,100` e a constraint `sponsored_sections_allowed` (0039) comparam o slug exato com `politica|seguranca|saude`. `createSectionCommand` cria subeditoria herdando a `autonomy_category` (`admin-taxonomy.ts:27-34`), por exemplo `politica-municipal`, que não está na lista.
- `grep placeSponsored src/` só acha o próprio módulo e testes: nenhum componente do portal o chama, então `deliveries` fica em 0 e o item "entregas" do A07 não tem fonte.
- Correção: `refine` com `^https://`; validar `allowed_sections` contra `sections.autonomy_category` (função no banco ou checagem no comando) e usar a categoria em `placeSponsored`; ligar `placeSponsored` ao portal ou registrar como degradado.

**14. Convite dá papel na hora, nunca expira, e o contador do painel está errado.**
- `src/lib/studio/admin-users.ts:56-72` insere `user_roles` antes de qualquer aceite. `staff_invites.accepted_at` e `expires_at` (`0038:22-23`) nunca são lidos nem gravados (`grep accepted_at src/` só lê). `src/lib/db/queries/admin.ts:268` conta `accepted_at is null` (todos os convites da história) como "convites pendentes" na A01, enquanto a A02 (linha 98) usa `lastSignInAt`.
- Cenário: e-mail digitado errado ou convite ignorado; a conta com papel `editor` fica ativa para quem controlar aquele endereço, sem prazo. A01 mostra convites pendentes que já entraram.
- Correção: marcar `accepted_at` no primeiro login (callback), varrer convites vencidos revogando o papel, contar pendentes com a mesma regra da A02.

### Baixo

**15. Desduplicação de pedido ignora tipo e solicitante.** `src/lib/studio/approvals.ts:43` devolve qualquer pedido pendente com o mesmo `target_ref`. Como `approvals_request` deixa qualquer membro da equipe pedir antes do alvo existir, uma pessoa pode "reservar" `rules:5`; a proposta legítima recebe o `id` do pedido alheio e `approval_apply` falha porque `proposed_by <> requested_by`, travando a proposta até alguém recusar. Filtrar por `requestedBy === me` e `kind`.

**16. `run-now` responde 500 para `Origin: null`.** `src/app/api/control/run-now/route.ts:17`: `new URL("null")` lança. Capturar e devolver 403.

**17. Redirecionamento aceita `/\host`.** `src/lib/seo/redirects.ts:31` bloqueia `//` mas a regex `^/[^\s#]*$` aceita `/\evil.example`, que navegadores tratam como `//evil.example`; o check do banco (`0039`, `redirects.to_path`) nem bloqueia `//`. Só editor-chefe/admin escreve, mas a matéria redireciona para o destino (`materia/[slug]/page.tsx`). Recusar `\`, `%5c` e repetir a regra no `check`.

**18. `home_layouts` legível por anônimo, e publicar não revalida.** `0038` (`home_layouts_read ... to anon using (true)`) expõe rascunhos e notas internas; `home_layout_publish` não confere "pelo menos um módulo ligado" nem ids conhecidos (`admin-home.ts` valida só na aplicação). Restringir leitura a `status = 'published'` para anon e repetir a validação no RPC.

**19. Playground e avaliação usam service role dentro de ação do Estúdio.** `src/lib/studio/ai-prompts.ts:395-410` (`createServiceClient()` para o `AiStore`) contra `CLAUDE.md` §8 ("service role só em rotas de servidor do pipeline"). Aceitável pelo motivo (`ai_calls` só admite escrita de serviço), mas precisa ficar registrado em `DECISIONS.md` e restrito ao `recordCall`.

**20. Teste A/B sem invariantes.** `src/lib/studio/recommendation.ts` (`promoteExperimentCommand`) não confere `status = 'running'` (promover duas vezes cria duas versões e dois pedidos); `rec_experiments.split` não tem soma nem checagem no banco, e nada impede dois experimentos `running` ao mesmo tempo.

**21. Pesos de recomendação sem CHECK no banco.** `0001_init.sql:246` e `0037`: soma 1,00, chaves conhecidas e `cap <= 0,25` (spec §7.3) só valem no `weightsValid` da aplicação; um operador via REST propõe `{"popularity": 10}` ou `cap = 1`. A segunda pessoa vê o valor, mas o Global Constraint diz "para salvar".

**22. `listUsers({ perPage: 500 })` trunca.** `admin-users.ts` (checagem de e-mail duplicado do convite) e `db/queries/admin-ops.ts:246` / `admin.ts:76` (último acesso e 2FA): acima de 500 contas, o convite repetido passa e a revisão de acessos mostra "sem 2FA".

**23. `CRITICAL_KINDS` repete `push.highlight` e `push.resume`** (`src/lib/approvals/approvals.ts`, lista duplicada). Inofensivo, mas o conjunto derivado e `approval_kinds()` precisam ficar iguais; há teste de espelho para auditoria, não para tipos.

### Lacunas de conformidade com `docs/screens.md` e com o relatório

- **O15** ainda não tem "salvar como caso de regressão" (o relatório registra o desvio, falta o `A-###`).
- **A05** promete "mesclagem sugerida pela IA"; a implementação é heurística de acento/caixa/plural (`suggestTagMerges`). Reclassificar no texto da tela ou no relatório.
- **Publicação de prompt sem regressão:** `eval_runs.trigger = 'publish'` existe, mas `prompt_publish` não exige rodada aprovada; o runbook manda rodar "antes", sem trava.
- **`docs/reports/P5.md` não está pronto para o gate (`AUTONOMY.md` §5 item 5):** o cabeçalho ainda diz que T5, T7, T8, T9 "ficam para outra rodada"; não há seção de T3/T6 (só menção), nem Lighthouse, nem cobertura, e as "decisões sem o dono (para A-###)" continuam sem número em `.planning/DECISIONS.md`. O `impeccable audit` (item 4) não aparece.

## Lacunas de teste relevantes

1. Nenhum teste de exclusão de conta (`purge_deleted_accounts`) com convidante ex-staff (achado 1).
2. Nenhum teste de "editar conteúdo depois do pedido" para regras, prompts e pesos (achado 3); `rls-two-person` cobre autoaprovação, não adulteração posterior.
3. Sem teste de expiração nem de papel do aprovador para `role.admin` (achado 4) e sem teste de revogação de admin (5).
4. Sem teste de rollback para versão com `forceReview = false` (6) nem de `seguranca` fora de `blocked` (7).
5. Sem teste que varre o CSV de auditoria por e-mail/nome (9) nem de leitura direta de `audit_log` por `leitura` (10); o teste atual só compara IP mascarado.
6. Sem teste de exportação acima de 1000 linhas (11).
7. `ai_enabled = false` só é testado para `/pergunte`; nada cobre o pipeline (12).
8. Testes e2e de mutação rodam só no projeto `desktop` (aceito), e o projeto `fixtures` teve 2 falhas por tempo na rodada completa (registrado no P5.md como cold start); manter o `--project=fixtures --no-deps` no CI do gate.

## Recomendação

Nenhum bloqueante, mas os três altos (1, 2, 3) devem entrar antes do merge: o 1 derruba a rotina de LGPD, o 2 é controle de segurança que só finge e o 3 quebra a promessa central da fase (duas pessoas sem bypass). Os médios 4, 5, 6, 7 e 9 tocam diretamente as regras de produto §5.5/§5.8 e a exigência de CSV sem dado pessoal; os demais podem ir para `BLOCKERS.md` com condição de revisita.

## Situação · P6 tarefa 3 (segurança)

Achado 10 fechado na migration `0049_p6_security.sql`: `pipeline_events` só é legível por admin; quem vê o Control Center (`control_can_view`) lê `pipeline_events_view`, que mascara IP na mensagem, na referência e nos detalhes (mesmo desenho de `audit_log_view`). `control_logs` e `control_run_steps` leem a view, então a busca por texto de quem não é admin também não enxerga IP. Os cinco pontos de leitura (`control.ts`, `ai-control.ts`, `control-store.ts`) passaram a usar a view. Testes: `tests/integration/p6-hardening.test.ts` (admin vê o original; editor-chefe, operador de IA e leitura veem `203.0.x.x`; tabela crua só para admin; jornalista e anônimo não leem; `control_logs` não acha o IP por busca).
