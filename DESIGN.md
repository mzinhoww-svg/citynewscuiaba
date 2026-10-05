# DESIGN.md · CityNews Cuiabá (v2)

Sistema visual para implementação. Une o **brand kit do Claude Design** (`design-system/`) com as decisões de produto e a auditoria das skills impeccable, design-intelligence e ui-ux-pro-max.

Ordem de autoridade em conflito: **este arquivo** → `src/styles/tokens.css` → `design-system/` (componentes e guidelines) → artboards do canvas. O brand kit é a referência de forma e medida. Este arquivo corrige o que o kit tem de problema de acessibilidade ou de regra de produto.

## 1. O que vem do brand kit (adotado sem mudança)

- Conceito "O Ponto": C aberto + ponto Urucum que marca o agora. A assinatura mestre fica fixa e a linha geográfica muda (Cuiabá, Várzea Grande, Guia Cuiabá).
- Wordmark **CityNews** (CamelCase, como em `design-system/assets/logo/*`). Na interface e nos textos, escreva sempre "CityNews".
- Fontes Schibsted Grotesk (marca, interface, títulos de seção, display) e Source Serif 4 (manchetes e leitura). Arquivos locais em `design-system/fonts/`.
- Medidas do app: frame 375, gutter 24, campo 52, botão 56 em pílula, chip 36, botão de ícone 48, barra inferior 64 + área segura, cards r16/r20, folha inferior r28, miniaturas r12.
- Medidas da web: container 1200, gutter 40, manchete + barra lateral de agenda de 300 px, cabeçalho fixo com "● AGORA". Fotos no site sem raio (r0) e plaquetas r4: tom editorial e sóbrio.
- Sistema plano: cards sem sombra, `--shadow-lg` só para diálogo e folha. Scrim Tinta 48% com blur de 8 px.
- Ícones Lucide com traço 1,5. Nenhum emoji. O único ícone de marca é o Ponto (indicador ao vivo, badge, marcador ativo).
- Voz: vizinho bem informado. Manchete em caixa de frase, sem ponto final, liderada por verbo, até 2 linhas. Eyebrow em caixa alta com +0,08em. Formatos de hora "19h" e "20h30". Separador de metadados `·`.
- Gradiente só de proteção sobre foto (transparente → Tinta 88%).

## 2. Refinamentos sobre o brand kit (obrigatórios)

| # | No brand kit | Problema | Decisão | Token |
|---|---|---|---|---|
| R1 | Papel `#F5F2EC` como fundo de seção, card e campo | Faixa creme é o padrão genérico de IA e esquenta a Tinta fria | Papel fica restrito a marca, impresso e social. A UI usa **Névoa** `#F3F5F8` (oklch 0.969 0.005 258) | `--cn-nevoa` |
| R2 | Linhas `#E4DFD5` e `#ECEAE6`, foto `#E6E1D8` | Mesmo viés quente | `#D5DBE3`, `#E3E7ED`, `#E4E8EE` | `--cn-linha*`, `--cn-foto` |
| R3 | Placeholder `#767B84` | 4,25:1 no branco e 3,81:1 no Papel, reprova AA | `#5F646D` (5,95 branco, 5,45 Névoa) | `--cn-grafite-2` |
| R4 | Campo preenchido de Papel sem borda (`border: transparent`) | Limite do controle invisível, reprova WCAG 1.4.11 | Campo branco com borda `#7D8591` (3,73:1); foco troca a borda para Tinta 2 px e mostra o anel | `--border-control` |
| R5 | `outline: 0` no input e anel de foco `rgba(232,73,29,.35)` | Foco invisível | Anel sólido 3 px Urucum, offset 2, em todo `:focus-visible` | `--focus-ring` |
| R6 | Mostrar senha é `<span role="button">` sem tabindex e sem nome | Inacessível por teclado | `<button type="button" aria-label="Mostrar senha" aria-pressed>` | n/a |
| R7 | `NewsCard` e `FeatureCard` com `onClick` no `<article>` | Card não é link, some da navegação por teclado e do SEO | Título dentro de `<a>`; área do card clicável por pseudo-elemento do link | n/a |
| R8 | `ArticleActionBar` e `MetaRow` com curtidas e comentários (herança do template) | Contradiz a spec D15 (sem comentários no MVP) | Ações: Salvar, Compartilhar, Ajustar leitura, Útil, Informar problema. Metadado mostra fontes e tempo de leitura, nunca contagem de comentários | n/a |
| R9 | Corpo de interface 14 px e leitura 16 px | Pequeno para a cena de uso (sol, em pé, celular) | Interface 16 px, leitura 18 a 20 px, metadado 13 px peso 500 | `--type-body*`, `--type-meta` |
| R10 | Barra inferior com 4 destinos (Início, Buscar, Salvos, Perfil) | Falta Explorar, que dá acesso a Fontes e Agenda | 5 destinos: Início, Explorar, Busca, Favoritos, Perfil | n/a |
| R11 | Sem cores de IA, atenção e urgente; sem modo escuro; sem escala de camadas | Rótulos de origem e estados da IA não têm forma própria | Azul IA com tracejado, Atenção, Urgente, modo escuro ≥ 7:1, escala z-index | `--cn-ia*`, `--cn-atencao*`, `--cn-urgente`, `--z-*` |
| R12 | Logotipos em PNG recortado do PDF (900 px) | Serrilha em telas densas e sem troca de cor | SVGs vetoriais gerados em `design-system/assets/logo/svg/` (horizontal, vertical, símbolo, negativo, mono, Várzea Grande, Guia Cuiabá), com wordmark em contornos. O componente `Logo` usa esses arquivos | n/a |
| R13 | Estilos inline com px nos componentes | Difícil de manter e de tematizar | Portar para TSX com classes e tokens; a regra de aderência do kit (sem hex e px crus) vira regra do ESLint | n/a |
| R14 | Faixa URGENTE sem cor definida | Tinta sobre Urucum dá 4,45:1 | `#EE5A2F` com texto Tinta (5,05:1) | `--cn-urgente` |

Estratégia de cor: **Restrita**. Tinta domina, Névoa e branco são as superfícies, Cerrado e Azul IA são papéis semânticos, Urucum aparece em no máximo 10% da tela.

## 3. Cor e contraste medidos

| Par | Razão |
|---|---|
| Tinta sobre branco / Névoa | 17,28 / 15,83 |
| Grafite (metadado) sobre branco / Névoa | 8,24 / 7,55 |
| Placeholder `#5F646D` sobre branco / Névoa | 5,95 / 5,45 |
| Urucum texto sobre branco / Névoa / Urucum soft | 5,95 / 5,45 / 4,96 |
| Cerrado sobre branco / Névoa / Cerrado soft | 6,40 / 5,86 / 5,28 |
| Erro sobre branco / Névoa | 5,73 / 5,24 |
| Azul IA sobre branco / IA soft | 8,31 / 7,31 |
| Atenção sobre Atenção soft | 6,52 |
| Borda de controle sobre branco / Névoa | 3,73 / 3,41 |
| Tinta sobre Urgente | 5,05 |
| Branco sobre Tinta 80 (pressionado) | 12,79 |
| Modo escuro: texto / metadado / link / IA / serviço | 15,8 / 7,55 / 8,6 / 8,7 / 8,9 |

Qualquer par novo precisa ser medido e registrado aqui.

## 4. Tipografia

| Papel | Token | Valor |
|---|---|---|
| Display ("O que fazer em Cuiabá") | `--type-display` | Grotesk 800, 32 → 56, −0,02em |
| Título de tela | `--type-screen-title` | Grotesk 700, 24 |
| Título de seção | `--type-section` | Grotesk 700, 20 |
| Manchete da matéria | `--type-headline-xl` | Serif 600, 28 → 44 |
| Manchete de card | `--type-headline` / `-md` / `-sm` | Serif 600, 20 → 22 (standard) / 18 (list e compact) / 16 |
| Leitura | `--type-body-read` | Serif 400, 18 → 20, entrelinha 1,65, máx. 68ch |
| Interface | `--type-body` | Grotesk 400, 16 |
| Metadado | `--type-meta` | Grotesk 500, 13 |
| Eyebrow | `--type-eyebrow` | Grotesk 700, 12, caixa alta, +0,08em, Urucum texto |

Regras: `text-wrap: balance` em h1 a h3; `pretty` no corpo; números tabulares em horários e tabelas; letter-spacing nunca abaixo de −0,04em (wordmark) e −0,02em (títulos). A primeira frase do lide vai em negrito.

## 5. Origem e revisão (componente `OriginLabel` e frases)

Vocabulário público aprovado pelo dono (spec `2026-10-02-ui-publica-design.md` §4.1). A leitora vê só **de onde veio** e **quem revisou**. `normalized`, `ai_summary` e `auto_published` seguem como **nomes internos** (dado, `src/lib/labels`, Estúdio e Control Center); nenhuma tela pública os exibe. A função `publicLabels(article)` decide o que aparece.

**Plaqueta** (`OriginLabel`, r4, texto em eyebrow, forma e ícone e texto; cor só reforça). **No máximo 1 por card**, e só estas duas:

| `kind` | Texto | Forma |
|---|---|---|
| `original` | ORIGINAL CITYNEWS | Sólido Tinta, mini-símbolo |
| `aggregated` | AGREGADO · fonte | Contorno Grafite, ícone `external-link` |

**Frases em texto** (linha de metadado, autoria da matéria e painel "Como esta matéria foi feita"), sem plaqueta e sem faixa que agrupe rótulos (`OriginStrip` é proibido):

| Situação | Texto público |
|---|---|
| Texto feito a partir de outras fontes | Feito a partir de n fontes |
| Publicação pelas regras, sem leitura prévia de pessoa | Revisado automaticamente |
| Lida por pessoa da redação | Revisado por {nome} |
| Conteúdo pago | Patrocinado (texto, nunca segunda plaqueta) |
| Imagem de terceiros (legenda da foto) | Reprodução web · Fonte, com crédito |
| Outras imagens (legenda) | Foto original · crédito, Imagem licenciada · banco, Imagem ilustrativa |

O resumo no alto da matéria chama-se "Resumo em poucos segundos", sem rótulo de origem do texto. O painel "Como esta matéria foi feita" explica em linguagem simples de quantas fontes veio, quem revisou e de onde vêm as imagens.

**Não aparecem em nenhuma tela pública:** "normalizado", "resumo por IA", "publicado automaticamente", "gerado por IA" (como rótulo), "inteligência artificial" nem "IA" como rótulo. O assistente chama-se "Perguntar ao CityNews" e, fora do ar, "Assistente indisponível". Exceções: páginas legais (`/privacidade`, `/termos`, `/metodologia`, `/principios-editoriais`, `/como-usamos-ia`, que nos links aparece como "Como funciona o CityNews"), o rótulo de imagem gerada (hoje não há gerador) e o Estúdio. O teste `tests/e2e/vocabulary.spec.ts` vigia as rotas públicas.

As plaquetas ficam em caixa alta por serem eyebrows. É a única exceção à grafia "CityNews".

Complementos: `ConfidenceMeter` (três barras + "Confiança alta/média/baixa"), `TopicStatus` (Em apuração, Confirmado, Corrigido, Encerrado) e `LiveIndicator` do kit ("● AGORA", pulso suave, estático com movimento reduzido).

## 6. Fontes em destaque (adaptação de Popular Media e Favorite of the Week)

- Fileira "Mais acessadas em Cuiabá": `SourceAvatar` do kit em 64 px (mobile) e 72 px (desktop), nome em até 2 linhas, rolagem horizontal com `scroll-snap`.
- Lista "Recomendadas para você": `ListRow` do kit com avatar 40, nome, justificativa em Azul IA e botão Seguir de 44 px. Lista com divisória, não card.
- Grade de exploração (desktop): card branco com hairline, avatar 56, nome, categoria · localidade, justificativa, alcance aproximado ("~18 mil"), tendência 7 dias, matérias hoje e atualização; ações Seguir, Ver matérias e Ocultar.
- Selos PREFERIDA e VERIFICADA em plaqueta de contorno. Nunca "melhor", "top" ou estrelas.
- Avatar sem logotipo licenciado: monograma de 2 letras sobre `--cn-avatar-1..6` (todos ≥ 4,5:1 com branco).

## 7. Inventário de componentes

Inventário real de `src/components` (UX-W2-T15). Tudo se importa de `@/components` (Estúdio: `@/components/estudio`); o ESLint bloqueia import direto das pastas e, fora de `src/components/ui`, `<select>`/`<textarea>` crus e névoa em estado interativo (`hover:`/`aria-pressed:`/`aria-[current=page]:bg-nevoa(-2)`: use `bg-hover`). As exceções documentadas ficam em `eslint.config.mjs` (`RAW_CONTROL_EXCEPTIONS`).

### 7.1 Primitivas (`src/components/ui`)

Formulário:

- **Field** (`FieldShell`, `FieldError`, `describedBy`): moldura de campo com rótulo visível, dica `<id>-dica` e erro `<id>-erro` ligados por `aria-describedby`; use em todo controle que não seja uma das primitivas abaixo.
- **TextField**: entrada de uma linha com a borda de controle (R4); texto, e-mail, URL, número.
- **Select / SelectControl**: lista nativa estilizada; `Select` com rótulo, `SelectControl` só o controle (tabela, rótulo próprio); `size="sm"` compacto, `groups` vira `optgroup`, funciona sem JS em `<form method="get">`.
- **TextArea**: texto longo com a mesma moldura; `maxLength` mostra o contador "n/máx".
- **DateField**: data, data e hora ou hora (`type`), com `min`/`max`, dica e erro.
- **Checkbox**: caixa de 20 px em linha `min-h-tap`, `onChange(boolean)`, dica opcional.
- **RadioGroup**: `fieldset`/`legend` com opções e dica por opção.
- **Toggle**: interruptor de preferência binária com efeito imediato.
- **Slider**: valor contínuo (pesos, limiares) com rótulo e valor visíveis.
- **SegmentedToggle**: 2 a 4 modos mutuamente exclusivos de uma mesma vista.
- **SearchBar**: campo de busca do portal com ícone e limpar.
- **Chip / ChipGroup**: filtro ou escolha rápida em pílula; `ChipGroup` agrupa com rótulo.
- **SubmitButton**: `Button` de envio que lê o `useFormStatus` e troca o texto por `pendingLabel`.
- **FormStatus**: resultado de envio (`success`, `error`, `info`) com ícone, em região viva.
- **useHydratedForm**: recupera o que foi digitado antes da hidratação.

Ação e navegação:

- **Button**: `primary`, `secondary`, `outline`, `outline-strong`, `accent`, `text`, `danger`; `loading` com `loadingLabel` (desabilita e marca `aria-busy`); `destructive` só na ação final de um `ConfirmDialog`.
- **IconButton**: ação só com ícone, nome acessível obrigatório, alvo de 44 px.
- **NavLink** (`isCurrentPath`, `currentNavHref`): link de navegação com `aria-current="page"`.
- **LinkTabs**: abas que são links (rotas ou `?aba=`), com `aria-current`.
- **Tabs**: abas com painel na mesma página (estado no cliente).
- **TabBar**: barra inferior do app no celular.
- **NavHeader**: cabeçalho de tela interna com voltar e título.
- **SectionHeader**: título de seção com link "ver tudo" opcional.
- **TagLink**: tag de assunto ou bairro como link em pílula, `active` para a atual.
- **Pagination** (`paginationSlots`): páginas numeradas com reticências por `hrefFor(page)`.
- **LoadMore** (`loadMoreAnchor`, `FocusLoadMoreTarget`): "Carregar mais" por link, foco no primeiro item novo.
- **Menu**: lista de ações num botão (`trigger`), navegável por teclado.
- **Popover**: conteúdo ancorado a um gatilho (`trigger` render prop), fecha com Esc e clique fora.

Superfície, dados e retorno:

- **Panel**: bloco de conteúdo com hairline; `tone` `white`/`section`, `pad` `sm`/`md`/`lg`; nunca dentro de outro `Panel`.
- **StatGrid**: números do painel em `<dl>`; item com `href` vira link de 44 px.
- **StatusBadge** (`STATUS_TONE_CLASSES`): estado em ícone + texto (`success`, `warn`, `danger`, `info`, `neutral`, `ai`, `correction`), nunca só cor.
- **Table**: tabela com legenda (visível ou não), cabeçalhos tipados e rolagem horizontal por `minWidth` (`table-sm` a `table-xl`).
- **ListRow**: linha de lista com mídia, texto e ação; lista com divisória, não card.
- **CollapsibleFilters**: filtros recolhíveis no celular, com contagem ativa e "Limpar".
- **EmptyState**: vazio ou erro de lista com título, texto e ações (`tone`).
- **InlineAlert**: aviso no fluxo (`info`, `success`, `warn`, `error`) com ação opcional.
- **Skeleton**: carregamento com a forma do conteúdo (`text`, `line`, `block`, `card`), pulso só com `motion-safe`.
- **Toast** (`ToastProvider` + `useToast`): confirmação passageira com ação "Desfazer" opcional; erro que exige ação vai em `InlineAlert`.

Camadas:

- **Dialog**: modal nativo (`<dialog>`) com título, conteúdo e ações; `wide` para formulário.
- **ConfirmDialog**: confirmação de ação com `destructive` e `pending`; é o único lugar de `Button variant="destructive"`.
- **Drawer**: painel lateral (`left`/`right`) com cabeçalho, corpo rolável e rodapé.
- **BottomSheet**: folha inferior do celular (filtros, compartilhar).

Base: **Icon** (sprite `IconSprite`, nomes em `icon-names.ts`), **VisuallyHidden**, `useModalDialog` (foco e rolagem dos modais).

### 7.2 Editorial, IA e Estúdio

**Do kit, portados para TSX com as correções da seção 2:** NewsCard, FeatureCard, StoryCard, Photo, CategoryTag, MetaRow, LiveIndicator, TopicCard, SourceAvatar, AgendaList, StatCard, BarChart, ArticleActionBar, Logo, SiteHeader, VideoLowerThird.

**Novos (o kit não tem):** OriginLabel, ConfidenceMeter, TopicStatus, MadeHow, UrgentBar, NowList, AggregatedCard, AggregatedSection, CoverageCompare, SourceCard, SourceRow, PopularSourcesRail, DismissMenu, RecommendationReason, WhyThisDrawer, ConsentBanner, LoginInvite, FirstVisitInvite, AiAnswer, Citation, SourceRail, AiStatusPanel, SuggestionChip, ErrorState, AgendaCalendar, ServiceTile, NewsletterForm, ReportProblemForm, ShareSheet, ReadingSettings, SiteFooter e, no Estúdio, StudioShell, QueueTable, DecisionPanel, FieldDiff, VersionDiff, ChecklistPanel, RuleMatrix, CycleStrip, JobTable, SourceHealthTable, WeightSliders, AbTestCard, CostChart.

`design-system/components/*/*.prompt.md` documenta o uso de cada componente do kit e deve ser mantido como docstring do componente portado.

## 8. Camadas e motion

- z-index: sticky 100, dropdown 200, overlay 300, sheet 400, modal 500, toast 600, tooltip 700. Menus usam popover nativo ou portal.
- `--ease-standard` para estados, `--ease-out` para entradas, `--ease-exit` para saídas. Durações 120, 200 e 320 ms. Folha e diálogo: fade + slide. Sem bounce.
- Itens novos em "Agora": realce de fundo que some em 1,2 s. Lista com stagger de 40 ms, no máximo 6 itens.
- `prefers-reduced-motion`: crossfade ou instantâneo; o pulso do ao vivo para.
- Conteúdo nunca depende de animação para ficar visível.

## 9. Acessibilidade (WCAG 2.2 AA)

Contraste da seção 3. Foco visível em tudo. Alvos ≥ 44 px com 8 px de espaço entre eles. Landmarks e um `h1` por página. `aria-live="polite"` em Agora, toasts e resposta da IA. Rótulos de campo sempre visíveis. Erro com ícone, texto e exemplo. Tabelas com `th scope`. Gráficos com resumo textual. Nada depende só de cor.

## 10. Proibições

Papel como superfície de UI · cards aninhados · card-link sem `<a>` · gradiente decorativo · emoji · texto abaixo de 4,5:1 · borda de controle abaixo de 3:1 · `outline: 0` sem substituto · contagem de curtidas ou comentários · selo de "melhor fonte" · contagem exata de leitores · pop-up de cadastro na primeira visita · carrossel automático · ícone sem nome acessível · z-index arbitrário · hex ou px crus em componente (use tokens) · fonte fora de Schibsted Grotesk e Source Serif 4 · imagens do template de terceiros (Nachricht) em produção.
