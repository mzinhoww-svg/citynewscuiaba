select 'parte 3 de 10' as inicio;
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
  if not found or v_article.status not in ('published', 'updated') then
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
  perform public.push_policy_dispatch(v_id);
  return v_id;
end
$$;
select 'parte 3 de 10 ok' as fim;
