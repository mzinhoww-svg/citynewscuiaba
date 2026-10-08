# Agenda rica e distribuição — design (subprojetos B e C)

Data: 08/10/2026. Continua a spec `2026-10-08-agenda-coletor-multifonte-design.md` (subprojeto A, A-220, em produção). B e C saem juntos, numa spec e num plano (decisão do dono).

## 1. Decisões do dono (08/10/2026)

- **E1 · Imagem do evento:** a imagem de divulgação da página oficial do evento (`og:image`, imagem do JSON-LD `Event.image`, imagem da API Tribe ou o cartaz da página), pela política D-02: aviso "Foto: reprodução web · {fonte}", crédito, link para o original, sem recorte de crédito, remoção em 24 h a pedido, registrada no Media Registry com direitos `unknown`. Desligável por `image_reproduction_enabled` (a mesma flag das matérias). Nunca imagem gerada por IA.
- **E2 · Instagram @citycuiabaa:** o CityNews monta o pacote "Agenda da semana" no Estúdio (PNGs 1080×1350, legenda, créditos) para o dono aprovar e postar à mão. Sem login no Instagram. Substitui a rotina "City Cuiabá · Radar" do Claude.
- **E3 · Newsletter "Agenda do fim de semana" (quinta, 12h):** a edição é montada sozinha toda quinta (página web pública e HTML de e-mail). O envio fica atrás de um provedor que ainda não existe (B-005): sem provedor, a edição é publicada na web e o envio fica `aguardando_provedor`, sem falhar.
- **E4 · Ordem:** B e C juntos.

## 2. Escopo

| Bloco | Entrega |
|---|---|
| B1 · Imagem | Coletor guarda a imagem do evento no Media Registry (`media_kind = reproduction`), liga em `event_listings.media_id`; card e página mostram com o aviso e o crédito |
| B2 · Organizador | `event_listings.organizer` (texto), vindo da extração (`organizador` com trecho, T2 do A), da API Tribe (`organizer`) e do JSON-LD; mostrado na página; editável no Estúdio (campo travável) |
| B3 · Faixa etária | Valores fechados `livre|10|12|14|16|18|consulte` (já no formulário do Estúdio); extração com trecho quando a página diz; filtro público "Faixa etária" além do atalho "Para crianças" |
| B4 · Guia | `event_listings.venue_id` (FK opcional para `venues`): casamento por nome normalizado do local; página do evento mostra "Ver no Guia" e a página do lugar no Guia mostra "Próximos eventos aqui" |
| B5 · Destaques | Eventos em destaque na Agenda: `event_listings.featured_until` (data), ação "Destacar até" no Estúdio; destacados primeiro na home e no topo de `/agenda` |
| B6 · Salvar | `SaveEventButton` também na página do evento |
| C1 · Newsletter | Edição semanal `newsletter_editions` (lista `agenda-fds`), montada por cron às quintas 11h45 (Cuiabá), página `/newsletter/agenda/[data]`, HTML de e-mail, envio por porta `EmailSender` com implementação "nenhum provedor" |
| C2 · Pacote Instagram | Pacote "Agenda da semana" no Estúdio (`/estudio/agenda/instagram`): seleção automática dos eventos da semana (confirmados primeiro, com imagem), PNGs 1080×1350 renderizados no servidor, legenda pronta, créditos; aprovar → baixar ZIP; marcar "Publicado" com o link |

Fora: postagem automática no Instagram, provedor de e-mail (B-005), imagem gerada por IA, foto de pessoa identificável sem direito (segue D-02 e B-002).

## 3. Dados

Migrations a partir de 0200.

- `event_listings`: `media_id uuid references media_assets(id) on delete set null`, `organizer text`, `venue_id uuid references venues(id) on delete set null`, `featured_until timestamptz`. `age_rating` ganha check `in ('livre','10','12','14','16','18','consulte')` (linhas fora disso viram `consulte` antes do check). `organizer`, `age_rating` e `media_id` entram em `LOCKABLE_COLUMNS`.
- `event_image_candidates` não existe: a URL da imagem vem no `RawEvent.imageUrl` e o registro é síncrono com limite (§4).
- `newsletter_editions(id, list, edition_date date, subject, html, text, items jsonb, status 'draft'|'published'|'aguardando_provedor'|'sent'|'failed', published_at, sent_at, unique(list, edition_date))`; RLS: público lê `published`/`sent`/`aguardando_provedor`; escrita só service role.
- `social_packages(id, kind 'instagram_agenda', week_start date, status 'draft'|'approved'|'published'|'discarded', items jsonb, caption text, assets jsonb (paths no Storage), approved_by, approved_at, published_url, created_at, unique(kind, week_start))`; RLS: seção `agenda` lê/escreve; auditoria `social.approve`, `social.publish`, `social.discard`.
- Visão `public_event_sources` e RLS de `event_listings` continuam; `venues` já é público.
- Cron (pg_cron, molde da 0053): `newsletter-agenda` quinta 15h45 UTC (11h45 Cuiabá) chama `POST /api/jobs/newsletter-agenda`; `social-agenda` segunda 12h UTC monta o pacote da semana (`POST /api/jobs/social-agenda`). Ambas com `CRON_SECRET`.

## 4. Imagem do evento (B1)

- **Fonte da URL:** JSON-LD `image`, Tribe `image.url`, `og:image` da página individual (já baixada no caminho `ai_page`). A IA não escolhe imagem.
- **Registro:** reaproveita os blocos de `src/lib/media/` (`fetchImage`, `analyze`, `mediaPath`, `MediaStore`) num helper novo `registerExternalImage({ url, pageUrl, sourceName })` em `src/lib/media/external.ts`, extraído do fluxo do Guia (`venue-media.ts` passa a usá-lo). Dedupe por sha256. Variantes pelo job existente.
- **Regras:** só `https`, mesmo host registrável da página ou CDN declarada na página; tamanho mínimo 400 px de largura; no máximo 1 imagem por evento; teto de 20 imagens por execução; com `image_reproduction_enabled` desligada não baixa nada; ativo bloqueado ou vencido nunca volta (regra do registry).
- **Tela:** card com miniatura (variante 480), página com a imagem (960) e a legenda `ImageCaption` ("Foto: reprodução web · {fonte}", "Ver original"). Sem imagem, nada muda.

## 5. Organizador, faixa etária, Guia, destaques, salvar (B2–B6)

- **Organizador:** `organizador` já existe no schema de extração; JSON-LD `organizer.name`; Tribe `organizer[0].organizer`. Público: fato "Organização: {nome}". Sem organizador, o fato some.
- **Faixa etária:** extração com trecho ("classificação 16 anos", "livre"); sem trecho, `consulte`. Filtro `?idade=livre|10|12|14|16|18` (eventos com faixa ≤ escolhida; `consulte` só aparece sem filtro). "Para crianças" continua = `livre`.
- **Guia:** `matchVenue(venueText, venues)` puro: fold + remoção de prefixos ("Teatro", "Espaço") + igualdade ou similaridade ≥ 0,9 com um único candidato ativo; ambíguo → sem vínculo. Roda na gravação do coletor e no salvar do Estúdio (com seletor manual). Página do lugar no Guia: até 5 próximos eventos.
- **Destaques:** `featured_until` ≥ agora → destaque; Estúdio "Destacar até {data}" e "Tirar destaque" (auditado `event.feature`); home mostra até 3 destacados antes dos demais; `/agenda` mostra faixa "Em destaque" no topo da lista (sem filtros).
- **Salvar:** `SaveEventButton` na página do evento.

## 6. Newsletter (C1)

- **Montagem** (`buildAgendaEdition(events, weekendRange)`, puro): eventos confirmados de sexta a domingo, ordenados por dia e confirmados primeiro, até 12, agrupados por dia; cada item com título, quando, onde, preço, origem ("Com informações de…") e link para a página do evento. Sem eventos suficientes (< 3) a edição não sai (status `draft`, motivo no log).
- **Saídas:** página `/newsletter/agenda/[data]` (Server Component, mesmos tokens), HTML de e-mail inline (tabelas, sem fontes externas, texto alternativo) e versão texto.
- **Envio:** porta `EmailSender.send(edition, recipients)`; implementação padrão `NoProvider` devolve `aguardando_provedor`. Lista de destinatários: `newsletter_subscriptions` confirmados e não descadastrados de `agenda-fds`. Link de descadastro em todo e-mail (token existente).
- **Página `/newsletter`:** a "Amostra da última edição" passa a mostrar a última edição publicada de `agenda-fds`.

## 7. Pacote Instagram (C2)

- **Seleção** (`pickWeekEvents`, puro): eventos confirmados de segunda a domingo da semana, com imagem primeiro, até 6, no máximo 2 por local.
- **Render:** PNGs 1080×1350 com `satori` + `@resvg/resvg-js` (nova dependência, server-only) a partir de componentes JSX simples com os tokens da marca @citycuiabaa do Radar (`#111111`, `#FFFFFF`, `#F2C94C`, `#F58220`, `#969696`; Liberation Sans/Serif); slides: capa "Agenda da semana", um por evento (imagem de fundo escurecida com crédito "Foto: reprodução web · {fonte}" ou fundo liso sem imagem), final "Qual você vai?". Texto só dos campos confirmados; preço ausente vira "Preço: consulte a fonte".
- **Legenda:** um bloco por evento (dia, hora, local, preço), créditos das imagens e "Confirme horários e valores na fonte oficial antes de sair de casa.". Sem emoji (regra do portal).
- **Estúdio:** `/estudio/agenda/instagram` lista o pacote da semana, mostra os slides, permite trocar/remover evento e regerar; "Aprovar" (auditado) habilita "Baixar ZIP"; "Marcar como publicado" com o link do post. Estados: vazio (sem eventos), gerando, erro, pronto.
- **Arquivos:** Storage privado `social-packages/{semana}/`, URLs assinadas para o Estúdio.

## 8. Erros e degradação

- Imagem que falha (HTTP, tamanho, tipo, flag desligada) → evento sem imagem, motivo nas estatísticas da fonte; nunca bloqueia o evento.
- Edição sem eventos suficientes → `draft` com motivo; sem provedor → `aguardando_provedor`.
- Render do carrossel falhou → pacote com status `draft` e erro visível; nada é publicado sozinho.
- Toda escrita automática com auditoria (`system:agenda`).

## 9. Testes

TDD com fixtures fictícias (`*.example`) e `AI_PROVIDER=fake`. Unitários: `registerExternalImage` (regras de host, tamanho, flag, dedupe), extração de organizador/faixa/imagem (JSON-LD, Tribe, `og:image`), `matchVenue`, `buildAgendaEdition`, `pickWeekEvents`, HTML do e-mail (sem script, com descadastro), render de slide (dimensão 1080×1350). Integração: colunas e RLS novas, crons, `newsletter_editions` pública. E2E (fixtures): evento coletado com imagem e legenda; filtro de faixa; "Ver no Guia"; destacar no Estúdio; página da edição; pacote Instagram aprovar e baixar. Axe nas telas novas.

## 10. Critérios de aceite

1. Evento coletado com imagem mostra a foto com "Foto: reprodução web · fonte" e link; com a flag desligada, nenhuma imagem nova é baixada.
2. Página do evento mostra organizador e faixa quando existem; filtro por faixa funciona.
3. Evento casado com lugar do Guia mostra "Ver no Guia"; o lugar mostra os próximos eventos.
4. Estúdio destaca evento até uma data e ele aparece primeiro na home e na Agenda.
5. Toda quinta a edição "Agenda do fim de semana" sai em `/newsletter/agenda/{data}`; sem provedor, fica `aguardando_provedor`.
6. Toda segunda o pacote Instagram da semana aparece no Estúdio, com PNGs 1080×1350, legenda e créditos; aprovar libera o ZIP.
7. `pnpm verify` verde; axe sem serious/critical nas telas novas.
