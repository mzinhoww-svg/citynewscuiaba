# UI pública: relatório de medição

Plano `2026-10-02-ui-publica`. Este arquivo guarda a baseline (tabela "Antes") e recebe a
tabela "Depois" na última tarefa. Medidas feitas com `pnpm design:shoot` contra o app local
(build de produção, seed local), em 2026-10-02.

## Como medir

```bash
pnpm design:shoot                 # 390x844 e 1280x900, claro e escuro, em tmp/shots/
pnpm design:shoot -- --no-consent # idem, com o banner de consentimento fechado
pnpm design:detect                # detector de anti-padrões (impeccable)
```

As capturas ficam em `tmp/shots/<largura>-<esquema>/<rota>.png` (fora do git) e as medidas em
`tmp/shots/medidas.json`. Variáveis: `--base=<url>` (padrão `http://localhost:3000`) e `--out=<pasta>`.
Nas capturas de página inteira o banner (posição fixa) aparece no meio da imagem; é efeito da
captura, não do layout.

## Antes

| Medida                                                                 | Valor                     | Como foi medido                                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Altura da home no celular (390 px)                                     | 9.247 px (9.040 sem banner) | `scrollHeight` do documento em `/`, visitante novo                                                                                  |
| Banner de consentimento na 1ª dobra do celular                         | 24,6% (207 de 844 px)     | altura da região de consentimento sobre a altura da janela, 390x844                                                                 |
| Itens antes do `h1` da matéria (celular)                               | 10                        | elementos com texto próprio dentro de `main` antes do `h1`: trilha (3), plaquetas e rótulos de origem e revisão (7), sem ícones      |

Observações:

- A spec §2 estimou o banner em ~35% da dobra; a medição real é 24,6% (o banner ocupa mais na
  altura quando o texto quebra em telas de 360 px; aqui o viewport é 390 px).
- Os 10 itens antes do `h1` da matéria `prefeitura-detalha-novo-plano-de-onibus-cpa-centro`: Início,
  Mobilidade, título da trilha, Mobilidade, Confirmado, NORMALIZADO PELO CITYNEWS, "4 fontes",
  RESUMO POR IA, REVISADO POR HUMANO, "Otávio Reis".

## Detector de design (baseline)

`pnpm design:detect` acha 2 avisos, ambos `border-accent-on-rounded` (`border-t-2` em elemento
arredondado):

- `src/components/editorial/ConsentBanner.tsx`, linha 115;
- `src/components/editorial/FirstVisitInvite.tsx`, linha 89.

(O plano previa os 2 no `ConsentBanner`; um deles está em `FirstVisitInvite`.) O passo de CI é
não bloqueante até UI-T14.

## Depois (parcial)

### UI-T1: consentimento compacto

| Medida                                   | Antes                 | Depois                | Como foi medido                                      |
| ---------------------------------------- | --------------------- | --------------------- | ---------------------------------------------------- |
| Banner na 1ª dobra, 390x844              | 24,6% (207 de 844 px) | 11,3% (95 de 844 px)  | `getBoundingClientRect` da região, e2e `consent.spec.ts` |
| Banner na 1ª dobra, 360x640              | n/m                   | 14,8% (95 de 640 px)  | idem (meta: até 15%)                                 |
| Banner no desktop, 1280x800              | cartão de 320 px      | barra de 61 px (7,6%) | uma linha, largura total                             |
| Avisos `border-accent-on-rounded`        | 2                     | 0                     | `pnpm design:detect`                                 |

Notas: o título virou `sr-only` (a região mantém o mesmo nome); no celular o texto fica limitado a
2 linhas, com "Saiba mais" ao lado e o texto completo no DOM e em `/privacidade`. Textos e as três
escolhas não mudaram. A barra do desktop é de largura total; o `h1` da home em 1280x800 fica
parcialmente sob ela até rolar, por isso o e2e de desktop agora verifica o `h1` rolado para
acima da barra (respiro inferior via `--cn-consent-h`).

### UI-T2: cabeçalho enxuto e rodapé sem campos pendentes

| Medida                                  | Antes                  | Depois                                   | Como foi medido                                            |
| --------------------------------------- | ---------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| Altura do cabeçalho, 390 px (topo)      | 106 px                 | 102 px (90 px ao rolar)                  | `getBoundingClientRect` do `<header>`, build de produção   |
| Altura do cabeçalho, 1280 px (topo)     | 118 px                 | 102 px (90 px ao rolar)                  | idem                                                       |
| Destinos na linha principal (desktop)   | 7 links + editorias    | 4 links + 3 ícones (Busca, Favoritos, Perfil) + editorias | e2e `shell.spec.ts`                       |
| Altura do documento ao rolar            | n/a                    | igual à do topo (sem salto)              | `scrollHeight` antes e depois de rolar 600 px              |
| Linhas pendentes no rodapé              | 3 (`[PREENCHER]`)      | 0 (a seção some até o dono informar)     | e2e `shell.spec.ts`, `SiteFooter.test.tsx`                 |

Notas: ao rolar, a linha principal vai de 56 px para 44 px e o cabeçalho compensa com margem
inferior, por isso a altura do bloco no fluxo não muda. Páginas legais seguem com os campos
`[PREENCHER]`. Varredura axe de todas as rotas públicas (claro e escuro, 390 e 1280): 0 violações.

### UI-T4: capa tipográfica compacta e miniaturas nas listas

| Medida                                         | Antes                             | Depois                          | Como foi medido                                                              |
| ---------------------------------------------- | --------------------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| Altura do `lead` sem foto, 1280 px (home)      | 438,75 px (bloco Tinta 16:9, 780 px de largura) | 48 px (faixa + ícone + editoria) | `getBoundingClientRect` de `[data-cover="header"]`, build de produção        |
| Altura do `lead` sem foto, 390 px (cálculo)    | ~179 px (aspect 2:1 em 358 px)    | 48 px                           | altura fixa `h-12`; o seed do celular não renderizou lead sem foto na medição |
| Foto nas listas (`compact`, `list`)            | nenhuma (compact) / só alguns casos (list) | miniatura 1:1 de 80 px (compact) e 96 px (list), com ou sem foto | `cards.test.tsx`                                      |

Notas: sem foto, `standard`, `list` e `compact` mostram miniatura Névoa (token `bg-section`, que
escurece no tema escuro) com o ícone da editoria do sprite (`SECTION_ICONS`; sem mapa, "jornal");
nenhum bloco Tinta. A faixa do `lead` usa Urucum (Cerrado em Serviços e Guia Cuiabá). Foto de
terceiros: legenda "Reprodução web · Fonte" com "Foto: autor" e "Ver original" abaixo da imagem,
fora do recorte; nas miniaturas o `alt` inclui a mesma frase. O campo `author` e `originUrl` do
`ArticleImage` vem de `media_assets` (política reproduction).

## Retomada e fechamento (UI-T10 a UI-T15, 04/10/2026)

Plano de retomada `docs/superpowers/plans/2026-10-04-retomada-ui-e-pauta-quente.md` (A-140), PR #43
(merge `03b7d2c`). Entregue: UI-T12 (login e cadastro com o Google em destaque), UI-T13 (Pergunte como
chat), UI-T10 (Fontes e Panorama enxutos), UI-T11 (Newsletter, Anuncie, App e Sobre em blocos), UI-T14
(Conta, Favoritos, Alertas e páginas legais no grid do portal).

### Critérios da spec §6

| # | Critério | Situação | Evidência |
| - | -------- | -------- | --------- |
| 1 | 1ª dobra do celular sem nada fixo acima de 15% | Atendido | UI-T1: aviso de consentimento 11,3% (390x844) e 14,8% (360x640) |
| 2 | Home mobile ≤ 4.700 px | Atendido | UI-T5: 4.673 px no Chromium com o seed (DECISIONS, nota UI-T5) |
| 3 | Matéria com até 2 itens antes do `h1`; sem `OriginStrip` | Atendido | UI-T6; teste de ausência do componente |
| 4 | 1 plaqueta por card; nenhuma tela pública diz "IA" | Atendido | `vocabulary.spec.ts`, `src/content/vocabulary.test.ts`; UI-T10 deixa 1 plaqueta AGREGADO por agregado |
| 5 | Sem bloco chapado; capa e imagem no texto | Atendido | UI-T4, UI-T16 |
| 6 | Rodapé sem `[PREENCHER]` | Atendido | UI-T2, `SiteFooter.test.tsx` |
| 7 | Google como 1º controle, branco, com "G", 56 px; sem frase de indisponível | Atendido | `GoogleButton.test.tsx`, `tests/e2e/auth.spec.ts`; produção conferida (`/entrar` mostra "Continuar com o Google", o divisor e "Continuar sem entrar") |
| 8 | Pergunte como chat: campo fixo, bolhas, citações, recusa sem fonte, teclado, `aria-live`, `?q=` | Atendido | `ChatThread.test.tsx`, `useAskStream.test.ts`, `tests/e2e/ask.spec.ts`, `tests/a11y/ask.spec.ts`. Regra da recusa pela D-01 (A-133): uma fonte basta, atribuída; sem fonte, explica |
| 9 | Lighthouse mobile (LCP ≤ 2,5 s, CLS ≤ 0,1, INP ≤ 200 ms) e JS sem subir além do chat | **Não atendido (LCP)** | JS da home acima de 170 KB e LCP de 3,2 a 4,0 s no CI em home, busca e fontes, também sem mudança de cliente sobre a `main` (L-026, deriva da base). O chat (cerca de 55 KB sem compressão) só carrega em `/pergunte`: o pedaço não aparece no manifesto de `/` nem de `/busca` |
| 10 | axe sem violação séria; teclado e foco; contraste; alvos ≥ 44 px | Atendido no CI | suítes `@a11y`; o axe do modo simples do Pergunte mede o HTML do servidor com JavaScript ligado (com JavaScript desligado o axe não roda) |
| 11 | `impeccable detect` sem erro nem aviso | Atendido | 0 avisos; o passo passou a bloquear o CI. Corrigido o único aviso (`side-tab` no `CriteriaNote` do Guia) |
| 12 | Capturas antes e depois (390 e 1280, claro e escuro) | **Pendente** | O container de nuvem não tem a pilha Supabase local para `pnpm design:shoot`; rodar numa máquina com a pilha (`scripts/local-stack/`) |

### Achados corrigidos no fechamento

- No celular, o campo fixo do chat ficava atrás do aviso de privacidade aberto (mesma altura, `z-index` menor). Agora sobe pela altura do aviso ou da faixa de convite (`bottom-chat-safe`; no desktop, `bottom-consent-safe`).
- Sem JavaScript, o botão "Enviar pergunta" saía do servidor com `aria-disabled` e nunca liberava; e o campo fixo ficava sob o aviso de privacidade, que sem JavaScript não fecha. O botão não sai mais desabilitado antes da hidratação e o campo fica no fluxo da página.
- Alertas validava o e-mail com `zod` no navegador (B-018); trocado por uma conferência leve, com a validação que vale no servidor.
- Guia vazio repetia o link "Matérias do Guia" do cabeçalho.

### Pendências

- Capturas antes e depois (critério 12).
- LCP e orçamento de JS da home (critério 9, L-026), com o relatório do Lighthouse.
- Roteiro de leitor de tela humano (`docs/runbooks/revisao-leitor-de-tela.md`) nas telas alteradas.
- Aviso de privacidade não fecha sem JavaScript em todo o site (tarefa sugerida à parte).
- Completar pergunta curta com a anterior no chat ("e no CPA?"): a rota `/api/ask` não recebe contexto.
