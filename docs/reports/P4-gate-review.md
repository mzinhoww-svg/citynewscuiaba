# Revisão do gate P4 · Estúdio editorial

**Revisor:** subagente novo, só leitura (método `.claude/skills/requesting-code-review/code-reviewer.md`, gate `docs/AUTONOMY.md` §5 item 2).
**Branch:** `claude/keen-hypatia-8qn86r` @ `0483606`. Commits `[P4-T1]`..`[P4-T8]` (2e106af..b046423) + `[P4-GATE]` (a3053a5, 3c551e6).
**Escopo lido:** migrations 0015–0019 e 0022 (e as partes de 0001/0002/0008/0014/0021 de que dependem), `src/lib/studio/*`, `src/lib/auth/{permissions,require-role}.ts`, `src/lib/audit`, `src/lib/media/{serve,licenses,takedown}.ts`, `src/app/estudio/**`, `src/app/api/estudio/midia/[id]`, `src/app/api/ingest/tick`, consultas públicas que consomem o que o Estúdio grava (`src/lib/db/queries/articles.ts`, `home.ts`).
**Autoridade:** spec mestre, plano P4, `docs/screens.md` §C, `docs/architecture.md` §6, CLAUDE.md §5 e §8, `.planning/DECISIONS.md`, `.planning/BLOCKERS.md`.

## Verificação executada

| O quê | Resultado |
|---|---|
| `pnpm db:reset` (pilha local offset 0, que estava com schema antigo, sem as funções `studio_*`) | Migrations 0001–0022 + seed aplicadas |
| `vitest run` de `tests/integration/{studio-guard,studio-publish,save-conflict,corrections,queue,media,rls-hardening}.test.ts`, `src/lib/studio`, `src/lib/media` | 14 arquivos, 90 testes, verde |
| `pnpm lint` | verde |
| `pnpm typecheck` | **falha só no ambiente**: `node_modules` desta checkout não tem `@tiptap/*` (estão em `package.json` e no lockfile; faltou `pnpm install` depois do merge do worktree `cn-p4`). Não é defeito de código, mas o gate precisa rodar `pnpm install && pnpm verify` nesta checkout antes do merge |
| Reproduções SQL (todas em `begin … rollback`, como `authenticated` com `request.jwt.claims` dos usuários de seed) | Descritas em cada achado abaixo |
| E2E / axe / roteiro | Não reexecutados (o relatório P4 declara 0 violações em 18 rotas; não verifiquei) |

## Pontos fortes

- **Guarda única e testada.** `studioAction` (`src/lib/studio/action.ts:164-212`) valida com zod, resolve o escopo do objeto lendo o banco com a sessão da pessoa, chama `can()` e audita `*.denied` antes de executar. Todas as Server Actions de `src/app/estudio/actions.ts` delegam para funções embrulhadas; não há mutação solta. Todas as páginas chamam `requireRole` (e o layout recusa quem não tem papel, `layout.tsx:13-15`), todas com `dynamic = "force-dynamic"`.
- **AsyncLocalStorage sem vazamento.** O `store` só recebe valor dentro de `runWithStudioContext` (`context.ts:26`), que nenhum código de produção chama e que não está num módulo `"use server"`. Em produção `studioContext()` monta sessão e cliente novos por chamada (`context.ts:32-40`). Não há estado de módulo compartilhado entre requisições.
- **`studio_audit` não forja ator.** Exige `auth.uid()`, recusa `p_actor` diferente, limita tamanho, e fora da equipe só aceita `*.denied` (`0015:18-29`). `audit_log` continua imutável (trigger de 0001).
- **Conflito de salvamento correto.** `studio_save_draft` trava a linha (`for update`), compara versão base e devolve snapshot + diff sem gravar (`0017:66-74`); `studio_publish_correction` faz o mesmo e publica tudo numa transação (`0019:64-130`).
- **Agendamento sem publicação dupla.** `publish_due_scheduled` é um único `UPDATE … WHERE status = 'scheduled' … RETURNING` (`0018:22-31`): duas execuções concorrentes (pg_cron e tick) não publicam a mesma linha duas vezes (a segunda reavalia o `WHERE` depois do lock). `publishArticle` também é idempotente por `.not("status","in","(published,updated)")` (`publish.ts:55`).
- **Mídia privada.** `/api/estudio/midia/[id]` exige papel, lê o asset com a RLS da pessoa e sobrescreve `Cache-Control: private, no-store` inclusive no 302 para a URL assinada (`route.ts:21-54`).
- **Push nunca sai da publicação.** O controle aparece desabilitado com o motivo (`PublishDialog.tsx:226-230`); nenhum caminho do P4 dispara push.
- **Guarda de ilustração** antes de chamar a IA (Segurança, sensível, etiquetas de crime/tragédia/saúde), texto da matéria como dado (`media.ts:207-224`, `licenses.ts:82-95`); sem gerador, nada é salvo (degradado documentado).

## Achados

### Críticos

Nenhum achado bloqueia sozinho o fechamento por risco imediato ao leitor em produção (hoje sem conteúdo, B-016), mas os itens 1 a 4 abaixo quebram regras de CLAUDE.md §5 ou do plano e devem entrar antes do merge.

### Importantes

**1. B-015 continua aberto: o rascunho sem IA pode ser publicado sem reescrita.**
- `src/lib/studio/checklist.ts:165-199` e `src/lib/studio/draft-view.ts:21-24` não olham `ai_fallback`; `publishArticle` (`publish.ts:37-40`) só confere o checklist. O `fallbackDraft` (`src/lib/pipeline/steps/write.ts:68-77`) cola `fonte: título. trecho (url)` no corpo e ainda preenche a linha fina, então o item "título e linha fina" passa. Basta preencher SEO, tags e bairro para "Aprovar e publicar". O alerta existe só na UI (`fila/[id]/page.tsx:108-110`).
- Por que importa: CLAUDE.md §5.4 (agregado não é republicado). O BLOCKERS diz que o P4 devia fechar isso; o relatório P4 não menciona o B-015.
- Correção: item de checklist `ai_fallback` que bloqueia enquanto o corpo ainda tiver parágrafos do fallback. Dá para detectar: marcar os parágrafos do fallback com uma marca `sourceExcerpt` e exigir que nenhuma continue, ou comparar com o snapshot da versão 1. Dá também para trocar o fallback por esqueleto sem texto das fontes (só citações). Conferir no servidor (`loadDraftView` lê `ai_fallback` e `body`) e testar em `checklist.test.ts` + `studio-publish.test.ts`.

**2. "Matéria publicada só muda por Atualização ou Correção" só vale na camada TypeScript. O banco deixa editor e revisor reescrever o registro público sem versão nem auditoria.**
- `articles_update_editors` (`0002_rls.sql:154-155`) dá UPDATE em qualquer coluna, em qualquer status. Reproduzido: como Otávio (editor de `cidade`), `update articles set title=…, body=… where id=<publicada>` → `UPDATE 1`, sem versão e sem `audit_log`. Com o JWT do navegador e a anon key isso é uma chamada PostgREST direta.
- `studio_save_draft` (`0017:49-105`) não confere status. A recusa de publicada está só em `save.ts:210`. A função aceita `p_patch.status` (`0017:88`) e `p_patch.fieldOrigins` (`0017:87`): editor pode publicar sem checklist e forjar "Sugerido pela IA · aceito por <outra pessoa>". Aceita também `p_change_kind='correction'` com nota pública, sem linha em `corrections`.
- `article_versions_insert` (`0002_rls.sql:167-172`) não amarra `author_id`, `origin` nem `number`. Reproduzido: como Beatriz (revisor), `insert into article_versions (…, author_id=<Marina>, change_kind='correction', public_note='Nota falsa', snapshot={title:'Texto forjado'…})` numa matéria publicada → `INSERT 0 1`. A linha aparece no histórico público (`public_article_versions`, `0008_portal.sql:64-71`). Isso contraria o requisito do gate "revisor só corrige via `studio_publish_correction`": agora que a função security definer existe, a política de INSERT do revisor sobra.
- `corrections_update` (`0002_rls.sql:210-212`) deixa editar `public_note` de correção já publicada (o trigger `guard_corrections`, `0002:690-702`, só impede despublicar). O registro público de correção fica mutável.
- Correção (uma migration nova):
  - (a) Trigger `before update on articles`: para `current_user in ('anon','authenticated')` e `old.status in ('published','updated')`, recusar mudança de `title/dek/body/section_slug/slug` fora das funções de Atualização/Correção (sinal via `set_config('citynews.publish_mode', …, true)` dentro de funções security definer `studio_publish_update` e `studio_publish_correction`) e recusar `status → published/scheduled` fora de `studio_publish` (mover o checklist, ou pelo menos a checagem de `ai_fallback` e versão, para uma função security definer).
  - (b) `studio_save_draft`: recusar status público, ignorar `status` e `fieldOrigins` vindos do cliente (calcular origem no servidor) e aceitar só `p_change_kind='edit'`.
  - (c) `article_versions_insert`: `with check (author_id = auth.uid() and origin = 'human' and change_kind = 'edit')` e remover a cláusula do revisor; `update`/`correction` só pelas funções.
  - (d) Trigger em `corrections`: `public_note` imutável depois de `published_at`.
  - Testar em `rls-hardening.test.ts`.

**3. "Reprocessar" despublica em silêncio uma matéria automática publicada.**
- `studio_request_reprocess` (`0017:113-141`) não confere status: para item do pipeline sem versão humana, faz `status = 'draft'` e reenfileira. Reproduzido como Marina numa publicada com `publish_mode='auto'` → `status` virou `draft`. Não grava `decisions.human_decision='unpublish'`, não pede motivo e não invalida cache. A UI esconde o botão para item público (`fila/[id]/page.tsx:264-269`, `open && …`), mas `reprocessAction({id})` é Server Action chamável direto e `reprocessItem` (`review.ts:253-267`) não confere status.
- Por que importa: o plano (Global Constraints) exige que despublicar automático tenha motivo obrigatório e decisão `unpublish`. Aqui o texto some do portal sem rastro de despublicação e com a página velha em cache até 300 s.
- Correção: `and a.status not in ('published','updated','scheduled')` na função (erro `22023`) e teste de integração.

**4. Jornalista não consegue salvar a própria matéria depois de "Pedir ajuste".**
- `requestChanges` põe `status='changes_requested'` (`review.ts:241`). A política `articles_update_jornalista` aceita a linha antiga com `changes_requested`, mas o `with check` só aceita `status in ('draft','in_review')` (`0002_rls.sql:159-161`), e `studio_save_draft` mantém o status (`0017:88`). Reproduzido como Rafael (autor) na seed `c2000000-…-024`: `ERROR: new row violates row-level security policy for table "articles"`. O editor mostra o formulário editável (`canEdit` é verdadeiro) e o salvar devolve "sem permissão".
- Correção: incluir `changes_requested` no `with check` do jornalista, ou fazer `saveDraft` do autor levar `changes_requested → draft`. Teste de integração "jornalista salva após ajuste pedido" (hoje ausente).

**5. FKs do P4 para `profiles` sem regra de `on delete` impedem para sempre a exclusão de conta de ex-integrante da equipe (LGPD).**
- Cinco colunas: `articles.assignee_id` (`0016:8`), `article_suggestions.decided_by` (`0017:28`), `corrections.handled_by` (`0019:18`), `event_submissions.decided_by` (`0022:13`), `reports.responded_by` (`0022:22`). Todas com `confdeltype='a'` (NO ACTION), conferido em `pg_constraint`.
- Reproduzido: Carlos (moderador) responde uma denúncia, perde o papel e pede exclusão há 10 dias; `purge_deleted_accounts(7)` devolve 0 e o perfil continua lá. Desde 0021 o laço isola cada conta (`exception when others` grava `account.delete_failed` com o sqlstate), então os outros leitores não travam, mas essa pessoa nunca é excluída e o job falha todo dia.
- Correção proposta (migration 0023):
  ```sql
  alter table articles drop constraint articles_assignee_id_fkey,
    add constraint articles_assignee_id_fkey foreign key (assignee_id) references profiles(id) on delete set null;
  alter table article_suggestions drop constraint article_suggestions_decided_by_fkey,
    add constraint article_suggestions_decided_by_fkey foreign key (decided_by) references profiles(id) on delete set null;
  alter table corrections drop constraint corrections_handled_by_fkey,
    add constraint corrections_handled_by_fkey foreign key (handled_by) references profiles(id) on delete set null;
  alter table event_submissions drop constraint event_submissions_decided_by_fkey,
    add constraint event_submissions_decided_by_fkey foreign key (decided_by) references profiles(id) on delete set null;
  alter table reports drop constraint reports_responded_by_fkey,
    add constraint reports_responded_by_fkey foreign key (responded_by) references profiles(id) on delete set null;
  ```
- Por que `set null` e não `cascade`: apagar a correção publicada, a denúncia ou a sugestão destruiria registro editorial público. Por que não `restrict`: continuaria bloqueando a LGPD. A responsabilização fica preservada em `audit_log.actor` (uuid em texto, sem FK, imutável) e em `article_versions.author_id` (sem FK).
- Complementos:
  - (a) `field_origins` guarda `editedByName`/`acceptedByName` (`save.ts:230`, `save.ts:313`) em texto. O purge deve reescrever esses nomes para "Ex-integrante da redação", ou a tela deve resolver o nome pelo id em vez de gravá-lo.
  - (b) Teste de regressão em `rls-hardening.test.ts`: `select conrelid::regclass from pg_constraint where confrelid='profiles'::regclass and confdeltype='a' and conrelid <> 'user_roles'::regclass` deve voltar vazio. Com isso a próxima FK nova quebra o CI.
  - (c) Teste de integração do purge com ex-moderador que respondeu denúncia.

**6. O Estúdio grava campos obrigatórios que o portal ignora.**
- Destinos (E06): `publish_destinations` é gravado (`publish.ts:51`) mas nenhuma consulta pública filtra por ele. `home.ts` e `sections` não o leem; o único leitor é `currentHeadline` do próprio Estúdio (`studio-article.ts:401`). Desmarcar "home" não tira a matéria da home.
- Texto alternativo: o checklist exige alt em toda imagem (`checklist.ts:175-179`), mas o portal renderiza `alt: ""` fixo (`src/lib/db/queries/articles.ts:164`) e nem seleciona `article_media.alt` (`:132-135`). A imagem vira decorativa para leitor de tela.
- SEO: o checklist exige título e descrição de SEO (`checklist.ts:180-187`), mas `generateMetadata` da matéria usa `title` e `dek` (`src/app/(public)/materia/[slug]/page.tsx:59-68`).
- Correção: ler `alt`, `seo_title`/`seo_description` e `publish_destinations` nas consultas públicas (home e editoria filtram por destino), ou, se for adiado, registrar A-### e tirar do checklist o que não tem efeito.

**7. Remoção de reprodução em 24 h (CLAUDE.md §5.11, mitigação do B-002) não tem entrada no Estúdio, e "Aprovar" desfaz um bloqueio.**
- `takedownReproduction` (`src/lib/media/takedown.ts:18`) não tem chamador em `src/`. O "Bloquear" do E10 (`media.ts:67-82`) só muda status: não apaga a cópia do Storage, não bloqueia a URL de origem, não oferece opt-out do veículo.
- `approveImage` (`media.ts:44-58`) aprova qualquer estado. Limpa `removed_at`/`removal_reason` de imagem bloqueada por takedown ou por "Licença vencida" sem conferir `license_until` nem `kind='reproduction'`/flag. Uma imagem vencida volta ao portal com um clique.
- Correção: no E10, para `kind='reproduction'`, "Remover (pedido do veículo)" chama `takedownReproduction` (e o opt-out por fonte). `approveImage` recusa `license_until < hoje` e recusa reaprovar asset com `removal_reason` de takedown.

**8. `studio_queue_reader_email` aceita qualquer destinatário e qualquer corpo.**
- `0022:30-54`: `p_to` vem do chamador, e `p_ref` só é validado por regex (não confere que a sugestão ou denúncia existe, nem que o e-mail é o dela). Qualquer `editor` de qualquer editoria (a função usa `has_any_role('{editor_chefe,editor,moderador}')`, mais largo que o `article.publish`/`agenda` da ação) ou moderador pode enfileirar `report_response` com texto livre para qualquer endereço. Quando o provedor existir (B-005), vira relay de e-mail do domínio.
- Correção: a função recebe só `(p_kind, p_ref, p_body)` e busca `contact_email` em `event_submissions`/`reports` pelo id da ref (falha se não existir); papel conforme o tipo (`reports.moderate` para denúncia; `agenda` para sugestão).

**9. `studio_audit` aceita gravação ilimitada de conta de leitor numa tabela imutável.**
- `0015:27-29`: qualquer `authenticated`, inclusive leitor com conta gratuita, pode chamar `studio_audit(uid, 'x.denied', …, details ≤ 16 KB)` quantas vezes quiser. `audit_log` não aceita `delete` (trigger de 0001), então lixo ou volume não se limpa. A equipe também pode gravar nomes de ação arbitrários em nome próprio (ex.: `rules.approve`).
- Correção: `p_action` em lista fechada (as ações de `ACTIONS` + `auditAs` conhecidos, com sufixo `.denied` opcional); para não-equipe, `details` pequeno (≤ 1 KB) e limite por usuário/minuto (a tabela `rate_limits` de 0003 já existe).

### Menores

10. **Agendadas publicadas pelo pg_cron não invalidam cache.** O pg_cron roda a cada minuto (`0018:37-43`) e quase sempre vence o tick. `publishDueScheduled` (`publish.ts:98-112`, `tick/route.ts:17`) quase nunca encontra linha para revalidar. Home e editoria esperam o ISR (60 s), a matéria e o histórico até 300 s, e um 404 já em cache da matéria agendada pode durar até 300 s. Documentado como aceitável no P4.md, mas o comentário "o tick invalida" é enganoso. Sugestão: o job do pg_cron chamar a rota do tick via `pg_net`, ou gravar os ids publicados numa fila que o tick consome.
11. **Histórico público perde a versão publicada das agendadas.** `publish_due_scheduled` põe `published_at = scheduled_for` (`0018:24`), mas a versão foi gravada na hora do agendamento, antes. `public_article_versions` só mostra `created_at >= published_at - 1 min` (`0008_portal.sql:71`). Gravar a versão em `publish_due_scheduled` ou usar `scheduled_for` no filtro.
12. **Publicar não é atômico.** `publishArticle` faz o UPDATE de status e depois calcula `max(number)+1` e insere a versão (`publish.ts:44-76`). Um salvamento concorrente colide com `unique(article_id, number)`: a matéria fica publicada, a ação lança erro genérico e não grava auditoria (`action.ts:205` fica depois). Também não recebe versão base: publica o que estiver salvo, não o que a pessoa revisou. Mover para uma função `studio_publish(p_id, p_base, …)`.
13. **Outras sequências não atômicas:** `updateSources` apaga e insere (`review.ts:285-297`), e se o insert falha a matéria fica sem fontes; em matéria publicada muda as fontes públicas sem Atualização. O mesmo em `replaceImage` (`media.ts:107-116`). `approveSubmission` e `respondReport` atualizam sem `.eq("status","pending"|"open")` (`moderation.ts:79-87`, `:154-162`): cliques concorrentes criam dois `event_listings` ou duas respostas.
14. **Matéria agendada continua editável** (`save.ts:210` só recusa published/updated), e `publish_due_scheduled` publica sem refazer o checklist. Refazer o checklist no vencimento ou exigir reagendar depois de editar.
15. **`mediaScope` é não determinístico** (`media.ts:19-25`: `limit(1)` sem ordem). Imagem usada em duas editorias pode ser aprovada ou bloqueada pelo editor de só uma delas (a RLS `can_approve_media` aceita qualquer vínculo).
16. **`openCorrection` não confere que `reportId` pertence à mesma matéria** (`corrections.ts:30-51`). O snapshot da versão de correção guarda só título, linha fina e corpo (`0019:101`), então o E05 compara snapshots de formatos diferentes.
17. **Estados de erro do Estúdio:** `fila/[id]`, `materias/[id]`, `versoes`, `midia/[id]`, `correcoes/[id]` não têm `try/catch` nem `src/app/estudio/error.tsx`. Uma falha de banco cai no `app/error.tsx` raiz, fora do shell do Estúdio.
18. **Lotes abrem sessão por item:** `batch` (`queue.ts:123-135`) chama a ação 100 vezes, cada uma com `getUser()` + leitura de papéis. Resolver a sessão uma vez.
19. **Negação sem rastro quando a RLS esconde o objeto:** leitor chamando `publishArticle` num rascunho recebe `not_found` (`action.ts:182-183`), sem `.denied`. O Review Focus 2 (jornalista) está coberto; leitor, não.
20. **`assign` aceita qualquer `profiles.id`** (`queue.ts:74-91`), inclusive leitor, como responsável.

## Recomendações

- Levar as invariantes editoriais para o banco (achados 2, 3, 12): funções security definer `studio_publish`, `studio_publish_update` e `studio_publish_correction` como único caminho para status público e para versões `update`/`correction`, com trigger que recusa o resto. A camada TS continua dando mensagem e auditoria; o banco garante.
- Um teste de integração por papel × tabela "chamada PostgREST direta" (editor, revisor, jornalista, moderador) em `rls-hardening.test.ts`, com os casos reproduzidos acima.
- Rodar `pnpm install && pnpm verify && pnpm test:e2e && pnpm test:a11y` nesta checkout (o worktree `cn-p4` tinha dependências que esta não tem).

## Deixado de lado (fora do plano/spec ou de outra fase)

- Busca global Ctrl K, notificações e troca de plantão do shell: fora das tarefas P4 (declarado no P4.md).
- "3 opções" e "salvar no acervo com proveniência" do E12: degradado sem gerador (A-038/B-008); só conferi a guarda.
- Tela do leitor para `reader_notifications`: declarada pendente no P4.md.
- Push de urgente com 2 aprovações: P5 (A09). Conferi só que o P4 não dispara push.
- Envio real de e-mail (B-005).
- Conteúdo de `docs/reports/P4/` (capturas), `impeccable audit` e axe: não reexecutados nesta revisão.
- Política de moderador × agenda (moderador não aprova nem rejeita sugestão de evento porque a ação exige `article.publish` na `agenda`): decisão documentada no P4.md. Pede A-### formal, não correção.

## Veredito

**Precisa de correções antes de fechar a fase.** A arquitetura de guardas (studioAction + requireRole + RLS + auditoria) é sólida e bem testada no caminho feliz. Mas:

- O B-015, que o P4 devia fechar, continua aberto.
- Invariantes centrais da publicação (publicada só muda por Atualização/Correção, revisor só pela função, versões e rótulos de origem não forjáveis) só valem na camada TS e caem numa chamada PostgREST direta.
- "Reprocessar" despublica em silêncio.
- O ciclo "Pedir ajuste" do jornalista está quebrado.
- As FKs novas bloqueiam a exclusão LGPD de ex-integrantes.

Corrigir 1–5 é obrigatório. 6–9 devem entrar no gate ou virar A-###/B-### explícitos. Os menores podem ir para o relatório.
