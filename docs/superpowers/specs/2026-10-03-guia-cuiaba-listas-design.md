# Guia Cuiabá: listas editoriais automatizadas — design

Data: 03/10/2026. Origem: pedido do dono e respostas ao grill-me. Hoje `/guia-cuiaba` é só uma editoria de matérias (sem tabela de lugares, endereço, telefone, horário nem imagem ligada a lugar, sem busca na web). Filha da spec mestre e da de UI pública.

## 1. Entendimento

Listas como "As 5 melhores padarias de Cuiabá", "Os 10 melhores restaurantes de Cuiabá", "Os 5 melhores restaurantes italianos de Cuiabá", geradas em grande parte automaticamente, com painel exclusivo no admin: o editor vê propostas, propõe listas (prontas ou por link) e publica. Chat com modelo fica **fora desta fase** (dono: muito complexo por enquanto).

## 2. Decisões do dono

- **G1 Critério:** o sistema traz propostas usando **dados públicos**: avaliações do Google Maps e ranking do TripAdvisor (por API oficial, nunca raspagem); o dono sugeriu essa combinação.
- **G2 Fontes de dados:** Google (Places API) como principal e OpenStreetMap quando fizer sentido (coordenadas, categoria, horário aberto). Exige chave de API do dono (`GOOGLE_PLACES_API_KEY`, `TRIPADVISOR_API_KEY`); sem chave, a fase 1 roda com OpenStreetMap, sites oficiais e curadoria.
- **G3 Imagens:** reproduzir a foto **oficial** do lugar (do próprio site ou rede oficial) com "Reprodução web · nome", link para a origem e retirada em 24 h a pedido, como já fazemos. Nada de foto guardada do Google Places.
- **G4 Publicação:** correto como proposto: a lista nasce como proposta e publica sozinha quando cumpre os critérios (mínimo de lugares com dados verificados, ao menos 2 fontes de dados por lugar, foto aprovada ou cartão tipográfico, critério escrito); qualquer reclamação de um lugar suspende a lista; amostragem de revisão pelo editor.
- **G5 Patrocínio:** o editor pode subir uma lista pelo admin com a flag **Patrocinado**, apenas do CityNews e de seus parceiros; patrocínio nunca altera a ordem das listas editoriais.
- **G6 Chat:** adiado.
- **G7 Proposta por link:** o editor cola o link e o sistema o analisa com os modelos de extração e análise: extrai nomes, categoria, critério e o que for aproveitável, nunca copia texto; cada lugar é verificado de forma independente; a lista final é do CityNews.
- **G8 Catálogo e cadência:** cerca de 30 modelos (categoria × bairro × cozinha); 3 propostas por semana; atualização a cada 90 dias com "Atualizado em"; 10 listas publicadas no primeiro mês.

## 3. Rulings do controlador

- **R1 Atribuição legal das avaliações:** exibir "Avaliações do Google" e "Ranking do TripAdvisor" com o logotipo e o link exigidos pelos termos, sem guardar além do prazo permitido (nota e contagem atualizadas a cada 30 dias, nunca o texto das avaliações).
- **R2 Nome do critério:** cada lista tem "Como escolhemos" (texto curto), gerado e revisado pelo editor; não existe lista publicada sem ele.
- **R3 Vocabulário público:** sem menção a IA; origem em texto simples ("Dados: Google, TripAdvisor e sites dos lugares").
- **R4 Rotas:** `/guia-cuiaba` vira o índice de listas; `/guia-cuiaba/[slug]` a lista; `/guia-cuiaba/lugar/[slug]` a página do lugar; as matérias do Guia continuam em `/guia-cuiaba/materias` (editoria).

## 4. Arquitetura

- **Banco (migrations 0058 a 0060):** `venues` (slug, nome, categoria, subcategoria, bairro, endereço, lat, lng, telefone, site, instagram, horário, faixa de preço, `place_ids` jsonb com Google, OSM e TripAdvisor, `rating_google`, `rating_count`, `tripadvisor_rank`, `data_updated_at`, `status`), `venue_media` (liga `media_assets` a lugar, com crédito e `origin_url`), `guide_lists` (slug, título, critério, categoria, bairro, status `proposal|draft|published|suspended`, `sponsored`, `sponsor_name`, `next_refresh_at`), `guide_list_items` (posição, `venue_id`, nota do editor, `score` e `score_breakdown` jsonb), `guide_templates` (catálogo), `guide_proposals` (origem `template|link|manual`, `source_url`, `analysis` jsonb). RLS pública só de lista publicada.
- **Domínio puro `src/lib/guide/`:** `scoreVenue` (nota Google ponderada pela contagem, posição no ranking TripAdvisor, menções locais nas nossas matérias, completude de dados), `rankList`, `canAutoPublish`, `extractFromLink`, `listCriteriaText`.
- **Coleta:** passo `venue_sync` por categoria e bairro (Google Places, OpenStreetMap, TripAdvisor) com cota e orçamento; foto oficial pelo passo `image` existente (política `reproduction`).
- **Admin `/estudio/admin/guia`:** abas Propostas, Listas, Lugares, Modelos; cartão de proposta com pontuação por lugar e botões Publicar, Ajustar e Descartar; "Propor por link" e "Propor manualmente"; flag Patrocinado; histórico e auditoria; permissão `site.manage` e `article.edit`.
- **Público:** índice, lista (cards com foto, nota, bairro, "Como escolhemos") e página do lugar; JSON-LD `ItemList` e `LocalBusiness`; sem OriginStrip.

## 5. Testes

Domínio puro com tabela de casos; integração do RLS; e2e do admin (propor por link com página fictícia, publicar, suspender) e das páginas públicas; axe; vocabulário sem IA.

## 6. Fora do escopo agora

Chat do editor com modelo; mapa e "perto de você"; avaliações dos leitores; reserva e pedido.
