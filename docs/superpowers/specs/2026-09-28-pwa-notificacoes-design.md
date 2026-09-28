# CityNews Cuiabá · PWA, leitura offline e notificações (spec da funcionalidade)

> **Status: decisões de produto aprovadas pelo dono em 28/09/2026 (partes 1 e 2); parte 3 (funil) desenhada aqui e seguindo sem confirmação (A-061, A-062).**

Nada aqui revoga a spec mestre; onde houver conflito, a spec mestre vence. As ampliações estão listadas em §5.1.
Caminho: arquitetural (brainstorming → spec → plano `docs/superpowers/plans/2026-09-28-pwa-notificacoes.md` → subagent-driven-development).
Origem: pedido do dono de tornar o CityNews instalável, legível sem conexão e capaz de avisar o leitor pelo celular, com controle da redação no Estúdio e um funil de conversão no admin.

Referências: spec mestre `docs/superpowers/specs/2026-09-27-citynews-design.md` (§5.2 consentimento, §5.3 perfil anônimo, §5.4 convites, §8 papéis e duas pessoas, §10 retenção) · `docs/screens.md` (P17, P18, P22, P25, C01, E06, A09) · `docs/tracking-plan.md` (§1 envelope e regra de envio, §2 eventos) · `docs/architecture.md` (ADR-003 cron, ADR-004 filas, §6 permissões, §7 segurança) · painel de fontes `docs/superpowers/specs/2026-09-27-painel-de-fontes.md` (aprovações P5-T1, `app_settings`) · código atual: `public/sw.js`, `src/lib/offline/sw.ts`, `src/lib/alerts/match.ts`, `src/components/editorial/AlertWatcher.tsx`, `src/lib/anon/*`, `src/lib/consent/*`, `src/lib/security/headers.ts` · decisões A-058, A-059, A-061, A-062.

---

## 1. Problema

Hoje o CityNews é só um site. O service worker (`public/sw.js`, P2-T9) guarda as 20 últimas matérias salvas e abre a matéria quando o leitor toca num alerta, mas:

- não existe manifesto: o portal não é instalável e não tem ícone, splash nem atalhos;
- fora das salvas, nada funciona sem conexão; a página "sem conexão" é estática e não diz o que está disponível;
- os alertas de navegador (P18) só funcionam com uma aba aberta: o `AlertWatcher` consulta `/api/alertas/novidades` a cada 15 min; com o navegador fechado, o leitor não recebe nada;
- o diálogo de publicação (E06) mostra "push com 2 aprovações" desativado (A-059) e A09 não existe;
- ninguém sabe quantos leitores instalam, aceitam avisos ou tocam neles.

## 2. Objetivo

1. **PWA instalável** com manifesto da marca, ícones do brand kit, splash escura e atalhos Últimas, Salvos e Busca.
2. **Leitura offline:** home e editorias na última versão aberta, as 30 últimas matérias lidas e as 20 salvas, com página "Sem conexão" que lista o que está disponível e rótulo de desatualização.
3. **Convites respeitosos:** um de instalação e, separado e depois, um de notificações, ambos com "Agora não", nunca obrigatórios, com limites de insistência.
4. **Web Push próprio** (VAPID, biblioteca `web-push`, inscrições no nosso Supabase, envio pela fila `notify`), para: o que o leitor segue; urgências aprovadas pela redação; "Destaque da redação" manual.
5. **A09 Notificações** no Estúdio: Novo envio, Fila e aprovações, Histórico, Configurações, com trilhos de segurança no banco.
6. **Funil do app** no admin: do convite de instalação ao toque no aviso, só com consentimento de métricas.

## 3. Não objetivos

- Serviço de push de terceiros (OneSignal, Firebase Messaging SDK, Pusher etc.) e SDK de terceiros no portal.
- App nativo ou publicação em loja (TWA, Play Store, App Store).
- Push para o Estúdio (plantão) nesta entrega: o plantão continua com os avisos do Control Center.
- Push de item agregado, patrocinado ou de evento da agenda: só matérias do CityNews (`articles` publicadas) geram aviso. Alertas de agenda continuam locais (P18).
- Resumos diário e semanal por push: seguem no `AlertWatcher` local e no e-mail; o push cobre só a frequência "imediato".
- Personalizar o que é enviado com interesses inferidos. Push usa só escolhas explícitas (seguir, alerta).
- Sincronização em segundo plano (Background Sync, Periodic Sync) e pré-carregar a matéria no recebimento do aviso.
- Leitura offline do Estúdio, da busca, do Pergunte ou de qualquer página com sessão.

## 4. Decisões

Mesmo formato da spec mestre §2. "Dono" indica decisão tomada com o dono em 28/09/2026; as demais foram tomadas nesta spec e estão em §5 para registro.

| # | Tema | Opções | Escolha | Motivo |
|---|---|---|---|---|
| D-P01 | Arquitetura do push (Dono) | (1) Web Push próprio · (2) serviço de terceiros · (3) só aba aberta | **(1)** VAPID com `web-push`; inscrições em `push_subscriptions` no Supabase; envio pela fila `notify` e pelo drain existentes; sem serviço de terceiros | Sem SDK externo (ADR-008, LGPD), custo zero, controle dos limites no nosso banco |
| D-P02 | O que gera push (Dono, opção B) | só urgente · segue + urgente · segue + urgente + destaque | **Três tipos:** `follow` (matéria publicada que casa com o que o leitor segue: fontes, editorias, assuntos, bairros, alertas); `urgent` (aprovado por **duas pessoas diferentes, nenhuma delas quem pediu**); `highlight` "Destaque da redação" (uma aprovação de editor-chefe ou admin, diferente de quem pediu) | Cobre o útil sem virar canal de marketing |
| D-P03 | Offline (Dono, opção A) | só salvas · salvas + lidas + páginas · tudo | Home e editorias na última versão aberta, 30 últimas lidas, 20 salvas, página "Sem conexão" com a lista, rótulo "Salva às 14h32, pode estar desatualizada", LRU com teto de ~25 MB, nada pessoal além do que já está no navegador | Resolve o ônibus e a falta de sinal sem pré-carregar o que o leitor não abriu |
| D-P04 | Convite de instalação (Dono, opção A) | banner no topo · faixa no rodapé · só menu | Faixa no rodapé na 2ª visita ou depois de 3 leituras, com "Instalar" e "Agora não"; iPhone com passo a passo; "Agora não" silencia 14 dias; 3 recusas = nunca mais (fica "Baixar o app" no menu e no rodapé); nunca com o app instalado | Não interrompe a leitura e respeita quem recusou |
| D-P05 | Convite de notificações (Dono) | pedir no carregamento · pré-prompt contextual | Separado e posterior: aparece ao seguir algo ou ao abrir uma matéria urgente; pré-prompt explicativo com "Ativar" e "Agora não"; só "Ativar" chama o pedido nativo; no iPhone só com o app instalado | Pedido nativo recusado não pode ser refeito pelo site |
| D-P06 | Manifesto (Dono) | — | `name` "CityNews Cuiabá", `short_name` "CityNews", ícones da marca (`any` e `maskable`), splash escura, `start_url` home, atalhos Últimas, Salvos, Busca | Marca e acesso rápido |
| D-P07 | Trilhos de envio (Dono) | — | Máx. 3 por dia por inscrição; silêncio 22h–7h exceto urgente; a mesma matéria nunca duas vezes na mesma inscrição; inscrição expirada (404/410) removida; tudo auditado | Promessa feita no pré-prompt |
| D-P08 | Urgente e limite diário | urgente fura o limite · urgente conta e respeita | **Urgente conta e respeita o limite de 3.** Só o silêncio tem exceção | Mantém literal o trilho "máx. 3/dia"; o texto do pré-prompt passa a dizer a verdade (D-P09) |
| D-P09 | Texto do pré-prompt | texto do dono literal · ajuste mínimo | "Avisamos só do que você segue e de urgências, no máximo 3 por dia. Entre 22h e 7h, só urgências." | O texto original ("nunca das 22h às 7h") contradiz a exceção de urgente que o próprio dono definiu |
| D-P10 | Service worker | Workbox · escrito à mão | **Escrito à mão**, em TypeScript (`src/sw/`), empacotado por esbuild em `public/sw.js` (script `pnpm sw:build`, rodado no `prebuild` e no `dev`); arquivo gerado versionado e conferido no CI (`git diff --exit-code`) | Os plugins de PWA para Next não acompanham o App Router 16 nem a CSP com nonce; lógica pura testável no Vitest; nenhum script inline |
| D-P11 | Registro do service worker | só ao salvar (hoje) · em toda visita | Em toda página pública, depois do `load` e em ocioso; nunca em `/estudio`; o SW ignora `/estudio`, `/api`, `/entrar`, `/perfil` e páginas com sessão | Instalação exige SW ativo; cache é funcional e sem dado pessoal (categoria Necessários) |
| D-P12 | Onde ficam os alvos do leitor | servidor lê o perfil · leitor envia a lista | O navegador envia só a lista explícita de alvos (`source:`, `section:`, `topic:`, `bairro:`) junto com a inscrição; nunca histórico, interesses inferidos nem `anonId` | Seguir e alertar são escolhas explícitas e funcionam sem Personalização (spec §5.3); o push é o serviço que o leitor pediu (Necessários), como o alerta por e-mail (A-058) |
| D-P13 | Gestão da inscrição anônima | endpoint como senha · token próprio | **Token de gestão** aleatório (32 bytes) devolvido na criação, guardado no IndexedDB, só o hash no banco; alterar ou apagar exige o token. Com conta, a inscrição também leva `user_id` (exportação e exclusão em `/perfil`) | O endpoint aparece em logs de terceiros; o token não sai do navegador |
| D-P14 | Aprovações | tabela própria · `approvals` do P5-T1 | **`approvals` do P5-T1**: um registro por assinatura exigida, `target_ref = 'push:<send_id>'` (ou `push-resume:<pedido>` para retomar); kinds `push.urgent` (2 registros, já em `CRITICAL_KINDS`), `push.highlight` (1, novo) e `push.resume` (2, novo); trigger `guard_push_approvals` recusa quem pediu e quem já aprovou outro registro do mesmo alvo | Reaproveita a API, a RLS e a auditoria; a regra vale no banco |
| D-P15 | Janela de arrependimento | enviar na hora · esperar | Aviso `follow` de matéria **publicada automaticamente** espera 10 min e só sai se ela continuar publicada; publicada por pessoa sai na hora | Publicação automática pode ser desfeita em um clique (spec §11.11); aviso enviado não pode |
| D-P16 | Silêncio para `follow` e `highlight` | descartar · adiar | Adiar até o fim do silêncio da inscrição, se ainda dentro do TTL; `follow` adiado junta num só aviso por inscrição (o mais recente, `tag = follow`); fora do TTL, pula como `skipped_quiet` | Não acorda ninguém e não despeja 3 avisos às 7h |
| D-P17 | Preferências do leitor | livres · dentro dos trilhos | Tipo a tipo (Do que você segue, Urgentes, Destaques da redação); silêncio só pode **aumentar** (início entre 18h e 22h, fim entre 7h e 10h); limite diário 1, 2 ou 3 | Trilhos da plataforma nunca afrouxam pela preferência |
| D-P18 | Rótulo de origem no aviso | sem rótulo · rótulo no corpo | O corpo começa com o rótulo principal da matéria (PUBLICADO AUTOMATICAMENTE, ou ORIGINAL CITYNEWS, ou NORMALIZADO PELO CITYNEWS) seguido de " · "; o prefixo não conta nos 120 caracteres | Regra 3 do CLAUDE.md: origem sempre visível |
| D-P19 | Urgente agendado | permitido · só agora | **Urgente só "Agora"** (pedido expira em 60 min sem as duas aprovações); Destaque "Agora" ou agendado até 7 dias, fora do silêncio | Urgente agendado não é urgente |
| D-P20 | Alertas locais × push | manter os dois · push substitui o imediato | Com inscrição ativa, o `AlertWatcher` deixa de mostrar avisos imediatos (o servidor manda) e continua com os resumos; sem inscrição, tudo como hoje | Evita aviso duplicado |
| D-P21 | Medição de entrega e toque | log por inscrição · contador agregado | O SW só avisa "recebido" e "tocado" com Métricas consentidas e manda só `sendId`, classe de aparelho e família de navegador; o servidor soma em `push_send_counters`, sem ligar a nenhuma inscrição | Funil sem identificador persistente (tracking-plan §1) |
| D-P22 | Funil | aba 5 de A09 · subrota irmã | Subrota **"Funil do app"** `/estudio/admin/notificacoes/funil`, com link no cabeçalho de A09; as 4 abas ficam como o dono pediu | Métrica não é operação de envio; permissão diferente |
| D-P23 | Abas de A09 | Tabs ARIA · subrotas | Subrotas (`/`, `/fila`, `/historico`, `/configuracoes`) com `aria-current="page"` | Mesmo padrão de D-F24 do painel de fontes |
| D-P24 | Estimativa de alcance | número exato · faixa | Número arredondado para dezenas; abaixo de 20, "menos de 20 inscrições" | Segmento pequeno não vira identificação |
| D-P25 | Sem chaves VAPID | quebrar · degradar | Sem `VAPID_*`, push fica indisponível: o pré-prompt não aparece, Alertas mostra "Avisos pelo celular ainda não estão disponíveis." e A09 mostra aviso com o que configurar. Testes e CI usam `PUSH_PROVIDER=fake` | Local e CI funcionam sem segredo (como `AI_PROVIDER=fake`) |

## 5. Decisões desta spec para registro

D-P08, D-P09 e D-P10 a D-P25 não foram ditas pelo dono; devem entrar em `.planning/DECISIONS.md` como `A-###` na primeira tarefa do plano. As que mudam texto ou promessa ao leitor (D-P08, D-P09, D-P18) são as mais sensíveis.

### 5.1 Ampliações da spec mestre

| Documento | O que dizia | O que passa a valer |
|---|---|---|
| Spec mestre §2 D16 / ADR-008 | Analytics só em `events` | Também contadores agregados de envio em `push_sends`/`push_send_counters` (§9) |
| `docs/screens.md` P17 | Offline: 20 últimas salvas | 20 salvas + 30 lidas + home e editorias (D-P03) |
| `docs/screens.md` E06 | Push com 2 aprovações (desativado, A-059) | Destino "Push urgente" cria o pedido em A09 já preenchido com a matéria |
| `docs/tracking-plan.md` §2 | 17 eventos | + 8 eventos do app (§9.1) |
| `docs/architecture.md` §6 | Matriz sem push | + `push.request`, `push.approve`, `push.settings`, `push.metrics` (§10) |

## 6. Histórias de usuário

1. Como leitora no Android, depois da segunda visita, vejo uma faixa discreta para instalar; toco em "Agora não" e ela some por 14 dias.
2. Como leitor no iPhone, toco em "Instalar" e vejo em 3 passos como adicionar o CityNews à Tela de Início.
3. Como leitor sem sinal no ônibus, abro o app e leio a home e as matérias que li ontem, sabendo de quando é cada cópia.
4. Como leitora que segue o bairro CPA, recebo um aviso quando sai matéria do CPA, no máximo 3 por dia e nunca de madrugada.
5. Como leitor, desligo "Destaques da redação" e mantenho "Urgentes", sem criar conta.
6. Como editora-chefe, peço um push urgente; dois colegas aprovam; o aviso sai e vejo quantos receberam e tocaram.
7. Como editor de Esportes, proponho um Destaque de matéria da minha editoria para quem segue Esportes; a editora-chefe aprova.
8. Como admin, pauso todos os envios num incidente; voltar a enviar exige duas aprovações.
9. Como analista, vejo onde o funil do app perde gente, por aparelho e navegador, sem dado individual.

## 7. Experiência do leitor

Registro visual: PRODUCT.md e DESIGN.md do portal, tokens de `src/styles/tokens.css`, componentes do kit (Button, InlineAlert, Dialog nativo, Toast, Switch, Select). Textos em `src/content/pt-BR/app.ts` e `src/content/pt-BR/notifications.ts`. Sem emoji, sem gradiente, alvos ≥ 44 px, `prefers-reduced-motion`.

### 7.1 Regras comuns aos convites

- **Um convite por vez** por página: banner de consentimento (P22) > convite de login (C01) > convite de notificações (C09) > faixa de instalação (C07). Quem estiver na frente adia os demais para a próxima navegação.
- Estado local em `localStorage` `cn_app` (`{ visits, reads, install: { refusals, silencedUntil }, notif: { refusals, silencedUntil }, lastVisitDay }`), em `try/catch`, nunca enviado ao servidor; sem armazenamento, nenhum dos dois convites aparece (não dá para respeitar a recusa). Mesmo padrão de `cn_invites` e `cn_qreads` (P2-T10).
- **Visita** = primeira navegação de uma sessão de aba (`sessionStorage`); a 2ª visita é a 2ª sessão em dia diferente ou com 30 min de intervalo. **Leitura** = leitura qualificada (`QUALIFIED_READ_EVENT`, spec §7.2), acumulada.
- Regras puras em `src/lib/app/invites.ts` (`shouldOfferInstall`, `shouldOfferNotifications`, `recordRefusal`), testadas primeiro.
- Nunca em `/estudio`, `/entrar`, `/criar-conta`, `/perfil`, `/privacidade`, nem com o app em modo `standalone` (convite de instalação).

### 7.2 C07 · Faixa de instalação · componente `InstallInvite`

- **Quando:** `visits ≥ 2` ou `reads ≥ 3`; não instalado (`display-mode: standalone` e `navigator.standalone` falsos); `silencedUntil` vencido; `refusals < 3`; e há como instalar: evento `beforeinstallprompt` capturado (Chromium no Android e no desktop) ou iPhone/iPad no Safari (C08). Outros navegadores não veem a faixa; têm "Baixar o app" (P26).
- **Forma:** faixa fixa no rodapé, acima da barra inferior no mobile, `role="region"` `aria-label="Instalar o app"`, não cobre conteúdo (reserva espaço), sem animação com `prefers-reduced-motion`. Texto: "Leia o CityNews como app: abre mais rápido e funciona sem internet." Ações: "Instalar" (primária) e "Agora não".
- **Instalar:** chama `prompt()` do evento guardado. `userChoice` aceito → some; recusado no diálogo nativo conta como recusa. No iPhone abre C08.
- **Agora não:** `refusals + 1`, `silencedUntil = agora + 14 dias`; na 3ª recusa não aparece mais.
- **Evento `appinstalled`** ou primeira abertura em `standalone` → marca instalado e registra `app_installed` (§9.1, com consentimento).

### 7.3 C08 · Passos no iPhone · diálogo `IosInstallSteps`

Diálogo nativo (`<dialog>`), foco preso e devolvido. Título "Adicionar o CityNews à Tela de Início". Lista ordenada: 1 "Toque em Compartilhar" (ícone do sistema desenhado em SVG próprio, com texto) · 2 "Escolha Adicionar à Tela de Início" · 3 "Toque em Adicionar". Nota: "Depois, abra o CityNews pela Tela de Início para receber avisos." Ações "Entendi" e "Agora não" (esta conta como recusa). Fora do Safari no iPhone (Chrome iOS), o passo 1 diz "Toque em Compartilhar na barra de endereço".

### 7.4 C09 · Convite de notificações · componente `NotificationInvite`

- **Gatilhos:** seguir fonte, editoria ou assunto; criar alerta com canal navegador; abrir matéria marcada urgente. Nunca no carregamento da home.
- **Pré-condições:** push disponível (chave VAPID pública presente, `PushManager` e `serviceWorker` no navegador); `Notification.permission === "default"`; sem inscrição ativa; `silencedUntil` vencido; `refusals < 3`. No iPhone/iPad só em `standalone`; no Safari do iPhone fora do app, o gatilho mostra C08 se a faixa de instalação estiver elegível, senão nada.
- **Forma:** painel inline logo abaixo da ação que o disparou (seguir, alerta) ou no topo do corpo da matéria urgente; `role="region"` `aria-labelledby`. Título "Quer receber avisos?". Texto (D-P09): "Avisamos só do que você segue e de urgências, no máximo 3 por dia. Entre 22h e 7h, só urgências." Ações "Ativar" e "Agora não".
- **Ativar** (gesto do usuário, exigência do Safari): `Notification.requestPermission()` → concedida: `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → `POST /api/push/subscriptions` com os alvos atuais → toast "Avisos ativados. Ajuste em Alertas." com link. Negada: InlineAlert "Tudo bem. Se mudar de ideia, veja em Alertas como reativar." e nunca mais pré-prompt neste navegador.
- **Agora não:** silencia 14 dias, 3 recusas = só pelo botão em Alertas.

### 7.5 P18 · Alertas `/alertas` (ampliação) · bloco "Avisos no celular e no computador"

- **Sem suporte** (navegador sem Push, ou sem chave VAPID): "Avisos pelo celular ainda não estão disponíveis neste navegador." (ou "…ainda não estão disponíveis.") e os alertas locais seguem como hoje.
- **iPhone fora do app:** "No iPhone, os avisos funcionam com o CityNews na Tela de Início." + botão "Como adicionar" (C08).
- **Desligado** (`default`): texto do pré-prompt e botão "Ativar avisos".
- **Negado:** InlineAlert "Os avisos estão bloqueados neste navegador." com instruções por navegador detectado, em lista: Chrome/Edge (Android e desktop: cadeado ao lado do endereço → Permissões → Notificações → Permitir), Firefox (cadeado → Permissões → remover o bloqueio), Safari no Mac (Ajustes → Sites → Notificações), iPhone (Ajustes → Notificações → CityNews). Botão "Já reativei" reconsulta a permissão.
- **Ativo:** Switches "Do que você segue", "Urgentes", "Destaques da redação" (salvam na hora, `PATCH` com token); "Silêncio" com dois Selects (início 18h–22h, fim 7h–10h, D-P17), texto "Urgentes podem chegar no silêncio."; "Máximo por dia" (1, 2, 3); lista "O que você segue" com o que foi enviado ao servidor (transparência) e link para gerenciar; "Desativar avisos" (`unsubscribe()` + `DELETE`, apaga a linha no servidor).
- **Estados:** carregando (skeleton), erro ao salvar (InlineAlert + "Tentar de novo", valor anterior restaurado), inscrição perdida (servidor devolve 404 para o token: "Os avisos deste navegador foram desativados. Ativar de novo?").

### 7.6 Toque no aviso

`notificationclick` fecha o aviso, foca uma janela do CityNews e navega para `data.url` (só caminho interno, validado) ou abre uma nova. Sem conexão, a navegação cai no cache (§8) e, se a matéria não estiver lá, na página "Sem conexão". O toque registra `push_clicked` só com Métricas (§9).

### 7.7 P25 · Sem conexão `/offline` (substitui `offline.html`)

Página estática própria do SW (`/offline.html` + `/offline.js` + `/offline.css`, sem script inline). h1 "Sem conexão". Texto "Você está sem internet. Estas páginas estão guardadas neste aparelho:" e três listas, cada item com título e "Salva às 14h32" (ou "em 27/09 às 14h32"): "Páginas" (home e editorias), "Salvas" (até 20), "Lidas recentemente" (até 30, mais recente primeiro). Listas vazias somem; tudo vazio: "Nada guardado ainda. Com internet, as páginas que você abrir ficam disponíveis aqui." Botão "Tentar de novo" recarrega. A lista vem do índice do SW (§8.3), por `postMessage`.

### 7.8 Rótulo de cópia antiga · componente `OfflineNotice`

Em toda página pública servida pelo cache, faixa `role="status"` no topo: "Salva às 14h32, pode estar desatualizada." (outro dia: "Salva em 27/09 às 14h32, pode estar desatualizada."), horário de Cuiabá. Ao voltar a conexão (`online`), troca por "Conexão de volta." + "Atualizar". Como a página não lê os próprios cabeçalhos, ela pergunta ao SW (`{ type: "served-from-cache", url }`) ao montar; o SW responde pelo mapa `clientId → cachedAt` das navegações que atendeu do cache e, sem registro, pelo índice (§8.3) quando `navigator.onLine` for falso.

### 7.9 P26 · Baixar o app `/app`

Página institucional com instruções por plataforma (Android/Chrome, iPhone/iPad, Mac com Safari "Adicionar ao Dock", Windows/Chrome/Edge, outros: "Seu navegador não permite instalar; use o site normalmente."), botão "Instalar" quando houver `beforeinstallprompt`, e "Já instalado" em `standalone`. Link "Baixar o app" no menu Perfil (mobile), no rodapé e em Explorar; permanece mesmo depois de 3 recusas.

### 7.10 Manifesto `src/app/manifest.ts`

```ts
{
  name: "CityNews Cuiabá", short_name: "CityNews", lang: "pt-BR", dir: "ltr",
  id: "/", start_url: "/?origem=app", scope: "/", display: "standalone",
  background_color: valor de `--cn-tinta`, theme_color: valor de `--cn-tinta` (lidos de `tokens.css` na geração),
  icons: [192 e 512 `any` (símbolo sobre fundo escuro), 192 e 512 `maskable` (zona segura 80%), 180 apple-touch-icon],
  shortcuts: [
    { name: "Últimas", url: "/#ultimas" },
    { name: "Salvos", url: "/favoritos" },
    { name: "Busca", url: "/busca" }
  ]
}
```

Ícones gerados de `design-system/assets/logo` e `public/brand/citynews-symbol.png` por `scripts/build-icons.mjs` (sharp) para `public/icons/`; cores lidas dos tokens na geração (sem hex solto no código de componente). `start_url` com `?origem=app` só serve para detectar a primeira abertura em `standalone` e é removido da URL com `history.replaceState`; não é registrado como parâmetro de rastreio. `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style=black-translucent` e `apple-touch-icon` no `metadata` do layout público; splash do iOS via `apple-touch-startup-image` para 3 tamanhos comuns. `theme_color` claro/escuro por `<meta name="theme-color" media=…>`.

## 8. Service worker e cache offline

### 8.1 Estrutura

- Código em `src/sw/` (`index.ts` escuta eventos; `core.ts` puro: allowlist, LRU, escolha de resposta, validação de payload, texto do aviso). `pnpm sw:build` (esbuild, `format: "iife"`, sem dependências externas) gera `public/sw.js`. O CI roda `pnpm sw:build && git diff --exit-code public/sw.js`.
- `SW_VERSION` no topo; `skipWaiting` + `clients.claim` como hoje.
- **Compatibilidade:** mantém `message` `cache-saved` (usado por `cacheSaved`), o cache `cn-salvos-v1` com o mesmo nome e conteúdo (não pode ser apagado no `activate`), e o `notificationclick` com a mesma validação `sameOrigin`. `src/lib/offline/sw.ts` continua a API do cliente e ganha `registerSwOnIdle`, `queryCachedAt`, `listOffline`.
- **CSP:** nada muda. `worker-src 'self'` e `manifest-src 'self'` já existem (`src/lib/security/headers.ts`); o SW não carrega script de fora nem faz `eval`; o push é entregue pelo navegador, sem `connect-src` novo. `offline.html` só usa `/offline.js` e `/offline.css` de `'self'`.

### 8.2 Caches

| Cache | Conteúdo | Limite | Estratégia |
|---|---|---|---|
| `cn-shell-v1` | `/offline.html`, `/offline.js`, `/offline.css`, ícones, manifesto | fixo | pré-cache no `install` |
| `cn-salvos-v1` | 20 salvas + `/favoritos` (como hoje) | 20 | sincronizado por `cache-saved`; nunca sai por LRU |
| `cn-paginas-v1` | `/` e `/[editoria]` na última versão aberta | 12 | rede primeiro; resposta 200 da navegação grava a cópia |
| `cn-lidas-v1` | 30 últimas `/materia/*` abertas | 30 | rede primeiro; grava na navegação 200 |
| `cn-assets-v1` | `/_next/static/*` usados pelas páginas guardadas, fontes | pelo teto | cache primeiro (arquivos com hash); limpeza dos órfãos no `activate` e a cada 50 gravações |

Só entram em cache respostas `200`, `GET`, mesma origem, navegação para rota da allowlist (`/`, `/[editoria]` das editorias conhecidas, `/materia/*`, `/favoritos`), sem `Set-Cookie` e sem `Cache-Control: private` ou `no-store`. Nunca: `/estudio`, `/api`, `/entrar`, `/criar-conta`, `/perfil`, `/privacidade`, `/busca`, `/pergunte`, `/alertas`. A chave do cache é o caminho sem consulta nem fragmento (como no `sw.js` atual). Perfil, seguidos e salvos continuam só no IndexedDB, como hoje.

### 8.3 Índice e LRU

Índice no IndexedDB do SW (`cn-sw`, store `entries`: `{ url, cache, title, bytes, cachedAt, lastAccess }`; `title` lido do `<title>` da resposta, sem o sufixo da marca). Teto total 25 MB (soma de `bytes` de todos os caches menos `cn-shell`), conferido depois de cada gravação e também por `navigator.storage.estimate()` quando disponível. Ao passar do teto, remove por `lastAccess` mais antigo nesta ordem: `cn-lidas`, `cn-paginas`, assets órfãos. Salvas e shell nunca saem pelo LRU. "Apagar histórico local" (P21/P22) e o novo botão "Limpar leitura offline" em `/privacidade` apagam `cn-lidas` e `cn-paginas`.

### 8.4 Eventos do SW

- `fetch`: navegação da allowlist → rede com tempo limite de 4 s; falha ou tempo → cache (`cn-salvos`, `cn-lidas`, `cn-paginas`, nesta ordem) com registro `clientId → cachedAt`; sem cópia → `/offline.html`. Fora da allowlist → rede e, se falhar, `/offline.html` para navegação.
- `push`: sempre mostra um aviso (`userVisibleOnly`), mesmo com payload inválido (aviso genérico "CityNews" / "Há novidades no CityNews." / `url: "/"`), para não perder a permissão no Safari e no Chrome. Payload válido → `showNotification(t, { body: b, tag: g, data: { url: u, s }, icon: "/icons/icon-192.png", badge: "/icons/badge-72.png", lang: "pt-BR", renotify: false })`. Depois, se `consent.metrics` guardado no índice for verdadeiro, `POST /api/push/receipt { s, e: "delivered", d, b }` sem esperar (falha ignorada).
- `notificationclick`: §7.6; com métricas, `receipt` com `e: "clicked"`.
- `pushsubscriptionchange`: reinscreve com a mesma chave e chama `PUT /api/push/subscriptions/rotate` com o token do IndexedDB e o endpoint antigo; se falhar, o próximo carregamento de página refaz a sincronização.
- `message`: `cache-saved` (como hoje), `consent` (`{ metrics, device, browser }`, enviado pela página ao carregar e ao mudar o consentimento; guardado no índice), `served-from-cache`, `list-offline`, `clear-offline`.

### 8.5 Payload

`{ "v": 1, "t": "<título ≤ 60>", "b": "<rótulo · corpo ≤ 120>", "u": "/materia/<slug>", "g": "<tag>", "s": "<send_id>" }`, cifrado por `web-push` (aes128gcm), ≤ 1 KB. `u` precisa começar com `/` e não com `//`; o SW recusa o resto e usa `/`. Nada de dado do leitor, id de inscrição, e-mail ou alvo. Cabeçalhos: `TTL` 6 h (`follow`), 2 h (`urgent`), 12 h (`highlight`); `Urgency: high` só para urgente, `normal` para os outros; `Topic` = `tag` (junta avisos da mesma matéria no serviço de push).

## 9. Medição e funil

### 9.1 Eventos novos (tracking-plan §2)

Mesmo envelope e mesma regra de envio: **só com Métricas** (ou Personalização) consentidas; com só Métricas, `anonId = null`. `props` sem nada pessoal. A rota `/api/events` acrescenta `props.browser` (família derivada do `User-Agent` no servidor: `chrome`, `safari`, `firefox`, `edge`, `samsung`, `other`) só nestes eventos; o `User-Agent` não é gravado.

| Evento | Quando | `props` obrigatórias |
|---|---|---|
| `install_prompt_shown` | C07 visível ≥ 1 s | `platform` (android, ios, desktop), `trigger` (visits, reads) |
| `install_prompt_dismissed` | "Agora não" ou recusa no diálogo nativo | `platform`, `refusals` (1–3) |
| `app_installed` | `appinstalled` ou 1ª abertura em `standalone` | `via` (prompt, ios_steps, browser, unknown) |
| `notif_preprompt_shown` | C09 visível ≥ 1 s | `trigger` (follow, alert, urgent_article) |
| `notif_preprompt_dismissed` | "Agora não" em C09 | `trigger`, `refusals` |
| `notif_permission_granted` | permissão concedida | `trigger` (follow, alert, urgent_article, settings) |
| `notif_permission_denied` | permissão negada | `trigger` |
| `push_unsubscribed` | "Desativar avisos" em Alertas | `from` (settings) |

`push_sent`, `push_delivered` e `push_clicked` **não** são eventos da tabela `events`: são contadores (§9.2).

### 9.2 O que é contado sem consentimento e o que não é

| Dado | Sem Métricas | Com Métricas |
|---|---|---|
| Eventos de §9.1 | nada é enviado | enviado sem `anonId` |
| Inscrições ativas (total, por família de navegador e classe de aparelho gravadas na inscrição) | contado: é o cadastro do serviço pedido | idem |
| Por envio: alvos, enfileirados, aceitos pelo serviço de push (2xx), falhas por código, removidas por 404/410, puladas por silêncio, limite, duplicata ou preferência | contado em `push_sends` (operação do serviço, sem ligação com leitura) | idem |
| `sent_measurable` (enviados a inscrições com `metrics_consent = true`) | — | contado |
| Recebido (`delivered`) e tocado (`clicked`) | **não** contado: o SW não envia nada | `push_send_counters` por `(send_id, device_class, browser)`, sem id de inscrição |

`push_subscriptions.metrics_consent` é atualizado pela página ao carregar e ao mudar o consentimento (`PATCH` com token). `push_deliveries` guarda por inscrição só o necessário para os trilhos (limite diário, nunca repetir, retry) e é apagada em 30 dias; nunca guarda recebido nem tocado.

### 9.3 Funil do app · etapas

1 `install_prompt_shown` → 2 `app_installed` (`via = prompt` ou `ios_steps`) → 3 `notif_preprompt_shown` → 4 `notif_permission_granted` (`trigger ≠ settings`; negadas ao lado) → 5 enviados mensuráveis (`sent_measurable`) → 6 recebidos (`delivered`) → 7 tocados (`clicked`).

Conversão de cada etapa = etapa ÷ anterior, no período. Os números são **eventos, não pessoas** (sem id não há deduplicação); a tela diz isso. Instalações por outros caminhos (`via = browser`) e permissões dadas em Alertas (`trigger = settings`) aparecem como "fora do convite", fora da conversão. Etapas 5–7 medem só quem consentiu Métricas; o total de enviados (todas as inscrições) aparece ao lado como referência, nunca como base.

### 9.4 Agregação

`push_funnel_daily (day date, stage text, device_class text, browser text, n int, primary key (day, stage, device_class, browser))`, preenchida às 04:40 UTC por `pg_cron` a partir de `events` (etapas 1–4) e de `push_sends`/`push_send_counters` (5–7). A RPC `push_funnel(p_from, p_to, p_device, p_browser)` (`security definer`, confere `push.metrics`) soma os dias fechados e o dia corrente ao vivo. Como `events` individuais caem em 90 dias (spec §10), o funil de períodos antigos vem só da tabela diária.

## 10. Estúdio · A09 Notificações

Rotas sob `/estudio/admin/notificacoes`, sem cache (`force-dynamic`), guarda `requireRole` no layout e em cada Server Action. Registro visual do Estúdio; Table, Field, Select, Tabs como navegação, Dialog nativo, InlineAlert, Toast, EmptyState, ErrorState, Skeleton; estados padrão de `docs/screens.md`.

### 10.1 Permissões (novas na matriz de `docs/architecture.md` §6)

| Ação | admin | editor_chefe | editor | analista | demais |
|---|---|---|---|---|---|
| `push.request` Urgente | ✓ | ✓ | não | não | não |
| `push.request` Destaque | ✓ | ✓ | editoria (matéria da própria editoria) | não | não |
| `push.approve` (Urgente, Destaque, retomar envios) | ✓ (2ª) | ✓ (2ª) | não | não | não |
| `push.settings` (Configurações, pausar) | ✓ | ✓ | não | não | não |
| Ver Fila e Histórico | ✓ | ✓ | só os próprios pedidos e envios da editoria | não | não |
| `push.metrics` (Funil do app) | ✓ | ✓ | não | ✓ | não |

Sem papel no Estúdio: redireciona para `/entrar?next=…`; papel sem nenhuma dessas ações: `/entrar?next=…&motivo=sem-permissao` e o item "Notificações" some do menu.

### 10.2 Aba 1 · Novo envio `/estudio/admin/notificacoes`

- Nota fixa: "Avisos do que o leitor segue são automáticos e não passam por aqui."
- **Tipo** (radio): Urgente · Destaque da redação. Editor só vê Destaque.
- **Matéria** (obrigatória): busca por título entre matérias publicadas, não patrocinadas (editor: só da própria editoria). Mostra rótulos e horário. Matéria despublicada depois do pedido cancela o envio (`cancelled`, motivo "Matéria despublicada").
- **Título** (≤ 60) e **Texto** (≤ 120), contadores visíveis, preenchidos com título e linha fina da matéria ou com um modelo; sem HTML, quebras de linha viram espaço.
- **Prévia** Android, iPhone e desktop (desenho próprio em SVG/HTML com tokens, não captura do sistema), com o rótulo de origem (D-P18) e o corte aproximado de cada plataforma.
- **Público:** "Todos que ativaram {Urgentes | Destaques}" ou "Segmento": editoria ou bairro (Select), contando só inscrições que seguem o alvo e ligaram o tipo. **Alcance estimado** ao lado (D-P24), atualizado ao mudar o público.
- **Quando:** Urgente só "Agora" (D-P19); Destaque "Agora" ou "Agendar" (data e hora de Cuiabá, até 7 dias, fora de 22h–7h).
- **Justificativa** (obrigatória para Urgente).
- **Enviar para aprovação** → `push_sends.status = 'pending_approval'` + registros em `approvals` (D-P14). Toast "Pedido criado. Aguardando 2 aprovações." Com envios pausados, o botão fica ativo mas o aviso "Envios pausados: o pedido fica na fila até a retomada." aparece.

### 10.3 Aba 2 · Fila e aprovações `/fila`

Tabela: tipo · matéria · título · público e alcance · pedido por e quando · aprovações ("1 de 2: Marina Arruda") · agendado para · estado · ações. Ações: **Aprovar** (diálogo com prévia, texto, justificativa; quem pediu ou quem já aprovou recebe "A aprovação precisa ser de outra pessoa."), **Recusar** (motivo obrigatório), **Cancelar** (quem pediu ou `push.settings`, motivo). Com as aprovações completas: "Agora" vai para a fila de envio; agendado fica `scheduled`. Pedido Urgente sem as duas aprovações em 60 min e Destaque não aprovado até a hora agendada (ou em 24 h, se "Agora") expiram (`expired`). Polling de 10 s; banner com a contagem de pendentes no cabeçalho de A09 e aviso no sino do Estúdio para quem tem `push.approve`.

### 10.4 Aba 3 · Histórico `/historico` e `/historico/[id]`

Lista por envio (inclui automáticos `follow`, um por matéria): data, tipo, matéria, pedido por, aprovado por, público, alvos, enviados, aceitos, falhas, removidas, puladas, recebidos, tocados, CTR (tocados ÷ recebidos, só consentidos, com a nota "entre quem permite métricas"). Filtros na URL: período, tipo, estado. Detalhe: linha do tempo (pedido, aprovações, início, fim), números por motivo de pulo e por código de falha, e **detalhamento por classe de aparelho e navegador** (tabela + gráfico de barras SVG com resumo textual). Exportar CSV sem nenhum dado de inscrição.

### 10.5 Aba 4 · Configurações `/configuracoes`

- **Limite diário padrão** (1–3; é também o teto das escolhas do leitor que o tenham acima).
- **Silêncio padrão** (início 18h–22h, fim 7h–10h; sempre contém 22h–7h).
- **Modelos de texto** (até 20: nome, título ≤ 60, texto ≤ 120, com `{titulo}` e `{linha_fina}`).
- **Pausar todos os envios**: botão de contingência (diálogo com motivo e digitar "PAUSAR"); vale na hora para tudo, inclusive `follow` e agendados (ficam `paused`). **Retomar** cria pedido `push.resume` com 2 aprovações (D-P14); ao aplicar, agendados vencidos há mais de 1 h expiram e os demais seguem.
- Estado da configuração técnica: "Chaves VAPID configuradas" ou "Push indisponível: configure VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT na Vercel." (só nomes, nunca valores).

Tudo em `app_settings` (`push.default_daily_limit`, `push.quiet_start`, `push.quiet_end`, `push.templates`, `push.paused`), escrito pela RPC `app_setting_set` com validação por chave e auditoria `settings.update`.

### 10.6 Funil do app `/estudio/admin/notificacoes/funil`

Link "Funil do app" no cabeçalho de A09 (só `push.metrics`). Filtros na URL: período (7, 30, 90 dias, personalizado), classe de aparelho, navegador. Gráfico de funil próprio em SVG (barras horizontais, uma por etapa, com número e % da anterior, cores dos tokens de dados, sem gradiente), igual aos gráficos do P5; tabela equivalente abaixo; **resumo textual** gerado por regra, ex.: "Em 30 dias, 1 240 convites de instalação viraram 180 instalações (14,5%). A maior perda está entre o pré-prompt e a permissão (38% aceitam)." Blocos laterais: "Fora do convite" (instalações pelo navegador, permissões dadas em Alertas), "Negadas" e inscrições ativas por navegador. Aviso fixo: "Contagens de eventos de quem permite métricas; não são pessoas." Estados padrão; vazio: "Sem dados no período."

### 10.7 Diálogo de publicação (E06)

O destino "Push urgente" deixa de ser desativado: ao publicar com ele marcado, cria o pedido Urgente em A09 já preenchido (matéria, título, linha fina) e mostra "Pedido de push criado. Aguardando 2 aprovações." com link. Destaque não aparece no E06.

## 11. Modelo de dados (migrations 0040–0049, reservadas)

- `0040_push_core.sql`: tabelas, índices, RLS e funções do envio.
- `0041_push_admin.sql`: `app_settings` (`create table if not exists`, mesma definição do painel de fontes 0011) e sementes `push.*`, kinds `push.highlight` e `push.resume` (também em `CRITICAL_KINDS` de `src/lib/approvals`), trigger `guard_push_approvals`, permissões, auditoria.
- `0042_push_metrics.sql`: `push_send_counters`, `push_funnel_daily`, RPC `push_funnel`, ampliação da lista de nomes de `events`.
- `0043_push_cron.sql`: jobs `pg_cron` (despacho de agendados a cada minuto, expiração de pedidos, retenção, agregação do funil); sem `pg_cron` nada é agendado e o drain/tick cobre o despacho.
- 0044–0049 livres para correções da própria funcionalidade.

### 11.1 `push_subscriptions`

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | `uuid pk` | |
| `endpoint` | `text unique not null` | `https`, host na allowlist de serviços de push (§13), ≤ 1 024 |
| `p256dh`, `auth` | `text not null` | base64url, tamanhos validados |
| `endpoint_host`, `browser`, `device_class`, `platform` | `text` | família (`chrome`, `safari`, `firefox`, `edge`, `samsung`, `other`), `mobile`/`tablet`/`desktop`, `android`/`ios`/`macos`/`windows`/`linux`/`other` |
| `installed` | `bool` | `standalone` na inscrição |
| `user_id` | `uuid null` → `profiles on delete cascade` | só com sessão |
| `manage_token_hash` | `text not null` | SHA-256 do token (D-P13) |
| `want_follow`, `want_urgent`, `want_highlight` | `bool not null default true` | |
| `targets` | `text[] not null default '{}'` | `check (cardinality(targets) <= 200)`, cada item `^(source|section|topic|bairro):[a-z0-9-]{1,80}$`; índice GIN |
| `quiet_start`, `quiet_end` | `smallint not null default 22 / 7` | `check (quiet_start between 18 and 22 and quiet_end between 7 and 10)` |
| `daily_limit` | `smallint not null default 3` | `check between 1 and 3` |
| `metrics_consent` | `bool not null default false` | §9.2 |
| `day_key`, `day_count` | `date`, `smallint` | contador do dia de Cuiabá, só por `push_reserve` |
| `created_at`, `last_seen_at`, `last_success_at`, `consecutive_failures` | | inscrição sem `last_seen_at` há 180 dias é apagada |

RLS ligada. `anon`: nenhum acesso. `authenticated`: `select` só das próprias (`user_id = auth.uid()`), sem `endpoint`, `p256dh`, `auth` e `manage_token_hash` (view `my_push_subscriptions`). Escrita só pelas rotas de servidor (service role) com token. Equipe: nenhum acesso à tabela; só agregados por RPC.

### 11.2 `push_sends`

`id uuid`, `kind` (`follow`, `urgent`, `highlight`), `article_id` (not null), `title` (≤ 60), `body` (≤ 120), `origin_label`, `url`, `tag`, `audience jsonb` (`{type:"targets"}` para `follow`; `{type:"all"}`, `{type:"section",slug}`, `{type:"bairro",slug}`), `status` (`pending_approval`, `scheduled`, `queued`, `dispatching`, `sent`, `paused`, `cancelled`, `rejected`, `expired`), `requested_by uuid null` (null = sistema, só `follow`), `justification`, `scheduled_at`, `not_before` (janela de arrependimento, D-P15), `created_at`, `approved_at`, `started_at`, `finished_at`, `status_reason`, contadores (`targets_n`, `queued_n`, `accepted_n`, `failed_n`, `removed_n`, `skipped_quiet_n`, `skipped_limit_n`, `skipped_duplicate_n`, `skipped_pref_n`, `sent_measurable_n`), `version`. Índice único parcial `(article_id) where kind = 'follow'` (um envio automático por matéria). `check (kind = 'follow' or requested_by is not null)`. RLS: `select` para `push.approve`/`push.settings` e, para editor, linhas próprias ou da editoria; escrita só por RPC (`push_request`, `push_cancel`) e service role. Trigger `guard_push_sends`: transições válidas; texto e público imutáveis depois do primeiro pedido de aprovação (mudança = cancelar e pedir de novo); `kind`/editoria conferidos contra o papel.

### 11.3 `push_deliveries`

`id bigserial`, `send_id`, `subscription_id` (→ `push_subscriptions on delete set null`), `article_id`, `status` (`queued`, `deferred`, `sent`, `failed`, `expired`, `skipped`), `skip_reason`, `not_before`, `attempts`, `http_status`, `error_code`, `created_at`, `sent_at`. **Índice único parcial `(subscription_id, article_id) where status in ('queued','deferred','sent')`**: a mesma matéria nunca duas vezes na mesma inscrição; linha pulada (limite, silêncio fora do TTL, preferência) não bloqueia envio posterior da mesma matéria. Sem acesso para `anon`/`authenticated`; service role. Retenção 30 dias (depois disso, só os contadores de `push_sends`).

### 11.4 `push_send_counters`

`(send_id, device_class, browser, delivered int, clicked int, primary key (send_id, device_class, browser))`. Incremento só pela RPC `push_receipt_hit` (service role).

### 11.5 Funções

- `push_reserve(p_sub uuid, p_send uuid, p_article uuid, p_kind text, p_now timestamptz) returns text` (service role): numa transação, trava a linha da inscrição (`for update`), zera `day_count` se `day_key` mudou, decide `ok`, `skipped_pref`, `skipped_limit`, `deferred` (com `not_before`) ou `skipped_duplicate` (conflito no índice único), grava a entrega e soma `day_count` quando `ok`. Única porta de entrada do envio.
- `push_request(p jsonb)`, `push_cancel(p_id, p_reason)`, `push_settings_pause(p_reason)`: `security invoker`, RLS e `can()` no banco.
- `push_audience_estimate(p_kind, p_audience jsonb) returns int` (`security definer`, confere `push.request`, arredonda, D-P24).
- Auditoria (`audit_log`, trigger `audit_push_changes`): `push.request`, `push.approve`, `push.reject`, `push.cancel`, `push.dispatch`, `push.finish`, `push.pause`, `push.resume_requested`, `push.resume_applied`, `settings.update`. `object_ref = 'push:<id>'`. Inscrições de leitores não são auditadas individualmente (dado de leitor; ficam só as contagens).

## 12. Fluxos de envio

### 12.1 Automático `follow`

1. Matéria vai a `published` (trigger já existente de publicação) → `queue_enqueue('notify', 'push-follow:<article_id>', {type:"push.match", articleId})` com atraso de 10 min se `auto_published` (D-P15), senão 0. Não gera para `urgent = true` (vai pelo fluxo Urgente), patrocinada, correção ou atualização (mesmo `article_id` → a chave de dedupe e o índice único de `push_sends` barram).
2. `push.match` (drain): confere que continua publicada e que envios não estão pausados; cria `push_sends` `follow`; calcula alvos da matéria (`source:<slug>` das fontes da matéria, `section:<slug>`, `topic:<slug>`, `bairro:<slug>` de cada bairro) e busca inscrições com `want_follow and targets && <alvos>` em lotes de 500 (cursor por `id`), enfileirando `push.deliver` com até 100 inscrições cada (`dedupe_key = push-deliver:<send>:<lote>`).
3. `push.deliver`: para cada inscrição, `push_reserve`; `ok` → envia (§12.3); `deferred` → reenfileira com `not_before` (junta com outro `follow` adiado da mesma inscrição: fica só o mais recente, o anterior vira `skipped`/`coalesced`).
4. Fim do último lote → `sent` com contadores e `push.finish` na auditoria.

### 12.2 Urgente e Destaque

`pending_approval` → aprovações (D-P14) → `queued` (agora) ou `scheduled` → no horário, `pg_cron` (a cada minuto) ou o drain chamam `push_dispatch_due()` → `dispatching` → fan-out como em 12.1 passo 2, com o público do pedido e `want_urgent`/`want_highlight` → `sent`. Urgente ignora o silêncio, respeita o limite (D-P08). Destaque respeita os dois.

### 12.3 Entrega (`src/lib/push/sender.ts`, Node runtime)

`web-push` `sendNotification` com VAPID, payload §8.5, tempo limite 10 s, concorrência 10 por lote, dentro do orçamento de tempo do drain (encerra em 80% e devolve o resto à fila, ADR-004).

| Resposta | Ação |
|---|---|
| 201/202 | `sent`, `accepted_n + 1`, `last_success_at` |
| 404, 410 | apaga a inscrição, `removed_n + 1` |
| 429, 500–599, tempo | retry do lote com espera 1, 4 e 10 min (respeitando `Retry-After`, até 30 min); depois `failed` |
| 400, 403 (chave VAPID não confere), 413 | `failed` sem retry; 403 abre alerta no Control Center ("Chaves VAPID inválidas") e pausa o envio corrente |

Cinco falhas seguidas não 4xx da mesma inscrição em dias diferentes → inscrição apagada. `PUSH_PROVIDER=fake` troca o `sender` por um que grava em memória (unit) ou posta num servidor falso (integração).

### 12.4 Pausa

`push.paused = true`: `push.match` e `push.deliver` terminam sem enviar e deixam os envios `paused` (lotes voltam à fila com atraso de 5 min enquanto durar a pausa, até expirar o TTL, quando viram `expired`). A tela mostra o banner "Envios pausados por {pessoa} às {hora}: {motivo}".

## 13. Rotas públicas e limites

| Rota | Uso | Limite (`hit_rate_limit`, IP em hash com sal diário) |
|---|---|---|
| `POST /api/push/subscriptions` | cria ou atualiza pela chave `endpoint`; devolve `{ id, token }` (token novo se o endpoint já existia e o chamador provar posse com o token antigo; senão, recusa 409 e o cliente refaz com `unsubscribe`/`subscribe`) | 10/h por IP |
| `PATCH /api/push/subscriptions/:id` | preferências, alvos, `metrics_consent`, `last_seen_at`; `Authorization: Bearer <token>` | 60/h por inscrição |
| `DELETE /api/push/subscriptions/:id` | apaga; token | 20/h por IP |
| `PUT /api/push/subscriptions/rotate` | `pushsubscriptionchange`; token + endpoint antigo | 10/h por IP |
| `POST /api/push/receipt` | `{ s, e, d, b }`; só grava se o cookie `cn_consent` tiver Métricas e `s` existir e tiver sido enviado há menos de 48 h | 120/h por IP |

Todas: só `POST`/`PATCH`/`PUT`/`DELETE`, JSON validado por zod, `Origin` igual ao do site (recusa 403), corpo ≤ 4 KB, respostas sem cache. `GET` não muda estado.

**Allowlist de endpoints** (`src/lib/push/endpoints.ts`): `fcm.googleapis.com`, `*.push.apple.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`, `push.services.mozilla.com`; `https`, porta 443, sem credenciais; resolução DNS com recusa de IP privado reaproveitando `src/lib/pipeline/net.ts`. Em teste, `PUSH_ENDPOINT_TEST_HOSTS` acrescenta `127.0.0.1:<porta>`; a variável é ignorada quando `VERCEL_ENV = production`.

## 14. Segurança e privacidade

- **Chaves:** `VAPID_PRIVATE_KEY` só no servidor (`src/lib/push/server.ts` com `import "server-only"`); `NEXT_PUBLIC_VAPID_PUBLIC_KEY` público; `VAPID_SUBJECT` = `mailto:` do encarregado. Nunca em log, teste ou fixture (testes geram par próprio em tempo de execução).
- **SSRF:** o servidor faz `POST` para o endpoint informado pelo navegador; a allowlist e a checagem de DNS impedem apontar para rede interna (Review Focus 3).
- **Payload mínimo** (§8.5); textos da equipe passam por `sanitizeNotificationText` (sem HTML, sem caracteres de controle, espaços normalizados, cortes por grafema com "…").
- **Rotas de cron e worker** continuam exigindo `Authorization: Bearer ${CRON_SECRET}`; `push.match`, `push.deliver` e `push_dispatch_due` só rodam no drain.
- **RLS** em todas as tabelas novas; service role só nas rotas do pipeline e de `/api/push/*`.
- **LGPD:** inscrição é dado pessoal (endpoint + chaves); finalidade: entregar os avisos pedidos; base: pedido do titular. Apagada ao desativar, em 404/410, sem visita em 180 dias ou na exclusão da conta; exportação em `/perfil` lista inscrições (navegador, aparelho, preferências, alvos, datas), sem chaves. `/privacidade` ganha a seção "Avisos pelo celular" e "Leitura offline".
- **Nada é enviado nem medido sem consentimento** além do que §9.2 lista como operação do serviço.

## 15. Estados de erro

| Situação | Comportamento |
|---|---|
| `subscribe()` falha (rede, serviço de push fora, Brave com push desligado) | InlineAlert "Não foi possível ativar os avisos agora. Tente de novo mais tarde." + "Tentar de novo"; nada gravado; não conta recusa |
| `POST /api/push/subscriptions` falha depois do `subscribe()` | O cliente chama `unsubscribe()` para não deixar inscrição órfã e mostra o mesmo erro |
| Limite de rota atingido | "Muitas tentativas. Tente de novo em alguns minutos." |
| Token perdido (IndexedDB apagado) com permissão concedida | Próxima visita detecta `getSubscription()` sem token: `unsubscribe()` e oferece "Ativar avisos" de novo em Alertas (a linha antiga some no próximo 410 ou em 180 dias) |
| Permissão revogada nas configurações do navegador | Próximo envio recebe 410 → inscrição apagada; Alertas mostra estado "Negado" |
| Payload inválido no SW | Aviso genérico (§8.4) |
| Offline sem cópia | `/offline.html` com a lista |
| Cota de armazenamento do navegador cheia (`QuotaExceededError`) | LRU remove o dobro do tamanho necessário e tenta uma vez; falhou, segue sem guardar |
| SW novo com cache antigo | `activate` mantém `cn-salvos-v1` e migra índice; caches de versões anteriores apagados |
| VAPID ausente ou inválida | D-P25; 403 do serviço pausa o envio e alerta |
| Aprovação por quem pediu | "A aprovação precisa ser de outra pessoa." (banco e interface) |
| Matéria despublicada entre pedido e envio | Envio `cancelled` automático, lotes restantes descartados |

## 16. Testes

- **Unit (Vitest, TDD):** `src/lib/app/invites.ts` (2ª visita, 3 leituras, 14 dias, 3 recusas, `standalone`, um convite por vez); `src/sw/core.ts` (allowlist de cache, LRU com teto de 25 MB e ordem de remoção, salvas nunca removidas, payload inválido → genérico, `u` externo → `/`, texto de cópia antiga em Cuiabá); `src/lib/push/rules.ts` (silêncio com preferência, limite, urgente no silêncio, urgente no limite, coalescência de `follow`, alvos da matéria); `endpoints.ts` (allowlist, IP privado, porta, credenciais); `sanitizeNotificationText`; família de navegador por UA; resumo textual do funil; validação dos schemas zod das rotas.
- **Integração (Vitest + Supabase local):** RLS (anon sem acesso, leitor lê só as próprias sem chaves, equipe sem acesso à tabela); `push_reserve` concorrente (10 chamadas paralelas não passam do limite); índice único parcial `(subscription_id, article_id)`; `guard_push_approvals` (quem pediu, mesmo aprovador duas vezes, editor aprovando); pausa e retomada com 2 aprovações; **servidor de push falso** (HTTP local que responde 201, 404, 410, 429 com `Retry-After`, 500 e 403 conforme o endpoint; decifra o payload com o par gerado no teste e confere que só tem `v,t,b,u,g,s`); fan-out de 1 200 inscrições em lotes; janela de arrependimento com despublicação no meio; receipt sem cookie de Métricas não grava.
- **E2E (Playwright, Chromium):** SW registrado e manifesto válido (campos, ícones 192/512 `any` e `maskable` acessíveis); faixa na 2ª visita com `beforeinstallprompt` sintético, "Agora não" some por 14 dias (relógio simulado), 3 recusas nunca mais, oculta com `display-mode: standalone` emulado; iPhone (projeto WebKit com UA de iPhone): passos C08 e nenhum pré-prompt fora do app; pré-prompt ao seguir fonte com `context.grantPermissions(['notifications'])` e `PushManager.prototype.subscribe` trocado por `addInitScript` (endpoint do servidor falso); "Agora não" não chama `requestPermission` (espião); push entregue por CDP `ServiceWorker.deliverPushMessage` mostra aviso (espião em `showNotification`) e, com Métricas, gera `receipt`; offline com `context.setOffline(true)`: home, editoria, matéria lida e salva abrem com "Salva às…", matéria nunca aberta cai em "Sem conexão" com a lista; A09: Urgente pedido por Marina Arruda, aprovado por Helena Costa (admin) e por uma segunda editora-chefe de teste, com a aprovação recusada para a própria Marina e para Helena pela segunda vez; editor Otávio Reis só vê Destaque da editoria; pausa e retomada; funil com dados semeados.
- **A11y (`@axe-core/playwright`, `@a11y`):** C07, C08, C09, Alertas (todos os estados), `/offline.html`, `/app`, A09 (4 abas + funil); 0 violações `serious`/`critical`; foco preso nos diálogos; navegação por teclado; gráfico com resumo textual.
- **Lighthouse CI:** home instalada continua dentro dos orçamentos (LCP, INP, CLS, JS ≤ 170 kB: convites e registro do SW carregados sob demanda).

## 17. O que o dono configura

1. **Chaves VAPID** na Vercel (Production e Preview): `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` do encarregado). Geradas uma vez com `pnpm push:keys` (roda `web-push generate-vapid-keys` local; nada é gravado no repositório). Trocar as chaves invalida todas as inscrições: só em incidente.
2. Nada no Supabase além das migrations (aplicadas pelo CI) e de `pg_cron` já ligado.
3. Ícones: vêm do brand kit (`design-system/assets/logo`, `public/brand`); nenhuma arte nova. Se o dono quiser splash diferente do símbolo sobre fundo escuro, basta trocar o arquivo-fonte e rodar `pnpm icons:build`.
4. Papéis: dar `editor_chefe`/`admin` a quem vai aprovar urgente. Urgente precisa de **três pessoas** (quem pede + duas aprovações): a redação precisa ter ao menos três pessoas com esses papéis ou pedidos feitos por editor-chefe/admin com duas outras disponíveis (risco em §19).

## 18. Critérios de aceite

1. `GET /manifest.webmanifest` devolve `name` "CityNews Cuiabá", `short_name` "CityNews", `start_url` na home, `display` `standalone`, ícones 192 e 512 `any` e `maskable` existentes e atalhos Últimas, Salvos e Busca; o Chrome considera o site instalável.
2. O SW é registrado em páginas públicas e nunca em `/estudio`; a CSP continua sem `unsafe-inline` em `script-src` e sem origem nova; `public/sw.js` é igual ao gerado por `pnpm sw:build`.
3. Salvar uma matéria continua a guardá-la offline (`cn-salvos-v1` intacto após atualizar o SW de v1 para a nova versão).
4. Offline, a home, uma editoria aberta antes e as 30 últimas matérias lidas abrem do cache com "Salva às HHhMM, pode estar desatualizada."; a 31ª lida mais antiga sai; matéria nunca aberta abre "Sem conexão" com a lista de páginas, salvas e lidas.
5. Com cache acima de 25 MB, o LRU remove lidas e depois páginas, nunca salvas; nenhuma resposta de `/perfil`, `/estudio`, `/api`, `/busca` ou com `Set-Cookie` entra em cache.
6. "Apagar histórico local" e "Limpar leitura offline" apagam `cn-lidas` e `cn-paginas`.
7. A faixa de instalação aparece na 2ª visita ou depois de 3 leituras qualificadas, nunca em `standalone`, nunca junto com o banner de consentimento ou outro convite; "Agora não" some por 14 dias; depois de 3 recusas não aparece mais e "Baixar o app" continua no menu e no rodapé.
8. No iPhone (Safari), "Instalar" abre os passos Compartilhar → Adicionar à Tela de Início; o convite de notificações não aparece fora do app instalado.
9. O convite de notificações só aparece depois de seguir algo, criar alerta de navegador ou abrir matéria urgente, com o texto de D-P09, "Ativar" e "Agora não"; "Agora não" nunca chama o pedido nativo; "Ativar" chama e, concedida, cria a inscrição com os alvos explícitos e nada mais (sem histórico, interesses ou `anonId`).
10. Alertas mostra os estados sem suporte, iPhone fora do app, desligado, negado (com instruções do navegador detectado) e ativo com três tipos, silêncio (só pode aumentar) e limite 1–3; mudanças salvam com o token e "Desativar avisos" apaga a inscrição no servidor.
11. Tocar num aviso abre a matéria; offline e com a matéria em cache, abre a cópia com o rótulo de desatualizada.
12. Matéria publicada por pessoa em `section:cidades` com bairro CPA gera um envio `follow` para inscrições que seguem `section:cidades` ou `bairro:cpa` com `want_follow`; publicada automaticamente espera 10 min e, despublicada nesse intervalo, não envia nada.
13. Nenhuma inscrição recebe mais de 3 avisos no mesmo dia de Cuiabá (nem com 10 reservas concorrentes), nem a mesma matéria duas vezes, nem `follow`/`highlight` entre 22h e 7h (adiados; `follow` adiados viram um só no fim do silêncio da inscrição, ou são pulados fora do TTL); urgente chega no silêncio e respeita o limite.
14. Resposta 404 ou 410 do serviço de push apaga a inscrição; 429 e 5xx têm retry 1, 4, 10 min respeitando `Retry-After`; 403 pausa o envio e alerta o Control Center.
15. `POST /api/push/subscriptions` recusa endpoint fora da allowlist, `http`, porta diferente de 443, IP privado ou host que resolve para rede interna, com 400 e sem nenhuma requisição ao destino.
16. O payload cifrado contém só `v`, `t`, `b`, `u`, `g`, `s`; `u` externo vira `/` no SW; payload inválido mostra o aviso genérico.
17. Sem Métricas: nenhum evento de §9.1 é enviado, o SW não chama `/api/push/receipt` e a rota recusa gravar sem o cookie; com Métricas, eventos vão sem `anonId` e o recebido/tocado soma em `push_send_counters` sem id de inscrição.
18. Sem sessão, `/estudio/admin/notificacoes` redireciona para `/entrar?next=…`; papel sem ação de push recebe `motivo=sem-permissao` e não vê o menu; analista só vê o Funil.
19. Novo envio exige matéria publicada não patrocinada, título ≤ 60 e texto ≤ 120 (contadores), mostra prévia Android, iPhone e desktop com rótulo de origem e alcance arredondado ("menos de 20" abaixo de 20); Urgente só "Agora"; Destaque agendável até 7 dias fora de 22h–7h.
20. Urgente só sai com duas aprovações de pessoas diferentes entre si e de quem pediu (banco recusa as outras combinações, inclusive por SQL como `authenticated`); expira em 60 min sem elas. Destaque sai com uma aprovação de editor-chefe ou admin diferente de quem pediu.
21. Editor cria Destaque só de matéria da própria editoria, não vê Urgente, não aprova e vê só os próprios pedidos e envios da editoria.
22. Fila permite Aprovar, Recusar com motivo e Cancelar; Histórico mostra quem pediu e aprovou, alvos, enviados, aceitos, falhas, removidas, puladas por motivo, recebidos, tocados e CTR, com detalhamento por aparelho e navegador e CSV sem dado de inscrição.
23. "Pausar todos os envios" para na hora inclusive os automáticos e agendados; retomar só com duas aprovações; tudo em `audit_log` com ator, motivo e objeto.
24. Configurações salvam limite padrão (1–3), silêncio (sempre contendo 22h–7h) e modelos, auditados como `settings.update`; sem VAPID, a aba mostra quais variáveis faltam, sem valores, e o portal não oferece push.
25. Funil do app mostra as 7 etapas com número e % da anterior, filtros de período, aparelho e navegador na URL, gráfico SVG próprio com resumo textual, "Fora do convite" separado e o aviso "eventos, não pessoas".
26. Todas as telas novas têm carregando, vazio, erro e sucesso em 360, 768 e 1280 px e 0 violações `serious`/`critical` no axe.

## 19. Review Focus (5 falhas mais arriscadas)

1. **Aviso a mais ou fora de hora** (quebra a promessa do pré-prompt). Causa provável: corrida entre lotes do mesmo envio ou de envios diferentes. Esperado: toda entrega passa por `push_reserve` com trava da linha da inscrição e índice único parcial `(subscription_id, article_id)`; teste de 10 reservas paralelas e de silêncio com relógio em 21:59/22:00/06:59/07:00 de Cuiabá.
2. **Urgente sem as duas aprovações**. Causa provável: aprovação conferida só na interface, ou o mesmo aprovador nos dois registros. Esperado: `guard_push_approvals` e `guard_push_sends` recusam no banco; o despacho confere de novo que todos os registros `push:<id>` estão `approved` com aprovadores distintos entre si e de `requested_by` antes de enfileirar, e marca-os `applied`.
3. **SSRF pelo endpoint da inscrição**. Causa provável: endpoint de atacante apontando para `169.254.169.254` ou rede interna. Esperado: allowlist de hosts + DNS sem IP privado na criação **e** no envio (o DNS pode mudar); nenhuma requisição sai para fora da allowlist; teste com host permitido que resolve para IP privado.
4. **SW novo quebra o que existe** (salvas somem, página velha presa, Estúdio servido do cache). Esperado: `cn-salvos-v1` preservado; navegação sempre rede primeiro com tempo limite; allowlist de cache exclui páginas com sessão; `SW_VERSION` nova ativa com `skipWaiting` sem exigir fechar abas; teste E2E de atualização v1 → nova com salvas presentes.
5. **Medição sem consentimento**. Causa provável: SW sem o estado de consentimento (sem acesso a cookie) pingando `receipt`, ou eventos do app enviados antes da escolha. Esperado: SW só pinga com `consent.metrics` recebido da página; rota confere o cookie `cn_consent` de novo e descarta; eventos passam pelo mesmo `track()` que já respeita a regra de envio; teste com "Só o necessário" que confere zero linhas em `events` e em `push_send_counters`.

## 20. Riscos em aberto

| Risco | Mitigação |
|---|---|
| Urgente precisa de três pessoas disponíveis; de madrugada pode não haver | O pedido expira em 60 min e a matéria segue publicada no portal; §17.4 orienta o plantão; mudar para duas pessoas é decisão do dono (sem migração destrutiva: número de registros por kind em `guard_push_approvals`) |
| iOS muda regras de Web Push (só app na Tela de Início, cota de avisos silenciosos) | Sempre mostrar aviso no `push`; C08 e P18 explicam; Declarative Web Push (Safari 18.4+) fica como melhoria futura sem mudar o payload |
| Navegadores sem `beforeinstallprompt` (Firefox, Safari no Mac) veem pouco convite | P26 com instruções; métricas "Fora do convite" mostram o volume |
| Drain no Vercel Hobby com fan-out grande | Lotes de 100, concorrência 10, 80% do tempo e devolução à fila; urgente tem `Urgency: high` mas mesma fila; se passar de 20 mil inscrições, revisar em nova decisão |
| Funil por eventos, sem pessoas, pode confundir | Aviso fixo e "Fora do convite" separado; nunca somar etapas de fontes diferentes como se fossem a mesma pessoa |
| `app_settings` e `approvals` vêm do painel de fontes (0011, P5-T1) | 0041 cria `app_settings` se não existir; o plano ordena as tarefas depois do merge de `painel-fontes` ou traz `src/lib/approvals` junto |
| Texto do pré-prompt ajustado (D-P09) e urgente dentro do limite (D-P08) | Registrados para o dono; trocar é só texto e uma regra pura |
