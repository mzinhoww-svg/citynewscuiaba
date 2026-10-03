# Campos padrão de banner no CityNews — design

Data: 03/10/2026. Origem: pedido do dono com referência do Olhar Direto (banner largo no topo, banner lateral, faixa entre blocos, hub "Estúdio OD"). Pedido: campos padrão ao longo do site, wireframes para análise. Filha da spec mestre e da de UI pública; **o dono decide as posições após ver os wireframes** (`2026-10-03-banners-padrao-wireframes.html`).

## 1. Entendimento
Hoje existe só patrocinado em formato de matéria (`sponsored_campaigns`, painel A07 de Publicidade). O dono quer **espaços de banner padronizados**, com tamanho e posição fixos, reutilizados em todas as páginas públicas, administráveis no Estúdio, no estilo de portal de notícias regional.

Suposições (a corrigir no retorno dos wireframes): receita vem de anunciantes locais e parceiros; peça é imagem com link (e vídeo curto opcional no hub); sem rastreamento individual sem consentimento (regra 7 de CLAUDE.md §5); sem anúncio em política (regra existente `NEVER_SECTIONS`) nem em página de urgência, segurança ou saúde sensível.

## 2. Catálogo de campos (slots)
| Código | Nome | Desktop | Mobile | Onde |
|---|---|---|---|---|
| `TOP` | Faixa de topo | 970×250 (ou 728×90) | 320×100 | Abaixo do ticker, home e editorias |
| `RAIL-A` | Retângulo lateral | 300×250 | some (vira `MID`) | Coluna direita, topo |
| `RAIL-B` | Arranha-céu lateral | 300×600, fixo ao rolar | some | Coluna direita, abaixo do "Agora" |
| `MID` | Faixa entre blocos | 970×120 | 320×100 | Entre módulos da home (máx. 2) |
| `ART-1` | No texto | 728×90 | 320×100 | Após o 4º parágrafo da matéria |
| `ART-2` | Fim da matéria | 728×250 | 300×250 | Antes de "Relacionadas" |
| `STICKY` | Rodapé fixo | — | 320×50, dispensável | Só mobile, após 40% de rolagem |
| `HUB` | Estúdio CityNews | bloco escuro com 2 a 4 cards de vídeo/entrevista | carrossel | Home, abaixo das editorias; conteúdo de parceiro |

## 3. Regras
- Rótulo fixo "Publicidade" (ou "Conteúdo de parceiro" no `HUB`), texto pequeno acima da peça, nunca disfarçado de notícia; no máximo 1 plaqueta de origem por card (regra 3).
- Altura reservada por slot (sem salto de layout, CLS 0); carregamento preguiçoso fora da primeira dobra.
- No máximo 3 campos visíveis por tela no desktop e 2 no mobile; `STICKY` e `TOP` nunca juntos na mesma tela.
- Sem som automático, sem movimento fora de `prefers-reduced-motion`; peça com `alt` obrigatório; link com `rel="sponsored noopener"`.
- Segmentação só contextual (editoria, bairro, horário); individual apenas com consentimento.
- Campo vazio nunca mostra espaço em branco: colapsa, ou preenche com house ad do CityNews (newsletter, app, "Anuncie").
- Acessível: foco visível, contraste, teclado para fechar `STICKY`.

## 4. Arquitetura
- Tabelas: `ad_slots` (código, formatos, páginas permitidas), `ad_creatives` (slot, imagem ou vídeo, alt, link, dimensões validadas), `ad_placements` (campanha × slot × período × editorias × peso de rotação), eventos agregados `ad_stats` (impressão e clique por dia, sem identificador de pessoa).
- Componente `AdSlot` (`src/components/editorial/AdSlot.tsx`, Server Component) com `code`, reserva de tamanho e fallback house; `selectCreative` puro em `src/lib/ads/` (período, editoria, peso, regras `NEVER_SECTIONS`, rotação estável por sessão).
- Estúdio: painel A07 ganha abas Campos, Peças, Calendário e Relatórios; prévia por slot; upload validado; conflito de reserva avisado; metas e relatório simples (impressões, cliques, CTR por campo).
- Registra CLS e peso de página no CI (orçamento por slot).

## 5. Testes
`selectCreative` por tabela de casos (período, editoria proibida, peso, vazio→house); componente (altura reservada, rótulo, sem espaço em branco); axe; e2e das páginas com campo e sem campo; Lighthouse sem regressão de CLS.

## 6. Fora do escopo agora
Leilão programático e redes externas de anúncio (podem entrar depois pelo mesmo `AdSlot`); relatório por anunciante em PDF; vídeo em `TOP`.
