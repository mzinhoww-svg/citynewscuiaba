-- Auditoria 360 (04/10/2026), achado P0-01: o revisor automático recebia o rascunho sem IA.
--
-- O rascunho sem IA (`articles.ai_fallback = true`) é a lista de títulos, trechos e links das
-- fontes que o `write` grava quando o modelo falha. Publicá-lo republicaria texto de terceiros
-- (regra 4 de CLAUDE.md §5) e não é matéria. As regras já o mandam para a fila humana
-- (`routeArticle`), mas `review_due_articles` o devolvia ao revisor noturno, que podia publicá-lo.
--
-- Esta migration só acrescenta `and not a.ai_fallback` ao filtro; o resto da função é o de 0141.
-- O código (`isReviewable`) também recusa, para a passada nunca decidir um item desses mesmo com a
-- função antiga, e o filtro aqui impede que esses itens ocupem as vagas do lote a cada 5 min.
-- Reverter: reaplicar a definição de `review_due_articles` de 0141_auto_reviewer.sql.

create or replace function public.review_due_articles(p_now timestamptz default now(), p_limit int default 10)
returns table (id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select a.id
    from articles a
   where a.status = 'in_review'
     and a.due_at is not null and a.due_at <= p_now
     and a.agent_id is not null
     and not a.ai_fallback
     and not exists (select 1 from article_versions v
                      where v.article_id = a.id and v.origin = 'human')
     and not exists (select 1 from reports r
                      where r.content_ref = 'article:' || a.id and r.status = 'open')
     and not exists (select 1 from corrections c
                      where c.article_id = a.id and c.published_at is null and c.status = 'open')
     and not exists (select 1 from review_escalations e
                      where e.article_id = a.id and e.status = 'open')
     and not exists (select 1 from decisions d
                      where d.object_ref = 'article:' || a.id and d.step = 'review'
                        and d.created_at >= a.updated_at)
   order by a.urgent desc, a.due_at asc
   limit greatest(least(p_limit, 50), 0)
$$;
revoke execute on function public.review_due_articles(timestamptz, int) from public, anon, authenticated;
grant execute on function public.review_due_articles(timestamptz, int) to service_role;
