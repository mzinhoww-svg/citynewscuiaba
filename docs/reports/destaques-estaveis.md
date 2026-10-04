# Destaques estáveis por posição (FD-T1 a FD-T4)

Data: 04/10/2026. Plano: `docs/superpowers/plans/2026-10-03-destaques-e-profundidade.md` (seção FD). Spec:
`docs/superpowers/specs/2026-10-03-destaques-e-profundidade-design.md`. Respostas do dono: rodada 3
(`2026-10-03-respostas-do-dono-rodada-3.md`), que valem sobre o plano onde divergem: R28, R39 e R40.

## O que mudou para quem lê e para quem edita

- A manchete da home (e o destaque de cada editoria e do Explorar) deixou de trocar a cada publicação. Dois
  carregamentos seguidos trazem a mesma matéria.
- Toda matéria em destaque tem capa aprovada (foto, reprodução com crédito ou ilustração aprovada). Candidata sem
  capa é pulada e a busca de imagem dela entra na fila de mídia.
- "Assuntos em destaque" nunca repete o que está acima (manchete, destaques, Agora) e só mostra assunto com foto no
  card. Módulo sem item novo some.
- A administração (admin e editor-chefe) fixa, troca, remove e reordena matérias em `/estudio/admin/destaques`,
  com histórico dos últimos 30 pinos.

## Regras implementadas

| Regra | Como ficou |
|---|---|
| R28 (dono) | Automático dura 1 h; matéria muito relevante (pontuação >= 0,75 na janela de 3 h) segura a posição por 3 h. Manual fica até remover (`ends_at` nulo); prazo opcional de 1 h, 3 h, 6 h, 12 h, 24 h, 3 dias ou data final (até 14 dias). |
| R39 (dono) | `Candidate.hasCover` obrigatório no seletor e na resolução. Pino cuja matéria perdeu a capa cai no automático com aviso. Pino manual sem capa é bloqueado no formulário e no banco (`featured:no_cover`). Sem nenhuma capa na lista, a home usa a mais recente com capa e, em último caso, a mais recente sem capa (ver preocupações). |
| R40 (dono) | `createUsed()` (registro de já exibidos por matéria e por assunto) alimenta, na ordem, urgência, manchete, destaques, Agora e os módulos abaixo na ordem publicada do layout (assuntos, editorias, mais lidas). |
| Regional (R20 a R23) | Pontuação multiplica por 1,0 (cuiaba), 0,8 (mt) e 0,6 (nacional com comoção); nacional sem comoção vale 0. Nacional com comoção ocupa no máximo uma vaga e nunca a única, havendo matéria local com capa. |
| Precedência (R8) | manual > quente (gancho `hot`, vazio) > automático. |

## Arquitetura

- Domínio puro `src/lib/featured/` (`window`, `score`, `resolve`, `validate`, `cover`, `used`, `labels`, `types`).
  `windowStart(now, hours = 1)` e `windowEnd` em America/Cuiaba. A pontuação mede o frescor a partir do início da
  janela, não de `now`, por isso o resultado não muda dentro dela.
- Banco, migration `0090_featured.sql`: `featured_slots`, `featured_items` (RLS: leitura pública só de pino ativo de
  matéria publicada e não patrocinada; equipe vê tudo), trigger de capacidade, funções `featured_pin`, `featured_unpin`
  e `featured_reorder` (security definer, papel admin ou editor_chefe, sem DELETE: remover grava `ended_at`),
  `featured_has_cover`, `featured_request_images` (R39) e a tabela interna `featured_image_requests`.
- Consultas: `src/lib/db/queries/featured.ts` (`getFeatured`, nunca lança; tabela vazia ou falha devolve `items: []` e
  a página cai no comportamento anterior). `home.ts`, `sections.ts` (`SectionPage.featured`) e `explore.ts`
  (`ExploreData.featured`) usam as posições.
- Estúdio: `src/lib/studio/featured.ts` (`pinArticle`, `unpin`, `reorder`, `searchEligibleArticles`, `currentBoard`,
  `pinHistory`) via `studioAction("featured.manage", ...)` com auditoria `featured.pin|unpin|update` e invalidação das
  tags `home`, `explore` e `section:<slug>`. Tela em `src/app/estudio/admin/destaques/` com componentes em
  `src/components/studio/featured/` e textos em `src/content/pt-BR/featured.ts`.
- Permissão nova `featured.manage` (admin e editor_chefe) em `src/lib/auth/permissions.ts`.

## Decisões tomadas por mim (registrar em DECISIONS.md pelo orquestrador)

1. **Janela de 1 h / 3 h no lugar das 3 h fixas** da spec, por causa da R28. Duas camadas: a candidata muito relevante
   segura a vaga até o fim da janela de 3 h; as demais vagas trocam a cada hora. `RELEVANT_SCORE = 0,75`;
   pontuação = 0,45 confiança + 0,20 fontes (até 4) + 0,20 frescor (48 h) + 0,15 peso da editoria, vezes o fator regional.
2. **Manual sem prazo por padrão** (R28). A spec dizia "prazos 1 h a 3 dias"; o botão "Até remover" é o padrão e os
   prazos viram opcionais. Remover pino sem prazo ou com mais de 24 h restantes pede digitar REMOVER.
3. **Permissão `featured.manage`** (nova ação) em vez de `site.manage`, como no brief; mesma matriz.
4. **Sem página 403**: o Estúdio manda quem não tem permissão para `/entrar?next=...&motivo=sem-permissao` (padrão do
   projeto). O e2e confere isso para a jornalista.
5. **Lista de ações de auditoria do banco por união dinâmica** (`do $$ ... $$` na 0090): lê `studio_audit_actions()`
   e acrescenta `featured.manage|pin|unpin|update`, em vez de repetir a lista inteira. Evita apagar nomes de outras
   frentes que mexem na mesma função em paralelo.
6. **`featured_request_images` executável por anon** (security definer): é o único jeito de a página pública pedir a
   busca de imagem sem usar service role no render público. Só enfileira matéria publicada, sem capa, não
   patrocinada, no máximo 5 por chamada e uma vez por matéria a cada 3 h. A lista de funções anon do teste de
   segurança (`tests/security/rls.test.ts`) foi atualizada de propósito.
7. **`home.destaques` virou um bloco "Em destaque"** na home (até 3 cartões com foto; 1 no celular), logo abaixo de
   manchete e Agora, porque o plano cadastra a posição mas a home não tinha onde mostrá-la. Prioridade no registro:
   manchete, destaques, Agora, módulos.
8. **`PinForm` e `FeaturedBoard` recebem as Server Actions por props** (`FeaturedApi`), como o editor de módulos da
   home. Componentes de UI não conhecem o banco.
9. **`TopicView.cover`** (opcional): o card de assunto mostra a foto da capa de uma matéria dele quando existe. Fora da
   home ninguém preenche, então Explorar e `/assuntos` seguem sem foto.

## Testes

- Domínio: `src/lib/featured/*.test.ts` (janela nas bordas 00h, 03h, virada de dia e fuso; resolução; seletor com
  capa; validação; registro de já exibidos; rótulos).
- Consultas: `src/lib/db/queries/featured.test.ts` (banco fictício: pino manual, estabilidade dentro da janela,
  R39 e pedido de imagem, `exclude`, falha da tabela) e `home.test.ts` (assuntos com capa e sem repetição).
- Estúdio: `src/lib/studio/featured.test.ts` (forbidden, modo leitura, prazo inválido, sucesso com auditoria e tags,
  `unpin` sem DELETE, busca só publicadas não patrocinadas, quadro).
- Componentes: `src/components/studio/featured/featured.test.tsx` (vazio, automático, manual, aviso de pino caído,
  remover com e sem digitação, reordenar, formulário com busca, bloqueio sem capa, prévia, erro, histórico) e
  `cards.test.tsx` (card de assunto com foto).
- Integração: `tests/integration/featured.test.ts` (RLS, papéis, prazo, capacidade, sem capa, `ended_at`, reordenar,
  fila de imagem), `queries.test.ts` e `tests/security/rls.test.ts` ajustados.
- e2e: `tests/e2e/featured-public.spec.ts` (mesma manchete, manchete com capa e pedido de imagem, assuntos sem
  repetir a manchete e com foto, pino na home e na editoria com urgência na frente), `tests/e2e/admin-featured.spec.ts`
  (fixar pelo teclado, remover, digitar REMOVER, sem capa bloqueada, reordenar, permissão) e
  `tests/a11y/admin-featured.spec.ts` (axe em 390 e 1280 px, claro e escuro, com os diálogos abertos). A rota entrou em
  `tests/a11y/routes.ts`.
- As mutações dos e2e rodam só no projeto desktop e se revezam por um cadeado de arquivo
  (`tests/e2e/helpers/featured.ts`), porque as posições são globais.

## Como operar

- Fixar: Estúdio, Administração, Destaques, "Fixar matéria" na posição; buscar por título, escolher, prazo, Fixar.
- Matéria sem capa aparece com aviso e não pode ser escolhida; aprove uma imagem na mídia primeiro.
- Uma fixação cuja matéria saiu do ar (ou perdeu a capa) deixa de aparecer na página e vira aviso no quadro, com
  "Trocar".

## Preocupações

1. **Seed sem capas.** O seed local não tem foto aprovada em matéria publicada. Nele a home cai no comportamento
   anterior (manchete mais recente, com cabeçalho tipográfico) e os assuntos somem. Em produção, a R39 estrita só vale
   quando há capas; se uma edição inteira estiver sem capa, a manchete sai sem foto em vez de a home ficar vazia.
   Decisão sua: preferir home vazia ao cartão tipográfico?
2. **Cache de 60 s da home.** Mudança direta no banco só aparece depois que o cache de dados vence; a ação do admin
   invalida a tag na hora. Os e2e que fixam pelo banco esperam até 90 s.
3. **Tipos do banco à mão.** `pnpm db:types` não funciona sem Docker aqui; `src/lib/db/types.ts` ganhou as tabelas e
   funções da 0090 por edição manual (conflito provável com outras frentes que também editem o arquivo).
4. **`studio_audit_actions()`** é refeita por união dinâmica na 0090. Migrations de outras frentes numeradas depois da
   0090 que recriem a lista inteira apagariam as quatro ações novas.
5. **Home mais curta.** Com o registro de já exibidos, "Mais lidas" e os blocos de editoria levam só matéria nova; num
   portal de poucas matérias aparecem menos itens (ou o bloco some). `queries.test.ts` foi ajustado para isso.
6. **Execução da suíte completa.** A máquina estava dividida com outras frentes; a suíte completa foi rodada por
   projeto (unit, scripts, integration, security) e não num único `pnpm test`.
