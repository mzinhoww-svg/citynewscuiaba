# Coletor incremental por sitemap: Olhar Direto

Data: 02/10/2026. Decisão registrada em `.planning/DECISIONS.md` (A-101). Nada foi gravado no banco de produção, nenhuma fonte foi ativada, nenhum push foi feito. O SQL abaixo **não foi aplicado**.

## 1. Resumo do desenho

Reaproveita o pipeline existente (`fetch → validate → extract → normalize → [enrich] → dedupe`). Não há pipeline paralelo, nem serviço pago de leitura, nem proxy. O robô se identifica como `CityNewsBot/1.0 (+https://citynewscuiaba.vercel.app/sobre#robo)` (`CRAWLER_USER_AGENT` ou o padrão), respeita `robots.txt` e o limite por hora da fonte (`rate_limits`, bucket `crawler:<slug>`).

| Peça | Onde | O que faz |
|---|---|---|
| Leitura por prefixo | `net.ts` (`readPrefix`, `prefixBytes`), `http.ts` (`crawlGet`), `steps/fetch.ts` | Só para `kind='sitemap'`: lê o corpo em streaming até 512 KiB (`SITEMAP_PREFIX_BYTES`), devolve o prefixo com `truncated: true` em vez de `too_large` e cancela o stream (o resto do arquivo não é baixado). O `content-length` não é consultado nesse modo. Demais fontes: comportamento idêntico ao anterior (teste de regressão em `net.test.ts`). |
| Reparo do XML cortado | `sitemap.ts` (`repairTruncatedSitemap`), usado por `extract.ts` e `validate.ts` | Descarta tudo depois do último `</url>` (inclusive uma `<url>` ou tag cortada ao meio) e fecha `</urlset>`. Documento completo ou de outro formato passa intacto. Documento curto e malformado, sem `truncated`, continua indo para a quarentena. |
| Título pelo slug | `sitemap.ts` (`titleFromSlug`), `extract.ts` | Sitemap sem nenhum `news:title`: último trecho do caminho, sem extensão e sem sufixo/prefixo numérico de id (5+ dígitos; ano de 4 dígitos fica), `%XX` decodificado, hífens viram espaço, primeira letra maiúscula, teto `TITLE_MAX` (300), depois `sanitizeExternalText`. O item leva `titleSource: "title_slug"`. Num sitemap de notícias (com `news:title` em alguma `<url>`), a `<url>` sem título continua descartada (página institucional); isso preserva as fixtures e testes existentes. |
| Data e ordem | `extract.ts` | `publishedAt` = `news:publication_date` ou, na falta, `lastmod`. Ordena por data desc **depois** de parsear e **antes** do `slice(0, MAX_ENTRIES)`; não assume a ordem do arquivo. |
| Ano do arquivo | `sitemap.ts` (`resolveYearlySitemapUrl`, `previousYearSitemapUrl`, `mergeSitemaps`), `fetch.ts` (`crawlSitemap`) | `feed_url` terminado em `/AAAA.xml` usa o ano corrente em `America/Cuiaba` (a virada é à meia-noite de Cuiabá, não de UTC). Regra para 1º e 2 de janeiro (Cuiabá): o arquivo novo ainda é curto, então lê também o prefixo do ano anterior e junta as duas listas; se o arquivo novo ainda não existe (404), usa só o do ano anterior; falha no segundo arquivo é ignorada. Custo: 1 pedido extra por coleta, 2 dias por ano. |
| Novidade | `normalize.ts`, `insertCollectedItem` | Inalterado: novidade = `loc` inédita (URL canônica única). Ver "não-objetivo" abaixo para `lastmod` maior. |
| Enriquecimento (opcional) | `steps/enrich.ts` | Ver seção 6. Desligado por padrão. |
| Frequência | `sources.frequency_minutes = 10` | Piso da via rápida; a grade 10/15/20/30 não mudou. 2 a 5 min exigiria redesenho (decisão registrada). |

**Não-objetivo: `lastmod` maior que o armazenado.** Não reprocessa como item novo (geraria duplicata de cluster/versão) e **não é registrado**. O `IngestRepo` não tem porta de eventos (`pipeline_events` só é escrito pelo `drain`), e `insertCollectedItem` não devolve o `lastmod` anterior. Registrar `source.item_updated` exigiria uma porta nova, uma leitura extra por item conhecido (até 200 por coleta) e provavelmente uma migration, para um dado que nenhuma tela consome hoje. Efeito colateral aceito: `published_at` guarda o `lastmod` da primeira vez que a `loc` apareceu; com o enriquecimento ligado, ele é corrigido pelo `article:published_time` do site.

URLs cujo slug é só número (ex.: `/noticias/12177`) não geram título e são descartadas na extração (1 de 200 na amostra real). Só uma página aberta (enrich) poderia dar título a elas; ficou de fora.

## 2. Schema do item

`RawEntry` (em `raw_items.entries`, jsonb; `RawEntrySchema` em `src/lib/pipeline/types.ts`) e o que `normalize` grava em `collected_items`:

| Campo `RawEntry` | Origem no sitemap | Coluna `collected_items` | Observação |
|---|---|---|---|
| `title` | slug da última parte do caminho de `<loc>` (`title_slug`) | `original_title` | Sem acentos e sem pontuação (o slug não os tem). Com enrich: `og:title` (sem o nome do site no fim) substitui, só se o título atual ainda for o do slug. |
| `url` | `<loc>` | `canonical_url` (após `tryCanonicalUrl`; único) | Chave de novidade. |
| `publishedAt` | `<lastmod>` (ISO UTC) | `published_at` | Com enrich: `article:published_time` (recusa data a mais de 1 dia no futuro). |
| `excerpt` | `null` (o sitemap não tem lead) | `excerpt` | Com enrich: `og:description` / `meta description`, até 600 caracteres. |
| `author` | `null` | `author` | |
| `imageUrl` | `null` (sem `image:image`) | `image_url` | Com enrich: `og:image` / `twitter:image`, só `http(s)`. É só candidata: a política de imagem da fonte (`with_agreement`, `reproduction` + flag `image_reproduction_enabled`) é aplicada no passo de mídia (`usableAs`), como para qualquer feed. Não há exceção. |
| `injection`, `injectionMatches` | `sanitizeExternalText` sobre o título | (quarentena em `normalize`) | Slug com instrução embutida vai para a quarentena com alerta de segurança, como qualquer item. |
| `titleSource` | `"title_slug"` (novo, opcional) | (não persistido) | Marca que o título veio do slug. Sem coluna nova e sem migration. |
| (fonte) | `sources.locality` | `locality` | |
| (run) | `raw_items.id` | `raw_id`, `source_id` | |

`raw_items.payload` ganhou `truncated?: boolean` (zod em `pipeline-store.ts`, jsonb, sem migration).

## 3. Cinco itens reais (somente leitura)

Prefixo real de 512 KiB de `https://www.olhardireto.com.br/sitemap/olhar-direto/2026.xml`, baixado com o UA do projeto, passado por `crawlGet` (`prefixBytes`) → `validateRaw` (sem problema) → `extractEntries` reais. Executado em 02/10/2026 17:43 UTC, sem tocar no banco.

Medido: 524.287 B decodificados, `truncated: true`, 1.949 `<url>` no prefixo, 199 entradas extraídas (200 mais novas menos 1 `/noticias/12177`, sem título), ordenadas por data (verificado), a mais antiga em `2026-09-30T13:41:12Z` (cerca de 2,2 dias, folga enorme para 10 min).

| title_slug | link | publishedAt (lastmod) |
|---|---|---|
| Capotamento de caminhonete mata adolescente e termina com tres hospitalizados | https://www.olhardireto.com.br/noticias/capotamento-de-caminhonete-mata-adolescente-e-termina-com-tres-hospitalizados | 2026-10-02T16:33:40.782Z |
| Pivetta cresce nos votos validos e avanca para vencer no 1 turno sugere mt dados | https://www.olhardireto.com.br/noticias/pivetta-cresce-nos-votos-validos-e-avanca-para-vencer-no-1-turno-sugere-mt-dados | 2026-10-02T16:19:09.669Z |
| Ilde diz que abilio tera portas abertas na camara mas avisa discutir materia e outra pegada | https://www.olhardireto.com.br/noticias/ilde-diz-que-abilio-tera-portas-abertas-na-camara-mas-avisa-discutir-materia-e-outra-pegada | 2026-10-02T16:15:41.020Z |
| Quaest e atlas fazem ultima leitura ao governo e senado em mt na vespera da eleicao veja ultimos numeros e diferencas | https://www.olhardireto.com.br/noticias/quaest-e-atlas-fazem-ultima-leitura-ao-governo-e-senado-em-mt-na-vespera-da-eleicao-veja-ultimos-numeros-e-diferencas | 2026-10-02T16:12:42.663Z |
| Abilio acusa ministerio da saude de desinformacao pelo uso do termo pessoa que gesta | https://www.olhardireto.com.br/noticias/abilio-acusa-ministerio-da-saude-de-desinformacao-pelo-uso-do-termo-pessoa-que-gesta | 2026-10-02T16:00:20.827Z |

Os títulos do slug perdem acento, pontuação e capitalização de nomes próprios ("1 turno", "mt", "abilio"). É a limitação do `title_slug`; o enriquecimento (`og:title`) existe para corrigir isso depois de estável. Os textos seguem para a IA como dado delimitado, nunca como instrução.

## 4. Custos (bytes por coleta)

| | Antes (leitura do arquivo todo) | Depois (prefixo) |
|---|---|---|
| Decodificado | 4.765.731 B (4,5 MiB) e crescendo ~17 KB/dia | 524.287 B (512 KiB), constante o ano todo; o stream entregou 540.672 B (granularidade de chunk) |
| Na rede (gzip, `curl`) | 788.379 B | cerca de 11% do arquivo: ~85 a 100 KB (estimativa proporcional; o proxy do ambiente usou `br`, então o valor exato não foi medido) |
| Tempo | 5,6 s | 1,7 s |
| Por dia a cada 10 min (144 coletas) | ~113 MB na rede | ~13 MB na rede |
| Teto de 5 MiB (`MAX_DOCUMENT_BYTES`) | estoura em ~27 dias (477 KB de folga ÷ 17,3 KB/dia): `too_large`, falha, pausa automática após 3 | não se aplica ao sitemap |

Mais 1 `robots.txt` por coleta (já existia) e, só em 1º e 2 de janeiro, 1 prefixo extra.

## 5. SQL de configuração (NÃO APLICADO)

Aplicar como administrador/`service_role` (a trigger de campos críticos recusa `authenticated`), do mesmo modo que a A-100. Hoje `olhar-direto`, `olhar-conceito` e `agro-olhar` estão `paused` (`seed_sources_real.sql`, `kind = 'rss'`, sem feed). `status` fica `paused` até o dono ativar: **fonte pausada = desligada**, é a flag. Verificado em 02/10/2026: `robots.txt` do domínio com Allow para todos.

```sql
begin;

-- Olhar Direto (editoria geral): sitemap anual, via rápida de 10 min, enrich desligado.
update sources set
  kind = 'sitemap',
  feed_url = 'https://www.olhardireto.com.br/sitemap/olhar-direto/2026.xml',
  frequency_minutes = 10,
  rate_limit_per_hour = 60,
  consumption = coalesce(consumption, '{}'::jsonb) || jsonb_build_object(
    'strategy', 'sitemap_news',
    'feedUrl', 'https://www.olhardireto.com.br/sitemap/olhar-direto/2026.xml',
    'enrich', false),
  last_error = null
where slug = 'olhar-direto';

-- Atrás de flag (permanecem 'paused'; só configuradas): Olhar Conceito e Agro Olhar.
-- Os sitemaps anuais são /sitemap/conceito/2026.xml e /sitemap/agro-e-negocios/2026.xml.
update sources set
  kind = 'sitemap',
  feed_url = 'https://www.olhardireto.com.br/sitemap/conceito/2026.xml',
  frequency_minutes = 30,
  rate_limit_per_hour = 30,
  consumption = coalesce(consumption, '{}'::jsonb) || jsonb_build_object(
    'strategy', 'sitemap_news',
    'feedUrl', 'https://www.olhardireto.com.br/sitemap/conceito/2026.xml',
    'enrich', false),
  last_error = null
where slug = 'olhar-conceito';

update sources set
  kind = 'sitemap',
  feed_url = 'https://www.olhardireto.com.br/sitemap/agro-e-negocios/2026.xml',
  frequency_minutes = 30,
  rate_limit_per_hour = 30,
  consumption = coalesce(consumption, '{}'::jsonb) || jsonb_build_object(
    'strategy', 'sitemap_news',
    'feedUrl', 'https://www.olhardireto.com.br/sitemap/agro-e-negocios/2026.xml',
    'enrich', false),
  last_error = null
where slug = 'agro-olhar';

commit;

-- Ativação (depois de conferir a Fase A abaixo; um por vez; registre a revisão em agreement_note como na A-100):
-- update sources set status = 'active', status_reason = null where slug = 'olhar-direto';
-- update sources set status = 'active', status_reason = null where slug in ('olhar-conceito', 'agro-olhar');

-- Ligar o enriquecimento (só depois do critério da Fase B; a cota sobe porque o enrich faz até
-- 1 página por item novo; desligar é o mesmo comando com false):
-- update sources set
--   consumption = consumption || '{"enrich": true}'::jsonb,
--   rate_limit_per_hour = 90
-- where slug = 'olhar-direto';
```

Observações:

- **Jurídico:** não existe fonte cadastrada para o Olhar Jurídico (`/sitemap/juridico/2026.xml`). A linha de `olhar-direto` em `docs/sources-registry.md` só o cita em "Notas". Para coletá-lo seria preciso um `insert` novo (slug, localidade, política de imagem e de republicação decididas pelo dono), e este relatório não o inventa.
- `agro-e-negocios` mapeia para a fonte `agro-olhar` ("Agro Olhar", editoria economia/MT do registro); `conceito`, para `olhar-conceito`. Confirmar o mapeamento antes de ativar.
- Ativar pelo botão "Ativar" do Painel roda `activateSource`, que redescobre o feed; para estas fontes o `feed_url` anual já está fixado, então ative por SQL (como na A-100) ou confira o `feed_url` depois.
- Os anos: ao virar 2027, não é preciso editar o `feed_url`; o coletor troca o ano sozinho.
- O limite `rate_limit_per_hour = 60` cobre o regime sem enrich (coleta = 2 pedidos a cada 10 min = 12/h).

## 6. Enriquecimento (`enrich`), atrás de flag, desligado

Ligado só por `consumption.enrich === true` (`consumptionSchema.enrich`, booleano opcional). Fonte sem a flag não recebe a mensagem: `normalize` manda `item:<id>` direto para `dedupe`, sem custo. É um passo fora das 20 etapas (`JOB_STEPS` 24, `STEP_NAMES` continua 20; rótulo "5b · Enriquecer" no Control Center; entra em `COLLECTION_STEPS`).

Regras (todas testadas em `steps/enrich.test.ts`):

- Só o delta: item novo (`created`) de fonte com a flag. Retomada de item que já existia segue direto.
- Concorrência 1 por fonte (fila de promessas) e 1 s (`ENRICH_DELAY_MS`) entre páginas da mesma fonte.
- `robots.txt` checado por `checkRobots` (cache de 10 min por fonte; a regra é reavaliada por caminho); bloqueio = segue sem enriquecer. Limite por hora da fonte via `crawlGet`; atingido = segue sem enriquecer.
- SSRF seguro: `crawlGet`/`safeGet`, UA do projeto, e `onHop` que só aceita o mesmo site da fonte (ignora `www.`): `loc` de outro host nunca é requisitado, redirecionamento para outro host é recusado.
- HTML lido só até 256 KiB (`prefixBytes`); resposta que não é HTML é ignorada; extração com `linkedom`.
- Falha nunca bloqueia: rede, 429 e 5xx tentam de novo até 2 vezes (esperas de 1 e 4 min da fila) e depois o item segue com o título do slug; 403/404/410, robots e cota seguem direto, sem nova tentativa. Prazo do drain estourado devolve a mensagem sem contar tentativa.
- Só itens com até 48 h (`ENRICH_MAX_AGE_MS`): a primeira coleta de um sitemap grande não vira rajada de páginas.
- Todo texto externo passa por `sanitizeExternalText`; campo com instrução embutida é descartado (o título do slug fica) sem bloquear o item. `og:title` só substitui título que veio do slug, e o nome do site no fim é removido quando é o da fonte; imagem e lead só preenchem campo vazio.
- Política de imagem: ver tabela da seção 2 (sem exceção).

## 7. Critério de estável para ligar o enriquecimento

As métricas existem hoje, sem código novo: `source_health_daily` (coletas ok/304/falha, latência, itens novos), `pipeline_events` (o `drain` grava 1 evento por mensagem; retentativa do enrich sai como `warn` com "enriquecimento adiado: HTTP 503"), `raw_items`/`jobs` em quarentena e `collected_items`.

**Fase A: sitemap sem enrich (ativar a fonte com `enrich:false`), no mínimo 72 h (432 coletas); recomendado 7 dias. Liga o enrich só se todos valerem:**

1. Pelo menos 144 coletas seguidas (24 h) sem falha e, no período todo, `fetch_failed / (fetch_ok + fetch_not_modified + fetch_failed) ≤ 1%`, sem 2 falhas finais seguidas e **zero** pausas `auto_failures` (a pausa vem na 3ª).
2. Zero respostas 403 ou 429 do site, `robots.txt` ainda com Allow (a coleta lê a cada ciclo; `last_error` com "robots" = parar) e nenhum aviso do veículo.
3. Latência do fetch: média ≤ 3 s e p95 ≤ 6 s (hoje: 1,7 s com prefixo).
4. Zero `raw_items` em quarentena (`XML malformado`, `formato desconhecido`) e `payload.truncated = true` em ≥ 99% dos brutos.
5. Vazão coerente: `items_new` entre 30 e 250 por dia (esperado ~90/dia: 1.949 URLs no prefixo cobrem ~2,2 dias a ~90/dia nos 200 mais novos). Mais de 250/dia indica reindexação ou mudança de slug: investigar antes de ligar.
6. Nenhuma notificação `source_auto_paused` e nenhum item do site em quarentena de injeção sem explicação.

**Fase B: ligar `enrich` só na `olhar-direto`, vigiar 48 h (≥ 100 itens). Mantém ligado se:**

1. Páginas: taxa de 4xx/5xx ≤ 2% e 429 = 0. Qualquer 403 (ou bloqueio pedido pelo veículo): desligar na hora.
2. ≥ 90% dos itens das últimas 48 h com `image_url` preenchido e título diferente do slug.
3. Fila: nunca mais de 20 mensagens `enrich` pendentes por mais de 30 min; 0 quarentenas do passo.
4. Carga no site: em média ≤ 40 pedidos/h (sitemap + robots + páginas) e nunca acima de 90/h (é a própria `rate_limit_per_hour`); retentativas (`warn`) ≤ 5% das mensagens do passo.
5. Os critérios da Fase A continuam valendo (nada piorou).

Consultas de acompanhamento (somente leitura):

```sql
-- Fase A: saúde diária
select h.day, h.fetch_ok, h.fetch_not_modified, h.fetch_failed, h.items_new,
       round(h.latency_ms_sum::numeric / nullif(h.latency_samples, 0)) as latencia_ms_media, h.last_error
from source_health_daily h join sources s on s.id = h.source_id
where s.slug = 'olhar-direto' and h.day >= current_date - 7 order by h.day;

-- Fase B: eventos do passo enrich por nível e motivo de retentativa
select level, count(*) from pipeline_events
where step = 'enrich' and at > now() - interval '48 hours' group by 1;
select message, count(*) from pipeline_events
where step = 'enrich' and level = 'warn' and at > now() - interval '48 hours' group by 1 order by 2 desc;

-- Fase B: taxa de enriquecimento (o sitemap não traz imagem nem lead; o que tiver veio da página)
select count(*) as itens,
       count(*) filter (where ci.image_url is not null) as com_imagem,
       count(*) filter (where ci.excerpt is not null) as com_lead
from collected_items ci join sources s on s.id = ci.source_id
where s.slug = 'olhar-direto' and ci.created_at > now() - interval '48 hours';
```

## 8. Verificação

Comandos (somente focados; `pnpm verify` e e2e **não** foram rodados, como combinado):

- `pnpm exec vitest run src/lib/pipeline src/lib/sources src/lib/control src/lib/studio src/lib/db src/content src/app/estudio`: 58 arquivos, 589 testes, todos verdes.
- `pnpm typecheck`: limpo (inclui `next typegen` e `src/sw`).
- `pnpm exec eslint src/lib/pipeline src/lib/db/pipeline-store.ts src/lib/sources/schema.ts src/content/pt-BR/control.ts` e `prettier --check` nos mesmos arquivos e em `tests/fixtures/feeds`: limpos.
- Prova com dados reais: seção 3 (arquivo temporário de teste, removido; nada foi gravado).
- **Não executado:** `tests/integration/enrich-db.test.ts` (banco local: `127.0.0.1:54321` não respondia neste ambiente; a pilha local não foi subida para não competir por recursos). As duas consultas novas do repositório (`collectedForEnrich`, `applyEnrichment`) foram checadas só por tipos gerados (`src/lib/db/types.ts`). Rodar `pnpm exec vitest run --project integration tests/integration/enrich-db.test.ts` com a pilha no ar.
