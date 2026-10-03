-- Prioridade da fila do pipeline: lê primeiro a etapa mais adiantada (terminar o que já começou),
-- depois a ordem de chegada. Antes era FIFO puro: com centenas de itens na etapa de classificação,
-- nenhum chegava ao fim até a fila inteira passar por cada etapa, e a primeira matéria demorava
-- horas. Agora um item que já foi classificado passa à frente dos recém-coletados.
-- Etapas fora da lista (push_*) têm prioridade 0 e a fila `notify` é lida separada por p_queue.

create or replace function queue_read(p_queue text, p_n int, p_vt_sec int)
returns table (msg_id bigint, read_ct int, message jsonb)
language sql
set search_path = public
as $$
  with picked as (
    select id from jobs
    where queue = p_queue and visible_at <= clock_timestamp()
    order by coalesce(array_position(
               array['tick','fetch','validate','extract','normalize','dedupe','cluster','classify',
                     'locate','verify','summarize','headline','image','image_rights','rules',
                     'route','publish','record','index','notify'],
               message->>'step'), 0) desc,
             visible_at, id
    limit greatest(p_n, 0)
    for update skip locked
  )
  update jobs j
     set read_ct = j.read_ct + 1,
         visible_at = clock_timestamp() + make_interval(secs => greatest(p_vt_sec, 0))
    from picked
   where j.id = picked.id
  returning j.id, j.read_ct, j.message;
$$;
