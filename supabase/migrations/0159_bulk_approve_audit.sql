-- UX-W3-T1 (item 46): "Aprovar recomendadas" da fila do Estúdio grava o lote na auditoria como
-- `article.bulk_approve` (cada matéria continua com a sua linha `article.publish`). Ação nova na
-- lista fechada de `studio_audit_actions()` (união com o que já existe, como na 0156).
do $$
declare
  merged text[];
begin
  select array(
    select distinct x from unnest(
      public.studio_audit_actions() || array['article.bulk_approve']
    ) as x
  ) into merged;
  execute format(
    'create or replace function public.studio_audit_actions() returns text[] language sql immutable set search_path = public as $f$ select %L::text[] $f$',
    merged
  );
end
$$;
