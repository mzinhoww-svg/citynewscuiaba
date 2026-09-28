-- P4-T6 · Correções e direito de resposta pelo Estúdio (docs/screens.md E08; Review Focus 3).
--
-- 1. Fila de correções: prazo (24 h), solicitante, vínculo com a denúncia do leitor, campos
--    corrigidos, quem tratou e quantas pessoas foram avisadas.
-- 2. reader_notifications: aviso para quem salvou a matéria (conta logada; dados só locais do
--    leitor anônimo ficam no navegador e não recebem aviso).
-- 3. studio_publish_correction: publica a correção de uma vez (versão "correction" com nota
--    pública, matéria "updated", correção publicada e avisos). Security definer porque o
--    revisor (correction.manage) corrige sem ter UPDATE em articles; a checagem de papel e a
--    versão base ficam aqui dentro.

alter table corrections
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists due_at timestamptz not null default now() + interval '24 hours',
  add column if not exists report_id uuid references reports(id) on delete set null,
  add column if not exists fields text[] not null default '{}',
  add column if not exists notified int not null default 0,
  add column if not exists handled_by uuid references profiles(id);
create index if not exists corrections_open_idx on corrections (due_at) where published_at is null;

create table if not exists reader_notifications (
  id uuid primary key default gen_random_uuid(),
  owner_ref text not null,
  kind text not null check (kind in ('correction', 'right_of_reply', 'update')),
  content_ref text not null,
  title text not null check (length(title) <= 300),
  body text not null check (length(body) <= 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists reader_notifications_owner_idx on reader_notifications (owner_ref, created_at desc);
alter table reader_notifications enable row level security;
revoke all on reader_notifications from anon;
revoke insert, delete, truncate on reader_notifications from authenticated;
create policy reader_notifications_owner_read on reader_notifications for select to authenticated
  using (owner_ref = (select auth.uid())::text);
create policy reader_notifications_owner_update on reader_notifications for update to authenticated
  using (owner_ref = (select auth.uid())::text) with check (owner_ref = (select auth.uid())::text);

create or replace function public.studio_publish_correction(
  p_correction uuid,
  p_base int,
  p_patch jsonb,
  p_note text,
  p_notify boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c corrections%rowtype;
  a articles%rowtype;
  cur int;
  snap jsonb;
  changed text[] := '{}';
  n int := 0;
begin
  if uid is null then
    raise exception 'studio_publish_correction: exige usuário autenticado' using errcode = '42501';
  end if;
  select * into c from corrections where id = p_correction for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into a from articles where id = c.article_id for update;
  if not (public.can_edit_section(uid, a.section_slug) or public.has_role(uid, 'revisor')) then
    raise exception 'studio_publish_correction: sem permissão' using errcode = '42501';
  end if;
  if c.published_at is not null then
    return jsonb_build_object('status', 'already_published');
  end if;
  if a.status not in ('published', 'updated') then
    return jsonb_build_object('status', 'not_public');
  end if;
  if coalesce(trim(p_note), '') = '' then
    return jsonb_build_object('status', 'note_required');
  end if;
  select coalesce(max(v.number), 0) into cur from article_versions v where v.article_id = a.id;
  if cur <> p_base then
    select v.snapshot into snap from article_versions v where v.article_id = a.id and v.number = cur;
    return jsonb_build_object('status', 'conflict', 'version', cur, 'snapshot', coalesce(snap, '{}'::jsonb));
  end if;

  if p_patch ? 'title' and p_patch->>'title' is distinct from a.title then changed := array_append(changed, 'title'); end if;
  if p_patch ? 'dek' and p_patch->>'dek' is distinct from a.dek then changed := array_append(changed, 'dek'); end if;
  if p_patch ? 'body' and p_patch->'body' is distinct from a.body then changed := array_append(changed, 'body'); end if;

  update articles set
    title = coalesce(p_patch->>'title', title),
    dek = coalesce(p_patch->>'dek', dek),
    body = coalesce(p_patch->'body', body),
    status = 'updated',
    updated_at = now()
  where id = a.id
  returning * into a;

  insert into article_versions (article_id, number, snapshot, origin, author_id, change_kind, public_note)
  values (a.id, cur + 1, jsonb_build_object('title', a.title, 'dek', a.dek, 'body', a.body),
          'human', uid, 'correction', trim(p_note));

  if p_notify then
    insert into reader_notifications (owner_ref, kind, content_ref, title, body)
    select distinct s.owner_ref,
           case when c.kind = 'right_of_reply' then 'right_of_reply' else 'correction' end,
           'article:' || a.id,
           left(a.title, 300),
           left(trim(p_note), 2000)
    from saved_items s
    where s.content_ref = 'article:' || a.id;
    get diagnostics n = row_count;
  end if;

  update corrections set
    public_note = trim(p_note),
    status = 'published',
    published_at = now(),
    fields = changed,
    notified = n,
    handled_by = uid
  where id = c.id;

  insert into audit_log (actor, action, object_ref, details)
  values (uid::text, 'correction.publish.db', 'article:' || a.id,
          jsonb_build_object('correction', c.id, 'version', cur + 1, 'fields', to_jsonb(changed), 'notified', n));

  return jsonb_build_object('status', 'ok', 'version', cur + 1, 'notified', n, 'fields', to_jsonb(changed),
                            'slug', a.slug, 'topicId', a.topic_id, 'section', a.section_slug);
end
$$;
revoke execute on function public.studio_publish_correction(uuid, int, jsonb, text, boolean) from public, anon;
grant execute on function public.studio_publish_correction(uuid, int, jsonb, text, boolean) to authenticated, service_role;
