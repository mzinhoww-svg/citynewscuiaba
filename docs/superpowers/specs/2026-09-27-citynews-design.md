# CityNews Cuiabá · Design Spec (mestre)

Status: **aprovada pelo dono do produto em 27/09/2026** para execução autônoma.
Caminho: arquitetural (brainstorming → spec → writing-plans → subagent-driven-development).
Origem: briefings "Produto digital", "Operação autônoma e fontes" e "Fontes preferidas, personalização e login opcional", mais os três conjuntos de artboards do canvas (Brand Case v2, Produto digital, Operação autônoma e fontes).

## 1. Problema e objetivo

Quem mora em Cuiabá recebe notícia fragmentada: portais locais, grupos de WhatsApp, perfis de Instagram e órgãos oficiais, sem contexto nem sinal claro do que está confirmado. O CityNews organiza esse fluxo em um portal próprio, mostra outras coberturas com transparência e mantém a operação de pé com automação supervisionada.

**Objetivo do MVP:** portal público completo e navegável sem conta, com conteúdo próprio e normalizado, Panorama de fontes, Fontes em destaque com recomendação explicável e consentida, busca tradicional e com IA com citações, e um pipeline de ingestão de 30 minutos operado por um Estúdio e um Control Center com regras versionadas.

**Não objetivos do MVP:** comentários públicos, app nativo, monetização programática, expansão para outras cidades, publicação automática em Política, Segurança, Saúde e breaking news.

## 2. Decisões do brainstorming

Cada decisão lista as opções consideradas, a escolhida e o motivo. Estas decisões fecham as "decisões pendentes" dos briefings com um padrão que o time pode revisar depois sem bloquear a execução.

| # | Tema | Opções | Escolha | Motivo |
|---|---|---|---|---|
| D1 | Framework | Next.js App Router · Remix · Astro | **Next.js App Router** na Vercel | Pedido do dono; RSC para SEO de notícia; previews por PR |
| D2 | Estado, fila e auth | Supabase · Neon + serviços separados · Firebase | **Supabase** (Postgres, pgmq, pg_cron, Auth, Storage, pgvector) | Um só lugar para estado, fila, RLS e busca |
| D3 | Agendador do ciclo de 30 min | Vercel Cron · pg_cron + pg_net · GitHub Actions | **pg_cron + pg_net** chamando rota da Vercel; **GitHub Actions** como vigia se o ciclo atrasar > 45 min | Não depende do plano da Vercel para frequência; o banco já é o estado |
| D4 | Execução das etapas | Tudo em uma função · filas por etapa | **Fila pgmq por etapa**, workers em Route Handlers Node com `maxDuration` configurado | Idempotência, retry e reprocessamento por etapa |
| D5 | IA | SDK de um provedor · Vercel AI SDK com registro | **Vercel AI SDK com OpenRouter** (provedor compatível com OpenAI, `baseURL https://openrouter.ai/api/v1`) + tabela `ai_models` e `ai_prompts` versionados; embedding `openai/text-embedding-3-small` (1536) via OpenRouter | Troca de modelo e fallback sem deploy; uma chave só (A-005) |
| D6 | Busca | Serviço externo · Postgres FTS + pgvector | **Postgres híbrido** (FTS `portuguese` + `unaccent` + pgvector, fusão RRF) | Menos peças; suficiente para o volume local |
| D7 | Identidade anônima | Cookie de terceiros · fingerprint · id aleatório local | **UUID v4 em `localStorage` + cookie first-party** só após consentimento de personalização | Privacy-first, sem fingerprint |
| D8 | Onde vive o perfil anônimo | Servidor · navegador | **Navegador** (IndexedDB) com eventos agregados enviados ao servidor apenas se "métricas" ou "personalização" consentidos | Funciona sem conta; apagar é local e imediato |
| D9 | Ranking de fontes | Por cliques · score composto | **Score composto** com pesos configuráveis, teto de 25% por fonte e cota de descoberta 1 em 5 | Pedido explícito do briefing |
| D10 | Política de republicação padrão | Texto integral · resumo · só link | **Título + data + link**; resumo de até 2 frases escrito pelo CityNews conforme a política da fonte; imagem pela política `reproduction` (A-010) | Direito autoral |
| D11 | Autonomia padrão | Tudo com revisão · tudo automático · por categoria | **Por categoria** (tabela na seção 6.4); MVP começa com 100% em revisão e liga autonomia por categoria após 2 semanas de métricas | Governança gradual |
| D12 | Breaking news | Automático · humano | **Sempre humano**; o sistema só abre o assunto como "Em apuração" no Estúdio e alerta o plantão | Risco de erro em alta visibilidade |
| D13 | Imagem gerada | Proibida · permitida com limites | **Permitida**, não fotorrealista, nunca pessoa real, logotipo real, crime, tragédia ou saúde individual | Evita desinformação visual |
| D14 | Login social | Nenhum · Google · Google + Apple | **Google pelo OAuth do Supabase Auth**; e-mail + senha e link mágico com o SMTP do Supabase (A-007, A-008) | Menor atrito, integração nativa |
| D15 | Comentários | Sim · não | **Não no MVP**; reações "Útil" e "Informar problema" | Moderação cara no início |
| D16 | Analytics | Terceiros · first-party | **First-party** na tabela `events`, sem cookies de terceiros | LGPD e consentimento granular |
| D17 | Monetização MVP | Programática · patrocinado nativo | **Patrocinado nativo rotulado**, com regras (1 a cada 6 cards; proibido em Política, urgentes e respostas de IA) | Não degradar a leitura |
| D18 | Fontes | Reais · fictícias | **Reais em staging e produção** (`docs/sources-registry.md`); **fictícias só em testes e CI** (seção 9) | Produto real; testes determinísticos (A-009) |

## 3. Decomposição em subprojetos (um plano por subprojeto)

| Plano | Entrega | Depende de |
|---|---|---|
| **P0 Fundação** | Repositório, Next.js, tokens, fontes, CI, Supabase local, schema base, seed fictício, domínio de rótulos e confiança, StudioShell e SiteShell vazios, deploy na Vercel | n/a |
| **P1 Portal público** | Home, editoria, matéria, assunto, agenda e evento, coleções, Explorar, páginas institucionais, estados globais, SEO técnico | P0 |
| **P2 Fontes, personalização, privacidade e conta** | Consentimento, perfil anônimo, eventos, ranking, Fontes em destaque, página da fonte, Panorama, Favoritos, Alertas, Newsletter, login opcional e migração | P0, P1 |
| **P3 Pipeline e busca** | Registro de fontes, ciclo de 30 min, 20 etapas, dedupe, cluster, confiança, regras, mídia, índice, busca tradicional e busca com IA | P0 |
| **P4 Estúdio editorial** | Newsroom, fila, revisão de item autônomo, editor, versões, calendário, correções, mídia, aprovação de imagem, publicação | P0, P3 |
| **P5 Control Center e administração** | Visão geral, tempo real, fontes, regras de autonomia, falhas e reprocessamento, IA (agentes, modelos, prompts, bases, avaliação, custos, governança), recomendação, usuários, papéis, taxonomia, publicidade, SEO, notificações, auditoria, segurança, integrações, configurações | P0, P2, P3, P4 |
| **P6 Endurecimento e lançamento** | Performance, acessibilidade, segurança de prompts, testes de regressão, DR, observabilidade, runbooks, auditoria final com impeccable e agent-browser | todos |

P1 e P3 podem correr em paralelo após P0.

## 4. Modelo de conteúdo

- `original`: escrito pela redação.
- `normalized`: texto próprio do CityNews a partir de itens coletados (≥ 1 fonte), com fontes citadas.
- `aggregated`: item de outro veículo, exibido como card com link; nunca vira página de leitura integral no CityNews.
- `topic` (assunto): agrupa itens e matérias sobre um fato; tem resumo, convergências, divergências, não confirmados, linha do tempo e confiança do conjunto.

Campos obrigatórios de matéria publicada: título, linha fina, corpo, editoria, ao menos 1 fonte, horário de publicação e de atualização, autor humano ou agente responsável, confiança, rótulos, histórico de versões. Imagem é opcional; sem imagem aprovada, usa card tipográfico da editoria.

## 5. Experiência pública

### 5.1 Navegação

Desktop: barra superior com Início, Explorar, Fontes, Favoritos, Agenda, Busca, Perfil; segunda linha com editorias. Mobile: barra inferior com Início, Explorar, Busca, Favoritos, Perfil. Fontes e Agenda são alcançadas por Explorar e pela home.

### 5.2 Consentimento

Três categorias: **Necessários** (sempre ativos: sessão, segurança, escolha de privacidade), **Métricas agregadas** (contagens sem identificador persistente), **Personalização** (eventos individuais e id anônimo). Banner na primeira visita no rodapé, sem bloquear conteúdo, com "Só o necessário", "Escolher" e "Aceitar recomendações". Sem resposta: tratar como "Só o necessário". Escolha guardada em cookie first-party `cn_consent` (necessário) com versão da política.

### 5.3 Perfil anônimo

`anonId` (UUID v4) criado só com Personalização aceita. Guarda em IndexedDB: fontes seguidas, temas, salvos, histórico de leitura (30 dias), buscas recentes (20), interesses inferidos com evidência, ocultações e motivos. Sem Personalização: fontes seguidas e salvos ainda funcionam localmente (são escolhas explícitas, não rastreamento), mas nada é enviado ao servidor com identificador.

### 5.4 Login opcional

Nunca exigido para navegar, ler, pesquisar, usar a busca tradicional, ver agenda, acessar fontes agregadas, receber recomendações básicas ou usar o portal anônimo. Convite contextual aparece após: salvar, seguir fonte, ativar alerta, criar coleção, sincronizar, acompanhar tema, continuar conversa com IA em outro aparelho. No máximo uma vez a cada 7 dias por gatilho. Textos fixos:

- Convite: "Quer manter suas fontes e notícias salvas em qualquer dispositivo?" · ações "Criar conta", "Entrar", "Agora não".
- Quando uma ação exige conta: "Para sincronizar essa preferência entre dispositivos, é necessário entrar ou criar uma conta. Você pode continuar usando o CityNews sem cadastro."
- Primeira visita, após 3 leituras: "Personalize suas fontes e receba uma experiência mais relevante." · "Escolher fontes agora", "Continuar sem personalizar", "Entrar ou criar conta".

Cadastro pede só nome de exibição, e-mail, senha, aceite de termos e newsletter opcional. Após login, tela de migração com checkboxes (padrão: fontes, salvos, interesses marcados; histórico e conversas desmarcados).

### 5.5 Busca com IA (contrato de resposta)

```ts
type AiAnswer =
  | { kind: "answer"; confidence: "alta" | "média" | "baixa"; facts: Claim[]; inferences: Claim[]; gaps: string[]; conflicts: Conflict[]; sources: SourceRef[]; asOf: string }
  | { kind: "insufficient"; found: SourceRef[]; suggestion: "widen_period" | "traditional_search" | "suggest_story" }
  | { kind: "error"; reason: "timeout" | "provider" | "rate_limited" | "unavailable"; retryAt?: string };
type Claim = { text: string; citations: number[] };           // índices em sources
type Conflict = { topic: string; positions: { text: string; citations: number[] }[] };
```

Regras: toda frase de `facts` tem ≥ 1 citação; `answer` exige ≥ 2 fontes independentes, senão `insufficient`; `confidence` vem de `computeConfidence`; conteúdo patrocinado nunca entra em `sources`. Limites: 20 perguntas/hora anônimo, 60/hora com conta.

## 6. Operação autônoma

### 6.1 Fonte

Campos: nome, slug, URL base, tipo (`rss`, `sitemap`, `api`, `page`, `newsletter`, `social`, `events`), frequência, limite de requisições, prioridade, categorias, localidade, confiabilidade (`primary`, `verified`, `standard`, `low`), política de imagem (`none`, `with_agreement`, `licensed_only`), política de republicação (`link_only`, `summary_2_sentences`), pode ser fonte única (bool), status (`active`, `paused`, `degraded`, `blocked`), responsável, acordo (vigência).

### 6.2 Ciclo de 30 minutos

20 etapas, em 6 fases, com orçamento total de 28 min; o próximo ciclo não inicia se o anterior não terminou a fase de Coleta. Cada etapa é um job idempotente na fila `pipeline` com chave `(item_id, step)`. Retry com espera 1, 4 e 10 min; depois quarentena. Etapas: 1 cron, 2 buscar, 3 validar, 4 extrair, 5 normalizar, 6 deduplicar, 7 agrupar, 8 classificar, 9 localidade, 10 verificar fontes, 11 resumir, 12 título e linha fina, 13 imagem, 14 direitos da imagem, 15 regras, 16 rota (auto ou revisão), 17 publicar ou exceção, 18 registrar, 19 indexar, 20 notificar.

### 6.3 Confiança

`computeConfidence({ independentSources, primarySources, centralConflict, hoursSinceUpdate })`:

- `alta`: independentes ≥ 2, primárias ≥ 1, sem conflito central, atualização ≤ 24 h.
- `baixa`: (independentes ≤ 1 **e** nenhuma primária) ou conflito central.
- `média`: o restante.
- Score numérico: `0.30 * min(indep, 3) / 3 + 0.30 * min(primary, 1) + 0.25 * (centralConflict ? 0 : 1) + 0.15 * freshness`, com `freshness` = 1 (≤ 6 h), 0,6 (≤ 24 h), 0,3 (≤ 72 h), 0 (> 72 h). Arredondar para 2 casas. Exemplos de referência (usados nos testes): 2 independentes + 1 primária + sem conflito + 3 h = 0,90; 1 independente oficial + 3 h = 0,80; 2 independentes sem primária + 3 h = 0,60; 3 independentes + 1 primária + conflito + 30 h = 0,65. O nível segue as regras acima, não o score; o score é comparado com a "confiança mínima" das regras de autonomia.

### 6.4 Regras de autonomia padrão (regras v1)

| Categoria | Modo | Mín. fontes | Exige primária | Exige imagem aprovada | Confiança mínima | Resumo |
|---|---|---|---|---|---|---|
| Serviços | automático | 2 | não | não | 0,60 | 60 palavras |
| Agenda | automático | 1 oficial | sim | não | 0,80 | 60 |
| Clima | automático | 1 oficial | sim | não | 0,80 | 40 |
| Cidade | automático com aviso | 2 | sim | sim | 0,85 | 80 |
| Economia | automático com aviso | 2 | sim | sim | 0,85 | 80 |
| Esportes | automático com aviso | 2 | não | sim | 0,60 | 60 |
| Cultura | revisão | 2 | não | sim | n/a | 80 |
| Política | revisão | 3 | sim | sim | n/a | 100 |
| Saúde | revisão | 2 | sim | sim | n/a | 80 |
| Segurança | bloqueada | n/a | n/a | n/a | n/a | n/a |

Ordem de avaliação em `decidePublication`: tema sensível → mínimo de fontes e primária → conflito central → imagem → confiança e modo da categoria. A primeira regra que se aplica decide. No MVP, `global.forceReview = true` até ser desligado no Control Center com duas aprovações.

### 6.5 Mídia

Cascata: foto própria ou com acordo → **reprodução da imagem da matéria original** quando a fonte tiver `image_policy = 'reproduction'` e a flag `image_reproduction_enabled` estiver ligada (rótulo REPRODUÇÃO · fonte, crédito do autor quando houver, link, sem recorte de crédito ou marca d'água, cópia em Storage com proveniência, remoção em 24 h a pedido) → ilustrativa do acervo → gerada (se o tema permitir) → card tipográfico. Não há banco de imagens licenciadas no MVP. Verificações: resolução ≥ 1200 px no lado maior, hash perceptual contra acervo, marca d'água, adequação semântica, bloqueio de sensacionalismo, proveniência registrada.

### 6.6 Segurança de prompt

Todo texto externo passa por `sanitizeExternalText`: remove HTML, controla tamanho, detecta padrões de instrução ("ignore", "desconsidere as regras", "system:", "você agora é"), e é enviado ao modelo entre `<fonte_externa id="...">` e `</fonte_externa>` com instrução fixa de tratar como dado. Detecção → item em quarentena e alerta de segurança.

## 7. Fontes em destaque e ranking

### 7.1 Sinais e pesos padrão (`rec-v1`)

| Componente | Peso | Sinais |
|---|---|---|
| Popularidade geral | 0,35 | sessões que abriram notícia da fonte, cliques, janela 7 dias com meia-vida de 3 dias |
| Comportamento individual | 0,25 | leituras qualificadas, fontes seguidas, buscas, eventos consultados, retornos |
| Recência | 0,15 | matérias da fonte nas últimas 24 h, última atualização |
| Salvamentos e retornos | 0,10 | salvamentos, compartilhamentos, taxa de retorno |
| Qualidade operacional | 0,10 | disponibilidade 30 dias, taxa de erro, links quebrados |
| Diversidade e descoberta | 0,05 | bônus para fonte/tema pouco explorado pelo leitor |

Sem Personalização, o peso individual vai a 0 e os demais são renormalizados. Pesos editáveis no Control Center; nunca exibidos ao leitor como verdade.

### 7.2 Sinal fraco

Não conta como preferência: permanência < 10 s, rolagem < 25%, interação única isolada, clique seguido de volta em < 5 s. Leitura qualificada: ≥ 30 s **e** rolagem ≥ 50%, ou ≥ 60 s.

### 7.3 Proteções

Teto de 25% por fonte em qualquer lista; cota de descoberta de 1 a cada 5 itens em "Recomendadas"; popularidade em janela deslizante; nenhuma inferência sensível; linguagem probabilística.

### 7.4 Justificativas (textos fixos, `explainRecommendation`)

"Popular em Cuiabá" · "Popular entre leitores da sua região" · "Recomendado porque você acompanha {tema}" · "Porque você acompanha notícias de Cuiabá" · "Você acessou este veículo recentemente" · "Em alta nesta semana" · "Fonte semelhante às que você lê" · "Fonte nova sobre um tema que você pesquisou" · "Veículo seguido por você" · "Recomendado para ampliar a diversidade de fontes" · "Nova recomendação".

Motivos para ocultar: "Não tenho interesse" · "Já conheço esta fonte" · "Não quero ver este tema" · "Não quero recomendações personalizadas" (este último desliga a personalização).

### 7.5 Listas da área Fontes

Mais acessadas · Em alta nesta semana · Recomendadas para você · Escolhidas por você (Fontes que você segue) · Fontes locais · Fontes verificadas · Novas para descobrir. Filtros: hoje, nesta semana, tendência, Cuiabá, Mato Grosso, nacionais, cultura, esporte, economia, serviços.

## 8. Papéis

`admin`, `editor_chefe`, `editor`, `jornalista`, `revisor`, `operador_ia`, `analista`, `moderador`, `leitura`. Matriz completa em `docs/architecture.md#permissoes`. Mudanças críticas (autonomia para automático, prompt em produção, pesos de recomendação, papéis de admin, desligar regra de segurança, desligar `forceReview`) exigem duas pessoas diferentes.

## 9. Fontes e dados de teste

**Produção e staging:** somente fontes reais, a partir de `supabase/seed_sources_real.sql`. Todas entram `paused` e só são ativadas depois de descoberta do feed, `robots.txt` e `testConnection`. Coletor identificado como `CityNewsBot/1.0`.

**Testes e CI:** veículos fictícios, para resultados determinísticos: Folha do Cerrado, Diário da Baixada, MT Agora, Portal Várzea, Rádio Pantanal, Correio Mato-grossense, Agro em Pauta MT, Cena Cuiabana, Placar MT, Agência MT (governo), Diário Oficial de Cuiabá, Brasil Hoje. Pessoas fictícias: Marina Arruda (editora-chefe), Juliana Campos, Rafael Siqueira, Beatriz Lemos, Thiago Moraes, Carlos Nunes, Otávio Reis (editor), Helena Costa (admin), Diego Prado (operador de IA), Paulo Rezende (leitor). Locais reais de Cuiabá podem ser usados (CPA, Porto, Jardim Itália, Orla do Porto, Sesc Arsenal, Parque Mãe Bonifácia, Arena Pantanal).

## 10. Requisitos não funcionais

- WCAG 2.2 AA em todas as telas.
- LCP p75 mobile ≤ 2,5 s; INP ≤ 200 ms; CLS ≤ 0,1; JS inicial da home ≤ 170 kB gzip.
- Disponibilidade do portal 99,9%; portal cai para modo leitura via cache se o banco estiver fora.
- RPO 15 min, RTO 1 h.
- Retenção: eventos individuais 90 dias, depois agregados; conversas com IA 30 dias; auditoria 5 anos.
- Custo-alvo por notícia publicada ≤ R$ 4; orçamento diário de IA configurável com pausa a 100%.

## 11. Critérios de aceite do produto

1. Visitante lê, pesquisa, usa agenda, explora e segue fontes sem login.
2. Login aparece só como convite contextual, sempre com "Agora não".
3. Fontes preferidas podem ser escolhidas manualmente e também são recomendadas.
4. Ranking combina popularidade, comportamento individual, recência e diversidade; não depende só de cliques.
5. Usuário desativa personalização e entende por que cada fonte foi recomendada.
6. Sem histórico, a área Fontes mostra populares e locais, nunca vazia.
7. Fontes locais têm destaque.
8. Todo conteúdo agregado está rotulado e abre no original; a área de fontes não substitui o portal.
9. Administrador audita e ajusta pesos, fixa, destaca, bloqueia e exclui fontes da recomendação, vê justificativas.
10. Toda tela tem estados de carregamento, erro, vazio e sucesso, em desktop e mobile.
11. Toda publicação automática tem regra, justificativa, confiança e pode ser desfeita em um clique.
12. Busca com IA nunca responde sem fonte e diferencia fato, inferência, lacuna e conflito.
