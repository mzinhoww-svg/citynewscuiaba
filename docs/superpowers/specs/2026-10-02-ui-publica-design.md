# Spec · UI das telas públicas (portal CityNews Cuiabá) · v3

Data: 02/10/2026 · Escopo: todas as telas públicas (`src/app/(public)/**`) · Fora de escopo: Estúdio e Control Center.
Autoridade: `DESIGN.md` v2 e `PRODUCT.md` valem sobre esta spec. Esta spec decide **composição, hierarquia e fluxo**, não identidade.

**v3 (mesmo dia):** (4) **nenhuma menção a uso de IA nem ao termo "normalizado" nas telas públicas**: só "feito a partir de n fontes" e "revisado automaticamente" ou "revisado por humano"; (5) **imagens**: reproduzir a melhor imagem das fontes como capa e uma segunda no texto, com a legenda "Reprodução web".

**v2 (mesmo dia):** o dono pediu mais profundidade por tela e três decisões: (1) **nenhum OriginStrip em lugar nenhum**; (2) **login com botão do Google de verdade**, claro, em destaque e no topo; (3) **Pergunte ao CityNews como chat**.

## 1. Entendimento (para correção)

**Pedido:** a melhor UI/UX possível para um portal de notícias, com ui-ux-pro-max, tripled-ui e impeccable, com análise e plano antes de executar.

**Premissas:**
1. Identidade preservada: marca "O Ponto", Schibsted Grotesk + Source Serif 4, Tinta/Névoa/Urucum, tokens em `src/styles/tokens.css`. Muda composição, ritmo, hierarquia, densidade e fluxo.
2. `tripled-ui` só em blocos de marketing (newsletter, anuncie, app, sobre), como manda `CLAUDE.md` §7. Sem Framer Motion, aurora ou gradiente decorativo; animação em CSS com `prefers-reduced-motion`.
3. `impeccable` como processo (`critique`, `layout`, `typeset`, `polish`, `adapt`, `harden` por grupo de telas) e portão (`impeccable detect` no CI).
4. Cena de uso do `PRODUCT.md`: leitora no celular, 7h, sol forte, 30 segundos; à noite, leitura longa no escuro.
5. Sucesso mede-se pelos critérios da seção 6.

## 2. Diagnóstico por tela (capturas locais 390 e 1280 px de 16 rotas; detector do impeccable; leitura do código)

O código é limpo (o detector achou 2 avisos, ambos no `ConsentBanner`). Os problemas são de composição e de fluxo.

| Tela | Achado | Efeito |
|---|---|---|
| Chrome (todas) | Banner de consentimento ocupa ~35% da 1ª dobra no celular e cobre conteúdo no desktop. Cabeçalho em duas linhas; fileira de editorias corta "Esportes" sem indício de rolagem. `[PREENCHER]` no rodapé público | Manchete cortada; peso fixo; obra inacabada |
| Home | 9.240 px no celular (~11 telas), mesmo ritmo em todos os módulos; item sem foto vira bloco azul-marinho chapado de 40% da dobra | Sem hierarquia; dobra desperdiçada |
| Matéria | Até 4 plaquetas antes do título, uma truncada; 4 botões de ação em grade com "Informar problema" órfão; uma única imagem por matéria, escolhida pela ordem de chegada (a primeira que passa na checagem), não pela qualidade | Ruído antes do conteúdo; Salvar se perde |
| Cards e listas | 3 plaquetas empilhadas por item, com vocabulário técnico ("normalizado", "resumo por IA") que o leitor não pediu (Explorar, Busca, Editoria, Mais lidas); lista só de texto; título da página (64 px) maior que a manchete | Poluição e inversão de hierarquia |
| Busca | Filtros em linha com botão "Aplicar filtros"; sem miniaturas; atalho "Perguntar à IA" pequeno | Fricção; não parece portal |
| Agenda | Lista de texto corrido, sem imagem, sem "Hoje / Amanhã / Fim de semana"; alternância Lista/Calendário de baixo contraste; metade direita vazia | Difícil de varrer; não convida |
| Explorar | Nove atalhos de editoria com "Nenhuma matéria hoje"; repete a home | Vazio visível, sem função própria |
| Fontes | Cada card carrega 4 estatísticas, 2 botões e "Ocultar"; seção "Últimas das fontes" com plaquetas repetidas | Excesso de informação por card |
| **Login** | Em produção o botão do Google é um botão de contorno **só com texto** ("Entrar com Google"), **sem logotipo**, **depois** do formulário e do link por e-mail; no cadastro não existe | Passa despercebido, parece suspeito, ninguém clica |
| **Pergunte** | Formulário de campo único numa coluna estreita com metade da tela vazia; resposta é uma página, não uma conversa | Não mostra como funciona; interação pouco sugestiva |
| Conta, favoritos, alertas | Padrão de formulário simples, estados corretos mas sem hierarquia de benefício | Pouca motivação para criar conta |

## 3. Abordagens

- **A. Polimento por tela.** Menor risco, impacto médio; mantém a hierarquia plana.
- **B. Recomposição em torno de hierarquia noticiosa, imagem e fluxo (escolhida).** Novo sistema de card, rótulos contextuais, home e matéria reorganizadas, login em destaque, Pergunte em chat. Marca e tokens intactos.
- **C. Redesenho completo.** Contradiz `DESIGN.md` e descarta o brand kit; rejeitada.

Execução em fases independentes e publicáveis.

## 4. Design

### 4.1 Origem e revisão: sem OriginStrip, sem "IA", sem "normalizado"

Vocabulário público (decisão do dono, v3). A leitora vê só **de onde veio** e **quem revisou**:

| Situação | Texto público |
|---|---|
| Reportagem própria | **ORIGINAL CITYNEWS** (plaqueta) |
| Texto feito a partir de outras fontes | "Feito a partir de 2 fontes" (texto, sem plaqueta) |
| Conteúdo de outro veículo | **AGREGADO · fonte** (plaqueta) |
| Publicada pelas regras, sem leitura prévia de pessoa | "Revisado automaticamente" (texto) |
| Lida por pessoa da redação | "Revisado por Marina Arruda" (texto) |
| Imagem de terceiros | "Reprodução web · Fonte" (legenda, com crédito e link) |

Não aparecem em nenhuma tela pública: "normalizado", "resumo por IA", "publicado automaticamente", "gerado por IA", "inteligência artificial" nem "IA" como rótulo. O resumo no alto da matéria chama-se "Resumo em poucos segundos", sem rótulo de origem do texto.

Onde mora cada informação (sem faixa que agrupe):
- **Card:** no máximo **1 plaqueta** (ORIGINAL CITYNEWS ou AGREGADO · fonte); a origem do texto derivado e a revisão vão em **texto** na linha de metadado: "Feito a partir de 2 fontes · Revisado por Marina Arruda · 8h05".
- **Matéria:** acima do título só kicker e status do assunto. A autoria diz a origem e a revisão em frase. A legenda de cada foto diz "Reprodução web · Fonte". O painel "Como esta matéria foi feita" explica em linguagem simples as mesmas informações (de quantas fontes, quem revisou, de onde vêm as imagens).
- **Agregado:** AGREGADO · fonte como plaqueta única, com o título original, resumo curto e o link.

Decisões registradas, para o dono confirmar ao aprovar esta spec:
1. Isto muda a leitura do `CLAUDE.md` §5.3 e do `DESIGN.md` §5 (que listam NORMALIZADO PELO CITYNEWS, RESUMO POR IA, PUBLICADO AUTOMATICAMENTE e IMAGEM GERADA POR IA). Os arquivos são atualizados na UI-T3.
2. **Fica fora do corte, por prudência**: (a) a página "Como usamos IA" e os textos de privacidade (transparência legal; o rodapé pode chamá-la de "Como funciona o CityNews"); (b) o rótulo de **imagem gerada por IA**, caso um dia exista gerador (hoje não há, então nunca aparece); (c) o Estúdio e o Control Center, onde a equipe precisa saber o que a máquina fez.
3. "Revisado automaticamente" descreve a publicação por regras versionadas e verificação de fontes; se um dia houver revisão por pessoa depois, o texto troca sozinho para "Revisado por …".
4. Nomes internos no código (`normalized`, `ai_summary`) permanecem; mudam só os textos exibidos.

### 4.2 Chrome
- `ConsentBanner`: faixa baixa compacta (celular ≤ 15% da altura; desktop barra de uma linha). Texto legal e as três escolhas iguais. Remove o `border-t-2` que o detector acusa.
- `SiteHeader`: uma linha principal e a linha de editorias; no celular, fade nas bordas da fileira rolável e a editoria ativa centralizada; altura reduz ao rolar.
- `SiteFooter`: só renderiza campos institucionais preenchidos.

### 4.3 Cards (variantes `lead`, `standard`, `compact`, `list` já existem)
Ajusta a escala de manchete (Source Serif 600) e o uso por tela. O `TypographicCover` (o bloco chapado) é redesenhado: no `lead` vira cabeçalho tipográfico de altura de texto (faixa fina da editoria + ícone + metadado); em `standard` e `list`, miniatura Névoa com ícone da editoria. Título de página sempre menor que a manchete lead.

### 4.4 Home
Mobile ≤ 5,5 alturas de tela: lead com imagem + manchete + resumo; "Agora" (6 itens); trilhos horizontais (Assuntos, Coleções, Agenda, Serviços); editorias em abas; Mais lidas em lista; Panorama abaixo da dobra com superfície própria. Desktop: grade de 12 colunas, lead (8) + Agora (4), três destaques com imagem, módulos em 2 colunas. Ordem pela cena das 7h.

### 4.5 Matéria
Cabeçalho: kicker + status, título, linha fina, autoria com origem e revisão em frase ("Feito a partir de 2 fontes · Revisado por Marina Arruda"), datas. Ações em uma linha: **Salvar** em destaque; Compartilhar, Ajustar leitura e Informar problema como botões de ícone com nome acessível (texto a partir de 640 px). Leitura 68ch, 18→20 px, primeira frase em negrito, "Fontes" expansível após o corpo, barra de progresso, modo escuro ≥ 7:1. Painel "Como esta matéria foi feita" recolhível no celular.

### 4.6 Listas e descoberta
- **Editoria / Assunto / Coleção:** `lead` + `standard` com imagem; ranking lateral com `list`; filtros numa barra única com estado na URL; vazio, carregando e erro com ação.
- **Busca:** campo fixo no topo; abas como chips; filtros aplicam na hora (sem botão "Aplicar"), "Filtros" abre folha no celular; resultados com miniatura; "Perguntar ao CityNews" como linha de destaque no topo dos resultados, abrindo o chat com a mesma pergunta.
- **Explorar:** só mostra o que tem conteúdo (editoria sem matéria sai do atalho ou vira link simples); papel próprio: descoberta (assuntos, coleções, guia, Fontes e Agenda) em vez de repetir a home.
- **Agenda:** atalhos "Hoje / Amanhã / Fim de semana / Grátis"; dias agrupados com cards de evento (data, imagem ou capa tipográfica, título, local · hora, preço, Salvar, + Calendário); desktop com lista + mini-calendário lateral; Lista/Calendário como alternância de contraste alto.
- **Fontes e Panorama:** card de fonte enxuto (avatar, nome, categoria · local, uma justificativa, Seguir, Ver matérias); estatísticas em "Detalhes"; "Ocultar" no menu `⋯`. Panorama continua em superfície própria com AGREGADO · fonte como plaqueta única.

### 4.7 Login, cadastro e recuperação (Google em destaque)
- **Botão do Google** segue as diretrizes de marca: fundo **branco**, borda neutra, **logotipo "G" colorido** oficial, texto "Continuar com o Google", altura 56 px, largura total, leve elevação, **primeiro elemento do formulário** (acima do e-mail e senha), no login e no cadastro. Abaixo, uma linha de privacidade: "Usamos seu nome e e-mail para criar a conta."
- Em seguida o divisor "ou use seu e-mail", e-mail + senha, **Entrar** (primário escuro), "Entrar sem senha" como botão secundário compacto, "Esqueci a senha".
- Rodapé do cartão: "Ainda não tem conta? Criar conta" e **"Continuar sem entrar"** em botão de contorno (regra "Agora não"); 3 benefícios curtos ao lado (desktop) ou acima (celular): Salvos em todos os aparelhos · Alertas do seu bairro · Fontes que você segue.
- Provedor desligado (B-006): o botão some e não deixa texto de "indisponível" no meio da tela; o espaço é ocupado pelo formulário de e-mail.
- Logotipo "G" como arquivo estático de marca (SVG oficial, cores fixas por exigência do Google; exceção documentada à regra de tokens).

### 4.8 Pergunte ao CityNews como chat
Formato difundido de conversa, sem perder as regras de produto.
- **Estrutura:** coluna de mensagens e **campo de envio fixo na base** (acima da barra inferior no celular), `Enter` envia, `Shift+Enter` quebra linha, botão de enviar com nome acessível. Desktop em 3 áreas: histórico local (quando a Personalização foi aceita), conversa central (até 720 px), painel de fontes da resposta selecionada.
- **Vazio:** mensagem de boas-vindas do CityNews (avatar "O Ponto") + 4 perguntas iniciais como botões; aviso fixo de que a resposta pode conter erros.
- **Turno:** bolha da pessoa à direita; do CityNews à esquerda. Enquanto processa, indicador com os passos ("Buscando fontes", "Comparando", "Escrevendo"), anunciado por `aria-live="polite"`. A resposta chega por streaming.
- **Resposta (regra 5 do produto):** "O que se sabe" com cada frase citando fonte numerada [1] [2] (clique abre/rola até a fonte); "Inferência" em bloco próprio com borda tracejada; "Ainda não se sabe" separado; confiança e "consultado às hh:mm"; fontes recolhíveis sob a bolha com rótulo de origem de cada uma; Útil / Não ajudou / Informar erro.
- **Recusa:** com menos de 2 fontes relevantes, a bolha explica o motivo e oferece "Buscar do jeito tradicional". Limite atingido, assistente indisponível e falha viram mensagens do CityNews no mesmo formato, com a ação cabível. Nenhum texto do chat diz "IA" ou "inteligência artificial"; o aviso fixo é "Pode conter erros. Confira nas fontes.".
- **Perguntas seguintes:** cada turno é respondido sobre fontes novas; a pergunta anterior é usada só para completar referências curtas ("e no CPA?"). Sem memória entre sessões; histórico só local e só com consentimento.
- **Compatibilidade:** `/pergunte?q=` continua abrindo a conversa já com a pergunta enviada (link de Busca e das matérias).

### 4.9 Conta, favoritos, alertas, newsletter, institucional
Mesmo grid e escala; estados completos; "Agora não" em todo convite; páginas legais com 68ch. Newsletter, Anuncie, App e Sobre usam blocos de marketing (hero, benefícios, CTA, FAQ) inspirados no TripleD, em Tailwind com tokens.

### 4.10 Imagens: capa e imagem no texto

Regra: **reproduzir a melhor imagem das fontes como capa e uma segunda imagem, de outra fonte, dentro do texto**, sempre com a legenda "Reprodução web · Fonte" (crédito do autor quando houver) e link para a matéria original.

- **Escolha (pipeline):** hoje o passo de imagem pega a primeira candidata que passa na checagem. Passa a avaliar até 4 candidatas de fontes diferentes do assunto e pontuar cada uma (resolução mínima e quanto passa dela, formato paisagem entre 16:9 e 3:2, sem indício de marca d'água, sem texto sensacionalista, nitidez, não duplicada por `phash`). A de maior nota vira **capa**. A segunda maior nota, **de outra fonte e com `phash` distante da capa**, vira **imagem do texto**. Sem segunda candidata boa, a matéria sai só com a capa; sem nenhuma, com a capa tipográfica.
- **Posição:** a imagem do texto entra depois do parágrafo 3 (ou do 2, se o corpo tiver menos de 4 parágrafos); nunca antes do lide; corpo com menos de 2 parágrafos não leva imagem no texto.
- **Legenda:** "Reprodução web · Fonte" em frase, com o crédito do autor ao lado e "Ver original" apontando para a página da fonte. A capa leva a mesma legenda sob a foto. O texto alternativo é obrigatório (checklist do Estúdio continua exigindo).
- **Dados:** `article_media` ganha a coluna `role` (`cover` ou `inline`) e `position` (índice do parágrafo após o qual a imagem entra). A API pública entrega `{ cover, inline }` por matéria; cards usam só a capa.
- **Direitos (regra 11 preservada):** só fontes com política `reproduction`, flag `image_reproduction_enabled` ligada, `robots.txt` respeitado, cópia inteira sem recorte de crédito, remoção em 24 h a pedido do veículo (a remoção de um ativo derruba só aquela imagem; a outra continua). Duas imagens por matéria dobram a exposição a pedidos de remoção; o painel de mídia do Estúdio lista os dois ativos por matéria.
- **Reprocesso:** depois da implantação, o passo de imagem roda de novo nas matérias publicadas que só têm capa ou não têm imagem (idempotente: não troca capa já aprovada por pessoa).
- **Fora do escopo:** extrair imagens do corpo das páginas das fontes (só `og:image` e as já coletadas); galeria; gerar imagem.

## 5. Fora do escopo
Novo conteúdo, rotas ou dados; Estúdio e Control Center; mudança de política de imagem; novo provedor de login além do Google.

## 6. Critérios de aceite (mensuráveis)

1. 1ª dobra do celular (390×844): manchete, resumo e origem principal inteiros; nada fixo cobre mais de 15% da altura.
2. Home mobile ≤ 4.700 px com o seed local.
3. Matéria: no máximo 2 itens antes do `h1`; origem e revisão em frase na autoria; nenhum texto truncado em 360 px; **nenhum componente `OriginStrip` no repositório** (teste de ausência).
4. Cards: no máximo 1 plaqueta; origem do texto derivado e revisão em texto. **Nenhuma rota pública exibe** "normaliz…", "IA", "inteligência artificial" ou "resumo por IA" (teste que varre o HTML das 16 rotas, com exceção das páginas legais listadas).
5. Nenhum bloco de cor chapada sem conteúdo; sem foto → capa tipográfica. Matéria com 2 imagens aprovadas mostra capa e imagem no texto (depois do parágrafo 3), ambas com "Reprodução web · Fonte", crédito e link.
6. Rodapé sem `[PREENCHER]`.
7. Login e cadastro: botão do Google é o primeiro controle, branco, com logotipo "G", 56 px; com o provedor desligado nenhuma frase de indisponibilidade aparece.
8. Pergunte: campo de envio fixo, thread com bolhas, citações numeradas, recusa com <2 fontes, teclado completo (`Enter`, `Shift+Enter`, foco gerido), `aria-live`; `/pergunte?q=` continua funcionando.
9. Lighthouse mobile: LCP ≤ 2,5 s, CLS ≤ 0,1, INP ≤ 200 ms nas 6 rotas medidas; orçamento de JS não sobe além do chat.
10. axe sem violação séria nas rotas públicas; e2e de teclado e foco verdes; contraste ≥ 4,5:1 (7:1 no escuro); alvos ≥ 44 px.
11. `impeccable detect` sem erro nem aviso novo.
12. Relatório com capturas antes/depois (390 e 1280, claro e escuro) em `docs/reports/ui-publica.md`.

## 7. Riscos e decisões
- **Rótulos (regra 3):** o novo vocabulário muda a regra de produto escrita no `CLAUDE.md`; precisa de aprovação do dono (seção 4.1) e de teste por componente.
- **Foto de terceiros (regra 11):** "Reprodução web · Fonte", crédito e link na legenda, sem recorte do crédito; duas imagens por matéria aumentam a exposição a pedidos de remoção.
- **Google:** o logotipo e a cor do botão são exigência de marca; botão em outra cor ou sem o "G" arrisca a revisão do app OAuth.
- **Chat e custo de IA:** cada turno é uma chamada; limites por IP e por sessão do `ask-limit` continuam valendo; recusa sem fonte não gasta modelo.
- **Consentimento:** só layout e tamanho mudam.
