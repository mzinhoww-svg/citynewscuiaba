-- Segurança P1 · correções da auditoria (docs/security-audit/issues.md).
-- Spec: docs/superpowers/specs/2026-10-04-seguranca-p1-design.md
--
-- Aditiva e idempotente. Cada achado tem uma seção `-- C1-xx` própria.

-- C1-01 · Anônimos leem versões de matérias só pela view pública.
-- A política `article_versions_read_public` liberava a tabela inteira (snapshot, origin, author_id)
-- a anon e authenticated. O histórico público passa só por `public_article_versions` (roda com os
-- direitos do dono). A equipe segue lendo pela política `article_versions_read_staff`.
drop policy if exists article_versions_read_public on article_versions;

-- C1-03 · `push_audit` só para quem gere push e com detalhes limitados.
-- A função é `security definer` e estava liberada a qualquer pessoa logada: dava para gravar linhas
-- `push.*` falsas em audit_log. Agora exige `push_can(auth.uid(), 'push.settings')` (admin e
-- editor_chefe; service_role não tem auth.uid() e continua barrado aqui, o pipeline grava direto) e
-- recusa detalhes acima de 2 KB. Ordem: papel (42501), prefixo (22023), tamanho (22023).
-- Mesma assinatura, então `create or replace` mantém o único chamador, `push_resume_request`.
create or replace function public.push_audit(p_action text, p_object text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not push_can(auth.uid(), 'push.settings') then
    raise exception 'sem permissão para auditar o push (push.settings)' using errcode = '42501';
  end if;
  if p_action not like 'push.%' then
    raise exception 'ação % fora do push', p_action using errcode = '22023';
  end if;
  if octet_length(coalesce(p_details, '{}'::jsonb)::text) > 2048 then
    raise exception 'detalhes acima de 2 KB' using errcode = '22023';
  end if;
  insert into audit_log (actor, action, object_ref, details)
  values (coalesce(auth.uid()::text, 'sistema'), p_action, p_object, coalesce(p_details, '{}'::jsonb));
end
$$;
revoke execute on function public.push_audit(text, text, jsonb) from public, anon;
grant execute on function public.push_audit(text, text, jsonb) to authenticated, service_role;

-- C1-02 · Exportação e expurgo por e-mail exigem prova de posse do e-mail.
-- Com a auto-confirmação (sem "Confirm email"), `email_confirmed_at` vem preenchido para qualquer
-- e-mail digitado no cadastro: a conta lia (exportação) ou apagava (expurgo) newsletter, alertas
-- `email:` e a fila `reader_emails` de outra pessoa. Prova de posse = e-mail confirmado E
-- (confirmação enviada por link, `confirmation_sent_at`, ou provedor OAuth da allowlist, que
-- verifica o e-mail; hoje só `google`, B-006). É allowlist, não negação: 'anonymous', 'phone',
-- 'sso:*' e provedores futuros não provam posse até serem incluídos de propósito aqui.
-- No GoTrue, `admin.createUser({ email_confirm: true })` e o cadastro auto-confirmado deixam
-- `confirmation_sent_at` nulo; o cadastro com link o preenche (verificado no Supabase local).
create or replace function public.email_ownership_proven(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select u.email_confirmed_at is not null
       and (u.confirmation_sent_at is not null
            or coalesce(u.raw_app_meta_data->>'provider', 'email') in ('google'))
      from auth.users u
     where u.id = p_uid), false)
$$;

revoke all on function public.email_ownership_proven(uuid) from public, anon, authenticated;
grant execute on function public.email_ownership_proven(uuid) to service_role;

-- Mesma versão de 0021, só com o predicado de posse no lugar de `email_confirmed_at is not null`.
-- Sem prova devolve null, que a tela já trata. Roda como dono, então chama o predicado revogado.
create or replace function export_email_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e text;
begin
  select lower(u.email) into e from auth.users u
   where u.id = (select auth.uid()) and email_ownership_proven(u.id);
  if e is null then return null; end if;
  return jsonb_build_object(
    'newsletter', coalesce((select jsonb_agg(jsonb_build_object(
        'list', s.list, 'confirmed_at', s.confirmed_at, 'unsubscribed_at', s.unsubscribed_at)
        order by s.list)
      from newsletter_subscriptions s where lower(s.email) = e), '[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object(
        'target_kind', a.target_kind, 'target_id', a.target_id, 'frequency', a.frequency,
        'channel', a.channel, 'active', a.active, 'created_at', a.created_at)
        order by a.created_at)
      from alerts a where a.owner_ref = 'email:' || e), '[]'::jsonb),
    'emails', coalesce((select jsonb_agg(jsonb_build_object(
        'kind', m.kind, 'subject', m.subject, 'status', m.status, 'created_at', m.created_at,
        'sent_at', m.sent_at)
        order by m.created_at)
      from reader_emails m where lower(m.to_email) = e), '[]'::jsonb)
  );
end $$;

revoke all on function export_email_data() from public, anon;
grant execute on function export_email_data() to authenticated;

-- Mesma versão de 0024; o dado do e-mail só é apagado com prova de posse. A conta, o perfil e o
-- que é guardado pelo id continuam sendo apagados sempre.
create or replace function purge_deleted_accounts(p_days int default 7)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n bigint := 0;
  v_email text;
begin
  for r in
    select p.id
      from profiles p
     where p.delete_requested_at is not null
       and p.delete_requested_at < now() - make_interval(days => greatest(p_days, 1))
       and not exists (select 1 from user_roles ur where ur.user_id = p.id)
  loop
    begin
      select u.email into v_email from auth.users u where u.id = r.id;
      delete from follows where owner_ref = r.id::text;
      delete from saved_items where owner_ref = r.id::text;
      delete from alerts where owner_ref = r.id::text;
      delete from collections where owner_ref = r.id::text and not is_editorial;
      if email_ownership_proven(r.id) then
        perform purge_email_data(v_email);
      end if;
      update events set user_id = null where user_id = r.id;
      -- Ex-integrante da equipe: some da origem por campo (a tela mostra "Ex-integrante").
      update articles set field_origins = scrub_field_origins(field_origins, r.id::text)
       where field_origins::text like '%' || r.id::text || '%';
      delete from profiles where id = r.id;
      delete from auth.users where id = r.id;
      insert into audit_log (actor, action, object_ref, details)
      values ('system', 'account.deleted', 'profile:' || r.id::text,
              jsonb_build_object('after_days', p_days));
      n := n + 1;
    exception when others then
      -- Sem o texto do erro nem o e-mail no log: só o código, para investigar sem expor dados.
      insert into audit_log (actor, action, object_ref, details)
      values ('system', 'account.delete_failed', 'profile:' || r.id::text,
              jsonb_build_object('sqlstate', sqlstate));
    end;
  end loop;
  return n;
end $$;

revoke all on function purge_deleted_accounts(int) from public, anon, authenticated;
grant execute on function purge_deleted_accounts(int) to service_role;
