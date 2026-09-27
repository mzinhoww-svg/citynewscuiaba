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

-- media.approve: editor_chefe e revisor em tudo; editor só em mídia de matéria da editoria dele.
create or replace function public.can_approve_media(uid uuid, media uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role(uid, '{editor_chefe,revisor}')
    or exists (
      select 1
      from public.article_media am
      join public.articles a on a.id = am.article_id
      where am.media_id = can_approve_media.media and public.has_role(uid, 'editor', a.section_slug)
    )
$$;

-- Auxiliares revelam papéis e rascunhos: nada para anon/public (o Postgres e o Supabase concedem
-- EXECUTE por padrão). Políticas lidas por anon não chamam estas funções.
revoke execute on function public.has_role(uuid, app_role, text), public.is_staff(uuid), public.has_any_role(uuid, app_role[]),
  public.can_edit_section(uuid, text), public.article_section(uuid), public.article_is_public(uuid), public.article_owner(uuid),
  public.can_approve_media(uuid, uuid)
  from public, anon;
grant execute on function public.has_role(uuid, app_role, text), public.is_staff(uuid), public.has_any_role(uuid, app_role[]),
  public.can_edit_section(uuid, text), public.article_section(uuid), public.article_is_public(uuid), public.article_owner(uuid),
  public.can_approve_media(uuid, uuid)
  to authenticated, service_role;

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

-- Sem função auxiliar: anon não tem EXECUTE nelas; a subconsulta passa pela RLS de articles.
create policy article_versions_read_public on article_versions for select to anon, authenticated
  using (exists (select 1 from articles a where a.id = article_id and a.status in ('published', 'updated')));
create policy article_versions_read_staff on article_versions for select to authenticated using (is_staff((select auth.uid())));
create policy article_versions_insert on article_versions for insert to authenticated
  with check (
    can_edit_section((select auth.uid()), article_section(article_id))
    or (has_role((select auth.uid()), 'jornalista') and article_owner(article_id) = (select auth.uid()))
    or (has_role((select auth.uid()), 'revisor') and change_kind = 'correction')
  );

-- Sem função auxiliar: anon não tem EXECUTE nelas; a subconsulta passa pela RLS de articles.
create policy article_sources_read_public on article_sources for select to anon, authenticated
  using (exists (select 1 from articles a where a.id = article_id and a.status in ('published', 'updated')));
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
  using (can_approve_media((select auth.uid()), id)) with check (can_approve_media((select auth.uid()), id));

-- Sem função auxiliar: anon não tem EXECUTE nelas; a subconsulta passa pela RLS de articles.
create policy article_media_read_public on article_media for select to anon, authenticated
  using (exists (select 1 from articles a where a.id = article_id and a.status in ('published', 'updated')));
create policy article_media_read_staff on article_media for select to authenticated using (is_staff((select auth.uid())));
create policy article_media_write on article_media for all to authenticated
  using (can_edit_section((select auth.uid()), article_section(article_id)))
  with check (can_edit_section((select auth.uid()), article_section(article_id)));

-- Correções: público vê as publicadas; correction.manage = editor_chefe, editor (editoria), revisor.
create policy corrections_read_public on corrections for select to anon, authenticated using (published_at is not null);
create policy corrections_read_staff on corrections for select to authenticated using (is_staff((select auth.uid())));
-- Correção publicada é registro público: não se apaga nem se despublica (trigger guard_corrections).
create policy corrections_insert on corrections for insert to authenticated
  with check (can_edit_section((select auth.uid()), article_section(article_id)) or has_role((select auth.uid()), 'revisor'));
create policy corrections_update on corrections for update to authenticated
  using (can_edit_section((select auth.uid()), article_section(article_id)) or has_role((select auth.uid()), 'revisor'))
  with check (can_edit_section((select auth.uid()), article_section(article_id)) or has_role((select auth.uid()), 'revisor'));
create policy corrections_delete on corrections for delete to authenticated
  using (
    published_at is null
    and (can_edit_section((select auth.uid()), article_section(article_id)) or has_role((select auth.uid()), 'revisor'))
  );

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
-- Editores só mexem em coleções editoriais; coleção de leitor é só do dono.
create policy collections_write_editors on collections for all to authenticated
  using (is_editorial and has_any_role((select auth.uid()), '{editor_chefe,editor}'))
  with check (is_editorial and has_any_role((select auth.uid()), '{editor_chefe,editor}'));
create policy collections_write_owner on collections for all to authenticated
  using (not is_editorial and owner_ref = (select auth.uid())::text)
  with check (not is_editorial and owner_ref = (select auth.uid())::text);

create policy collection_items_read_public on collection_items for select to anon, authenticated
  using (exists (select 1 from collections c where c.id = collection_id and c.is_editorial));
create policy collection_items_read_owner on collection_items for select to authenticated
  using (exists (select 1 from collections c where c.id = collection_id and c.owner_ref = (select auth.uid())::text));
create policy collection_items_write_editors on collection_items for all to authenticated
  using (
    has_any_role((select auth.uid()), '{editor_chefe,editor}')
    and exists (select 1 from collections c where c.id = collection_id and c.is_editorial)
  )
  with check (
    has_any_role((select auth.uid()), '{editor_chefe,editor}')
    and exists (select 1 from collections c where c.id = collection_id and c.is_editorial)
  );
create policy collection_items_write_owner on collection_items for all to authenticated
  using (exists (select 1 from collections c where c.id = collection_id and not c.is_editorial and c.owner_ref = (select auth.uid())::text))
  with check (exists (select 1 from collections c where c.id = collection_id and not c.is_editorial and c.owner_ref = (select auth.uid())::text));

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
-- rules.approve: admin, editor_chefe. Aprovar, ativar e o que é imutável ficam no trigger
-- guard_rules (regra de duas pessoas, mais abaixo); a política só recorta o papel.
create policy rules_approve on rules for update to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe}'))
  with check (has_any_role((select auth.uid()), '{admin,editor_chefe}'));

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
-- prompt.publish: operador_ia cria (1ª assinatura); admin ou editor_chefe aprova (2ª). Trigger guard_ai_prompts.
create policy ai_prompts_propose on ai_prompts for insert to authenticated
  with check (
    has_role((select auth.uid()), 'operador_ia') and author_id = (select auth.uid())
    and approved_by = '{}' and status in ('draft', 'pending')
  );
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
  with check (has_any_role((select auth.uid()), '{admin,operador_ia}'));

create policy approvals_read_staff on approvals for select to authenticated using (is_staff((select auth.uid())));
create policy approvals_request on approvals for insert to authenticated
  with check (is_staff((select auth.uid())) and requested_by = (select auth.uid()) and approved_by is null and status = 'pending');
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

-- users.manage: só admin altera papéis. Conceder admin exige aprovação de duas pessoas (trigger guard_user_roles).
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

-- ---------------------------------------------------------------------------
-- Regra de duas pessoas imposta no banco (spec §8; architecture §6)
--
-- As políticas acima só recortam o papel; o que é mudança crítica fica nestes triggers, que
-- valem para qualquer caminho (Estúdio, API REST, SQL como authenticated):
-- - proposed_by / requested_by / author_id nascem iguais a auth.uid() e nunca mudam;
-- - aprovação só em nome próprio (approved_by = auth.uid()) e por pessoa diferente do proponente;
-- - linha aprovada ou ativa tem conteúdo imutável (mudança = nova versão); só linha aprovada ativa;
-- - conceder admin consome uma aprovação role.admin decidida por outra pessoa; ninguém se dá papel.
--
-- Os triggers são SECURITY INVOKER de propósito: current_user é o papel real da requisição.
-- anon e authenticated seguem as regras; postgres e service_role (migrations, seed, pipeline)
-- passam direto. Consultas que precisam furar a RLS ficam em funções SECURITY DEFINER.
-- ---------------------------------------------------------------------------

-- null para papéis de sistema; auth.uid() para anon/authenticated (sem uid, nada crítico muda).
create or replace function public.critical_actor()
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if current_user not in ('anon', 'authenticated') then
    return null;
  end if;
  if uid is null then
    raise exception 'mudança crítica exige usuário autenticado' using errcode = '42501';
  end if;
  return uid;
end
$$;

create or replace function public.two_person_error(msg text)
returns void
language plpgsql
set search_path = public
as $$
begin
  raise exception '%', msg using errcode = '42501', hint = 'Regra de duas pessoas (spec §8).';
end
$$;

-- rules e rec_weights: proposta versionada. tg_argv[0] = papéis que aprovam.
create or replace function public.guard_proposal()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid := public.critical_actor();
  approvers app_role[] := tg_argv[0]::app_role[];
  n jsonb;
  o jsonb;
  content_changed boolean;
begin
  if uid is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.proposed_by is distinct from uid then
      perform two_person_error(format('%s: proposed_by deve ser quem propõe', tg_table_name));
    end if;
    if new.approved_by is not null or new.active then
      perform two_person_error(format('%s: proposta nasce sem aprovação e inativa', tg_table_name));
    end if;
    return new;
  end if;

  n := to_jsonb(new);
  o := to_jsonb(old);
  if new.proposed_by is distinct from old.proposed_by or n -> 'version' is distinct from o -> 'version'
     or n -> 'created_at' is distinct from o -> 'created_at' then
    perform two_person_error(format('%s: versão, proponente e data são imutáveis', tg_table_name));
  end if;
  content_changed := (n - '{approved_by,active}'::text[]) is distinct from (o - '{approved_by,active}'::text[]);

  if old.approved_by is not null or old.active then
    if new.approved_by is distinct from old.approved_by then
      perform two_person_error(format('%s: aprovação registrada não muda', tg_table_name));
    end if;
    if content_changed then
      perform two_person_error(format('%s: versão aprovada ou ativa é imutável; proponha nova versão', tg_table_name));
    end if;
  elsif new.approved_by is not null then
    if new.approved_by <> uid then
      perform two_person_error(format('%s: aprovação só em nome próprio', tg_table_name));
    end if;
    if uid = old.proposed_by then
      perform two_person_error(format('%s: quem propõe não aprova', tg_table_name));
    end if;
    if not has_any_role(uid, approvers) then
      perform two_person_error(format('%s: papel sem permissão para aprovar', tg_table_name));
    end if;
    if content_changed then
      perform two_person_error(format('%s: aprovação não altera o conteúdo', tg_table_name));
    end if;
  elsif content_changed and uid <> old.proposed_by then
    perform two_person_error(format('%s: só quem propõe edita a proposta', tg_table_name));
  end if;

  if new.active and new.approved_by is null then
    perform two_person_error(format('%s: só versão aprovada pode ser ativada', tg_table_name));
  end if;
  return new;
end
$$;

create trigger rules_two_person before insert or update on rules
  for each row execute function public.guard_proposal('{admin,editor_chefe}');
create trigger rec_weights_two_person before insert or update on rec_weights
  for each row execute function public.guard_proposal('{admin,operador_ia}');

-- approvals: pedido imutável; decisão por outra pessoa, em nome próprio, e final.
create or replace function public.guard_approvals()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid := public.critical_actor();
begin
  if uid is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.requested_by is distinct from uid then
      perform two_person_error('approvals: requested_by deve ser quem pede');
    end if;
    if new.approved_by is not null or new.status <> 'pending' then
      perform two_person_error('approvals: pedido nasce pendente e sem aprovador');
    end if;
    return new;
  end if;

  if (to_jsonb(new) - '{approved_by,status}'::text[]) is distinct from (to_jsonb(old) - '{approved_by,status}'::text[]) then
    perform two_person_error('approvals: pedido é imutável (tipo, alvo, solicitante, justificativa)');
  end if;
  if new.status is not distinct from old.status and new.approved_by is not distinct from old.approved_by then
    return new;
  end if;
  if old.status <> 'pending' then
    perform two_person_error('approvals: decisão já tomada é final');
  end if;
  if new.status not in ('approved', 'rejected') then
    perform two_person_error('approvals: decisão é approved ou rejected');
  end if;
  if new.approved_by is distinct from uid then
    perform two_person_error('approvals: decisão só em nome próprio');
  end if;
  if uid = old.requested_by then
    perform two_person_error('approvals: quem pede não decide');
  end if;
  return new;
end
$$;

create trigger approvals_two_person before insert or update on approvals
  for each row execute function public.guard_approvals();

-- ai_prompts (prompt.publish): autor é a 1ª assinatura; admin ou editor_chefe acrescenta a 2ª.
create or replace function public.guard_ai_prompts()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid := public.critical_actor();
  expected uuid[];
begin
  if uid is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.author_id is distinct from uid then
      perform two_person_error('ai_prompts: author_id deve ser quem escreve');
    end if;
    if cardinality(new.approved_by) > 0 or new.status not in ('draft', 'pending') then
      perform two_person_error('ai_prompts: prompt nasce sem aprovação, em rascunho ou pendente');
    end if;
    return new;
  end if;

  if new.id <> old.id or new.agent_id <> old.agent_id or new.version <> old.version
     or new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
    perform two_person_error('ai_prompts: agente, versão, autor e data são imutáveis');
  end if;

  if new.body is distinct from old.body or new.rationale is distinct from old.rationale then
    if cardinality(old.approved_by) > 0 or old.status in ('production', 'archived', 'reverted') then
      perform two_person_error('ai_prompts: prompt aprovado é imutável; crie nova versão');
    end if;
    if uid <> old.author_id then
      perform two_person_error('ai_prompts: só o autor edita o rascunho');
    end if;
  end if;

  if new.approved_by is distinct from old.approved_by then
    select coalesce(array_agg(distinct x order by x), '{}') into expected from unnest(old.approved_by || uid) as x;
    if uid = any (old.approved_by) or uid = old.author_id
       or (select coalesce(array_agg(x order by x), '{}') from unnest(new.approved_by) as x) is distinct from expected then
      perform two_person_error('ai_prompts: aprovador só acrescenta a própria assinatura, nunca a do autor');
    end if;
    if not has_any_role(uid, '{admin,editor_chefe}') then
      perform two_person_error('ai_prompts: 2ª assinatura é de admin ou editor_chefe');
    end if;
  end if;

  if new.status = 'production' and old.status is distinct from 'production'
     and not exists (select 1 from unnest(new.approved_by) as a where a <> new.author_id) then
    perform two_person_error('ai_prompts: produção exige assinatura de outra pessoa');
  end if;
  return new;
end
$$;

create trigger ai_prompts_two_person before insert or update on ai_prompts
  for each row execute function public.guard_ai_prompts();

-- Consome uma aprovação role.admin para o alvo (uso único). Só dentro do trigger de user_roles.
create or replace function public.consume_role_admin_approval(target uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hit uuid;
begin
  if pg_trigger_depth() = 0 or not public.has_role(auth.uid(), 'admin') then
    return false;
  end if;
  select a.id into hit
  from public.approvals a
  where a.kind = 'role.admin' and a.target_ref = target::text and a.status = 'approved'
    and a.approved_by is not null and a.approved_by <> a.requested_by
  order by a.created_at
  limit 1
  for update;
  if hit is null then
    return false;
  end if;
  update public.approvals set status = 'applied' where id = hit;
  return true;
end
$$;

-- users.manage: ninguém se dá papel; admin só com aprovação de duas pessoas.
create or replace function public.guard_user_roles()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid := public.critical_actor();
begin
  if uid is null then
    return new;
  end if;
  if new.user_id = uid then
    perform two_person_error('user_roles: ninguém concede ou altera o próprio papel');
  end if;
  if new.role = 'admin'
     and (tg_op = 'INSERT' or old.role <> 'admin' or old.user_id <> new.user_id)
     and not public.consume_role_admin_approval(new.user_id) then
    perform two_person_error('user_roles: conceder admin exige aprovação role.admin decidida por outra pessoa');
  end if;
  return new;
end
$$;

create trigger user_roles_two_person before insert or update on user_roles
  for each row execute function public.guard_user_roles();

-- Correção publicada não volta a rascunho (e, sem published_at, poderia ser apagada).
create or replace function public.guard_corrections()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') and old.published_at is not null and new.published_at is null then
    raise exception 'corrections: correção publicada não é despublicada' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger corrections_keep_published before update on corrections
  for each row execute function public.guard_corrections();

revoke execute on function public.critical_actor(), public.two_person_error(text), public.guard_proposal(),
  public.guard_approvals(), public.guard_ai_prompts(), public.guard_user_roles(), public.guard_corrections(),
  public.consume_role_admin_approval(uuid)
  from public, anon;
grant execute on function public.critical_actor(), public.two_person_error(text), public.consume_role_admin_approval(uuid)
  to authenticated, service_role;
