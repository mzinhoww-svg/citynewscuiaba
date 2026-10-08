# Matriz CODE × MIGRATION × DATABASE × PRODUCTION (0143–0149)

> **Estado atual (04/10/2026, ~13h40 UTC, conferido por consulta só de leitura depois de cada escrita):**
>
> | Migration | Estado em produção | Evidência |
> |---|---|---|
> | 0143 | **PARCIAL** (A-152, 04/10 ~18h UTC) | Parte A aplicada: `email_ownership_proven` existe, `push_audit` exige `push.settings` e 2 KB, `export_email_data` usa a prova de posse. Parte B: `article_versions_read_public` com `using (false)` (o conector trava com `drop policy`). Parte C (`purge_deleted_accounts`) **não aplicada**: a função tem `delete` e o conector pede confirmação humana; está em `supabase/bootstrap/2026-10-04-sql-editor-dono.sql` (B-029). |
> | 0144 | PRODUCTION_VERIFIED | histórico + view filtra `ads_enabled` |
> | 0145 | PRODUCTION_VERIFIED (sem linha no histórico) | sem trigger `feature_flags_two_person`, sem `guard_feature_flags` (aplicada por outra sessão entre 12h47 e 13h20) |
> | 0146 | PRODUCTION_VERIFIED | função com `origin 'ai'`, 0 versões humanas de publicação forçada, padrões 300/3000 aplicados nesta sessão (histórico `0146_forced_publish_not_human`) |
> | 0147 | PRODUCTION_VERIFIED (sem linha no histórico) | `save_pipeline_draft` com `v_live`; as duas chamadas do MCP expiraram em 60 s, a segunda deixou o corpo aplicado |
> | 0148 | PRODUCTION_VERIFIED | `guard_source_changes` sem a recusa de termos; histórico `0148_source_activation_without_terms` |
> | 0149 | PRODUCTION_VERIFIED (esquema) / fluxo de UI não testado | 0 CHECK de aprovador diferente; funções com corpo A-128; histórico `0149_single_approver` |
> | 0150 | PRODUCTION_VERIFIED (15h35 UTC) | veio da main (A-129, auditoria 360). Antes: o revisor automático decidiu 19 rascunhos sem IA (nenhum publicado: 16 em revisão, 3 arquivados). Depois: `review_due_articles` com `not a.ai_fallback`, 0 rascunhos sem IA no lote, anon sem execute, histórico `0150_reviewer_skips_ai_fallback` |
>
> O relatório abaixo é o levantamento anterior às aplicações (subagente, ~13h15), mantido como trilha.

# Migration reconciliation 0143–0148 · CityNews prod (`vmvirmemxfdtxfdmivuu`)

Date 2026-10-04. Only SELECTs were run against production. No repo files were edited.

## 0. Headline: production has moved since the "known facts"

Two of the facts in the brief no longer hold. Production changed after those checks were made.

| Brief said | Production now | Evidence |
|---|---|---|
| 0145 NOT applied (trigger still present) | **APPLIED.** No trigger on `feature_flags` and no `guard_feature_flags` function. | Q2: `ff_triggers = null`, `guard_ff_fn = 0` |
| 0146 NOT applied (body lacks 'ai') | **PARTIAL.** The function body is byte-identical to 0146 and the data fix is done. The breaker column defaults are still 60/800. | Q2 and Q7: md5 `eb54d62e…` = 0146. Q5: `fix_pending_rows = 0`, `already_ai_rows = 1294`. Q2: defaults `60`/`800` |

The history table still has no row for 0143 or 0145–0148. The newest row is `0144_ads_admin` (version 20261004044049, Q3). So 0145 and 0146 were applied as raw SQL.

## 1. Queries used (all read-only)

- **Q1.** `pg_proc` flags per function: `prosrc like '%push.settings%'`, `'%2048%'`, `'%email_ownership_proven%'`, `'%''ai'', j.requested_by%'`, `'%v_live%'`, `'%termos de uso revisados%'`, plus `prosecdef` and `proconfig`. Covers the 0143–0148 functions and their dependencies.
- **Q2.** Triggers on `public.feature_flags`; `count(*) from pg_proc where proname='guard_feature_flags'`; the `insert into article_versions` substring of `forced_publish_batch`; `pg_policies` on `article_versions`; `information_schema.columns.column_default` for `publish_breaker.hourly_limit/daily_limit`; the `publish_breaker` row.
- **Q3.** `select version,name from supabase_migrations.schema_migrations order by version desc limit 15`.
- **Q4.** `pg_get_viewdef('public.public_ad_placements') like '%ads_enabled%'`; `feature_flags` row `ads_enabled`; `storage.buckets` row `ads`; `'ads.*' = any(studio_audit_actions())`; `has_function_privilege` on `push_audit`; existence of `email_ownership_proven`; `save_pipeline_draft` fingerprints; `guard_source_changes` contains `A-127` or `A-128`.
- **Q5.** Counts for the 0146 data fix, using its exact WHERE (see §4).
- **Q6.** Column and type preconditions; `pg_enum` for `publish_mode`; `auth.users` columns; triggers that use `guard_source_changes`; sources paused without terms; live `auto` articles.
- **Q7.** `md5(prosrc)` and `length(prosrc)` for the 6 replaced functions. Compared with the md5 of the text between `$$…$$` in each repo file, computed with a Python script over `supabase/migrations/*`.
- **Q8.** `reloptions` and owner of `public_article_versions` and `public_ad_placements`; grants on `forced_publish_batch` and `export_email_data`.

### Full-body comparison (Q7 vs repo)

| Function | prod md5 / len | repo match |
|---|---|---|
| push_audit | edbf73d4… / 300 | = 0041_push_admin.sql:138 (0143 version is 618802c9… / 609) |
| export_email_data | 58c3eab3… / 1106 | = 0021_reader_email_gate.sql:112 (0143 version is 8df711e5… / 1102) |
| purge_deleted_accounts | fa3f1dae… / 1663 | = 0024_profiles_on_delete.sql:43 (0143 version is 95c43ee4… / 1722) |
| forced_publish_batch | eb54d62e… / 4828 | **= 0146_forced_publish_not_human.sql:8** (0054 version is 5fcf0ec8… / 4831) |
| save_pipeline_draft | d157b5a1… / 2629 | = 0004_pipeline.sql:813 (0147 version is f2edbe6a… / 3127) |
| guard_source_changes | d46abf65… / 8248 | = 0033_source_admin_merge_fixes.sql:130 (0148 version is feb24711… / 8014) |

## 2. Per migration

### 0143_security_p1.sql (main, 154 lines) · **NOT_APPLIED**

**Purpose.** Security P1 fixes from the audit:
- C1-01: anonymous visitors read article history only through the public view.
- C1-03: `push_audit` is limited to roles with `push.settings` and to details of 2 KB or less.
- C1-02: export and purge by e-mail require proof that the account owns the e-mail.

**Objects.**
- DROP POLICY IF EXISTS `article_versions_read_public` on `article_versions` (:10).
- CREATE OR REPLACE `public.push_audit(text,text,jsonb)` (:18–36). It checks `push_can(auth.uid(),'push.settings')` (42501), the `push.%` prefix (22023) and 2048 bytes (22023). Then REVOKE from public, anon and GRANT to authenticated, service_role (:38–39).
- CREATE `public.email_ownership_proven(uuid)` (:50–63). SQL, stable, security definer. REVOKE from public, anon, authenticated and GRANT to service_role (:65–66).
- CREATE OR REPLACE `export_email_data()` (:70–99) and its grants (:101–102).
- CREATE OR REPLACE `purge_deleted_accounts(int)` (:106–151). It calls `purge_email_data` only when `email_ownership_proven`. Grants at :153–154.

**Data changes.** None.

**Preconditions.** All exist in production (Q1, Q6):
- `push_can(uuid,text,text)`. `push_audit` calls it with 2 args, so this relies on the third parameter's default. 0041 defines `push_can` with a default.
- `audit_log`, `purge_email_data(text)`, `scrub_field_origins(jsonb,text)`, `profiles.delete_requested_at`, `user_roles`, `follows`, `saved_items`, `alerts`, `collections`, `events`, `newsletter_subscriptions`, `reader_emails`.
- `auth.users.{email_confirmed_at, confirmation_sent_at, raw_app_meta_data}`.
- `public_article_versions` must keep working for anon once the policy is gone. Q8 shows it has `reloptions = null` (not `security_invoker`) and owner `postgres`, so it runs with owner rights and stays readable.

**Idempotent?** Yes. It uses `drop … if exists` and `create or replace` with the same signatures. Grants are repeatable.

**Production evidence.**
- `email_ownership_proven` is absent (Q4 `eop = 0`; Q1 has no row).
- Policy `article_versions_read_public` is still present (Q2 `av_public_policy = 1`).
- The 3 function bodies match the pre-0143 versions (Q7).

**Behavior note.** B-023 (.planning/BLOCKERS.md:27): accounts that were auto-confirmed will get `null` from export.

### 0144_ads_admin.sql (main, 55 lines) · **APPLIED** (history row exists)

**Purpose.** ADS-T4, banner administration.

**Objects and data changes.**
- INSERT `feature_flags('ads_enabled', true)` ON CONFLICT DO NOTHING (:13).
- CREATE OR REPLACE VIEW `public_ad_placements`, now filtered by the flag (:16–28). Grants at :29–30.
- INSERT bucket `ads` into `storage.buckets` (:32–38).
- Rewrites `studio_audit_actions()` as a union with 3 `ads.*` actions (:40–55).

**Preconditions.** `ad_placements`, `ad_creatives`, `ad_slots`, `ad_stats` (0081–0083) and `studio_audit_actions()`.

**Idempotent?** Yes. The insert uses ON CONFLICT and the audit-actions rewrite is a union over `distinct`.

**Production evidence.**
- Q3 shows the history row `0144_ads_admin`.
- Q4: `view_has_flag = true`, `ads_flag = true`, bucket cfg `{public:true, 204800, png/jpeg/webp}`, `audit_ads = true`.

### 0145_auto_publish_single_admin.sql (main, 6 lines) · **APPLIED** (raw SQL, no history row)

**Purpose.** A-125: an admin can turn `auto_publish` back on alone.

**Objects.** DROP TRIGGER IF EXISTS `feature_flags_two_person` (:5) and DROP FUNCTION IF EXISTS `guard_feature_flags()` (:6).

**Data changes.** None.

**Preconditions.** None. Both statements are `if exists`.

**Idempotent?** Yes.

**Production evidence.**
- Q2: `ff_triggers = null`. There are no non-internal triggers on `feature_flags` at all.
- Q2: `guard_ff_fn = 0`.

**Code.** A stale comment in `src/lib/flags/index.ts:35` still mentions `guard_feature_flags`.

### 0146_forced_publish_not_human.sql (main, 142 lines) · **PARTIAL** (function and data applied, column defaults not)

**Purpose.** A-126: a forced publish writes an `article_versions` row with origin `'ai'`, so the pipeline can still rewrite the article.

**Objects.**
- CREATE OR REPLACE `public.forced_publish_batch(uuid,int)` (:8–127). The only change from 0054 is `'human'` → `'ai'` at :101.
- ALTER TABLE `publish_breaker` ALTER `hourly_limit` SET DEFAULT 300 and `daily_limit` SET DEFAULT 3000 (:141–142).

**Data changes.** UPDATE `article_versions` SET origin='ai' FROM `decisions` (:131–137). The WHERE clause:
- `v.origin = 'human'`
- `d.human_decision = 'forced_publish'`
- `d.object_ref = 'article:' || v.article_id`
- `v.created_at = d.created_at`

**Preconditions.** All present (Q6):
- `forced_publish_jobs` (0054).
- `article_versions.origin` as text. Rows with `'ai'` already exist, so no constraint blocks it.
- `decisions.human_decision`.
- `can_edit_section`, `studio_doc_text`, `studio_snapshot`.
- `publish_breaker` (0073).

**Idempotent?** Yes. The function is a replace, the UPDATE matches 0 rows on a second run, and the defaults are repeatable. `create or replace` keeps the 0054 grants. Q8 shows execute = service_role only, matching 0054:242–243.

**Production evidence.**
- Function: md5 equals 0146 (Q7). Q1 `fp_ai = true`, `fp_human = false`.
- Data: `fix_pending_rows = 0`, `already_ai_rows = 1294` out of `forced_decisions = 1298` (Q5). The 4 forced decisions without a matching version are most likely items that were skipped as already published or that failed.
- Production has only `human_versions_total = 3`, on 1 article.
- Defaults: `hourly_limit` default `60`, `daily_limit` default `800` (Q2). These are 0073's values (0073_breaker.sql:19–20), so the ALTERs did not run.

**Ops note.** The live breaker row is also still `hourly_limit = 60, daily_limit = 800`. It tripped at 2026-10-04T04:45 (Q2). So `scripts/ops/recuperar-materias.sql:9–11` (300/3000) has not been run either.

### 0147_live_rewrite.sql (main, 63 lines) · **NOT_APPLIED**

**Purpose.** A-126: `save_pipeline_draft` accepts `live=true`, which rewrites the text of a published `auto` article that no person has edited, without taking it off the air.

**Objects.** CREATE OR REPLACE `save_pipeline_draft(jsonb)` (:6–63). Same signature as 0004:813. No grant changes. Not security definer, same as 0004.

**Data changes.** None. The rewrites are queued by the ops script.

**Preconditions.** All present (Q6):
- `articles.publish_mode` of type `publish_mode` {human, auto}.
- Type `article_status`, type `confidence_level`.
- `articles.ai_fallback`, `review_reason`, `confidence_score`.
- `article_sources`, `article_versions`.

**Idempotent?** Yes (replace).

**Production evidence.**
- Q4: `spd_live = 0`, `spd_0004_guard = 1`.
- Q7: md5 `d157b5a1…` equals 0004.

**Code impact (main).** `src/lib/pipeline/steps/write.ts:247` already sends `live: true`, through `src/lib/db/pipeline-store.ts:1226`. Against the 0004 body, the key is ignored and a published article raises 55000 "matéria … já está com a redação". So every live rewrite fails in production until 0147 is applied. There are 745 published `auto` articles that could be rewritten (Q6 `live_auto_articles`).

### 0148_source_activation_without_terms.sql (branch `origin/claude/recuperacao-termos`, commit 1b1a5ed, PR #37 draft, 165 lines) · **NOT_APPLIED**

**Purpose.** A-127: the database stops refusing `paused→active` when `terms_reviewed_at` is null.

**Objects.** CREATE OR REPLACE `public.guard_source_changes()` (trigger fn). It is identical to 0033:130–291 except:
- the comment at :85–87;
- removal of the 3-line `if old.status='paused' and new.status='active' and new.terms_reviewed_at is null then raise 'Ativar exige termos de uso revisados.'` (0033:220–222).

This was verified by `diff` of the two function blocks. Only those hunks differ.

**Data changes.** None.

**Preconditions.** All present (Q1, Q6):
- `critical_actor`, `source_operational_columns`, `lock_fast_lane_max`, `two_person_error`, `require_source_critical_approval`, `image_policy_rank`, `source_reliability_rank`.
- `sources.terms_reviewed_at`.
- Trigger `sources_guard` on `sources` already points to this function (Q6), so no trigger DDL is needed.

**Idempotent?** Yes (replace).

**Production evidence.**
- Q1: `has_terms = true`.
- Q4: `gsc_a127 = 0`.
- Q7: md5 `d46abf65…` equals 0033.

**Impact.** 13 sources are `paused` with `terms_reviewed_at is null` and not archived (Q6). They cannot be activated in production today.

**Branch caveat.** The same branch also adds `0149_single_approver.sql` (commit 2b81258, A-128). It recreates `guard_source_changes` again (0149:616–618, "Base: 0148"), plus about 20 other approval functions, and drops CHECK constraints. 0149 is outside this request, but it must be applied **after** 0148 or it is pointless to apply 0148 separately. If 0148 alone is applied, a later 0149 replaces it with its own version, which also has no terms check.

## 3. Dependencies, clobber risk, order

| Migration | Depends on (prod state) | Later redefinition of the same object? | Clobber risk |
|---|---|---|---|
| 0143 | 0002 policy (present), 0041 `push_audit`/`push_can`, 0013/0014/0021/0024 purge chain, 0049 (P6 security, in history) | `push_audit`: only 0041 → 0143. `export_email_data`: only 0021 → 0143. `purge_deleted_accounts`: 0014 → 0021 → 0024 → 0143. No 0130–0133 or 0144 version (grep `create or replace function … <name>` over `supabase/migrations`) | None. Prod bodies equal the immediately preceding file (Q7). Branch 0149 recreates `push_*` approval functions, not `push_audit` (0149 function list) |
| 0144 | 0081–0083 | `studio_audit_actions` is rewritten by 0045, 0054, 0090, 0130 and 0144 as a union | None (union). Already applied |
| 0145 | 0035 objects (already gone) | none | None |
| 0146 | 0054 (`forced_publish_jobs`, function), 0073 (`publish_breaker`) | `forced_publish_batch` only in 0054 and 0146 | None. Re-running is a no-op for function and data, and sets the 2 defaults |
| 0147 | 0004 `save_pipeline_draft`, `publish_mode` column (present) | only 0004 and 0147 | None. Prod equals 0004 exactly |
| 0148 | 0011 (trigger `sources_guard`), 0031–0033 helpers. Prod body equals 0033 | 0149 (same branch) recreates it on top of 0148 | Applying 0148 is safe. Do not apply 0148 after 0149 or it would reintroduce the 0148 body over the 0149 one (comment and creation message only, per 0149:616) |

The six migrations do not depend on one another. Each one touches disjoint objects.

**Safe order:**
1. 0145: no-op re-run, only to record history.
2. 0146: re-run. This sets the defaults, the function is a no-op and 0 rows are updated.
3. 0147: unblocks `write.ts` live rewrites.
4. 0143: security. Changes export behavior for legacy accounts (B-023).
5. 0148: after PR #37 merges, then 0149.

For history bookkeeping, insert rows only for files whose state is verified complete. That is outside the read-only scope of this report.

## 4. 0146 data-fix estimate

`select count(*) from article_versions v join decisions d on d.object_ref='article:'||v.article_id and v.created_at=d.created_at where v.origin='human' and d.human_decision='forced_publish'` returns **0**. The same join with `v.origin='ai'` returns **1294** (Q5).

The fix has already run, or every version was written by the new body. Note the last forced_publish was at 2026-10-04 12:42:01 UTC. DECISIONS.md:113 expected about 1,194 rows.

## 5. Verification and rollback SQL

### 0143

Verify:
```sql
select (select count(*) from pg_proc where proname='email_ownership_proven')=1
   and (select count(*) from pg_policies where tablename='article_versions' and policyname='article_versions_read_public')=0
   and (select prosrc like '%push.settings%' and prosrc like '%2048%' from pg_proc where proname='push_audit')
   and (select prosrc like '%email_ownership_proven%' from pg_proc where proname='export_email_data')
   and (select prosrc like '%email_ownership_proven%' from pg_proc where proname='purge_deleted_accounts')
   and not has_function_privilege('authenticated','public.email_ownership_proven(uuid)','execute');
```

Rollback sketch:
- Recreate the policy from 0002_rls.sql:164–165.
- `push_audit` from 0041_push_admin.sql:138–153.
- `export_email_data` from 0021_reader_email_gate.sql:112–144.
- `purge_deleted_accounts` from 0024_profiles_on_delete.sql:43–89.
- Then `drop function public.email_ownership_proven(uuid);`. It must come last because the restored bodies no longer reference it.

### 0144 (applied)

Verify:
```sql
select pg_get_viewdef('public.public_ad_placements') like '%ads_enabled%'
   and exists(select 1 from feature_flags where key='ads_enabled')
   and exists(select 1 from storage.buckets where id='ads')
   and 'ads.banner.create' = any(public.studio_audit_actions());
```

Rollback sketch:
- View from 0082_ad_slots.sql:129.
- `delete from feature_flags where key='ads_enabled'`.
- The bucket only if it is empty.
- Leave `studio_audit_actions` alone, since extra actions are harmless.

### 0145 (applied)

Verify:
```sql
select not exists(select 1 from pg_trigger where tgrelid='public.feature_flags'::regclass and tgname='feature_flags_two_person')
   and not exists(select 1 from pg_proc where proname='guard_feature_flags');
```

Rollback: 0035_contingency.sql:17–37 (function, trigger, revoke).

### 0146 (partial)

Verify:
```sql
select (select prosrc like '%''ai'', j.requested_by%' from pg_proc where proname='forced_publish_batch')
   and (select column_default from information_schema.columns where table_name='publish_breaker' and column_name='hourly_limit')='300'
   and (select column_default from information_schema.columns where table_name='publish_breaker' and column_name='daily_limit')='3000'
   and (select count(*) from article_versions v join decisions d on d.object_ref='article:'||v.article_id and v.created_at=d.created_at
        where v.origin='human' and d.human_decision='forced_publish')=0;
```
Today this returns false because the defaults are still 60/800.

Rollback sketch:
- Function from 0054_forced_publish.sql:122–243.
- `alter table publish_breaker alter column hourly_limit set default 60, alter column daily_limit set default 800` (0073_breaker.sql:19–20).
- The data UPDATE is not reversible without a snapshot. The join could flip `'ai'`→`'human'` for the same matching rows, but that is not recommended because it re-locks the articles.

### 0147

Verify:
```sql
select prosrc like '%v_live%' and prosrc like '%v_mode = ''auto''%' from pg_proc where proname='save_pipeline_draft';
```

Rollback: `save_pipeline_draft` from 0004_pipeline.sql:813–862.

### 0148

Verify:
```sql
select prosrc not like '%termos de uso revisados%' and prosrc like '%A-127%'
  from pg_proc where proname='guard_source_changes';
```
After 0149 this becomes `prosrc like '%A-128%' or …`. Check that body's marker.

Rollback: `guard_source_changes` from 0033_source_admin_merge_fixes.sql:130–291. The trigger `sources_guard` (0011:573–574) needs no change.

## 6. CODE × MIGRATION × DATABASE × PRODUCTION matrix

| # | Code (main) expects it? | Migration file | DB history row | Production objects | Status |
|---|---|---|---|---|---|
| 0143 | Partly. `src/lib/db/account.ts:277,310` calls `export_email_data` with an unchanged signature; works either way. STATE.md:14 says "Falta aplicar 0143" | main `supabase/migrations/0143_security_p1.sql` | no | no `email_ownership_proven`; public policy present; 3 bodies = 0041/0021/0024 | **NOT_APPLIED** |
| 0144 | yes (`src/lib/db/queries/ads-admin.ts`, `src/lib/flags/index.ts` use `ads_enabled`) | main 0144 | **yes** (20261004044049) | view, flag, bucket, audit actions present | **APPLIED** |
| 0145 | yes (A-125: single-admin re-enable). Stale comment in `src/lib/flags/index.ts:35` | main 0145 | no | trigger and function absent | **APPLIED** (raw SQL) |
| 0146 | yes (forced publish no longer locks rewrites) | main 0146 | no | function = 0146; 0 human rows pending; 1294 ai; defaults 60/800 | **PARTIAL** (missing :141–142) |
| 0147 | **yes, and it breaks without it.** `write.ts:247` sends `live:true`; prod raises 55000 for published articles | main 0147 | no | body = 0004 | **NOT_APPLIED** (blocks A-126 rewrites) |
| 0148 | only on the branch (PR #37). Main code still assumes the DB check | branch only (+0149 on the same branch) | no | body = 0033, has "termos"; 13 paused sources without terms | **NOT_APPLIED** |
