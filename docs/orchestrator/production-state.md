# Estado real de produção (04/10/2026, ~13h40 UTC)

Lido por consulta (Supabase `citynews-prod`, ref `vmvirmemxfdtxfdmivuu`) e pela API da Vercel
(projeto `prj_sEpLpxb7EjUYhit7AzdVtOOAEjug`). Nada aqui é inferido de commit ou documento.

| Camada | Estado | Evidência |
|---|---|---|
| Deploy de produção | `e30f542` (merge do PR #37: A-127 e A-128), READY | Vercel `dpl_c6Qu2GC5jVzNRvoAN6T2oAoYfPcc` |
| Migrations | até 0149 aplicadas, **exceto 0143** | `docs/orchestrator/migration-matrix.md` |
| Histórico de migrations | incompleto (várias aplicadas sem linha) | `supabase_migrations.schema_migrations` |
| Cron | 27 jobs ativos; nas últimas 2 h todos com sucesso | `cron.job_run_details` |
| Fontes | 10 ativas, 22 pausadas | `sources` |
| Matérias | 745 publicadas (`auto`), 671 em revisão, 2 rascunhos, 2 arquivadas; 1.235 com `published_at` nas últimas 24 h | `articles` |
| `auto_publish` | desligado | `feature_flags` |
| Disjuntor | 60/800, disparado 04h45 UTC | `publish_breaker` |
| Orçamento do redator | R$ 9/dia | `ai_agents` |
| Texto completo da fonte (A-114) | funciona nas fontes com `enrich: true` (Folhamax, Gazeta, Agência Brasil, LeiAgora, Só Notícias, Prefeitura VG); **não** funciona nas fontes sem a flag (RDNews 0 de 56 em 24 h; HNT sem item novo desde 23h14) | `collected_items.source_text` |
| Outras sessões | há outra sessão escrevendo em produção (0145 apareceu entre 12h47 e 13h20) | consultas sucessivas |
