-- P5-T10 · Contingência (docs/screens.md A15).
--
-- 1. feature_flags fica com a lista fechada de chaves (check) e todas as chaves existem, para que
--    a tela de contingência sempre encontre a linha (só UPDATE: RLS 0002 limita a admin).
-- 2. studio_audit_actions() ganha `flag.set` (união com a lista vigente; `.denied` já é aceito).

insert into feature_flags (key, enabled) values
  ('auto_publish', false),
  ('read_only', false),
  ('ai_enabled', true),
  ('personalization_enabled', true),
  ('image_reproduction_enabled', true),
  ('source_link_analysis', true),
  ('sponsored_enabled', false)
on conflict (key) do nothing;

alter table feature_flags drop constraint if exists feature_flags_key_closed;
alter table feature_flags add constraint feature_flags_key_closed check (key in (
  'auto_publish', 'read_only', 'ai_enabled', 'personalization_enabled',
  'image_reproduction_enabled', 'source_link_analysis', 'sponsored_enabled'
));

do $$
declare
  merged text[];
begin
  select array(
    select distinct x from unnest(
      public.studio_audit_actions() || array['flag.set']::text[]
    ) as x order by x
  ) into merged;
  execute format(
    'create or replace function public.studio_audit_actions() returns text[] language sql immutable set search_path = public as $f$ select %L::text[] $f$',
    merged
  );
end
$$;
