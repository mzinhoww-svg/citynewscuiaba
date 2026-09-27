# CityNews Cuiabá · Painel de Fontes (spec da funcionalidade)

> **Status: RASCUNHO em revisão pelo dono (brainstorming).** Não implementar antes da aprovação.

Status: **proposta para aprovação do dono do produto** (27/09/2026). Nada aqui revoga a spec mestre; onde houver conflito, a spec mestre vence e o ponto aparece em "Decisões pendentes do dono" (§5).
Caminho: arquitetural (brainstorming → spec → plano `docs/superpowers/plans/2026-09-27-painel-de-fontes.md` → subagent-driven-development).
Origem: pedido literal do dono, registrado abaixo.

> "Preciso ter um painel do admin que somente o admin e pessoas autorizadas acessam que é o painel de fontes, onde podemos configurar a partir de links as fontes desejadas (outros sites de notícias) a ia tem a 'inteligência' de consumir da melhor forma, podemos dar score as fontes, ajustar itens, priorizar ou não, excluir, pausar, colocar a frequência de busca de noticias novas nessa fonte que pode ser diferente do padrão geral."

Referências: spec mestre `docs/superpowers/specs/2026-09-27-citynews-design.md` (§6.1 fonte, §6.2 ciclo, §6.3 confiança, §6.6 prompt, §7 ranking, §8 papéis, §9 fontes reais) · `docs/architecture.md` (§5 dados, §6 permissões, §7 segurança, §10 alertas) · `docs/screens.md` (O03, O04, estados padrão) · `docs/sources-registry.md` (regras de coleta) · plano P5 Task 4 (esta funcionalidade a antecipa e amplia) · decisões A-010, A-017, A-027, A-029, A-030, A-031, A-038, A-048.

---

## 1. Problema

O registro de fontes existe só no banco (`sources`, 0001) e no seed real (32 fontes, todas `paused`). Ativar, pausar ou ajustar uma fonte hoje exige SQL ou script (`activateSource`). Não há como:

- cadastrar uma fonte nova só colando um link e deixar o sistema descobrir como consumi-la;
- dizer quais fontes valem mais para a redação (score) e quais coletar primeiro (prioridade);
- mudar a frequência de uma fonte sem mexer no banco;
- pausar, bloquear ou tirar uma fonte de circulação sem apagar histórico;
- ver a saúde de cada fonte (falhas, frescor, disponibilidade) num lugar só;
- auditar quem mudou o quê.

A tela O03/O04 (P5-T4) previa lista, cadastro, teste de conexão e aba Recomendação, sem descoberta por link, sem IA, sem score editorial, sem frequência por fonte e sem ciclo de vida completo.

## 2. Objetivo

Um painel no Control Center, em `/estudio/control/fontes`, onde quem tem `source.manage` (admin, editor-chefe, operador de IA):

1. **Cadastra por link:** cola a URL de uma home, seção, feed ou página; o sistema normaliza, confere `robots.txt`, descobre o melhor modo de consumo, testa, mostra a prévia dos últimos itens e sugere nome, slug, editorias, localidade, frequência e confiabilidade. A IA (agente `source_profiler`) ajuda onde regra fixa não resolve; toda sugestão fica marcada e só entra com clique humano.
2. **Pontua e prioriza:** score editorial 1 a 5 (manual) e prioridade de coleta Alta/Normal/Baixa, separados do score operacional (calculado) e do score de recomendação (spec §7).
3. **Ajusta:** nome exibido, logotipo, editorias, localidade, camada, confiabilidade, políticas de imagem e de republicação, fonte única, limite de requisições, acordo, responsável, recomendação (fixar, destacar local, excluir).
4. **Controla o ciclo de vida:** ativar, pausar, retomar, bloquear, excluir (arquivar) e restaurar, com pausa automática após 3 falhas seguidas.
5. **Define a frequência por fonte** entre 30 min e 24 h, com padrão global configurável, e vê a próxima coleta prevista.
6. **Coleta agora** uma fonte, respeitando `robots.txt` e limites.
7. **Audita tudo**, com duas pessoas nas mudanças que ampliam direitos ou autonomia.

## 3. Não objetivos

- Frequência abaixo de 30 min (contraria spec §6.2; ver DP-1).
- Mudar a fórmula de confiança (spec §6.3), as regras de autonomia (spec §6.4) ou os pesos `rec-v1` (spec §7.1).
- Colocar o score editorial dentro do score de recomendação. Isso seria um componente novo de peso (`rec-v2`) e passaria pela aprovação dupla de pesos (spec §8); fica como proposta (DP-3).
- Apagar fisicamente uma fonte, seus itens ou matérias. Não existe "excluir de verdade" pela interface.
- Coletar redes sociais, newsletters por e-mail ou APIs com chave (tipos `social`, `newsletter` e `api` autenticada continuam fora do MVP; o painel aceita `api` só para JSON Feed público, A-031).
- Copiar corpo de matéria para a prévia, para o modelo ou para o banco de sugestões (regra 4 do CLAUDE.md).
- Painel de leitura para `metrics.view`: o dono pediu acesso restrito. A saúde agregada das fontes continua na Visão geral (O01, P5-T3) para quem tem `metrics.view`.

## 4. Decisões do brainstorming

Mesmo formato da spec mestre §2: opções consideradas, escolha, motivo. "Reversível" indica se dá para voltar atrás sem migração destrutiva.

| # | Tema | Opções | Escolha | Motivo |
|---|---|---|---|---|
| D-F1 | Rota e acesso | (a) `/estudio/admin/fontes` · (b) `/estudio/control/fontes` com subpáginas · (c) painel separado fora do Estúdio | **(b)** `/estudio/control/fontes`, `/nova`, `/[id]` e subpáginas; guarda `requireRole("source.manage")` no layout e em cada Server Action | Já é a rota de O03/O04 e o item de menu existe (`src/app/estudio/nav.ts`); herda StudioShell, sessão e RLS |
| D-F2 | Quem acessa | (a) só `admin` · (b) papéis com `source.manage` (admin, editor-chefe, operador de IA) · (c) (b) + leitura para `metrics.view` | **(b)**. "Pessoas autorizadas" = quem recebe um desses papéis em A02/A03 | Respeita "somente o admin e pessoas autorizadas" e a matriz de `docs/architecture.md` §6 sem criar papel novo; (c) contraria o pedido |
| D-F3 | O que exige duas pessoas | (a) nada além da spec §8 · (b) toda mudança · (c) só mudanças que **ampliam** direito de uso ou autonomia | **(c)**: afrouxar `image_policy`; `republish_policy` de `link_only` para `summary_2_sentences`; subir confiabilidade para `verified` ou `primary`; `may_be_sole_source` de falso para verdadeiro; desbloquear fonte `blocked` | Essas mudanças aumentam risco jurídico (A-010, B-002) ou deixam o pipeline publicar com menos checagem (spec §6.3/§6.4). Restringir, pausar, bloquear e arquivar reduzem risco e precisam ser imediatos (opt-out em 24 h). Amplia a lista da spec §8 sem contrariá-la (DP-2) |
| D-F4 | Segunda assinatura | (a) qualquer outra pessoa com `source.manage` · (b) só `admin` ou `editor_chefe` | **(b)**, com ação nova `source.approve_critical` (admin e editor-chefe, `second`) | Mesmo padrão de `prompt.publish`: operador de IA propõe, liderança aprova; evita dois operadores se aprovarem |
| D-F5 | Onde a regra de duas pessoas vale | (a) interface · (b) banco | **(b)**: trigger `guard_source_changes` só aplica campo crítico se houver `approvals` `source.critical` aprovada por outra pessoa para aquele campo e valor, e a consome (`applied`) | Igual a A-027 (`role.admin`): vale para qualquer caminho (Estúdio, REST, SQL como `authenticated`) |
| D-F6 | Score | (a) um número só · (b) três scores separados | **(b)**: **editorial** (manual, 1 a 5), **operacional** (calculado, 0 a 100) e **recomendação** (ranking P2, não editável aqui) | Misturar opinião da redação, saúde técnica e comportamento do leitor esconde a causa de cada decisão |
| D-F7 | Escala do score editorial | 0–100 · 1–10 · 1–5 | **1 a 5** (`editorial_score`, padrão 3), semeado com a "Relev." de `docs/sources-registry.md` | É a escala que a redação já usa no registro; 0–100 dá falsa precisão |
| D-F8 | "Priorizar ou não" | (a) booleano novo · (b) reaproveitar `sources.priority` 1–3 | **(b)** exibido como Alta (1), Normal (2), Baixa (3) | Coluna já existe e já ordena o tick (`activeSources` ordena por `priority`) |
| D-F9 | Efeito do score editorial | (a) entra na confiança · (b) entra no ranking como peso · (c) ordem e desempate onde não há regra aprovada | **(c)**: ordem de coleta (prioridade, depois score); desempate no Panorama e no "Veja também em outros portais"; score 1 tira a fonte do Panorama da home (continua coletada e na cobertura do assunto); exibido ao lado da fonte na revisão (P4). Não entra em `computeConfidence` nem no `rec-v1` | Confiança e pesos são regras aprovadas (spec §6.3, §8); mudar por um campo de formulário furaria a governança. Teto de 25% e cota de descoberta ficam intactos porque o ranking não muda |
| D-F10 | Score editorial é mudança crítica? | sim · não | **Não**: uma pessoa com `source.manage`, auditado, com motivo opcional | Não altera publicação, confiança, pesos nem direitos; efeito é local (ordem e Panorama) e reversível em um clique |
| D-F11 | Cadastro por link | (a) formulário manual · (b) link + descoberta por regra · (c) link + regra + IA | **(c)** em camadas: regra determinística primeiro (normalizar URL, robots, autodiscovery RSS/Atom/JSON Feed, `Sitemap:` do robots, caminhos conhecidos, sitemap de notícias, página), IA só para o que regra não resolve | Regra é barata, testável e explicável; IA ajuda em editorias, localidade, qualidade e seletores de página |
| D-F12 | Papel da IA | (a) IA decide e grava · (b) IA sugere, humano confirma | **(b)** agente `source_profiler` via `callAgent` + `wrapAsData`, saída zod. A IA **nunca** sugere políticas de imagem/republicação nem "fonte única"; confiabilidade e frequência vêm de regra | Regra 6 do CLAUDE.md; políticas são decisão jurídica humana |
| D-F13 | O que vai ao modelo | título + trecho · só títulos, datas, caminhos de URL, `og:site_name`, meta description e esqueleto do DOM sem texto | **Só metadados** (máx. 20 títulos, esqueleto ≤ 4 000 caracteres). Item com padrão de instrução é descartado antes da chamada; sem 3 itens limpos, a IA não é chamada | Nada de corpo de matéria (regra 4); superfície mínima para injeção |
| D-F14 | Frequência por fonte | (a) só global · (b) override livre · (c) override de 30 min a 24 h em múltiplos de 30, padrão global configurável | **(c)** `frequency_minutes` passa a aceitar `null` (= segue o padrão), padrão em `app_settings` `sources.default_frequency_minutes` = 30 | O tick roda a cada 30 min; valor que não é múltiplo de 30 vira, na prática, o próximo múltiplo e confunde a "próxima coleta prevista" |
| D-F15 | Menos de 30 min | permitir · recusar e registrar | **Recusar** (validação zod e `check` no banco) e registrar DP-1 | Spec §6.2, constraint de 0001 e plano P3 fixam 30 min |
| D-F16 | Próxima coleta | coluna `next_fetch_at` gravada · cálculo puro | **Cálculo puro** `nextCollectionAt()` a partir da janela da última coleta | Sem coluna que desalinha do tick; mesma função decide no tick e exibe na tela |
| D-F17 | Vencimento no tick | manter `dueSources` atual · comparar janelas | **Comparar janelas de 30 min** (`windowStart(agora) − windowStart(última coleta) ≥ frequência`) | Correção de defeito encontrado na leitura do código: com tolerância de 2 min, fonte de 30 min coletada às 14:07 não vence às 14:30 (23 min) e só é coletada às 15:00; o problema piora quanto mais o drain demora |
| D-F18 | Pausa automática | nenhuma · após N falhas | **3 falhas seguidas** (spec arquitetura §10) com estados: 1ª e 2ª falha → `degraded` (continua coletando), 3ª → `paused` motivo `auto_failures`; sucesso zera. Retries dentro do mesmo ciclo contam como uma falha; limite próprio atingido e 304 não contam | Alinha `degraded`, que existe no enum e não era usado, com o alerta "fonte com 3 falhas seguidas" |
| D-F19 | Excluir | (a) `delete` · (b) status novo `archived` · (c) soft delete com `archived_at` ortogonal ao status | **(c)**: arquivar exige status `paused` ou `blocked`, motivo e confirmação digitando o nome da fonte; `delete` revogado para `authenticated`; restaurar volta para `paused` | Itens (`raw_items`, `collected_items`) e matérias referenciam a fonte; o enum de status não muda; restaurar é trivial |
| D-F20 | Opt-out do veículo | só bloquear · bloquear + remover imagens | **Bloquear com motivo `opt_out`**: `image_policy` vira `none`, `takedownReproduction({ sourceId })` roda na hora (A-010, A-038) e os itens somem do portal pelas views públicas | Remoção em 24 h com margem; nenhuma segunda pessoa no caminho |
| D-F21 | "Coletar agora" | reaproveitar o run da janela · run manual próprio | **Run manual** (`ingest_runs.trigger = 'manual'`) só com o `fetch` da fonte; o índice único de janela passa a valer só para `trigger = 'cron'`; watchdog e "ciclo anterior aberto" ignoram runs manuais | `raw_items` é único por `(run, fonte)`: reaproveitar o run da janela devolveria o bruto antigo; run manual não pode esconder um tick atrasado do watchdog. Mesmo desenho de `runNow` do P5-T3 |
| D-F22 | Onde grava auditoria | na Server Action · trigger no banco | **Trigger** `audit_source_changes` (diff dos campos de configuração e de status) + contexto (motivo, lote, hash de IP) passado por RPC na mesma transação | "Toda mudança" vale para qualquer caminho; campos operacionais (`last_fetched_at`, `etag`, `last_error`, contador) não poluem o histórico |
| D-F23 | Escrita concorrente | última escrita vence · versão otimista | **Versão otimista** (`sources.version`): RPC recebe a versão lida; diferente → "Esta fonte foi alterada por {pessoa} às {hora}. Recarregue para ver a versão atual." | Duas pessoas com o painel aberto é o caso normal |
| D-F24 | Abas do detalhe | Tabs ARIA no cliente · subrotas | **Subrotas** com navegação `aria-label="Seções da fonte"` e `aria-current="page"` | Cada aba carrega só os próprios dados no servidor; link compartilhável; sem JS para trocar de aba |
| D-F25 | Logotipo | URL externa · upload | **Upload** PNG ou WebP, até 200 KB, quadrado, ≥ 96 px, no bucket público `source-logos`; SVG recusado | Sem hotlink de terceiro (CSP), sem SVG com script |
| D-F26 | Orçamento do agente novo | somar ao teto · redistribuir | **Redistribuir**: `source_profiler` R$ 1/dia, `write` de R$ 12 para R$ 11; teto global continua R$ 30 (A-006) | O teste de defaults exige soma igual ao teto |
| D-F27 | Camada | derivar da confiabilidade · coluna | **Coluna `layer`** 1 Oficial, 2 Portal local, 3 Temático/Regional, 4 Nacional, semeada do registro | O registro usa camada como filtro natural da redação e ela não é igual à confiabilidade |

## 5. Decisões pendentes do dono

| # | Ponto | Por que depende do dono | Padrão até a resposta |
|---|---|---|---|
| **DP-1** | Frequência menor que 30 min | Contraria spec §6.2 ("ciclo de 30 minutos"), o `check (frequency_minutes >= 30)` de 0001 e o plano P3. O tick só roda a cada 30 min (`*/30`), um run por janela, orçamento de 28 min, e o próximo ciclo não começa enquanto o anterior coleta. Abaixo de 30 min exigiria (a) mudar o ciclo inteiro para 15 min (dobra chamadas de IA e custo, revisa o orçamento de 28 min e as regras de janela) ou (b) criar uma "via rápida" com cron próprio só de `fetch` para fontes marcadas (runs `trigger = 'fast'`, sem mexer nas fases 3–6), com mais carga nas fontes e no limite `rate_limit_per_hour` | Mínimo 30 min; o campo explica "O ciclo do CityNews roda a cada 30 minutos" |
| DP-2 | Lista de mudanças críticas de fontes (D-F3) | Amplia a lista da spec §8; deixa o fluxo mais lento para afrouxar políticas | Aplicada como em D-F3 |
| DP-3 | Score editorial no ranking de recomendação | Exigiria `rec-v2` com componente novo e aprovação dupla de pesos (spec §8) | Fora do ranking; só ordem, desempate e Panorama (D-F9) |

## 6. Modelo de dados (migration `0010_source_admin.sql`)

Numeração: 0005 fica reservada para `source_stats` do P2 e 0006–0009 já existem (A-028). Todas as mudanças são aditivas, menos a troca do índice único de `ingest_runs` (D-F21) e a coluna `frequency_minutes` que passa a aceitar `null`.

### 6.1 `sources` (colunas novas ou alteradas)

| Coluna | Tipo | Regra |
|---|---|---|
| `frequency_minutes` | `int null` | `null` = padrão global. `check (frequency_minutes is null or (frequency_minutes between 30 and 1440 and frequency_minutes % 30 = 0))`. Linhas com 30 viram `null` |
| `editorial_score` | `smallint not null default 3` | `check between 1 and 5` |
| `layer` | `smallint` | `check between 1 and 4` (1 Oficial, 2 Portal local, 3 Temático/Regional, 4 Nacional) |
| `consumption` | `jsonb not null default '{}'` | Estratégia de consumo (§6.2), validada por zod na escrita |
| `status_reason` | `text` | `pending_activation`, `manual`, `auto_failures`, `robots`, `opt_out`, `legal`, `quality`, `other`. Fontes do seed: `pending_activation` |
| `status_changed_at` / `status_changed_by` | `timestamptz` / `uuid null` | `null` em `status_changed_by` = sistema |
| `consecutive_failures` | `int not null default 0` | Contador da pausa automática |
| `archived_at` / `archived_by` / `archive_reason` | `timestamptz null` / `uuid` / `text` | `check (archived_at is null or status in ('paused','blocked'))` |
| `terms_url` / `terms_reviewed_at` / `terms_reviewed_by` | `text` / `timestamptz` / `uuid` | Ativar exige termos revisados |
| `agreement_note` | `text` | Referência do acordo (a vigência já é `agreement_until`) |
| `created_by`, `updated_at`, `version` | `uuid`, `timestamptz`, `int default 1` | Versão otimista (D-F23) |

Ajustes no que já existe: `owner_id` = responsável (pessoa do Estúdio); `priority` 1–3 = prioridade; `display_name`, `logo_path`, `rec_pinned`, `rec_local_highlight`, `rec_excluded` seguem como estão (P2 já os consome).

### 6.2 `sources.consumption` (jsonb, schema zod `consumptionSchema`)

```json
{
  "strategy": "rss | atom | jsonfeed | sitemap_news | page_list | page_article",
  "feedUrl": "https://…",
  "alternates": ["https://…/rss"],
  "page": { "item": "article.card", "link": "a.card-link", "title": "h2", "date": "time" },
  "discovery": { "at": "2026-09-27T14:00:00Z", "by": "auto | human", "inputUrl": "https://…", "tried": 6 },
  "robots": { "checkedAt": "…", "allowed": true, "crawlDelaySec": null },
  "cadence": { "itemsPerDay": 42.5, "medianGapMinutes": 34, "sampledAt": "…" }
}
```

`kind` e `feed_url` continuam sendo o que o pipeline executa (`rss`, `sitemap`, `api`, `page`); `consumption` guarda o detalhe. `page_list` usa os seletores (lista de matérias numa seção) e `page_article` é o Readability atual (um item por página).

### 6.3 Tabelas novas

- **`source_health_daily`** `(day date, source_id uuid, fetch_ok int, fetch_not_modified int, fetch_failed int, items_new int, latency_ms_sum bigint, latency_samples int, last_error text, primary key (day, source_id))`. Escrita só por `service_role` via RPC `record_source_fetch(p_source, p_outcome, p_latency_ms, p_items_new, p_error)`. Leitura: `source.manage` e `metrics.view` (a Visão geral do P5 usa).
- **`source_discoveries`** `(id, input_url, final_url, source_id null, created_by, created_at, preview jsonb, suggestion jsonb, prompt_version int, accepted_fields text[])`. Prévia só com títulos, datas e URLs. Retenção 90 dias (job diário). Serve para auditar o que a IA sugeriu e o que a pessoa aceitou.
- **`app_settings`** `(key text primary key, value jsonb not null, updated_by uuid, updated_at timestamptz)`. Semente: `sources.default_frequency_minutes = 30`. Escrita de chaves `sources.*` por `source.manage`, auditada.

### 6.4 Outras mudanças

- `ingest_runs.trigger text not null default 'cron' check (trigger in ('cron','manual'))`; `unique(window_start)` vira índice único parcial `where trigger = 'cron'`; `start_ingest_run` passa a usar esse alvo; nova `start_manual_run(p_source uuid)`.
- `public_sources` exclui `archived_at is not null`. `public_aggregated` ganha `source_editorial_score` no fim (sem mudar colunas existentes).
- `revoke delete on sources from authenticated`.
- Triggers `guard_source_changes` (antes de update: campos críticos só com aprovação consumida; transições de status válidas; arquivada só aceita restaurar; `version`/`updated_at`) e `audit_source_changes` (depois de insert/update: diff para `audit_log`).
- RPCs `security invoker` (RLS vale): `source_admin_create(p jsonb, p_ctx jsonb)`, `source_admin_update(p_id, p_version, p_patch jsonb, p_ctx jsonb)`, `source_admin_status(p_id, p_version, p_action text, p_reason text, p_ctx jsonb)`, `source_admin_bulk(p_ids uuid[], p_action text, p_value jsonb, p_ctx jsonb)`. `p_ctx` = `{ reason, batchId, ipHash }`, gravado em `set_config('citynews.audit_ctx', …, true)` para o trigger de auditoria.
- Agente `source_profiler` em `ai_agents` e `ai_prompts` v1 (produção pelo seed, como em 0006); `write` com orçamento 11.
- Bucket `source-logos` (público, só leitura anônima; escrita `source.manage`).
- `layer` e `editorial_score` das 32 fontes reais por `slug` (relevância e camada do registro); em dev e CI a atualização não encontra linhas e não faz nada. `supabase/seed.sql` (fictícias) recebe valores próprios.

## 7. Fluxos

### 7.1 Cadastrar por link (`/estudio/control/fontes/nova`)

1. **Colar link.** Campo "Endereço da fonte" aceita home, seção, feed ou página. `normalizePastedUrl`: só `http`/`https` (força `https` quando responde), sem usuário e senha na URL, porta 80 ou 443, host em punycode, sem fragmento e parâmetros de rastreio, até 2 048 caracteres. Erros em linguagem simples com exemplo ("Use um endereço como https://www.exemplo.com.br/cidades").
2. **Duplicidade.** Mesmo host + caminho de fonte existente → "Esta fonte já está cadastrada: {nome}" com link. Se estiver arquivada → "Existe uma fonte arquivada para este endereço. Restaurar?".
3. **Análise** (limite 10 análises por hora por pessoa e 20 requisições por hora por host; no máximo 8 requisições por análise, todas via `crawlGet` com `CityNewsBot/1.0`):
   1. `robots.txt` do host (`checkRobots`); `Crawl-delay` vira teto do limite por hora sugerido.
   2. O próprio link já é feed ou sitemap? (`detectFormat`).
   3. HTML: autodiscovery `<link rel="alternate">` RSS, Atom e JSON Feed (`discoverFeed` + JSON Feed); links de termos de uso (`findTermsLinks`).
   4. Linhas `Sitemap:` do robots com sitemap de notícias.
   5. Caminhos conhecidos: `/feed`, `/rss`, `/atom.xml`, `/feed.json`, `/sitemap-news.xml`, `/news-sitemap.xml`.
   6. Sem feed: página como `page_list` (seletores da IA, validados) ou `page_article`.
   Cada candidato passa por `testConnection`; vence o de mais itens com data, na ordem feed > sitemap de notícias > JSON Feed > página. Tudo que foi tentado aparece em "Como descobrimos" com o resultado.
4. **Prévia:** até 10 itens mais recentes com título, data e link para o original, renderizados como texto; nenhuma imagem de terceiro carregada; nada do corpo.
5. **Sugestões por regra:** nome (`og:site_name` ou `<title>`), slug, frequência pela cadência observada (`suggestFrequency`), confiabilidade por domínio (`.gov.br`, `.jus.br`, `.mp.br`, `.leg.br` → sugere `primary`, marcada "exige segunda aprovação"), camada, limite por hora.
6. **Sugestões da IA** (`source_profiler`, se `ai_enabled` e orçamento): editorias (só das existentes), localidade, alertas de qualidade (caça-clique, agregador de terceiros, paywall, pouca relevância local, conteúdo patrocinado, itens sem data) e seletores de página. Cada uma com o selo "Sugestão da IA" e o botão "Usar sugestão"; nada da IA vai para o formulário sem esse clique. Seletores só aparecem se extraírem ao menos 3 itens com título e link do mesmo site. IA indisponível → aviso "Sugestões da IA indisponíveis agora. Preencha os campos manualmente." e o fluxo segue.
7. **Revisar e ajustar:** formulário completo (§7.2) com políticas no padrão mais restrito (`link_only`, imagem `none`, fonte única desligada).
8. **Termos e robots:** link dos termos encontrados (ou campo para colar), caixa "Li os termos de uso e a coleta é permitida" obrigatória para ativar.
9. **Salvar:** "Salvar pausada" (padrão, spec §9) ou "Salvar e ativar" (roda a ativação). Campos críticos diferentes do padrão restrito geram pedidos de aprovação no mesmo envio. `source_discoveries.accepted_fields` registra o que veio de sugestão.

### 7.2 Editar

Aba Configuração com seções: Identificação (nome, nome exibido, slug somente leitura depois de criada, logotipo, responsável) · Classificação (camada, editorias, localidade, confiabilidade) · Direitos (política de imagem, política de republicação, fonte única, acordo e vigência, nota do acordo, termos) · Coleta (estratégia e URL, seletores, frequência, limite por hora) · Importância (score editorial 1–5, prioridade Alta/Normal/Baixa). Aba Recomendação: fixar, destacar local, excluir da recomendação, com a explicação "Fixar conta no teto de 25% por fonte" e link para O17.

Ao salvar: diff contra a versão lida; campos não críticos aplicam na hora; críticos viram pedidos (§7.5). Toast "Alterações salvas" e, se houver pedido, alerta inline "2 alterações aguardam segunda aprovação".

### 7.3 Estados e transições

```
            ativar (robots + teste + termos)
 paused ─────────────────────────────────▶ active ◀──── sucesso ──── degraded
 (pending_activation | manual | auto_*)      │  └──── 1ª falha ────────▶ │
    ▲   ▲                                    │                            │ 3ª falha seguida
    │   └──────── pausar (manual) ───────────┘                            ▼
    │                                                            paused (auto_failures | robots)
    │ restaurar
 [arquivada] ◀── arquivar (paused ou blocked, motivo, confirmação) ── paused | blocked
                                                                          ▲
 active | degraded | paused ── bloquear (motivo; opt_out = remove imagens) ┘
 blocked ── desbloquear (duas pessoas) ──▶ paused
```

- **Retomar** fonte pausada roda `testConnection` antes de voltar a `active`; falha mantém `paused` e mostra o motivo.
- **Pausa automática:** notificação no Control Center (`notify_once`, dedupe 10 min) "Fonte {nome} pausada após 3 falhas seguidas: {último erro}".
- **Arquivar** ("Excluir fonte" na interface): sai da lista padrão (filtro "Arquivadas"), da coleta, de `public_sources` e das listas de recomendação; itens coletados, agregados já exibidos em assuntos e matérias que a citam continuam íntegros.
- **Bloquear** esconde do portal os agregados da fonte (views já filtram `blocked`). Motivo `opt_out` também põe `image_policy = 'none'` e remove as reproduções (D-F20).

### 7.4 Coletar agora

Botão na lista (menu da linha) e no detalhe, só para `active` e `degraded`. Cria run manual e enfileira `fetch` da fonte com chave própria; o restante do pipeline segue normal. Limites: 1 vez a cada 5 min por fonte e 20 por hora por pessoa. `robots.txt` e `rate_limit_per_hour` continuam valendo no `fetch`. Retorno: "Coleta enfileirada. Acompanhe em Coleta e teste." e, na aba, o resultado do run quando terminar (polling de 5 s, como o P5).

### 7.5 Mudança crítica (duas pessoas)

1. Pessoa A salva com campo crítico → `requestApproval({ kind: "source.critical", targetRef: "source:<id>:<campo>=<valor>", justification })`; justificativa obrigatória.
2. Banner no detalhe e na lista: "Aguardando segunda aprovação: política de imagem → reprodução, pedido por {A}".
3. Pessoa B (`source.approve_critical`, diferente de A) abre, vê o diff e a justificativa, clica "Aprovar e aplicar" ou "Recusar" (motivo).
4. A mesma pessoa tentando aprovar recebe "A aprovação precisa ser de outra pessoa" (banco e interface).
5. Aplicar consome a aprovação (`applied`); auditoria registra A, B, justificativa e diff. Se a fonte mudou o mesmo campo entre o pedido e a aprovação, o pedido fica obsoleto e é recusado automaticamente com motivo.

### 7.6 Ações em lote

Seleção na lista (até 50 por vez): Pausar, Ativar, Mudar frequência. Confirmação com a contagem; resultado por fonte ("12 pausadas, 1 ignorada: já estava pausada"). "Ativar" em lote só vale para fontes que já passaram por ativação (têm feed e termos revisados) e não estão bloqueadas nem arquivadas; as demais aparecem como ignoradas com o motivo. Um `batchId` liga as linhas de auditoria.

### 7.7 Padrão global de frequência

Em "Configurações da coleta" (topo da lista, só `source.manage`): "Frequência padrão" com as mesmas opções do campo por fonte (30 min a 24 h). Mostra quantas fontes seguem o padrão. Auditada como `settings.update`.

## 8. Telas e estados

Registro visual: `product` (PRODUCT.md), DESIGN.md do Estúdio, componentes do kit (Table, Field, Select, Checkbox, Dialog nativo, InlineAlert, Toast, Skeleton, EmptyState, ErrorState, Pagination, Tooltip), sem cor ou tamanho fora dos tokens, sem cards aninhados. Estados padrão de `docs/screens.md` valem em todas.

### O03 · Fontes (lista) · `/estudio/control/fontes`

- **Cabeçalho:** h1 "Fontes", contagem por status, "Adicionar fonte" (primário), "Configurações da coleta", banner de aprovações pendentes.
- **Busca e filtros** (na URL, inválidos ignorados, A-037): texto (nome, domínio), status (Ativa, Com falhas, Pausada, Pausada automaticamente, Bloqueada, Arquivada), camada, localidade, editoria, saúde (Saudável, Atenção, Crítica, Sem dados), aprovação pendente.
- **Tabela** (`<th scope="col">`, ordenação com `aria-sort`): seleção · Fonte (nome + domínio) · Status (ícone + texto) · Camada · Localidade · Score ("4 de 5") · Prioridade · Frequência ("1 h" ou "30 min · padrão") · Saúde (número + rótulo) · Última coleta · Próxima coleta · Erros 24 h · menu de ações (Coletar agora, Pausar/Retomar, Abrir). Ordenação padrão: score editorial desc, depois nome. 50 por página.
- **Barra de lote** aparece com seleção (`aria-live="polite"` anuncia "3 fontes selecionadas").
- **360 px:** a tabela vira lista de linhas (`SourceRow`) com nome, status, score, saúde e próxima coleta; ações no menu.
- **Estados:** carregando (skeleton de 8 linhas após 150 ms, `aria-busy`); vazio sem fontes ("Nenhuma fonte cadastrada ainda." + "Adicionar fonte"); vazio por filtro ("Nenhuma fonte com esses filtros." + "Limpar filtros"); erro ("Não foi possível carregar as fontes." + "Tentar de novo", filtros preservados); sucesso (toast com "Desfazer" para pausar/retomar por 10 s).

### O04a · Nova fonte · `/estudio/control/fontes/nova`

Passos visíveis (lista ordenada com o passo atual em `aria-current="step"`): Endereço → Análise → Revisão → Termos → Salvar. Análise com progresso textual por etapa em `aria-live="polite"` ("Lendo robots.txt… ok", "Procurando feed… encontrado RSS em /feed", "Testando… 25 itens"). Estados: analisando; nenhuma forma de consumo ("Não encontramos feed nem lista de notícias neste endereço. Tente o endereço de uma seção ou do feed."); robots proíbe ("O robots.txt de {host} não permite a coleta de {caminho}. A fonte não pode ser cadastrada para coleta."); host recusado ("Este endereço não é permitido."); limite ("Você fez muitas análises na última hora. Tente de novo em {n} min."); sucesso com prévia. Texto digitado nunca se perde em erro.

### O04 · Fonte (detalhe) · `/estudio/control/fontes/[id]` e subrotas

Cabeçalho: nome, domínio (link externo), status com motivo ("Pausada automaticamente em 27/09 14:30 após 3 falhas"), score, ações principais (Coletar agora, Pausar/Retomar, Bloquear, Excluir fonte).

| Subrota | Conteúdo |
|---|---|
| `/` Resumo e saúde | Score operacional com componentes (disponibilidade 30 d, taxa de erro 24 h, frescor), gráfico de 30 dias em SVG com resumo textual, última e próxima coleta, último erro, itens novos por dia |
| `/configuracao` | Formulário da §7.2, com campos críticos marcados "Exige segunda aprovação" |
| `/coleta` | Estratégia atual, "Como descobrimos", "Testar conexão" (sem ingestão), "Coletar agora", "Reanalisar link" (reabre sugestões), resultado dos últimos 10 runs da fonte |
| `/recomendacao` | Nome e logotipo exibidos, fixar, destacar local, excluir da recomendação, prévia do `SourceCard` |
| `/historico` | Auditoria da fonte (quem, quando, o quê, antes → depois, motivo, aprovação), filtro por tipo, exportar CSV (IP mascarado para quem não é admin) |
| `/itens` | Últimos 50 itens coletados (título, data, estado no pipeline, assunto), link para o original |

Estados: 404 amigável para id inexistente; arquivada abre em modo leitura com "Restaurar fonte"; conflito de versão com "Recarregar"; erro por aba sem derrubar as outras.

### Diálogos

- **Excluir fonte:** explica o que acontece, motivo obrigatório, digitar o nome da fonte para confirmar (padrão das ações de contingência do P5).
- **Bloquear:** motivo (Pedido do veículo, Jurídico, Qualidade, Outro) e texto; "Pedido do veículo" explica a remoção das imagens.
- **Aprovar mudança crítica:** diff, justificativa do pedido, quem pediu, "Aprovar e aplicar" / "Recusar".

### Acessibilidade (WCAG 2.2 AA)

Um `h1` por página; landmarks; foco visível; alvos ≥ 44 px; status sempre com ícone e texto; estrelas do score com texto ("4 de 5"); campos com rótulo visível, erro com ícone, texto e exemplo; diálogos com foco preso e retorno ao gatilho; ordenação e seleção operáveis por teclado; gráficos com resumo textual; `prefers-reduced-motion` respeitado; 0 violações `serious`/`critical` no axe.

## 9. Permissões e auditoria

| Ação no painel | Permissão | Duas pessoas |
|---|---|---|
| Ver lista, detalhe, histórico | `source.manage` | não |
| Analisar link, cadastrar, editar campos não críticos, score, prioridade, frequência, recomendação | `source.manage` | não |
| Ativar, pausar, retomar, coletar agora, testar, lote | `source.manage` | não |
| Bloquear (qualquer motivo), arquivar, restaurar | `source.manage` | não (motivo obrigatório; arquivar com confirmação digitada) |
| Afrouxar política de imagem, liberar resumo, subir confiabilidade para `verified`/`primary`, ligar fonte única, desbloquear | pedir: `source.manage`; aprovar: `source.approve_critical` | **sim** |
| Padrão global de frequência | `source.manage` | não |

`source.approve_critical` entra em `PERMISSIONS` (admin `second`, editor_chefe `second`) e na matriz de `docs/architecture.md` §6.

Auditoria (`audit_log`, só inserção, retenção 5 anos, spec §10): `source.create`, `source.update`, `source.status` (inclui `auto_pause` com ator `sistema`), `source.archive`, `source.restore`, `source.collect_now`, `source.test`, `source.analyze`, `source.approval_requested`, `source.approval_applied`, `source.approval_rejected`, `settings.update`. `details`: `{ changes: [{ field, from, to }], reason, batchId, approvalId }`. `object_ref = 'source:<id>'`. `ip_hash` com o sal diário (A-048).

## 10. Segurança

- **SSRF.** A URL colada é de terceiros e a requisição sai do servidor. Toda requisição do painel passa por `crawlGet`/`checkRobots` de `src/lib/pipeline/http.ts`; nunca `fetch` direto. Depende do reforço em andamento em `http.ts`/`crawl.ts` (redirecionamento manual com revalidação de cada salto, resolução DNS e recusa de IP privado, loopback, link-local, CGNAT, IPv4 mapeado em IPv6, metadados de nuvem). Além disso, o painel recusa na entrada: esquema diferente de http/https, credenciais na URL, porta diferente de 80/443, host sem ponto, IP literal privado. Os seletores CSS vindos da IA são validados (`isSafeSelector`: tamanho, caracteres, sem `<`, `{`, `}`, `@`).
- **Limites:** análise 10/h por pessoa e 20 requisições/h por host (bucket `discover`); coletar agora 1/5 min por fonte e 20/h por pessoa; lote até 50 fontes; testar conexão 30/h por pessoa. Tudo via `hit_rate_limit` (compartilhado entre instâncias, A-028).
- **CSRF.** Só Server Actions (checagem de `Origin` do Next, cookies `SameSite=Lax`); nenhuma rota `GET` muda estado; `allowedOrigins` não é ampliado.
- **Autorização em profundidade.** `requireRole` no layout e em cada ação; RLS `sources_manage` (0002) para escrita; `delete` revogado; campos críticos no trigger; `source_health_daily` e `source_discoveries` sem escrita por `authenticated` (exceto discoveries pela RPC da análise).
- **Texto externo.** Títulos e metadados passam por `sanitizeExternalText`; para o modelo, `callAgent` com `wrapAsData` e `SYSTEM_GUARD`; item com padrão de instrução é descartado e contado ("2 itens descartados por conter instruções"); na tela tudo é texto (sem `dangerouslySetInnerHTML`), links externos com `rel="noopener noreferrer"` e sem imagens de terceiros.
- **Dados guardados:** sem HTML bruto das análises; prévias com 90 dias; nenhum dado pessoal de leitor.
- **Auditoria append-only** (trigger de 0001, políticas de 0002).

## 11. Integração com o que existe

- **P3 pipeline:** `dueSources` e `activeSources` passam a considerar `degraded`, frequência `null` = padrão, ordem prioridade → score e vencimento por janela (D-F17); `fetch` registra saúde, latência e o contador de falhas; `extract` ganha `page_list`; `activateSource` passa a exigir termos revisados quando chamada pelo painel.
- **P5-T4:** coberta por esta funcionalidade (`testConnection` com a mesma interface e as mesmas mensagens). P5-T3 (`SourceHealthTable`, "Pausada (auto)") lê `source_health_daily` e `status_reason`. P5-T1 (aprovações) nasce aqui com a interface do plano P5, limitada a `source.critical`, e o P5 a estende.
- **P2 ranking/Panorama:** nada muda em `src/lib/ranking`. Panorama (P2) deve ordenar por recência com desempate por `source_editorial_score` e excluir score 1; a home (P1, `queries/home.ts`) aplica isso já nesta funcionalidade.
- **Mídia:** opt-out reaproveita `takedownReproduction({ sourceId })`.

## 12. Critérios de aceite

1. Sem sessão, `/estudio/control/fontes` redireciona para `/entrar?next=/estudio/control/fontes`; com papel sem `source.manage` (ex.: `analista`, `editor`), para `/entrar?next=…&motivo=sem-permissao`; o item "Fontes" não aparece no menu desses papéis.
2. Admin, editor-chefe e operador de IA veem a lista com busca, filtros na URL, ordenação por score, saúde, última coleta e nome, e paginação de 50.
3. Colar `https://vozdocoxipo.example/` (veículo fictício de teste, com `<link rel="alternate" type="application/rss+xml">`) mostra estratégia RSS, 10 itens na prévia (título, data, link), nome sugerido "Voz do Coxipó" e frequência sugerida pela cadência; colar `https://folhadocerrado.example/`, já cadastrada no seed, mostra "Esta fonte já está cadastrada: Folha do Cerrado".
4. Colar o endereço de um feed direto é reconhecido como feed sem buscar a home.
5. Página sem feed com lista de matérias gera seletores sugeridos pela IA que extraem ≥ 3 itens; seletores que extraem menos são descartados sem aparecer.
6. Nenhuma sugestão da IA entra no formulário sem clique em "Usar sugestão"; políticas começam em `link_only` e imagem `none`; a IA nunca devolve política, fonte única ou confiabilidade (schema zod recusa).
7. Nada do corpo das matérias aparece na prévia, na entrada do modelo (`ai_calls` do teste) nem em `source_discoveries`.
8. `robots.txt` que proíbe o caminho impede cadastrar para coleta e mostra a mensagem com o host e o caminho.
9. URL com IP privado, `localhost`, credenciais, porta 8080 ou redirecionamento para `169.254.169.254` é recusada com "Este endereço não é permitido." e nenhuma requisição chega ao destino interno.
10. Fonte nova entra `paused` com motivo `pending_activation`; "Salvar e ativar" só funciona com termos revisados e teste ok.
11. Frequência aceita 30 min a 24 h em múltiplos de 30; 20 e 45 são recusados na interface e no banco; `null` segue o padrão global; mudar o padrão global muda a próxima coleta prevista das fontes que o seguem.
12. Fonte de 30 min coletada às 14:07 vence no tick de 14:30; fonte de 2 h coletada às 14:05 mostra "Próxima coleta prevista: 16:00".
13. Três runs seguidos com falha de `fetch` pausam a fonte (`auto_failures`) e notificam o Control Center; 1ª e 2ª falhas deixam `degraded` e a fonte continua sendo coletada; um sucesso volta a `active` e zera o contador; retries no mesmo run contam uma vez.
14. "Coletar agora" cria run manual só com o `fetch` da fonte, não altera o run da janela, não aparece como tick para o watchdog e respeita 1 vez a cada 5 min por fonte.
15. Mudar política de imagem de `none` para `reproduction` não tem efeito até outra pessoa com `source.approve_critical` aprovar; a mesma pessoa recebe "A aprovação precisa ser de outra pessoa"; update direto por SQL como `authenticated` também é recusado pelo trigger.
16. Pausar, bloquear, restringir política e arquivar aplicam na hora, com motivo quando exigido; bloquear com "Pedido do veículo" remove as reproduções da fonte e põe `image_policy = 'none'`.
17. Arquivar exige status `paused` ou `blocked` e digitar o nome da fonte; a fonte some de `public_sources`, da coleta e das listas; itens e matérias que a citam continuam acessíveis; restaurar volta para `paused`; `delete` em `sources` como `authenticated` falha.
18. Toda mudança gera linha em `audit_log` com ator, diff antes → depois e motivo; campos operacionais do pipeline não geram linha; a aba Histórico mostra as linhas da fonte.
19. Duas pessoas editando a mesma fonte: a segunda a salvar recebe o aviso de conflito e nada é sobrescrito.
20. Ações em lote de até 50 fontes devolvem o resultado por fonte e compartilham um `batchId` na auditoria.
21. Score editorial 1 tira a fonte do "Veja também em outros portais" da home; a ordem de coleta do tick segue prioridade e depois score; `rankSources` não muda.
22. Todas as telas têm carregando, vazio, erro e sucesso em 360, 768 e 1280 px, e 0 violações `serious`/`critical` no axe.

## 13. Riscos

| Risco | Mitigação |
|---|---|
| Reforço de SSRF em `http.ts` não chegar antes | FS-T3 falha nos testes de redirecionamento e DNS; a análise fica desligada (flag `source_link_analysis`) até o reforço entrar |
| IA sugerir seletores frágeis | Só aparecem se extraírem ≥ 3 itens válidos; a extração é revalidada a cada coleta e falha conta para a pausa automática |
| Afrouxar políticas fica lento | Intencional (D-F3); DP-2 permite rever |
| Troca do índice único de `ingest_runs` | Teste de integração do tick duplo (P3 Review Focus 2) continua obrigatório em FS-T1 |
| Termos de uso mudarem depois do cadastro | `terms_reviewed_at` visível; aviso "Termos revisados há mais de 12 meses" na lista |
