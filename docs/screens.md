# Inventário de telas · CityNews Cuiabá

Cada tela tem: rota, perfil, objetivo, blocos, estados obrigatórios, dados, critérios de aceite e situação no canvas.

Situação: **Canvas** = existe artboard de referência (código) · **Refinar** = existe, mas precisa das mudanças listadas · **Nova** = não existe no canvas; especificada aqui pela primeira vez.

Composição de referência: `design-system/ui_kits/app` (mobile) e `design-system/ui_kits/web` (desktop), corrigidos pelo `DESIGN.md` §2. Ações de matéria seguem R8 (sem curtidas e comentários).

Estados padrão (valem para toda tela e não são repetidos): `loading` com skeleton após 150 ms e `aria-busy`; `error` com mensagem em linguagem simples, ação "Tentar de novo" e preservação de filtros e texto digitado; `empty` com explicação e próxima ação; `success` com toast ou alerta inline. Toda tela funciona em 360 px, 768 px e 1280 px.

---

## A. Portal público

### P01 · Home · `/`
- **Perfil:** todos. **Situação:** Refinar (T01, S01).
- **Objetivo:** entender o dia em 30 s e chegar à matéria certa.
- **Blocos, nesta ordem:** UrgentBar (só se houver urgente publicado por humano) · Manchete (lead com rótulos, confiança, "Resumo em 20 s") + NowList "Agora" (6 itens, com rótulo de modo de publicação e "próximo ciclo em n min") · Assuntos em destaque (3 TopicCards) · Coleções (4) · Perto de você (bairro escolhido manualmente; sem escolha, CTA "Escolher bairro") · Agenda (3 próximos) · Serviços (4 ServiceTiles) · Blocos de editoria (Política, Economia, Cultura) · Recomendado para você + 1 Patrocinado (regra 1:6) · Mais lidas (5) · Fontes em destaque (fileira de avatares) · "Veja também em outros portais" (4 AggregatedCards, superfície `--surface-aggregated`, rótulo AGREGADO, texto de aviso) · Newsletter (só e-mail) · Rodapé.
- **Estados específicos:** sem urgente (faixa some); sem personalização ("Recomendado" vira "Mais lidas em Cuiabá" com rótulo "Popular em Cuiabá"); banco fora (cache ISR de até 10 min com aviso "Atualizado às hh:mm").
- **Dados:** `articles` publicadas, `topics` ativos, `collections`, `events`, `services_snapshot`, `aggregated_items` das fontes com `display_policy`.
- **Aceite:** conteúdo CityNews ocupa 100% da primeira dobra; Panorama nunca acima da dobra; cada card mostra ≤ 4 rótulos; ConsentBanner não cobre o h1 em 360 px.

### P02 · Editoria · `/[editoria]` (cidade, politica, economia, cultura, esportes, entretenimento, gastronomia, servicos, guia-cuiaba)
- **Situação:** Refinar (S02). Adicionar rótulos de origem, filtro "Origem" e subeditorias.
- **Blocos:** cabeçalho (nome, descrição, "Atualizado há n min · x matérias hoje", botão Seguir editoria) · ChipGroup de subeditorias · filtros (período, bairro, origem, ordenar por recentes ou relevância) · pílula "n novas matérias · mostrar" (polling 60 s) · lista com carregar mais (12 por página, URL com `?page=`) · lateral com Mais lidas da editoria.
- **Estados:** vazio com filtro ("Nenhuma matéria de {sub} em {bairro} nos últimos 7 dias" + "Ver últimos 30 dias" + "Seguir {bairro}").
- **Aceite:** filtros refletidos na URL; voltar do navegador restaura filtros e rolagem.

### P03 · Matéria · `/materia/[slug]`
- **Situação:** Refinar (T03, S03).
- **Blocos:** breadcrumb · kicker · rótulos + ConfidenceMeter · título (serif) · linha fina · autoria com datas de publicação e atualização (`<time datetime>`) · ações Salvar, Compartilhar (ShareSheet), Ajustar leitura (tamanho do texto, tema), Informar problema · bloco "Resumo em poucos segundos" (revisor ou "Revisado automaticamente", "Foi útil?"; sem rótulo de origem do texto) · figura com rótulo de imagem e crédito · UpdateNote e CorrectionNote · corpo (68ch) · Fontes (primária/secundária, link externo) · Tags · "Pergunte sobre esta matéria" (3 perguntas → `/pergunte?q=`) · Semelhantes (assunto + 2) · lateral "Como esta matéria foi feita" (rótulos explicados, link para histórico público de versões) e ReportProblemForm.
- **Estados:** matéria atualizada enquanto lida (aviso fixo "Esta matéria foi atualizada às hh:mm · ver o que mudou"); matéria despublicada (410 com explicação e link para correções).
- **Aceite:** JSON-LD `NewsArticle` com `dateModified`, `author`, `citation`; barra de progresso de leitura; histórico de versões público mostra só versões publicadas.

### P04 · Histórico público de versões · `/materia/[slug]/historico` · **Nova**
- **Blocos:** lista de versões publicadas com data, tipo (atualização, correção), resumo da mudança, diff textual simplificado (adições sublinhadas, remoções riscadas, com legenda textual).
- **Aceite:** não expõe comentários internos nem decisões da IA não publicadas.

### P05 · Assunto · `/assunto/[slug]`
- **Situação:** Canvas (T02).
- **Blocos:** status do assunto + confiança + contagem de matérias e fontes · título · resumo do assunto (IA, revisado) · Concordam / Divergem / Ainda não confirmado · filtros (origem, período, local, fonte) · Do CityNews · Cobertura de outros veículos (AggregatedCards) · lateral: Timeline, Seguir assunto, "Como medimos a confiança", Perguntas frequentes (`<details>`).
- **Estados:** "Em apuração" com faixa `--warn-bg`; assunto encerrado ("Sem novidades desde dd/mm").

### P06 · Lista de assuntos · `/assuntos` · **Nova**
- **Blocos:** filtros (em apuração, confirmados, da semana, por editoria) · lista de TopicCards com número de fontes e última atualização · ordenação por atualização.

### P07 · Explorar · `/explorar` · **Nova**
- **Objetivo:** hub de descoberta sem personalização obrigatória.
- **Blocos:** editorias em grade de atalhos (ícone + nome + matérias hoje) · Assuntos em destaque · Coleções · Mais lidas da semana · atalho para Fontes e Agenda · "Guia Cuiabá" (serviços evergreen).

### P08 · Coleção · `/colecoes/[slug]` · **Nova**
- **Blocos:** capa (título, descrição editorial, curador, data) · itens ordenados (matérias, eventos, guias; agregados permitidos com rótulo) · Seguir coleção · compartilhar.
- **Aceite:** itens agregados continuam abrindo no original.

### P09 · Agenda · `/agenda`
- **Situação:** Refinar (S06). Adicionar filtro de origem do evento (oficial, organização, sugerido por leitor aprovado).
- **Blocos:** alternância Lista/Calendário (estado na URL `?view=`) · filtros data, categoria, preço (só gratuitos), local, faixa etária · lista agrupada por dia · calendário mensal com contagem por dia · "Sugerir um evento".
- **Estados:** sem eventos no filtro ("Nenhum evento gratuito para crianças neste fim de semana" + "Ver próximos 30 dias").

### P10 · Evento · `/agenda/[slug]`
- **Situação:** Canvas (painel de detalhe em S06).
- **Blocos:** imagem com rótulo · categoria · título · data e hora · local com mapa estático e "Como chegar" · classificação e acessibilidade · preço · descrição · organizador · "Informações confirmadas pela organização em dd/mm" · Adicionar ao calendário (arquivo .ics + Google) · Compartilhar · Salvar · Relacionados.
- **Aceite:** JSON-LD `Event`; `.ics` válido com fuso `America/Cuiaba`.

### P11 · Sugerir evento · `/agenda/sugerir` · **Nova**
- **Sem login.** Campos: nome do evento, data e hora de início e fim, local (texto + bairro), preço (gratuito ou valor), faixa etária, link oficial, descrição (500 caracteres), contato do responsável (e-mail), aceite de uso.
- **Estados:** erro por campo com exemplo; sucesso "A equipe de Agenda revisa em até 48 h e avisa por e-mail."
- **Aceite:** proteção anti-spam (honeypot + limite por IP); entra na fila do Estúdio como `event_submission`.

### P12 · Busca tradicional · `/busca?q=`
- **Situação:** Refinar (T10, S04).
- **Blocos:** campo com autocomplete (sugestões + recentes locais, removíveis) · abas por tipo (Tudo, Matérias, Assuntos, Eventos, Serviços, Outros veículos) · filtros (origem, editoria, local, período, fonte, autor, tipo) · resultados agrupados por assunto quando ≥ 2 itens do mesmo assunto · destaque de termos com `<mark>` · atalho "Perguntar à IA" com o mesmo texto.
- **Estados:** carregando; nenhum resultado com correção ortográfica ("Você quis dizer…"); erro com resultados em cache da última busca.
- **Aceite:** busca sem acento acha com acento; filtros na URL; 300 ms p75.

### P13 · Pergunte ao CityNews · `/pergunte`
- **Situação:** Canvas (T07, S05).
- **Blocos:** histórico de conversas (lateral desktop, sheet mobile; só local se Personalização aceita) · thread com pergunta, AiAnswer (fatos com citações, inferência rotulada, lacuna, conflito), confiança e "consultado às hh:mm" · refinamentos (chips) · comandos (/resumo do dia, /agenda, /bairro, /serviços) · SourceRail com cada fonte (rótulo de origem, data, abrir) · feedback (Sim, Não, Reportar erro) · aviso fixo de que a resposta pode conter erros.
- **Estados:** processando (passos visíveis), sem dados (`insufficient`), falha (fallback para busca tradicional com os resultados abaixo), limite (horário de liberação), indisponível (status público), conflito, baixa confiança.
- **Aceite:** resposta chega por streaming; `aria-live` anuncia o fim; nenhuma frase factual sem citação.

### P14 · Fontes em destaque · `/fontes`
- **Situação:** Canvas (T05); adicionar aba **Novas para descobrir**.
- **Blocos:** título e aviso "Popularidade não é selo de qualidade" · Switch de personalização · fileira "Mais acessadas em Cuiabá" · filtros (hoje, semana, tendência, Cuiabá, MT, nacionais, cultura, esporte, economia, serviços) · abas Mais acessadas, Em alta nesta semana, Recomendadas para você, Fontes que você segue, Fontes locais, Fontes verificadas, Novas para descobrir · grade de SourceCards · ocultar com motivo e desfazer.
- **Estados:** sem histórico (populares + locais + seleção manual + explicação); personalização desligada (aba Recomendadas mostra populares da região com rótulo "Popular entre leitores da sua região"); fonte indisponível no card ("Sem atualização há 3 h").
- **Aceite:** nenhuma fonte > 25% da lista; ≥ 1 item de descoberta a cada 5 em Recomendadas; cada card tem justificativa.

### P15 · Página da fonte · `/fontes/[slug]`
- **Situação:** Canvas (T06).
- **Blocos:** avatar, nome, selos, descrição, "Conteúdo pertence a {fonte}", alcance aproximado, matérias hoje, última atualização · Seguir / Abrir site da fonte · convite contextual de sincronização (não bloqueante) · filtros por editoria · lista de AggregatedCards (título original, resumo permitido, rótulo, data, "Abrir original") · link quebrado reportável · lateral "Sobre esta fonte no CityNews" (integração, frequência, exibição, imagens, acordo, disponibilidade 30 d, contato para correção ou remoção).

### P16 · Panorama de fontes · `/panorama`
- **Situação:** Canvas (T04).
- **Blocos:** seletor de fontes exibidas (local) · temas · "Comparar coberturas" do assunto mais ativo (colunas por veículo, CityNews em destaque neutro, cobriram, diferença, sem cobertura) · Mais recentes das suas fontes (recentes ou mais lidas).
- **Aceite:** visual sempre em `--surface-aggregated`; nenhum item sem rótulo AGREGADO.

### P17 · Favoritos · `/favoritos` · **Nova no desktop** (mobile no canvas T12)
- **Abas:** Salvos (lista de leitura com "não lido", "lido 60%", filtro por editoria, remover), Fontes seguidas (reordenar, deixar de seguir), Temas e assuntos seguidos, Coleções pessoais (criar, renomear, apagar).
- **Estados:** vazio por aba com ação ("Toque no marcador em qualquer matéria para ler depois"); aviso "Salvos só neste aparelho" quando anônimo, com "Sincronizar (opcional)".
- **Aceite:** funciona offline para leitura de salvos (service worker com as 20 últimas salvas, mais as 30 últimas lidas, a home e as editorias abertas, cada cópia com "Salva às HHhMM, pode estar desatualizada." — spec 2026-09-28 D-P03; `docs/reports/pwa.md`).

### P18 · Alertas · `/alertas` · **Nova no desktop**
- **Blocos:** alertas ativos (bairro, tema, assunto, urgentes, agenda) com frequência (imediato, resumo diário, semanal) e canal (navegador, e-mail) · criar alerta (tipo → alvo → frequência → canal) · limites ("no máximo 3 por dia", janela de silêncio 22h–7h).
- **Bloco "Avisos no celular e no computador" (push, spec 2026-09-28 §7.5):** estados sem suporte, sem chave VAPID, iPhone fora do app ("Como adicionar"), desligado (texto do pré-prompt + "Ativar avisos"), perdido, negado (instruções do navegador detectado + "Já reativei") e ativo (três tipos, silêncio que só aumenta 18–22h/7–10h, limite 1–3, "O que você segue", "Desativar avisos" apaga a inscrição no servidor). Alertas imediatos de bairro ficam com o push quando ele está ativo (D-P20).
- **Estados:** permissão de notificação negada no navegador (explica como reativar); e-mail não confirmado.
- **Aceite:** alerta de navegador sem conta; alerta por e-mail exige só e-mail confirmado; `tests/e2e/push-reader.spec.ts`, `tests/a11y/pwa.spec.ts`.

### P19 · Newsletter · `/newsletter` · **Nova**
- **Blocos:** lista de newsletters (Cuiabá em 5 minutos · diária 7h; Agenda do fim de semana · quinta 12h; Política da semana · sexta 18h) com amostra da última edição · inscrição com e-mail e escolha das listas · centro de preferências via link assinado (`/newsletter/preferencias?token=`) · confirmação dupla.
- **Estados:** e-mail inválido; já inscrito; link expirado; cancelado ("Você não receberá mais… Mudou de ideia?").

### P20 · Perfil · `/perfil`
- **Situação:** Refinar (S07, T08 e T12).
- **Anônimo:** cartão "Seu perfil neste navegador" (id local, criado em, contagens, aviso de perda), atalhos para Favoritos, Alertas, Privacidade, "Criar conta para sincronizar".
- **Com conta:** nome, e-mail, bairro principal, sessões ativas, alterar senha, sair de todos os dispositivos, exportar dados, excluir conta (confirmação digitando EXCLUIR; efetiva em 7 dias).

### P21 · Como usamos suas recomendações · `/privacidade/recomendacoes`
- **Situação:** Canvas (T08).
- **Blocos:** suas escolhas (3 categorias) · seu perfil neste navegador · interesses considerados (com evidência e "sinal fraco: ainda não usado") com Remover · Apagar histórico local · Redefinir recomendações · Desativar recomendações personalizadas · Notificações · Política de privacidade.

### P22 · Central de privacidade (banner e preferências) · componente global + `/privacidade`
- **Situação:** Refinar (banner em T01; página nova).
- Banner da primeira visita (rodapé, não modal) e página com o texto da política em linguagem simples, cookies por categoria, direitos LGPD e contato do encarregado.

### P23 · Onboarding de fontes · componente `FirstVisitInvite` · **Nova no desktop**
- Aparece após 3 leituras qualificadas na sessão, como painel lateral não modal: "Personalize suas fontes e receba uma experiência mais relevante." Ações "Escolher fontes agora" (abre seletor com 12 fontes: 6 locais, 3 estaduais, 3 temáticas), "Continuar sem personalizar", "Entrar ou criar conta".

### P24 · Institucionais · **Novas**
- `/sobre`, `/principios-editoriais`, `/correcoes` (lista pública de correções com data e link), `/direito-de-resposta` (formulário), `/anuncie`, `/contato`, `/termos`.

### P25 · Erros e sistema · **Novas**
- `404` ("A matéria pode ter sido movida. Busque pelo título ou volte ao início." + busca), `410` (despublicada, com motivo), `500` (mensagem e status), offline (`/offline.html`, spec 2026-09-28 §8.3: "Sem conexão" com as listas Páginas, Salvas e Lidas recentemente do próprio cache; CSS e textos gerados de `src/offline-page`), manutenção (modo leitura).

### P26 · Baixar o app · `/app` · **Nova** (spec 2026-09-28 §7.9)
- Explica o que o app instalável faz (ler offline, avisos), como instalar no Android/Chrome (botão "Instalar" quando o navegador oferece; "Já instalado" em standalone), no iPhone (Compartilhar → Adicionar à Tela de Início) e no computador; link "Baixar o app" no menu e no rodapé.
- **Aceite:** `tests/e2e/install.spec.ts`, `tests/a11y/pwa.spec.ts`.

## B. Conta (opcional)

### C01 · Convite contextual · componente `LoginInvite`
- **Situação:** Canvas (T09, T11). Sheet no mobile, popover ancorado no desktop. Texto e ações fixos (spec 5.4). Frequência: 1 por gatilho a cada 7 dias.

### C02 · Entrar · `/entrar`
- E-mail, senha, "Esqueci a senha", Google, link mágico, "Continuar sem login". Erro genérico após falha ("E-mail ou senha incorretos") com contagem de tentativas restantes; bloqueio temporário de 15 min após 5 falhas.

### C03 · Criar conta · `/criar-conta`
- Nome de exibição, e-mail, senha (≥ 8), termos (obrigatório), newsletter (opcional). Força da senha em texto, não só cor.

### C04 · Recuperar senha · `/recuperar-senha` · **Nova**
- E-mail → mensagem neutra ("Se houver conta com este e-mail, enviamos um link") → `/redefinir-senha?token=` com nova senha e confirmação → sucesso com login automático.

### C05 · Confirmar e-mail · `/confirmar?token=` · **Nova**
- Sucesso, token expirado (reenviar), já confirmado.

### C06 · Migrar dados locais · `/entrar/migrar` · **Canvas (T09)**
- Checkboxes com contagens; "Levar selecionados" · "Começar do zero"; progresso; sucesso "3 fontes e 14 salvos sincronizados"; conflito (item já existe na conta → mantém ambos, sem duplicar).

### C07 · Convite de instalação · componente `InstallInvite` · **Nova** (spec 2026-09-28 §7.2)
- Faixa discreta "Instalar o app" na 2ª visita ou depois de 3 leituras qualificadas, nunca em standalone nem junto com outro convite (vaga única: consentimento > login > notificações > instalação); "Agora não" silencia 14 dias; após 3 recusas some e "Baixar o app" fica no menu e no rodapé.

### C08 · Passos do iPhone · diálogo `IosInstallSteps` · **Nova** (spec 2026-09-28 §7.3)
- No Safari do iPhone, "Instalar" (ou "Como adicionar" em Alertas) abre "Adicionar o CityNews à Tela de Início": Compartilhar → Adicionar à Tela de Início → Adicionar.

### C09 · Pré-prompt de notificações · componente `NotificationInvite` · **Nova** (spec 2026-09-28 §7.4)
- Só depois de seguir fonte/editoria/assunto, criar alerta de navegador ou abrir matéria urgente, com a permissão ainda não decidida: "Quer receber avisos?" + "Avisamos só do que você segue e de urgências, no máximo 3 por dia. Entre 22h e 7h, só urgências."; "Ativar" chama o pedido nativo e cria a inscrição com os alvos explícitos; "Agora não" nunca chama o pedido nativo e silencia 14 dias (3ª recusa: nunca mais). iPhone fora do app mostra C08.
- **Aceite:** `tests/e2e/push-reader.spec.ts`, `src/components/editorial/NotificationInvite.test.tsx`.

## C. Estúdio (redação)

Shell: `/estudio`, sidebar com Redação, Control Center e Governança filtrada por papel; busca global (Ctrl K); notificações; troca de plantão.

### E01 · Newsroom · `/estudio` · Canvas (U01, E01)
- KPIs do dia, fila com abas (Tudo, Fila de exceção, Publicadas automaticamente nas últimas 24 h, Minha fila, Temas sensíveis), recomendação da IA vs responsável, faixa de aviso sobre itens automáticos.

### E02 · Fila de matérias · `/estudio/fila` · Canvas (U01)
- Tabela completa com filtros (estado, editoria, origem, confiança, responsável, prazo), ações em lote (atribuir, pedir revisão, despublicar automáticos selecionados com motivo).

### E03 · Revisão de item autônomo · `/estudio/fila/[id]` · Canvas (U02)
- Rótulos, confiança, estado · campos modificados (IA vs humano) · origem e fontes relacionadas com papel · justificativa da IA (agente, versão do prompt, versão das regras, horário) · decisão recomendada × decisão humana · Rejeitar, Pedir ajuste, Reprocessar, Aprovar e publicar · imagem escolhida · alertas · histórico.

### E04 · Editor de matéria · `/estudio/materias/[id]` · Refinar (E02)
- Adicionar: bloco "Fontes" estruturado (item coletado, papel, confirmada), confiança calculada ao vivo, rótulos gerados, seletor de assunto, alerta de conflito entre fontes, modo "Atualização" e modo "Correção" para matéria publicada.

### E05 · Comparação de versões · `/estudio/materias/[id]/versoes` · Canvas (E03)

### E06 · Publicação e agendamento · modal `PublishDialog` · **Nova**
- Resumo do checklist, rótulos finais, data/hora (agora ou agendar, fuso Cuiabá), destino (home, editoria, assunto, newsletter), aviso de conflito com manchete, confirmação.
- **Push urgente** (spec 2026-09-28 §10.7): habilitado para admin e editor-chefe; marcado, pede "Justificativa do push" (≤ 300) e, publicada a matéria, cria o pedido Urgente em A09 com título e linha fina; toast "Pedido de push criado. Aguardando aprovação de outra pessoa." com link para a fila. Agendar desliga o push (urgente só sai agora).

### E07 · Calendário editorial · `/estudio/calendario` · Canvas (U03)

### E08 · Correções e direito de resposta · `/estudio/correcoes` · Refinar (U03)
- Fila com tipo, solicitante, prazo, estado; tela de correção com texto da nota pública, campos corrigidos, notificar quem salvou.

### E09 · Biblioteca de mídia · `/estudio/midia` · Canvas (U04)
### E10 · Aprovação de imagem · `/estudio/midia/[id]` · Canvas (U05)
### E11 · Direitos e licenças · `/estudio/midia/licencas` · **Nova**
- Tabela de licenças (banco, contrato, vigência, imagens cobertas, alerta 30 dias), acordos por fonte, ação renovar ou bloquear imagens vencidas.
### E12 · Geração de imagem · drawer `GenerateImage` · **Nova**
- Prompt sugerido a partir da matéria, restrições fixas visíveis (não fotorrealista, sem pessoas reais), 3 opções, rótulo automático IMAGEM GERADA POR IA, salvar no acervo com proveniência.

### E13 · Sugestões de evento · `/estudio/agenda/sugestoes` · **Nova**
- Fila das sugestões de P11 com aprovar, editar, rejeitar (motivo enviado ao remetente).

### E14 · Denúncias de leitores · `/estudio/denuncias` · **Nova** (resumo em W01)
- Fila por tipo (informação errada, link quebrado, imagem, direito de resposta), prazo 24 h, vínculo com a matéria, resposta ao leitor.

## D. Control Center (operação e IA)

### O01 · Visão geral · `/estudio/control` · Canvas (V01)
### O02 · Tempo real · `/estudio/control/tempo-real` · Canvas (V02)
### O03 · Fontes (lista) · `/estudio/control/fontes` · **Nova** (detalhe no canvas V03)
- Tabela com status, tipo, frequência, confiabilidade, política, erros 24 h, acordo; filtros; criar fonte.
### O04 · Fonte (detalhe e cadastro) · `/estudio/control/fontes/[id]` · Canvas (V03)
- Adicionar aba "Recomendação" (nome e logotipo exibidos, categoria, prioridade, fixar, destacar local, excluir da recomendação, bloquear).
### O05 · Regras de autonomia · `/estudio/control/regras` · Canvas (V04)
- Adicionar: simulação com os últimos 7 dias (quantos itens mudariam de destino), diff entre versões, fluxo de aprovação dupla.
### O06 · Filas e falhas · `/estudio/control/falhas` · Canvas (V05)
### O07 · Execuções (histórico de ciclos) · `/estudio/control/execucoes` · **Nova**
- Lista de ciclos com duração por fase, itens por etapa, falhas, custo; detalhe do ciclo com gráfico de fases.
### O08 · Logs · `/estudio/control/logs` · **Nova**
- Explorador com filtros (ciclo, item, fonte, etapa, nível, agente), busca textual, exportação; IPs mascarados para não admin.
### O09 · Custos e limites · `/estudio/control/custos` · Canvas (V06)
### O10 · Agentes · `/estudio/control/agentes` · Canvas (I02, página Produto digital)
### O11 · Modelos · `/estudio/control/modelos` · Canvas (I02)
### O12 · Prompts e versões · `/estudio/control/prompts/[id]` · Canvas (I03)
### O13 · Bases de conhecimento · `/estudio/control/conhecimento` · Canvas (I04)
### O14 · Avaliações e regressão · `/estudio/control/avaliacoes` · Canvas (I05)
### O15 · Playground de testes · `/estudio/control/testes` · **Nova**
- Escolher agente, versão do prompt e modelo; colar item de teste ou escolher caso da regressão; ver entrada sanitizada, saída estruturada, validação zod, custo, latência; salvar como caso de regressão.
### O16 · Governança da IA · `/estudio/control/governanca` · Canvas (I06)
### O17 · Recomendação de fontes · `/estudio/control/recomendacao` · Canvas (V07)
- Adicionar: histórico de alterações de pesos, campanhas de descoberta (criar: fontes, período, cota, público; medir), explorador "Por que esta recomendação" por `anonId` pseudonimizado.
### O18 · Teste A/B · `/estudio/control/recomendacao/testes/[id]` · **Nova**
- Variantes, alocação, métricas (CTR, retorno 7 d, diversidade, ocultação), significância, encerrar e promover (2 aprovações).

## E. Administração e governança

### A01 · Dashboard geral · `/estudio/admin` · Canvas (A01)
### A02 · Usuários · `/estudio/admin/usuarios` · Canvas (A02)
### A03 · Papéis e permissões · `/estudio/admin/papeis` · Refinar (A02 com 9 papéis da Q10)
### A04 · Equipes · `/estudio/admin/equipes` · **Nova** (resumo no A02)
### A05 · Taxonomia · `/estudio/admin/taxonomia` · Refinar (A03): editorias, subeditorias, tags, bairros e municípios, mesclagem de tags duplicadas sugerida pela IA.
### A06 · Home e módulos · `/estudio/admin/home` · Canvas (A03)
### A07 · Publicidade e patrocinados · `/estudio/admin/publicidade` · **Nova** (regras no A03)
- Campanhas (anunciante, período, peças, editorias permitidas, entregas), regras fixas visíveis, pré-visualização com selo.
### A08 · SEO · `/estudio/admin/seo` · **Nova**
- Modelos de título, sitemap de notícias, robots, redirecionamentos (arquivadas), dados estruturados, verificação de páginas sem meta description.
### A09 · Notificações · `/estudio/admin/notificacoes` · **Nova** (spec 2026-09-28 §10)
- Guarda: qualquer ação de push (`push.request`, `push.approve`, `push.settings`, `push.metrics`); analista vai direto ao Funil; item "Notificações (n)" no menu para quem aprova.
- Abas como subrotas (D-P23): **Novo envio** `/` (tipo, matéria com busca, título ≤ 60 e texto ≤ 120 com contadores, modelos, prévia Android/iPhone/computador com rótulo de origem, público com alcance estimado, quando, justificativa) · **Fila e aprovações** `/fila` (aprovação em texto, Revisar com prévia, Aprovar/Recusar/Cancelar com motivo, polling 10 s) · **Histórico** `/historico` e `/historico/[id]` (filtros na URL, CTR entre quem permite métricas, linha do tempo, pulos, falhas, detalhamento por aparelho e navegador, CSV sem dado de inscrição em `/historico/exportar`) · **Configurações** `/configuracoes` (limite 1–3, silêncio 18–22h/7–10h, modelos, pausar com PAUSAR digitado, retomar com aprovação de outra pessoa, estado das chaves VAPID) · **Funil do app** `/funil` (7 etapas, filtros na URL, gráfico SVG com resumo textual, "Fora do convite", "não são pessoas").
- Faixas do cabeçalho: envios pausados (quem, quando, motivo), pendentes de aprovação, VAPID ausente (só nomes).
- **Aceite:** `tests/e2e/a09-*.spec.ts`, `tests/a11y/pwa.spec.ts`, `docs/reports/pwa.md`.
### A10 · Auditoria · `/estudio/admin/auditoria` · Canvas (A04)
### A11 · Segurança e privacidade · `/estudio/admin/seguranca` · **Nova** (resumo no A04)
- 2FA da equipe, sessões, retenção, pedidos LGPD (fila com prazo), revisão de acessos, chaves e rotação. Estado real (gate do P5, achado 2): **duração da sessão** vale (`getSession` tira o papel da sessão vencida e manda entrar de novo); **retenção** dos eventos individuais vale de 30 a 90 dias (teto da spec §10, lido pelo cron `events-retention`); **2FA** está rotulado "ainda não aplicado" (o Estúdio não tem cadastro de segundo fator; o banco recusa ligar a chave até existir).
### A12 · Governança editorial · `/estudio/admin/governanca` · Canvas (W01)
### A13 · Integrações · `/estudio/admin/integracoes` · Canvas (W02)
### A14 · Configurações · `/estudio/admin/configuracoes` · Canvas (W02)
### A15 · Contingência · `/estudio/admin/contingencia` · **Nova**
- Botões de emergência com confirmação: pausar publicação automática, modo leitura, desligar busca com IA, rollback de regras; cada um com runbook e registro.

## F. Contagem

Portal público 25 · Conta 6 · Estúdio 14 · Control Center 18 · Administração 15 · **Total 78 telas e componentes de tela**. As marcadas como **Nova** não têm artboard; a especificação acima é a referência de implementação, com o DESIGN.md.

> R34: `/metodologia` e `/como-usamos-ia` saíram do público (404, sem link, fora do sitemap; abrem só com `CN_SHOW_LEGAL_PAGES=1`). O rótulo "Corrigido" também saiu das telas públicas; fica só no Estúdio.
