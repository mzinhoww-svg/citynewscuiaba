-- A-126 · Recuperação da vazão e de todas as matérias finas (decisões do dono, 04/10/2026).
-- Rode no SQL Editor do Supabase (citynews-prod) DEPOIS do deploy que traz o modo `#refetch` do
-- `enrich`, da migration 0146 (publicação forçada não é edição humana) e da 0147 (reescrita no
-- ar). Idempotente: as mensagens têm chave de deduplicação, e as atualizações só mudam o que
-- ainda não mudou.

begin;

-- 1) Disjuntor: 300 publicações automáticas por hora e 3.000 por dia (antes 60 e 800).
update publish_breaker
   set hourly_limit = 300, daily_limit = 3000, updated_at = now()
 where id;

-- 1b) Orçamento diário do redator: R$ 15 (antes R$ 9), dentro do teto global de R$ 30/dia (0036).
--     Cerca de 1.280 reescritas com o texto completo da fonte custam de R$ 6 a R$ 13; sem folga, a
--     recuperação pararia no meio. Sai de agentes parados: busca com IA (R$ 6 → 1,50, gasto 0),
--     imagem (sem gerador configurado, R$ 2 → 1) e perfil de fonte (R$ 1 → 0,50). Primeiro reduz,
--     depois aumenta, para a soma nunca passar do teto.
update ai_agents set daily_budget_brl = 1.5 where id = 'answer' and daily_budget_brl > 1.5;
update ai_agents set daily_budget_brl = 1 where id = 'image' and daily_budget_brl > 1;
update ai_agents set daily_budget_brl = 0.5 where id = 'source_profiler' and daily_budget_brl > 0.5;
update ai_agents set daily_budget_brl = 15 where id = 'write' and daily_budget_brl < 15;

-- 2) Fontes pausadas voltam a coletar. Sai o `enrich: false` explícito: sem ele o `enrich` liga
--    sozinho quando o feed traz menos de 600 caracteres (sitemap e página trazem 0), e busca o
--    texto completo e a foto na página da fonte. Olhar Conceito e Agro Olhar (mesmo site do Olhar
--    Direto, robots.txt sem restrição) vão de 30 para 60 páginas por hora.
update sources
   set status = 'active', status_reason = null, consecutive_failures = 0,
       consumption = coalesce(consumption, '{}'::jsonb) - 'enrich'
 where status = 'paused';
update sources
   set consumption = consumption - 'enrich'
 where consumption ->> 'enrich' = 'false';
update sources set rate_limit_per_hour = 60
 where slug in ('olhar-conceito', 'agro-olhar') and rate_limit_per_hour < 60;

-- 3) Todas as matérias do redator que nasceram finas: retiradas do ar por texto curto, em revisão
--    ou rascunho, e publicadas com até 3 parágrafos. Ficam de fora as editadas por pessoa e as
--    publicadas que já têm texto. Cada item do assunto busca o texto completo e a foto
--    (`item:<id>#refetch`), espaçado pelo limite por hora da fonte (com folga de 6 para a coleta
--    normal); 15 minutos depois do último item, o assunto é reescrito (`#rewrite5`). A matéria
--    publicada é atualizada no ar, sem sair do site (0147); as demais seguem para imagem, regras
--    e publicação como qualquer matéria nova.
with alvo as (
  select distinct a.topic_id
    from articles a
   where a.agent_id = 'write'
     and a.topic_id is not null
     and not exists (select 1 from article_versions v where v.article_id = a.id and v.origin = 'human')
     and (
       a.status in ('draft', 'in_review')
       or (a.status in ('published', 'updated') and a.publish_mode = 'auto'
           and (select count(*) from jsonb_array_elements(coalesce(a.body -> 'content', '[]'::jsonb)) p
                 where not coalesce((p -> 'attrs' ->> 'credit')::boolean, false)) <= 3)
     )
),
itens as (
  select c.id, c.topic_id,
         ceil(3600.0 / greatest(s.rate_limit_per_hour - 6, 4))
           * row_number() over (partition by s.id order by c.created_at) as atraso
    from collected_items c
    join alvo on alvo.topic_id = c.topic_id
    join sources s on s.id = c.source_id
   where c.duplicate_of is null and c.quarantined_at is null
),
refetch as (
  select queue_enqueue('pipeline', 'enrich:item:' || i.id || '#refetch',
           jsonb_build_object('runId', 'recuperacao-a126', 'step', 'enrich',
                              'itemRef', 'item:' || i.id || '#refetch', 'attempt', 1),
           i.atraso::int) as job
    from itens i
),
reescrita as (
  select queue_enqueue('pipeline', 'summarize:topic:' || i.topic_id || '#rewrite5',
           jsonb_build_object('runId', 'recuperacao-a126', 'step', 'summarize',
                              'itemRef', 'topic:' || i.topic_id || '#rewrite5', 'attempt', 1),
           (max(i.atraso) + 900)::int) as job
    from itens i
   group by i.topic_id
)
select (select count(*) from refetch) as itens_na_fila,
       (select count(*) from reescrita) as assuntos_na_fila;

commit;

-- Conferência (rode depois):
-- select message->>'step' etapa, count(*), min(visible_at), max(visible_at)
--   from jobs where message->>'runId' = 'recuperacao-a126' group by 1;
