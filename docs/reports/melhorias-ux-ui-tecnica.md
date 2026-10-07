# Melhorias de UX, UI e técnica · relatório de fechamento

**Plano:** `docs/superpowers/plans/2026-10-04-melhorias-ux-ui-tecnica.md` · **Spec:** `docs/superpowers/specs/2026-10-04-melhorias-ux-ui-tecnica-design.md` (critério de aceite de cada item).
**Escopo:** itens 1 a 93 em cinco ondas, um PR por onda. Os itens 94 e 95 ficaram fora do plano.
**Execução:** autônoma (CLAUDE.md, OPERATING MODE), com tarefas paralelas em worktrees isoladas e integradas no branch da onda.

| Onda | Itens | PR | Decisões |
|---|---|---|---|
| W1 · Erros e riscos | 1–24 | #59 | A-146, A-147, A-148 |
| W2 · Fundações do design system | 25–44 | #60 | A-149 |
| W3 · Fluxos do Estúdio | 45–61 | #62 | A-150 (migrations 0158 e 0159) |
| W4 · Portal | 62–77 | #61 | A-151 (substituída pela A-156) |
| W5 · Performance e técnica | 78–93 | este PR | A-155, A-156 (migration 0161) |

## O que mudou, por item

### W1 · Erros e riscos

| # | Item | O que mudou |
|---|---|---|
| 1 | Hover do modo escuro | Token `--surface-hover` nos dois temas. Saíram os `bg-nevoa-2` dos estados interativos. `tests/a11y/dark-interactive.spec.ts` passa o axe em hover |
| 2 | Nota "Corrigido" no escuro | `--cn-urucum-soft` redefinido no tema escuro, com contraste ≥ 4,5:1 |
| 3 | Placas Tinta e `themeColor` | Borda `line-subtle` no escuro, `themeColor` igual ao fundo escuro |
| 4 | Publicar com edição não salva | O diálogo oferece "Salvar e publicar" e nunca publica a versão antiga |
| 5 | Recarregar no conflito | O texto local fica guardado antes de recarregar e pode ser restaurado |
| 6 | Campos somente leitura | No modo leitura do editor, campos com `readOnly`, listas desabilitadas e o editor rico com `aria-readonly` |
| 7, 8 | Fila e agenda cortavam em 100 | As duas mostram o total e têm "Carregar mais" como `<a href>`, que funciona sem JS |
| 9, 10 | Cor como único sinal | "Atrasado" e "Hoje" aparecem também em texto, no Estúdio e na agenda |
| 11, 12 | Consentimento | Banner em 14 px, sem corte e com alvo de 44 px. O botão diz o que liga: "Aceitar métricas e recomendações" (A-147) |
| 13 | Ticker | Sem rolagem automática |
| 14, 15 | Colunas fixas e área segura | Colunas laterais abaixo do cabeçalho, `safe-area` do iPhone |
| 16, 17 | Lighthouse | Roda também na `main` e toda semana. Orçamento estourado deixa o check vermelho e o relatório é salvo (A-146) |
| 18 | CSS global | Regras globais em `@layer base` |
| 19–23 | Correções de comportamento | Alerta de tema sensível segue as regras v3 (A-148). Regiões vivas corrigidas, texto do limite do Pergunte, estado do assunto fora do público |
| 24 | Ações sensíveis | Revogar e as ações de segurança pedem confirmação |

### W2 · Fundações do design system

| # | Item | O que mudou |
|---|---|---|
| 25–28 | Formulário, erro, foco e alvo | `Field`, `Select`, `TextArea`, `DateField`, `Checkbox` e `RadioGroup`, com erro ligado por `aria-describedby`. Anel de foco único via `.control-field` e alvos de 44 px |
| 29 | Rótulo de campo | 16 px, definido pelo papel tipográfico |
| 30, 41 | Painel e utilitários | `Panel`, `StatGrid`, utilitários `table-*` e de layout |
| 31 | Status | `StatusBadge` único para Estúdio e Control Center |
| 32, 43 | Tabela e paginação | `Table` e `Pagination` |
| 33 | Pílulas e abas | `TagLink`, `LinkTabs` por rota e "voltar" com origem segura |
| 34, 35 | Botões | `Button` com carregamento e variante destrutiva, `SubmitButton`, `ConfirmDialog` |
| 36, 39 | Retorno | `Toast` e `FormStatus`, com região viva persistente |
| 37, 38 | Sobreposições | `Popover`, `Menu`, `Drawer` e `Dialog`, que devolvem o foco e não fecham na remontagem do StrictMode (`closedByUser`) |
| 40 | Aderência | ESLint barra controles crus fora do kit (exceções comentadas, A-149). DESIGN.md §7 traz o inventário real |
| 42, 44 | Ícones e detalhes | Escala de ícones, sem bordas laterais decorativas, esqueletos |
| — | Migração | Control Center, Redação, Administração, portal, gráficos e Guia passaram para as primitivas |

### W3 · Fluxos do Estúdio

| # | Item | O que mudou |
|---|---|---|
| 45, 55 | Decisão ao alcance | Barra fixa de decisão no celular, com a justificativa visível |
| 46 | Revisão em sequência | "Aprovar e ir para o próximo", mantendo a aba e os filtros |
| 56 | Lote | Aprovação em lote só do que as regras recomendam, auditada (0159) |
| 47–49 | Formulários seguros | Proteção de alterações ao sair, rascunho automático, barra de salvar e agendamento validado no campo |
| 50, 51, 60 | Menu | Busca no trilho (Esc limpa antes de fechar), subgrupos, contagens com `aria-label`, nomes revistos |
| 52, 54 | Tabelas e falhas | Tabelas críticas viram cartões no celular. Falhas agrupadas |
| 53 | Atalhos | Atalhos de teclado e a ajuda em `?` |
| 57–59 | Moldura e Redação | `StudioScreen` com caminho de navegação. Redação, Testar prompts e Registros com links |
| 61 | Papel de admin | `role_set` numa ação só, com autoaprovação auditada (0158, A-150) |

### W4 · Portal

| # | Item | O que mudou |
|---|---|---|
| 62, 64, 69 | Moldura | As editorias recolhem ao rolar e voltam ao subir, com limiar contra a ancoragem de rolagem. O anúncio fixo reserva espaço e "Agora" leva ao bloco da home |
| 63 | Primeira visita | O convite aparece no fim da leitura e não cobre o texto |
| 65–68 | Navegação | A aba certa fica acesa na barra inferior. "Perguntar ao CityNews" aparece no Explorar e no rodapé. Âncoras e atalhos do Explorar corrigidos |
| 70–73 | Estados | Erro e vazio em Perfil, Favoritos ("Desfazer" com foco), Agora e Panorama |
| 74, 75 | Matéria | "Informar problema" e as ações da matéria com 44 px |
| 76 | Busca no celular | O Pergunte aparece depois dos 3 primeiros resultados |
| 77 | Trilho | Trilho acessível; o ticker rola pela roda do mouse e por botões |

### W5 · Performance e técnica

| # | Item | O que mudou |
|---|---|---|
| 78 | Imagem quebrada | `Photo` troca para o marcador "Foto" quando a imagem não carrega. A capa tenta a URL direta, depois a rota, depois o marcador |
| 79 | Imagens responsivas | Variantes WebP de 480, 960 e 1440 px na ingestão (`make-variants.ts`) e `/api/media/[id]?w=` com volta ao original. `srcset`/`sizes`, URL direta na manchete e na capa, `preconnect` ao Storage, backfill idempotente (A-155) |
| 80 | Home sem cascata | Destaques, pinos e mais lidas no primeiro `Promise.all`: no máximo 2 rodadas (`tests/integration/home-queries.test.ts`) |
| 81 | Matéria | `getArticleBySlug` com `cache()`. O proxy marca `x-cn-gone-checked` e a página não repete `public_article_gone` |
| 82 | Timeout no Supabase | `fetchWithTimeout`: 8 s nos clientes e 20 s na service role do cron |
| 83 | Polling | `fetchJson` com timeout e guarda em NewItemsPill, UpdatedWhileReading, AlertWatcher e NotificationBell |
| 88 | Promessas sem tratamento | `act` do perfil local devolve `Result`. Falhas viram toast em Salvar, Agenda, Recomendações, Seguir, Favoritos, Fontes, convite e Alertas |
| 84 | N+1 | Guia (admin e listas), push e conta em leitura agrupada, `in()`, upsert em lote ou RPC (0161) |
| 85 | Bundle do Estúdio | Constantes puras separadas dos schemas, que ficam com `server-only`. O editor Tiptap é carregado sob demanda. `tests/ci/no-zod-in-client.test.ts` garante que nenhum chunk do cliente traz zod |
| 86 | /fontes no servidor | Lista e cards renderizados no servidor. O cliente fica só com abas, personalização e "Ocultar" |
| 87 | Carregamento | `NavProgress` no cabeçalho. Relacionadas e mais lidas em `<Suspense>` com esqueleto. 404 e 410 mantêm o status certo |
| 89 | Utilitários duplicados | `fold()` em `src/lib/text/fold.ts` e `TIME_ZONE` único |
| 90 | Código morto | `knip.json` e passo de aviso no CI. Barris e reexports mortos removidos; os índices de domínio ficam (CLAUDE.md §6) |
| 91 | e2e frágil | Nenhum `waitForTimeout` (teste de CI). Os projetos `serial-flags*` rodam em série os specs que mudam flags globais |
| 92 | Lighthouse | Entram `/agenda`, `/cidade` e `/guia-cuiaba`, mais uma peça de anúncio da casa no seed |
| 93 | Componentes críticos | Testes de `RuleProposalForm`, `ApprovalInbox`, `SearchBox` e `PromptVersions`. O último achou e corrigiu o `pressed` |

## Lighthouse: JS por rota (`resource-summary:script:size`)

| Rota | Antes da W1 (A-146) | Depois da W4 (CI, PR #61) | Depois da W5 (CI, PR #66) | Orçamento vigente |
|---|---|---|---|---|
| Home | 170 a 172 kB | 178,1 kB | 172,2 kB | 178,2 kB |
| Busca | 170 a 172 kB | 178,0 kB | 174,1 kB | 178,2 kB |
| Matéria | — | 187,2 kB | 182,3 kB | 187,4 kB |
| Fontes | — | 188,6 kB | 180,0 kB | 187,4 kB |
| Agenda | não medida | não medida | 173,9 kB | 179,1 kB |
| Cidade | não medida | não medida | 173,6 kB | 179,1 kB |
| Guia Cuiabá | não medida | não medida | 166,6 kB | 179,1 kB |

**Orçamento:** foi de 170 kB para 175/185 (A-146), depois 180/190 (A-151), e agora 178,2/187,4 (A-156). Agenda, Cidade e Guia ficam em 179,1 kB, a maior medida das três mais 3% (A-156).

**Medição local × CI:** a medição local da A-156 (home 171,1, busca 173,0, matéria 181,9, Fontes 179,6 kB) ficou a 1 kB ou menos do CI. Os orçamentos continuam válidos.

**Estúdio:** o JS de entrada das telas caiu entre 59% e 68%:

| Tela | Antes | Depois |
|---|---|---|
| Editor de matéria | 199,5 kB | 74,6 kB |
| Correção | 183,3 kB | 59,0 kB |
| Fonte | 163,9 kB | 69,6 kB |
| Nova fonte | 168,8 kB | 73,4 kB |
| Módulos da home | 153,9 kB | 60,3 kB |

**A meta de 165 kB em home e busca não foi atingida:** o que sobra é o framework, mais as interações da W4. O próximo corte depende de medir o que cada ilha cliente do cabeçalho custa. O LCP continua como alerta (L-026).

## Pendências fora do código

- **Produção (B-009):** as migrations 0158 (`role_set`), 0159 (aprovação em lote auditada) e 0161 (RPCs em lote) e o backfill de variantes (`scripts/media/backfill-variants.mjs --apply --confirm-host=<host>`) ainda não foram aplicados em produção. Ao executar, registrar data e host na A-150/A-155.
- **Vercel:** o plano gratuito tem limite de 100 deploys por dia, e ele foi atingido durante as ondas, o que bloqueou os previews e um deploy de produção. Não é falha de código. Subir de plano é gasto e decisão do dono.
