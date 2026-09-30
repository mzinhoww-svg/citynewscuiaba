# Revisão independente do gate · PWA e notificações (PW-T1 a PW-T15)

Revisor de contexto novo, somente leitura, branch `claude/keen-hypatia-8qn86r` (HEAD `5fc7917`). Base: CLAUDE.md, AUTONOMY §5, spec `2026-09-28-pwa-notificacoes-design.md`, plano G1–G19, `docs/reports/pwa.md`, migrations 0040–0046, `src/lib/push`, `src/sw`, `src/app/api/push`, `src/app/estudio/admin/notificacoes`, `src/lib/db/push-*`, `src/proxy.ts`, `src/lib/offline/sw.ts`, convites C07/C08/C09. Não executei a suíte nem o axe; os achados abaixo vêm de leitura de código e SQL. Suposição sem evidência foi descartada.

## Resumo

| Severidade | Qtde |
|---|---|
| Bloqueante | 0 |
| Alto | 2 |
| Médio | 6 |
| Baixo | 9 |

Nenhum bloqueante. Os dois altos devem ser corrigidos antes do merge: aviso de matéria despublicada continua saindo (PWA-01) e uma única inscrição hostil pausa os envios de todos (PWA-02).

## O que foi conferido e está correto

- **Duas pessoas no banco (spec §19.2).** `approvals` continua sob `guard_approvals` (`requested_by = uid`, decisão só em nome próprio, `approved_by <> requested_by`). `guard_push_approvals` (0041:158-218) exige `push.approve` para decidir e só deixa quem pediu abrir a aprovação. `guard_push_sends` (0041:238-340) exige, na transição para `queued`/`scheduled`/`rejected`, uma linha em `approvals` decidida por outra pessoa com `push.approve`. `push_dispatch_due` (0043:75-99) reconfere a aprovação (`approved`, aprovador diferente, `requested_by` igual ao do envio, `push_can`), cancela se adulterada e marca `applied`. Não achei caminho de bypass para Urgente, Destaque ou retomada. `service_role` pula só a regra de papel, e o despacho reconfere.
- **Trilhos.** `push_reserve` (0040:202-305) tem a ordem preferência, duplicata, silêncio, limite. Silêncio efetivo é a união (menor início, maior fim), limite é o mínimo, urgente conta no limite e ignora só o silêncio. Existe índice único parcial `(subscription_id, article_id)`. 404/410 apagam a inscrição (`push_delivery_result` `gone`). Cinco falhas não 4xx em dias diferentes também apagam.
- **Patrocinado e urgente.** O trigger de follow (0043:17-40) ignora `urgent` e `sponsored`. `push_request` e `guard_push_sends` recusam patrocinada. Urgente e Destaque só nascem por pedido humano. `follow` de publicação automática espera 10 min.
- **Expiração e cancelamento.** Urgente pendente expira em 60 min, Destaque na hora agendada ou em 24 h (`push_expire_requests`). O trigger 0044 cancela pedidos pendentes, aprovados, agendados e pausados quando a matéria é despublicada (mas veja PWA-01).
- **Segredos e logs.** `VAPID_PRIVATE_KEY` só em `src/lib/push/server.ts` (`server-only`); o cliente importa apenas `public.ts`. `missingVapidVars` devolve só nomes. Nenhum `console.*` em `src/lib/push`, `src/sw`, `src/app/api/push` nem em `src/lib/db/push-*`. Auditoria guarda `kind`, estados, motivo e `articleId`, nenhum dado de leitor.
- **SSRF.** Allowlist de hosts, `https`, porta 443, sem credenciais, DNS sem IP privado na criação e no envio, `redirect: "manual"`, teto de 10 s (`endpoints.ts`, `sender.ts`). Os hosts permitidos são de terceiros, o que anula o rebinding.
- **Privacidade.** Token de gestão de 32 bytes, só o hash no banco, comparação em tempo constante. RLS sem acesso a `anon`; leitor lê só as próprias, sem `endpoint`, chaves nem hash (view `my_push_subscriptions`). `push_deliveries` cai em 30 dias e a inscrição em 180. Recibo só grava com cookie de Métricas, com o SW e o servidor conferindo, e vai para `push_send_counters` por `(send, aparelho, navegador)`. Exportação em `/perfil` sem chaves. O UA não é gravado.
- **SW.** `cn-salvos-v1` preservado no `activate`. Cache só com marcador `x-cn-offline` (proxy, sem cookie `sb-*-auth-token`), 200, sem `Set-Cookie`. `NEVER_CACHE` cobre Estúdio, API, entrar, perfil, busca, pergunte e alertas. `u` externo vira `/` e payload inválido vira aviso genérico. Registro nunca em `/estudio`.
- **UI.** "Agora não" nunca chama `requestPermission`; pré-prompt só com `permission = default`; iPhone só instalado; sem armazenamento local, sem convite. Nenhum convite exige login (CLAUDE.md §5.2). Sem `CityNews` ou `Cuiabá` fora da grafia, sem hex ou px cru nos componentes novos.

## Achados

### PWA-01 · ALTO · Aviso de matéria despublicada continua saindo depois do despacho

- **Onde:** `supabase/migrations/0044_push_unpublish_cancel.sql:17` (a lista de estados omite `dispatching` e `sent`), `src/lib/push/steps/index.ts:188-235` (`push_deliver` e `push_due` só conferem o estado do envio, não a matéria), `src/lib/db/push-send-store.ts:320` (`claimDue`).
- **Cenário:** Destaque aprovado para 20 mil inscrições entra em `dispatching` com 200 lotes. O editor despublica a matéria por erro factual ou retirada judicial no minuto seguinte. O trigger não cancela o envio, e o `fanOut` só olha a matéria uma vez, antes de planejar os lotes. Os lotes restantes seguem enviando. Mesmo com o envio já `sent`, entregas 429/5xx são reenviadas por `push_due` até 30 min depois. `follow` adiado pelo silêncio sai até 6 h depois. O leitor recebe um aviso, com link para uma página 410. A spec §15 e §10.2 dizem "cancelado automático, lotes restantes descartados".
- **Correção:** em `push_deliver` e `push_due`, reconferir `articles.status in ('published','updated')` e `not sponsored` uma vez por lote (uma consulta) e, se falhar, `cancelSend` mais `pauseBatch`. No trigger 0044, incluir `dispatching` (a transição para `cancelled` já é válida em `push_transition_ok`). Em `push_claim_due`, expirar entregas de matéria despublicada. Teste: despublicar com o envio em `dispatching` e com retry pendente.

### PWA-02 · ALTO · Uma inscrição hostil derruba os envios de todos (403 pausa o envio)

- **Onde:** `src/lib/push/sender.ts:46` (403 vira `vapidInvalid`), `src/lib/push/steps/index.ts:126-130` (`pauseSend` mais `notifyVapidInvalid`, e `return false` interrompe o lote), G8, `src/lib/push/api.ts:185-220`.
- **Cenário:** o servidor nunca verifica com qual chave VAPID a inscrição foi criada. Um atacante cria, no próprio navegador, uma inscrição com outra `applicationServerKey` e a registra em `/api/push/subscriptions` (endpoint FCM ou Apple legítimo, passa a allowlist; 10 por hora por IP). O serviço de push responde 403 a toda entrega. Na primeira vez que um envio a alcança, o envio inteiro (`follow`, Urgente ou Destaque) vira `paused`, o lote para e o Control Center recebe o alerta crítico "Chaves VAPID inválidas". A retomada exige duas pessoas (`push_resume_approve`). O atacante repete a cada envio e força a equipe a retomar sempre; num incidente, atrasa o Urgente.
- **Correção:** tratar 403 como falha da inscrição (marcar e remover, como `gone`), e pausar o envio só com evidência de chave errada: por exemplo ≥ N inscrições distintas com 403 em hosts diferentes, ou ≥ 20% do lote. Como alternativa, sondar com uma inscrição canário própria antes de pausar. Teste: um 403 isolado não pausa; 403 em massa pausa.

### PWA-03 · MÉDIO · Retomar envios reativa o que não devia: agendado futuro sai na hora e envio velho sai como novo

- **Onde:** `supabase/migrations/0041_push_admin.sql:598` (pausa sobrescreve `scheduled` por `paused`, perdendo o estado de origem) e `:651-653` (só expira agendado vencido há mais de 1 h; o resto vira `queued`).
- **Cenário 1:** Destaque agendado para amanhã às 10h é pausado hoje. Ao retomar, vira `queued`, e `push_dispatch_due` (0043:75-99) despacha imediatamente, ignorando `scheduled_at`, embora a aprovação valha para o horário escolhido.
- **Cenário 2:** pausa de contingência de um fim de semana. Ao retomar, todo `follow` e Urgente pausados (notícia de 48 h, ou Urgente aprovado com `started_at` nulo) é despachado, porque o TTL de `push_reserve` só define adiamento do silêncio e `started_at` é preenchido no despacho. Isso gasta a cota de 3 avisos por dia dos leitores com notícia velha. A spec §12.4 diz que o envio deve virar `expired` quando o TTL passar.
- **Correção:** guardar o estado anterior (por exemplo `status_reason` estruturado ou coluna `paused_from`) e voltar `scheduled` para `scheduled`. Na retomada, expirar por tipo: `follow` acima de 6 h, `urgent` acima de 2 h desde a aprovação e `highlight` acima de 12 h.

### PWA-04 · MÉDIO · Matéria em `updated` (viva) é tratada como despublicada

- **Onde:** `src/lib/push/steps/index.ts:137` e `:166`, `supabase/migrations/0041_push_admin.sql:270` e `:441`, `src/app/estudio/admin/notificacoes/actions.ts:171`. O trigger 0044:11 trata `published` e `updated` como no ar.
- **Cenário:** um Urgente aprovado às 10h00 tem uma correção publicada às 10h05 (matéria vai para `updated`). No despacho, `fanOut` vê `status !== 'published'` e cancela com "Matéria despublicada", e o aviso urgente é perdido embora a matéria esteja no ar. O mesmo vale para `follow` de matéria publicada automaticamente e corrigida durante a janela de 10 min, e para pedir Destaque de matéria corrigida (o `push_request` recusa).
- **Correção:** aceitar `published` e `updated` nesses cinco pontos (mesma lista do trigger 0044). Teste com matéria em `updated`.

### PWA-05 · MÉDIO · `PATCH /api/push/subscriptions/:id` grava no rate limit com `id` arbitrário e sem limite por IP

- **Onde:** `src/lib/push/api.ts:143-153` (`gate` com `keySuffix` usa `id` cru como chave e sufixo de bucket) e `:229-233` (o token só é conferido depois).
- **Cenário:** um cliente anônimo envia PATCH para `/api/push/subscriptions/<string qualquer, milhares de caracteres>`. Cada `id` novo cria uma linha em `rate_limits` (uma escrita no Postgres por requisição, sem teto por IP, porque o limite é por id). O crescimento é ilimitado e o `Origin` é forjável fora de um navegador.
- **Correção:** validar `id` como UUID antes do `gate` (404 imediato, sem escrita), e aplicar também um limite por IP hash, como nas demais rotas.

### PWA-06 · MÉDIO · O SW intercepta toda navegação, inclusive `/estudio`, `/entrar` e `/auth`

- **Onde:** `src/sw/index.ts:348-353` e `:280-316`; spec D-P11 e §8.4 ("o SW ignora `/estudio`, `/api`, `/entrar`, `/perfil`").
- **Cenário:** o `fetch` chama `respondWith(handleNavigation)` para qualquer `mode === "navigate"`. Com a rede acima de 4 s (página do Control Center pesada, callback de login ou OAuth lento), `withTimeout` rejeita, `kind` é nulo e o SW devolve `/offline.html` ("Sem conexão") com o usuário online. Isso vale para o Estúdio e para o retorno de login. O SW fica registrado no mesmo navegador de quem já leu o portal.
- **Correção:** em `fetch`, retornar sem `respondWith` quando `NEVER_CACHE` casar com o caminho (e para `/auth`), deixando a rede tratar. Só rotas da allowlist entram no fluxo "rede com tempo limite, depois cache".

### PWA-07 · MÉDIO · A navegação espera o corpo inteiro da página antes de responder

- **Onde:** `src/sw/index.ts:295` (`const html = await res.clone().text()` antes de `return res`).
- **Cenário:** para toda página cacheável (home, editorias, matéria), o SW só devolve a resposta depois de ler todo o HTML, o que anula streaming e Suspense do App Router e atrasa FCP e LCP (spec §16 e Lighthouse CI, JS ≤ 170 kB). O ganho de resiliência não compensa em rede lenta.
- **Correção:** devolver `res` na hora e mover a leitura de `clone()` para dentro do `event.waitUntil` (`titleFromHtml`, `cacheAssets`). Conferir com Lighthouse (home instalada).

### PWA-08 · MÉDIO · Entrega reservada e não enviada fica órfã: perde o aviso e gasta a cota do dia

- **Onde:** `supabase/migrations/0040_push_core.sql:290-303` (`push_reserve` insere `queued` e soma `day_count`), `src/lib/push/steps/index.ts:206-211`, `src/lib/db/push-send-store.ts:307` (`dueDeliveries` ignora `queued` com `attempts = 0`).
- **Cenário:** o worker cai (timeout do drain, erro de banco em `deliveryResult`) depois de `reserve` e antes do resultado. O lote volta à fila, mas `reserve` responde `skipped_duplicate` (índice único), e a linha `queued` com `attempts = 0` nunca é reprocessada. O leitor perde o aviso, e a cota diária já foi consumida. Não há checagem de orçamento de tempo dentro do lote (100 inscrições, concorrência 10, 10 s por chamada), embora a spec §12.3 peça encerrar em 80%.
- **Correção:** tratar `queued` com `attempts = 0` e `created_at` antigo (por exemplo mais de 2 min) como elegível em `dueDeliveries`, ou reenviar as `queued` do próprio envio ao reprocessar o lote. Incluir verificação de prazo no `mapLimit`. Teste com falha injetada depois do `reserve`.

### PWA-09 · BAIXO · Quem pediu pode forjar "Aprovado por" na fila e no histórico

- **Onde:** `supabase/migrations/0041_push_admin.sql:250` (`v_person` inclui `approved_by`, `approved_at`, `status_reason`, `approval_id`) e `:308-312`. `src/lib/db/queries/push-admin.ts:364, 436, 559` exibem `push_sends.approved_by`.
- **Cenário:** um editor faz `update push_sends set approved_by = <editor-chefe>` na própria linha pendente (a policy `push_sends_decide` permite ao solicitante) e a tela mostra "Aprovado por" a pessoa errada. O envio não sai, porque o despacho usa a tabela `approvals`, mas a atribuição na auditoria visual é falsa.
- **Correção:** tirar `approved_by`, `approved_at` e `status_reason` de `v_person` para pessoa comum (só o trigger de transição os preenche), ou exibir a aprovação lendo de `approvals`.

### PWA-10 · BAIXO · `syncSaved` e `cachePage` ignoram a allowlist e o marcador

- **Onde:** `src/sw/index.ts:166-172` e `:199-219`.
- **Cenário:** `cache-saved` aceita qualquer caminho interno e grava a resposta com `credentials: same-origin` em `cn-salvos-v1`, sem `routeKind` nem `isCacheableResponse`. Só código da própria origem envia a mensagem, e hoje as páginas públicas não trazem dado de conta, então não vi vazamento. Mas o invariante "nada de sessão em cache" depende de quem chama.
- **Correção:** aplicar `routeKind` e o marcador `x-cn-offline` também em `cachePage`.

### PWA-11 · BAIXO · O toque no aviso navega a primeira janela aberta, mesmo do Estúdio

- **Onde:** `src/sw/index.ts:430-437`.
- **Cenário:** uma pessoa da equipe com aba do Estúdio (editor aberto) toca um aviso e o SW faz `navigate(target)` na primeira janela encontrada, perdendo o rascunho não salvo.
- **Correção:** preferir janela cujo caminho não seja `/estudio`, senão `openWindow`.

### PWA-12 · BAIXO · Fechar o diálogo nativo conta como "negado" e silencia para sempre

- **Onde:** `src/lib/push/client.ts:173-176` (`permission !== "granted"` inclui `default`) e `src/components/editorial/NotificationInvite.tsx:65-69` (`refusals = 3`).
- **Cenário:** o leitor fecha o pedido nativo sem decidir (no Safari devolve `default`). O código registra `notif_permission_denied` (infla "Negadas" no funil A09) e nunca mais mostra o pré-prompt neste navegador.
- **Correção:** distinguir `default` de `denied`: `default` conta como recusa comum (`recordRefusal`) e não emite `notif_permission_denied`.

### PWA-13 · BAIXO · CSV do histórico sem proteção contra fórmula

- **Onde:** `src/lib/db/queries/push-admin.ts:588-591` (`csvCell`).
- **Cenário:** título de matéria ou de aviso começando com `=`, `+`, `-` ou `@` (texto derivado de fonte externa) abre como fórmula no Excel de quem exporta.
- **Correção:** prefixar `'` quando a célula começar com esses caracteres.

### PWA-14 · BAIXO · Limite de corpo de 4 KB é menor que o de 200 alvos

- **Onde:** `src/lib/push/api.ts:22` contra `schemas.ts:274-276` e `0040:41` (200 alvos de até 87 caracteres).
- **Cenário:** um leitor com mais de cerca de 120 alvos recebe 413 ao ativar ou sincronizar. Fora do caso comum, mas o erro é silencioso.
- **Correção:** subir o teto do corpo para 32 KB nas rotas de inscrição e PATCH (mantendo 4 KB no recibo) ou reduzir o máximo de alvos.

### PWA-15 · BAIXO · Apagar e alterar a inscrição param de funcionar sem VAPID

- **Onde:** `src/lib/push/api.ts:146` (`gate` devolve 503 para todas as rotas quando `!enabled`).
- **Cenário:** se as chaves VAPID saírem do ambiente (D-P25), `DELETE` e `PATCH` recusam com 503 e o leitor não consegue apagar a linha no servidor (só cai em 180 dias). A linha expira porque o navegador cancela a inscrição e o serviço de push passa a responder 410, mas o direito de apagar (LGPD) não deveria depender de configuração.
- **Correção:** aplicar `enabled` só a criação e rotação; `DELETE` e `PATCH` seguem funcionando.

### PWA-16 · BAIXO · Detalhes menores de banco e configuração

- `supabase/migrations/0041_push_admin.sql:102-103`: `push_settings_int` virou `security definer` e executável por `authenticated`; qualquer pessoa logada lê qualquer chave numérica de `app_settings` (`execute ... where key = $1`). Restringir a chaves `push.%`.
- `supabase/migrations/0040_push_core.sql:394`: falha 4xx permanente (400, 413) não incrementa falhas nem remove a inscrição; fica até os 180 dias e entra em todo lote. Considerar remover após N 400/413 consecutivos.
- `src/lib/push/endpoints.ts:69-71`: `PUSH_ENDPOINT_TEST_HOSTS` só é ignorada em produção quando `CN_E2E !== "1"`; a spec §13 diz que é ignorada com `VERCEL_ENV = production`. É a decisão G15, mas `CN_E2E=1` numa variável de produção reabriria o SSRF. Ignorar sempre que `VERCEL_ENV === "production"`.
- `sponsored` só é conferido no pedido e na criação do `follow`; se a matéria virar patrocinada depois da aprovação, o envio segue (junto ao PWA-01).

## Lacunas de teste relevantes

1. Despublicação com o envio em `dispatching` e com `push_due` pendente (PWA-01). Hoje só há teste de despublicação em `pending_approval` (`tests/integration/push-admin.test.ts:457-495`) e antes do fan-out (`src/lib/push/steps/steps.test.ts:62-80`).
2. 403 isolado versus 403 em massa (PWA-02); só existe o caso "403 pausa" (`tests/integration/push-send-flow.test.ts:416`).
3. Retomar com agendado futuro e com `follow` e Urgente velhos (PWA-03); o teste de pausa e retomada só cobre a aprovação por outra pessoa (`push-admin-db.test.ts:303-329`).
4. Matéria em `updated` no pedido e no fan-out (PWA-04).
5. `PATCH` com `id` que não é UUID não escreve em `rate_limits` (PWA-05) e limite por IP.
6. Falha injetada entre `push_reserve` e o resultado (PWA-08).
7. SW: navegação a `/estudio`, `/entrar`, `/auth` com rede lenta (> 4 s) não cai em `offline.html`; a resposta de matéria cacheável é entregue antes de a leitura do corpo acabar (PWA-06, PWA-07); `cachePage` recusa caminho fora da allowlist (PWA-10).
8. Permissão `default` após fechar o diálogo nativo (PWA-12).
9. Não verifiquei a suíte axe (`@a11y`) das telas novas nem os tamanhos 360, 768 e 1280 px; a leitura de código não mostrou violação evidente (regiões com `aria-labelledby`, `role="status"`, abas com `aria-current`, resumo textual do gráfico), mas o gate exige o resultado do axe como evidência.
