-- Antes e depois da autonomia de publicação (AUT-T8, passo 3 e 4 do plano). SOMENTE LEITURA:
-- só `select`, nada é gravado. Rode contra a produção com uma conta de leitura:
--
--   psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 \
--     -v inicio="'2026-10-02 00:00-04'" -v fim="'2026-10-03 00:00-04'" \
--     -f scripts/ops/autonomia-antes-depois.sql
--
-- `inicio` e `fim` (com aspas simples, como no exemplo) definem a janela. Rode duas vezes e
-- cole os resultados na tabela "Antes e depois" de docs/reports/autonomia-de-publicacao.md:
--   * antes:  os 7 dias que antecedem a ativação da v3 (`-v inicio="'2026-09-26 00:00-04'"` ...);
--   * depois: as primeiras 24 h depois de `release-backlog --apply`.
-- Horas no fuso de Cuiabá (America/Cuiaba). Colunas e tabelas: migrations 0073 (disjuntor), 0140
-- (denúncias), 0141 (revisor e due_at) e 0142 (estado do assunto). Se alguma ainda não foi
-- aplicada, o comando que a usa falha com "does not exist"; as demais continuam (sem
-- ON_ERROR_STOP, ou rode o bloco isolado).

\echo '== 1. Publicadas por hora (automáticas x por pessoa) =='
select date_trunc('hour', published_at at time zone 'America/Cuiaba') as hora,
       count(*) filter (where publish_mode = 'auto') as automaticas,
       count(*) filter (where publish_mode = 'human') as por_pessoa,
       count(*) as total
  from articles
 where status in ('published', 'updated')
   and published_at >= :inicio::timestamptz and published_at < :fim::timestamptz
 group by 1
 order by 1;

\echo '== 1b. Pico e total da janela =='
select coalesce(max(n), 0) as pico_por_hora, coalesce(sum(n), 0) as total_automaticas
  from (select count(*) as n
          from articles
         where publish_mode = 'auto' and status in ('published', 'updated')
           and published_at >= :inicio::timestamptz and published_at < :fim::timestamptz
         group by date_trunc('hour', published_at)) h;

\echo '== 2. Em revisão agora (foto do momento da consulta) =='
select count(*) filter (where status = 'in_review') as em_revisao,
       count(*) filter (where status = 'in_review' and due_at <= now()) as vencidas,
       count(*) filter (where status = 'in_review' and agent_id is not null) as do_pipeline,
       count(*) filter (where status = 'archived' and updated_at >= :inicio::timestamptz
                          and updated_at < :fim::timestamptz) as arquivadas_na_janela
  from articles;

\echo '== 2b. Motivos mais comuns de revisão (em revisão agora) =='
select left(coalesce(review_reason, '(sem motivo)'), 90) as motivo, count(*) as n
  from articles
 where status = 'in_review'
 group by 1
 order by n desc
 limit 10;

\echo '== 2c. Revisor automático na janela: vereditos =='
select recommended as veredito, count(*) as n
  from decisions
 where step = 'review'
   and created_at >= :inicio::timestamptz and created_at < :fim::timestamptz
 group by 1
 order by 1;

\echo '== 3. Disjuntor: estado atual e aberturas e reinícios da janela =='
select hourly_limit, daily_limit, reports_per_hour, ai_failures_per_hour,
       tripped_at, trip_reason, reset_at
  from publish_breaker;
select at, action, details ->> 'reason' as motivo
  from audit_log
 where action in ('breaker.trip', 'breaker.reset', 'breaker.limits')
   and at >= :inicio::timestamptz and at < :fim::timestamptz
 order by at;

\echo '== 4. Denúncias na janela e itens urgentes =='
select count(*) as denuncias,
       count(*) filter (where status = 'open') as ainda_abertas,
       count(*) filter (where kind = 'right_of_reply') as direito_de_resposta
  from reports
 where created_at >= :inicio::timestamptz and created_at < :fim::timestamptz;
select count(*) as itens_urgentes_abertos_na_janela,
       count(*) filter (where status = 'open') as ainda_abertos,
       (select count(*) from articles where review_banner) as materias_com_banner_agora
  from review_escalations
 where opened_at >= :inicio::timestamptz and opened_at < :fim::timestamptz;

\echo '== 5. Estado dos assuntos (só Estúdio) e agenda de leitor =='
select state, count(*) as assuntos from topics group by 1 order by 1;
select status,
       count(*) as sugestoes,
       count(*) filter (where status = 'approved' and decided_by is null) as aprovadas_sozinhas
  from event_submissions
 where created_at >= :inicio::timestamptz and created_at < :fim::timestamptz
 group by 1
 order by 1;
