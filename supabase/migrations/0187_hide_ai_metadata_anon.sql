-- D-06 / A-138 (decisão do dono de 04/10/2026): sem selo público de IA e metadados internos fora
-- da chave anônima. A 0153 tirou do `anon` as colunas internas que nenhum código público lia, mas
-- deixou `publish_mode`, `agent_id` e `confidence` porque o portal ainda as selecionava
-- (ARTICLE_COLUMNS em src/lib/db/queries/articles.ts). Esta migration fecha as três.
--
-- O portal deixou de ler as três:
--   * `agent_id` e `confidence` (nível) não eram exibidos em tela pública nenhuma;
--   * `publish_mode` só servia à faixa Urgente da home (A2/A15: urgente publicada por pessoa entra
--     sempre; automática só se local/regional ou de comoção nacional). A regra passa a ser a coluna
--     derivada `urgent_strip` abaixo, que diz apenas se a matéria pode ocupar a faixa (o mesmo que a
--     própria home já mostra), sem expor o modo de publicação de cada matéria.
--   `confidence_score` continua público (ordena os destaques); o rótulo de nível sai.
--
-- `authenticated` (Estúdio) e `service_role` (pipeline) não mudam: o grant de tabela deles fica.
-- Aditiva e idempotente (revoke + grant da lista de colunas, como na 0153). Coluna nova em
-- `articles` nasce sem leitura para o `anon`: para o portal ler, inclua-a no grant abaixo numa
-- migration nova. Reverter o fechamento: grant select (publish_mode, agent_id, confidence) on
-- public.articles to anon;

-- Faixa Urgente (A2 e A15), espelho de `isEligibleForFeature` (src/lib/geo/news-scope.ts) mais a
-- exceção de publicação humana. Gerada: acompanha qualquer mudança de urgent, modo ou escopo.
alter table public.articles add column if not exists urgent_strip boolean
  generated always as (
    coalesce(
      urgent
        and (
          publish_mode is not distinct from 'human'::publish_mode
          or news_scope is distinct from 'national'
          or national_commotion
        ),
      false
    )
  ) stored not null;

comment on column public.articles.urgent_strip is
  'Pode ocupar a faixa Urgente da home (A2/A15): urgente e (publicada por pessoa, ou local/regional, ou comoção nacional). Derivada; substitui a leitura pública de publish_mode (D-06, 0187).';

revoke select on public.articles from anon;
grant select (
  id, slug, kind, topic_id, section_slug, title, dek, body, ai_summary, ai_summary_reviewed_by,
  status, confidence_score, author_id, urgent, sponsored,
  published_at, updated_at, scheduled_for, tsv, embedding, gone_reason, neighborhoods, tags,
  seo_title, seo_description, publish_destinations, news_scope, national_commotion, review_banner,
  urgent_strip
) on public.articles to anon;
