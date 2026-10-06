# Guia Cuiabá · Google Places como fonte e regra de uma fonte

**Data:** 2026-10-06 · **Status:** aprovado em conversa pelo dono, aguardando revisão desta spec
**Base:** `2026-10-03-guia-cuiaba-listas-design.md` (G1 a G4, R1 a R3) e respostas da rodada 3 (R33, R38)
**Decisões novas:** A-210 (Google Places entra como fonte; substitui a R33 nesse ponto) e A-211 (uma fonte por lugar basta; muda a G4)

## 1. Problema

O `/guia-cuiaba` está vazio em produção. A API do TripAdvisor recusa a chave (401/403) mesmo com o `Referer` (#50). O OpenStreetMap sozinho é fraco em Cuiabá: dos 96 lugares coletados até 06/10, 4 têm site, quase nenhum tem telefone e nenhum tem nota. Com a regra de 2 fontes por lugar (G4), nenhum lugar é elegível e nenhuma lista se forma.

## 2. Decisões do dono

- **A-210 · Google Places entra como fonte principal**, como a spec original previa (G2). A chave `GOOGLE_PLACES_API_KEY` já está na Vercel. Substitui a R33 ("sem chaves de API") só nesse ponto. A TripAdvisor continua no código e volta a somar quando a chave funcionar.
- **A-211 · Uma fonte por lugar basta.** As listas são informativas, então a exigência de 2 fontes (G4) cai, tanto para entrar na lista quanto para publicar sozinha. Os outros critérios de publicação automática ficam: mínimo de lugares, critério escrito, sem patrocínio e **nota em cada lugar** (sinal de qualidade). Lista com lugar sem nota fica como proposta para a redação.

## 3. Coleta

- **Provedor `google`** em `src/lib/guide/providers/google.ts`, no molde do `tripadvisor.ts`:
  - Usa a Places API (New), Text Search (`POST https://places.googleapis.com/v1/places:searchText`), com `textQuery` do tipo "padarias em Cuiabá" e `locationBias` num círculo de 25 km ao redor do centro (-15.6014, -56.0979).
  - Pede só os campos do `X-Goog-FieldMask`: `places.id`, `displayName`, `formattedAddress`, `location`, `rating`, `userRatingCount`, `nationalPhoneNumber`, `websiteUri`, `regularOpeningHours.weekdayDescriptions`, `priceLevel`, `googleMapsUri` e `addressComponents`.
  - Paginação por `nextPageToken`, no máximo 3 páginas (60 lugares) por consulta.
  - A chave vai no cabeçalho `X-Goog-Api-Key`, nunca na URL nem em log.
  - Descarta o que não for de Cuiabá (pela cidade em `addressComponents`) e nunca lê `reviews` nem `photos`.
- **Termos de busca** por categoria e cozinha: campo `googleQuery` em `src/lib/guide/categories.ts`, ao lado do `taQuery` que já existe.
- **Junção:** `mergeVenueLists`/`isSameVenue` (nome parecido e até 250 m, `SAME_PLACE_METERS`) juntam Google, OpenStreetMap e TripAdvisor num lugar só. `place_ids.google` evita duplicar o lugar entre coletas.
- **Ordem no `runVenueSync`:** Google, depois OpenStreetMap, depois TripAdvisor (se houver chave), depois o site do lugar. O Google traz o `websiteUri`, e o passo de site, que já existe, lê o site e a foto oficial.
- **Cota:** `GUIDE_GOOGLE_DAILY_CALLS`, com padrão de 30 consultas por dia, contadas por execução (`guide_runs.report.googleCalls`), como `taCallsToday`. No teto, para de chamar o Google até o dia seguinte; o resto da coleta segue.
- **Custo esperado:** pedir nota, telefone e horário põe a busca na faixa Enterprise do Text Search, com cerca de 1.000 buscas gratuitas por mês. Uma volta pelo catálogo (30 modelos) dá cerca de 60 buscas, perto de 260 por mês. O teto diário segura qualquer desvio.

## 4. Termos do Google

- **Retenção:** o identificador do lugar (`place_ids.google`) é guardado sem prazo. Nota, contagem, telefone, horário, site, faixa de preço e link do Maps vindos do Google ficam no máximo 30 dias, contados de `google_fetched_at`.
- **Atualização:** a rotina diária de atualização (`staleRatings`, até 25 lugares por dia) passa a cobrir o Google: busca os detalhes pelo identificador (Place Details, mesmos campos) quando `google_fetched_at` tem mais de 25 dias.
- **Expurgo:** se a atualização falhar e o dado passar de 30 dias, a rotina apaga os campos do Google e tira `google` de `data_sources`. O lugar perde a nota até a próxima coleta bem-sucedida.
- **Nunca guardado:** fotos do Google e texto de avaliação (G3, R1).

## 5. Tela pública

- **Card do lugar e página do lugar:** "4,6 no Google (1.234 avaliações)" e o link "Ver no Google Maps" (`google_maps_url`). Com a TripAdvisor de volta, as duas notas aparecem, cada uma com a fonte.
- **Linha de origem:** `dataLine` ganha o Google em primeiro lugar, por exemplo "Dados: Google, OpenStreetMap e sites dos lugares". O rótulo vai em `DATA_SOURCE_LABEL.google = "Google"`.
- **Atribuição no rodapé da lista:** "Avaliações: Google." junto da linha do OpenStreetMap que já existe.
- **Sem logotipo:** tudo em texto simples (R3). O vocabulário público continua passando em `src/content/vocabulary.test.ts`.

## 6. Pontuação e regras

- **Pontuação:** `scoreVenue` já usa a nota ponderada pela contagem, sem depender da fonte; a nota do Google entra direto. O ranking da TripAdvisor segue como bônus quando existir, e as menções nas matérias seguem iguais.
- **Fontes:** `MIN_SOURCES_PER_VENUE` passa de 2 para 1, em `eligibleFor` e `autoPublishCheck`. A conferência de lugar (`isVerified`, em `proposals.ts`) passa a aceitar o identificador do Google, ao lado de OpenStreetMap, TripAdvisor e Wikidata. A nota continua exigida à parte, pelo sinal de qualidade de `autoPublishCheck`.
- **Textos de critério:** `criteria.ts` deixa de citar "duas fontes" no texto público do critério (e os testes de `criteria.test.ts` e `auto-publish.test.ts` acompanham). O comentário de `auto-publish.ts` é atualizado.

## 7. Banco (migration 0180, aditiva)

- **Fontes permitidas:** o `check` de `venues.data_sources` passa a aceitar `google`.
- **Colunas novas:** `venues.google_maps_url text check (google_maps_url is null or google_maps_url ~ '^https://')` e `venues.google_fetched_at timestamptz`.
- **Índice:** `venues_google_idx` em `(place_ids ->> 'google') where place_ids ? 'google'`.
- **Tipos:** `src/lib/db/types.ts` é regenerado; `DATA_SOURCES` e `PlaceIds` ganham `google`.
- **Dados existentes:** nenhum lugar existente muda.

## 8. Falhas

- **Códigos fixos no relatório da coleta:** `no_key`, `unauthorized`, `rate_limited`, `network`, `http` e `invalid`.
- **Recusa 401/403:** vai para o log com status e mensagem, sem a chave (mesmo padrão do #63).
- **Sem Google:** a coleta segue com OpenStreetMap, TripAdvisor e site. Nenhuma falha de provedor interrompe a coleta.

## 9. Testes (escritos antes do código)

- `google.test.ts`:
  - transforma a resposta em `VenueRecord`;
  - descarta lugares de outras cidades;
  - não lê `reviews` nem `photos`;
  - a chave nunca aparece em resultado, erro ou URL;
  - mapeia os erros para códigos;
  - para a paginação em 3 páginas.
- `venue-sync.test.ts`: respeita o teto diário do Google; junta Google e OpenStreetMap num lugar só.
- `proposals.test.ts` / `auto-publish.test.ts`: lugar com 1 fonte e nota publica sozinho; sem nota, a lista fica como proposta.
- Teste da atualização: busca de novo depois de 25 dias e expurga depois de 30 dias sem atualizar.
- Componentes: o card e a página do lugar mostram "no Google" e "Ver no Google Maps"; o vocabulário público continua verde.
- Integração (CI): a migration 0180 aplica sobre 0001..0157 e o `check` aceita `google`.

## 10. Entrada no ar

1. **Merge e deploy:** a chave já está na Vercel.
2. **Migration:** aplicar a 0180 em produção (`apply_migration`) e conferir com `select` (B-009, registro em `DECISIONS.md`).
3. **Coleta:** rodar `/api/ingest/venues?force=1&category=<cat>` para padaria, cafeteria, restaurante, bar e pizzaria, e conferir no banco os lugares com `google` e com nota.
4. **Listas:** rodar `/api/ingest/guide?mode=propose&force=1` algumas vezes e conferir em `/guia-cuiaba` as listas publicadas.
5. **Relato:** `STATE.md` atualizado e relato ao dono com o número de listas publicadas.

## 11. Fora de escopo

- Fotos do Google.
- Busca por bairro no Google; o bairro continua vindo do endereço e do OpenStreetMap.
- Mudar a cadência das propostas (3 por semana).
- Corrigir a chave da TripAdvisor (diagnóstico pelo #63, em paralelo).
