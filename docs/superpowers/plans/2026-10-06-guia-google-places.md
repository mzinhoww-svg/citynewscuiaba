# Guia Cuiabá · Google Places Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Guia passa a coletar lugares e notas do Google Places, e a regra de fontes cai para uma por lugar, para que as listas sejam montadas e publicadas.

**Architecture:** Um provedor `google` novo, no molde do `tripadvisor.ts`, entra no passo `venue_sync` antes do OpenStreetMap, com teto diário próprio, atualização a cada 25 dias e expurgo depois de 30. O domínio aceita `google` como fonte, mantém uma nota por lugar (o Google tem precedência) e exige uma fonte por lugar. A tela pública mostra "no Google" e "Ver no Google Maps".

**Tech Stack:** Next.js (route handlers), TypeScript strict, Vitest, Supabase Postgres (migration 0180), Places API (New).

**Spec:** `docs/superpowers/specs/2026-10-06-guia-google-places-design.md`

## Global Constraints

- A chave vem só de `process.env.GOOGLE_PLACES_API_KEY` e vai no cabeçalho `X-Goog-Api-Key`; nunca na URL, em erro, em log, em teste ou em fixture (testes usam `"TESTE-chave-ficticia"`).
- Nunca ler nem guardar `reviews` ou `photos` do Google (G3, R1).
- Centro de busca: `-15.6014, -56.0979`, raio de 25 km (`25000` m). No máximo 3 páginas por consulta.
- Teto diário: `GUIDE_GOOGLE_DAILY_CALLS`, padrão `30`; cada requisição HTTP ao Google conta 1.
- Retenção: o Google é buscado de novo depois de 25 dias e os dados dele são apagados depois de 30 dias sem atualização.
- `MIN_SOURCES_PER_VENUE = 1` (A-211).
- Vocabulário público: sem menção a IA; textos em `src/content/pt-BR/guide.ts`; `src/content/vocabulary.test.ts` continua verde.
- Migration nova: `supabase/migrations/0180_guide_google.sql`, aditiva. Decisões: A-210 e A-211 em `.planning/DECISIONS.md`.
- `pnpm verify` verde antes de cada commit de fim de tarefa; commits com `[GUIA-G#]`.

## Review Focus

- Lugar de Várzea Grande, ou de outra cidade dentro do raio de 25 km, vindo do Google: deve ser descartado pela cidade em `addressComponents` (teste na Task 3).
- O mesmo lugar vindo do Google e do OpenStreetMap com nomes um pouco diferentes ("Padaria Pão Dourado" e "Pão Dourado"): deve virar um lugar só, com as duas fontes (teste na Task 4).
- Cota que acaba no meio da paginação: a busca para, guarda o que já veio e marca `google: "budget"` (teste na Task 4).
- `priceLevel` em texto (`PRICE_LEVEL_MODERATE`) e campos ausentes (lugar sem telefone, sem nota): a conversão devolve `null` sem quebrar (teste na Task 3).
- A TripAdvisor volta a funcionar e traz nota para um lugar que já tem nota do Google: a nota do Google fica e o ranking da TripAdvisor entra (teste na Task 1).

---

### Task 1: Domínio aceita o Google e a regra de uma fonte [GUIA-G1]

**Files:**
- Modify: `src/lib/guide/types.ts`, `src/lib/guide/merge.ts`, `src/lib/guide/auto-publish.ts`, `src/lib/guide/proposals.ts`, `src/lib/guide/criteria.ts`, `src/lib/guide/testing.ts` (fábrica `venue()` ganha `googleMapsUrl: null`)
- Modify: `.planning/DECISIONS.md` (A-210, A-211)
- Test: `src/lib/guide/merge.test.ts`, `src/lib/guide/auto-publish.test.ts`, `src/lib/guide/proposals.test.ts`, `src/lib/guide/criteria.test.ts`

**Interfaces:**
- Produces:
  - `DATA_SOURCES = ["google", "osm", "tripadvisor", "site", "wikidata", "manual"]`;
  - `PlaceIds.google?: string`;
  - `VenueRecord.googleMapsUrl: string | null`;
  - `MIN_SOURCES_PER_VENUE = 1`;
  - `mergeRecord` com precedência de nota (abaixo);
  - `isVerified` aceita `placeIds.google`.

- [ ] **Step 1: Write the failing tests**
  - `merge.test.ts` › "nota do Google fica quando a TripAdvisor chega depois": `mergeRecord(base{rating 4.6, ratingCount 900, ratingSource "google"}, incoming{rating 4.2, ratingCount 50, ratingSource "tripadvisor", tripadvisorRank 7})`. O resultado tem `rating 4.6`, `ratingSource "google"`, `tripadvisorRank 7` e `sources` com as duas fontes.
  - `merge.test.ts` › "nota nova da mesma fonte substitui": de google 4.6 para google 4.7, o resultado tem `rating 4.7`.
  - `merge.test.ts` › "googleMapsUrl do dado novo": base `null` e incoming `"https://maps.google.com/?cid=1"` dão `"https://maps.google.com/?cid=1"`.
  - `auto-publish.test.ts`: o teste "falha quando algum lugar tem menos de 2 fontes" vira "publica com uma fonte por lugar". Com 5 itens de `sources: 1`, `verified` e `hasQualitySignal`, o resultado é `{ ok: true }`. Com `sources: 0` em um item, `missing` contém `"sources"`.
  - `proposals.test.ts` › "lugar só com Google é elegível e conferido": `eligibleFor(tpl, venue({ sources: ["google"], placeIds: { google: "ChIJ1" }, rating: 4.5 }))` é `true`, e `isVerified(...)` é `true`.
  - `criteria.test.ts`: o texto do critério não contém "duas fontes".

- [ ] **Step 2: Run tests to verify they fail**
  - Run: `pnpm exec vitest run src/lib/guide`
  - Expected: falham os testes novos e os alterados.

- [ ] **Step 3: Implement**
  - Tipos e constantes conforme Interfaces.
  - Regra de nota em `mergeRecord`: a nota, a contagem e a fonte vêm do `incoming` quando ele tem nota e contagem, e também (a) a base não tem nota, ou (b) a fonte é a mesma, ou (c) o `incoming` é do Google. Em qualquer outro caso, fica a da base.
  - `googleMapsUrl`: o valor do `incoming` vence.
  - `criteria.ts` troca a frase das duas fontes por "Os dados vêm de fontes públicas, citadas na lista. Patrocínio nunca altera a ordem da lista."
  - Atualizar o comentário de cabeçalho de `auto-publish.ts`.
  - `DECISIONS.md`: A-210 e A-211 com data, autor (dono), texto da spec §2 e "substitui R33 (Google)" / "altera G4".

- [ ] **Step 4: Run tests to verify they pass**
  - Run: `pnpm exec vitest run src/lib/guide && pnpm typecheck`
  - Expected: PASS. O `typecheck` aponta onde `googleMapsUrl` falta; corrija nos provedores (`osm.ts`, `tripadvisor.ts` e `site` mapeiam para `null`).

- [ ] **Step 5: Commit**
  - `git commit -m "feat(guia): Google como fonte e regra de uma fonte por lugar [GUIA-G1] [A-210, A-211]"`

### Task 2: Banco e store do Google [GUIA-G2]

**Files:**
- Create: `supabase/migrations/0180_guide_google.sql`
- Modify: `src/lib/db/types.ts` (via `pnpm db:types`), `src/lib/db/guide-store.ts`
- Test: `tests/integration/guide-sync.test.ts`

**Interfaces:**
- Consumes: os tipos da Task 1.
- Produces, em `createGuideStore`:
  - `staleGoogle(before: Date, limit: number): Promise<StoredVenue[]>`: lugares `active` com `place_ids->>google` e `google_fetched_at` nulo ou anterior a `before`, os mais velhos primeiro.
  - `expireGoogle(before: Date): Promise<number>`: aplica o expurgo da spec §4 e devolve quantos lugares mudou.
  - `googleCallsToday(now: Date): Promise<number>`: soma `report.googleCalls` como em `taCallsToday`.
  - `save` grava `google_maps_url` e, quando o registro tem `google` em `sources` e `googleChecked` é `true`, grava `google_fetched_at = at`. Nas inserções, isso vale sempre que houver `google` em `sources`.
  - O tipo de `updates` ganha `googleChecked: boolean`, e `VenueSyncStore` (em `venue-sync.ts`) passa a declarar os três métodos novos.
  - `venueFromRow` lê `place_ids.google` e `google_maps_url`, e `StoredVenue` ganha `googleFetchedAt: string | null`.

- [ ] **Step 1: Write the failing integration tests** (`guide-sync.test.ts`, pilha local)
  - "aceita google em data_sources e guarda link e data": salvar com `sources: ["google"]`, `placeIds.google` e `googleMapsUrl`, depois ler. Os campos voltam e `google_fetched_at` não é nulo.
  - "expireGoogle apaga nota e link vencidos, e contato só quando o Google é a única fonte":
    - lugar A com `["google"]`, nota do Google, telefone e `google_fetched_at` de 31 dias atrás: fica sem nota, sem telefone, sem link e com `data_sources = '{}'`;
    - lugar B com `["google","osm"]` e o mesmo vencimento: perde nota e link, mantém telefone e fica com `["osm"]`;
    - lugar C com 10 dias: não muda;
    - o retorno é `2`.
  - "googleCallsToday soma os relatórios do dia".

- [ ] **Step 2: Run to verify fail**
  - Run: `pnpm db:reset && pnpm exec vitest run tests/integration/guide-sync.test.ts`
  - Expected: FAIL, porque a coluna ou o `check` não aceitam.

- [ ] **Step 3: Implement**
  - Migration conforme a spec §7:
    - recriar o `check` de `data_sources` com `google` (`alter table ... drop constraint venues_data_sources_check, add constraint ...`; confira o nome com `\d venues`);
    - colunas `google_maps_url` e `google_fetched_at`;
    - índice `venues_google_idx`.
  - `expireGoogle`: um `update` em SQL por RPC, ou dois `update` via PostgREST. Escolha RPC `guide_expire_google(p_before timestamptz) returns int`, `security definer`, com `revoke` de `public`/`anon`/`authenticated`, na mesma migration.
  - `pnpm db:types` regenera `types.ts`.

- [ ] **Step 4: Run to verify pass**
  - Run: `pnpm exec vitest run tests/integration/guide-sync.test.ts && pnpm typecheck`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - `git commit -m "feat(guia): migration 0180 e store do Google (validade de 30 dias) [GUIA-G2]"`

### Task 3: Provedor Google Places [GUIA-G3]

**Files:**
- Create: `src/lib/guide/providers/google.ts`
- Modify: `src/lib/guide/categories.ts` (campo `googleQuery: string` por categoria e por cozinha; ex.: padaria "padaria", japonesa "restaurante japonês")
- Test: `src/lib/guide/providers/google.test.ts`

**Interfaces:**
- Consumes: `VenueProvider`, `ProviderError` e `VenueQuery` de `./types`; `HttpFetch` de `@/lib/pipeline/ports`.
- Produces:
  - `createGoogleProvider(opts: { apiKey: string | undefined; http: HttpFetch; baseUrl?: string; onCall?: () => void; callsLeft?: () => number; onError?: (d: { status: number; message: string }) => void }): VenueProvider & { readonly enabled: boolean }`;
  - `GOOGLE_PLACES_URL = "https://places.googleapis.com/v1"`;
  - `toGoogleVenue(p: GooglePlace, category: string, subcategory: string | null): VenueRecord | null`.
- Comportamento:
  - `search` faz `POST /places:searchText` com o corpo `{ textQuery: "<googleQuery> em Cuiabá", languageCode: "pt-BR", regionCode: "BR", locationBias: { circle: { center: { latitude: -15.6014, longitude: -56.0979 }, radius: 25000 } }, pageSize: 20, pageToken? }` e o cabeçalho `X-Goog-FieldMask` com os campos da spec §3, cada um prefixado por `places.`, mais `nextPageToken`.
  - `details(id)` faz `GET /places/{id}` com os mesmos campos sem prefixo; o `id` precisa casar com `/^[A-Za-z0-9_-]{10,300}$/`.
  - `callsLeft() <= 0` interrompe a paginação.
  - Os erros mapeiam igual ao `tripadvisor.ts`; 400 vira `"invalid"`.
- `toGoogleVenue`:
  - descarta quando nenhum `addressComponents` com tipo `locality` ou `administrative_area_level_2` tem nome que, sem acento, seja "cuiaba";
  - `priceLevel`: `PRICE_LEVEL_INEXPENSIVE` vira 1, `MODERATE` 2, `EXPENSIVE` 3, `VERY_EXPENSIVE` 4; qualquer outro valor vira `null`;
  - `hours`: `weekdayDescriptions.join("; ")`;
  - `ratingSource: "google"` só com nota;
  - `placeIds: { google: id }`, `sources: ["google"]`, `googleMapsUrl` só se começar com `https://`;
  - `neighborhood`: componente `sublocality` ou `sublocality_level_1`, ou `null`.

- [ ] **Step 1: Write the failing tests** (`google.test.ts`, respostas fictícias como em `tripadvisor.test.ts`)
  - "sem chave não chama e devolve no_key".
  - "busca envia chave no cabeçalho, field mask e viés de Cuiabá; a chave não aparece na URL": confere `init.headers["X-Goog-Api-Key"]`, `X-Goog-FieldMask` contém `places.rating` e não contém `reviews` nem `photos`, e o corpo tem `radius: 25000`.
  - "converte a resposta e descarta outra cidade": um lugar de Cuiabá e um de Várzea Grande dão 1 registro, com nota 4.6, contagem 1234, `ratingSource "google"`, `priceLevel 2` para `PRICE_LEVEL_MODERATE`, horário juntado e `placeIds.google`.
  - "campos ausentes viram null": sem telefone, sem nota e sem `priceLevel`, os campos ficam `null` e `ratingSource` também.
  - "pagina até 3 páginas e para quando a cota acaba": `nextPageToken` sempre presente dá 3 chamadas; com `callsLeft` em 1, 1 chamada.
  - "erros viram códigos e a chave não vaza": 401 e 403 viram `unauthorized`, 429 `rate_limited`, 400 `invalid`, 500 `http`, exceção `network`; o `onError` recebe a mensagem sem a chave (mesmo teste do #63).
  - "details rejeita id inválido sem chamar".

- [ ] **Step 2: Run to verify fail**
  - Run: `pnpm exec vitest run src/lib/guide/providers/google.test.ts`
  - Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implement `google.ts` and the `googleQuery` entries**

- [ ] **Step 4: Run to verify pass**
  - Run: `pnpm exec vitest run src/lib/guide && pnpm typecheck && pnpm exec eslint src/lib/guide`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - `git commit -m "feat(guia): provedor Google Places (Text Search e Details) [GUIA-G3]"`

### Task 4: Coleta usa o Google, com cota, atualização e expurgo [GUIA-G4]

**Files:**
- Modify: `src/lib/pipeline/steps/venue-sync.ts`, `src/lib/guide/providers/factory.ts`, `src/app/api/ingest/venues/route.ts`
- Test: `src/lib/pipeline/steps/venue-sync.test.ts`

**Interfaces:**
- Consumes:
  - `createGoogleProvider` (Task 3);
  - `staleGoogle`, `expireGoogle` e `googleCallsToday`, e `save` com `googleChecked` (Task 2).
- Produces:
  - `VenueSyncDeps.google: VenueProvider | null`;
  - `VenueSyncDeps.googleCallsLeft: () => Promise<number>` e `googleCallsMade: () => number`;
  - o relatório ganha `providers.google: ProviderStatus`, `categories[].google: number`, `googleCalls: number` e `expired: number`;
  - `buildProviders()` devolve `google`, que é `null` sem `GOOGLE_PLACES_API_KEY` ou em modo fixtures, com `onError` em `console.warn("google recusou (…)")`;
  - a rota lê `GUIDE_GOOGLE_DAILY_CALLS` (padrão 30), igual a `dailyLimit()`.
- Ordem por categoria: Google (`search` com `googleQuery`), OpenStreetMap, TripAdvisor e site. Depois das categorias:
  - atualização do Google: `staleGoogle(at − 25 dias, maxRefresh)` e então `details`;
  - `expireGoogle(at − 30 dias)`.
- Falha `unauthorized`, `rate_limited` ou `no_key` desliga o Google na execução, como `taFailed`.

- [ ] **Step 1: Write the failing tests** (`venue-sync.test.ts`, provedores falsos)
  - "Google e OpenStreetMap do mesmo lugar viram um só, com as duas fontes": o Google traz "Padaria Pão Dourado" e o OpenStreetMap traz "Pão Dourado" a 40 m; o resultado é 1 inserção com `sources` contendo `google` e `osm` e com a nota do Google.
  - "cota do Google respeitada": com `googleCallsLeft` em 1, o relatório fica com `providers.google = "budget"` e `googleCalls = 1`, e o OpenStreetMap continua.
  - "Google recusado não para a coleta": `search` devolve `unauthorized`, o relatório fica com `providers.google = "error:unauthorized"` e o OpenStreetMap salvo normalmente.
  - "atualiza lugar com mais de 25 dias e expira os de 30": `staleGoogle` devolve 1 lugar e `details` traz nota nova; ele é salvo com `googleChecked: true`, `refreshed` vale 1 e `expireGoogle` é chamado com `at − 30d`.
  - "sem Google (null) o relatório marca no_key e nada muda no resto".

- [ ] **Step 2: Run to verify fail**
  - Run: `pnpm exec vitest run src/lib/pipeline/steps/venue-sync.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement in `venue-sync.ts`, `factory.ts` and the route** (o contador `googleMade`, como `taMade`)

- [ ] **Step 4: Run to verify pass**
  - Run: `pnpm exec vitest run src/lib && pnpm typecheck`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - `git commit -m "feat(guia): coleta com Google Places, cota diária e validade de 30 dias [GUIA-G4]"`

### Task 5: Tela pública mostra a nota e o link do Google [GUIA-G5]

**Files:**
- Modify:
  - `src/content/pt-BR/guide.ts`;
  - `src/lib/db/queries/guide.ts` (`GuideVenueView.googleMapsUrl`, `ratingSource` aceita `google`, que já aceita);
  - `src/components/editorial/guide/VenueCard.tsx`;
  - `src/app/(public)/guia-cuiaba/lugar/[slug]/page.tsx`;
  - `src/app/(public)/guia-cuiaba/[slug]/page.tsx` (`Attribution`).
- Test: `src/components/editorial/guide/guide.test.tsx` e `src/content/pt-BR/guide.test.ts` (novo)

**Interfaces:**
- Produces, em `src/content/pt-BR/guide.ts`:
  - `DATA_SOURCE_LABEL.google = "Google"`, com `DATA_ORDER` começando por `"google"`;
  - `GUIDE.list.rating(value, count, source: "google" | "tripadvisor" | "manual")`, que devolve `"4,6 no Google (1.234 avaliações)"`; para `tripadvisor` o texto atual; para `manual`, `"4,6"` com a contagem;
  - `GUIDE.venue.googleMaps = "Ver no Google Maps"`;
  - `GUIDE.list.attribution.google = "Avaliações: Google."`.

- [ ] **Step 1: Write the failing tests**
  - `guide.test.ts`:
    - `dataLine(["osm","google","site"])` devolve `"Dados: Google, OpenStreetMap e sites dos lugares"`;
    - `GUIDE.list.rating("4,6", 1234, "google")` devolve `"4,6 no Google (1.234 avaliações)"`.
  - `guide.test.tsx` (componentes):
    - lugar com `ratingSource "google"`, nota 4.6 e contagem 1234 mostra "4,6 no Google (1.234 avaliações)";
    - com `tripadvisorRank 7`, mostra também "7º no ranking do TripAdvisor em Cuiabá".
  - A página do lugar mostra o link "Ver no Google Maps" com `href` igual a `googleMapsUrl` e `rel="noopener noreferrer"`. Teste de componente ou e2e no padrão de `tests/e2e/guide*.spec.ts`, se já existir.

- [ ] **Step 2: Run to verify fail**
  - Run: `pnpm exec vitest run src/content src/components/editorial/guide`
  - Expected: FAIL.

- [ ] **Step 3: Implement**
  - A condição `rated` passa a valer para qualquer `ratingSource` com nota.
  - O `Attribution` da lista recebe `google: boolean`, verdadeiro quando algum item tem `ratingSource === "google"`.

- [ ] **Step 4: Run to verify pass**
  - Run: `pnpm verify`
  - Expected: PASS, com `vocabulary.test.ts` verde.

- [ ] **Step 5: Commit**
  - `git commit -m "feat(guia): nota e link do Google na lista e na página do lugar [GUIA-G5]"`

### Task 6: Entrada no ar [GUIA-G6]

**Files:**
- Modify: `.planning/STATE.md`, `.planning/DECISIONS.md` (registro da aplicação em produção, B-009)

- [ ] **Step 1: PR, CI and merge**
  - PR com as Tasks 1 a 5; com o CI verde (`verify` e e2e), fazer o merge e conferir na Vercel o deploy de produção `READY` com o commit.

- [ ] **Step 2: Migration em produção**
  - `apply_migration` da 0180 no projeto `vmvirmemxfdtxfdmivuu`.
  - Conferir com `select pg_get_constraintdef(oid) from pg_constraint where conname like 'venues_data_sources%'`, que deve conter `google`, e com `select column_name from information_schema.columns where table_name='venues' and column_name like 'google%'`, que deve trazer 2 linhas.

- [ ] **Step 3: Coleta**
  - Via `net.http_post` com os segredos do Vault: `/api/ingest/venues?force=1&category=` para `padaria`, `cafeteria`, `restaurante`, `bar` e `pizzaria`, um por vez.
  - Esperado: `providers.google = "ok"` e `select count(*) from venues where 'google' = any(data_sources) and rating is not null` > 0.
  - Se vier `error:*`, ler o log da Vercel (`google recusou`) e seguir a escada de recuperação.

- [ ] **Step 4: Listas**
  - Rodar `/api/ingest/guide?mode=propose&force=1` até 5 vezes.
  - Esperado: `select count(*) from guide_lists where status='published'` ≥ 1, e `/guia-cuiaba` mostrando as listas.

- [ ] **Step 5: Commit the planning update and report to the owner**
  - Relato com o número de listas publicadas e o de lugares com nota.
