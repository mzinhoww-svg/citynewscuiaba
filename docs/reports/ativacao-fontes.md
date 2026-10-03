# Ativação das fontes pausadas [SRC-ACT]

Data: 03/10/2026. Decisão R43 (dono: "não pause"). **Nada foi gravado em produção**: o `--apply` fica com o dono. O que existe é o script `scripts/ops/activate-sources.mjs` e a configuração `scripts/ops/sources-activation.json`.

## Como rodar

```bash
# dry-run (padrão): lê robots.txt e testa a extração ao vivo, sem gravar
node scripts/ops/activate-sources.mjs

# com acesso ao banco, o dry-run também mostra o que mudaria
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/ops/activate-sources.mjs

# aplicar (explícito); --only limita a algumas fontes
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/ops/activate-sources.mjs --apply
node scripts/ops/activate-sources.mjs --apply --only g1-mt,almt
```

- Idempotente: reexecutar não grava nada se a fonte já está configurada e ativa (compara kind, feed, consumption, termos, frequência e limite).
- Por fonte: teste ao vivo (robots.txt do CityNewsBot, download, extração real). Passou (3 itens ou mais com título, link e data plausível) → `source_admin_update` e `source_admin_status('resume')`. Não passou → continua `paused`, com `last_error` (motivo exato) e `status_reason` (`robots`, `quality` ou `other`).
- Mesmas RPCs do Painel de Fontes (0011/0031/0032): versão otimista, trigger de campos críticos, trilha em `audit_log` com `reason` e `batchId`. Não toca em imagem, republicação nem confiabilidade. Sem DELETE.
- `Crawl-delay` do robots entra em `consumption.robots` e sobe a frequência pela grade (`effectiveFrequency`). `terms_reviewed_at` recebe o momento da aplicação; `agreement_note` registra a revisão delegada (R43), o resumo do robots e o modo de coleta, como na ativação do Olhar Direto.
- Atrás de proxy: `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=...`.

## Resultado do teste ao vivo (ambiente de teste, 03/10/2026 ~18h UTC)

| Fonte | Modo | Feed / página | robots.txt | Resultado |
|---|---|---|---|---|
| g1-mt | page_list | g1.globo.com/mt/mato-grosso/ | permite a seção | ATIVA (6 itens; sem data, ver nota 1) |
| cnn-brasil-mt | page_list | cnnbrasil.com.br/nacional/centro-oeste/mt/ | permite a seção | ATIVA (15 itens; ver nota 2) |
| canal-rural | rss | canalrural.com.br/feed | `*` permite; bloqueia robôs de IA por nome | ATIVA (10 itens; ver nota 3) |
| olhar-conceito | sitemap | olhardireto.com.br/sitemap/conceito/2026.xml | Allow geral | ATIVA (200 itens; ver nota 4) |
| agro-olhar | sitemap | olhardireto.com.br/sitemap/agro-e-negocios/2026.xml | Allow geral | ATIVA (200 itens; ver nota 4) |
| prefeitura-cuiaba | page_list | cuiaba.mt.gov.br/noticias | Crawl-delay 10; bloqueia ClaudeBot etc. por nome | ATIVA (16 itens; ver nota 3) |
| almt | page_list | al.mt.gov.br/midia/texto | permite a rota; bloqueia GPTBot etc. por nome | ATIVA (12 itens; ver nota 3) |
| tjmt | page_list | tjmt.jus.br/ (home) | sem robots.txt | ATIVA (4 itens; ver nota 5) |
| inmet | page_list | portal.inmet.gov.br/noticias | sem robots.txt (404) | ATIVA (10 itens; ver nota 6) |
| secom-mt | n/d | n/d | `*` Disallow: / (só Googlebot e Bingbot) | PAUSADA `robots` |
| defesa-civil-mt | n/d | n/d | `*` Disallow: / e Crawl-delay 30 | PAUSADA `robots` |
| camara-cuiaba | n/d | n/d | ilegível: WAF "Request Rejected" | PAUSADA `other` |
| tce-mt | n/d | n/d | ilegível: conexão reiniciada | PAUSADA `other` |
| tre-mt | n/d | n/d | ilegível: HTTP 403 (Akamai) | PAUSADA `other` |
| mpmt | n/d | n/d | ilegível: conexão reiniciada | PAUSADA `other` |
| diario-de-cuiaba | n/d | n/d | ilegível: HTTP 403 (Cloudflare) | PAUSADA `other` |
| reporter-mt | n/d | n/d | ilegível: HTTP 403 (Cloudflare) | PAUSADA `other` |
| iomat | n/d | n/d | sem robots.txt | PAUSADA `quality`: diário em PDF, sem listagem de notícias |
| imea | n/d | n/d | sem robots.txt | PAUSADA `quality`: HTTP 500 nas notícias, sem listagem |
| midianews | rss (existe) | midianews.com.br/rss.php | Allow geral | PAUSADA `quality`: pubDate de 2001/2002 |
| olhar-esportivo | n/d | n/d | Allow geral | PAUSADA `quality`: sem feed/sitemap; listagem em div hidden |

Os motivos completos estão em `last_error` (e em `scripts/ops/sources-activation.json`, campo `blocked.detail`).

### Notas das ativáveis

1. **g1-mt**: a listagem só traz data relativa ("Há 3 horas"), então `published_at` fica vazio (`requireDate: false`, justificado em `note`). O RSS `/rss/g1/mato-grosso/` está parado em 2018 e é nacional. O sitemap de notícias do g1 é nacional (15 de 720 itens são de MT), por isso a página é melhor.
2. **cnn-brasil-mt**: a hora da listagem é de Brasília e o parser lê como Cuiabá, então a data sai 1 hora adiantada. O `/feed` do site redireciona para `admin.cnnbrasil.com.br` e é nacional.
3. **Robôs de IA**: Canal Rural, Prefeitura de Cuiabá e ALMT bloqueiam por nome robôs de IA (GPTBot, ClaudeBot, CCBot etc.). O `CityNewsBot` não é citado, então o robots.txt dele permite a coleta, mas a intenção do site é clara. A-100 deixou Canal Rural e Prefeitura de Cuiabá de fora por esse critério; a ordem R43 do dono vale acima disso. Cada uma leva a observação no `agreement_note`. Decisão do dono; para pausar de novo, use o Painel.
4. **olhar-conceito e agro-olhar**: o sitemap principal do Olhar Direto (já ativo) também lista as matérias de `/conceito/`, `/agro-e-negocios/` e `/juridico/`. Como `collected_items.canonical_url` é único, a fonte que coletar primeiro fica com a matéria (na prática o Olhar Direto, a cada 10 min). Resultado: as duas fontes entram, mas atribuem pouco. Sem prejuízo; custo de 2 pedidos a cada 30 min cada.
5. **tjmt**: as últimas notícias estão na home (Angular com renderização no servidor); `/noticias` reinicia a conexão a partir do ambiente de teste. Coleta a cada 60 min, 10 pedidos por hora.
6. **inmet**: só as notícias do portal. A API de avisos (`apiprevmet3.inmet.gov.br/avisos/ativos`) responde, mas é JSON próprio com polígonos (não JSON Feed) e precisa de adaptador e filtro por MT.

## Código novo (com testes)

- `src/lib/pipeline/charset.ts`: o corpo era sempre lido como UTF-8; MidiaNews (e outros) servem ISO-8859-1 e os acentos viravam "�". Agora lê o charset do Content-Type, do prólogo XML ou do `<meta>`. Usado em `crawlGet` (`http.ts`), vale para todas as fontes.
- `src/lib/pipeline/parse-date.ts`: datas por extenso em português ("3 DE OUTUBRO DE 2026 ÀS 06:30:00"), `dd/mm/aaaa | hh:mm`, `13h47`, e `parseDateInText` (acha a data dentro de "Postado em 02/10/2026 13h47 · 1 day ago"). `page-list.ts` usa o fallback.
- `src/lib/sources/activation.ts`: esquema do arquivo de configuração, veredito da extração (3 itens, data plausível: não mais de 2 dias no futuro nem mais de `maxAgeDays` de idade), patch para `source_admin_update`, comparação para idempotência e desfecho. 28 testes com fixtures fictícias (Folha do Cerrado, MT Agora).

## Pendências e limites

- **Egress**: os testes rodaram do ambiente de desenvolvimento. Os 403/reset de TRE-MT, TCE-MT, MPMT, Câmara, Diário de Cuiabá e Repórter MT podem ser bloqueio a IP de datacenter, e a Vercel pode ter o mesmo problema. Rodar o dry-run da rede de produção (ou de uma máquina comum) mostra o que passa. Essas seis não têm configuração de coleta no JSON porque a estrutura das páginas não pôde ser vista sem contornar o bloqueio (não foi feito). Quando liberadas, é preciso descobrir feed ou seletores e trocar `blocked` por `strategy`, `feedUrl` e `pageSelectors`.
- **Termos**: não houve leitura jurídica das páginas de termos; a revisão está registrada como delegada pelo dono (R43), no mesmo molde da A-100. `terms_url` aponta para a página de termos quando existe (g1, CNN, Prefeitura, ALMT) ou para a home.
- Secom e Defesa Civil só entram se o órgão liberar o robô no `robots.txt`.
- Seletores de página (`div.feed-post`, `li.gridNews-item` etc.) quebram se o site mudar o HTML; a fonte então falha 3 vezes e pausa sozinha (`auto_failures`).
- MidiaNews: o feed é decodificado certo agora, mas as datas são do ano errado; reativar quando o veículo corrigir.
