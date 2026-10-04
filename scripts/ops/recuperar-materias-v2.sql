-- A-126 (v2) · Recuperação robusta da vazão e das matérias finas.
-- A v1 (`recuperar-materias.sql`) rodava numa transação só: a primeira fonte recusada
-- ("Ativar exige termos de uso revisados.", antes da 0148) reverteu tudo, inclusive o disjuntor e o
-- orçamento. Aqui cada fonte é reativada no próprio bloco (subtransação): a que falhar fica pausada,
-- com o motivo no relatório, e as outras seguem. O resto continua idempotente como na v1.
--
-- Pré-requisitos em produção (conferir antes; ver docs/orchestrator/migration-matrix.md):
--   0146 (publicação forçada grava 'ai'), 0147 (`save_pipeline_draft` com `live`), 0148 (sem recusa
--   de termos) e o deploy com o modo `#refetch` do enrich. Recomendado: deploy que registra o motivo
--   do enrich (commit b0a277d), para medir se a fonte sem `enrich` explícito recebe o texto.
--
-- Pré-checagem (só leitura; rode antes e guarde o resultado):
--   select (select prosrc ilike '%v_live%' from pg_proc where proname = 'save_pipeline_draft') as f0147,
--          (select prosrc not ilike '%Ativar exige termos%' from pg_proc where proname = 'guard_source_changes') as f0148,
--          (select hourly_limit || '/' || daily_limit from publish_breaker) as disjuntor,
--          (select count(*) from sources where status = 'paused' and archived_at is null) as pausadas;

begin;

-- 0) Trava: sem 0147 e 0148 a recuperação reescreveria só metade e voltaria a falhar.
do $$
begin
  if not (select prosrc ilike '%v_live%' from pg_proc where proname = 'save_pipeline_draft') then
    raise exception 'pré-requisito: 0147 (save_pipeline_draft com live) não está aplicada';
  end if;
  if (select prosrc ilike '%Ativar exige termos de uso revisados%' from pg_proc where proname = 'guard_source_changes') then
    raise exception 'pré-requisito: 0148 (ativar sem termos revisados) não está aplicada';
  end if;
end $$;

-- 1) Disjuntor: 300 por hora e 3.000 por dia (escolha do dono, A-126). Não zera o disparo: religar
--    a publicação automática segue sendo ação do admin na Contingência (A-125).
update publish_breaker set hourly_limit = 300, daily_limit = 3000, updated_at = now()
 where id and (hourly_limit, daily_limit) is distinct from (300, 3000);

-- 1b) Orçamento do redator R$ 15 dentro do teto de R$ 30 (primeiro reduz, depois aumenta).
update ai_agents set daily_budget_brl = 1.5 where id = 'answer' and daily_budget_brl > 1.5;
update ai_agents set daily_budget_brl = 1 where id = 'image' and daily_budget_brl > 1;
update ai_agents set daily_budget_brl = 0.5 where id = 'source_profiler' and daily_budget_brl > 0.5;
update ai_agents set daily_budget_brl = 15 where id = 'write' and daily_budget_brl < 15;

-- 2) Fontes pausadas: uma por vez, cada uma no próprio bloco. Falha vira linha no relatório.
create temp table recuperacao_fontes (slug text, resultado text, motivo text) on commit drop;

do $$
declare
  s record;
begin
  for s in
    select id, slug from sources
     where status = 'paused' and archived_at is null
     order by slug
  loop
    begin
      update sources
         set status = 'active', status_reason = null, consecutive_failures = 0,
             consumption = coalesce(consumption, '{}'::jsonb) - 'enrich'
       where id = s.id;
      insert into recuperacao_fontes values (s.slug, 'ativada', null);
    exception when others then
      insert into recuperacao_fontes values (s.slug, 'mantida pausada', sqlerrm);
    end;
  end loop;
end $$;

-- `enrich: false` explícito sai também das ativas (sem a flag o enrich liga no feed curto).
update sources set consumption = consumption - 'enrich' where consumption ->> 'enrich' = 'false';
update sources set rate_limit_per_hour = 60
 where slug in ('olhar-conceito', 'agro-olhar') and rate_limit_per_hour < 60;

-- 3) Matérias finas do redator (mesmo critério da v1): refetch espaçado por fonte e reescrita
--    15 minutos depois do último item do assunto. Só itens de fontes ativas (a pausada não coleta).
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
     and s.status in ('active', 'degraded')
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

-- Relatório por fonte (antes do commit, enquanto a tabela temporária existe).
select resultado, count(*), string_agg(slug || coalesce(' (' || motivo || ')', ''), ', ' order by slug)
  from recuperacao_fontes group by resultado;

commit;

-- Verificação (só leitura, depois):
-- select hourly_limit, daily_limit from publish_breaker;                       -- 300, 3000
-- select daily_budget_brl from ai_agents where id = 'write';                   -- 15.00
-- select status, count(*) from sources where archived_at is null group by 1;   -- pausadas = só as do relatório
-- select message->>'step' etapa, count(*), min(visible_at), max(visible_at)
--   from jobs where message->>'runId' = 'recuperacao-a126' group by 1;
-- Depois de 1 h: pipeline_events.details.enrich dos itens de refetch (saved/skipped + reason).
