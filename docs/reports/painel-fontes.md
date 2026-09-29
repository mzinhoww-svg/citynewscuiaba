# Painel de fontes (P5-T4, plano FS-T1 a FS-T9)

Relatório de verificação. Spec: `docs/superpowers/specs/2026-09-27-painel-de-fontes.md`. Plano: `docs/superpowers/plans/2026-09-27-painel-de-fontes.md`.

## Entregas por tarefa

| Tarefa | Entrega | Commit |
|---|---|---|
| FS-T1 | Migration 0011 (colunas, `source_health_daily`, `source_discoveries`, `app_settings`, runs `manual`/`fast`, trava `claim_source_fetch`, guardas de duas pessoas, auditoria, RPCs), seed, tipos | ver `git log --grep FS-T1` |
| FS-T2 | Domínio puro `src/lib/sources/*` (validação, frequência, saúde, estados, seletores, `page-list`) e janela rápida | idem `FS-T2` |
| FS-T3 | Descoberta, prévia, teste de conexão e termos, só por `crawlGet`/`checkRobots` | idem `FS-T3` |
| FS-T4 | Agente `source_profiler` e `ruleSuggestions` | idem `FS-T4` |
| FS-T5 | Pipeline: frequência por janela, `degraded`, pausa automática, `page_list`, coleta manual, tick rápido | idem `FS-T5` |
| FS-T6 | Servidor: ações, aprovações `source.critical` (migration 0030), consultas | idem `FS-T6` |
| FS-T7 | Lista O03 (filtros, lote, configurações da coleta, aviso de aprovações) | 9bfc2f2 |
| FS-T8 | Nova fonte (assistente em 5 passos) e detalhe O04 em 6 abas | 6c24e8b |
| FS-T9 | E2E de jornada, axe, servidor de fixtures no Playwright, correções abaixo e este relatório | commit `test(control): verificação do painel de fontes…` |

## O que a FS-T9 mudou fora dos testes

1. **CI com fixtures (A-160).** `playwright.config.ts` ganhou os projetos `fixtures-desktop` e `fixtures-mobile`, servidos por um segundo `webServer` em `next dev` (porta base + 500, `CRAWLER_FIXTURES=1`, `AI_PROVIDER=fake`), só para `control-sources-detail` e `control-sources-flow` (`testMatch`; os outros projetos as ignoram por `testIgnore`). A guarda `fixturesEnabled` de produção não foi tocada. O dev usa `.next/dev`, separado da saída do build (coexistem). Os projetos dependem de `desktop`, `mobile` (e `mobile-webkit` no CI), porque mexem na via rápida e em cotas globais que a spec da lista lê.
2. **Login estável.** `loginAs` espera a URL final com prazo de 60 s (passa por `/entrar/migrar`; em `next dev` a rota fria compila no caminho). Espera por estado, sem sleep. O `webServer` de fixtures só fica pronto depois de `/entrar` responder.
3. **Defeito real: bloqueio e score não invalidavam a home (A-161).** A home guarda 60 s (tag `home`); um bloqueio por pedido do veículo deixava o agregado no "Veja também" até o cache vencer. `refresh()` e a ação de recomendação agora chamam `revalidateTag("home")`. Os dois testes falham sem a correção (verificado).
4. **Defeito real: retomar não zerava as falhas (A-162).** Depois da pausa automática, "Retomar" ativava com `consecutive_failures = 3` e a primeira falha seguinte pausava de novo. Migration 0031 zera o contador na ativação (ação e lote), com teste de integração.

## Testes

| Camada | Resultado |
|---|---|
| Vitest (unit + integração) | 175 arquivos, 1 652 testes verdes (`pnpm test`) |
| `pnpm verify` | verde (lint, typecheck, test, build) |
| E2E do painel | `control-sources-list` (prod), `control-sources-detail` e `control-sources-flow` (fixtures) verdes |
| Axe | `tests/a11y/control-sources.spec.ts`: 6 testes (360/768/1280 x claro/escuro), cada um percorre 12 páginas: 72 verificações, 0 serious/critical. `nova` e `detalhe` também em `control-sources-detail` (3 larguras) e a revisão do assistente no fluxo |
| Conjunto E2E completo (`pnpm test:e2e`, como o CI, sem o projeto webkit que só existe com `CI=true`) | 858 passados, 52 pulados (condições por projeto, como as larguras definidas pelo teste), 0 falhas, 14 min; todos os projetos, inclusive `fixtures-*` |

Jornadas do `control-sources-flow.spec.ts`: cadastro do Jornal da Chapada por seção sem feed (seletores da IA, 5 itens), ativação, Coletar agora + worker, 3 falhas (HTTP 500) com `degraded`, `degraded`, `paused`/`auto_failures`, notificação e retomada; opt-out; score 1; via rápida (tick real, um `fetch`, itens no pipeline).

## Review Focus do plano

| # | Cobertura |
|---|---|
| 1 | FS-T3 (`discover.test.ts`, redirecionamento para IP interno, `FakeHttp` sem chamada) |
| 2 | FS-T1 (`source-admin-db.test.ts`), FS-T6 (ação) e FS-T8 (`control-sources-detail`: Diego pede, tenta aprovar, Marina aprova) |
| 3 | FS-T5 (`ingest.test.ts`) e o fluxo desta tarefa, com a falha final contada só uma vez por run |
| 4 | FS-T1, FS-T2, FS-T5; no e2e, 25 e 45 não são oferecidos e 10 põe na via rápida |
| 5 | FS-T4 (`profile.test.ts`) e FS-T3 (`buildPreview` descarta a injeção) |
| 6 | FS-T1 (`claim_source_fetch`) e FS-T5 (`ingest.test.ts`, ticks + `fetch`); no fluxo, uma única requisição de feed na janela |

## Critérios de aceite da spec (12)

Atendidos por teste: 1 (`control-sources-detail`, analista), 2 e 20 (`control-sources-list`), 3, 8 e 10 (`control-sources-detail` e fluxo), 5 e 6 (fluxo, `SuggestionField.test`), 7 (FS-T3/FS-T4), 9 (FS-T3), 11, 12, 13 (fluxo), 14 (fluxo e `collect-now.test`), 15 (FS-T1/FS-T8), 16 (fluxo: opt-out), 17 (`detail`, exclusão), 18 (`source-admin-db`, aba Histórico), 19 (conflito de versão), 21 (fluxo: score 1), 22 (axe e capturas), 23 a 27 (FS-T1/FS-T5 e fluxo da via rápida), 28 (`cron-watchdog.yml`, FS-T5). O critério 4 (feed direto reconhecido) e 12 (horários exatos) ficam nos testes de domínio (`discover.test`, `frequency.test`).

## Capturas (`docs/reports/painel-fontes/*.png`)

54 imagens em 360, 768 e 1280 px, geradas por `scripts/capture-painel-fontes.mjs` (servidor de fixtures): lista, filtro vazio, nova fonte (endereço, análise com prévia e sugestões, sugestão aplicada, termos, erro de robots), as seis abas do detalhe, diálogo de exclusão, detalhe com pedido pendente, diálogo do pedido e fonte não encontrada. Inspeção:

- 1280 e 360 px: sem rolagem horizontal, rótulos com texto e ícone, foco e controles com área de toque adequada.
- 768 px (a FS-T7 não conseguiu vê-la carregada): a lista carrega e usa cartões (a tabela começa em 1024 px, A-142), dois por linha; nova fonte e abas do detalhe renderizam completas. Achado: **em 768 px o menu do Estúdio ocupa cerca de 360 px de altura antes do conteúdo** (lista vertical inteira), empurrando o título para baixo. É comportamento do shell do Estúdio (fora do plano do painel) e fica como limite.
- Nas capturas de página inteira, o cabeçalho fixo e o indicador do `next dev` ("Rendering") aparecem sobre o conteúdo: artefato da captura, não da tela.

## Degradados e limites conhecidos

FS-T6:
- Logo: só as recusas têm teste de integração; o envio ao bucket `source-logos` não roda na pilha local sem Storage (A-017, A-131).
- O motivo de recusa de uma aprovação não é guardado (A-129); a auditoria registra quem recusou.
- Ativação em lote só vale para fonte já ativada antes (A-125): a primeira ativação exige teste de conexão individual.

FS-T7:
- Página de 25 fontes, não 50 (A-141); "Saúde" ordena por score operacional e a relevância editorial não é ordenável.
- O aviso de aprovações só lista até 3 pedidos e leva à tela de Aprovações; não decide na lista (A-145).
- Estados vazio total e erro da lista têm teste de componente, sem captura (exigiria esvaziar o cadastro ou derrubar o banco).

FS-T8:
- Seletores de página sugeridos pela IA só entram com opt-in (A-153); sem ele a fonte vira `page_article`.
- O cadastro da Voz do Coxipó roda só no desktop (endereço fictício único, A-156).
- O logo usa a URL pública do bucket sem `next/image` (A-154).

FS-T9:
- O plano pedia o toast "Coleta enfileirada"; o texto real da tela é "Coleta iniciada. Os itens aparecem em instantes."
- O Control Center ainda não exibe notificações (a caixa de alertas é da P5-T1): a pausa automática é verificada na tabela `notifications` (`source_auto_paused`, `control_center`, `open`) e no cabeçalho e na lista da fonte.
- A via rápida do fluxo usa uma fonte própria com o feed da Folha do Cerrado, não a própria Folha, para não poluir `collected_items` do seed.
- A coleta do fluxo roda no processo do teste (service role, HTTP falso), não pela rota de drain do servidor, que usa a rede real; a rota do tick rápido é chamada de verdade.
- Os projetos `fixtures-*` só rodam se os demais passarem (dependência de projeto do Playwright).
- Sem consulta pública de `pgmq`/`pg_cron` na pilha local: o agendamento real é validado no CI com `supabase start`.

## Pendência para o dono

DP-3 (score editorial dentro do ranking de recomendação, `rec-v2` com aprovação dupla de pesos): mantida fora do ranking. DP-1 e DP-2 foram resolvidos em 27/09.

## Decisões novas

A-160 a A-164 em `.planning/DECISIONS.md`.
