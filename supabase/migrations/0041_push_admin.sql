-- PWA e notificações (spec 2026-09-28 §10, §11, D-P14, D-P19; plano PW-T5, G1, G17).
-- Pedidos de push (Urgente, Destaque), regra de duas pessoas imposta no banco, pausa e retomada,
-- configurações `push.*` em `app_settings`, permissões (`push_can`) e auditoria.
--
-- Ordem: `app_settings` (existe desde 0011; aqui só sementes e validações) → `push_can` →
-- `guard_push_approvals` → `guard_push_sends` → RLS de `push_sends` → RPCs `security invoker`
-- → helpers `security definer` mínimos (auditoria e retomada) → `app_setting_set` por prefixo →
-- `studio_audit_actions()`.
--
-- Duas pessoas: `approvals` continua sob `guard_approvals` (0002/0033: quem pede não decide,
-- decisão só em nome próprio e final) e a RLS `approvals_decide` (admin/editor-chefe). Este
-- arquivo acrescenta `guard_push_approvals` (quem pode pedir cada kind; aprovador com
-- `push.approve`) e `guard_push_sends` (transições e imutabilidade do pedido). `postgres` e
-- `service_role` (pipeline) ficam fora das regras de papel, mas não da imutabilidade.

-- ---------------------------------------------------------------------------
-- 1. app_settings: sementes e validações `push.*`
-- ---------------------------------------------------------------------------
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into app_settings (key, value) values
  ('push.default_daily_limit', '3'),
  ('push.quiet_start', '22'),
  ('push.quiet_end', '7'),
  ('push.templates', '[]'),
  ('push.paused', '{"on": false, "by": null, "at": null, "reason": null}')
on conflict (key) do nothing;

create or replace function public.guard_app_settings()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  t jsonb;
  n int;
  v_txt text;
begin
  if new.key = 'sources.default_frequency_minutes' then
    if jsonb_typeof(new.value) <> 'number'
       or (new.value)::text::numeric <> floor((new.value)::text::numeric)
       or (new.value)::text::int not between 30 and 1440
       or (new.value)::text::int % 30 <> 0 then
      raise exception 'sources.default_frequency_minutes deve ser múltiplo de 30 entre 30 e 1440' using errcode = '23514';
    end if;
  elsif new.key = 'sources.fast_lane_max' then
    if jsonb_typeof(new.value) <> 'number'
       or (new.value)::text::numeric <> floor((new.value)::text::numeric)
       or (new.value)::text::int not between 0 and 20 then
      raise exception 'sources.fast_lane_max deve ser um inteiro entre 0 e 20' using errcode = '23514';
    end if;
  elsif new.key = 'push.default_daily_limit' then
    if jsonb_typeof(new.value) <> 'number' or (new.value)::text::numeric not in (1, 2, 3) then
      raise exception 'push.default_daily_limit deve ser 1, 2 ou 3' using errcode = '23514';
    end if;
  elsif new.key = 'push.quiet_start' then
    if jsonb_typeof(new.value) <> 'number' or (new.value)::text::numeric <> floor((new.value)::text::numeric)
       or (new.value)::text::int not between 18 and 22 then
      raise exception 'push.quiet_start deve ser uma hora entre 18 e 22 (o silêncio sempre contém 22h–7h)' using errcode = '23514';
    end if;
  elsif new.key = 'push.quiet_end' then
    if jsonb_typeof(new.value) <> 'number' or (new.value)::text::numeric <> floor((new.value)::text::numeric)
       or (new.value)::text::int not between 7 and 10 then
      raise exception 'push.quiet_end deve ser uma hora entre 7 e 10 (o silêncio sempre contém 22h–7h)' using errcode = '23514';
    end if;
  elsif new.key = 'push.templates' then
    if jsonb_typeof(new.value) <> 'array' or jsonb_array_length(new.value) > 20 then
      raise exception 'push.templates deve ser uma lista com até 20 modelos' using errcode = '23514';
    end if;
    for t in select * from jsonb_array_elements(new.value) loop
      if jsonb_typeof(t) <> 'object'
         or coalesce(length(t->>'name'), 0) not between 1 and 60
         or coalesce(length(t->>'title'), 0) not between 1 and 60
         or coalesce(length(t->>'body'), 0) not between 1 and 120 then
        raise exception 'modelo de push precisa de nome (≤ 60), título (≤ 60) e texto (≤ 120)' using errcode = '23514';
      end if;
      v_txt := replace(replace((t->>'title') || ' ' || (t->>'body'), '{titulo}', ''), '{linha_fina}', '');
      if v_txt like '%{%' or v_txt like '%}%' then
        raise exception 'modelo de push só aceita {titulo} e {linha_fina}' using errcode = '23514';
      end if;
    end loop;
  elsif new.key = 'push.paused' then
    if jsonb_typeof(new.value) <> 'object' or jsonb_typeof(new.value->'on') <> 'boolean' then
      raise exception 'push.paused deve ser um objeto com "on" booleano' using errcode = '23514';
    end if;
  end if;
  n := 0;
  return new;
end
$$;

drop policy if exists app_settings_read_push on app_settings;
create policy app_settings_read_push on app_settings for select to authenticated
  using (key like 'push.%' and has_any_role((select auth.uid()), '{admin,editor_chefe,editor,analista}'));

-- `push_request` (security invoker) lê o silêncio padrão: a leitura das configurações passa a
-- `security definer` (só devolve um inteiro) e fica executável por pessoa logada.
alter function public.push_settings_int(text, int) security definer;
grant execute on function public.push_settings_int(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Permissões (spec §10.1; espelho de src/lib/auth/permissions.ts)
-- ---------------------------------------------------------------------------
create or replace function public.push_can(p_uid uuid, p_action text, p_section text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_uid is null then
    return false;
  end if;
  if p_action = 'push.request' then
    if has_any_role(p_uid, '{admin,editor_chefe}') then
      return true;
    end if;
    return p_section is not null and exists (
      select 1 from user_roles ur where ur.user_id = p_uid and ur.role = 'editor' and p_section = any (ur.sections)
    );
  elsif p_action in ('push.approve', 'push.settings') then
    return has_any_role(p_uid, '{admin,editor_chefe}');
  elsif p_action = 'push.metrics' then
    return has_any_role(p_uid, '{admin,editor_chefe,analista}');
  end if;
  return false;
end
$$;
revoke execute on function public.push_can(uuid, text, text) from public, anon;
grant execute on function public.push_can(uuid, text, text) to authenticated, service_role;

-- Auditoria a partir de RPCs `security invoker` (a pessoa comum não insere em audit_log).
create or replace function public.push_audit(p_action text, p_object text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_action not like 'push.%' then
    raise exception 'ação % fora do push', p_action using errcode = '22023';
  end if;
  insert into audit_log (actor, action, object_ref, details)
  values (coalesce(auth.uid()::text, 'sistema'), p_action, p_object, coalesce(p_details, '{}'::jsonb));
end
$$;
revoke execute on function public.push_audit(text, text, jsonb) from public, anon;
grant execute on function public.push_audit(text, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. guard_push_approvals: quem pode pedir cada kind e quem pode aprovar (D-P14)
-- ---------------------------------------------------------------------------
create or replace function public.guard_push_approvals()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid := public.critical_actor();
  v_send push_sends%rowtype;
  v_section text;
begin
  if new.kind not like 'push.%' then
    return new;
  end if;
  if new.kind not in ('push.urgent', 'push.highlight', 'push.resume') then
    raise exception 'tipo de aprovação % desconhecido', new.kind using errcode = '22023';
  end if;
  if uid is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.kind = 'push.resume' then
      if not push_can(uid, 'push.settings') then
        perform two_person_error('push: retomar envios exige push.settings');
      end if;
      return new;
    end if;
    if new.target_ref not like 'push:%' then
      perform two_person_error('push: alvo da aprovação deve ser push:<id>');
    end if;
    select * into v_send from push_sends where id = substr(new.target_ref, 6)::uuid;
    if not found then
      perform two_person_error('push: envio do pedido não existe');
    end if;
    if v_send.requested_by is distinct from uid then
      perform two_person_error('push: só quem pediu o envio abre a aprovação');
    end if;
    if new.kind = 'push.urgent' then
      if v_send.kind <> 'urgent' or not has_any_role(uid, '{admin,editor_chefe}') then
        perform two_person_error('push: urgente só por admin ou editor-chefe');
      end if;
    else
      select section_slug into v_section from articles where id = v_send.article_id;
      if v_send.kind <> 'highlight' or not push_can(uid, 'push.request', v_section) then
        perform two_person_error('push: Destaque só de matéria da própria editoria');
      end if;
    end if;
    return new;
  end if;
  -- Decisão: quem aprova precisa de push.approve (quem pede não decide já vem de guard_approvals).
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    if not push_can(uid, 'push.approve') then
      raise exception 'A aprovação precisa ser de quem tem permissão de aprovar avisos.'
        using errcode = '42501', hint = 'Regra de duas pessoas (spec §8).';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists approvals_push_guard on approvals;
create trigger approvals_push_guard before insert or update on approvals
  for each row execute function public.guard_push_approvals();

-- ---------------------------------------------------------------------------
-- 4. guard_push_sends: transições, imutabilidade e papel (spec §11.2)
-- ---------------------------------------------------------------------------
create or replace function public.push_transition_ok(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select case p_from
    when 'pending_approval' then p_to in ('queued','scheduled','rejected','cancelled','expired')
    when 'queued' then p_to in ('dispatching','paused','cancelled','expired')
    when 'scheduled' then p_to in ('queued','dispatching','paused','cancelled','expired')
    when 'dispatching' then p_to in ('sent','paused','cancelled')
    when 'paused' then p_to in ('queued','dispatching','expired','cancelled')
    else false
  end;
$$;

create or replace function public.guard_push_sends()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid := public.critical_actor();
  v_article articles%rowtype;
  a approvals%rowtype;
  n jsonb;
  o jsonb;
  v_frozen text[] := '{title,body,audience,article_id,kind,scheduled_at,requested_by,created_at,justification,origin_label,url,tag}';
  v_person text[] := '{status,status_reason,approval_id,approved_at,approved_by,version}';
  k text;
begin
  if tg_op = 'INSERT' then
    if new.kind = 'follow' then
      if uid is not null then
        perform two_person_error('push: envio automático nasce só pelo sistema');
      end if;
      return new;
    end if;
    if uid is null then
      return new;
    end if;
    if new.status <> 'pending_approval' or new.requested_by is distinct from uid then
      perform two_person_error('push: pedido nasce pendente e em nome de quem pede');
    end if;
    if new.approved_by is not null or new.approved_at is not null or new.started_at is not null then
      perform two_person_error('push: pedido nasce sem aprovação');
    end if;
    select * into v_article from articles where id = new.article_id;
    if not found or v_article.status <> 'published' then
      raise exception 'Só matéria publicada pode virar aviso.' using errcode = '23514';
    end if;
    if v_article.sponsored then
      raise exception 'Matéria patrocinada não vira aviso.' using errcode = '23514';
    end if;
    if new.kind = 'urgent' then
      if not has_any_role(uid, '{admin,editor_chefe}') then
        raise exception 'Urgente só por admin ou editor-chefe.' using errcode = '42501';
      end if;
      if new.scheduled_at is not null then
        raise exception 'Urgente só sai agora.' using errcode = '23514';
      end if;
      if coalesce(length(trim(new.justification)), 0) = 0 then
        raise exception 'Justificativa obrigatória para urgente.' using errcode = '23514';
      end if;
    elsif not push_can(uid, 'push.request', v_article.section_slug) then
      raise exception 'Destaque só de matéria da própria editoria.' using errcode = '42501';
    end if;
    return new;
  end if;

  n := to_jsonb(new);
  o := to_jsonb(old);
  foreach k in array v_frozen loop
    if n -> k is distinct from o -> k then
      raise exception 'push: texto, público, matéria e horário são imutáveis depois do pedido (%)', k using errcode = '42501';
    end if;
  end loop;
  if new.status is distinct from old.status and not push_transition_ok(old.status, new.status) then
    raise exception 'push: transição % → % inválida', old.status, new.status using errcode = '42501';
  end if;
  new.version := old.version + (case when new.status is distinct from old.status then 1 else 0 end);
  if uid is null then
    return new;
  end if;

  -- Pessoa comum: só campos de decisão; contadores, lotes e horários são do serviço.
  for k in select key from jsonb_each(n) loop
    if k <> all (v_frozen) and k <> all (v_person) and n -> k is distinct from o -> k then
      raise exception 'push: campo % só muda pelo serviço', k using errcode = '42501';
    end if;
  end loop;
  if new.approval_id is distinct from old.approval_id then
    if old.approval_id is not null or old.requested_by is distinct from uid then
      perform two_person_error('push: a aprovação do pedido é ligada uma vez, por quem pediu');
    end if;
  end if;
  if new.status is distinct from old.status then
    if new.status in ('queued', 'scheduled', 'rejected') then
      select * into a from approvals where target_ref = 'push:' || old.id::text order by created_at desc limit 1;
      if not found or a.approved_by is distinct from uid or a.approved_by = a.requested_by
         or a.status <> (case when new.status = 'rejected' then 'rejected' else 'approved' end)
         or not push_can(uid, 'push.approve') then
        perform two_person_error('push: decisão exige a aprovação registrada por outra pessoa com push.approve');
      end if;
      if new.status <> 'rejected' then
        new.approved_by := a.approved_by;
        new.approved_at := coalesce(a.decided_at, now());
      end if;
    elsif new.status = 'cancelled' then
      if old.requested_by is distinct from uid and not push_can(uid, 'push.settings') then
        perform two_person_error('push: cancelar só por quem pediu ou por push.settings');
      end if;
    else
      perform two_person_error(format('push: estado %s só pelo serviço', new.status));
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists push_sends_guard on push_sends;
create trigger push_sends_guard before insert or update on push_sends
  for each row execute function public.guard_push_sends();

-- ---------------------------------------------------------------------------
-- 5. Auditoria (spec §11.5): object_ref = 'push:<id>'
-- ---------------------------------------------------------------------------
create or replace function public.audit_push_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    if new.kind = 'follow' then
      return new;
    end if;
    v_action := 'push.request';
  elsif new.status is distinct from old.status then
    v_action := case
      when old.status = 'pending_approval' and new.status in ('queued', 'scheduled') then 'push.approve'
      when new.status = 'rejected' then 'push.reject'
      when new.status = 'cancelled' then 'push.cancel'
      when new.status = 'dispatching' and old.status <> 'paused' then 'push.dispatch'
      when new.status = 'sent' then 'push.finish'
      when new.status = 'paused' then 'push.pause'
      when old.status = 'paused' then 'push.resume_applied'
      when new.status = 'expired' then 'push.expire'
      else null
    end;
  end if;
  if v_action is null then
    return new;
  end if;
  insert into audit_log (actor, action, object_ref, details)
  values (coalesce(auth.uid()::text, 'sistema'), v_action, 'push:' || new.id::text,
          jsonb_build_object('kind', new.kind, 'from', case when tg_op = 'UPDATE' then old.status end,
                             'to', new.status, 'reason', new.status_reason, 'articleId', new.article_id));
  return new;
end
$$;
drop trigger if exists push_sends_audit on push_sends;
create trigger push_sends_audit after insert or update on push_sends
  for each row execute function public.audit_push_changes();

-- ---------------------------------------------------------------------------
-- 6. RLS de push_sends: leitura para push.approve/push.settings; editor vê os próprios e os da
-- editoria da matéria; escrita da pessoa só pelos caminhos guardados acima.
-- ---------------------------------------------------------------------------
grant select, insert, update on push_sends to authenticated;
create policy push_sends_read on push_sends for select to authenticated
  using (
    push_can((select auth.uid()), 'push.approve')
    or push_can((select auth.uid()), 'push.settings')
    or requested_by = (select auth.uid())
    or exists (
      select 1 from articles a join user_roles ur on ur.user_id = (select auth.uid()) and ur.role = 'editor'
      where a.id = push_sends.article_id and a.section_slug = any (ur.sections)
    )
  );
create policy push_sends_request on push_sends for insert to authenticated
  with check (status = 'pending_approval' and requested_by = (select auth.uid()) and kind in ('urgent', 'highlight'));
create policy push_sends_decide on push_sends for update to authenticated
  using (
    push_can((select auth.uid()), 'push.approve')
    or push_can((select auth.uid()), 'push.settings')
    or requested_by = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 7. RPCs `security invoker` (RLS e triggers valem)
-- ---------------------------------------------------------------------------
create or replace function public.push_request(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_kind text := p->>'kind';
  v_article articles%rowtype;
  v_when jsonb := coalesce(p->'when', '{"type":"now"}'::jsonb);
  v_at timestamptz;
  v_hour int;
  v_audience jsonb := coalesce(p->'audience', '{"type":"all"}'::jsonb);
  v_id uuid;
  v_appr uuid;
  v_label text;
begin
  if uid is null then
    raise exception 'sessão necessária' using errcode = '42501';
  end if;
  if v_kind not in ('urgent', 'highlight') then
    raise exception 'Tipo de envio inválido.' using errcode = '22023';
  end if;
  select * into v_article from articles where id = (p->>'articleId')::uuid;
  if not found or v_article.status <> 'published' then
    raise exception 'Só matéria publicada pode virar aviso.' using errcode = '23514';
  end if;
  if v_article.sponsored then
    raise exception 'Matéria patrocinada não vira aviso.' using errcode = '23514';
  end if;
  if v_audience->>'type' not in ('all', 'section', 'bairro') then
    raise exception 'Público inválido.' using errcode = '22023';
  end if;
  if v_when->>'type' = 'at' then
    if v_kind = 'urgent' then
      raise exception 'Urgente só sai agora.' using errcode = '23514';
    end if;
    v_at := (v_when->>'at')::timestamptz;
    if v_at < now() then
      raise exception 'O horário já passou.' using errcode = '23514';
    end if;
    if v_at > now() + interval '7 days' then
      raise exception 'Agende no máximo 7 dias à frente.' using errcode = '23514';
    end if;
    v_hour := extract(hour from (v_at at time zone 'America/Cuiaba'));
    if v_hour >= push_settings_int('push.quiet_start', 22) or v_hour < push_settings_int('push.quiet_end', 7) then
      raise exception 'Fora do silêncio: escolha um horário entre 7h e 22h.' using errcode = '23514';
    end if;
  elsif v_when->>'type' <> 'now' then
    raise exception 'Horário inválido.' using errcode = '22023';
  end if;
  v_label := case
    when v_article.publish_mode = 'auto' then 'PUBLICADO AUTOMATICAMENTE'
    when v_article.kind = 'normalized' then 'NORMALIZADO PELO CITYNEWS'
    else 'ORIGINAL CITYNEWS' end;

  insert into push_sends (kind, article_id, title, body, origin_label, url, tag, audience, status, requested_by,
                          justification, scheduled_at)
  values (v_kind, v_article.id, left(p->>'title', 60), left(p->>'body', 120), v_label,
          '/materia/' || v_article.slug, replace(v_article.id::text, '-', ''), v_audience, 'pending_approval', uid,
          nullif(trim(coalesce(p->>'justification', '')), ''), v_at)
  returning id into v_id;

  insert into approvals (kind, target_ref, requested_by, justification)
  values ('push.' || v_kind, 'push:' || v_id::text, uid,
          coalesce(nullif(trim(coalesce(p->>'justification', '')), ''), 'Destaque da redação: ' || left(p->>'title', 60)))
  returning id into v_appr;
  update push_sends set approval_id = v_appr where id = v_id;
  return v_id;
end
$$;

create or replace function public.push_approve(p_send uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  s push_sends%rowtype;
  v_rows int;
  v_next text;
begin
  select * into s from push_sends where id = p_send;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  if s.status <> 'pending_approval' then
    raise exception 'decisão já tomada: o pedido está %', s.status using errcode = '42501';
  end if;
  update approvals set status = 'approved', approved_by = uid
   where target_ref = 'push:' || p_send::text and status = 'pending';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    if exists (select 1 from approvals where target_ref = 'push:' || p_send::text and status <> 'pending') then
      raise exception 'decisão já tomada' using errcode = '42501';
    end if;
    raise exception 'A aprovação precisa ser de quem tem permissão de aprovar avisos.' using errcode = '42501';
  end if;
  v_next := case when s.scheduled_at is null then 'queued' else 'scheduled' end;
  update push_sends set status = v_next where id = p_send;
  return v_next;
end
$$;

create or replace function public.push_reject(p_send uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  s push_sends%rowtype;
  v_rows int;
begin
  if coalesce(length(trim(p_reason)), 0) = 0 then
    raise exception 'Informe o motivo.' using errcode = '22023';
  end if;
  select * into s from push_sends where id = p_send;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  if s.status <> 'pending_approval' then
    raise exception 'decisão já tomada: o pedido está %', s.status using errcode = '42501';
  end if;
  update approvals set status = 'rejected', approved_by = uid
   where target_ref = 'push:' || p_send::text and status = 'pending';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    if exists (select 1 from approvals where target_ref = 'push:' || p_send::text and status <> 'pending') then
      raise exception 'decisão já tomada' using errcode = '42501';
    end if;
    raise exception 'A aprovação precisa ser de quem tem permissão de aprovar avisos.' using errcode = '42501';
  end if;
  update push_sends set status = 'rejected', status_reason = left(trim(p_reason), 300) where id = p_send;
end
$$;

create or replace function public.push_cancel(p_send uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rows int;
begin
  if coalesce(length(trim(p_reason)), 0) = 0 then
    raise exception 'Informe o motivo.' using errcode = '22023';
  end if;
  update push_sends set status = 'cancelled', status_reason = left(trim(p_reason), 300)
   where id = p_send and status in ('pending_approval', 'queued', 'scheduled', 'dispatching', 'paused');
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Pedido não encontrado ou já encerrado.' using errcode = 'P0002';
  end if;
end
$$;

-- Pausa de contingência: vale na hora, sem segunda pessoa (spec §10.5). `security definer`
-- porque `app_settings` e os envios pausados não são escritos por pessoa comum.
create or replace function public.push_settings_pause(p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if not push_can(uid, 'push.settings') then
    raise exception 'sem permissão para pausar envios (push.settings)' using errcode = '42501';
  end if;
  if coalesce(length(trim(p_reason)), 0) = 0 then
    raise exception 'Informe o motivo.' using errcode = '22023';
  end if;
  insert into app_settings (key, value, updated_by, updated_at)
  values ('push.paused', jsonb_build_object('on', true, 'by', uid, 'at', now(), 'reason', left(trim(p_reason), 300)), uid, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  update push_sends set status = 'paused', status_reason = 'Envios pausados: ' || left(trim(p_reason), 200)
   where status in ('queued', 'scheduled', 'dispatching');
  update push_batches set status = 'paused' where status = 'queued';
  insert into audit_log (actor, action, object_ref, details)
  values (uid::text, 'push.pause', 'push:settings', jsonb_build_object('reason', left(trim(p_reason), 300)));
end
$$;

create or replace function public.push_resume_request(p_reason text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
begin
  if coalesce(length(trim(p_reason)), 0) = 0 then
    raise exception 'Informe o motivo.' using errcode = '22023';
  end if;
  if not push_can(uid, 'push.settings') then
    raise exception 'sem permissão para retomar envios (push.settings)' using errcode = '42501';
  end if;
  insert into approvals (kind, target_ref, requested_by, justification)
  values ('push.resume', 'push-resume:' || gen_random_uuid()::text, uid, left(trim(p_reason), 300))
  returning id into v_id;
  perform push_audit('push.resume_requested', 'push:settings', jsonb_build_object('approvalId', v_id, 'reason', left(trim(p_reason), 300)));
  return v_id;
end
$$;

-- Aplica a retomada depois da aprovação (definer: escreve app_settings e envios pausados), mas
-- só com a aprovação decidida por outra pessoa com push.approve, e a marca `applied`.
create or replace function public.push_resume_apply(p_approval uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a approvals%rowtype;
begin
  select * into a from approvals where id = p_approval for update;
  if not found or a.kind <> 'push.resume' or a.status <> 'approved' or a.approved_by is distinct from uid
     or a.approved_by = a.requested_by or not push_can(a.approved_by, 'push.approve') then
    raise exception 'retomada exige aprovação de outra pessoa com push.approve' using errcode = '42501';
  end if;
  update approvals set status = 'applied' where id = a.id;
  insert into app_settings (key, value, updated_by, updated_at)
  values ('push.paused', jsonb_build_object('on', false, 'by', uid, 'at', now(), 'reason', null), uid, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  update push_sends set status = 'expired', status_reason = 'Agendamento vencido durante a pausa'
   where status = 'paused' and scheduled_at is not null and scheduled_at < now() - interval '1 hour';
  update push_sends set status = 'queued', status_reason = null where status = 'paused';
  update push_batches set status = 'queued' where status = 'paused';
  insert into audit_log (actor, action, object_ref, details)
  values (uid::text, 'push.resume_applied', 'push:settings', jsonb_build_object('approvalId', a.id, 'reason', a.justification));
end
$$;

create or replace function public.push_resume_approve(p_approval uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_rows int;
begin
  update approvals set status = 'approved', approved_by = uid where id = p_approval and status = 'pending';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    if exists (select 1 from approvals where id = p_approval and status <> 'pending') then
      raise exception 'decisão já tomada' using errcode = '42501';
    end if;
    raise exception 'A aprovação precisa ser de quem tem permissão de aprovar avisos.' using errcode = '42501';
  end if;
  perform push_resume_apply(p_approval);
end
$$;

-- Expiração (D-P19, §10.3): urgente pendente > 60 min; Destaque pendente até a hora agendada
-- ou 24 h depois do pedido. Só o serviço (cron/drain).
create or replace function public.push_expire_requests(p_now timestamptz default now())
returns int
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  with gone as (
    update push_sends set status = 'expired', status_reason = 'Sem aprovação a tempo'
     where status = 'pending_approval'
       and ((kind = 'urgent' and created_at < p_now - interval '60 minutes')
         or (kind = 'highlight' and coalesce(scheduled_at, created_at + interval '24 hours') < p_now))
    returning 1)
  select count(*) into n from gone;
  return n;
end
$$;

-- Alcance estimado (D-P24): arredondado para dezenas; abaixo de 20 devolve 0 ("menos de 20").
create or replace function public.push_audience_estimate(p_kind text, p_audience jsonb)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n int;
  v_target text;
begin
  if not push_can(auth.uid(), 'push.request')
     and not exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role = 'editor') then
    raise exception 'sem permissão (push.request)' using errcode = '42501';
  end if;
  v_target := case p_audience->>'type'
    when 'section' then 'section:' || (p_audience->>'slug')
    when 'bairro' then 'bairro:' || (p_audience->>'slug')
    else null end;
  select count(*) into n from push_subscriptions s
   where (case p_kind when 'urgent' then s.want_urgent when 'highlight' then s.want_highlight else s.want_follow end)
     and (v_target is null or s.targets @> array[v_target]);
  if n < 20 then
    return 0;
  end if;
  return (n / 10) * 10;
end
$$;

revoke execute on function
  public.push_request(jsonb), public.push_approve(uuid), public.push_reject(uuid, text), public.push_cancel(uuid, text),
  public.push_settings_pause(text), public.push_resume_request(text), public.push_resume_apply(uuid),
  public.push_resume_approve(uuid), public.push_expire_requests(timestamptz), public.push_audience_estimate(text, jsonb),
  public.push_transition_ok(text, text)
  from public, anon;
grant execute on function
  public.push_request(jsonb), public.push_approve(uuid), public.push_reject(uuid, text), public.push_cancel(uuid, text),
  public.push_settings_pause(text), public.push_resume_request(text), public.push_resume_apply(uuid),
  public.push_resume_approve(uuid), public.push_audience_estimate(text, jsonb), public.push_transition_ok(text, text)
  to authenticated, service_role;
grant execute on function public.push_expire_requests(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 8. app_setting_set por prefixo (G17): sources.* → papéis de source.manage; push.* → push.settings;
-- push.paused só por pausar/retomar.
-- ---------------------------------------------------------------------------
create or replace function public.app_setting_set(
  p_key text, p_value jsonb, p_ctx jsonb default '{}'::jsonb, p_ip_hash text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_person boolean := coalesce(auth.role(), 'authenticated') in ('anon', 'authenticated');
begin
  if p_key = 'push.paused' then
    raise exception 'push.paused só muda por pausar/retomar envios' using errcode = '22023';
  end if;
  if p_key in ('sources.default_frequency_minutes', 'sources.fast_lane_max') then
    if v_person and not has_any_role(auth.uid(), '{admin,editor_chefe,operador_ia}') then
      raise exception 'sem permissão para gerenciar fontes (source.manage)' using errcode = '42501';
    end if;
  elsif p_key in ('push.default_daily_limit', 'push.quiet_start', 'push.quiet_end', 'push.templates') then
    if v_person and not push_can(auth.uid(), 'push.settings') then
      raise exception 'sem permissão para configurar avisos (push.settings)' using errcode = '42501';
    end if;
  else
    raise exception 'chave % não suportada', p_key using errcode = '22023';
  end if;
  select value into v_old from app_settings where key = p_key;
  insert into app_settings (key, value, updated_by, updated_at)
  values (p_key, p_value, auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  insert into audit_log (actor, action, object_ref, details, ip_hash)
  values (coalesce(auth.uid()::text, 'sistema'), 'settings.update', 'setting:' || p_key,
          jsonb_build_object('from', v_old, 'to', p_value, 'reason', coalesce(p_ctx, '{}'::jsonb)->>'reason'),
          p_ip_hash);
end
$$;

-- ---------------------------------------------------------------------------
-- 9. Ações auditadas: união da 0034 com as do push (src/lib/audit/actions.ts)
-- ---------------------------------------------------------------------------
create or replace function public.studio_audit_actions()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    -- permissões (ACTIONS)
    'article.edit', 'article.publish', 'article.unpublish_auto', 'correction.manage', 'media.approve',
    'source.manage', 'source.approve_critical', 'rules.propose', 'rules.approve', 'prompt.publish',
    'rec.weights', 'reports.moderate', 'users.manage', 'metrics.view', 'audit.view',
    'push.request', 'push.approve', 'push.settings', 'push.metrics',
    -- Estúdio (P4)
    'article.assign', 'article.reject', 'article.reprocess', 'article.request_changes', 'article.request_review',
    'article.save', 'article.sources', 'article.suggestion.accept', 'article.suggestion.reject', 'article.update',
    'correction.open', 'correction.publish', 'event.approve', 'event.reject', 'media.block', 'media.generate',
    'media.license.block', 'media.license.renew', 'media.replace', 'media.takedown.request', 'report.respond',
    'media.image_text',
    -- Painel de fontes (0033)
    'source.create', 'source.update', 'source.status', 'source.archive', 'source.restore',
    'source.analyze', 'source.test', 'source.collect_now', 'source.takedown_failed',
    'source.approval_requested', 'source.approval_rejected', 'source.approval_applied',
    'settings.update',
    -- Control Center (P5-T3) e governança da IA (P5-T6)
    'pipeline.run_now', 'pipeline.reprocess', 'pipeline.quarantine.discard', 'logs.export',
    'ai.eval.run', 'ai.eval.case',
    -- Push (0041: trigger audit_push_changes, pausa e retomada)
    'push.reject', 'push.cancel', 'push.dispatch', 'push.finish', 'push.pause', 'push.expire',
    'push.resume_requested', 'push.resume_applied'
  ]::text[]
$$;
