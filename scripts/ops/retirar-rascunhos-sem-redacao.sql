-- Retira do ar os rascunhos sem redação publicados pela "Publicação forçada" (03 e 04/10) e
-- conserta os assuntos públicos presos no título "Assunto em apuração · …".
-- Pré-requisito: migration 0157 (`article_unwritten`, trava e `promote_topic_on_publish`).
-- Idempotente: rodar de novo não acha alvo.
--
-- Pré-checagem (só leitura):
--   select count(*) from articles
--    where status in ('published', 'updated') and public.article_unwritten(id);
--   select count(*) from topics where visibility = 'public' and title like 'Assunto em apuração%';

begin;

do $$
begin
  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace
                  and proname = 'article_unwritten') then
    raise exception 'pré-requisito: 0157 (article_unwritten) não está aplicada';
  end if;
end $$;

-- 1) Matérias sem redação no ar voltam para a revisão (fora do público na hora, pela RLS) e o
--    redator tenta de novo (`#rewrite7`: hash novo, a decisão de fallback antiga não a pula).
drop table if exists retirada_sem_redacao;
create temp table retirada_sem_redacao as
  select a.id, a.topic_id, a.title
    from articles a
   where a.status in ('published', 'updated') and public.article_unwritten(a.id);

update articles a
   set status = 'in_review',
       publish_mode = null,
       published_at = null,
       review_reason = 'Retirada do ar: rascunho sem redação publicado pela publicação forçada em lote. Reescreva antes de publicar.',
       updated_at = now()
  from retirada_sem_redacao r
 where a.id = r.id;

insert into decisions (object_ref, step, input_hash, output, rationale)
select 'article:' || r.id, 'publish', md5('withdraw-unwritten:' || r.id),
       jsonb_build_object('action', 'withdraw_unwritten', 'title', r.title),
       'Rascunho sem redação retirado do ar (correção da publicação forçada em lote).'
  from retirada_sem_redacao r
on conflict do nothing;

select queue_enqueue('pipeline', 'summarize:topic:' || t.topic_id || '#rewrite7',
         jsonb_build_object('runId', 'retirada-sem-redacao', 'step', 'summarize',
                            'itemRef', 'topic:' || t.topic_id || '#rewrite7', 'attempt', 1),
         (row_number() over (order by t.topic_id) * 20)::int)
  from (select distinct topic_id from retirada_sem_redacao where topic_id is not null) t;

-- 2) Assunto público com título provisório: título da matéria boa mais recente; sem matéria no ar,
--    volta a interno (o gatilho refaz o título provisório e o próximo texto publicado o abre).
--    O slug público não muda.
with boa as (
  select distinct on (a.topic_id) a.topic_id, a.title
    from articles a
   where a.status in ('published', 'updated') and a.title not like 'Assunto em apuração%'
   order by a.topic_id, a.published_at desc nulls last
)
update topics t
   set title = left(boa.title, 300), updated_at = greatest(t.updated_at, now())
  from boa
 where boa.topic_id = t.id and t.visibility = 'public' and t.title like 'Assunto em apuração%';

update topics t
   set visibility = 'internal', updated_at = greatest(t.updated_at, now())
 where t.visibility = 'public' and t.title like 'Assunto em apuração%'
   and not exists (select 1 from articles a
                    where a.topic_id = t.id and a.status in ('published', 'updated'));

commit;

-- Relatório
select (select count(*) from retirada_sem_redacao) as retiradas,
       (select count(*) from articles where status in ('published', 'updated')
           and public.article_unwritten(id)) as ainda_no_ar,
       (select count(*) from topics where visibility = 'public'
           and title like 'Assunto em apuração%') as assuntos_provisorios_publicos;
