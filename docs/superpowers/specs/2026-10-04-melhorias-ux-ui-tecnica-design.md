# Melhorias de usabilidade, UX, UI, design e técnica (portal e Estúdio)

**Data:** 04/10/2026 · **Origem:** auditoria em quatro frentes (portal, Estúdio, design system e acessibilidade, técnica) feita em 04/10/2026 · **Aprovação do dono:** itens 1 a 93 (mensagem "Gere o plano" depois da lista numerada); 94 e 95 fora.

## Objetivo

Deixar o portal mais legível e confortável no celular (cena do PRODUCT.md: leitor no ponto de ônibus, sol forte) e o Estúdio mais rápido e seguro para quem edita, sem mudar nenhuma regra de produto do CLAUDE.md §5. Corrigir os defeitos que já afetam o usuário, completar o design system para que cada tela pare de reinventar componentes, e religar o sinal de performance.

## Fora do escopo

- 94 · HTML estático/PPR no portal (T-04): vira um spike separado.
- 95 · Divisão de arquivos grandes (T-14): só quando uma tarefa já tocar o arquivo.
- Qualquer mudança de regra editorial, de publicação ou de vocabulário público (§5). Textos novos seguem `src/content/vocabulary.test.ts`.

## Entrega

Cinco ondas, um PR por onda, CI verde antes do merge. Dentro de cada onda, tarefas com arquivos disjuntos rodam em paralelo (subagentes em worktrees isoladas, integradas no branch da onda).

| Onda | Conteúdo | Depende de |
|---|---|---|
| W1 | Erros e riscos (itens 1–24) | — |
| W2 | Fundações do design system (25–44) | W1 |
| W3 | Fluxos do Estúdio (45–61) | W2 |
| W4 | Portal (62–77) | W2 (paralela a W3) |
| W5 | Performance e técnica (78–93) | W3 e W4 |

## Itens e critério de aceite

Severidade: A alta, M média, B baixa. A referência entre parênteses é o achado da auditoria.

### W1 · Erros e riscos

| # | Item | Aceite |
|---|---|---|
| 1 | Hover do modo escuro (D-01) | Token `--surface-hover` com valor claro e escuro; nenhuma classe `hover:bg-nevoa-2`/`aria-pressed:bg-nevoa-2`/`bg-nevoa-2` em estado interativo; título de card em hover no escuro com contraste ≥ 4,5:1 |
| 2 | Nota "Corrigido" no escuro (D-02) | `--cn-urucum-soft` redefinido no bloco escuro; texto sobre ele ≥ 4,5:1 nos dois temas |
| 3 | Placas Tinta e `themeColor` (D-18) | Placas `bg-tinta` com borda `line-subtle` no escuro; `themeColor` escuro igual a `--bg-page` escuro |
| 4 | Publicar com edição não salva (E-02) | Com o editor alterado, o diálogo de publicação oferece "Salvar e publicar" e nunca publica a versão antiga em silêncio |
| 5 | Recarregar no conflito (E-04) | Antes de recarregar, o texto local fica guardado (rascunho local) e um aviso diz que pode ser restaurado |
| 6 | Campos somente leitura (E-17) | `Select` aceita `disabled`; em modo leitura nenhum campo do editor é editável |
| 7 | Fila corta em 100 (E-05) | "Mostrando N de TOTAL" e "Carregar mais" (cursor na URL); nenhum item some sem aviso |
| 8 | Agenda corta em 100 (P-14) | Mesmo padrão: contagem real e "Carregar mais" |
| 9 | Cor como único sinal no Estúdio (E-06) | "Atrasada" visível (texto + ícone) na fila; dia de hoje no calendário com texto "Hoje" e `aria-current="date"` |
| 10 | Hoje na agenda pública (P-20) | `aria-current="date"` e "hoje" em texto (sr-only aceito) |
| 11 | Banner de consentimento (P-03) | Texto 14 px sem corte (ou corte com "Ler tudo"), link com área de toque ≥ 44 px, botões 14 px |
| 12 | Botão que liga métricas (P-04) | Rótulo diz o que faz: "Aceitar métricas e recomendações" |
| 13 | Ticker (P-01) | Sem movimento automático por padrão; manchetes em caixa de frase, 14 px; se houver rolagem, botão "Pausar" de 44 px |
| 14 | Colunas laterais sob o cabeçalho (P-02) | As 6 colunas fixas usam o mesmo topo derivado de `--h-sticky-public`; nenhuma é coberta pelo cabeçalho |
| 15 | Área segura do iPhone (P-07) | `viewportFit: "cover"`; cabeçalho público com respiro `env(safe-area-inset-top)` |
| 16 | Sinal do Lighthouse (T-01) | Workflow roda também em `push` na `main` e semanalmente; falha aparece como check vermelho (sem `continue-on-error`); orçamento de JS recalibrado com registro em `A-###` e meta de redução na W5 |
| 17 | Relatórios do Lighthouse (T-02) | Artefato publicado (`include-hidden-files: true`); resumo em passo separado com `if: always()` |
| 18 | CSS global fora de camada (D-05, D-20) | Regras globais de foco e `text-wrap` dentro de `@layer base`; `control-field` sem `!important`; `truncate` funciona em `<p>`; `card-link` com um anel só |
| 19 | Tema sensível (E-20) | Revisão e fila usam o mesmo `sensitive` |
| 20 | Tempo real e leitor de tela (E-28) | Região viva anuncia só mudança de estado, não o relógio |
| 21 | Texto do limite do Pergunte (P-18) | Variante sem horário quando não há `retryAt` |
| 22 | Estado do assunto no público (P-28) | `TopicStatus` não é importado por nenhuma tela pública |
| 23 | Regiões vivas mal usadas (P-24) | `UrgentBar` com `role="region"` nomeada; `NowList` sem `aria-live` estático |
| 24 | Ações sensíveis em um clique (E-13) | Revogar admin e ações de segurança pedem confirmação com nome e efeito |

### W2 · Fundações do design system

| # | Item | Aceite |
|---|---|---|
| 25 | Primitivas de formulário (D-03) | `ui/Field` (moldura pública com `describedBy`), `Select` com `size`, `groups` e `disabled`, `TextArea`, `DateField`, `Checkbox`, `RadioGroup`; `NativeSelect` e as constantes `CONTROL` removidas; nenhum `<select>`/`<textarea>` cru fora de `src/components/ui` |
| 26 | Erro ligado ao campo (D-04) | Todo campo com erro tem `aria-invalid` e `aria-describedby` para a mensagem |
| 27 | Foco uniforme (D-13) | `select` e `textarea` com a mesma troca de borda de foco do `TextField` |
| 28 | Alvos de toque (D-14) | Nenhum controle interativo abaixo de 44 px sem `hit-area` |
| 29 | Rótulo de campo (D-10) | `--type-label` em 16 px (R9); zero ocorrências de `type-label text-16`; título do `Dialog` por papel tipográfico |
| 30 | Painel e estatísticas (D-06) | `ui/Panel` e `ui/StatGrid`/`StatTile`; call sites com a string de card migrados |
| 31 | Selo de status (D-07, E-24) | `ui/StatusBadge` com tom e ícone; os três selos viram mapas de dados |
| 32 | Tabela (D-08) | `ui/Table` (legenda obrigatória, região rolável focável, `th scope`, `minWidth` por token); `AdminTable` vira reexport e as tabelas cruas migram |
| 33 | Pílulas e abas por rota (D-09) | `ui/TagLink` e `LinkTabs`; as pílulas feitas à mão migradas |
| 34 | Botão com carregamento (E-16) | `Button loading` (texto "Salvando…", `aria-busy`, desabilitado) e `SubmitButton` com `useFormStatus`; formulários de servidor sem envio duplo |
| 35 | Ação destrutiva (E-12) | Variante `destructive` sólida; diálogos de confirmação com verbo no botão e ordem única (Cancelar à esquerda, ação à direita) |
| 36 | Toast (E-15) | `ui/Toast` + `useToast` com `aria-live`, ação opcional "Desfazer", some sozinho (6 s) e pausa com foco |
| 37 | Popover e menu (D-11) | `ui/Popover` e `ui/Menu`; sino e menus de linha migrados |
| 38 | Gaveta e diálogo (D-12) | `ui/Drawer`; `Dialog` fecha com `close()` e devolve o foco; `aria-describedby`; os 5 diálogos soltos migrados |
| 39 | Região viva persistente (D-15) | `ui/FormStatus` sempre montado; formulários de conta migrados |
| 40 | Lint de aderência (D-16) | Regra cobre `src/app/**`; bloqueia `<select>`/`<textarea>` crus fora de `ui/` e `-nevoa`/`-nevoa-2` em estado interativo |
| 41 | Utilitários (D-17) | `grid-rail`, `pt-safe-top`, larguras de tabela por token |
| 42 | Ícones (D-19) | Escala 14/16/18/20/24 documentada; `color=` inline trocado por classe |
| 43 | Paginação (D-21) | `ui/Pagination`; as 5 cópias migradas; DESIGN §7 atualizado |
| 44 | Detalhes (D-22, E-30, P-26) | Cor do checkbox única; as 3 bordas laterais grossas substituídas por selo ou ícone; esqueletos com `Skeleton` |

### W3 · Fluxos do Estúdio

| # | Item | Aceite |
|---|---|---|
| 45 | Ações ao alcance (E-01) | Abaixo de `xl`, Aprovar/Pedir ajuste/Publicar numa barra fixa no rodapé, com área segura |
| 46 | Revisão em sequência (E-07) | "Aprovar e ir para o próximo" mantendo aba e filtros; "Aprovar recomendadas" em lote (só o que as regras recomendam); aprovação em lote de mídia |
| 47 | Alterações não salvas (E-03) | `useUnsavedGuard` em editor, correção, home, regras e fontes: `beforeunload` e confirmação ao sair por link |
| 48 | Editor (E-18) | Barra de salvar fixa com estado ("Salvo às 14h02", "Alterações não salvas"), rascunho local automático, contador no título |
| 49 | Validação da publicação (E-19) | Agendamento só no futuro, ao menos um destino, erro ligado ao campo |
| 50 | Menu (E-09) | Busca no trilho do desktop; grupos recolhíveis lembrados; subgrupos no Control Center; ícones únicos; Contingência em destaque; "Governança" com um sentido só |
| 51 | Contagens (E-10) | Exceções, denúncias vencidas, aprovações, falhas em quarentena e mídia pendente com contagem no menu e nas abas da fila |
| 52 | Tabelas em cartões (E-11) | Fila, Falhas, Correções e Aprovações com versão em cartões abaixo de `md` |
| 53 | Atalhos (E-08) | j/k, a (aprovar), r (pedir ajuste), Ctrl/⌘+S, / (filtrar), ? (ajuda); ignorados em campos de texto |
| 54 | Falhas (E-21) | Selecionar todas em quarentena, agrupamento por etapa e erro, links para item e execução |
| 55 | Justificativa visível (E-22) | Linha visível ou disclosure, nunca só `title` |
| 56 | Barra de lote (E-23) | Só aparece com seleção; estado da matéria como `StatusBadge` |
| 57 | Moldura de tela (E-25) | `StudioScreen` usada por Redação, Control Center e Administração |
| 58 | Voltar e caminho (E-26) | Links de volta preservam a origem (`?de=`); caminho de navegação nas telas de detalhe |
| 59 | Redação (E-27) | Abas viram "Ver na Fila"; "Publicadas hoje" e "Agendadas" com link |
| 60 | Textos e nomes (E-29) | Textos em `content/pt-BR`; Newsroom → Redação, Playground → Testar prompts, Logs → Registros |
| 61 | Papel de admin (E-14) | Quem tem `users.manage` concede numa ação só, auditada (A-128); o banco aceita a autoaprovação auditada nesse fluxo |

### W4 · Portal

| # | Item | Aceite |
|---|---|---|
| 62 | Barras fixas (P-05) | Fileira de editorias some ao rolar para baixo e volta ao rolar para cima (sem movimento com `prefers-reduced-motion`: só aparece/some) |
| 63 | Convite da primeira visita (P-11) | Aparece no fim da matéria ou na home, compacto, com espaço reservado; nunca cobre o texto |
| 64 | Anúncio fixo (P-12) | Reserva `--cn-ad-h` no rodapé e em `scroll-padding-bottom` |
| 65 | Aba ativa (P-06) | Mapa rota → aba; toda rota pública acende uma aba |
| 66 | Pergunte (P-08) | Entrada no Explorar e no rodapé; nome único "Perguntar ao CityNews" |
| 67 | Âncoras do Explorar (P-09) | Âncoras só para seções renderizadas |
| 68 | Atalhos do Explorar (P-10) | Destino coerente com o texto |
| 69 | "Agora" do cabeçalho (P-13) | Link para `/#agora`; pulsa só na home |
| 70 | Perfil com erro (P-15) | Alerta "Tentar de novo"; sessões e "Sair" continuam |
| 71 | Favoritos (P-16) | Foco vai ao "Desfazer"; aba em `?aba=` |
| 72 | Lista "Agora" (P-17) | Sem separador solto; estado vazio |
| 73 | Panorama (P-19) | Nome da ordenação honesto; botão no vazio; resumo no seletor |
| 74 | Informar problema (P-21) | Uma entrada só |
| 75 | Ações da matéria (P-22) | 44 px e 8 px de folga |
| 76 | Busca no celular (P-25) | Resultados antes da linha do Pergunte |
| 77 | Trilho horizontal (P-27) | `tabIndex` só no modo rolagem; esmaecimento de borda no celular |

### W5 · Performance e técnica

| # | Item | Aceite |
|---|---|---|
| 78 | Imagem quebrada (P-23) | Falha de carregamento mostra o substituto |
| 79 | Imagens responsivas (T-03) | Variantes 480/960/1440 geradas com `sharp` na ingestão e por backfill; `srcset` + `sizes` em `Photo`; manchete com URL direta; `preconnect` à origem do Storage |
| 80 | Home sem cascata (T-05) | No máximo 2 idas sequenciais ao banco por renderização |
| 81 | Matéria (T-06) | Carregadores com `cache()`; `generateMetadata` e página compartilham a leitura; checagem de "removida" uma vez por requisição |
| 82 | Timeout no Supabase (T-07) | Clientes de sessão e service role com `fetch` com timeout (padrão 8 s) |
| 83 | Polling com timeout (T-13) | `fetchJson` com `timeoutMs` usado pelos 4 pollers |
| 84 | N+1 (T-08) | As 5 rotinas trocadas por consulta agrupada ou lote |
| 85 | Bundle do Estúdio (T-09) | zod fora dos chunks de cliente; editor tiptap com `next/dynamic` |
| 86 | /fontes no servidor (T-10) | Lista renderizada no servidor; cliente só com abas e personalização; JS da rota ≤ 20 KB gzip próprios |
| 87 | Carregamento (T-11) | Indicador de navegação pendente no cabeçalho; `role="status"` fora de `aria-busy` |
| 88 | Promessas sem tratamento (T-12) | `act` devolve `Result`; botões mostram erro |
| 89 | Utilitários duplicados (T-16) | `lib/text/fold` e `TIME_ZONE` únicos |
| 90 | Código morto (T-15) | `knip.json` e passo de aviso no CI; barris e reexports mortos removidos |
| 91 | e2e frágil (T-18) | Nenhum `waitForTimeout` novo; os 19 trocados por espera de condição; testes de flags globais em projeto serial |
| 92 | Cobertura do Lighthouse (T-19) | `/agenda`, `/cidade`, `/guia-cuiaba` e um anúncio no seed |
| 93 | Testes de componentes críticos (T-17) | Testes unitários para `RuleProposalForm`, `ApprovalInbox`, `ArticleEditor`, `SearchBox`, `PromptVersions` |

## Restrições

- Regras do CLAUDE.md §5 intocadas; vocabulário público validado por `src/content/vocabulary.test.ts`.
- Só tokens (`tokens.css`/`globals.css`); nenhum hex, px cru ou z-index arbitrário.
- Textos em `src/content/pt-BR/*.ts`, pt-BR, sem exclamação.
- Alvo de toque ≥ 44 px; contraste ≥ 4,5:1 nos dois temas; movimento sempre com `prefers-reduced-motion`.
- Server Components por padrão; `"use client"` só com estado ou evento.
- TDD; `pnpm verify` verde; axe sem violação nas telas tocadas.
- Decisões novas a partir de A-141 em `.planning/DECISIONS.md`.
- Gasto de dinheiro (plano pago de transformação de imagem, por exemplo) é exceção do dono: a W5 usa `sharp`, que já é dependência.
