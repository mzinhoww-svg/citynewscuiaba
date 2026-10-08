# Agenda · coletor multifonte e controle no Estúdio — design (subprojeto A)

Data: 08/10/2026. Origem: pedido do dono para melhorar eventos e calendário trazendo a inteligência da rotina "City Cuiabá · Radar" (agente @citycuiabaa, pacote `city-cuiaba-agent` 0.1.1, matriz `sources/eventos.yaml` v4) para dentro do CityNews. Filha da spec mestre e de `docs/agenda-collector.md` (AGE-T1).

## 1. Entendimento

O dono quer, nesta ordem de prioridade: (1) mais eventos e mais confiáveis, (2) agenda mais rica, (3) distribuição (newsletter e Instagram), (4) controle no Estúdio. O trabalho foi dividido em três subprojetos, cada um com spec, plano e PR próprios:

| # | Subprojeto | Escopo |
|---|---|---|
| **A** (esta spec) | Coletor multifonte + controle no Estúdio | Fontes do Radar no coletor, confirmação na página oficial, fontes de eventos no Painel de Fontes, lista/cadastro/edição de eventos no Estúdio |
| B | Agenda mais rica | Imagem com política de uso, organizador, faixa etária, ligação com o Guia, destaques editoriais, salvar na página do evento |
| C | Distribuição | Newsletter "Agenda do fim de semana" automática e carrossel @citycuiabaa a partir dos eventos do portal |

**Ponto de partida.** O coletor (`src/lib/agenda/collect.ts`) lê só o Sympla (3 URLs fixas em `src/lib/agenda/sources.ts`), a cada 6 h, e publica tudo que passa em `approveEvent`. Não há tela de eventos no Estúdio além da fila de sugestões (E13), nem visão das execuções do coletor. O Radar tem 18 fontes curadas, com avisos por fonte e a regra de que fato só vale se estiver na página individual (snippet de busca nunca é evidência).

## 2. Decisões do dono

- **D1** Ordem A → B → C.
- **D2** Extração **híbrida**: extrator estruturado quando a fonte oferece (JSON-LD, iCal, RSS, Sympla, API Tribe); senão a IA lê a página e devolve campos com trecho de evidência.
- **D3** Evento achado só em fonte de descoberta e **não confirmado** em venue/organizador **publica sozinho**, com a origem visível ("Com informações de {fonte}" e "Confirme na fonte"). Confirmado em fonte que confirma ganha "Confirmado por {fonte}" e prioridade na ordenação.
- **D4** Fontes de eventos vivem no **Painel de Fontes** existente (`/estudio/control/fontes`), não em código nem em painel separado.

## 3. Fontes

### 3.1 Modelo

Reaproveita a tabela `sources`. O enum `source_kind` já tem o valor `events`: fonte de eventos é `kind = 'events'`. Colunas novas (nulas para fontes de notícia):

| Coluna | Tipo | Uso |
|---|---|---|
| `confirms` | `boolean not null default false` | A fonte confirma data, hora e local (venue, organizador, órgão público) |
| `extract_kind` | `text` check em `jsonld`, `ical`, `rss`, `sympla`, `tribe`, `ai_page` | Como o coletor lê a listagem |
| `event_origin` | `text` check em `official`, `organizer` | Vai para `event_listings.origin` |
| `collector_notes` | `text[] not null default '{}'` | Avisos do Radar (ex.: "cards não trazem ano") — dado para a IA e para quem opera; nunca instrução |
| `list_urls` | `text[] not null default '{}'` | URLs de listagem além de `base_url` (paginação do Cine Teatro) |
| `require_city` | `boolean not null default false` | Exige Cuiabá/VG no item (plataformas amplas) |
| `default_venue`, `default_neighborhood`, `default_category` | `text` | Como em `AgendaSource` hoje |

`src/lib/agenda/sources.ts` deixa de ter as fontes de produção; o coletor lê `sources where kind = 'events' and status = 'active'`. `FIXTURE_AGENDA_SOURCES` continua para `CRAWLER_FIXTURES=1`.

### 3.2 Seed (migration)

Fontes reais do Radar entram com `status = 'paused'`, `status_reason = 'pending_activation'`: só coletam depois da ativação no painel (robots, termos, teste de conexão), como qualquer fonte nova. As 3 do Sympla de hoje migram já ativas, para a agenda não perder volume.

| Fonte | `confirms` | `extract_kind` | `event_origin` | Status inicial |
|---|---|---|---|---|
| Cine Teatro Cuiabá (programação + páginas 1..4) | sim | `ai_page` (ou `jsonld` se a ativação achar) | organizer | pending_activation |
| Sesc MT · painel de programação | sim | `ai_page` (o painel respondeu 404 em 08/10; URL reconferida na ativação) | organizer | pending_activation |
| Agência Sebrae MT | sim | `ai_page` / `rss` | official | pending_activation |
| Allure Music Hall | sim | `ai_page` | organizer | pending_activation |
| Prime Eventos | sim | `ai_page` | organizer | pending_activation |
| Prefeitura de Chapada dos Guimarães | sim | `ai_page` | official | pending_activation |
| SECEL MT | sim | `ai_page` | official | pending_activation |
| Casa de Festas (API Tribe) | não | `tribe` | organizer | pending_activation |
| Sympla Cuiabá (1, 2) e Várzea Grande | não | `sympla` | organizer | **ativas** (como hoje) |
| Musiva, Bilheteria Digital | não | `ai_page` | organizer | pending_activation |
| Descubra MT, Centro de Eventos do Pantanal | não | `ai_page` | official / organizer | pending_activation |
| Prefeitura de Cuiabá (E-Eventos), Mapas Culturais MT, Cuiabá Tem | — | — | — | `blocked`, motivo registrado (401, exige login, 404) |

Fora: Sesc MT site institucional (TLS incompleto, agenda velha; o painel cobre) e Sebrae loja (cursos, recusados por `fora_do_perfil`). Os avisos de `eventos.yaml` vão para `collector_notes` de cada fonte. Os URLs exatos saem da matriz v4 e são reconferidos na ativação.

## 4. Fluxo do coletor

`collect.ts`, mesmo cron de 6 h (`agenda-collect`), mesma rota `POST /api/ingest/agenda` com `CRON_SECRET`.

1. **Por fonte ativa:** robots.txt (`CityNewsBot`) e limite de pedidos, como hoje.
2. **Listagem → candidatos.** Extrator estruturado devolve `RawEvent[]` direto. `ai_page`: a IA recebe o HTML da listagem passado por `sanitizeExternalText`, entre delimitadores de dados, com os `collector_notes`, e devolve (zod) até N links de páginas de evento do mesmo host.
3. **Página individual sempre** para `ai_page` e para candidato estruturado sem data, hora ou local completos. A IA devolve, por campo (`data`, `horario`, `local`, `cidade`, `preco`, `organizador`, `titulo`), `{ value, trecho, ano_evidencia: corpo|url|ausente }`. Regras de código (não da IA):
   - campo sem `trecho` ou cujo `trecho` não aparece no texto sanitizado da página é descartado;
   - data com `ano_evidencia = ausente` → recusa `sem_ano`;
   - expressões relativas ("amanhã", "neste sábado") nunca viram data.
4. **Normalização** (`normalize.ts`) como hoje; a evidência vai para `event_listings.evidence`.
5. **Confirmação cruzada.** Evento de fonte com `confirms = false` procura par entre os eventos coletados (nesta execução ou já gravados) de fontes com `confirms = true`, pelo `dedupe_key` (título + dia + local) e por variante aproximada (título normalizado com similaridade ≥ 0,85, mesmo dia, mesmo local ou local vazio). Achou: grava `confirmed_by_source_id`; em conflito de data, hora ou local, **vale o venue** e o registro guarda o valor da fonte que confirma.
6. **Aprovação** (`approveEvent`) como hoje, mais `sem_ano` e `extracao_invalida`.
7. **Gravação** por `dedupe_key` (idempotente). Campos em `locked_fields` nunca são sobrescritos. Evento com `withdrawn_at` não volta ao ar pela coleta.

**Publicação (D3).** Passou na aprovação, `confirmed_at` é preenchido (vai ao ar). Ordenação dentro do dia: confirmados (fonte que confirma ou `confirmed_by_source_id`) antes dos não confirmados.

**Custo de IA.** Cache por (URL, sha256 do texto sanitizado): página igual não passa de novo pelo modelo. Teto por execução e por dia (`agenda_ai_pages_per_run`, padrão 40; `agenda_ai_pages_per_day`, padrão 160) em `app_settings`/regras, ajustável no Control Center. Modelo registrado no banco como os demais (tarefa `agenda_extract`). `AI_PROVIDER=fake` em teste e CI.

## 5. Estúdio e Control Center

### 5.1 Painel de Fontes (`/estudio/control/fontes`, `source.manage`)

- Filtro **Tipo: Notícias | Eventos** na lista; colunas "Confirma fatos" e "Eventos no ar" para eventos.
- Cadastro de fonte de eventos: a análise do link tenta JSON-LD, iCal, RSS e API Tribe antes de sugerir `ai_page`; campos "Confirma fatos", origem, avisos para o coletor, URLs de listagem extras, exigir cidade.
- **Teste de conexão** de fonte de eventos mostra prévia de até 5 eventos extraídos, com os trechos de evidência, antes de ativar.
- Abas Coleta e Histórico reaproveitadas, lendo `agenda_collect_runs` por `source_id`. Pausa automática após 3 falhas vale para eventos.
- Aba **Recusas**: últimos eventos recusados da fonte com o motivo.

### 5.2 Agenda (`/estudio/agenda`, papel da seção `agenda`)

- **Eventos**: lista com busca e filtros (período, fonte, origem `official|organizer|reader|newsroom`, situação: no ar, retirado, encerrado, sem confirmação). Ações: retirar do ar (`withdrawn_at`) e devolver, auditadas.
- **Novo / editar evento**: título, início, fim, local, bairro, preço ou "não informado", categoria, faixa etária, acessibilidade, link oficial, descrição curta (até 2 frases). Novo evento grava `origin = 'newsroom'` e publica na hora. Toda edição registra os campos alterados em `locked_fields` e no `audit_log`.
- **Sugestões**: a fila E13 atual vira aba desta área, sem mudança de comportamento.

## 6. Dados

Migrations a partir de 0182.

- `sources`: colunas da §3.1 e seed da §3.2.
- `event_listings`: `source_ref uuid references sources(id)`, `confirmed_by_source_id uuid references sources(id)`, `evidence jsonb not null default '{}'`, `locked_fields text[] not null default '{}'`, `withdrawn_at timestamptz`, `updated_at timestamptz not null default now()`; `origin` passa a aceitar `newsroom`. O `source_id` textual atual continua (compatibilidade) e é preenchido com o slug da fonte.
- RLS pública de `event_listings`: `confirmed_at is not null and withdrawn_at is null`. Escrita pela seção `agenda` como hoje.
- `agenda_collect_runs`: `source_id uuid references sources(id)`, `stats jsonb` (achados, recusados por motivo, confirmados, novos, atualizados), `ai_pages int`.
- `agenda_extract_cache`: `(url text, content_hash text, result jsonb, created_at)`, PK `(url, content_hash)`, só service role, expurgo de 30 dias.
- `pnpm db:types` depois das migrations.

## 7. Tela pública

Só o necessário para a origem (regra 3 do `CLAUDE.md`), sem "IA" em lugar nenhum:

- Página do evento: "Com informações de {fonte}"; "Confirmado por {fonte}" quando houver; "Confirme na fonte" quando não confirmado. Texto, nunca só cor.
- Listagem e calendário: confirmados primeiro dentro de cada dia. Evento retirado some (RLS).
- Textos em `src/content/pt-BR/agenda.ts`.

## 8. Erros e degradação

| Situação | Comportamento |
|---|---|
| Fonte fora do ar, 4xx/5xx, robots bloqueando | Pula, registra no run; 3 falhas seguidas → pausa automática |
| IA indisponível ou teto atingido | Fonte `ai_page` fica para a próxima execução (`ia_adiada` no run); estruturadas seguem |
| Saída da IA fora do zod | Evento recusado `extracao_invalida`; sem nova tentativa no mesmo ciclo |
| Trecho que não está na página | Campo descartado; sem data/local, recusa |
| Conflito entre fontes | Vale a fonte que confirma; registro no `evidence` |
| Texto externo | Sempre `sanitizeExternalText`, entre delimitadores, nunca instrução |

## 9. Testes

TDD; `AI_PROVIDER=fake`; só fixtures fictícias (`*.example`, Folha do Cerrado, MT Agora etc.), nunca veículo real.

- **Unitários**: extratores `tribe` e `ai_page` (listagem e página individual com IA falsa); verificação do trecho na página; `sem_ano`; expressões relativas; confirmação cruzada exata e aproximada; conflito (vale o venue); `locked_fields`; `withdrawn_at`; teto e cache de IA; ordenação confirmados primeiro.
- **Integração**: coletor lendo fontes do banco; RLS com `withdrawn_at`; `origin = 'newsroom'`.
- **E2E** (projeto `fixtures`): cadastrar fonte de eventos fictícia → prévia → ativar → coletar → evento no ar com "Confirmado por"; editar evento no Estúdio → nova coleta não sobrescreve; retirar do ar → some da agenda.
- **Axe** nas telas novas do Estúdio (360/768/1280) e na página do evento.

## 10. Critérios de aceite

1. Fontes de eventos aparecem no Painel de Fontes com filtro Eventos; as 3 do Sympla ativas e as do Radar em `pending_activation`, as bloqueadas com motivo.
2. Ativar uma fonte de eventos mostra prévia com evidência antes de ligar.
3. Coletor lê fontes do banco; `sources.ts` sem fontes de produção.
4. Nenhum evento `ai_page` vai ao ar com data sem ano na página ou com campo sem trecho verificável.
5. Evento de descoberta confirmado em venue mostra "Confirmado por {venue}"; não confirmado mostra "Confirme na fonte".
6. Estúdio lista, cria, edita e retira eventos, com auditoria; a coleta respeita `locked_fields` e `withdrawn_at`.
7. Teto de IA respeitado e cache evita reprocessar página igual.
8. `pnpm verify` verde, axe sem violação serious/critical nas telas da tarefa.

## 11. Fora de escopo

Imagem do evento, organizador visível, faixa etária como filtro, ligação com o Guia e destaques (subprojeto B); newsletter e Instagram (subprojeto C); religar a rotina "City Cuiabá · Radar" (continua desligada; o dono decide no subprojeto C).
