-- LOGO-T1 (R27): logotipos reais das fontes.
--   * `logo_source` ('manual' | 'auto') protege o logotipo enviado ou removido por uma pessoa;
--   * `logo_origin_url` registra de onde veio o automático (uso legal: só identifica a fonte);
--   * `source_logo_checks` guarda a última tentativa por fonte (intervalo de 7 dias, renovação de
--     30), sem mexer na versão otimista de `sources`;
--   * `source_logo_auto_set` grava o logotipo automático (só service_role) e nunca pisa em `manual`;
--   * pg_cron chama `POST /api/ingest/source-logos` toda segunda, de hora em hora (a rota
--     processa poucas fontes por chamada e é idempotente).
-- Só adiciona. Remover logotipo a pedido da fonte = apagar `logo_path` pelo Painel
-- (vira `manual` e a busca automática não volta).

alter table sources
  add column if not exists logo_source text check (logo_source in ('manual', 'auto')),
  add column if not exists logo_origin_url text;

-- Logotipo que já existe foi enviado por uma pessoa.
update sources set logo_source = 'manual' where logo_path is not null and logo_source is null;

create table if not exists source_logo_checks (
  source_id uuid primary key references sources(id),
  checked_at timestamptz not null default now(),
  found_at timestamptz,
  outcome text not null check (outcome in ('found', 'none', 'robots', 'unreachable', 'error')),
  detail text
);
alter table source_logo_checks enable row level security;
revoke all on source_logo_checks from anon, authenticated;
grant select, insert, update on source_logo_checks to service_role;

-- Qualquer mudança de `logo_path` que não venha de `source_logo_auto_set` é de uma pessoa.
create or replace function public.sources_logo_origin()
returns trigger language plpgsql as $$
begin
  if new.logo_path is distinct from old.logo_path then
    if coalesce(current_setting('citynews.logo_auto', true), '') = '1' then
      new.logo_source := 'auto';
    else
      new.logo_source := 'manual';
      new.logo_origin_url := null;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.sources_logo_origin() from public, anon, authenticated;

do $t$ begin
  if not exists (select from pg_trigger where tgname = 'sources_logo_origin' and tgrelid = 'public.sources'::regclass) then
    create trigger sources_logo_origin before update of logo_path on sources
      for each row execute function public.sources_logo_origin();
  end if;
end $t$;

create or replace function public.source_logo_auto_set(p_id uuid, p_path text, p_origin text)
returns text language plpgsql security definer set search_path = public as $$
declare v_source text;
begin
  select logo_source into v_source from sources where id = p_id for update;
  if not found then return 'not_found'; end if;
  if v_source = 'manual' then return 'manual'; end if;
  perform set_config('citynews.logo_auto', '1', true);
  perform set_config('citynews.audit_ctx', jsonb_build_object('reason', 'logo automático')::text, true);
  update sources set logo_path = p_path, logo_origin_url = p_origin where id = p_id;
  return 'saved';
end $$;
revoke execute on function public.source_logo_auto_set(uuid, text, text) from public, anon, authenticated;
grant execute on function public.source_logo_auto_set(uuid, text, text) to service_role;

-- pg_cron: segunda-feira, de hora em hora (mesmo molde de `schedule_agenda_cron`, 0053; sem pg_cron,
-- pg_net ou Vault o roteiro manual do relatório docs/reports/logos-fontes.md cobre).
create or replace function public.schedule_source_logos_cron()
returns text language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  if not exists (select from pg_extension where extname = 'pg_cron') then
    return 'sem pg_cron: nada agendado';
  end if;
  if not exists (select from pg_extension where extname = 'pg_net') then
    return 'sem pg_net: nada agendado';
  end if;
  if not exists (select from pg_namespace where nspname = 'vault') then
    return 'sem Vault: nada agendado';
  end if;
  execute $q$select count(distinct name)::int from vault.decrypted_secrets where name in ('app_url', 'cron_secret')$q$
    into n;
  if n < 2 then
    return 'segredos app_url e cron_secret ausentes no Vault: nada agendado';
  end if;
  execute format('select cron.schedule(%L, %L, %L)', 'source-logos', '41 * * * 1', $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/ingest/source-logos',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 58000)
  $cmd$);
  return 'agendado: source-logos';
end $fn$;
revoke execute on function public.schedule_source_logos_cron() from public, anon, authenticated, service_role;

select public.schedule_source_logos_cron();
