-- P6 · tarefa 3 (Segurança): pendências de segurança dos gates do P5 e do PWA.
--
--  1. `pipeline_events`: leitura direta só para admin; quem vê o Control Center lê
--     `pipeline_events_view`, que mascara IP na mensagem, na referência e nos detalhes
--     (achado 10 do gate do P5, mesmo desenho de `audit_log_view`). `control_logs` e
--     `control_run_steps` (invoker) passam a ler a view, então a busca por texto de quem não é
--     admin também não enxerga IP.
--  2. PWA-16: três falhas 400/413 seguidas (sem nenhum envio aceito no meio) removem a
--     inscrição. Os outros 4xx continuam fora da regra dos 5 dias (spec §12.3).
--
-- Não redefine `studio_audit_actions()`, `app_setting_set` nem `guard_app_settings`.

-- ---------------------------------------------------------------------------
-- 1. pipeline_events com IP mascarado
-- ---------------------------------------------------------------------------
drop policy if exists pipeline_events_read_staff on public.pipeline_events;
drop policy if exists pipeline_events_read_admin on public.pipeline_events;
create policy pipeline_events_read_admin on public.pipeline_events for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'));

-- Mesmos papéis do Control Center (`control_can_view`); IP mascarado para quem não é admin.
-- Roda com os direitos do dono, por isso o filtro de papel fica dentro da view. Sem sessão de
-- pessoa (service role, migrations) vale o valor original, como a tabela.
create or replace view public.pipeline_events_view as
  with who as (
    select coalesce(auth.role(), 'authenticated') not in ('anon', 'authenticated') as system,
           public.has_role(auth.uid(), 'admin') as admin,
           public.control_can_view(auth.uid()) as can_view
  )
  select e.id, e.at, e.run_id, e.step,
         case when who.system or who.admin or e.item_ref is null then e.item_ref
              else public.mask_ips(e.item_ref) end as item_ref,
         e.level,
         case when who.system or who.admin then e.message else public.mask_ips(e.message) end as message,
         case when who.system or who.admin then e.details else public.mask_ips_jsonb(e.details) end as details
    from public.pipeline_events e, who
   where who.system or who.can_view;
revoke all on public.pipeline_events_view from public, anon;
grant select on public.pipeline_events_view to authenticated, service_role;

create or replace function public.control_run_steps(p_run_ids uuid[])
returns table (run_id uuid, step text, ok int, warn int, error int, security int, first_at timestamptz, last_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select e.run_id, e.step,
         count(*) filter (where e.level = 'info')::int,
         count(*) filter (where e.level = 'warn')::int,
         count(*) filter (where e.level = 'error')::int,
         count(*) filter (where e.level = 'security')::int,
         min(e.at), max(e.at)
  from pipeline_events_view e
  where e.run_id = any (p_run_ids)
  group by e.run_id, e.step
$$;

create or replace function public.control_logs(
  p_run uuid default null, p_item text default null, p_source text default null,
  p_steps text[] default null, p_level text default null, p_q text default null,
  p_before bigint default null, p_since timestamptz default null, p_limit int default 50
)
returns table (id bigint, at timestamptz, run_id uuid, step text, item_ref text, level text, message text, details jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  select e.id, e.at, e.run_id, e.step, e.item_ref, e.level, e.message, e.details
  from pipeline_events_view e
  where (p_run is null or e.run_id = p_run)
    and (p_item is null or e.item_ref = p_item or e.item_ref like p_item || '#%')
    and (p_source is null
         or e.item_ref = 'source:' || p_source
         or exists (select 1 from raw_items r join sources s on s.id = r.source_id
                    where s.slug = p_source and split_part(e.item_ref, '#', 1) = 'raw:' || r.id)
         or exists (select 1 from collected_items ci join sources s on s.id = ci.source_id
                    where s.slug = p_source and e.item_ref = 'item:' || ci.id))
    and (p_steps is null or e.step = any (p_steps))
    and (p_level is null or e.level = p_level)
    and (p_q is null or e.message ilike '%' || p_q || '%' or e.item_ref ilike '%' || p_q || '%'
         or e.details::text ilike '%' || p_q || '%')
    and (p_before is null or e.id < p_before)
    and (p_since is null or e.at >= p_since)
  order by e.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 1000))
$$;

-- ---------------------------------------------------------------------------
-- 2. PWA-16: falhas permanentes (400/413) seguidas removem a inscrição
-- ---------------------------------------------------------------------------
create or replace function public.push_delivery_result(
  p_delivery bigint, p_outcome text, p_http int default null, p_error text default null, p_retry_at timestamptz default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  d push_deliveries%rowtype;
  v_days int;
  v_perm int;
begin
  select * into d from push_deliveries where id = p_delivery for update;
  if not found then
    return;
  end if;
  if p_outcome = 'accepted' then
    update push_deliveries set status = 'sent', http_status = p_http, sent_at = now(), not_before = null where id = d.id;
    update push_sends set accepted_n = accepted_n + 1,
                          sent_measurable_n = sent_measurable_n + (case when d.measurable then 1 else 0 end)
     where id = d.send_id;
    update push_subscriptions set last_success_at = now(), consecutive_failures = 0 where id = d.subscription_id;
  elsif p_outcome = 'gone' then
    update push_deliveries set status = 'failed', http_status = p_http, error_code = 'gone', skip_reason = 'gone' where id = d.id;
    update push_sends set removed_n = removed_n + 1 where id = d.send_id;
    delete from push_subscriptions where id = d.subscription_id;
  elsif p_outcome = 'retry' then
    update push_deliveries set status = 'queued', attempts = attempts + 1, http_status = p_http,
                               error_code = left(p_error, 200), not_before = p_retry_at
     where id = d.id;
  elsif p_outcome = 'failed' then
    update push_deliveries set status = 'failed', http_status = p_http, error_code = left(p_error, 200) where id = d.id;
    update push_sends set failed_n = failed_n + 1 where id = d.send_id;
    if d.subscription_id is not null and coalesce(p_http, 0) in (400, 413) then
      -- Erro permanente da inscrição (chave, endpoint ou tamanho recusados): três seguidos,
      -- sem envio aceito entre eles, apagam a inscrição (PWA-16). Cada entrega é de um envio
      -- diferente, então são três tentativas distintas.
      select count(*) into v_perm
        from push_deliveries x
       where x.subscription_id = d.subscription_id and x.status = 'failed'
         and x.http_status in (400, 413)
         and x.created_at > (select coalesce(max(y.sent_at), '-infinity'::timestamptz) from push_deliveries y
                             where y.subscription_id = d.subscription_id and y.status = 'sent');
      if v_perm >= 3 then
        delete from push_subscriptions where id = d.subscription_id;
      end if;
    elsif d.subscription_id is not null and coalesce(p_http, 0) not between 400 and 499 then
      -- Cinco falhas seguidas (não 4xx) em dias diferentes apagam a inscrição (spec §12.3).
      update push_subscriptions set consecutive_failures = consecutive_failures + 1 where id = d.subscription_id;
      select count(distinct push_local_day(x.created_at)) into v_days
        from push_deliveries x
       where x.subscription_id = d.subscription_id and x.status = 'failed' and x.error_code is distinct from 'gone'
         and coalesce(x.http_status, 0) not between 400 and 499
         and x.created_at > (select coalesce(max(y.sent_at), '-infinity'::timestamptz) from push_deliveries y
                             where y.subscription_id = d.subscription_id and y.status = 'sent');
      if v_days >= 5 then
        delete from push_subscriptions where id = d.subscription_id;
      end if;
    end if;
  else
    raise exception 'resultado % desconhecido', p_outcome using errcode = '22023';
  end if;
end
$$;
