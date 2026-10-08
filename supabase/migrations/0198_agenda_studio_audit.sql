-- AGM-T7 (spec 2026-10-08-agenda-coletor-multifonte-design.md §5.2): eventos da Agenda no
-- Estúdio. Cadastro, edição, retirada e devolução gravam `audit_log` com o diff; as quatro ações
-- entram na lista fechada de `studio_audit_actions()` (união com o que já existe, como na 0159).
-- `AGENDA_AUDIT_ACTIONS` em src/lib/audit/actions.ts espelha esta lista.
do $$
declare
  merged text[];
begin
  select array(
    select distinct x from unnest(
      public.studio_audit_actions()
        || array['event.create', 'event.update', 'event.withdraw', 'event.restore']
    ) as x
  ) into merged;
  execute format(
    'create or replace function public.studio_audit_actions() returns text[] language sql immutable set search_path = public as $f$ select %L::text[] $f$',
    merged
  );
end
$$;
