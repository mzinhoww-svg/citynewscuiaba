# Coletor de eventos da Agenda (AGE-T1, R37, AGM-T5)

A Agenda da home e de `/agenda` nunca fica vazia: um coletor lê eventos de Cuiabá e Várzea Grande
na internet, aprova pelas checagens e publica; se ainda houver poucos eventos próximos, a tela
mostra "Datas e eventos recorrentes de Cuiabá".

## Fluxo

`src/lib/agenda/collect.ts` (orquestração; caminho `ai_page` em `collect-ai.ts`, reconciliação com o
banco em `reconcile.ts`; AGM-T5, spec `2026-10-08-agenda-coletor-multifonte-design.md`), por
fonte ativa de `sources` (`kind = 'events'`, `status` ativa ou com falhas, não arquivada), lidas
por `loadEventSources` (`src/lib/db/agenda-sources.ts`) na ordem "as que confirmam primeiro",
prioridade e slug:

1. `robots.txt` da origem (token `CityNewsBot`), lido uma vez por host; bloqueado ou indisponível,
   a fonte é pulada.
2. Baixa a página/feed (limite de 60 pedidos por hora por fonte, SSRF bloqueado).
3. Extrai (`extract/`), conforme `extract_kind`:
   - estruturados: `jsonld` (schema.org `Event` e subtipos, `ItemList`, `@graph`), `ical`
     (VEVENT), `rss` (data de evento no texto da chamada, nunca a de publicação), `sympla` (lista
     embutida da busca) e `tribe` (API REST do The Events Calendar, `per_page=50`, até 3 páginas
     seguindo `next_rest_url` do mesmo host);
   - `ai_page`: para cada listagem (`base_url` e depois `list_urls`), o modelo (`event_extractor`)
     devolve os links das páginas de evento do mesmo site; cada página é baixada e lida campo a
     campo com o **trecho literal** que sustenta o valor (`extract/ai-page.ts`). Trecho que não
     está na página derruba o campo; data sem ano na página nem na URL é recusada (`sem_ano`).
     `collector_notes` (bloco `avisos`), a URL da página (bloco `url`) e o texto da página (bloco
     `pagina`) vão ao modelo só como dado (`sanitizeExternalText`, entre delimitadores
     `<fonte_externa>`), nunca no `system` nem na tarefa.
4. Normaliza (`normalize.ts`): título limpo por `sanitizeExternalText`, data/hora em
   America/Cuiabá, local, bairro da lista curada, preço (ou "não informado"), categoria, link do
   original e **descrição própria de até 2 frases** (nenhum texto da fonte é copiado). A evidência
   (trechos por campo) vai para `event_listings.evidence`.
5. Aprova (`approve.ts`): data futura (até 1 ano), local conhecido, sem palavrão, link `https`
   sem encurtador/IP/credenciais. Fora de Cuiabá/VG, online, sem horário ou sem link: recusado.
6. Confirma entre fontes (`confirm.ts`) e remove repetidos (`dedupe.ts`), uma linha por evento real:
   - descoberta (`confirms = false`) que uma fonte que confirma também lista nesta execução: fica
     só a linha de quem confirma (vale a data, a hora e o local dela);
   - fonte que confirma acha um evento **já guardado** de descoberta: atualiza essa linha (mesma
     `dedupe_key`, mesmo slug) com data, hora e local de quem confirma e grava
     `confirmed_by_source_id`; a divergência fica em `evidence.conflito`;
   - descoberta igual a um evento já guardado de fonte que confirma: descartada;
   - `confirmed_by_source_id` só é preenchido por **outra** fonte que confirma (confirmação entre
     fontes); os eventos da própria fonte que confirma ficam com ele nulo e contam como
     confirmados por `sources.confirms`;
   - eventos já no ar sem origem de coleta (manuais e de leitores) sempre vencem.
7. Grava (`src/lib/db/agenda-store.ts`) em `event_listings` por `dedupe_key` (idempotente), com
   `confirmed_at` (aprovação automática), `source_url`, `source_id` (slug), `source_ref` (uuid),
   `evidence`, `updated_at`, `age_rating = 'consulte'` e `price_unknown` quando a fonte não
   informa o preço (nunca vira "Gratuito"). Campos em `locked_fields` (edição da redação) nunca são
   sobrescritos; evento com `withdrawn_at` nunca é regravado nem volta ao ar; linha existente
   mantém o slug.

### Custo e prazo do caminho `ai_page`

- **Cache** `agenda_extract_cache` por (URL, sha256 do texto saneado: o da página, e o da listagem
  como vai ao modelo, com os links visíveis): página igual não passa de novo pelo modelo, recusas inclusive. Saída fora do esquema não
  entra no cache (nova tentativa no ciclo seguinte). Linhas com mais de 30 dias saem no início de
  cada execução real.
- **Teto**: `app_settings` `agenda.ai_pages_per_run` (40) e `agenda.ai_pages_per_day` (160, soma
  de `ai_pages` das linhas por fonte desde a meia-noite de Cuiabá). Conta toda chamada ao modelo,
  listagem e página (cache não conta).
- **Prazo**: a rota tem `maxDuration = 60` e mede o prazo **do início do pedido** (antes de ler
  fontes e banco). As fontes estruturadas rodam antes das `ai_page`. Depois de 45 s
  (`AI_DEADLINE_MS`) nenhum pedido HTTP (robots, listagem, `list_urls`, páginas Tribe, páginas de
  evento) nem chamada ao modelo novos começam; aos 55 s (`AI_HARD_DEADLINE_MS`) o que estiver em
  curso é abortado (o mesmo `AbortSignal` vai a `crawlGet`, `checkRobots` e ao modelo), e sobram
  ~5 s para ler os já guardados e gravar.
- Teto atingido, prazo vencido ou modelo indisponível: a fonte `ai_page` fica `ia_adiada`; a
  estruturada não alcançada fica `adiada`. Nenhuma das duas **grava nada nesta execução** (nada
  pela metade) nem conta falha da fonte; as páginas já lidas ficam no cache e a próxima execução
  segue de onde parou sem custo.

### Estado da fonte e execuções

- Mesmo ciclo das fontes de notícia (`afterFetch`): sucesso zera o contador; 1ª e 2ª falha
  seguidas deixam a fonte "com falhas"; a 3ª pausa com `auto_failures` e avisa o Control Center
  (`source_auto_paused`). Só fonte ativa ou com falhas é atualizada (pausa humana vence). Robots
  bloqueando não conta falha; `adiada`/`ia_adiada` também não.
- `agenda_collect_runs`: uma linha-resumo por execução (`source_id` nulo, `report` completo) e uma
  linha por fonte (`source_id`, `ai_pages`, `stats` com achados, aprovados, recusados por motivo,
  confirmados, novos, atualizados e até 10 exemplos de recusa com URL e motivo). O intervalo
  mínimo entre coletas olha só as linhas-resumo.

## Execução

- Rota `POST /api/ingest/agenda` (`Authorization: Bearer ${CRON_SECRET}`); `?dry=1` ensaia,
  `?force=1` ignora o intervalo mínimo de 5 h.
- Agenda: `pg_cron` a cada 6 h (migration 0053, mesmo molde do tick: precisa de pg_cron, pg_net e
  dos segredos `app_url`/`cron_secret` no Vault) e o watchdog do GitHub (a cada 15 min, a rota
  se limita sozinha).
- Manual em produção: `scripts/ops/collect-agenda.ts` (veja o cabeçalho do arquivo).

```bash
APP_URL=https://citynewscuiaba.vercel.app CRON_SECRET=... node --no-warnings scripts/ops/collect-agenda.ts --dry
APP_URL=... CRON_SECRET=... node --no-warnings scripts/ops/collect-agenda.ts --force
```

## Fontes

Ficam em `sources` com `kind = 'events'` (seed em `supabase/migrations/0183_agenda_sources_seed.sql`)
e se gerenciam pelo Painel de Fontes: `extract_kind` (`jsonld`, `ical`, `rss`, `sympla`, `tribe`,
`ai_page`), `event_origin` (`official` para órgãos públicos), `confirms` (casa ou organizador que
confirma os próprios eventos), `collector_notes`, `list_urls`, `require_city` e local, bairro e
categoria padrão. Para incluir uma: confira robots e termos, cadastre pausada, teste a conexão
(prévia com os trechos) e ative. Fonte de eventos nunca entra no pipeline de notícias.

Em teste e no e2e (`CRAWLER_FIXTURES=1`), a rota usa `FIXTURE_AGENDA_SOURCES`
(`src/lib/agenda/sources.ts`): só sites fictícios `*.example` (`tests/fixtures`), entre eles o
Teatro Cerrado (`ai_page`, confirma) e Eventos do Cerrado (`tribe`).

## Datas recorrentes (fallback)

`src/lib/agenda/recurring.ts`: só datas com fonte verificável (feriados nacionais pela legislação,
aniversário de Cuiabá em 8 de abril, Festa de São Benedito na primeira semana de julho). O Festival
de Pesca não entra: as edições variam de data e cidade e não há fonte fixa para Cuiabá.
Aparece na home quando há menos de 3 eventos nos próximos 14 dias e em `/agenda` (sem filtros) pelo
mesmo critério.
