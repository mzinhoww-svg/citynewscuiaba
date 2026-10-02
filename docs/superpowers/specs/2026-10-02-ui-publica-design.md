# Spec · UI das telas públicas (portal CityNews Cuiabá)

Data: 02/10/2026 · Escopo: todas as telas públicas (`src/app/(public)/**`) · Fora de escopo: Estúdio e Control Center.
Autoridade: `DESIGN.md` v2 e `PRODUCT.md` valem sobre esta spec. Esta spec decide **composição e hierarquia**, não identidade.

## 1. Entendimento (para correção)

**Pedido:** deixar as telas públicas com a melhor UI/UX possível para um portal de notícias, usando as skills ui-ux-pro-max, tripled-ui e impeccable, com análise (brainstorming) e plano (writing-plans) antes de executar.

**Premissas assumidas (corrija se erradas):**
1. Identidade preservada: marca "O Ponto", Schibsted Grotesk + Source Serif 4, Tinta/Névoa/Urucum, tokens em `src/styles/tokens.css`. O que muda é composição, ritmo, hierarquia e densidade.
2. `tripled-ui` entra **só** em blocos de marketing (newsletter, anuncie, app, sobre), como manda `CLAUDE.md` §7. Não adotamos Framer Motion (fora da stack) nem auroras/gradientes (proibidos pelo `DESIGN.md` §10); animação é CSS com `prefers-reduced-motion`.
3. `impeccable` entra como **processo e portão**: comandos `critique`, `layout`, `typeset`, `polish`, `adapt`, `harden` por grupo de telas, e o detector (`impeccable detect`) como checagem no CI.
4. A cena de uso do `PRODUCT.md` manda: leitora no celular, 7h, sol forte, 30 segundos para entender o dia; à noite, matéria longa no escuro.
5. Sucesso mede-se pelos critérios da seção 5, não por gosto.

## 2. Diagnóstico (evidência: capturas locais 390 e 1280 px de 16 rotas + detector)

O código é limpo (o detector achou só 2 avisos, ambos no `ConsentBanner`). O problema é de composição:

| # | Achado | Onde | Efeito |
|---|---|---|---|
| F1 | Banner de consentimento ocupa ~35% da primeira dobra no celular e cobre a barra lateral no desktop | todas | A leitora não vê a manchete inteira |
| F2 | Item sem foto vira bloco azul-marinho chapado com a editoria (40% da dobra) | home, cards | Dobra desperdiçada, aspecto de página quebrada |
| F3 | Até 4 plaquetas empilhadas antes do título da matéria; rótulo truncado ("NORMALIZADO… 2 FON…"); 3 plaquetas em fila em cada card de lista | matéria, listas | Ruído antes do conteúdo; regra 3 (origem visível) cumprida pelo excesso |
| F4 | Home mobile com 9.240 px (~11 telas) e o mesmo ritmo visual em todos os módulos | home | Sem hierarquia; a prioridade das 7h se perde |
| F5 | Listas de editoria só com texto, manchete de card 16 px; título da página (64 px sans) maior que qualquer manchete | editorias, busca | Inversão de hierarquia; sem imagem, não parece portal de notícias |
| F6 | Cabeçalho em duas linhas (7 destinos + 9 editorias); linha de editorias no celular corta "Esportes" sem indício de rolagem | todas | Peso fixo e descoberta ruim |
| F7 | Barra de ações da matéria quebra em duas linhas; "Informar problema" órfão | matéria | Ação principal (Salvar) sem destaque |
| F8 | `[PREENCHER]` visível no rodapé público | todas | Parece obra inacabada |
| F9 | Pergunte ao CityNews: coluna estreita à esquerda, metade da tela vazia, sem exemplo de resposta | /pergunte | Não vende o diferencial (resposta com fonte) |

## 3. Abordagens

- **A. Polimento cirúrgico por tela.** Menor risco, impacto médio; mantém a hierarquia plana (F4, F5 ficam).
- **B. Recomposição em torno de hierarquia noticiosa e imagem (recomendada).** Novo sistema de card e de origem, home e matéria reorganizadas, chrome enxuto; marca, tokens e componentes-base intactos.
- **C. Redesenho completo.** Contradiz `DESIGN.md`, descarta o brand kit e custa semanas; rejeitada.

**Escolha: B**, executada em fases independentes e entregáveis (cada fase publica sozinha).

## 4. Design

### 4.1 Chrome (F1, F6, F8)
- `ConsentBanner`: faixa compacta fixa embaixo (celular ≤ 15% da altura; desktop barra de 1 linha de 72 px, sem cobrir conteúdo). Texto legal e as três escolhas iguais; só o layout muda. Remove o `border-t-2` que o detector acusa.
- `SiteHeader`: uma linha principal (marca, 4 destinos, Busca, AGORA) e a linha de editorias; no celular, fade nas bordas da fileira rolável e a editoria ativa centralizada. Cabeçalho reduz a altura ao rolar.
- `SiteFooter`: campos institucionais ainda não preenchidos não aparecem (renderiza só o que existe); quando todos existirem, a seção volta sozinha.

### 4.2 Sistema de card e origem (F2, F3, F5)
- `ArticleCard` já tem as variantes `lead`, `standard`, `compact` e `list`; mantém-nas, ajusta a escala das manchetes (Source Serif 600) e usa cada uma onde faz sentido (lead e standard com imagem nas listas de editoria; `list` com miniatura nos rankings). O bloco azul-marinho chapado do F2 é o `TypographicCover` atual: ele é redesenhado (abaixo).
- Sem foto: `TypographicCover` redesenhado: no `lead` vira cabeçalho tipográfico compacto (faixa fina da editoria + ícone da editoria + metadado, altura de texto, manchete sobe para o topo da dobra); em `standard` e `list` é uma miniatura com ícone da editoria em Névoa, nunca um bloco Tinta chapado.
- `OriginStrip` (novo, substitui a pilha de `OriginLabel` nos cards e no cabeçalho da matéria): **uma linha** com o rótulo principal (ORIGINAL CITYNEWS, NORMALIZADO · n fontes ou AGREGADO · fonte) e, ao lado, até 2 ícones-rótulo com texto (IA, revisado). Nunca trunca. O conjunto completo (≤ 4, DESIGN.md §5) continua no painel "Como esta matéria foi feita" e no `title`/leitor de tela. Regra 3 preservada: a origem principal e os rótulos de IA/revisão ficam sempre visíveis em texto.
- Escala: títulos de página e seção nunca maiores que a manchete lead da mesma tela.

### 4.3 Home (F4)
- Mobile ≤ 5,5 alturas de tela (~4.700 px): lead com imagem + manchete + resumo em 20 s; "Agora" (6 itens); trilhos horizontais com `scroll-snap` para Assuntos, Coleções, Agenda e Serviços; editorias viram abas/trilho; Mais lidas em lista `ranked`; Panorama sempre abaixo da dobra e com superfície própria (princípio 1 do PRODUCT).
- Desktop: grade de 12 colunas: lead (8) + Agora (4); faixa de 3 destaques `standard`; módulos em 2 colunas (Agenda + Serviços; editorias em 3).
- Ordem por necessidade das 7h: Agora, Clima/qualidade do ar quando houver, Mobilidade, Agenda do dia.

### 4.4 Matéria (F3, F7)
- Cabeçalho: kicker + status do assunto (1 chip), título, linha fina, `OriginStrip`, autoria/datas. Barra de ações em uma linha: **Salvar** em destaque; Compartilhar, Ajustar leitura e Informar problema como botões de ícone com nome acessível e texto a partir de 640 px.
- Leitura: 68ch, 18→20 px, primeira frase em negrito, imagem com rótulo e crédito, "Fontes" como lista expansível após o corpo, barra de progresso, modo escuro verificado (≥ 7:1).
- Sidebar "Como esta matéria foi feita" vira bloco recolhível no celular.

### 4.5 Listas e descoberta (F5)
Editoria, Assunto, Busca, Explorar, Coleção: `ArticleCard` por variante, filtros em barra única (chips + "Filtros"), estados vazio/carregando/erro com ação e esqueleto no formato do card final (zero salto de layout).

### 4.6 Telas de produto (F9)
`/pergunte`: coluna central, exemplo de resposta (fato com fonte, inferência, lacuna) em cartão ilustrativo rotulado, 4 perguntas sugeridas, aviso de limite. `/fontes`, `/panorama`, `/agenda`: densidade e alinhamento pelo mesmo grid; `/agenda` ganha lista agrupada por dia legível a 360 px.

### 4.7 Marketing e institucional (tripled-ui)
Newsletter, `/anuncie`, `/app`, `/sobre`: blocos hero/benefícios/CTA/FAQ inspirados nos blocos do TripleD, em Tailwind puro com tokens; sem gradiente, aurora ou emoji; animações só CSS com `prefers-reduced-motion`.

### 4.8 Conta e legais
`/entrar`, `/criar-conta`, `/perfil`, `/favoritos`, `/alertas` e páginas legais: alinhar ao grid, estados completos, "Agora não" em todo convite, texto legal com a mesma tipografia de leitura.

## 5. Critérios de aceite (mensuráveis)

1. 1ª dobra do celular (390×844) mostra manchete, resumo e `OriginStrip` inteiros; nada fixo cobre mais de 15% da altura.
2. Home mobile ≤ 4.700 px de altura com o seed local; nenhuma seção sem hierarquia (1 lead, 1 bloco de prioridade).
3. Matéria: no máximo 2 itens (kicker/status) antes do `h1`; origem em 1 linha; nenhum rótulo truncado em 360 px.
4. Nenhuma tela com bloco de cor chapada sem conteúdo; sem foto → cartão tipográfico.
5. Rodapé público sem `[PREENCHER]`.
6. Lighthouse mobile: LCP ≤ 2,5 s, CLS ≤ 0,1, INP ≤ 200 ms nas 6 rotas medidas (`docs/reports/perf.md`); orçamento de JS não sobe.
7. axe: 0 violações sérias nas rotas públicas; e2e de teclado e foco verdes; contraste ≥ 4,5:1 (7:1 no escuro), alvos ≥ 44 px.
8. `impeccable detect` sem erro nem aviso novo (baseline: 2 avisos hoje, ambos corrigidos na fase 1).
9. Revisão visual com capturas antes/depois (390 e 1280, claro e escuro) anexada em `docs/reports/ui-publica.md`.

## 6. Riscos e decisões

- **Rótulos de origem (regra 3).** Compactar não pode esconder. Mitigação: teste que exige o texto da origem principal e dos rótulos de IA/revisão em todo card e cabeçalho; painel completo mantido.
- **Foto de terceiros (regra 11).** `reproduction` continua com rótulo REPRODUÇÃO · fonte, crédito e link junto da imagem; nenhum recorte de crédito (variantes usam `object-fit` sem cortar a faixa de crédito, que fica sob a imagem).
- **Consentimento.** Texto e escolhas não mudam; só posição e tamanho. e2e `consent.spec.ts` continua valendo.
- **Dados com poucas imagens.** O cartão tipográfico é o estado normal, não exceção; tem de ficar bonito sozinho.
- **Escopo.** Nada de novo conteúdo, rota ou dado; só apresentação (e o `[PREENCHER]` condicional).
