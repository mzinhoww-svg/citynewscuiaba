# Destaques e profundidade: fechamento (GATE)

Data: 04/10/2026. Plano `docs/superpowers/plans/2026-10-03-destaques-e-profundidade.md`, retomado pelo
plano `2026-10-04-retomada-ui-e-pauta-quente.md` (A-140). Destaques estáveis (FD-T1 a FD-T4) já estão
em `docs/reports/destaques-estaveis.md`.

## O que foi entregue

| Tarefa | Situação | Onde |
|---|---|---|
| BTN-T1, ART-T1 | Entregue antes | barra de ações e foto da matéria |
| FD-T1 a FD-T4 | Entregue antes | `destaques-estaveis.md` |
| LAB-T1, CONF-T1 | Entregue antes | vocabulário público e confiança fora do público |
| TXT-T1 | Encerrada por outro caminho | A-114 (`source_text`, `enrich` automático) |
| TXT-T2 | Encerrada por outro caminho | R41 e AUT-T4 (30 linhas, até 2 reescritas, `short_reason`) |
| TXT-T3 | Encerrada por outro caminho | A-126 (reescrita no ar, 0147) |
| HOT-T1 | Entregue (PR #43) | `src/lib/featured/hot.ts`, migration 0154 |
| HOT-T2 | Entregue (PR #43) | `src/lib/pipeline/steps/frontpage.ts`, rota `/api/ingest/frontpage` |
| HOT-T3 | Entregue (PR #43) | `src/lib/featured/hot-pin.ts`, migration 0156, quadro do Estúdio |
| CONF-T2, CONF-T3 | **Pendentes** | fora do pedido de 04/10; continuam no `progress.json` |

## Pauta quente: como funciona

1. O cron `ingest-frontpage` (a cada 20 min) chama `/api/ingest/frontpage` com `CRON_SECRET`.
2. Para cada fonte ativa com `consumption.frontpage = true`, o passo confere o `robots.txt` em `/`,
   respeita o limite por hora da fonte e faz 1 GET da página inicial (até 512 KB). Guarda só a URL, a
   posição (1 a 3) e a hora em `front_signals`, casando a URL com o item já coletado.
3. `detectHot` marca como quente o assunto que 3 fontes distintas (`featured.hot_min_sources`) mantêm
   entre os 3 primeiros links em 6 h.
4. `applyHotPins` (fim da rota, fim do tick e depois de cada publicação automática) grava um pino
   `kind = 'hot'` por 3 h, renovável até 12 h, na manchete da home, no destaque da editoria e numa vaga
   de destaques. Só matéria já publicada, não patrocinada, com capa e no escopo local (R21). Nunca
   publica nem muda status. O pino manual vigente sempre vence.
5. No público aparece a chamada em texto "Em alta em Cuiabá" sobre o título (sem plaqueta). No Estúdio,
   a pílula "Em alta · n portais" e o botão Dispensar (`featured.dismiss_hot`, auditado). O interruptor
   `hot_featured_enabled` fica em Interruptores.

## Produção (A-142)

- Migrations **0154** e **0156** aplicadas em `citynews-prod` e conferidas: colunas `topic_id`,
  `dismissed_at` e `hot_sources` em `featured_items`; `front_signals` com RLS e sem leitura anônima;
  `hot_featured_enabled` ligado; `featured.hot_min_sources` = 3; cron `ingest-frontpage` agendado;
  `featured.dismiss_hot` na lista de auditoria; a chave anônima não executa `featured_dismiss_hot`.
- **0155** (limpeza de `front_signals` com mais de 7 dias, com `delete`) fica para o dono no SQL Editor.
  Sem ela a tabela cresce devagar (até 3 linhas por fonte a cada 20 min); toda leitura já ignora o que
  tem mais de 7 dias.
- `consumption.frontpage` ligado em 8 portais locais: FolhaMax, Gazeta Digital, HiperNotícias, Leia
  Agora, O Documento, RDNews, Olhar Direto e Circuito MT. Ficaram de fora órgãos públicos, fontes
  nacionais e de nicho. Reverter: `update sources set consumption = consumption - 'frontpage'`.

## Primeiros ciclos (04/10, A-152)

O cron `ingest-frontpage` rodou às 17h40 e às 18h00 (UTC), as duas vezes com sucesso. Sinais gravados
por portal (lidos / casados com item já coletado):

| Portal | Sinais | Casados |
|---|---|---|
| Circuito MT | 6 | 6 |
| Gazeta Digital | 6 | 6 |
| HiperNotícias | 6 | 5 |
| O Documento | 6 | 5 |
| FolhaMax | 6 | 0 |
| Leia Agora | 6 | 0 |
| RDNews, Olhar Direto | 0 | 0 |

Relatório da rota no último ciclo: 8 fontes, 6 lidas, 18 sinais, 12 casados, puladas
`rate_limited: 1` e `http: 1`, nenhum pino quente (nenhum assunto em 3 portais ao mesmo tempo ainda).

## Pendências

- Dono: rodar `supabase/bootstrap/2026-10-04-sql-editor-dono.sql` (0155 e a parte C da 0143, B-029).
- FolhaMax e Leia Agora: os links do topo não casam com os itens coletados (URL da página inicial
  diferente da URL do feed: parâmetros, domínio ou caminho). Comparar as duas e normalizar no casamento.
- RDNews e Olhar Direto: um pulou pelo limite por hora da fonte e o outro por erro HTTP; conferir se o
  limite da fonte comporta a leitura a cada 20 min e qual status o portal devolve.
- R22 (comoção nacional pelo sinal dos portais nacionais) ficou fora desta rodada.
- CONF-T2 (painel "Por que esta verificação") e CONF-T3 (revisão do padrão de fonte confiável).
