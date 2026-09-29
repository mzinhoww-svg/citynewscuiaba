-- P5-T4/FS-T9 · Ativar ou retomar uma fonte zera as falhas seguidas.
--
-- Achado do e2e do painel: depois da pausa automática (3 falhas seguidas, `auto_failures`), "Retomar"
-- testa a conexão e ativa, mas `sources.consecutive_failures` ficava em 3 e a primeira falha seguinte
-- pausava a fonte de novo. O domínio (`transition`, src/lib/sources/status.ts) já zera na ativação;
-- esta migration alinha o banco. Redefine só `source_admin_status_apply` (0011), igual à original
-- exceto por `consecutive_failures = 0` em `activate`. Vale para a ação individual e para o lote.
create or replace function public.source_admin_status_apply(p_id uuid, p_action text, p_reason text)
returns void
language plpgsql
set search_path = public
as $$
declare
  why text := nullif(btrim(coalesce(p_reason, '')), '');
  reasons constant text[] := array['pending_activation', 'manual', 'auto_failures', 'robots', 'opt_out', 'legal', 'quality', 'other'];
begin
  if p_action = 'activate' then
    update sources set status = 'active', status_reason = null, consecutive_failures = 0 where id = p_id;
  elsif p_action = 'pause' then
    why := coalesce(why, 'manual');
    if why <> all (reasons) then raise exception 'motivo de estado inválido: %', why using errcode = '22023'; end if;
    update sources set status = 'paused', status_reason = why where id = p_id;
  elsif p_action = 'block' then
    if why is null or why <> all (reasons) then
      raise exception 'Informe o motivo do bloqueio.' using errcode = '22023';
    end if;
    update sources set status = 'blocked', status_reason = why,
           image_policy = case when why = 'opt_out' then 'none' else image_policy end
     where id = p_id;
  elsif p_action = 'unblock' then
    update sources set status = 'paused', status_reason = 'manual' where id = p_id;
  elsif p_action = 'archive' then
    if why is null then raise exception 'Informe o motivo do arquivamento.' using errcode = '22023'; end if;
    update sources set archived_at = now(), archived_by = auth.uid(), archive_reason = why where id = p_id;
  elsif p_action = 'restore' then
    update sources set archived_at = null, archived_by = null, archive_reason = null where id = p_id;
  else
    raise exception 'ação de estado desconhecida: %', p_action using errcode = '22023';
  end if;
end $$;

-- Permissões como na 0011 (create or replace mantém os grants; repetidos por segurança).
revoke execute on function public.source_admin_status_apply(uuid, text, text) from public, anon;
grant execute on function public.source_admin_status_apply(uuid, text, text) to authenticated, service_role;
