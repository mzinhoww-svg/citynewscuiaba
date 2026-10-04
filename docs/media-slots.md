# Posições de mídia do CityNews · inventário

Data: 03/10/2026. Base: `main` em `83a2f18`. Serve para fechar o mídia kit comercial e a spec do plano P7 CityNews TV. Versão em máquina: [`docs/media-slots.json`](media-slots.json). Prints: [`docs/reports/media-slots/`](reports/media-slots/) (script: `scripts/ops/media-slots-shots.mjs`).

Regra de leitura: **nada foi inventado**. O que não existe no código está marcado `não implementado`; o que só está na spec ou no pedido do dono está `PLANEJADO`; o que este inventário sugere sem spec está `CANDIDATO`; o que a regra proíbe está `VETADO`.

## 1. Resumo (verificado no código em 03/10/2026)

| Pergunta | Resposta |
|---|---|
| Existe algum banner (imagem com link, 970×250, 300×250...) no site? | **Não.** `AdSlot`, `ad_slots`, `ad_creatives`, `ad_placements`, `ad_stats`, `/api/ads/*` não existem. Só estão na spec e no plano `banners-padrão` (ADS-T1..T4). |
| Existe patrocinado nativo? | **Parcial.** Matéria com `articles.sponsored = true` aparece em "Mais lidas" da home e leva "Patrocinado" em texto (card, byline e "Como foi feito"). Zero matérias assim no banco local e em produção. Não há tela do Estúdio para marcar a matéria. |
| `sponsored_campaigns` é usada pelo portal? | **Não.** Só o painel A07 grava e lista. `placeSponsored` (regra 1 a cada 6) tem testes e não é chamada por página alguma (BLOCKERS B-022). |
| Há medição de impressão, viewability ou clique de anúncio? | **Não.** Nenhum evento de anúncio em `EVENT_NAMES`. `sponsored_campaigns.deliveries` é um inteiro que nada incrementa. |
| Slots de TV (cota no player, card do patrocinador, selo nos cortes)? | **Não implementado e sem spec.** Não há P7 no repositório. |
| Editorias proibidas | Código: `politica`, `seguranca`, `saude` (e subeditorias). **`justica` não está na lista** e hoje não existe editoria Justiça (ver §5.2). |

## 2. Como ler as tabelas

- Posição por breakpoint: **1280** (desktop), **768** (tablet), **390** (mobile). A spec banners-padrão **não define tablet**. Como o layout de duas colunas só liga em `lg` (1024), o inventário propõe que 768 siga o mobile; isso está em "Decisão do dono".
- Tamanho entre parênteses é o tamanho da peça ou do card; "~" indica medida do layout atual.
- Rótulo, frequência e rastreio dos slots PLANEJADOS são o que a spec §3 e o plano ADS-T1/T2 dizem; nada disso roda hoje.
- Editorias liberadas = as 11 que não são Política, Justiça, Segurança nem Saúde. Urgência e contexto sensível (crime, tragédia, saúde individual) bloqueiam em qualquer editoria.
- Fecha e lembra na sessão: só `STICKY` (✕ com `sessionStorage`). Não há pop-up, intersticial nem carrossel automático em nenhum slot; o `HUB` no mobile é carrossel **manual**.

## 3. Prints (390 e 1280)

Overlay injetado por script (o app não foi tocado). Vermelho com rótulo vermelho = existe no código; vermelho com rótulo âmbar = planejado; cinza = vetado. As molduras ficam por cima do conteúdo, sem reflow: onde um slot empurraria o layout, a moldura cobre texto. O seed local tem poucas matérias, então a editoria usa `?periodo=30d`.

| Rota | 390 | 1280 |
|---|---|---|
| Home | [home-390.png](reports/media-slots/home-390.png) | [home-1280.png](reports/media-slots/home-1280.png) |
| Editoria `cidade` | [editoria-cidade-390.png](reports/media-slots/editoria-cidade-390.png) | [editoria-cidade-1280.png](reports/media-slots/editoria-cidade-1280.png) |
| Matéria | [materia-390.png](reports/media-slots/materia-390.png) | [materia-1280.png](reports/media-slots/materia-1280.png) |
| Agenda | [agenda-390.png](reports/media-slots/agenda-390.png) | [agenda-1280.png](reports/media-slots/agenda-1280.png) |
| Pergunte | [pergunte-390.png](reports/media-slots/pergunte-390.png) | [pergunte-1280.png](reports/media-slots/pergunte-1280.png) |

Limitações dos prints: `ART-1` fica depois do último parágrafo quando a matéria do seed tem menos de 4; `NATIVE-LIST-CARD` fica no último card quando a lista tem menos de 6 itens (seed local); `NATIVE-HOME-MAISLIDAS` e `NATIVE-ARTICLE-LABEL` são desenhados onde o elemento apareceria, já que não há matéria patrocinada no banco local.

## 4. Inventário por tela

Cada tabela traz o que **existe hoje** (EXISTE) junto do **planejado** (banners-padrão ADS-T1..T4 e pedido da TV), para o dono ver o delta por tela. Telas sem slot na spec mostram uma linha `(nenhum)` com o motivo.

### home

| Tela | Rota | Slot (id) | Posição (1280 / 768 / 390) | Tamanhos | Tipo | Rótulo | Editorias | Frequência | Lazy | Fecha e lembra | Tracking | Componente e arquivo | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| home | `/` | `NATIVE-HOME-MAISLIDAS` · EXISTE | **1280:** Fim do módulo "Mais lidas em Cuiabá", linha inteira (md:col-span-2) abaixo dos itens 1 a 4 (linha de 1120×~96 (compacto))<br>**768:** Mesmo ponto, linha inteira (~700×96)<br>**390:** OCULTO: abaixo de 768 px a lista usa `max-md:[&>li:nth-child(n+4)]:hidden` e o patrocinado é o 5º `li` (4 mais lidas + ele); só aparece se houver só 2 mais lidas (342×~96) | card compacto de matéria (sem tamanho de peça) | nativo | Texto "Patrocinado" na linha de meta + `MadeHow` "Patrocínio"; sem plaqueta (publicLabels) | qualquer (sem filtro: gap, ver Lacunas 2) | 1 por carga (o primeiro `articles.sponsored = true` entre as 60 mais recentes); ignora `ads.max_per_page` | não (SSR no HTML) | não | imp.: nenhum<br>clique: só `article_opened` genérico, sem marca de patrocinado<br>view.: nenhum | src/app/(public)/(inicio)/page.tsx (Module_most_read), src/components/editorial/ArticleCard.tsx, MetaRow.tsx, src/lib/db/queries/home.ts | **parcial** |
| home | `/` | `TOP` · PLANEJADO | **1280:** Abaixo do ticker, largura do container (970 centralizado) (970×250)<br>**768:** Abaixo do ticker (728×90 (proposto))<br>**390:** Abaixo do ticker (320×100) | 970×250, 728×90, 320×100 | display | Publicidade (texto fixo acima da peça, `rel="sponsored noopener"`, `alt` obrigatório) | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | 1 peça por campo, rotação estável por sessão (peso); máx. 3 campos visíveis por tela no desktop e 2 no mobile; STICKY e TOP nunca juntos | sim, fora da primeira dobra; altura reservada (CLS 0) | não | imp.: planejado ADS-T1: POST /api/ads/view, 1 envio por peça por sessão (IntersectionObserver); sem evento em `events`<br>clique: planejado ADS-T1: GET /api/ads/click/[id] com 302 e contagem agregada (`ad_stats`)<br>view.: não implementado; o plano só prevê IntersectionObserver, sem limiar (requisito do dono: >= 50% por 1 s) | AdSlot (src/components/editorial/AdSlot.tsx) montado em PublicShell; ainda não existe | **não implementado** |
| home | `/` | `RAIL-A` · PLANEJADO | **1280:** Coluna direita, topo, acima do "Agora" (empurra o Agora para baixo) (300×250)<br>**768:** não aparece (proposto)<br>**390:** some; vira MID | 300×250 | display | Publicidade (texto fixo acima da peça, `rel="sponsored noopener"`, `alt` obrigatório) | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | 1 peça por campo, rotação estável por sessão (peso); máx. 3 campos visíveis por tela no desktop e 2 no mobile; STICKY e TOP nunca juntos | sim, fora da primeira dobra; altura reservada (CLS 0) | não | imp.: planejado ADS-T1: POST /api/ads/view, 1 envio por peça por sessão (IntersectionObserver); sem evento em `events`<br>clique: planejado ADS-T1: GET /api/ads/click/[id] com 302 e contagem agregada (`ad_stats`)<br>view.: não implementado; o plano só prevê IntersectionObserver, sem limiar (requisito do dono: >= 50% por 1 s) | AdSlot; coluna direita da home (page.tsx, grid lg:col-span-4) | **não implementado** |
| home | `/` | `RAIL-B` · PLANEJADO | **1280:** Coluna direita, abaixo do "Agora", fixo ao rolar (300×600)<br>**768:** não aparece<br>**390:** some | 300×600 | display | Publicidade (texto fixo acima da peça, `rel="sponsored noopener"`, `alt` obrigatório) | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | 1 peça por campo, rotação estável por sessão (peso); máx. 3 campos visíveis por tela no desktop e 2 no mobile; STICKY e TOP nunca juntos | sim, fora da primeira dobra; altura reservada (CLS 0) | não | imp.: planejado ADS-T1: POST /api/ads/view, 1 envio por peça por sessão (IntersectionObserver); sem evento em `events`<br>clique: planejado ADS-T1: GET /api/ads/click/[id] com 302 e contagem agregada (`ad_stats`)<br>view.: não implementado; o plano só prevê IntersectionObserver, sem limiar (requisito do dono: >= 50% por 1 s) | AdSlot; coluna direita | **não implementado** |
| home | `/` | `MID-1` · PLANEJADO | **1280:** Entre módulos, depois de "Assuntos em destaque" (970×120)<br>**768:** Mesmo ponto (728×90 (proposto))<br>**390:** Mesmo ponto (320×100) | 970×120, 320×100 | display | Publicidade (texto fixo acima da peça, `rel="sponsored noopener"`, `alt` obrigatório) | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | 1 peça por campo, rotação estável por sessão (peso); máx. 3 campos visíveis por tela no desktop e 2 no mobile; STICKY e TOP nunca juntos; MID 2 só no padrão C (fora do B) | sim, fora da primeira dobra; altura reservada (CLS 0) | não | imp.: planejado ADS-T1: POST /api/ads/view, 1 envio por peça por sessão (IntersectionObserver); sem evento em `events`<br>clique: planejado ADS-T1: GET /api/ads/click/[id] com 302 e contagem agregada (`ad_stats`)<br>view.: não implementado; o plano só prevê IntersectionObserver, sem limiar (requisito do dono: >= 50% por 1 s) | AdSlot dentro de MODULES (page.tsx); módulo novo em src/lib/admin/home-layout | **não implementado** |
| home | `/` | `HUB` · PLANEJADO | **1280:** Abaixo do bloco de editorias; bloco escuro, 2 a 4 cards de vídeo ou entrevista (~970×220 (cards))<br>**768:** 2 cards (~728×220)<br>**390:** Carrossel (manual, sem rotação automática) (~320×220) | 2 a 4 cards | vídeo | Conteúdo de parceiro | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | só quando houver parceiro; sem rotação automática | sim, fora da primeira dobra; altura reservada (CLS 0) | não | imp.: planejado ADS-T1: POST /api/ads/view, 1 envio por peça por sessão (IntersectionObserver); sem evento em `events`<br>clique: planejado ADS-T1: GET /api/ads/click/[id] com 302 e contagem agregada (`ad_stats`)<br>view.: não implementado; o plano só prevê IntersectionObserver, sem limiar (requisito do dono: >= 50% por 1 s) | bloco novo; sem arquivo | **não implementado** |
| home | `/` | `STICKY` · PLANEJADO | **1280:** não existe<br>**768:** não existe (proposto)<br>**390:** Rodapé fixo, acima da BottomNav, após 40% de rolagem (320×50) | 320×50 | display | Publicidade (texto fixo acima da peça, `rel="sponsored noopener"`, `alt` obrigatório) | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | 1 por sessão; nunca junto com TOP | sim, fora da primeira dobra; altura reservada (CLS 0) | sim: ✕ dispensável, lembrar em sessionStorage; foco e teclado para fechar | imp.: planejado ADS-T1: POST /api/ads/view, 1 envio por peça por sessão (IntersectionObserver); sem evento em `events`<br>clique: planejado ADS-T1: GET /api/ads/click/[id] com 302 e contagem agregada (`ad_stats`)<br>view.: não implementado; o plano só prevê IntersectionObserver, sem limiar (requisito do dono: >= 50% por 1 s) | BottomNav.tsx (hoje só navegação) + AdSlot | **não implementado** |
| home | `/` | `TILE-SERVICOS` · CANDIDATO | **1280:** Módulo "Serviços", 5º tile (tile de ServiceTile)<br>**768:** idem (tile)<br>**390:** idem (tile) | tile 1×1 do ServiceTile | tile | Patrocinado (texto) | —<br>**bloqueadas:** politica, justica, seguranca, saude | não definida | não | não | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | src/components/editorial/ServiceTile.tsx (sem prop de patrocínio) | **não implementado** |

- `NATIVE-HOME-MAISLIDAS`: Só aparece se houver artigo com `sponsored = true`: zero no banco local e zero em produção. Sem vínculo com `sponsored_campaigns`, sem estúdio para marcar a matéria.
- `TOP`: 768: sem breakpoint na spec; proposto seguir o layout mobile (a coluna lateral só existe a partir de lg = 1024)
- `RAIL-A`: A home de hoje não tem coluna lateral além do NowList; o wireframe põe RAIL-A acima de "Agora".
- `RAIL-B`: A spec diz "fixo ao rolar"; conflita com a altura da coluna (Agora tem 6 itens). Decisão do dono: ver seção própria.
- `HUB`: Spec diz carrossel no mobile: precisa ser manual (regra do dono: nenhum carrossel automático). Vídeo curto só no HUB.
- `STICKY`: Decisão do dono: empilhar acima da BottomNav (perde ~50 px de tela) ou substituí-la.
- `TILE-SERVICOS`: Candidato, fora de qualquer spec. Registrado porque o dono pediu o tipo tile.

### [editoria]

| Tela | Rota | Slot (id) | Posição (1280 / 768 / 390) | Tamanhos | Tipo | Rótulo | Editorias | Frequência | Lazy | Fecha e lembra | Tracking | Componente e arquivo | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [editoria] | `/[editoria] (ex.: /cidade)` | `TOP` · PLANEJADO | **1280:** Abaixo do ticker (970×250)<br>**768:** Abaixo do ticker (728×90 (proposto))<br>**390:** Abaixo do ticker (320×100) | 970×250, 728×90, 320×100 | display | Publicidade (texto fixo acima da peça, `rel="sponsored noopener"`, `alt` obrigatório) | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | 1 peça por campo, rotação estável por sessão (peso); máx. 3 campos visíveis por tela no desktop e 2 no mobile; STICKY e TOP nunca juntos | sim, fora da primeira dobra; altura reservada (CLS 0) | não | imp.: planejado ADS-T1: POST /api/ads/view, 1 envio por peça por sessão (IntersectionObserver); sem evento em `events`<br>clique: planejado ADS-T1: GET /api/ads/click/[id] com 302 e contagem agregada (`ad_stats`)<br>view.: não implementado; o plano só prevê IntersectionObserver, sem limiar (requisito do dono: >= 50% por 1 s) | AdSlot; src/app/(public)/[editoria]/page.tsx | **não implementado** |
| [editoria] | `/[editoria]` | `RAIL-A` · PLANEJADO | **1280:** Coluna direita (300 px), acima de "Mais lidas" (300×250)<br>**768:** vira faixa 320×100 acima de "Mais lidas" (320×100)<br>**390:** vira MID (320×100) | 300×250, 320×100 | display | Publicidade (texto fixo acima da peça, `rel="sponsored noopener"`, `alt` obrigatório) | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | 1 peça por campo, rotação estável por sessão (peso); máx. 3 campos visíveis por tela no desktop e 2 no mobile; STICKY e TOP nunca juntos | sim, fora da primeira dobra; altura reservada (CLS 0) | não | imp.: planejado ADS-T1: POST /api/ads/view, 1 envio por peça por sessão (IntersectionObserver); sem evento em `events`<br>clique: planejado ADS-T1: GET /api/ads/click/[id] com 302 e contagem agregada (`ad_stats`)<br>view.: não implementado; o plano só prevê IntersectionObserver, sem limiar (requisito do dono: >= 50% por 1 s) | AdSlot; aside#mais-lidas do [editoria]/page.tsx | **não implementado** |
| [editoria] | `/[editoria]` | `RAIL-B` · PLANEJADO | **1280:** Coluna direita, abaixo de "Mais lidas", fixo ao rolar (300×600)<br>**768:** não aparece<br>**390:** some | 300×600 | display | Publicidade (texto fixo acima da peça, `rel="sponsored noopener"`, `alt` obrigatório) | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | 1 peça por campo, rotação estável por sessão (peso); máx. 3 campos visíveis por tela no desktop e 2 no mobile; STICKY e TOP nunca juntos | sim, fora da primeira dobra; altura reservada (CLS 0) | não | imp.: planejado ADS-T1: POST /api/ads/view, 1 envio por peça por sessão (IntersectionObserver); sem evento em `events`<br>clique: planejado ADS-T1: GET /api/ads/click/[id] com 302 e contagem agregada (`ad_stats`)<br>view.: não implementado; o plano só prevê IntersectionObserver, sem limiar (requisito do dono: >= 50% por 1 s) | AdSlot; aside do [editoria]/page.tsx | **não implementado** |
| [editoria] | `/[editoria]` | `NATIVE-LIST-CARD` · PLANEJADO | **1280:** Na grade de 2 colunas, depois do 6º card (nunca manchete, nunca antes do índice 6) (card padrão)<br>**768:** idem (card padrão)<br>**390:** idem, coluna única (card padrão) | card de matéria | nativo | Patrocinado (texto, sem segunda plaqueta) | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | máx. 1 a cada 6 cards e `ads.max_per_page` (0 a 3, padrão 1); nunca ao lado de urgente ou sensível | não | não | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | src/lib/ads/rules.ts (placeSponsored: puro, testado, NÃO chamado por nenhuma página); src/lib/db/queries/sections.ts só exclui `sponsored` de "Mais lidas" da editoria; a lista principal (`filtered`) não filtra | **parcial** |
| [editoria] | `/[editoria]` | `STICKY` · PLANEJADO | **1280:** não existe<br>**768:** não existe (proposto)<br>**390:** Rodapé fixo, 40% de rolagem (320×50) | 320×50 | display | Publicidade (texto fixo acima da peça, `rel="sponsored noopener"`, `alt` obrigatório) | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | 1 peça por campo, rotação estável por sessão (peso); máx. 3 campos visíveis por tela no desktop e 2 no mobile; STICKY e TOP nunca juntos | sim, fora da primeira dobra; altura reservada (CLS 0) | sim, sessionStorage | imp.: planejado ADS-T1: POST /api/ads/view, 1 envio por peça por sessão (IntersectionObserver); sem evento em `events`<br>clique: planejado ADS-T1: GET /api/ads/click/[id] com 302 e contagem agregada (`ad_stats`)<br>view.: não implementado; o plano só prevê IntersectionObserver, sem limiar (requisito do dono: >= 50% por 1 s) | BottomNav.tsx + AdSlot | **não implementado** |

- `NATIVE-LIST-CARD`: Regra pronta e visível no painel A07, mas B-022: o portal não a chama. Hoje a lista principal da editoria mostra a matéria com `sponsored = true` na ordem cronológica, sem a regra 1:6 e sem bloqueio de editoria (inclusive Política).

### materia

| Tela | Rota | Slot (id) | Posição (1280 / 768 / 390) | Tamanhos | Tipo | Rótulo | Editorias | Frequência | Lazy | Fecha e lembra | Tracking | Componente e arquivo | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| materia | `/materia/[slug]` | `NATIVE-ARTICLE-LABEL` · EXISTE | **1280:** Linha de origem do byline e bloco "Como foi feito" na lateral (texto)<br>**768:** byline (texto)<br>**390:** byline (texto) | texto | nativo | "Patrocinado" no byline; "Patrocínio: Conteúdo pago por um anunciante e identificado como tal" em MadeHow | qualquer (sem filtro) | por matéria com `sponsored = true` | não | não | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | src/app/(public)/materia/[slug]/page.tsx (Byline), MadeHow.tsx, src/lib/labels/index.ts (publicLabels) | **implementado** |
| materia | `/materia/[slug]` | `ART-1` · PLANEJADO | **1280:** Após o 4º parágrafo, coluna de leitura (728×90)<br>**768:** idem (728×90 (proposto))<br>**390:** idem (320×100) | 728×90, 320×100 | display | Publicidade (texto fixo acima da peça, `rel="sponsored noopener"`, `alt` obrigatório) | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | 1 peça por campo, rotação estável por sessão (peso); máx. 3 campos visíveis por tela no desktop e 2 no mobile; STICKY e TOP nunca juntos; nunca em matéria urgente ou de editoria bloqueada | sim, fora da primeira dobra; altura reservada (CLS 0) | não | imp.: planejado ADS-T1: POST /api/ads/view, 1 envio por peça por sessão (IntersectionObserver); sem evento em `events`<br>clique: planejado ADS-T1: GET /api/ads/click/[id] com 302 e contagem agregada (`ad_stats`)<br>view.: não implementado; o plano só prevê IntersectionObserver, sem limiar (requisito do dono: >= 50% por 1 s) | AdSlot dentro do loop `.reading-body` da matéria | **não implementado** |
| materia | `/materia/[slug]` | `ART-2` · PLANEJADO | **1280:** Entre o fim da matéria e "Semelhantes"/"Relacionadas" (728×250)<br>**768:** idem (728×250 (proposto))<br>**390:** idem (300×250) | 728×250, 300×250 | display | Publicidade (texto fixo acima da peça, `rel="sponsored noopener"`, `alt` obrigatório) | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | 1 peça por campo, rotação estável por sessão (peso); máx. 3 campos visíveis por tela no desktop e 2 no mobile; STICKY e TOP nunca juntos | sim, fora da primeira dobra; altura reservada (CLS 0) | não | imp.: planejado ADS-T1: POST /api/ads/view, 1 envio por peça por sessão (IntersectionObserver); sem evento em `events`<br>clique: planejado ADS-T1: GET /api/ads/click/[id] com 302 e contagem agregada (`ad_stats`)<br>view.: não implementado; o plano só prevê IntersectionObserver, sem limiar (requisito do dono: >= 50% por 1 s) | AdSlot antes de section#semelhantes | **não implementado** |
| materia | `/materia/[slug]` | `RAIL-A` · PLANEJADO | **1280:** Topo do aside (acima de "Como foi feito"), sticky (300×250)<br>**768:** não aparece<br>**390:** some | 300×250 | display | Publicidade (texto fixo acima da peça, `rel="sponsored noopener"`, `alt` obrigatório) | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | 1 peça por campo, rotação estável por sessão (peso); máx. 3 campos visíveis por tela no desktop e 2 no mobile; STICKY e TOP nunca juntos | sim, fora da primeira dobra; altura reservada (CLS 0) | não | imp.: planejado ADS-T1: POST /api/ads/view, 1 envio por peça por sessão (IntersectionObserver); sem evento em `events`<br>clique: planejado ADS-T1: GET /api/ads/click/[id] com 302 e contagem agregada (`ad_stats`)<br>view.: não implementado; o plano só prevê IntersectionObserver, sem limiar (requisito do dono: >= 50% por 1 s) | AdSlot; aside da matéria (lg:sticky) | **não implementado** |
| materia | `/materia/[slug]` | `STICKY` · PLANEJADO | **1280:** não existe<br>**768:** não existe (proposto)<br>**390:** Rodapé fixo após 40% de rolagem (320×50) | 320×50 | display | Publicidade (texto fixo acima da peça, `rel="sponsored noopener"`, `alt` obrigatório) | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | 1 peça por campo, rotação estável por sessão (peso); máx. 3 campos visíveis por tela no desktop e 2 no mobile; STICKY e TOP nunca juntos | sim, fora da primeira dobra; altura reservada (CLS 0) | sim, sessionStorage | imp.: planejado ADS-T1: POST /api/ads/view, 1 envio por peça por sessão (IntersectionObserver); sem evento em `events`<br>clique: planejado ADS-T1: GET /api/ads/click/[id] com 302 e contagem agregada (`ad_stats`)<br>view.: não implementado; o plano só prevê IntersectionObserver, sem limiar (requisito do dono: >= 50% por 1 s) | BottomNav.tsx + AdSlot | **não implementado** |

- `NATIVE-ARTICLE-LABEL`: Push (0041/0043) e busca com IA (`exclude_sponsored`) já ignoram matéria patrocinada.
- `RAIL-A`: RAIL-B não aparece no wireframe da matéria: decisão do dono.

### assunto

| Tela | Rota | Slot (id) | Posição (1280 / 768 / 390) | Tamanhos | Tipo | Rótulo | Editorias | Frequência | Lazy | Fecha e lembra | Tracking | Componente e arquivo | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| assunto | `/assunto/[slug]` | `NATIVE-TOPIC-TIMELINE` · EXISTE | **1280:** Linha do tempo do assunto: a matéria com `sponsored = true` ligada ao assunto entra na ordem de publicação<br>**768:** idem<br>**390:** idem | card de matéria | nativo | "Patrocinado" em texto na meta do card | qualquer (sem filtro; o assunto mistura editorias, inclusive Política) | sem regra: todas as matérias patrocinadas do assunto | não | não | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | src/lib/db/queries/topics.ts (consulta por `topic_id` sem filtro de `sponsored`) | **parcial** |
| assunto | `/assunto/[slug]` | `(nenhum)` · CANDIDATO | **1280:** sem slot na spec<br>**768:** sem slot<br>**390:** sem slot | — | display | — | —<br>**bloqueadas:** politica, justica, seguranca, saude | — | — | — | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | src/app/(public)/assunto/[slug]/page.tsx | **não implementado** |

- `NATIVE-TOPIC-TIMELINE`: Acidental, não é slot comercial. Some quando MS-T1 filtrar `sponsored` fora dos slots.
- `(nenhum)`: Spec banners-padrão §2 só prevê home, editorias e matéria. Cobertura de assunto mistura editorias e pode tocar Política.

### explorar

| Tela | Rota | Slot (id) | Posição (1280 / 768 / 390) | Tamanhos | Tipo | Rótulo | Editorias | Frequência | Lazy | Fecha e lembra | Tracking | Componente e arquivo | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| explorar | `/explorar` | `(nenhum)` · CANDIDATO | **1280:** sem slot na spec<br>**768:** sem slot<br>**390:** sem slot | — | tile | — | —<br>**bloqueadas:** politica, justica, seguranca, saude | — | — | — | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | src/app/(public)/explorar/page.tsx; SectionTile.tsx | **não implementado** |

- `(nenhum)`: Candidato natural para tile patrocinado (SectionTile); sem spec: Decisão do dono.

### colecoes

| Tela | Rota | Slot (id) | Posição (1280 / 768 / 390) | Tamanhos | Tipo | Rótulo | Editorias | Frequência | Lazy | Fecha e lembra | Tracking | Componente e arquivo | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| colecoes | `/colecoes/[slug]` | `(nenhum)` · CANDIDATO | **1280:** sem slot na spec<br>**768:** sem slot<br>**390:** sem slot | — | display | — | —<br>**bloqueadas:** politica, justica, seguranca, saude | — | — | — | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | src/app/(public)/colecoes/[slug]/page.tsx | **não implementado** |

- `(nenhum)`: Coleção patrocinada seria nativo; o plano guia-cuiaba prevê a flag Patrocinado só para listas do Guia (GUIA-T5), não implementada.

### agenda

| Tela | Rota | Slot (id) | Posição (1280 / 768 / 390) | Tamanhos | Tipo | Rótulo | Editorias | Frequência | Lazy | Fecha e lembra | Tracking | Componente e arquivo | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| agenda | `/agenda` | `AGENDA-RAIL-A` · CANDIDATO | **1280:** Coluna direita (300 px), abaixo do calendário (300×250)<br>**768:** não aparece<br>**390:** sem slot | 300×250 | display | Publicidade | agenda<br>**bloqueadas:** politica, justica, seguranca, saude | 1 por tela | sim | não | imp.: planejado ADS-T1: POST /api/ads/view, 1 envio por peça por sessão (IntersectionObserver); sem evento em `events`<br>clique: planejado ADS-T1: GET /api/ads/click/[id] com 302 e contagem agregada (`ad_stats`)<br>view.: não implementado; o plano só prevê IntersectionObserver, sem limiar (requisito do dono: >= 50% por 1 s) | aside de src/app/(public)/agenda/page.tsx; AdSlot inexistente | **não implementado** |

- `AGENDA-RAIL-A`: Candidato, fora da spec banners-padrão.

### evento

| Tela | Rota | Slot (id) | Posição (1280 / 768 / 390) | Tamanhos | Tipo | Rótulo | Editorias | Frequência | Lazy | Fecha e lembra | Tracking | Componente e arquivo | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| evento | `/agenda/[slug]` | `(nenhum)` · CANDIDATO | **1280:** sem slot na spec<br>**768:** sem slot<br>**390:** sem slot | — | display | — | —<br>**bloqueadas:** politica, justica, seguranca, saude | — | — | — | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | src/app/(public)/agenda/[slug]/page.tsx | **não implementado** |

- `(nenhum)`: Não existe rota /evento; o evento vive em /agenda/[slug]. Evento patrocinado (destaque pago) não existe no modelo.

### busca

| Tela | Rota | Slot (id) | Posição (1280 / 768 / 390) | Tamanhos | Tipo | Rótulo | Editorias | Frequência | Lazy | Fecha e lembra | Tracking | Componente e arquivo | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| busca | `/busca` | `NATIVE-CARD-LABEL` · EXISTE | **1280:** Qualquer ArticleCard em resultado (texto no card)<br>**768:** idem (texto)<br>**390:** idem (texto) | texto | nativo | "Patrocinado" em texto na meta do card | qualquer | por resultado com `sponsored = true`; busca com IA exclui | não | não | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | ArticleCard.tsx / MetaRow.tsx; src/lib/db/queries/search.ts (exclude_sponsored) | **implementado** |

- `NATIVE-CARD-LABEL`: Vale para todo card em qualquer tela.

### pergunte

| Tela | Rota | Slot (id) | Posição (1280 / 768 / 390) | Tamanhos | Tipo | Rótulo | Editorias | Frequência | Lazy | Fecha e lembra | Tracking | Componente e arquivo | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pergunte | `/pergunte` | `ASK-RESPOSTA-PATROCINADA` · VETADO | **1280:** vetado<br>**768:** vetado<br>**390:** vetado | — | resposta | — | —<br>**bloqueadas:** todas | nunca | — | — | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | placeSponsored recusa lista com `aiAnswer`; `exclude_sponsored` na busca com IA; spec D17 e CLAUDE.md §5.5 | **não implementado** |
| pergunte | `/pergunte` | `ASK-RAIL-A` · CANDIDATO | **1280:** Coluna "Fontes consultadas", abaixo das fontes, nunca ao lado de resposta (300×250)<br>**768:** sem slot<br>**390:** sem slot | 300×250 | display | Publicidade | —<br>**bloqueadas:** todas | — | — | não | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | src/app/(public)/pergunte/page.tsx (grid com --layout-rail) | **não implementado** |

- `ASK-RESPOSTA-PATROCINADA`: Vetado por regra: IA nunca responde com patrocinado, patrocinado nunca entra em `sources`. Não é lacuna a fechar.
- `ASK-RAIL-A`: NÃO recomendado: qualquer banner junto da resposta pode parecer parte dela. Registrado só para o dono decidir.

### fontes

| Tela | Rota | Slot (id) | Posição (1280 / 768 / 390) | Tamanhos | Tipo | Rótulo | Editorias | Frequência | Lazy | Fecha e lembra | Tracking | Componente e arquivo | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| fontes | `/fontes e /fontes/[slug]` | `(nenhum)` · CANDIDATO | **1280:** sem slot na spec<br>**768:** sem slot<br>**390:** sem slot | — | display | — | —<br>**bloqueadas:** politica, justica, seguranca, saude | — | — | — | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | src/app/(public)/fontes/** | **não implementado** |

- `(nenhum)`: Ranking de fontes não pode ser influenciado por anúncio (tracking-plan §4).

### panorama

| Tela | Rota | Slot (id) | Posição (1280 / 768 / 390) | Tamanhos | Tipo | Rótulo | Editorias | Frequência | Lazy | Fecha e lembra | Tracking | Componente e arquivo | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| panorama | `/panorama` | `(nenhum)` · VETADO | **1280:** sem slot<br>**768:** sem slot<br>**390:** sem slot | — | display | — | —<br>**bloqueadas:** todas | — | — | — | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | src/app/(public)/panorama/page.tsx; AggregatedSection.tsx | **não implementado** |

- `(nenhum)`: Superfície de agregados (regra 3: 1 plaqueta por card, AGREGADO). Anúncio ao lado confundiria origem; não recomendado.

### favoritos

| Tela | Rota | Slot (id) | Posição (1280 / 768 / 390) | Tamanhos | Tipo | Rótulo | Editorias | Frequência | Lazy | Fecha e lembra | Tracking | Componente e arquivo | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| favoritos | `/favoritos` | `(nenhum)` · VETADO | **1280:** sem slot<br>**768:** sem slot<br>**390:** sem slot | — | display | — | —<br>**bloqueadas:** todas | — | — | — | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | src/app/(public)/favoritos/page.tsx | **não implementado** |

- `(nenhum)`: Área pessoal do leitor; segmentar exigiria dado individual (regra 7).

### newsletter

| Tela | Rota | Slot (id) | Posição (1280 / 768 / 390) | Tamanhos | Tipo | Rótulo | Editorias | Frequência | Lazy | Fecha e lembra | Tracking | Componente e arquivo | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| newsletter | `/newsletter` | `NEWSLETTER-SPONSOR` · CANDIDATO | **1280:** Bloco de patrocinador no corpo do e-mail diário (não na página) (600×~100 no e-mail)<br>**768:** —<br>**390:** — (320×~100) | a definir (e-mail) | newsletter | Patrocinado (texto) | —<br>**bloqueadas:** politica, justica, seguranca, saude | 1 por edição | — | — | imp.: não mensurável sem pixel (regra 7)<br>clique: redirecionamento contado, planejado<br>view.: não se aplica | src/app/(public)/newsletter/page.tsx + NewsletterForm.tsx (só inscrição, é divulgação do próprio CityNews, não anúncio); envio não existe (B-005) | **não implementado** |

- `NEWSLETTER-SPONSOR`: Sem provedor de e-mail com chave (B-005) não há edição para patrocinar.

### perfil

| Tela | Rota | Slot (id) | Posição (1280 / 768 / 390) | Tamanhos | Tipo | Rótulo | Editorias | Frequência | Lazy | Fecha e lembra | Tracking | Componente e arquivo | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| perfil | `/perfil` | `(nenhum)` · VETADO | **1280:** sem slot<br>**768:** sem slot<br>**390:** sem slot | — | display | — | —<br>**bloqueadas:** todas | — | — | — | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | src/app/(public)/perfil/page.tsx | **não implementado** |

- `(nenhum)`: Conta e privacidade: sem anúncio.

### tv (P7)

| Tela | Rota | Slot (id) | Posição (1280 / 768 / 390) | Tamanhos | Tipo | Rótulo | Editorias | Frequência | Lazy | Fecha e lembra | Tracking | Componente e arquivo | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| tv (P7) | `/tv (não existe)` | `TV-PLAYER-COTA` · PLANEJADO | **1280:** Dentro do player: pré-roll curto ou cota de patrocínio na moldura (—)<br>**768:** idem (—)<br>**390:** idem (—) | a definir | vídeo | Patrocinado (texto) + "Publicidade" na cota | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | a definir; sem autoplay com som | — | — | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | nenhum; só VideoLowerThird.tsx (tarja de vídeo da marca, sem relação com anúncio) | **não implementado** |
| tv (P7) | `/tv/[slug] (não existe)` | `TV-SPONSOR-CARD` · PLANEJADO | **1280:** Card do patrocinador acima da matéria/vídeo (—)<br>**768:** idem (—)<br>**390:** idem (—) | a definir | nativo | Patrocinado por {anunciante} | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | 1 por vídeo | — | — | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | nenhum | **não implementado** |
| tv (P7) | `/tv (cortes)` | `TV-CUT-BADGE` · PLANEJADO | **1280:** Selo do patrocinador nos cortes (canto do card e do vídeo) (—)<br>**768:** idem (—)<br>**390:** idem (—) | selo | vídeo | Patrocinado (texto, com ícone) | cidade, mobilidade, clima, economia, cultura, entretenimento, gastronomia, esportes, servicos, guia-cuiaba, agenda<br>**bloqueadas:** politica, justica, seguranca, saude | por corte | — | — | imp.: nenhum<br>clique: nenhum<br>view.: nenhum | nenhum | **não implementado** |

- `TV-PLAYER-COTA`: Não há spec nem plano P7 no repositório (busca em docs/ e .planning/): este slot vem do pedido do dono.
- `TV-SPONSOR-CARD`: Mesma regra de editoria; relatório por vídeo.
- `TV-CUT-BADGE`: Texto nunca só por cor (regra 3).

## 5. Lacunas

### 5.1 Que tipos de `creative` `sponsored_campaigns` suporta hoje, e o que falta

Hoje a tabela é `sponsored_campaigns(id, advertiser, starts_on, ends_on, allowed_sections text[], creative jsonb, status, deliveries, created_by, updated_at)`. O `creative` **não tem tipo**: é um objeto `{ title, href, imageUrl?, imageAlt? }` (`Campaign["creative"]` em `src/lib/ads/rules.ts`, lido por `creativeOf` em `src/lib/db/queries/admin-ops.ts`, gravado por `saveCampaignCommand` em `src/lib/studio/admin-ops.ts`). Na prática é **um cartão nativo de texto, com imagem opcional**. Não há coluna de formato, slot, dimensões, vídeo, peso, limite diário nem anunciante estruturado (`advertiser` é texto livre). O painel A07 não faz upload: `imageUrl` é um texto.

| Tipo | Suporta hoje? | Campos que faltam |
|---|---|---|
| Nativo (card) | Parcial: `title`, `href`, `imageUrl`, `imageAlt`. O portal ignora a tabela e usa `articles.sponsored` | vínculo campanha ↔ matéria (`article_id`), `kind = "native"`, `sponsor_name`/`sponsor_logo`, regra de "Patrocinado" por campanha, `max_impressions_per_day` |
| Display (banner) | Não | `kind = "display"`, `slot` (TOP, RAIL-A...), `width`/`height` validados por slot, `asset_url` com tipo e peso, `alt` obrigatório, `href` https com UTM, `rel` fixo, `weight` de rotação, `placements` por período e editoria |
| Tile | Não | `kind = "tile"`, ícone/imagem 1×1, título curto, `href`, superfície (home Serviços, Explorar) |
| Resposta patrocinada | **Vetado** (spec D17, CLAUDE.md §5.5) | nada a implementar |
| Newsletter | Não | `kind = "newsletter"`, texto de até 2 linhas, imagem 600 px, `href` rastreável, edição alvo; depende de provedor de e-mail (B-005) |
| Vídeo (HUB, TV) | Não | `kind = "video"`, `video_url`, `poster`, duração máxima, legenda, sem autoplay com som |

A spec banners-padrão resolve a maior parte com `ad_slots`, `ad_creatives`, `ad_placements`, `ad_stats` (ADS-T1); newsletter, tile e vídeo **não** estão nela.

### 5.2 Rotação, cap de frequência e bloqueio por editoria

- **Rotação:** não existe. `placeSponsored` recebe **uma** campanha (`Campaign | null`); não escolhe entre várias. A rotação estável por sessão está só no plano (`selectCreative`, ADS-T1).
- **Cap de frequência:** dois tetos fixos, ambos em `placeSponsored` e **não ligados ao portal**: no máximo 1 a cada 6 cards (`SLOT_EVERY = 6`, nunca antes do índice 6) e `ads.max_per_page` (`app_settings`, inteiro de 0 a 3, padrão 1, editável pelo admin com `site.manage`; produção = 1). Não há cap por pessoa, por dia nem por campanha.
- **Bloqueio por editoria, onde vale:**
  1. Banco: `0001` tinha `check ('politica' <> all(allowed_sections))`; `0039` trocou por `not (allowed_sections && array['politica','seguranca','saude'])` e `0048` acrescentou o trigger `guard_sponsored_sections`, que também barra subeditoria cuja `autonomy_category` seja uma dessas. Vale em qualquer gravação.
  2. Estúdio: o formulário só oferece editorias fora de `NEVER_SECTIONS`, e `saveCampaignCommand` valida de novo com `isNeverSection`.
  3. **Front: não é aplicado.** `isNeverSection` e `allowedSections` só rodam dentro de `placeSponsored`, que nenhuma página chama. O que aparece hoje vem de `articles.sponsored`, e a home escolhe `articles.find(a => a.sponsored)` **sem olhar a editoria** nem o período. Nenhum trigger impede `sponsored = true` em matéria de Política. A lista principal da editoria (`filtered` em `sections.ts`) e a página de assunto (`topics.ts`) também **não** filtram `sponsored`: só "Mais lidas" da editoria, Semelhantes, Explorar, alertas, SEO, push e a busca com IA excluem. Uma matéria patrocinada de Política entraria na lista de Política.
- **Justiça:** o dono pede Política e Justiça sempre bloqueadas. Não há editoria `justica` no seed nem na lista `NEVER_SECTIONS`/no trigger. Se ela for criada, o bloqueio **não** valeria sozinho (tarefa MS-T1).

### 5.3 Eventos de impressão, viewability e clique

Em `events` (`id, name, anon_id, user_id, at, received_at, source_slug, content_ref, session jsonb, consent jsonb, algo_version, props jsonb`, particionada, `props` com schema estrito em `src/lib/events/schema.ts`):

| Medida | Existe? |
|---|---|
| Impressão de anúncio | **Não.** Nenhum nome em `EVENT_NAMES`. O mais próximo é `source_viewed` (visível >= 1 s, só em fonte) |
| Viewability >= 50% por 1 s | **Não.** Nenhum `IntersectionObserver` com esse limiar em componente público |
| Clique de anúncio | **Não.** `article_opened` e `recommendation_clicked` existem, sem marca de patrocinado nem de slot |
| Agregação | `source_stats_daily` (por fonte) e métricas de push (`push_send_counters`). Nada por anunciante, campanha ou slot |

O que falta para o **relatório mensal por anunciante** (impressões, cliques, CTR, por slot e editoria):

1. Nomes e props: `ad_impression`, `ad_viewable`, `ad_click` com `placement`, `slot`, `section` (ou contadores próprios `ad_stats`, como a spec sugere, sem identificador).
2. Medição no cliente: observador >= 50% por 1 s, 1 envio por peça por sessão; clique pela rota 302 (conta no servidor, sobrevive a bloqueadores).
3. **Consentimento:** hoje, sem aceite, **nada é enviado** (tracking-plan §1; o padrão é "Só o necessário"). Impressão por evento de cliente subconta a maioria dos leitores. O contador agregado sem identificador precisa de decisão jurídica (ver "Decisão do dono").
4. Antifraude: filtro de bot (`User-Agent`, sem gravar) e deduplicação em recarga rápida.
5. Rollup diário (`ad_stats` por dia, campanha, slot, editoria), CSV e relatório do anunciante em link com validade. Retenção: os eventos individuais são anonimizados em 30 a 90 dias; o agregado precisa de retenção própria (fatura e disputa).
6. Anunciante estruturado (`advertiser_id`), hoje texto livre.

### 5.4 Flag do patrocinado nativo e estado em produção

- **Atualização 04/10 (MS-T1):** a flag `sponsored_native_enabled` agora existe (0075), nasce desligada e aparece nos Interruptores do Estúdio. O texto abaixo descreve o estado de 03/10.
- **Não existe flag dedicada.** B-003 diz "`sponsored_campaigns` desligado por flag", mas nenhuma migration cria uma chave de patrocínio em `feature_flags`. Conferido em `supabase/migrations/*` e em `src`.
- O que de fato mantém desligado: (a) `placeSponsored` não é chamada (B-022); (b) não há matéria com `sponsored = true`; (c) `ads.max_per_page` em `app_settings` (0 desliga a regra da lista, mas ela nem roda).
- Estado em **produção** (`citynews-prod`, leitura SQL via conector Supabase em 03/10/2026): `feature_flags`: `read_only=false`, `ai_enabled=true`, `personalization_enabled=true`, `image_reproduction_enabled=true`, `source_link_analysis=true`, `auto_publish=true`. `app_settings`: `ads.max_per_page = 1`. `sponsored_campaigns`: nenhuma linha. `articles` com `sponsored = true`: 0. Nenhuma chave de patrocínio existe.
- Estado local (pilha local, mesmas migrations): idem, sem campanhas e sem matéria patrocinada.

### 5.5 O que muda para sair do plano Hobby da Vercel (B-003)

Estado: o projeto `citynewscuiaba` roda em **Hobby** (decisão A-004; QUESTIONS 4). Os termos do Hobby restringem uso comercial; vender patrocínio ou banner é uso comercial. Não consultei o plano nem os preços na Vercel nesta tarefa: **plano atual e valores não verificados**; confirmar no painel.

Passos e impactos:

1. **Conta:** migrar o projeto para um time **Pro** (o escopo atual do projeto não foi verificado; o conector Vercel tem `buy_pro`, que não foi usado). Pro cobra por assento; o dono decide quem entra. Fazer **antes** de o primeiro contrato ou da primeira veiculação paga.
2. **Domínio e DNS:** mover o projeto de escopo preserva domínio, mas conferir `citynewscuiaba.vercel.app`, o domínio próprio e as variáveis de ambiente (B-013: `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` ainda não estão cadastrados).
3. **Limites que sobem (não verificado):** deploys por dia (B-017 bateu 100/dia no Hobby), duração máxima de função (hoje `maxDuration` 60 s em `drain`, `tick`, `fast-tick`, `ask`, `agenda`; 30 s em `revalidate`, em `src/app/api/**` e `src/lib/pipeline/drain.ts`, comentado como "limite do Vercel Hobby"), banda e invocações. Depois da migração, reavaliar esses números; não há mudança de código obrigatória.
4. **Cron:** o ciclo roda no Supabase (`pg_cron`), não em Vercel Cron; não há `vercel.json`. Sem impacto.
5. **Observabilidade para vender:** Web Analytics/Speed Insights, logs com mais retenção e proteção de firewall passam a valer como argumento comercial; CLS por slot (orçamento da spec §4) deve ir no CI antes de prometer "CLS 0".
6. **Contrato e LGPD:** termos comerciais e o aviso do `/anuncie` (hoje só texto fixo, com `[PREENCHER]` em razão social, CNPJ e telefone: B-001) precisam estar fechados antes de cobrar.

### 5.6 Tarefas para fechar cada lacuna

Estimativas em horas de implementação com testes (sem espera de aprovação do dono). Numeração `MS-T#`; ADS-T1..T4 são as tarefas já planejadas e aparecem aqui só com a estimativa e o delta que este inventário acrescenta. Ordem sugerida: MS-T1, ADS-T1, MS-T2, ADS-T2, ADS-T3, MS-T3, ADS-T4, MS-T4, MS-T5, MS-T6, MS-T7.

#### Task MS-T1: Desligar de verdade e blindar o nativo que existe (5 h) · concluída em 04/10 (migration 0075, A-115)
**Files:** `supabase/migrations/00NN_sponsored_guard.sql` (próximo número livre; 0054 a 0074 já existem), `src/lib/ads/rules.ts` + `rules.test.ts`, `src/lib/db/queries/home.ts`, `src/lib/db/queries/sections.ts`, `src/lib/db/queries/topics.ts`, `src/app/(public)/(inicio)/page.tsx`, `src/lib/flags/index.ts`.
**Interfaces:** `feature_flags.sponsored_native_enabled` (padrão `false`); `NEVER_SECTIONS` ganha `justica`; trigger `guard_article_sponsored` recusa `articles.sponsored = true` em Política, Justiça, Segurança, Saúde, `urgent = true` ou subeditoria dessas categorias; `getHomeData` só devolve `sponsored` com a flag ligada, matéria fora das editorias bloqueadas e campanha `campaignLive`, e o card não fica escondido abaixo de 768 px; lista da editoria e linha do tempo do assunto passam a excluir `sponsored` (o patrocinado só entra pelo slot).
- [ ] Testes primeiro: tabela de casos de `isNeverSection("justica")`; trigger recusa insert/update; home sem flag não renderiza o patrocinado; com flag, o patrocinado aparece em 390 px; `/politica` e o assunto não listam matéria patrocinada.
- [ ] Comando: `pnpm vitest run src/lib/ads && pnpm db:reset && pnpm verify`.
- [ ] Commit: `feat: flag e trava do patrocinado nativo [MS-T1]`.

#### Task MS-T2: Creative tipado e anunciante estruturado (6 h) · concluída em 04/10 (migration 0081, A-118)
**Files:** `supabase/migrations/00NN_creative_kinds.sql`, `src/lib/ads/creative.ts` + `.test.ts`, `src/lib/studio/admin-ops.ts`, `src/components/studio/admin/CampaignsPanel.tsx`, `src/content/pt-BR/admin-ops.ts`.
**Interfaces:** `CreativeSchema` (zod, união discriminada por `kind`: `native | display | tile | newsletter | video`, com `slot`, `width`, `height`, `alt`, `href` https, `weight`, `maxImpressionsPerDay`); coluna `advertiser_id` + tabela `advertisers`; migração dos `creative` atuais para `kind = "native"`. `ADS-T1` herda este schema em `ad_creatives`.
- [ ] Testes: cada `kind` aceita o válido e recusa dimensão errada, `alt` vazio e `href` http.
- [ ] Comando: `pnpm vitest run src/lib/ads src/lib/studio && pnpm verify`.
- [ ] Commit: `feat: creative tipado e anunciante [MS-T2]`.

#### Task ADS-T1: Banco, seleção e componente (14 h; já planejada) · concluída em 04/10 (migration 0082, A-119)
Acréscimo deste inventário: `selectCreative` aplica `weight` e `maxImpressionsPerDay`; `AdSlot` recusa render em editoria bloqueada **no servidor**, não só no painel; altura reservada medida por CLS no Playwright.

#### Task ADS-T2: Posições no site (12 h; já planejada) · concluída em 04/10 (migration 0083, A-120)
Acréscimo: tabela de breakpoints deste inventário (incluindo 768), RAIL-A/RAIL-B na home exige novo grid (o NowList hoje ocupa a coluna), `STICKY` empilhado acima da `BottomNav`; HUB no mobile com carrossel manual.

#### Task ADS-T3: Peças genéricas (10 h; já planejada) · concluída em 04/10 (A-121)
Sem acréscimo.

#### Task MS-T3: Eventos de anúncio e viewability (10 h)
**Files:** `src/lib/events/names.ts`, `schema.ts`, `src/components/editorial/AdSlot.tsx` (cliente: observador), `src/lib/ads/viewability.ts` + `.test.ts`, `src/app/api/ads/view/route.ts`, `src/app/api/ads/click/[id]/route.ts`, `docs/tracking-plan.md` (nova §2b).
**Interfaces:** `createViewabilityTracker({ threshold: 0.5, ms: 1000, onViewable })` puro e testável com relógio falso; `POST /api/ads/view` com `{ placement, kind: "impression" | "viewable" }`; deduplicação por peça e sessão; filtro de bot; clique conta no servidor e responde 302.
- [ ] Testes: 49% não conta, 50% por 999 ms não conta, 50% por 1000 ms conta uma vez; recarga rápida não dobra; link inválido não quebra a página.
- [ ] Comando: `pnpm vitest run src/lib/ads src/lib/events && pnpm test:e2e --grep @ads && pnpm verify`.
- [ ] Commit: `feat: impressão, viewability e clique de anúncio [MS-T3]`.

#### Task ADS-T4: Administração e métricas (24 h; já planejada)
Acréscimo: A07 passa a ler `ad_stats`; "Pausar tudo" usa a mesma regra de duas pessoas do A13.

#### Task MS-T4: Relatório mensal por anunciante (12 h)
**Files:** `supabase/migrations/00NN_ad_stats_rollup.sql`, `src/lib/ads/report.ts` + `.test.ts`, `src/lib/db/queries/ads-report.ts`, `src/app/estudio/admin/publicidade/relatorios/page.tsx`, `src/app/relatorio/[token]/page.tsx`, `src/app/estudio/admin/publicidade/relatorios/export/route.ts`.
**Interfaces:** `monthlyReport({ advertiserId, month }) => Result<{ rows: { slot, section, impressions, viewable, clicks, ctr }[], totals }, ReportError>`; CTR = cliques ÷ impressões visíveis (definição escrita no relatório); CSV sem dado pessoal; link de leitura com token e validade.
- [ ] Testes: fixture com 3 slots e 2 editorias; mês sem entrega; divisão por zero; fuso de Cuiabá (UTC-4) na virada do mês.
- [ ] Comando: `pnpm vitest run src/lib/ads && pnpm test:e2e --grep @ads-report && pnpm verify`.
- [ ] Commit: `feat: relatório mensal por anunciante [MS-T4]`.

#### Task MS-T5: Tile e newsletter patrocinados (10 h; só depois de B-005)
**Files:** `src/components/editorial/ServiceTile.tsx` (prop `sponsored`), `src/app/(public)/explorar/page.tsx`, `src/lib/newsletter/sponsor.ts` + `.test.ts`, template de e-mail da edição diária.
**Interfaces:** `renderSponsorBlock(creative: NewsletterCreative): { html: string; text: string }`; rótulo "Patrocinado" em texto; sem pixel de abertura.
- [ ] Testes: bloco sempre com rótulo, link rastreado, sem imagem sem `alt`.
- [ ] Comando: `pnpm vitest run src/lib/newsletter src/components && pnpm verify`.
- [ ] Commit: `feat: tile e newsletter patrocinados [MS-T5]`.

#### Task MS-T6: Sair do Hobby antes de vender (3 h de operação + decisão de custo)
**Files:** `.planning/BLOCKERS.md` (B-003), `.planning/DECISIONS.md` (A-###), `src/lib/pipeline/drain.ts` (só o comentário e a constante, se o dono quiser subir `maxDuration`), `docs/runbooks/vercel-pro.md`.
**Interfaces:** nenhuma de código. Checklist: criar time Pro, mover projeto, conferir domínio e variáveis (B-013), reexecutar um deploy, medir CLS e LCP (B-020), registrar a data da migração.
- [ ] Teste: `curl -I` na produção e `pnpm test:e2e` contra a prévia do novo escopo.
- [ ] Comando: `pnpm verify`.
- [ ] Commit: `docs: migração para Vercel Pro antes da venda [MS-T6]`.

#### Task MS-T7: Spec e slots da CityNews TV, P7 (6 h de spec; implementação fica para o plano P7)
**Files:** `docs/superpowers/specs/2026-10-0X-citynews-tv-design.md`, `docs/superpowers/plans/2026-10-0X-p7-citynews-tv.md`, `docs/media-slots.json` (promove `TV-*` de PLANEJADO para decididos).
**Interfaces:** definir `TV-PLAYER-COTA` (duração, sem autoplay com som, pular após n s), `TV-SPONSOR-CARD` (acima da matéria/vídeo), `TV-CUT-BADGE`; eventos `video_started`, `video_quartile`, `ad_viewable` para vídeo; regra de editoria idêntica; consentimento; relatório por vídeo.
- [ ] Teste: schema do JSON validado por script (`node scripts/ops/check-media-slots.mjs`) que falha se um slot liberar editoria bloqueada.
- [ ] Comando: `pnpm verify`.
- [ ] Commit: `docs: spec da CityNews TV e slots de vídeo [MS-T7]`.

| Tarefa | Horas |
|---|---|
| MS-T1 | 5 |
| MS-T2 | 6 |
| ADS-T1 | 14 |
| ADS-T2 | 12 |
| ADS-T3 | 10 |
| MS-T3 | 10 |
| ADS-T4 | 24 |
| MS-T4 | 12 |
| MS-T5 | 10 |
| MS-T6 | 3 |
| MS-T7 | 6 |
| **Total** | **112** (60 nas tarefas ADS já planejadas e 52 novas) |

Mínimo para **vender banner de forma defensável**: MS-T1, MS-T2, ADS-T1, ADS-T2, ADS-T3, MS-T3, MS-T4 e MS-T6 = 72 h.

## 6. Decisão do dono

Nenhuma pergunta foi feita durante o trabalho; estas ficam para a próxima reunião.

1. **Tablet (768):** seguir o layout mobile (proposto) ou criar um terceiro formato (728×90)? **Decidido em 04/10: formato próprio no tablet** (TOP e MID 728×90, ART-1 728×90, ART-2 728×250; laterais só no desktop).
2. **Justiça:** não existe editoria Justiça e `NEVER_SECTIONS` não a cobre. Confirmar o nome do slug e se matéria de tribunal dentro de Cidade também fica sem anúncio (o código só bloqueia por editoria, não por tema).
3. **RAIL-A e RAIL-B na home:** o NowList hoje ocupa a coluna direita ao lado da manchete. Empurrar o Agora para baixo (como no wireframe) muda a primeira dobra, que a spec quer 100% editorial (`docs/screens.md` P01). Aceitar, ou deixar RAIL só abaixo da primeira dobra? **Decidido em 04/10: abaixo do "Agora".**
4. **RAIL-B "fixo ao rolar":** convive com o `aside` sticky da matéria? Proposta: sem RAIL-B na matéria.
5. **STICKY:** empilhar acima da `BottomNav` (perde ~50 px) ou substituir a barra? Nunca junto com TOP. **Decidido em 04/10: empilhar acima da barra inferior.**
6. **Consentimento e contagem de anúncio:** o padrão é "Só o necessário", que hoje não envia nenhum evento. Contagem agregada sem identificador para faturar cabe na categoria "Métricas agregadas" (opt-in) ou pode ser tratada como necessária? Precisa de parecer jurídico (B-001, B-002 já abertos).
7. **Banner em `pergunte` e `panorama`:** recomendado manter `VETADO`. Confirmar.
8. **Tile em Serviços/Explorar e `AGENDA-RAIL-A`:** são candidatos deste inventário, fora da spec. Entram no mídia kit ou ficam de fora?
9. **Newsletter patrocinada:** só faz sentido depois de provedor de e-mail com chave (B-005). Vender antes como "em breve"?
10. **TV:** não há spec P7 no repositório. Cota no player e selo nos cortes precisam de decisão sobre duração, pular e som antes de entrar no mídia kit.
11. **Vercel Pro:** trocar agora (custo recorrente por assento) ou só quando o primeiro contrato estiver assinado? A recomendação é antes da primeira veiculação paga.
12. **Matéria patrocinada hoje sem tela:** não há ação no Estúdio para marcar `sponsored`. Criar (MS-T1 inclui só a trava) ou usar apenas campanha tipada?
