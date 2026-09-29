-- Recomendação: testes A/B, campanhas de descoberta e leituras do painel (P5-T7; A-190 a A-199).
--
-- * rec_experiments: teste A/B. Cada variante aponta para uma versão de `rec_weights` (a que
--   seria servida) e a divisão é uma lista que soma 1. A variante do leitor sai de
--   `assignVariant(anonId, { id, split })` (src/lib/ranking/experiments.ts), sem gravar nada por
--   leitor: as métricas por variante são calculadas na leitura, com o mesmo sorteio.
-- * rec_campaigns: campanha de descoberta (fontes, período, cota, público). Só registro e medição;
--   o ranking ainda não a lê (limite registrado em A-190).
-- * rec_variant_events / rec_panel_stats: leituras agregadas dos eventos, SECURITY INVOKER (a RLS de
--   `events` valendo: só quem tem `metrics.view`).
-- Quem escreve: admin e operador_ia (o mesmo par que propõe pesos, `rec.weights`).

-- CHECK não aceita subconsulta: a soma da divisão vai numa função imutável.
create or replace function public.rec_split_ok(p_split numeric[])
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select array_length(p_split, 1) between 2 and 6
     and (select coalesce(sum(s), 0) from unnest(p_split) s) between 0.999 and 1.001
     and (select coalesce(min(s), 0) from unnest(p_split) s) > 0
$$;

create table rec_experiments (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null check (length(btrim(name)) between 3 and 120),
  hypothesis text check (hypothesis is null or length(hypothesis) <= 500),
  variants jsonb not null check (
    jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) between 2 and 6
  ),
  split numeric[] not null check (public.rec_split_ok(split)),
  status text not null default 'draft' check (status in ('draft', 'running', 'ended')),
  winner int check (winner is null or winner >= 0),
  starts_at timestamptz,
  ended_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  check (jsonb_array_length(variants) = array_length(split, 1)),
  check (status <> 'ended' or ended_at is not null),
  check (winner is null or status = 'ended')
);

create table rec_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 3 and 120),
  source_slugs text[] not null check (array_length(source_slugs, 1) between 1 and 10),
  starts_on date not null,
  ends_on date not null,
  quota_pct int not null check (quota_pct between 1 and 20),
  audience text not null default 'todos' check (audience in ('todos', 'anonimos', 'contas')),
  ended_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 90)
);

alter table rec_experiments enable row level security;
alter table rec_campaigns enable row level security;

create policy rec_experiments_read_staff on rec_experiments for select to authenticated
  using (is_staff((select auth.uid())));
create policy rec_experiments_insert on rec_experiments for insert to authenticated
  with check (
    has_any_role((select auth.uid()), '{admin,operador_ia}')
    and created_by = (select auth.uid()) and status = 'draft'
  );
create policy rec_experiments_update on rec_experiments for update to authenticated
  using (has_any_role((select auth.uid()), '{admin,operador_ia}'))
  with check (has_any_role((select auth.uid()), '{admin,operador_ia}'));

create policy rec_campaigns_read_staff on rec_campaigns for select to authenticated
  using (is_staff((select auth.uid())));
create policy rec_campaigns_insert on rec_campaigns for insert to authenticated
  with check (
    has_any_role((select auth.uid()), '{admin,operador_ia}') and created_by = (select auth.uid())
  );
create policy rec_campaigns_update on rec_campaigns for update to authenticated
  using (has_any_role((select auth.uid()), '{admin,operador_ia}'))
  with check (has_any_role((select auth.uid()), '{admin,operador_ia}'));

-- Depois de rodar, a divisão, as variantes e o id não mudam (só status, datas e vencedora).
create or replace function public.rec_experiments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'rec_experiments: id, autor e data são imutáveis' using errcode = '42501';
  end if;
  if old.status <> 'draft'
     and (new.variants is distinct from old.variants or new.split is distinct from old.split) then
    raise exception 'rec_experiments: variantes e divisão não mudam depois de iniciar' using errcode = '42501';
  end if;
  if old.status = 'ended' and new.status <> 'ended' then
    raise exception 'rec_experiments: experimento encerrado não reabre' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger rec_experiments_guard before update on rec_experiments
  for each row execute function public.rec_experiments_guard();

-- Eventos de recomendação por leitor pseudonimizado (anon_id) e fonte, na janela. Só linhas com
-- anon_id: sem consentimento de personalização o evento nem traz o id.
create or replace function public.rec_variant_events(p_from timestamptz, p_to timestamptz)
returns table (
  anon_id uuid,
  source_slug text,
  viewed int,
  clicked int,
  dismissed int,
  first_at timestamptz,
  last_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select e.anon_id, e.source_slug,
         (count(*) filter (where e.name = 'source_viewed'))::int,
         (count(*) filter (where e.name = 'recommendation_clicked'))::int,
         (count(*) filter (where e.name = 'recommendation_dismissed'))::int,
         min(e.received_at), max(e.received_at)
    from events e
   where e.anon_id is not null
     and e.received_at >= p_from and e.received_at < p_to
     and e.name in ('source_viewed', 'recommendation_clicked', 'recommendation_dismissed',
                    'article_opened', 'article_read')
     and (e.consent ->> 'personalization')::boolean is true
   group by e.anon_id, e.source_slug
   order by e.anon_id, e.source_slug
$$;

-- Números do painel (tracking-plan §6) na janela, uma linha de agregados sem identificar ninguém.
create or replace function public.rec_panel_stats(p_since timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'events', count(*),
    'personalized', count(*) filter (where (e.consent ->> 'personalization')::boolean is true),
    'metrics_only', count(*) filter (where (e.consent ->> 'personalization')::boolean is not true),
    'accounts', count(*) filter (where e.user_id is not null),
    'anonymous', count(*) filter (where e.user_id is null),
    'viewed', count(*) filter (where e.name = 'source_viewed'),
    'clicked', count(*) filter (where e.name = 'recommendation_clicked'),
    'dismissed', count(*) filter (where e.name = 'recommendation_dismissed'),
    'algo_versions', coalesce((
      select jsonb_object_agg(v, n) from (
        select algo_version v, count(*) n from events
         where received_at >= p_since group by algo_version) t), '{}'::jsonb),
    'clicks_by_list', coalesce((
      select jsonb_object_agg(l, n) from (
        select props ->> 'list' l, count(*) n from events
         where received_at >= p_since and name = 'recommendation_clicked' and props ? 'list'
         group by props ->> 'list') t), '{}'::jsonb),
    'dismissals_by_reason', coalesce((
      select jsonb_object_agg(r, n) from (
        select props ->> 'dismissReason' r, count(*) n from events
         where received_at >= p_since and name = 'recommendation_dismissed' and props ? 'dismissReason'
         group by props ->> 'dismissReason') t), '{}'::jsonb)
  )
  from events e
  where e.received_at >= p_since
$$;

grant execute on function public.rec_variant_events(timestamptz, timestamptz),
  public.rec_panel_stats(timestamptz) to authenticated;
