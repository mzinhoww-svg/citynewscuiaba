-- AUT-T7 · Estado do assunto automático (A10) e agenda de leitor com aprovação automática (A14).
--
-- `topics.state` (em_apuracao, confirmado, corrigido, encerrado) existe desde a 0001 e só mudava à
-- mão. Agora:
--   * confirmado: com 2 veículos independentes ou 1 fonte oficial (etapa `verify`, no app);
--   * corrigido: quando uma correção de matéria do assunto é publicada (gatilho abaixo);
--   * encerrado: 7 dias sem novidade (`topic_close_stale`, chamada pela rota do revisor).
-- O estado só aparece no Estúdio. A aprovação automática da agenda é feita no app, com a service
-- role, logo depois do envio do leitor; esta migration só garante o que o banco precisa.
--
-- Faixa 0140+. Aditiva e idempotente; nenhum comando de remoção.

-- ---------------------------------------------------------------------------
-- 1. Correção publicada marca o assunto como corrigido
-- ---------------------------------------------------------------------------
create or replace function public.topic_mark_corrected()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.published_at is not null and (tg_op = 'INSERT' or old.published_at is null) then
    update topics t
       set state = 'corrigido'
      from articles a
     where a.id = new.article_id and t.id = a.topic_id and t.state <> 'corrigido';
  end if;
  return new;
end
$$;
revoke execute on function public.topic_mark_corrected() from public, anon, authenticated;

create or replace trigger corrections_topic_state
  after insert or update of published_at on public.corrections
  for each row execute function public.topic_mark_corrected();

-- Correções já publicadas antes do gatilho também marcam o assunto.
update public.topics t
   set state = 'corrigido'
 where t.state in ('em_apuracao', 'confirmado')
   and exists (select 1 from public.corrections c
                 join public.articles a on a.id = c.article_id
                where a.topic_id = t.id and c.published_at is not null);

-- ---------------------------------------------------------------------------
-- 2. Encerrar o assunto sem novidade há 7 dias
-- ---------------------------------------------------------------------------
-- Novidade = item coletado novo, matéria do assunto alterada ou o próprio assunto atualizado.
create or replace function public.topic_close_stale(p_now timestamptz default now(), p_days int default 7)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  with closed as (
    update topics t
       set state = 'encerrado'
     where t.state <> 'encerrado'
       and greatest(
             t.updated_at,
             coalesce((select max(c.created_at) from collected_items c where c.topic_id = t.id),
                      '-infinity'::timestamptz),
             coalesce((select max(a.updated_at) from articles a where a.topic_id = t.id),
                      '-infinity'::timestamptz)
           ) < p_now - make_interval(days => greatest(p_days, 1))
    returning 1
  )
  select count(*) into n from closed;
  return n;
end
$$;
revoke execute on function public.topic_close_stale(timestamptz, int) from public, anon, authenticated;
grant execute on function public.topic_close_stale(timestamptz, int) to service_role;
