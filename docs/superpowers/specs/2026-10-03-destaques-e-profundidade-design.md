# Destaques gerenciáveis, matéria mais funda e barra de ações enxuta — design

Data: 03/10/2026. Origem: pedido do dono (três frentes) com autonomia total para decidir e registrar rulings. Esta spec é filha da spec mestre (`2026-09-27-citynews-design.md`) e da de UI pública (`2026-10-02-ui-publica-design.md`); em conflito, valem as duas.

## 1. Entendimento (o que o dono pediu)

1. **Barra de ações da matéria desproporcional**: a área de botões é maior que o conteúdo da matéria.
2. **Matérias curtas demais**: devem ser maiores, com texto adicional quando preciso, gerando a matéria com base nas demais fontes do assunto. "Poucas linhas não faz nenhum sentido."
3. **Destaque que não troca a cada reload**, com gestão pelo admin: escolher a matéria em destaque e por quanto tempo; posições de destaque em todas as páginas, geridas pelo admin.

Sucesso: (1) a barra cabe em uma linha de altura de botão pequeno em 1280 px e em no máximo duas linhas em 390 px, sempre menor que o resumo da matéria; (2) matéria com material suficiente sai com 350 a 600 palavras e nunca publica sozinha abaixo de 250; (3) o destaque de cada posição só muda por ação do admin, por fim do prazo ou por urgência; sem ação, é estável por janela fixa.

## 2. Achados (código atual)

- Lead da home = a matéria não patrocinada mais recente por `published_at` (`home.ts:174`). Sem aleatoriedade, sem fixação; troca a cada publicação do pipeline (a cada 30 min) e a cada expiração do cache de 60 s. Nada em `articles` marca destaque. Editorias: a primeira da lista é o destaque. `/explorar`: ordena por `position`.
- Admin: só há `home_layouts` (módulos da home, `site.manage`), sem controle da manchete.
- Barra de ações: grupo inline em `materia/[slug]/page.tsx:196-216`, dentro de `max-w-read`; 4 botões `md` (44 px, `px-5`) quebram em 2 linhas; `SaveButton` ainda injeta `aria-live` com `basis-full`.
- Texto: `write.ts` pede 4 a 8 parágrafos, mas só recebe `EXCERPT_MAX = 1500` caracteres por item; com uma fonte o corpo sai curto.

## 3. Rulings

- **R1 Janela estável (sem escrita no banco).** O destaque automático de cada posição é calculado por janela de 3 h (fuso America/Cuiaba, múltiplos de 3 h a partir de 00h). Candidatas = matérias publicadas **antes do início da janela**, nos últimos 2 dias; vence a de maior pontuação (confiança, editoria, recência). O conjunto de candidatas é constante dentro da janela, logo o lead não muda entre reloads. Urgência (já existente) continua passando na frente.
- **R2 Pino manual.** O admin pina uma matéria numa posição por um prazo (1 h, 3 h, 6 h, 12 h, 24 h, 3 dias ou data/hora final). Pino manual ativo vence o automático. Ao expirar, volta ao automático. Matéria patrocinada, rascunho ou despublicada nunca ocupa posição; se a matéria pinada sai do ar, a posição cai no automático e o admin é avisado.
- **R3 Posições (slots).** Cadastro em tabela, não em código: `home.lead` (1), `home.destaques` (3), `editoria.lead` (1 por editoria), `explorar.topo` (1). Cada posição tem `capacidade`, `rótulo` e `página`. Novas posições entram por migration/seed sem mudar o código das páginas.
- **R4 Permissão e trilha.** `site.manage` (admin) e `editor_chefe` gerem destaques; toda ação grava auditoria (`featured.pin`, `featured.unpin`, `featured.update`); modo leitura bloqueia. Mudança invalida a tag de cache `home` e `section:<slug>` na hora.
- **R5 Barra de ações.** Ações principais em botões `sm` (36 px): Salvar (destaque), Compartilhar, Ajustar leitura; "Informar problema" vira link de texto discreto no fim do painel "Como esta matéria foi feita" e no rodapé da matéria. O estado "Salvo. Ver favoritos" aparece como status abaixo da barra sem mudar a altura dos botões. O contêiner deixa de ser limitado à coluna de leitura. Alvos de toque continuam ≥ 44 px na área clicável (padding invisível), sem aumentar o visual.
- **R6 Profundidade do texto.**
  1. `enrich` passa a extrair também o **corpo da página** (parágrafos do `<article>`/`main`, sanitizado, até 8.000 caracteres) em `collected_items.body_text`; só em fonte com `consumption.enrich = true`, respeitando robots, termos e limites já existentes.
  2. `write` recebe até 3.500 caracteres por item (fonte primária primeiro) dentro de um teto de 14.000 por matéria, mais **itens de contexto** do mesmo assunto (todas as fontes, inclusive duplicadas), e pede 5 a 9 parágrafos, 350 a 600 palavras, com "Contexto" e "O que não se sabe" quando houver lacuna.
  3. Guarda de tamanho: abaixo de 250 palavras com material suficiente, 1 nova tentativa pedindo expansão; continuando abaixo, a matéria fica **em revisão** (`short_body`), nunca publica sozinha. Sem material suficiente, a matéria curta fica como breve só se a editoria permitir (`minBodyWords` nas regras, padrão 250; "agenda" e "serviço" 120).
  4. A regra "agregado não é republicado" continua: o texto é do CityNews, com `copyGuard` de 8 palavras, citação por item e "Feito a partir de n fontes".
  5. **Aprofundar** matérias já publicadas e curtas (< 250 palavras, sem edição humana): ação no Control Center que reprocessa `enrich` e `write` e grava nova versão (`updated`), registrada no histórico; limite de lote 20.
- **R7 Sem texto de IA na tela pública** e vocabulário da §4.1 da spec de UI valem para tudo isto.

### Emenda de 03/10/2026 — pauta quente (pedido do dono)

O dono pediu: quando uma matéria for quente ou estiver em destaque nos outros portais, o CityNews acompanha automaticamente; se **pelo menos 3 portais locais** destacam o mesmo assunto, ele reflete aqui com a mesma lógica. A automação atual continua; o admin só acrescenta destaque manual.

- **R8 Ordem de precedência por posição:** (1) pino manual do admin; (2) pauta quente (automática, por sinal dos portais); (3) automático por janela de 3 h (R1). Urgência continua na frente de tudo na home, como hoje. O admin pode dispensar uma pauta quente (fica registrado) e pode desligar a pauta quente inteira no Interruptores (`hot_featured_enabled`, ligado por padrão).
- **R9 Sinal de destaque dos portais:** um passo novo `frontpage` lê a página inicial de cada fonte ativa com `consumption.frontpage = true` (GET identificado como CityNewsBot, respeitando `robots.txt`, termos e o limite por hora da fonte, a cada 20 min) e extrai os primeiros 3 links de matéria do topo da página (dentro de `main`/primeiro bloco, na ordem do documento, só do domínio da fonte). Cada link casado com um item coletado (URL canônica) vira um sinal `(topic, source, rank, seen_at)`. Nada da página é guardado além do link e da posição.
- **R10 Pauta quente:** um assunto é quente quando ≥ **3 fontes locais distintas** o mantêm no topo (rank ≤ 3) dentro de **6 h**; limite configurável (`hot_min_sources`, padrão 3). Sem sinal direto (fonte sem `frontpage`), conta como apoio uma cobertura simultânea de ≥ 3 fontes distintas do mesmo assunto em 3 h, mas **sozinha só eleva a pontuação** e nunca fixa. Segurança e *breaking news* continuam sujeitas às regras de publicação (CLAUDE.md §5.8): a pauta quente só eleva matéria **já publicada**, nunca publica nem tira de revisão.
- **R11 Histerese:** quando um assunto vira quente e tem matéria publicada, o pipeline grava um pino `kind = 'hot'` por 3 h (renovável enquanto o sinal durar, teto de 12 h). Ocupa `home.lead` (a melhor matéria publicada do assunto), `editoria.lead` da editoria dela e, se houver vaga, `home.destaques`. Sem matéria publicada do assunto, nada é pinado e o assunto segue o fluxo normal até a matéria sair.
- **R12 Rótulo e transparência:** o admin vê "Em alta · 4 portais" no quadro; ao público aparece só "Em alta em Cuiabá" (sem citar quais portais). Sem texto de IA.

## 4. Arquitetura

- Banco (migrations 0053 e 0054): `featured_slots`, `featured_items` (manual, com `starts_at`, `ends_at`, `position`, `slot_key`, `section_slug` opcional, `article_id`, `created_by`, `note`, `ended_at`), RLS pública de leitura só das linhas ativas e de matéria publicada, escrita só por função com checagem de papel; coluna `collected_items.body_text`.
- Domínio puro `src/lib/featured/`: `windowStart(now)`, `scoreArticle`, `pickAutomatic`, `resolveSlot({slot, manual, candidates, now})`, `validatePin` (prazo, matéria elegível, capacidade). Testado primeiro.
- Consultas `src/lib/db/queries/featured.ts` e integração em `home.ts`, `sections.ts`, `explore.ts`: cada uma pede ao `resolveSlot` e cai no comportamento atual se a tabela estiver vazia ou falhar.
- Admin `src/app/estudio/admin/destaques/` (`studioAction`): quadro com cada posição, ocupante atual (manual ou automático e até quando), busca de matéria, prazo, remover antes do fim, reordenar `home.destaques`, histórico e pré-visualização.
- Pipeline: `enrich` (corpo), `write` (contexto, tamanho, nova tentativa), `reprocess` (aprofundar).

## 5. Estados, erros e testes

Cada tela: carregando, vazio ("Sem pino: o automático ocupa até 15h"), erro, sucesso. Erros de domínio como `Result`. Testes: unidade do domínio (janela nas bordas 00h, 03h, virada de dia, fuso), integração das consultas com banco, e2e do admin (pinar, expirar, remover), e2e de estabilidade (dois reloads seguidos trazem o mesmo lead), e2e da barra (altura e linhas em 360, 390, 800 e 1280), unidade do `write` (tamanho, nova tentativa, `short_body`), axe nas telas novas.

## 6. Fora do escopo agora

Agendamento recorrente de pinos, A/B de manchete, destaque por segmento de leitor, e posições dentro de newsletter.
