-- D-06 (decisão do dono de 04/10/2026): sem rótulo público de IA, com rastreabilidade interna e
-- sem expor por acidente os metadados internos. A chave anônima do Supabase é pública (vai no
-- navegador) e a política `articles_read_public` deixa o papel `anon` ler matérias publicadas com
-- TODAS as colunas pela API REST, inclusive as de operação interna.
--
-- Esta migration tira do `anon` só as colunas que nenhum código público lê (conferido por busca em
-- src/: são usadas pelo Estúdio, com sessão `authenticated`, ou pelo pipeline, com service role):
--   ai_fallback, review_reason, rules_version, short_reason, studio_snapshot, field_origins,
--   assignee_id, due_at, risk_level
-- Continuam legíveis pelo `anon` as colunas que o portal seleciona no servidor com a chave anônima
-- (ARTICLE_COLUMNS em src/lib/db/queries/articles.ts), entre elas `publish_mode`, `agent_id` e
-- `confidence`. Fechar estas exige refatorar as consultas públicas (pendência registrada em
-- docs/audit/AUDIT-REPORT.md, D-06). `authenticated` não muda (a equipe lê pela mesma role).
--
-- Coluna nova em `articles` nasce sem leitura para o `anon`: para o portal ler, inclua-a no grant
-- abaixo numa migration nova. Reverter: `grant select on public.articles to anon;`.

revoke select on public.articles from anon;
grant select (
  id, slug, kind, topic_id, section_slug, title, dek, body, ai_summary, ai_summary_reviewed_by,
  status, publish_mode, confidence, confidence_score, author_id, agent_id, urgent, sponsored,
  published_at, updated_at, scheduled_for, tsv, embedding, gone_reason, neighborhoods, tags,
  seo_title, seo_description, publish_destinations, news_scope, national_commotion, review_banner
) on public.articles to anon;
