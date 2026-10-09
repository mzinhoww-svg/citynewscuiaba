-- ARD-T6 (spec 2026-10-08-agenda-rica-e-distribuicao-design.md §7 e §8): pacote "Agenda da
-- semana" do Instagram.
--   error        motivo da última montagem que falhou (render ou upload); o Estúdio mostra e o
--                pacote fica `draft` (nada é publicado sozinho).
--   excluded     ids de eventos que a redação tirou do pacote ("Tirar do pacote"); a montagem
--                seguinte (job ou "Regerar") pula esses eventos e completa com os próximos.
--   generated_at quando os PNGs e a legenda foram montados pela última vez.
-- Ações novas na auditoria (união com o que já existe, como na 0198/0200/0206; espelho em
-- `AGENDA_AUDIT_ACTIONS`): `social.build` (montagem automática, `system:agenda`) e
-- `social.regenerate` (montagem pedida no Estúdio).
alter table social_packages
  add column if not exists error text,
  add column if not exists excluded jsonb not null default '[]'::jsonb,
  add column if not exists generated_at timestamptz;

do $$
declare
  merged text[];
begin
  select array(
    select distinct x from unnest(
      public.studio_audit_actions() || array['social.build', 'social.regenerate']
    ) as x
  ) into merged;
  execute format(
    'create or replace function public.studio_audit_actions() returns text[] language sql immutable set search_path = public as $f$ select %L::text[] $f$',
    merged
  );
end
$$;
