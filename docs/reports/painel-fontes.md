# Relatório · Painel de Fontes (FS-T1 a FS-T9)

**Status:** verificação concluída em 29/09/2026 no branch `painel-fontes` (FS-T9). Spec: `docs/superpowers/specs/2026-09-27-painel-de-fontes.md` (aprovada em 27/09). Plano: `docs/superpowers/plans/2026-09-27-painel-de-fontes.md`. Este relatório fecha a tarefa FS-T9: jornadas e2e completas, axe em todas as rotas do painel em três larguras, roteiro exploratório com capturas (A-026) e o balanço dos 28 critérios de aceite.

## 1. O que a verificação entregou (FS-T9)

| Área | Arquivos | Notas |
|---|---|---|
| Jornadas e2e | `tests/e2e/control-sources-flow.spec.ts`, `tests/e2e/helpers/pipeline.ts` | 4 jornadas no projeto `fixtures` (next dev, `CRAWLER_FIXTURES=1`, `AI_PROVIDER=fake`, sem rede): cadastro pela seção sem feed → ativar → coletar agora → 3 falhas → pausa automática → retomar; opt-out do veículo; score 1 fora do Panorama; via rápida com `fast-tick` + drain real. O ajudante roda o `fetch` real do pipeline (`runFetch`) com a service role e HTTP falso respondendo 500, e chama `/api/ingest/fast-tick`, `/api/jobs/drain` e `/api/ingest/status` com o `CRON_SECRET`. |
| Axe | `tests/a11y/control-sources.spec.ts` | 10 rotas (lista, lista com filtro vazio, nova, resumo, configuração, coleta, recomendação, histórico, itens, 404) × 360/768/1280 px, WCAG 2.0/2.1/2.2 A e AA, mais a checagem de rolagem horizontal da página. 30 testes, 0 violações serious/critical. |
| Roteiro exploratório | `tests/roteiro/fontes.spec.ts`, `docs/reports/painel-fontes/*.png` | 19 passos × 2 larguras (390 e 1280) = 38 capturas, só com `CN_ROTEIRO=1` no projeto `fixtures`. Revisão visual abaixo (§5). |
| Fixtures | `tests/fixtures/sites/jornal-da-chapada-{secao.html,robots.txt}` | Veículo fictício novo: seção sem feed (5 `article.card` com link, `h2` e `time`), que a IA falsa cobre com seletores validados (≥ 3 itens). |
| Playwright | `playwright.config.ts` | `FIXTURE_SPECS` passa a cobrir o spec de jornadas e o roteiro do painel. |
| Plano P5 | `docs/superpowers/plans/2026-09-27-p5-control-center-admin.md` | Task 4 marcada como coberta pelo Painel de Fontes; Task 1 avisa que `source.critical` já existe em `src/lib/approvals`. |

### Correções feitas durante a verificação (com teste)

| # | Defeito | Correção | Teste |
|---|---|---|---|
| 1 | Regiões roláveis das tabelas (histórico, últimas coletas no resumo e na aba Coleta, itens) sem foco por teclado — axe `scrollable-region-focusable` (serious) em 360 e 768 px | `role="region"`, `aria-label` e `tabIndex={0}` em `SourceAuditTable`, `SourceRunsTable` e na aba Itens | `tests/a11y/control-sources.spec.ts`, `control-sources-flow.spec.ts` (axe no histórico) |
| 2 | Link "Ver regras de recomendação" dentro do parágrafo só se distinguia pela cor — axe `link-in-text-block` (serious) | Sublinhado permanente no link (`SourceRecForm`) | `tests/a11y/control-sources.spec.ts` (`/recomendacao`) |
| 3 | Lista em 768 px com rolagem horizontal da página: o `sr-only` (posição absoluta) do cabeçalho "Ações" escapava da região rolável da tabela | Wrapper da tabela com `relative` (`SourcesTable`) | `tests/a11y/control-sources.spec.ts` (lista em 768 px, `scrollWidth`) |
| 4 | Lista em 390 px mostrava "Nunca" solto na linha da fonte, sem dizer o que era | "Última coleta: Nunca" (`SourceRowMobile`) | captura `01-lista-390.png` |
| 5 | Cabeçalho do detalhe repetia "Ativa" (selo + linha de status) | A linha de status só aparece quando acrescenta algo ao selo (motivo, data) | capturas `10-…-1280/390.png`; testes de `statusLine` intactos |
| 6 | Mudanças do painel (bloquear, arquivar, score, lote) não invalidavam a cache da home (tag `home`, 60 s): o Panorama levava até 1 min para refletir opt-out e score 1 | `refreshPortal()` em `actions.ts` (`revalidateTags(["home"])`) depois de status, atualização salva e lote; falha da cache é só log | `control-sources-flow.spec.ts` (opt-out e score 1 verificam a home na hora) |
| 7 | O pipeline de produção usava `fetch` real mesmo no servidor de fixtures, então nenhum e2e conseguia percorrer fetch → validate → … sem rede | `productionHandlers` usa o mesmo `crawlDeps` do painel (`fetch` real em produção; fixtures `*.example` só com `CRAWLER_FIXTURES=1` fora de produção) | `control-sources-flow.spec.ts` (via rápida: itens da Folha entram em `collected_items`) |
| 8 | Padrão `isPolicyBlock` não ancorado (re-review 2 do FS-T3): um `Location` de terceiro com a frase "resolve para endereço não permitido" rotulava o próprio site como proibido | `/^host \S+ resolve para endereço não permitido/` | `src/lib/pipeline/http.test.ts` ("Location de terceiro…") |
| 9 | Candidatos repetidos na descoberta (o `/feed` anunciado na página e o `/feed` da lista de caminhos conhecidos eram requisitados duas vezes) | `attempted` em `discoverConsumption`: cada URL só uma vez | `src/lib/sources/discover.test.ts` ("candidato repetido…") |
| 10 | "Ativar" em lote tratava feed + termos revisados como "já passou por ativação" e ativava fonte nunca ativada sem robots, teste de conexão nem Crawl-delay (re-review FS-T6) | `planBulk` ignora `status_reason = 'pending_activation'` com o motivo `not_activated`; a primeira ativação continua sendo a única (que roda as checagens) | `src/lib/db/source-admin-store.test.ts` ("ativar em lote ignora quem nunca foi ativada…") |

Todos os testes novos foram escritos antes e vistos falhando (itens 8, 9 e 10 com `git stash` do código; 1–3 pelo axe vermelho antes da mudança).

## 2. Critérios de aceite (spec §12)

| # | Critério | Situação | Evidência |
|---|---|---|---|
| 1 | Sem sessão → `/entrar?next=…`; sem `source.manage` → `motivo=sem-permissao`; item "Fontes" fora do menu | Atendido | `control-sources-list.spec.ts` ("analista não vê o menu nem entra"), `src/lib/auth/permissions.test.ts`, `requireRole` no layout (`fontes/layout.tsx`) |
| 2 | Lista com busca, filtros na URL, ordenação e paginação de 50 | Atendido | `control-sources-list.spec.ts` (filtros, ordenação, vazio por filtro), `src/lib/db/queries/sources-admin.test.ts` (`parseSourceFilters`, inválidos ignorados), `SourcesTable.test.tsx` (`aria-sort`) |
| 3 | Voz do Coxipó por autodiscovery: RSS, 10 itens, nome, frequência sugerida; Folha do Cerrado → "já está cadastrada" | Atendido | `control-sources-detail.spec.ts` (cadastro), `src/lib/sources/analyze.test.ts` (duplicidade antes de qualquer requisição), `discover.test.ts` (autodiscovery) |
| 4 | Feed direto reconhecido sem buscar a home | Atendido | `discover.test.ts` ("link que já é feed não busca a home"), captura `08-nova-analise-*.png` (`https://cadencia.example/feed`) |
| 5 | Página sem feed → seletores da IA que extraem ≥ 3 itens; menos são descartados | Atendido | `control-sources-flow.spec.ts` (Jornal da Chapada, "Seletores da IA validados", 5 itens), `analyze.test.ts` (page_list com 3 itens; seletores insuficientes descartados) |
| 6 | Nada da IA sem "Usar sugestão"; políticas começam restritas; IA nunca devolve política/fonte única/confiabilidade | Atendido | `control-sources-detail.spec.ts` (editorias vazias até o clique; imagem `none`), `control-sources-flow.spec.ts` (`link_only` + `none`), `src/lib/ai/schemas/source-profile` via `profile.test.ts` (schema estrito recusa campo extra) |
| 7 | Nada do corpo na prévia, no modelo nem em `source_discoveries` | Atendido | `profile.test.ts` (entrada só com título/data/caminho), `analyze.test.ts` (registro sem corpo), `preview.test.ts`, detalhe e fluxo (sem `img` na prévia) |
| 8 | robots que proíbe impede cadastrar, com host e caminho | Atendido | `control-sources-detail.spec.ts` ("robots que proíbe…"), captura `09-nova-robots-proibe-*.png` |
| 9 | IP privado, localhost, credenciais, porta 8080 e redirecionamento para 169.254.169.254 recusados sem requisição interna | Atendido | `src/lib/sources/url.test.ts`, `discover.test.ts` (Review Focus 1: redirecionamento interno, DNS privado), `http.test.ts` (SSRF) |
| 10 | Fonte nova nasce `paused`/`pending_activation`; "Salvar e ativar" só com termos e teste ok | Atendido | `control-sources-detail.spec.ts` ("Pausada · aguardando ativação"), `control-sources-flow.spec.ts` (termos marcados → `?cadastro=ativa`), `tests/integration/source-admin.test.ts` (ativação exige termos) |
| 11 | Grade de frequência (`null`, 10/15/20, 30–1440 múltiplos de 30) na interface e no banco; padrão global só 30–1440; mudar o padrão muda a próxima coleta | Atendido | `src/lib/sources/frequency.test.ts`, `schema` via `tests/integration/source-admin-db.test.ts` (`check`), `control-sources-detail.spec.ts` (45/25 ausentes), `control-sources-list.spec.ts` (padrão sem 10/15/20), `src/lib/pipeline/tick.test.ts` (`null` segue `app_settings`) |
| 12 | Próxima coleta por janela (30 min às 14:07 → 14:30; 2 h → 16:00; 10/15/20 min na grade rápida) | Atendido | `frequency.test.ts` (`nextCollectionAt`, `isDue`), `tick.test.ts` (D-F17) |
| 13 | 3 runs seguidos com falha pausam com `auto_failures` e notificam; 1ª/2ª deixam `degraded`; sucesso zera; retries contam uma vez | Atendido | `control-sources-flow.spec.ts` (1 falha → "Com falhas · 1 falha seguida"; 3 → "Pausada automaticamente", notificação `source_auto_paused` no canal `control_center`; Retomar zera), `src/lib/pipeline/ingest.test.ts` (Review Focus 3), `tests/integration/ingest.test.ts` (pausa automática no banco real) |
| 14 | "Coletar agora" cria run manual só com o `fetch`, não altera o run da janela, invisível ao watchdog, 1 vez a cada 5 min | Atendido | `control-sources-flow.spec.ts` (toast + recusa na 2ª vez), `src/lib/pipeline/collect-now.test.ts`, `status.test.ts` (`late` ignora runs manuais), `tests/integration/ingest.test.ts` (`collectNow` real) |
| 15 | Política de imagem `none` → `reproduction` só com outra pessoa; mesma pessoa recusada; SQL direto recusado pelo trigger | Atendido | `control-sources-detail.spec.ts` (Diego pede, não vê "Revisar", Marina aprova, histórico), `src/lib/approvals/approvals.test.ts` (`self_approval`), `tests/integration/source-admin-db.test.ts` e `rls-two-person.test.ts` (trigger) |
| 16 | Pausar, bloquear, restringir e arquivar aplicam na hora; opt-out remove reproduções e põe `image_policy = 'none'` | Atendido | `control-sources-flow.spec.ts` (opt-out: toast, `Bloqueada · Pedido do veículo`, política `none`, some do Panorama), `tests/integration/source-admin.test.ts` (restringir salva na hora; opt-out com takedown), `control-sources-list.spec.ts` (pausar em lote) |
| 17 | Arquivar exige `paused`/`blocked` e nome digitado; some de `public_sources` e listas; itens continuam; restaurar → `paused`; `delete` recusado | Atendido | `control-sources-detail.spec.ts` (nome digitado, Arquivadas, restaurar), `tests/integration/source-admin-db.test.ts` (`public_sources`, `delete` revogado, check de arquivamento) |
| 18 | Toda mudança em `audit_log` com ator, diff e motivo; campos operacionais fora; aba Histórico | Atendido | `tests/integration/source-admin-db.test.ts` (diff e exclusão dos operacionais), `control-sources-flow.spec.ts` (histórico com "Sistema" na pausa automática e "Helena Costa" na retomada), `detail.test.tsx` (tabela e CSV) |
| 19 | Conflito de versão avisa e nada é sobrescrito | Atendido | `control-sources-detail.spec.ts` ("conflito de versão mostra Recarregar"), `tests/integration/source-admin.test.ts` (`code: "conflict"`) |
| 20 | Lote até 50 com resultado por fonte e `batchId` comum | Atendido | `control-sources-list.spec.ts` (pausar e frequência em lote), `source-admin-store.test.ts` (`planBulk`), `tests/integration/source-admin-db.test.ts` (`batchId`) |
| 21 | Score 1 tira do "Veja também"; ordem de coleta prioridade → score; `rankSources` intacto | Atendido | `control-sources-flow.spec.ts` (Agência Cerrado some do Panorama), `src/lib/db/queries/home.test.ts` (`panoramaForHome`), `tick.test.ts` (ordem), `src/lib/ranking/*` sem alteração no branch |
| 22 | Carregando, vazio, erro e sucesso em 360/768/1280; 0 violações serious/critical | Atendido | `tests/a11y/control-sources.spec.ts` (30 testes), `SourcesTable.test.tsx` e `detail.test.tsx` (vazio/erro), `loading.tsx` e `error.tsx` por rota, capturas §5 |
| 23 | `fast-tick` 401 sem segredo; um único run `fast` por janela; só o `fetch`; 2ª chamada não duplica; `idle` sem fonte rápida | Atendido | `control-sources-flow.spec.ts` (401; `started`/`existing` + `enqueued ≥ 1`; 2ª chamada `existing` com `enqueued 0`; drain leva os itens até `collected_items`; run "Via rápida · Ok" na aba Coleta), `src/lib/pipeline/fast-tick.test.ts` (`idle`, uma mensagem por janela), `fast-tick/route.test.ts` |
| 24 | Tick normal ignora fontes rápidas e vice-versa; `late` e "ciclo anterior aberto" só com runs `cron` | Atendido | `tick.test.ts` (vias), `fast-tick.test.ts`, `status.test.ts`, `tests/integration/tick.test.ts` |
| 25 | Mesma fonte vencida nos dois ticks → uma requisição; 2º `fetch` `already_fetched`; itens não processados duas vezes | Atendido | `ingest.test.ts` (Review Focus 6), `tests/integration/ingest.test.ts` (`claim_source_fetch` real) |
| 26 | `fast_lane_max = 2`: 3ª fonte recusada na interface e no banco; pausada/bloqueada/arquivada recusadas; 10 → 20 aceito; limite 1 → só a de maior prioridade, outra `fast_lane_full` | Atendido | `tests/integration/source-admin-db.test.ts` (vagas e status no trigger), `control-sources-detail.spec.ts` (opções desabilitadas com motivo na pausada), `fast-tick.test.ts` (`fast_lane_full`), `source-admin-store.test.ts` (lote) |
| 27 | Cota esgotada → `rate_limited` sem consumir; `Crawl-delay: 900` devolve ao ciclo normal com motivo na tela; `If-None-Match`/`If-Modified-Since` na via rápida | Atendido | `fast-tick.test.ts` (peek nunca consome), `tick.test.ts` (Crawl-delay 900), `ingest.test.ts` (cabeçalhos condicionais em run `fast`, 304 não conta), texto `fastButSlowed` em `FrequencyLabel`/configuração (`SourceConfigForm.test.tsx`) |
| 28 | Sem `pg_cron`/`pg_net`, o watchdog chama `fast-tick` quando o último run `fast` > 15 min e há fonte rápida; não chama sem fonte rápida | Atendido (verificação manual) | `.github/workflows/cron-watchdog.yml` validado no FS-T5 com `bash -n` e um servidor de status falso (os dois ramos); `status.test.ts` cobre o bloco `fast` que o watchdog lê. Não há teste automatizado do YAML (limite conhecido, §6) |

## 3. Review Focus do plano (1–6)

| # | Foco | Teste que cobre |
|---|---|---|
| 1 | URL que redireciona (302) para `169.254.169.254` → "Este endereço não é permitido.", nenhuma requisição ao IP interno | `src/lib/sources/discover.test.ts` ("redirecionamento para IP interno é recusado sem chegar ao destino"), `test-connection.test.ts` |
| 2 | Diego afrouxa `image_policy` → pendente; ele mesmo não aprova; SQL direto recusado; Marina aprova → `applied`, auditoria com os dois | `tests/integration/source-admin-db.test.ts`, `tests/integration/rls-two-person.test.ts`, `src/lib/approvals/approvals.test.ts`, `control-sources-detail.spec.ts` ("mudança de política vira pedido e Marina aprova") |
| 3 | 3 runs com falha, retries no meio → degraded, degraded, paused/`auto_failures` + 1 notificação | `src/lib/pipeline/ingest.test.ts` (3 runs × 4 tentativas), `tests/integration/ingest.test.ts`, `control-sources-flow.spec.ts` (ponta a ponta na interface) |
| 4 | Grade de frequência e vencimento por janela (14:07 → 14:30; 120 min → 16:00; 15 min → 14:20; `null` segue o padrão) | `src/lib/sources/frequency.test.ts`, `src/lib/pipeline/tick.test.ts`, `tests/integration/source-admin-db.test.ts` (`check`) |
| 5 | Título com instrução na prévia: descartado antes do modelo, entrada do `FakeProvider` sem o texto, saída com `reliability` recusada | `src/lib/sources/preview.test.ts`, `profile.test.ts`, `analyze.test.ts`, `control-sources-detail.spec.ts` ("1 item descartado por conter instruções") |
| 6 | Mesma fonte nos dois ticks na mesma meia hora → uma requisição, `already_fetched`; variante `previous_pending`; retry do mesmo run passa | `src/lib/pipeline/ingest.test.ts`, `fast-tick.test.ts` (`previous_pending`), `tests/integration/ingest.test.ts` e `tests/integration/tick.test.ts` (`claim_source_fetch` e `jobs` reais) |

## 4. Axe por rota e largura

`tests/a11y/control-sources.spec.ts` (projeto desktop, servidor de produção, Helena): 0 violações serious/critical em todas as células e nenhuma rolagem horizontal da página.

| Rota | 360 | 768 | 1280 |
|---|---|---|---|
| `/estudio/control/fontes` | ok | ok (após a correção 3) | ok |
| `/estudio/control/fontes?q=…` (vazio por filtro) | ok | ok | ok |
| `/estudio/control/fontes/nova` | ok | ok | ok |
| `/estudio/control/fontes/{folha}` (resumo) | ok (após a correção 1) | ok | ok |
| `…/configuracao` | ok | ok | ok |
| `…/coleta` | ok (após a correção 1) | ok | ok |
| `…/recomendacao` | ok (após a correção 2) | ok (2) | ok (2) |
| `…/historico` | ok (1) | ok (1) | ok (1) |
| `…/itens` | ok | ok | ok |
| `/estudio/control/fontes/{id inexistente}` (404) | ok | ok | ok |

Além disso: `control-sources-list.spec.ts` (lista em 1280 e 390, com capturas em `docs/reports/fontes/`), `control-sources-detail.spec.ts` (nova, resumo e configuração em 1280 e 390) e `control-sources-flow.spec.ts` (histórico e itens depois das jornadas) rodam o axe nas telas com dados reais das jornadas.

## 5. Roteiro exploratório (A-026)

`CN_ROTEIRO=1 pnpm exec playwright test tests/roteiro/fontes.spec.ts --project=fixtures --no-deps` → 38 capturas em `docs/reports/painel-fontes/` (390 e 1280 px): lista com dados (01), vazio por filtro (02), filtro Arquivadas (03), seleção em lote (04), Configurações da coleta (05), 404 (06), nova fonte: endereço (07), análise com prévia e sugestões de feed direto (08), robots que proíbe (09), as seis abas do detalhe (10–15), diálogo de excluir com nome errado (16), diálogo de bloquear com "Pedido do veículo" (17), pedido de aprovação pendente visto por Diego (18) e diálogo "Aprovar mudança crítica" de Marina (19).

Revisão contra `DESIGN.md` (tokens, sem cards aninhados, rótulos sempre com ícone e texto, alvos ≥ 44 px, contraste): defeitos reais encontrados e corrigidos nesta tarefa — itens 1–5 da tabela em §1. Observações que ficam registradas (não bloqueiam):

- Em 390 px, a navegação das seções e as tabelas de coletas/histórico rolam horizontalmente dentro da própria região (agora focável por teclado); é o comportamento previsto, não overflow da página.
- Na aba Histórico, a coluna "Antes → depois" mostra datas como ISO (`2026-08-01T13:00:00…`) para campos de data (termos revisados). Sugestão: formatar com `fullDateTime` quando o campo for data. Não afeta a auditoria (o CSV mantém o valor bruto).
- O indicador "N" do Next.js aparece nas capturas do servidor de desenvolvimento (artefato do `next dev`, não do app).
- Estado "erro" da lista e das abas: coberto por unidade (`EmptyState tone="error"` em `SourcesTable.test.tsx`/`detail.test.tsx`, `error.tsx` por rota) — não há como provocar a falha de banco no roteiro sem derrubar a pilha; sem captura.
- "Lista vazia sem nenhuma fonte" ("Nenhuma fonte cadastrada ainda."): o seed sempre tem fontes; coberto por unidade (`page.tsx` distingue `hasActiveFilters`), a captura 02 mostra o vazio por filtro.

## 6. Limites conhecidos e pendências

| Item | Situação | Proposta |
|---|---|---|
| Notificação da pausa automática no Control Center | A notificação nasce em `notifications` (`kind = source_auto_paused`, canal `control_center`, dedupe 10 min) e o e2e a verifica no banco; a tela que a exibe é do P5-T3 (Visão geral), ainda não construída | P5-T3 lê `notifications` com `status in ('open','queued')` |
| "Ativar" em lote não repete robots/teste/Crawl-delay | Por spec §7.6 o lote só vale para fontes que já passaram por ativação; agora `pending_activation` é excluída (correção 10). Uma fonte já ativada e pausada manualmente volta pelo lote sem novo teste de conexão | Se o dono quiser, rodar `activationCheck` fonte a fonte no lote (até 50 × 2 requisições), fora deste plano |
| FS-T5 N2: FK de `source_fetch_outcomes` sem `on delete cascade` | Sem efeito prático: `delete` em `sources` é revogado de `authenticated` e a exclusão é arquivamento; linhas com mais de 2 dias são purgadas a cada chamada | Migration 0033 com `on delete cascade` quando houver outra mudança de schema |
| FS-T3: URL colada que redireciona para outro domínio devolve `forbidden_host` ("Este endereço não é permitido.") | Comportamento seguro; a mensagem não explica que foi uma migração de domínio | Resultado próprio `redirects_elsewhere` com o texto "Este endereço redireciona para outro domínio: cole o endereço novo." |
| FS-T6 N1/N3/N5 (logotipo igual removido em conflito; `trustedDiscovery` sem checar host/recência; `ok:false` parcial sem `version`) e `removeLogo` ao trocar logotipo | Menores, registrados na re-review; sem regressão observada nas jornadas | Fechar num fix round do P5 ou junto com a migration acima |
| Watchdog do `fast-tick` (critério 28) | Só verificação manual do YAML (FS-T5) | Teste com `act` ou um script que exercite o `jq` do workflow contra respostas gravadas |
| Estado de erro da lista sem captura | Ver §5 | — |

**Pendência do dono — DP-3 (score editorial no ranking de recomendação):** continua fora do ranking (D-F9: só ordem de coleta, desempate e Panorama). Entrar no ranking exigiria `rec-v2` com componente novo e aprovação dupla de pesos (spec mestre §8). Precisa de decisão explícita; nada muda até lá.

## 7. Decisões novas (candidatas a A-### em `.planning/DECISIONS.md`, a registrar pelo controlador)

| Candidata | Contexto | Decisão |
|---|---|---|
| A-a | O e2e precisava de "3 runs seguidos com falha" sem esperar os retries de 1, 4 e 10 min nem simular 500 pelo servidor | Ajudante `tests/e2e/helpers/pipeline.ts` roda o `fetch` real do pipeline (`runFetch`) em runs manuais com a service role e HTTP falso; `server-only` vira módulo vazio só no processo do Playwright (mesma solução do Vitest). Só em testes |
| A-b | Handlers de produção do pipeline usavam `fetch` cru; sem rede o drain nunca completava um ciclo no e2e | `productionHandlers` usa `crawlDeps` de `src/lib/sources/http-deps.ts`: idêntico em produção, fixtures `*.example` com `CRAWLER_FIXTURES=1` fora de produção |
| A-c | Cache da home (tag `home`, 60 s) escondia por até 1 min os efeitos de bloquear, arquivar, mudar score ou lote | Ações do painel chamam `revalidateTags(["home"])` depois de gravar; falha da cache é só log |
| A-d | "Ativar" em lote ativava fonte nunca ativada | `pending_activation` fica fora do lote (`not_activated`); a primeira ativação é sempre individual |
| A-e | Roteiro exploratório do painel exige o servidor de fixtures | `tests/roteiro/fontes.spec.ts` no projeto `fixtures`, só com `CN_ROTEIRO=1`; capturas em `docs/reports/painel-fontes/` |

## 8. Métricas

| Métrica | Resultado |
|---|---|
| `pnpm db:reset && pnpm verify` | lint, typecheck, Vitest 137 arquivos / 1416 testes (unidade + integração na pilha local), build: verde |
| `pnpm db:reset && pnpm test && pnpm test:e2e` (desktop, mobile e fixtures, inclusive `@a11y`) | 520 passaram, 53 pulados (skips por projeto documentados nos specs), 0 falhas |
| Painel de fontes no e2e | lista 12 + detalhe 10 + jornadas 4 + axe 30 = 56 testes |
| Roteiro (`CN_ROTEIRO=1`) | 7 passos, 38 capturas |
