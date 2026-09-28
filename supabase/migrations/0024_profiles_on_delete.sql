-- Gate do P4, achado 5: FKs do P4 para profiles sem regra de on delete impediam para sempre a
-- exclusão (LGPD) de quem saiu da equipe. `set null`: o registro editorial público (correção,
-- denúncia respondida, sugestão decidida, evento) fica; a responsabilização continua em
-- audit_log.actor e article_versions.author_id (sem FK, imutáveis). user_roles segue NO ACTION
-- de propósito: conta com papel nunca é excluída (purge_deleted_accounts pula).
--
-- field_origins guarda só ids (quem editou ou aceitou); o nome é resolvido na leitura, e quem
-- foi excluído aparece como "Ex-integrante da redação". Esta migration tira os nomes gravados
-- antes (P4) das matérias e dos snapshots de versão, e a exclusão apaga o id da pessoa.

alter table articles drop constraint if exists articles_assignee_id_fkey,
  add constraint articles_assignee_id_fkey foreign key (assignee_id) references profiles(id) on delete set null;
alter table article_suggestions drop constraint if exists article_suggestions_decided_by_fkey,
  add constraint article_suggestions_decided_by_fkey foreign key (decided_by) references profiles(id) on delete set null;
alter table corrections drop constraint if exists corrections_handled_by_fkey,
  add constraint corrections_handled_by_fkey foreign key (handled_by) references profiles(id) on delete set null;
alter table event_submissions drop constraint if exists event_submissions_decided_by_fkey,
  add constraint event_submissions_decided_by_fkey foreign key (decided_by) references profiles(id) on delete set null;
alter table reports drop constraint if exists reports_responded_by_fkey,
  add constraint reports_responded_by_fkey foreign key (responded_by) references profiles(id) on delete set null;

-- Origem por campo sem nomes; `p_person` (opcional) também perde o id.
create or replace function public.scrub_field_origins(p jsonb, p_person text default null)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(k,
           case when jsonb_typeof(v) <> 'object' then v
                when p_person is not null and (v->>'editedBy' = p_person or v->>'acceptedBy' = p_person)
                  then v - 'editedByName' - 'acceptedByName' - 'editedBy' - 'acceptedBy'
                else v - 'editedByName' - 'acceptedByName' end), '{}'::jsonb)
  from jsonb_each(coalesce(p, '{}'::jsonb)) e(k, v)
$$;
revoke execute on function public.scrub_field_origins(jsonb, text) from public, anon, authenticated;

update articles set field_origins = scrub_field_origins(field_origins)
 where field_origins::text like '%ByName%';
update article_versions set snapshot = jsonb_set(snapshot, '{fieldOrigins}', scrub_field_origins(snapshot->'fieldOrigins'))
 where snapshot ? 'fieldOrigins' and (snapshot->'fieldOrigins')::text like '%ByName%';

create or replace function purge_deleted_accounts(p_days int default 7)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n bigint := 0;
  v_email text;
begin
  for r in
    select p.id
      from profiles p
     where p.delete_requested_at is not null
       and p.delete_requested_at < now() - make_interval(days => greatest(p_days, 1))
       and not exists (select 1 from user_roles ur where ur.user_id = p.id)
  loop
    begin
      select u.email into v_email from auth.users u where u.id = r.id;
      delete from follows where owner_ref = r.id::text;
      delete from saved_items where owner_ref = r.id::text;
      delete from alerts where owner_ref = r.id::text;
      delete from collections where owner_ref = r.id::text and not is_editorial;
      perform purge_email_data(v_email);
      update events set user_id = null where user_id = r.id;
      -- Ex-integrante da equipe: some da origem por campo (a tela mostra "Ex-integrante").
      update articles set field_origins = scrub_field_origins(field_origins, r.id::text)
       where field_origins::text like '%' || r.id::text || '%';
      delete from profiles where id = r.id;
      delete from auth.users where id = r.id;
      insert into audit_log (actor, action, object_ref, details)
      values ('system', 'account.deleted', 'profile:' || r.id::text,
              jsonb_build_object('after_days', p_days));
      n := n + 1;
    exception when others then
      -- Sem o texto do erro nem o e-mail no log: só o código, para investigar sem expor dados.
      insert into audit_log (actor, action, object_ref, details)
      values ('system', 'account.delete_failed', 'profile:' || r.id::text,
              jsonb_build_object('sqlstate', sqlstate));
    end;
  end loop;
  return n;
end $$;

revoke all on function purge_deleted_accounts(int) from public, anon, authenticated;
grant execute on function purge_deleted_accounts(int) to service_role;
