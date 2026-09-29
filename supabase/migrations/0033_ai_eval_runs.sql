-- P5-T6: execuções da regressão da IA (Control Center O14). Cada linha guarda as métricas de
-- `runRegression` (src/lib/ai/eval.ts) para um agente e uma versão de prompt. Não altera prompts,
-- agentes nem orçamento. Ler: quem lê ai_calls (admin, editor_chefe, operador_ia, analista).
-- Executar: quem publica prompt (admin, editor_chefe, operador_ia), sempre em nome próprio.
create table if not exists ai_eval_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references ai_agents(id),
  prompt_version int not null,
  provider text not null check (provider in ('fake', 'openrouter')),
  case_count int not null check (case_count >= 0),
  metrics jsonb not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_eval_runs_agent_created on ai_eval_runs (agent_id, created_at desc);

alter table ai_eval_runs enable row level security;
create policy ai_eval_runs_read on ai_eval_runs for select to authenticated
  using (has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia,analista}'));
create policy ai_eval_runs_insert on ai_eval_runs for insert to authenticated
  with check (
    has_any_role((select auth.uid()), '{admin,editor_chefe,operador_ia}')
    and created_by = (select auth.uid())
  );
