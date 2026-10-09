-- ARD-T5 (spec 2026-10-08-agenda-rica-e-distribuicao-design.md §6 e §8): a montagem semanal da
-- newsletter "Agenda do fim de semana" é escrita automática e fica na auditoria como
-- `system:agenda` / `newsletter.edition`. União com o que já existe (como na 0198 e na 0200);
-- `AGENDA_AUDIT_ACTIONS` em src/lib/audit/actions.ts espelha a lista.
do $$
declare
  merged text[];
begin
  select array(
    select distinct x from unnest(
      public.studio_audit_actions() || array['newsletter.edition']
    ) as x
  ) into merged;
  execute format(
    'create or replace function public.studio_audit_actions() returns text[] language sql immutable set search_path = public as $f$ select %L::text[] $f$',
    merged
  );
end
$$;
