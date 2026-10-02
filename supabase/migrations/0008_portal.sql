-- P1 · leitura pública do portal (docs/screens.md P01–P03, P25).
-- Tudo aqui é somente leitura para anon/authenticated e expõe só colunas públicas.

-- Motivo público de despublicação: a página 410 mostra este texto (P25). P4 grava ao despublicar.
alter table articles add column if not exists gone_reason text;

-- Matéria arquivada ou despublicada: a RLS esconde a linha de anon, mas o portal precisa
-- responder 410 com motivo em vez de 404. Devolve o motivo (ou um texto padrão) só nesses
-- estados; nulo para matéria pública ou inexistente.
create or replace function public_article_gone(p_slug text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(a.gone_reason), ''), 'Esta matéria foi retirada do ar pela redação.')
  from articles a
  where a.slug = p_slug and a.status in ('archived', 'unpublished')
$$;
revoke execute on function public_article_gone(text) from public;
grant execute on function public_article_gone(text) to anon, authenticated, service_role;

-- Assinatura das matérias: só o nome de exibição de quem tem papel no Estúdio (autores,
-- revisores). Leitores com conta não aparecem. Roda com os direitos do dono, como
-- public_sources (A-023).
create or replace view public_bylines as
  select p.id, p.display_name
  from profiles p
  where exists (select 1 from user_roles ur where ur.user_id = p.id);
revoke all on public_bylines from anon, authenticated;
grant select on public_bylines to anon, authenticated, service_role;

-- "Mais lidas": leituras qualificadas (article_read, docs/tracking-plan.md) das últimas horas,
-- só de matérias públicas. Sem eventos, a lista sai vazia e o portal cai para as recentes.
create or replace function public_most_read(p_hours int default 24, p_limit int default 5)
returns table (article_id uuid, reads bigint)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, count(*) as reads
  from events e
  join articles a on e.content_ref = 'article:' || a.id::text
  where e.name = 'article_read'
    and e.received_at > now() - make_interval(hours => greatest(1, least(p_hours, 168)))
    and a.status in ('published', 'updated')
  group by a.id
  order by reads desc, max(a.published_at) desc
  limit greatest(1, least(p_limit, 20))
$$;
revoke execute on function public_most_read(int, int) from public;
grant execute on function public_most_read(int, int) to anon, authenticated, service_role;

-- Bairros citados pela matéria: filtro "bairro" da editoria (P02). Slugs de
-- src/content/pt-BR/neighborhoods.ts; a taxonomia editável chega no P5 (A05).
alter table articles add column if not exists neighborhoods text[] not null default '{}';
create index if not exists articles_neighborhoods_idx on articles using gin (neighborhoods);

-- Histórico público de versões (P04): só versões publicadas (criadas a partir da publicação) de
-- matérias públicas, e só título, linha fina, corpo, tipo e nota pública. Nada de autor interno,
-- origem (IA/humano) ou decisões. Roda com os direitos do dono, como public_bylines.
create or replace view public_article_versions as
  select v.article_id, v.number, v.change_kind, v.public_note, v.created_at,
         v.snapshot->>'title' as title, v.snapshot->>'dek' as dek, v.snapshot->'body' as body
  from article_versions v
  join articles a on a.id = v.article_id
  where a.status in ('published', 'updated')
    and a.published_at is not null
    and v.created_at >= a.published_at - interval '1 minute';
revoke all on public_article_versions from anon, authenticated;
grant select on public_article_versions to anon, authenticated, service_role;

-- Assunto (P05): o que as fontes concordam, divergem e o que ainda não foi confirmado, perguntas
-- frequentes e revisor do resumo por IA. Preenchidos pelo agente de assunto (P3) e revisados no
-- Estúdio (P4); texto do CityNews, nunca trecho copiado das fontes.
alter table topics add column if not exists agreements text[] not null default '{}';
alter table topics add column if not exists disagreements text[] not null default '{}';
alter table topics add column if not exists unconfirmed text[] not null default '{}';
alter table topics add column if not exists faq jsonb not null default '[]'
  check (jsonb_typeof(faq) = 'array');
alter table topics add column if not exists summary_reviewed_by uuid;

-- Coleção (P08): a capa mostra a data da última curadoria. P4 atualiza ao editar a coleção.
alter table collections add column if not exists updated_at timestamptz not null default now();
