-- CityNews Cuiabá · RLS e views públicas (P0 Task 7; architecture §6 e §7)
--
-- Princípios:
-- 1. RLS ligada em todas as tabelas de public (inclusive partições).
-- 2. Público (anon e authenticated) lê só o que o portal mostra: matérias publicadas, assuntos,
--    editorias, agenda confirmada, coleções editoriais, correções publicadas e flags.
--    Fontes e itens agregados só pelas views public_sources e public_aggregated (colunas públicas).
-- 3. Estúdio escreve por papel: has_role(auth.uid(), papel, editoria), espelhando
--    src/lib/auth/permissions.ts (matriz em docs/architecture.md §6).
-- 4. service_role (pipeline, rotas de servidor) ignora RLS (bypassrls).
-- 5. audit_log: só inserção (trigger de 0001 + sem políticas de update/delete).
--
-- Convenção de dono em follows, saved_items e alerts: conta logada usa owner_ref = auth.uid()::text;
-- dados anônimos (anon_id) passam pelo servidor com service role.

-- ---------------------------------------------------------------------------
-- Funções auxiliares (security definer: leem user_roles sem depender da RLS dela)
-- ---------------------------------------------------------------------------
create or replace function public.has_role(uid uuid, role app_role, section text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = has_role.uid
      and ur.role = has_role.role
      and (has_role.section is null or has_role.section = any (ur.sections))
  )
$$;

-- Qualquer papel do Estúdio (inclusive leitura).
create or replace function public.is_staff(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles ur where ur.user_id = is_staff.uid)
$$;

-- Algum dos papéis informados, sem recorte de editoria.
create or replace function public.has_any_role(uid uuid, roles app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles ur where ur.user_id = has_any_role.uid and ur.role = any (has_any_role.roles))
$$;

-- editor_chefe em qualquer editoria; editor só nas editorias dele.
create or replace function public.can_edit_section(uid uuid, section text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(uid, 'editor_chefe') or public.has_role(uid, 'editor', section)
$$;

-- Editoria da matéria (para tabelas filhas).
create or replace function public.article_section(article uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.section_slug from public.articles a where a.id = article
$$;

create or replace function public.article_is_public(article uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.articles a where a.id = article and a.status in ('published', 'updated'))
$$;

create or replace function public.article_owner(article uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.author_id from public.articles a where a.id = article
$$;

revoke execute on function public.has_role(uuid, app_role, text), public.is_staff(uuid), public.has_any_role(uuid, app_role[]),
  public.can_edit_section(uuid, text), public.article_section(uuid), public.article_is_public(uuid), public.article_owner(uuid) from public;
grant execute on function public.has_role(uuid, app_role, text), public.is_staff(uuid), public.has_any_role(uuid, app_role[]),
  public.can_edit_section(uuid, text), public.article_section(uuid), public.article_is_public(uuid), public.article_owner(uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS em todas as tabelas (inclusive partições, que podem ser consultadas diretamente)
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Conteúdo público
-- ---------------------------------------------------------------------------
create policy sections_read on sections for select to anon, authenticated using (true);
create policy sections_write on sections for all to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe}')) with check (has_any_role((select auth.uid()), '{admin,editor_chefe}'));

create policy topics_read on topics for select to anon, authenticated using (true);
create policy topics_write on topics for all to authenticated
  using (can_edit_section((select auth.uid()), section_slug)) with check (can_edit_section((select auth.uid()), section_slug));

-- Matérias: público lê publicadas/atualizadas; Estúdio lê tudo.
create policy articles_read_public on articles for select to anon, authenticated using (status in ('published', 'updated'));
create policy articles_read_staff on articles for select to authenticated using (is_staff((select auth.uid())));
-- article.edit / article.publish: editor_chefe em tudo, editor na editoria dele.
create policy articles_insert_editors on articles for insert to authenticated with check (can_edit_section((select auth.uid()), section_slug));
create policy articles_update_editors on articles for update to authenticated
  using (can_edit_section((select auth.uid()), section_slug)) with check (can_edit_section((select auth.uid()), section_slug));
-- Jornalista: cria e edita só as próprias, sem publicar (status até in_review).
create policy articles_insert_jornalista on articles for insert to authenticated
  with check (has_role((select auth.uid()), 'jornalista') and author_id = (select auth.uid()) and status in ('draft', 'in_review'));
create policy articles_update_jornalista on articles for update to authenticated
  using (has_role((select auth.uid()), 'jornalista') and author_id = (select auth.uid()) and status in ('draft', 'in_review', 'changes_requested'))
  with check (author_id = (select auth.uid()) and status in ('draft', 'in_review'));

create policy article_versions_read_public on article_versions for select to anon, authenticated using (article_is_public(article_id));
create policy article_versions_read_staff on article_versions for select to authenticated using (is_staff((select auth.uid())));
create policy article_versions_insert on article_versions for insert to authenticated
  with check (
    can_edit_section((select auth.uid()), article_section(article_id))
    or (has_role((select auth.uid()), 'jornalista') and article_owner(article_id) = (select auth.uid()))
    or (has_role((select auth.uid()), 'revisor') and change_kind = 'correction')
  );

create policy article_sources_read_public on article_sources for select to anon, authenticated using (article_is_public(article_id));
create policy article_sources_read_staff on article_sources for select to authenticated using (is_staff((select auth.uid())));
create policy article_sources_write on article_sources for all to authenticated
  using (
    can_edit_section((select auth.uid()), article_section(article_id))
    or (has_role((select auth.uid()), 'jornalista') and article_owner(article_id) = (select auth.uid()))
  )
  with check (
    can_edit_section((select auth.uid()), article_section(article_id))
    or (has_role((select auth.uid()), 'jornalista') and article_owner(article_id) = (select auth.uid()))
  );

-- Mídia: público vê só aprovada; media.approve = editor_chefe, editor, revisor.
create policy media_assets_read_public on media_assets for select to anon, authenticated using (status = 'approved');
create policy media_assets_read_staff on media_assets for select to authenticated using (is_staff((select auth.uid())));
create policy media_assets_insert on media_assets for insert to authenticated
  with check (has_any_role((select auth.uid()), '{editor_chefe,editor,jornalista,revisor}') and status = 'pending');
create policy media_assets_approve on media_assets for update to authenticated
  using (has_any_role((select auth.uid()), '{editor_chefe,editor,revisor}')) with check (has_any_role((select auth.uid()), '{editor_chefe,editor,revisor}'));

create policy article_media_read_public on article_media for select to anon, authenticated using (article_is_public(article_id));
create policy article_media_read_staff on article_media for select to authenticated using (is_staff((select auth.uid())));
create policy article_media_write on article_media for all to authenticated
  using (can_edit_section((select auth.uid()), article_section(article_id)))
  with check (can_edit_section((select auth.uid()), article_section(article_id)));

-- Correções: público vê as publicadas; correction.manage = editor_chefe, editor (editoria), revisor.
create policy corrections_read_public on corrections for select to anon, authenticated using (published_at is not null);
create policy corrections_read_staff on corrections for select to authenticated using (is_staff((select auth.uid())));
create policy corrections_write on corrections for all to authenticated
  using (can_edit_section((select auth.uid()), article_section(article_id)) or has_role((select auth.uid()), 'revisor'))
  with check (can_edit_section((select auth.uid()), article_section(article_id)) or has_role((select auth.uid()), 'revisor'));

-- Agenda: público vê eventos confirmados; editoria "agenda" edita.
create policy event_listings_read_public on event_listings for select to anon, authenticated using (confirmed_at is not null);
create policy event_listings_read_staff on event_listings for select to authenticated using (is_staff((select auth.uid())));
create policy event_listings_write on event_listings for all to authenticated
  using (can_edit_section((select auth.uid()), 'agenda')) with check (can_edit_section((select auth.uid()), 'agenda'));

-- Sugestões de evento chegam pelo servidor (rate limit); Estúdio modera.
create policy event_submissions_staff on event_submissions for select to authenticated
  using (can_edit_section((select auth.uid()), 'agenda') or has_role((select auth.uid()), 'moderador'));
create policy event_submissions_moderate on event_submissions for update to authenticated
  using (can_edit_section((select auth.uid()), 'agenda') or has_role((select auth.uid()), 'moderador'))
  with check (can_edit_section((select auth.uid()), 'agenda') or has_role((select auth.uid()), 'moderador'));

-- Coleções: público vê as editoriais.
create policy collections_read_public on collections for select to anon, authenticated using (is_editorial);
create policy collections_read_owner on collections for select to authenticated using (owner_ref = (select auth.uid())::text);
create policy collections_write_editors on collections for all to authenticated
  using (has_any_role((select auth.uid()), '{editor_chefe,editor}')) with check (has_any_role((select auth.uid()), '{editor_chefe,editor}'));

create policy collection_items_read_public on collection_items for select to anon, authenticated
  using (exists (select 1 from collections c where c.id = collection_id and c.is_editorial));
create policy collection_items_write_editors on collection_items for all to authenticated
  using (has_any_role((select auth.uid()), '{editor_chefe,editor}')) with check (has_any_role((select auth.uid()), '{editor_chefe,editor}'));

create policy feature_flags_read on feature_flags for select to anon, authenticated using (true);
create policy feature_flags_write on feature_flags for update to authenticated
  using (has_role((select auth.uid()), 'admin')) with check (has_role((select auth.uid()), 'admin'));

-- ---------------------------------------------------------------------------
-- Fontes e coleta (Estúdio lê; source.manage = admin, editor_chefe, operador_ia)
-- ---------------------------------------------------------------------------
create policy sources_read_staff on sources for select to authenticated using (is_staff((select auth.uid())));
create policy sources_manage on sources for all to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}'))
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}'));

create policy collected_items_read_staff on collected_items for select to authenticated using (is_staff((select auth.uid())));
create policy ingest_runs_read_staff on ingest_runs for select to authenticated using (is_staff((select auth.uid())));
create policy raw_items_read_ops on raw_items for select to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}'));

-- ---------------------------------------------------------------------------
-- Regras, IA, recomendação e aprovações
-- ---------------------------------------------------------------------------
create policy rules_read_staff on rules for select to authenticated using (is_staff((select auth.uid())));
-- rules.propose: admin, editor_chefe, operador_ia; sempre inativa e em nome de quem propõe.
create policy rules_propose on rules for insert to authenticated
  with check (
    has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}')
    and proposed_by = (select auth.uid()) and approved_by is null and not active
  );
-- rules.approve: admin, editor_chefe; o check de 0001 impede aprovar a própria proposta.
create policy rules_approve on rules for update to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe}'))
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe}') and approved_by = (select auth.uid()));

create policy decisions_read_staff on decisions for select to authenticated using (is_staff((select auth.uid())));
create policy decisions_human on decisions for insert to authenticated
  with check (is_staff((select auth.uid())) and human_id = (select auth.uid()));

create policy ai_models_read_staff on ai_models for select to authenticated using (is_staff((select auth.uid())));
create policy ai_models_manage on ai_models for all to authenticated
  using (has_any_role((select auth.uid()), '{admin,operador_ia}')) with check (has_any_role((select auth.uid()), '{admin,operador_ia}'));
create policy ai_agents_read_staff on ai_agents for select to authenticated using (is_staff((select auth.uid())));
create policy ai_agents_manage on ai_agents for all to authenticated
  using (has_any_role((select auth.uid()), '{admin,operador_ia}')) with check (has_any_role((select auth.uid()), '{admin,operador_ia}'));
create policy ai_prompts_read_staff on ai_prompts for select to authenticated using (is_staff((select auth.uid())));
-- prompt.publish: operador_ia cria (1ª assinatura); admin ou editor_chefe aprova (2ª).
create policy ai_prompts_propose on ai_prompts for insert to authenticated
  with check (has_role((select auth.uid()), 'operador_ia') and author_id = (select auth.uid()));
create policy ai_prompts_approve on ai_prompts for update to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}'))
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}'));
create policy ai_calls_read_ops on ai_calls for select to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia,analista}'));

-- rec.weights: admin, operador_ia; aprovação por outra pessoa (check de 0001).
create policy rec_weights_read_staff on rec_weights for select to authenticated using (is_staff((select auth.uid())));
create policy rec_weights_propose on rec_weights for insert to authenticated
  with check (
    has_any_role((select auth.uid()), '{admin,operador_ia}')
    and proposed_by = (select auth.uid()) and approved_by is null and not active
  );
create policy rec_weights_approve on rec_weights for update to authenticated
  using (has_any_role((select auth.uid()), '{admin,operador_ia}'))
  with check (has_any_role((select auth.uid()), '{admin,operador_ia}') and approved_by = (select auth.uid()));

create policy approvals_read_staff on approvals for select to authenticated using (is_staff((select auth.uid())));
create policy approvals_request on approvals for insert to authenticated
  with check (is_staff((select auth.uid())) and requested_by = (select auth.uid()) and approved_by is null);
create policy approvals_decide on approvals for update to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe}'))
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe}') and approved_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Métricas (metrics.view: admin, editor_chefe, editor, operador_ia, analista, leitura)
-- ---------------------------------------------------------------------------
create policy events_read_metrics on events for select to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,editor,operador_ia,analista,leitura}'));
create policy events_default_read_metrics on events_default for select to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,editor,operador_ia,analista,leitura}'));
create policy source_stats_read_metrics on source_stats_daily for select to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,editor,operador_ia,analista,leitura}'));

create policy sponsored_read_staff on sponsored_campaigns for select to authenticated using (is_staff((select auth.uid())));
create policy sponsored_manage on sponsored_campaigns for all to authenticated
  using (has_role((select auth.uid()), 'editor_chefe')) with check (has_role((select auth.uid()), 'editor_chefe'));

-- ---------------------------------------------------------------------------
-- Contas, papéis e dados do leitor
-- ---------------------------------------------------------------------------
create policy profiles_read_self on profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_read_staff on profiles for select to authenticated using (is_staff((select auth.uid())));
create policy profiles_insert_self on profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_self on profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_admin on profiles for all to authenticated
  using (has_role((select auth.uid()), 'admin')) with check (has_role((select auth.uid()), 'admin'));

-- users.manage: só admin altera papéis.
create policy user_roles_read_self on user_roles for select to authenticated using (user_id = (select auth.uid()));
create policy user_roles_admin on user_roles for all to authenticated
  using (has_role((select auth.uid()), 'admin')) with check (has_role((select auth.uid()), 'admin'));

create policy follows_owner on follows for all to authenticated
  using (owner_ref = (select auth.uid())::text) with check (owner_ref = (select auth.uid())::text);
create policy saved_items_owner on saved_items for all to authenticated
  using (owner_ref = (select auth.uid())::text) with check (owner_ref = (select auth.uid())::text);
create policy alerts_owner on alerts for all to authenticated
  using (owner_ref = (select auth.uid())::text) with check (owner_ref = (select auth.uid())::text);
-- newsletter_subscriptions: sem política (só servidor, com token de confirmação).

-- reports.moderate: editor_chefe, moderador. Denúncias entram pelo servidor (rate limit).
create policy reports_moderate on reports for select to authenticated using (has_any_role((select auth.uid()), '{editor_chefe,moderador}'));
create policy reports_update on reports for update to authenticated
  using (has_any_role((select auth.uid()), '{editor_chefe,moderador}')) with check (has_any_role((select auth.uid()), '{editor_chefe,moderador}'));

-- ---------------------------------------------------------------------------
-- Auditoria: só inserção. audit.view = admin, editor_chefe, operador_ia, leitura.
-- ---------------------------------------------------------------------------
create policy audit_log_insert on audit_log for insert to authenticated
  with check (is_staff((select auth.uid())) and actor = (select auth.uid())::text);
create policy audit_log_read on audit_log for select to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia,leitura}'));
revoke update, delete, truncate on audit_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Views públicas. Rodam com os direitos do dono (padrão do Postgres) para expor só colunas
-- públicas de tabelas que anon não lê diretamente; por isso são somente leitura.
-- ---------------------------------------------------------------------------
create or replace view public_sources as
  select s.id, s.slug, coalesce(s.display_name, s.name) as name, s.base_url, s.kind, s.categories, s.locality,
         s.reliability, s.image_policy, s.republish_policy, s.status, s.logo_path, s.rec_pinned,
         s.rec_local_highlight, s.rec_excluded, s.last_fetched_at
  from sources s
  where s.status <> 'blocked';

-- Agregado não é republicado: título original, data, link, resumo só quando a política da fonte
-- permite e imagem só com permissão registrada (spec §4; CLAUDE.md regra 4).
create or replace view public_aggregated as
  select ci.id, ci.source_id, s.slug as source_slug, coalesce(s.display_name, s.name) as source_name,
         ci.canonical_url, ci.original_title, ci.published_at, ci.section_slug, ci.locality, ci.topic_id,
         case when s.republish_policy = 'summary_2_sentences' then ci.excerpt end as summary,
         case when s.image_policy <> 'none' then ci.image_url end as image_url,
         s.image_policy
  from collected_items ci
  join sources s on s.id = ci.source_id
  where ci.duplicate_of is null and s.status <> 'blocked';

revoke all on public_sources, public_aggregated from anon, authenticated;
grant select on public_sources, public_aggregated to anon, authenticated, service_role;

-- Tabelas que anon não usa diretamente: sem privilégio algum (além de RLS sem política).
revoke all on sources, collected_items, raw_items, ingest_runs from anon;
