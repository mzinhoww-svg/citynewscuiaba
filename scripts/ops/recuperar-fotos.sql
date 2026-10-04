-- Recupera a foto das matérias publicadas sem capa porque o limite por hora da fonte acabou ou o
-- item não tinha a URL da foto (A-143). Pré-requisito: deploy com o passo de imagem que entende
-- `article:<id>#photo<n>` (sem ele a mensagem falha como referência inválida).
-- Para cada item sem URL de foto: `enrich` `#refetch` (lê og:image da página). Depois, a nova
-- tentativa da foto. Os pedidos de cada fonte ficam espaçados dentro do limite por hora dela,
-- com 6 por hora de folga para a coleta. Idempotente pela chave da fila.

with alvo as (
  select a.id
    from articles a
   where a.status in ('published', 'updated')
     and a.published_at > now() - interval '3 days'
     and not exists (select 1 from article_media m join media_assets x on x.id = m.media_id
                      where m.article_id = a.id and m.role = 'cover')
     and not exists (select 1 from article_versions v where v.article_id = a.id and v.origin = 'human')
),
itens as (
  select a.id as article_id, c.id as item_id, s.id as source_id, c.image_url,
         ceil(3600.0 / greatest(s.rate_limit_per_hour - 6, 4))
           * row_number() over (partition by s.id order by a.id, c.id) as atraso
    from alvo a
    join article_sources r on r.article_id = a.id
    join collected_items c on c.id = r.item_id
    join sources s on s.id = c.source_id
   where s.image_policy = 'reproduction' and s.status in ('active', 'degraded')
),
refetch as (
  select queue_enqueue('pipeline', 'enrich:item:' || i.item_id || '#refetch',
           jsonb_build_object('runId', 'recuperar-fotos', 'step', 'enrich',
                              'itemRef', 'item:' || i.item_id || '#refetch', 'attempt', 1),
           i.atraso::int) as job
    from itens i where i.image_url is null
),
foto as (
  select queue_enqueue('media', 'image:article:' || i.article_id || '#photo1',
           jsonb_build_object('runId', 'recuperar-fotos', 'step', 'image',
                              'itemRef', 'article:' || i.article_id || '#photo1', 'attempt', 1),
           (max(i.atraso) * 2 + 600)::int) as job
    from itens i
   group by i.article_id
)
select (select count(*) from refetch) as paginas, (select count(*) from foto) as fotos;
