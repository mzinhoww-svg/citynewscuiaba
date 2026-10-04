--- ISSUE 1 ---
## [Segurança] Anônimos leem todas as versões de matérias publicadas, inclusive rascunhos pré-publicação

**Status:** C1-01: corrigido em af13470

**Labels sugeridas:** `security`, `severity:média`

### Descrição
A política RLS `article_versions_read_public` libera a `anon` e a `authenticated` todas as linhas de `article_versions` de matérias publicadas ou atualizadas, com o `snapshot` completo, `origin` (ai/human) e `author_id`. A view `public_article_versions` foi criada para expor só as versões pós-publicação e sem esses campos, mas o PostgREST permite ler a tabela diretamente com a anon key pública: `GET /rest/v1/article_versions?select=*&article_id=eq.<id>`.

### Evidência
- **C1-01** — `supabase/migrations/0002_rls.sql:164-165`, `supabase/migrations/0008_portal.sql:64-73 (view que deveria recortar)`
  ```
  create policy article_versions_read_public on article_versions for select to anon, authenticated
    using (exists (select 1 from articles a where a.id = article_id
                   and a.status in ('published', 'updated')));
  ```

### Impacto
Vaza texto de rascunhos que nunca foram publicados (inclusive trechos removidos na revisão), a origem IA ou humana de cada campo e o UUID dos autores. Contraria a regra de produto §5.3 (nenhuma tela pública expõe origem IA).

### Sugestão de correção
Nova migration com `drop policy article_versions_read_public on article_versions;`. Se algum caminho público ler a tabela, trocar pela view `public_article_versions`. Adicionar o caso a `tests/security/rls.test.ts`.

### Critérios de aceite
- [ ] `select` anônimo em `article_versions` devolve 0 linhas
- [ ] `public_article_versions` continua devolvendo só versões pós-publicação
- [ ] Teste de RLS cobre o caso
- [ ] `pnpm verify` verde
--- FIM ISSUE 1 ---

--- ISSUE 2 ---
## [Segurança] Sem confirmação de e-mail, conta com e-mail alheio exporta e apaga dados da vítima

**Status:** C1-02: corrigido em d9c5196

**Labels sugeridas:** `security`, `severity:média`

### Descrição
`export_email_data()` e o expurgo de conta (`purge_deleted_accounts` → `purge_email_data`) confiam em `auth.users.email_confirmed_at`. Com `enable_confirmations = false`, o GoTrue confirma o e-mail no cadastro, então qualquer pessoa cria conta com o e-mail de um assinante e passa a ser tratada como dona dos dados dele.

### Evidência
- **C1-02** — `supabase/config.toml:225`, `supabase/migrations/0021_reader_email_gate.sql:112-144`, `supabase/migrations/0021_reader_email_gate.sql:47-63`, `supabase/migrations/0024_profiles_on_delete.sql:43-89`
  ```
  # supabase/config.toml:225
  enable_confirmations = false
  -- 0021:123-124
  select lower(u.email) into e from auth.users u
   where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
  ```

### Impacto
Leitura (inscrições, alertas e assuntos seguidos) e exclusão de dados pessoais de terceiros, com efeito sobre direitos LGPD de acesso e eliminação.

### Sugestão de correção
Ligar "Confirm email" no projeto de produção e em `supabase/config.toml`. Como defesa adicional, registrar a confirmação por link próprio (ex.: `reader_emails` confirmado) e exigir isso em `export_email_data` e `purge_email_data`.

### Critérios de aceite
- [ ] Cadastro novo não tem `email_confirmed_at` até clicar no link
- [ ] `export_email_data` devolve null para conta sem confirmação por link
- [ ] Expurgo não apaga dados por e-mail de conta não confirmada
- [ ] Teste de integração cobre o cenário
--- FIM ISSUE 2 ---

--- ISSUE 3 ---
## [Segurança] push_audit permite que qualquer conta grave entradas falsas e imutáveis no audit_log

**Status:** C1-03: corrigido em 59f7d70

**Labels sugeridas:** `security`, `severity:média`

### Descrição
`public.push_audit` é `security definer`, liberada a `authenticated` (cadastro aberto) e só exige `p_action like 'push.%'`. Não checa papel, tamanho nem frequência. Além disso, a política `audit_log_insert` deixa qualquer papel da equipe inserir qualquer `action` diretamente.

### Evidência
- **C1-03** — `supabase/migrations/0041_push_admin.sql:138-153`, `supabase/migrations/0002_rls.sql:379-380`
  ```
  create or replace function public.push_audit(p_action text, p_object text, p_details jsonb ...)
  ... security definer ...
    if p_action not like 'push.%' then raise exception ...
    insert into audit_log (actor, action, object_ref, details) values (...);
  ...
  grant execute on function public.push_audit(text, text, jsonb) to authenticated, service_role;
  ```

### Impacto
Forja da trilha de auditoria (ex.: `push.approve` falso), que não pode ser apagada por causa da imutabilidade, e crescimento ilimitado da tabela.

### Sugestão de correção
Em `push_audit`: exigir `push_can(auth.uid(), ...)` ou `is_staff`, limitar `p_details` a cerca de 1 KB e aplicar `hit_rate_limit`, como já faz `studio_audit` (0025). Restringir `audit_log_insert` a `action = any(studio_audit_actions())` ou removê-la, centralizando a gravação em funções.

### Critérios de aceite
- [ ] Leitor sem papel recebe 42501 ao chamar `push_audit`
- [ ] `p_details` acima do limite é recusado
- [ ] Insert direto com action fora da lista falha
- [ ] Testes de RLS e RPC adicionados
--- FIM ISSUE 3 ---

--- ISSUE 4 ---
## [Segurança] Editor de editoria remove imagens de outras editorias via "remover todas da fonte"

**Status:** C3-01: corrigido em 1e26999

**Labels sugeridas:** `security`, `severity:média`

### Descrição
`takedownImage` (`src/lib/studio/media.ts:119-137`) valida `media.approve` só no escopo da imagem `id`. Com `allFromSource: true`, a remoção atinge todas as reproduções do mesmo `source_id`, com a service role, sem filtrar por editoria.

### Evidência
- **C3-01** — `src/lib/studio/media.ts:119-137`, `src/app/estudio/actions.ts:367-373`, `src/lib/db/pipeline-store.ts:1060-1068`, `src/lib/auth/permissions.ts:73`
  ```
  export const takedownImage = studioAction(
    "media.approve",
    (i: TakedownInput, ctx) => mediaScope(ctx, i.id),   // escopo de UMA imagem
    async (i, ctx) => { ...
      const service = createServiceClient();
      const target = i.allFromSource && m.source_id ? { sourceId: m.source_id } : { mediaId: i.id };
  ```

### Impacto
Um editor restrito a uma editoria apaga, de forma irreversível (Storage), as imagens de reprodução daquele veículo em matérias de todas as editorias.

### Sugestão de correção
Para `allFromSource`, exigir `can(session, "media.approve", { section: "*" })` (escopo `all`) ou filtrar as reproduções às matérias das editorias do usuário. Esconder o checkbox para quem não tem escopo total.

### Critérios de aceite
- [ ] Editor com `sections=[x]` recebe `forbidden` ao usar `allFromSource`
- [ ] Editor-chefe e revisor continuam podendo
- [ ] Teste unitário de `takedownImage` cobre os dois papéis
--- FIM ISSUE 4 ---

--- ISSUE 5 ---
## [Segurança] .gitignore não cobre .env.prod / .env.production (risco de commitar service role)

**Status:** C4-01: corrigido em bb408fd

**Labels sugeridas:** `security`, `severity:média`

### Descrição
O `.gitignore` só ignora `.env` e `.env*.local`. `scripts/release-backlog.mjs` documenta o uso de `.env.prod` com credenciais de produção, que não seria ignorado.

### Evidência
- **C4-01** — `.gitignore:3-4`, `scripts/release-backlog.mjs:11`
  ```
  # .gitignore:3-4
  .env*.local
  .env
  # scripts/release-backlog.mjs:11
  //   node --env-file=.env.prod  scripts/release-backlog.mjs --apply --confirm-host=<projeto>.supabase.co
  ```

### Impacto
Um `git add -A` (manual ou do agente autônomo) publicaria a `SUPABASE_SERVICE_ROLE_KEY` de produção, que ignora toda a RLS.

### Sugestão de correção
Trocar as linhas por `.env*` e `!.env.example`. Opcional: hook de pre-commit ou secret scanning (gitleaks) no CI.

### Critérios de aceite
- [ ] `git check-ignore .env.prod .env.production .env.development` retorna os três
- [ ] `.env.example` continua rastreado
- [ ] CI roda secret scanning (opcional)
--- FIM ISSUE 5 ---

--- ISSUE 6 ---
## [Segurança] Metadados internos de matérias e papéis da equipe expostos via PostgREST

**Labels sugeridas:** `security`, `severity:baixa`

### Descrição
`articles_read_public` libera todas as colunas de matérias publicadas (autor, `confidence_score`, `ai_fallback`, `field_origins`, `embedding`...). Funções como `has_role(uid, role)` recebem `uid` arbitrário e estão liberadas a `authenticated`; com os ids de `public_bylines`, qualquer conta mapeia quem é admin.

### Evidência
- **C1-04** — `supabase/migrations/0002_rls.sql:150`
  ```
  create policy articles_read_public on articles for select to anon, authenticated
    using (status in ('published', 'updated'));
  ```
- **C1-05** — `supabase/migrations/0002_rls.sql:116-125`, `supabase/migrations/0008_portal.sql:27-32`, `supabase/migrations/0027_control_center.sql:235`, `supabase/migrations/0041_push_admin.sql:134-135`
  ```
  grant execute on function public.has_role(uuid, app_role, text), public.is_staff(uuid),
    public.has_any_role(uuid, app_role[]), public.can_edit_section(uuid, text), ...
    to authenticated, service_role;
  ```

### Impacto
Vazamento de metadados editoriais e de IA e enumeração de contas privilegiadas para phishing direcionado.

### Sugestão de correção
`revoke select on articles from anon` + `grant select (colunas públicas) on articles to anon`, ou servir o portal por view. Revogar as funções de papel de `authenticated` e criar wrappers `my_*()` baseados em `auth.uid()`; RLS continua usando as originais (as políticas rodam como dono).

### Critérios de aceite
- [ ] `GET /rest/v1/articles?select=confidence_score` anônimo falha
- [ ] `rpc('has_role')` de leitor falha
- [ ] Portal e Estúdio funcionam (e2e verde)
--- FIM ISSUE 6 ---

--- ISSUE 7 ---
## [Segurança] Papéis amplos da equipe leem eventos individuais e perfis de leitores

**Labels sugeridas:** `security`, `severity:baixa`

### Descrição
`events_read_metrics` libera linhas individuais de eventos (anon_id, user_id, buscas) a `editor` e `leitura`; `profiles_read_staff` libera todos os perfis a qualquer papel.

### Evidência
- **C1-06** — `supabase/migrations/0002_rls.sql:337-340`, `supabase/migrations/0002_rls.sql:352`
  ```
  create policy events_read_metrics on events for select to authenticated
    using (has_any_role((select auth.uid()), '{admin,editor_chefe,editor,operador_ia,analista,leitura}'));
  ```

### Impacto
Acesso a dados pessoais além do necessário (minimização, LGPD).

### Sugestão de correção
Restringir `events` a admin e analista e expor agregados (views ou RPC) aos demais. Limitar `profiles_read_staff` a papéis que moderam ou atendem leitores.

### Critérios de aceite
- [ ] Papel `leitura` não lê linhas de `events`
- [ ] Painéis de métricas continuam funcionando com agregados
- [ ] Teste de RLS atualizado
--- FIM ISSUE 7 ---

--- ISSUE 8 ---
## [Segurança] Prévia de mídia do Estúdio serve imagens pendentes ou bloqueadas a qualquer papel

**Labels sugeridas:** `security`, `severity:baixa`

### Descrição
`GET /api/estudio/midia/[id]` exige só `roles.length > 0`, força `status: approved` e ignora `image_reproduction_enabled`, enquanto as telas exigem `media.approve` ou `article.edit`.

### Evidência
- **C3-02** — `src/app/api/estudio/midia/[id]/route.ts:21-22`, `src/app/api/estudio/midia/[id]/route.ts:44-50`, `supabase/migrations/0002_rls.sql:190`
  ```
  const session = await getSession();
  if (!session || session.roles.length === 0) return notFound();
  ...
    status: "approved",
  ...
  reproductionEnabled: async () => true,
  ```

### Impacto
Papéis como `leitura` ou `analista` baixam imagens bloqueadas (inclusive por motivo legal) e de matérias fora do seu escopo.

### Sugestão de correção
Exigir `canAccess(session, "media.approve")` ou `article.edit` com escopo da matéria ligada; para imagens `blocked`, só `media.approve`.

### Critérios de aceite
- [ ] Papel `leitura` recebe 404
- [ ] Editor de outra editoria recebe 404
- [ ] Teste da rota cobre os papéis
--- FIM ISSUE 8 ---

--- ISSUE 9 ---
## [Segurança] Validação do bairro do perfil depende de campo oculto do cliente

**Labels sugeridas:** `security`, `severity:baixa`

### Descrição
`perfil/actions.ts` aceita qualquer `neighborhood` igual a `current_neighborhood`, que vem do próprio formulário, e o banco não restringe a coluna.

### Evidência
- **C2-01** — `src/app/(public)/perfil/actions.ts:20-23`, `src/components/editorial/AccountForms.tsx:53`
  ```
  const current = String(form.get("current_neighborhood") ?? "").trim();
  const allowed = hood === "" || hood === current || NEIGHBORHOODS.some((n) => n.name === hood);
  ```

### Impacto
O leitor grava texto arbitrário e longo no próprio perfil (dado sujo, possível abuso em telas da equipe que listam perfis).

### Sugestão de correção
Ler o bairro atual do banco (não do form) ou validar só pela lista `NEIGHBORHOODS`. Adicionar `check (char_length(neighborhood) <= 80)` em `profiles`.

### Critérios de aceite
- [ ] POST com bairro fora da lista é recusado
- [ ] `check` de tamanho no banco
- [ ] Teste unitário da ação
--- FIM ISSUE 9 ---

--- ISSUE 10 ---
## [Segurança] Validar CRON_SECRET na inicialização e separar segredos derivados

**Labels sugeridas:** `security`, `severity:baixa`

### Descrição
`isCronAuthorized` aceita qualquer segredo não vazio, inclusive o placeholder de `.env.example`. O mesmo segredo vira chave HMAC da newsletter e sal do rate limit quando as variáveis dedicadas faltam.

### Evidência
- **C4-02** — `src/lib/security/cron-auth.ts:11-17`, `.env.example:8`
  ```
  export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
    if (!secret) return false;   // aceita qualquer valor não vazio, inclusive o placeholder
  ```
- **C4-03** — `src/lib/newsletter/token.ts:17-18`, `src/lib/security/rate-limit.ts:27-28`

### Impacto
Má configuração libera as rotas de cron, e um único vazamento compromete cron, links de newsletter e alertas.

### Sugestão de correção
Criar `src/instrumentation.ts` (ou `src/lib/env.ts`) que, em produção, rejeite `CRON_SECRET` com menos de 32 caracteres ou contendo `substituir`. Exigir `NEWSLETTER_TOKEN_SECRET` e `RATE_LIMIT_SALT` próprios em produção.

### Critérios de aceite
- [ ] Boot em produção falha com o placeholder
- [ ] `isCronAuthorized` recusa segredo curto
- [ ] Newsletter e rate limit não usam mais o fallback para `CRON_SECRET` em produção
- [ ] Testes unitários
--- FIM ISSUE 10 ---

--- ISSUE 11 ---
## [Segurança] Backup diário com auth.users sai sem cifra em repositório privado

**Labels sugeridas:** `security`, `severity:baixa`

### Descrição
`.github/workflows/backup.yml` só exige `BACKUP_PASSPHRASE` em repositório público; em privado, o dump (schemas public, auth e storage) fica 7 dias como artifact sem cifra.

### Evidência
- **C4-04** — `.github/workflows/backup.yml:35`, `.github/workflows/backup.yml:63-68`
  ```
  elif [ "$REPO_PRIVATE" != "true" ] && [ -z "${BACKUP_PASSPHRASE:-}" ]; then   # só bloqueia se público
  ...
  if [ -n "${BACKUP_PASSPHRASE:-}" ]; then gpg ... --symmetric ...   # cifra opcional
  ```

### Impacto
Qualquer pessoa ou token com leitura no repositório baixa e-mails e hashes de senha de toda a base.

### Sugestão de correção
Pular o backup (com aviso) sempre que faltar `BACKUP_PASSPHRASE` e cifrar sempre.

### Critérios de aceite
- [ ] Sem passphrase, o job não publica artifact
- [ ] Artifact publicado é sempre `.gpg`
--- FIM ISSUE 11 ---

--- ISSUE 12 ---
## [Segurança] Injeção em ICS e em CSV do histórico de fontes

**Labels sugeridas:** `security`, `severity:baixa`

### Descrição
`src/lib/ics.ts` não escapa `;` (`"\;"` vira `";"` em JS) nem CR sozinho, permitindo injetar propriedades ou eventos no .ics. `SourceAuditTable.tsx` monta o CSV sem neutralizar fórmulas (`=`, `+`, `-`, `@`).

### Evidência
- **C5-01** — `src/lib/ics.ts:42-48`, `src/lib/ics.ts:94-97`, `src/app/api/ics/[slug]/route.ts:20-28`
  ```
  function escape(text: string): string {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\;")        // "\;" === ";": não escapa
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");  // CR sozinho passa
  }
  ```
- **C5-02** — `src/components/studio/sources/SourceAuditTable.tsx:79-96`
  ```
  const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;
  ...
    r.actor.name, ..., r.reason ?? "", ...  ].map(csvCell)
  ```

### Impacto
Arquivo de calendário manipulado para quem baixa o evento; execução de fórmula na planilha de quem exporta o histórico.

### Sugestão de correção
ICS: `.replace(/;/g, "\\;")`, `.replace(/\r\n|\r|\n/g, "\\n")` e remoção de caracteres de controle (também em `agenda/submission.ts`). CSV: reutilizar o `toCsv` protegido de `src/lib/control`.

### Critérios de aceite
- [ ] Teste: `"a;b\rX:1"` sai como `a\;b\nX:1`
- [ ] Teste: célula `=1+1` sai prefixada com `'`
- [ ] `pnpm verify` verde
--- FIM ISSUE 12 ---

--- ISSUE 13 ---
## [Segurança] Endurecimento: grants de funções, guardas de uid nulo e validações de defesa em profundidade

**Labels sugeridas:** `security`, `severity:informativa`

### Descrição
Itens sem exploração relevante hoje que tornam a base frágil a mudanças: funções `security definer` sem checagem de papel (`approval_target_hash`, `lock_fast_lane_max`, `push_settings_int`); revokes só `from public, anon`; guardas `auth.uid() is not null and ...`; `publishAction` sem rechecar `canRequestUrgent`; recibo de push sem vínculo com a inscrição; denúncia sem checar a existência do conteúdo.

### Evidência
- **C1-07** — `supabase/migrations/0048_p5_gate_fixes.sql:32-61`, `supabase/migrations/0011_source_admin.sql:167-181`, `supabase/migrations/0041_push_admin.sql:102-103`
- **C1-08** — `supabase/migrations/0011_source_admin.sql:628-633`, `supabase/migrations/0048_p5_gate_fixes.sql:100`, `supabase/migrations/0027_control_center.sql:37-48`
- **C2-02** — `src/lib/push/api.ts:294-306`
- **C2-03** — `src/app/estudio/actions.ts:258-271`
- **C3-03** — `src/lib/reports/report.ts:33`, `src/lib/db/writes.ts:241-256`

### Impacto
Baixo hoje, mas uma mudança futura (ex.: liberar anon numa função) vira falha real sem que nenhum teste acuse.

### Sugestão de correção
Padronizar `revoke execute ... from public, anon, authenticated` + `grant` explícito; nas funções só de serviço, falhar se `auth.uid() is null and auth.role() <> 'service_role'`; checar papel nas três funções citadas; rechecar `canRequestUrgent` na ação; validar `contentRef` com `findPublicArticleId`; assinar o `sendId` no payload do push. Adicionar teste que liste funções `security definer` executáveis por authenticated e compare com uma allowlist.

### Critérios de aceite
- [ ] Teste de allowlist de funções executáveis por `authenticated`
- [ ] Guardas de uid nulo revisadas
- [ ] Itens de defesa em profundidade aplicados
--- FIM ISSUE 13 ---
