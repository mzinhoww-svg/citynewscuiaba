# Analytics e audiência no CityNews: design

Data: 08/10/2026. Origem: pedido do dono ("sinto falta de analytics") e levantamento do que existe (eventos próprios, relatório de anúncios, funil do PWA, custos de IA, painel de recomendação). Aprovado pelo dono em 08/10/2026, itens 1 a 6 (com o ajuste do GA4 em §8): Search Console, contador sem cookie e eventos faltantes, tela Audiência, busca e painel por fonte, Speed Insights e Sentry, **GA4 e GTM instalados agora** ("precisamos para o futuro"). Decisão registrada como **A-216**. Esta spec emenda a ADR-008 e a D16 da spec mestre.

## 1. Entendimento

O que já existe e continua como está:
- Eventos próprios na tabela `events`, gravados por `POST /api/events` e condicionados ao consentimento.
- Retenção de 90 dias, rollup `source_stats_daily` e o bloco "Mais lidas".
- Relatório de Publicidade (A07), funil e histórico de Notificações, Custos de IA (O09) e Recomendação (O17/O18).

Os quatro problemas:
1. **Não há tela de audiência.** Ninguém no Estúdio vê visitas, matérias mais lidas, de onde vem o leitor ou que aparelho ele usa.
2. **Os números ficam abaixo do real.** Quem não aceita o banner não gera evento, então leitura e visita só contam quem consentiu. Os anúncios já resolveram isso com contagem agregada sem identificador (ADS-T1), e as páginas não.
3. **Três eventos do plano nunca são enviados:** `article_opened`, `article_shared` e `search_submitted`. Por isso sessões, cliques e compartilhamentos de `source_stats_daily` saem errados.
4. **Não há nada externo.** O site está fora do Search Console, sem medição real de velocidade, sem captura de erro em produção e sem GA4 (que o dono quer ter pronto para agência e anunciante).

## 2. Princípios (emenda à ADR-008)

1. **A fonte da verdade continua no banco do CityNews.** O Estúdio só mostra dados próprios ou importados para o nosso banco (Search Console). O GA4 é um espelho para uso externo e nunca alimenta tela do Estúdio.
2. **Duas camadas de medição:**

| Camada | Sem consentimento | Com "Métricas" | Com "Personalização" |
|---|---|---|---|
| Contador agregado (novo, §3) | Sim | Sim | Sim |
| Eventos `events` (existente) | Não | Sim, sem `anonId` | Sim, completo |
| GA4 e GTM (novo, §8) | Carrega antes da escolha, com sinais concedidos; com "Só o necessário", sinais negados | Sim | Sim |

3. **Contador agregado sem cookie e sem `localStorage`.**
   - Nenhum identificador de pessoa é gravado.
   - A deduplicação usa um hash de sal diário + IP + navegador + página + janela de 30 min, o mesmo esquema de `src/lib/ads/track.ts`.
   - A chave é apagada no dia seguinte.
   - Base legal: legítimo interesse, para estatística agregada. Fica documentada em `/privacidade` e no RIPD.
4. **Sem dado pessoal em nenhum destino:**
   - sem e-mail, nome, `user_id` ou `anonId` no GA4;
   - termos de busca passam por um filtro que descarta e-mail, telefone, CPF e sequências de 5 ou mais dígitos;
   - nunca há medição dentro de `/estudio`.
5. **Medição nunca quebra a página.** Sem banco, sem sal, com bloqueador de anúncio ou com o GTM fora do ar, o leitor segue normalmente e a contagem se perde em silêncio.

## 3. Contador agregado de páginas (sem cookie)

**Rota `POST /api/metrics/hit`.**
- Corpo de até 1 KB, validado com zod.
- Robô filtrado por `isBot`. Responde 204, ou 503 sem sal ou sem banco.
- Usa a mesma limitação por IP de `/api/events`.

**Os quatro tipos de hit:**

| `t` | Quando | Campos |
|---|---|---|
| `view` | A cada página pública aberta, incluindo navegação no cliente | `kind`, `contentId?`, `section?`, `ref`, `utm?`, `device` |
| `read` | Leitura válida, pela mesma regra do `ReadTracker`: ≥30 s com ≥50% de rolagem, ou ≥60 s | `contentId`, `section?`, `seconds` (limitado a 1.800) |
| `share` | Clique em compartilhar | `contentId`, `channel` (`SHARE_CHANNELS`) |
| `out` | Clique no link de um agregado para o veículo original | `sourceId`, `contentId?` |

**Valores dos campos:**
- `kind`: `home`, `editoria`, `materia`, `assunto`, `busca`, `agenda`, `guia`, `fontes`, `panorama`, `outra`.
- `ref` (classe da origem, calculada no cliente a partir de `document.referrer` e da UTM):
  - `google`: busca do Google, Bing ou DuckDuckGo;
  - `google_news`: `news.google.*` e Discover (`googlequicksearchbox`);
  - `social`: Facebook, Instagram, X, Threads, LinkedIn, TikTok;
  - `whatsapp`, `telegram`;
  - `push`: `utm_source=push`;
  - `newsletter`: `utm_medium=email`;
  - `interna`: mesma origem;
  - `direta`: sem referrer;
  - `outra`.
- O domínio do referrer não é guardado, só a classe.
- `utm`: `source`, `medium` e `campaign`, em minúsculas, até 60 caracteres cada, só `[a-z0-9_-]`.
- `device`: `mobile`, `tablet` ou `desktop`, calculado pela largura da tela no cliente.

**Banco (migration 0187):**
- `site_stats_daily (day, views, visitors)`
  - `visitors` = visitantes únicos estimados por dia, contados pelas chaves diárias (hash de sal + IP + navegador + dia).
- `content_stats_daily (day, content_id, section, views, reads, read_seconds, shares, outbound)`
  - `content_id` nulo agrega as páginas sem conteúdo.
  - Uma linha por dia, conteúdo e editoria.
- `page_stats_daily (day, kind, section, views)`
- `traffic_stats_daily (day, ref, utm_source, utm_medium, utm_campaign, device, views)`
- `outbound_stats_daily (day, source_id, clicks)`
- `metric_keys (key, day)`
  - Deduplicação; o cron `metric-keys-cleanup` apaga as chaves anteriores a ontem.
- Função `metric_track(p_kind text, p_payload jsonb, p_key text, p_visitor_key text) returns boolean`:
  - `security definer`, executável só pelo service role;
  - deduplica e soma no dia de Cuiabá.
- RLS ligada em todas as tabelas.
  - Leitura pelas funções do Estúdio (`audience_*`, §5), que conferem `metrics.view`.
  - Ninguém lê nem escreve direto.
- Retenção dos agregados: 25 meses (cron mensal `metric-stats-retention`).

**Cliente:**
- `PageMetrics` (`"use client"`, montado no `PublicShell`) envia `view` a cada troca de `usePathname()`, por `sendBeacon` com `fetch`/keepalive de reserva.
- `ReadTracker`, `ShareSheet` e o link de saída dos agregados enviam `read`, `share` e `out`.
- Nada disso depende do banner.

## 4. Eventos que faltam (camada `events`, com consentimento)

- `article_opened`: no carregamento da matéria. Leva `surface`, `kind` (`ARTICLE_KINDS`) e `sourceId` quando houver. Corrige `sessions` e `clicks` de `source_stats_daily`.
- `article_shared`: no `ShareSheet`, com `channel`. Corrige `shares`.
- `search_submitted`: na busca, com `resultsCount` e `query` (que já sai só com Personalização, pela regra atual de `buildEvent`).
- Eles também viram eventos do GA4 (§8) quando o GA4 está ligado e houve consentimento.

## 5. Tela Audiência no Estúdio

**Rota e acesso:**
- Rota `/estudio/audiencia`, item "Audiência" no grupo Redação, com o ícone `chart-line` (ou o mais próximo no sprite).
- Permissão `metrics.view`, que já existe: admin, editor-chefe, operador de IA, analista e leitura veem tudo; editor vê só as suas editorias.
- Filtros comuns: período (hoje, 7, 30 e 90 dias, intervalo livre de até 400 dias), editoria e comparação com o período anterior.
- O dia é o dia civil de Cuiabá.
- Cada aba tem estado de carregando, vazio ("Ainda não há visitas contadas neste período") e erro, e exporta CSV.

**Abas:**
1. **Visão geral.**
   - Números: visitas, visitantes estimados, leituras, taxa de leitura (leituras ÷ visitas a matérias), tempo médio de leitura e compartilhamentos, cada um com a variação contra o período anterior.
   - Série diária de visitas e leituras.
   - As 10 matérias mais lidas, as 5 origens principais e a divisão celular × computador.
2. **Matérias.**
   - Ranking com: visitas, leituras, taxa de leitura, tempo médio, compartilhamentos, cliques de saída, editoria, autor e modo de publicação.
   - O modo de publicação vem de `publish_mode`: "Automática" ou "Revisada", nomes internos que o Estúdio pode mostrar.
   - Filtros: editoria, autor, modo de publicação, origem (ORIGINAL × agregado).
   - Ordenável e paginado de 50 em 50. A linha abre a matéria no Estúdio.
3. **Origens.**
   - Visitas por classe de origem, com série diária.
   - Tabela de campanhas UTM.
   - Divisão por aparelho.
4. **Busca.**
   - Termos mais buscados e **buscas sem resultado**, com contagem, no período.
   - Um termo só aparece com 3 ou mais buscas no período (k-anonimato).
   - Ação "Criar pauta" leva ao rascunho novo com o termo como título provisório.
5. **Fontes agregadas.**
   - Por fonte: cliques de saída (§3), leituras e seguidores (`source_stats_daily`), CTR das recomendações (O17).
   - Serve para negociar com veículo e para avaliar o Panorama.
6. **Google** (§7).
   - Consultas, cliques, impressões, CTR e posição média do Search Console, por página e por consulta.
   - Atraso de 2 a 3 dias, avisado na tela.
   - Sem credencial: estado vazio que explica o que configurar e leva a Integrações.

**Visual:**
- Tokens e componentes do Estúdio, gráficos com o padrão do Control Center (Custos O09).
- Sem card aninhado, texto nunca só em cor e axe sem violação.

**Banco:**
- Funções `audience_overview`, `audience_articles`, `audience_traffic`, `audience_search`, `audience_sources` e `audience_google`.
- Todas são `security definer`, recebem `(p_from date, p_to date, p_sections text[])` e conferem `metrics.view` dentro da função, como `ai_cost_daily`.

## 6. Busca agregada

- O registro acontece no servidor, na página `/busca`, por `after()` do Next depois de renderizar. Não depende de consentimento e não guarda identificador.
- `normalizeSearchQuery(q)`:
  - minúsculas, sem acento, espaços colapsados, até 80 caracteres;
  - devolve `null` (não grava) para e-mail, telefone, CPF ou CNPJ, sequência de 5 ou mais dígitos, menos de 2 caracteres ou robô.
- Tabela `search_stats_daily (day, query, searches, zero_results)`, com o mesmo `metric_keys` contra recarga.
- Termos com menos de 3 buscas somem depois de 90 dias. A agregação vale 25 meses.

## 7. Google Search Console

- **Verificação:** variável `GOOGLE_SITE_VERIFICATION` em `metadata.verification.google` do layout raiz. Sem variável, nada sai.
- **Importação:** cron diário às 05h17 UTC na rota `/api/jobs/search-console`.
  - Protegida por `Authorization: Bearer ${CRON_SECRET}`.
  - Usa a API Search Analytics com conta de serviço (`GSC_SERVICE_ACCOUNT_JSON` e `GSC_SITE_URL`).
  - Grava `search_console_daily (day, page, query, clicks, impressions, ctr, position)` com os últimos 3 dias (idempotente por `day, page, query`). Limite de 5.000 linhas por dia.
- **Sem credencial:** a rota responde 200 com `skipped`, Integrações mostra "não configurado" e a aba Google mostra o estado vazio.
- Os sitemaps (`sitemap.xml` e `sitemap-news.xml`) são enviados uma vez à mão pelo dono no painel do Search Console. A ação do dono é registrada em BLOCKERS.

## 8. GA4 e GTM

- **Instalação:** um contêiner GTM (`NEXT_PUBLIC_GTM_ID`). A tag do GA4 (`G-…`) fica **dentro do GTM**, configurada pelo dono. O código não chama `gtag` direto.
- **Liga e desliga:**
  - flag `ga4_enabled` em `feature_flags` (padrão desligada, migration 0188);
  - interruptor em Admin › Interruptores, ação auditada, uma pessoa (admin).
- **Quando carrega** (decisão do dono em 08/10/2026): em todas as páginas públicas, com a flag ligada e o ID definido, **antes da escolha no banner**.
  - Com "Só o necessário", o GTM continua carregando, mas com todos os sinais negados. Isso impede cookie `_ga` e uso para anúncio. Os cookies `_ga*` que já existirem são apagados.
  - Base legal até a escolha: legítimo interesse, informado no banner e em `/privacidade`.
- **Consent Mode v2:**
  - padrão `granted` para todos os sinais (`analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization`), enquanto o leitor não escolhe e quando ele aceita (decisão do dono, revista quando houver AdSense);
  - "Só o necessário" muda todos para `denied`;
  - escolher só Métricas deixa `analytics_storage: granted` e os sinais de anúncio `denied`.
- **Script:**
  - `next/script` com o `nonce` da requisição; o `strict-dynamic` da CSP aceita o que o GTM carrega;
  - CSP com GTM ligado: `connect-src` e `img-src` ganham `https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com`, e `frame-src` ganha `https://www.googletagmanager.com` (modo de visualização do GTM);
  - sem GTM, a CSP fica idêntica à de hoje.
- **dataLayer:**
  - `page_view` em toda navegação no cliente, com `page_kind` e `section`;
  - `article_read`, `article_shared`, `search_submitted`, `newsletter_signup`, `app_installed`, `notif_permission_granted`, `source_followed`;
  - só com propriedades sem dado pessoal: `content_id`, `section`, `article_kind`, `channel`, `results_count`. **Nunca o termo de busca.**
- **Segurança:** o GTM pode injetar qualquer script.
  - Só o dono (ou quem ele designar) publica versões do contêiner.
  - Tags personalizadas de HTML ficam proibidas por regra interna, anotada em `docs/architecture.md`.
  - Retenção de dados do GA4 e Google Signals: configuração do dono (B-032). Recomendado: retenção de 2 meses e Signals desligado até haver AdSense.
- **Textos:** o banner e `/privacidade` passam a citar o Google Analytics na categoria Métricas. Sobe a versão da política de consentimento para `v2`, então o banner pergunta de novo a todos.
- **Integrações (A13):** mostra GTM, Search Console, Sentry e Speed Insights com "configurado", "não configurado" ou "desligado", nunca o valor da chave.

## 9. Speed Insights e Sentry

**Speed Insights:**
- `@vercel/speed-insights`, componente `SpeedInsights` no layout público.
- Script e envio pela mesma origem (`/_vercel/*`), sem cookie e sem mudança de CSP.
- Ligado só em produção.

**Sentry:**
- `@sentry/nextjs`, ativo só com `SENTRY_DSN`.
- Envio pela rota túnel `/monitoring` (mesma origem, sem mudança de CSP).
- `sendDefaultPii: false`, sem replay e taxa de traces de 0,1.
- `beforeSend` tira query string, cookies, cabeçalhos e corpo.
- Erros do servidor, do cliente público e do Estúdio. O usuário do Estúdio entra só como papel, nunca como e-mail.

## 10. Ajuste técnico: partições de `events`

- A tabela `events` é particionada por `received_at`, mas só tem `events_default`.
- Migration 0189:
  - cria as partições mensais do mês atual e dos 2 seguintes;
  - função `events_ensure_partitions()` com cron mensal (dia 25, 04h11 UTC);
  - move as linhas de `events_default` para as partições do seu mês, em lotes, sem lock longo.
- Os índices continuam os de 0001.

## 11. Testes

- **Unitários puros:**
  - `classifyReferrer` (tabela de casos);
  - `deviceClass`;
  - `pageKind`;
  - `normalizeSearchQuery` (e-mail, telefone, CPF, acento, 80 caracteres);
  - `metricHitSchema`;
  - `consentModeState`;
  - `gtmCsp`;
  - funções de período e variação da Audiência.
- **Rotas:** `/api/metrics/hit`: robô 204, corpo grande 413, sem sal 503, dedupe; job do Search Console sem credencial (`skipped`) e com resposta fake.
- **Integração (CI com Supabase):**
  - `metric_track` soma e deduplica;
  - `audience_*` respeitam a editoria do editor;
  - partição recebe as linhas novas.
- **e2e:**
  - visita conta sem consentimento;
  - nenhum pedido a `googletagmanager.com` com a flag desligada;
  - antes da escolha, o GTM carrega com os sinais concedidos;
  - com "Só o necessário", sinais negados e nenhum cookie `_ga`;
  - com Métricas e flag ligada, carrega uma vez;
  - tela Audiência com dados fake nos quatro estados;
  - axe sem violação.
- Lighthouse sem regressão: o orçamento de JS da página pública não muda sem GTM.

## 12. Fora do escopo

- Vercel Web Analytics.
- Envio servidor a servidor ao GA4 (Measurement Protocol).
- Medição auditada (Comscore).
- Publicidade do Google (AdSense e Ad Manager). Os sinais `ad_*` já ficam concedidos por decisão do dono e serão revistos quando ela entrar.
- Mapa de calor e gravação de sessão.
- "Mais lidas" pública passando a usar `content_stats_daily`: pode vir depois, mas hoje a regra é por horas e o agregado é diário.
- Métricas de newsletter: ainda não há envio.
