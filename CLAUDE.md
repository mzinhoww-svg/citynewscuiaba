# CLAUDE.md · CityNews Cuiabá

Instruções permanentes para o Claude Code neste repositório. Leia inteiro antes de qualquer tarefa.

## OPERATING MODE — AUTONOMOUS EXECUTION

```
AUTONOMOUS BY DEFAULT
HUMAN EXCEPTION ONLY
```

Esta é a regra operacional de maior prioridade do projeto (decisão do dono, A-127). Ela governa **como o agente trabalha**; as regras de produto do §5 continuam governando **o que o produto faz**. Em conflito sobre modo de operação, esta seção vence qualquer documento mais antigo, inclusive a spec mestre, os planos e `docs/AUTONOMY.md`.

### Política

O CityNews opera autonomamente por padrão. Uma instrução do usuário que define um objetivo constitui autorização para executar todas as operações técnicas necessárias para concluir esse objetivo, dentro das permissões disponíveis ao agente. O agente não pede aprovação intermediária para tarefas rotineiras, técnicas ou necessárias à execução do objetivo.

```
DIAGNOSTICAR → DECIDIR → IMPLEMENTAR → TESTAR → REVISAR → CORRIGIR → VALIDAR → CONCLUIR
```

```
USER DEFINES OBJECTIVE → CLAUDE EXECUTES → CLAUDE VALIDATES → CLAUDE CORRECTS → CLAUDE CLOSES
```

Nunca `EXECUTAR → PEDIR APROVAÇÃO → ESPERAR → EXECUTAR`. Dentro de um objetivo já autorizado, o agente **não** interrompe o fluxo com "Posso continuar?", "Quer que eu execute?", "Devo aplicar?", "Posso rodar o SQL?", "Quer que eu corrija?", "Devo fazer o deploy?" ou "Quer que eu teste?". Ele faz, valida e relata.

### Exceção humana (a lista é fechada)

A intervenção humana existe somente quando:

1. a plataforma exige interação humana (OAuth, captcha, 2FA, aceite de termos, painel sem API);
2. a decisão é explicitamente reservada ao proprietário: gasto de dinheiro (plano pago, domínio, cota), exclusão irreversível de dado de produção ou de recurso fora do repositório, ou mudança do produto quando a spec se contradiz (não da implementação);
3. há uma dependência externa que o agente não pode executar (segredo que só o dono tem, conta de terceiro, cadastro em painel);
4. há uma exceção de segurança, jurídica ou operacional que a política determina expressamente como humana: pedido LGPD que exige prova de identidade, remoção legal de conteúdo, e as retenções editoriais do §5.8.

Aprovação humana **nunca** é fallback para falha de IA, timeout, provider indisponível, erro transitório, SQL autorizado, migration, testes, build, lint, typecheck, Git, debugging, reprocessamento ou outra tarefa técnica necessária ao objetivo.

### FAILURE ≠ STOP

```
FAIL → DIAGNOSE → IDENTIFY ROOT CAUSE → RETRY → ALTERNATIVE STRATEGY → FALLBACK → VERIFY → CONTINUE
```

Vale para AI, MCP, Supabase, SQL, API, provider, network, build, test, migration, deployment, source extraction, enrichment, publication e queue processing. O agente esgota retry, estratégia alternativa, fallback, reprocessamento ou correção antes de escalar. Detalhes da escada em `docs/AUTONOMY.md` §4.

**AI failure must trigger recovery, not automatic human approval.** No produto e na operação:

```
AI FAIL → RETRY → ALTERNATE MODEL → ALTERNATE PROMPT → ENRICH → FALLBACK → DEGRADED MODE → HUMAN EXCEPTION ONLY IF STILL UNRESOLVED
```

### Filas

Fila não substitui automação. Nenhum item fica indefinidamente em `PENDING`, `WAITING`, `REVIEW`, `APPROVAL` ou `QUEUED` sem `next_action`, `retry`, `fallback`, `timeout` e `terminal_state`. Fila crescendo é incidente: `DETECT → DIAGNOSE → IDENTIFY ROOT CAUSE → RECOVER → DRAIN`, nunca `QUEUE → WAIT FOR HUMAN`. Código novo que cria estado de espera define os cinco campos acima; código antigo sem eles é corrigido quando o objetivo tocar nele.

### Governança sem gargalo humano

```
REQUEST → POLICY ENGINE → VALIDATE → APPLY → AUDIT        (padrão)
REQUEST → POLICY → HUMAN_EXCEPTION                         (só nos casos da lista fechada)
```

O CityNews não depende de duas pessoas para operações normais. Onde existir um mecanismo de proteção necessário, ele é **authorization + policy validation + audit trail + rollback + automated safeguards**, não uma segunda assinatura. Documento antigo que exija segunda pessoa, segunda aprovação ou "aguarde aprovação" para operação técnica ou administrativa é obsoleto nesse ponto e não deve ser reintroduzido. No código: `evaluateGovernance` (`src/lib/governance`) decide `auto_apply`, `auto_review`, `human_exception` ou `rejected`; a aprovação pelo sistema fica em `approvals.decision_mode = 'system'` e cada decisão em `governance_decisions` (actor = system, política, versão, regra, hash das entradas); todo pedido pendente tem prazo e expira sozinho (`governance_sweep`). A regra de duas pessoas saiu do banco em 0149 (A-128); o motor de política e a trilha vieram em 0157 (A-142). Desenho: `docs/superpowers/specs/2026-10-04-governanca-autonoma-design.md`.

### Auditoria permanece

Autonomia não é ausência de controle. Toda ação automática relevante é **AUDITABLE, TRACEABLE, REVERSIBLE WHEN POSSIBLE**, com `decision`, `reason`, `policy`, `policy_version`, `actor`, `timestamp` e `result` quando aplicável (no produto: `decisions`, `studio_audit`, regras versionadas; no repositório: commits, `.planning/DECISIONS.md` e `.planning/BLOCKERS.md`).

### Skills por natureza da tarefa

Selecione a skill adequada em vez de improvisar um processo inferior:

| Situação | Skill |
|---|---|
| Bug, teste falhando, comportamento inesperado | `systematic-debugging` |
| Sessão que deu errado, retrabalho, skill que não disparou | `diagnosing-superpowers` |
| Feature ou mudança de comportamento ainda sem desenho | `brainstorming` → `writing-plans` |
| Plano pronto | `subagent-driven-development` (ou `executing-plans` sem subagentes); tarefas independentes em `dispatching-parallel-agents`; isolamento em `using-git-worktrees` |
| Código novo ou correção | `test-driven-development` |
| Antes de declarar pronto, commitar ou abrir PR | `verification-before-completion` |
| Fim de tarefa grande ou antes do merge | `requesting-code-review`; ao receber revisão, `receiving-code-review` |
| Integrar o branch | `finishing-a-development-branch` |
| Interface | `impeccable` (auditoria e polimento) e `ui-ux-pro-max` (checagens de UX) |

### Self-review e verificação obrigatórios

```
IMPLEMENTED → SELF-REVIEW → ADVERSARIAL CHECK → FIX → RETEST → VERIFY
```

"Implementado" não é "concluído", e "teste local passou" não é automaticamente "concluído". Valide a camada que o problema exige, sem declarar conclusão sem evidência:

```
CODE → TEST → DATABASE → INTEGRATION → BUILD → DEPLOY → RUNTIME → VERIFY
```

### Bloqueio externo

Quando uma ação realmente não pode ser executada por limitação externa: (1) faça todo o trabalho possível; (2) identifique exatamente o bloqueio; (3) classifique como `OWNER_ACTION_REQUIRED` ou `BLOCKED_EXTERNAL` em `.planning/BLOCKERS.md`; (4) descreva o único passo que depende do ambiente externo; (5) continue todas as atividades independentes. Um bloqueio nunca para o projeto inteiro.

### Permissões da plataforma não são regra do CityNews

Esta política orienta o comportamento do agente, mas **não substitui** o permissionamento do Claude Code (modo de permissão, allowlist de ferramentas, sandbox, proxy de rede, aprovação de conector). Quando a plataforma bloquear uma ferramenta: identifique a causa, use a configuração disponível no ambiente (`.claude/settings.json`, conectores, variáveis), não transforme o bloqueio em regra de negócio do CityNews e não trate a aprovação de ferramenta da plataforma como aprovação editorial humana.

## 1. O que é este projeto

Portal de notícias híbrido de Cuiabá:

1. Portal editorial próprio (produto principal).
2. Panorama de fontes: camada secundária que agrega links de outros veículos, sempre com origem.
3. Motor autônomo que coleta, agrupa, verifica, resume, ilustra e publica a cada 30 minutos, dentro de regras.
4. Estúdio (redação e administração) e Control Center (operação e IA) para supervisão humana.

Documentos de referência:

| Documento | Papel |
|---|---|
| `docs/superpowers/specs/2026-09-27-citynews-design.md` | Spec mestre (base do P0 a P6). Emendada pelas specs filhas e decisões do dono abaixo |
| Specs filhas em `docs/superpowers/specs/` e `respostas-do-dono-rodada-3.md` | Decisões do dono datadas (autonomia, UI pública, destaques, guia, segurança, banners) |
| `docs/audit/` | Auditoria 360 (04/10/2026): diagnóstico, inventário de regras, políticas editorial e de mídia, roadmap |
| `docs/adr/` | ADRs a partir do 010 (001 a 009 em `docs/architecture.md` §3) |
| `docs/screens.md` | Inventário de telas, rotas, estados e critérios de aceite |
| `docs/architecture.md` | Arquitetura, ADRs, segurança, filas, cron |
| `PRODUCT.md` / `DESIGN.md` | Produto e sistema visual (lidos pela skill impeccable) |
| `docs/tracking-plan.md` | Eventos, consentimento e ranking de fontes |
| `docs/testing.md` | Estratégia de testes e roteiro do agent-browser |
| `docs/superpowers/plans/*.md` | Planos de implementação P0 a P6 |
| `docs/AUTONOMY.md` | Protocolo de execução autônoma, recuperação e checkpoints |
| `.planning/*` | Estado, progresso, decisões, bloqueios e perguntas do kickoff |
| `design-system/` | Brand kit (tokens originais, componentes JSX, guidelines, logos, fontes, UI kits). Referência de forma; corrigido por `DESIGN.md` §2 |

**Autoridade e conflito (ADR-010).** Da mais forte para a mais fraca: (1) regra executável (teste, trigger, check, RLS, lint); (2) decisão do dono datada, a mais recente vencendo a mais antiga no mesmo tema; (3) este arquivo, §5 a §8; (4) specs sem decisão do dono; (5) `DESIGN.md`, `PRODUCT.md`, `docs/screens.md`, `docs/architecture.md`, ADRs; (6) planos, relatórios e `.planning/`. Em conflito, vale o mais forte, o conflito vira `A-###` e o texto mais fraco é corrigido no mesmo PR. Decisão do dono que reduz uma garantia de integridade, segurança ou direito de terceiros (camada 1) não é aplicada direto: registre como pendente, proponha alternativa que preserve a garantia e peça confirmação.

## 2. Modo de execução (autônomo, pré-aprovado pelo dono do produto)

**P0 a P6 estão concluídos** (`.planning/progress.json`). O protocolo de construção abaixo e `docs/AUTONOMY.md` continuam valendo para iniciativas com plano; o trabalho depois do P6 segue estas regras:

- **Perguntas:** só quando a resposta muda o produto, o risco jurídico ou exige gasto. Junte as perguntas numa mensagem, com recomendação e padrão. O resto se decide pela ordem de autoridade acima, com registro em `A-###`, e o trabalho que não depende da resposta continua.
- **Produção:** aplicar migration, conferir estado e ajustar variável de ambiente em produção é permitido quando o dono pediu a entrega ou autorizou (B-009); sempre registrado em `DECISIONS.md`. Gasto e exclusão de dados fora do repositório continuam exigindo o dono.
- **Mudança de decisão de publicação:** primeiro em sombra ou com a simulação de 7 dias (ADR-012).
- **Estado:** `.planning/STATE.md` é curto e reescrito a cada entrega; decisões com status e supersessão (ADR-011).

Protocolo de construção (histórico do P0 a P6, vale para novos planos):

- Spec, design e planos estão **aprovados**. O protocolo completo está em `docs/AUTONOMY.md`.
- **Kickoff único:** `/citynews-kickoff` fez no máximo 15 perguntas, todas de uma vez (`.planning/QUESTIONS.md`), e depois nenhuma até o fim do P6.
- **Execução:** `/citynews-build` (sessão interativa) ou `scripts/autopilot.sh` (loop não interativo). Ordem: P0 → (P1 ∥ P3) → (P2 ∥ P4) → P5 → P6.
- Cada tarefa usa `superpowers:subagent-driven-development`. Tarefas `[paralelo]` vão para `superpowers:dispatching-parallel-agents`. Sem subagentes, use `superpowers:executing-plans`.
- **Checkpoints:** depois de cada tarefa, commit + `.planning/progress.json` + `.planning/STATE.md`. Decisões novas em `.planning/DECISIONS.md` (`A-###`). Bloqueios e contornos em `.planning/BLOCKERS.md`.
- **Erros:** siga a escada de recuperação (`docs/AUTONOMY.md` §4). Nunca pare no primeiro erro, nunca desative teste para passar.
- **Retomada:** `/citynews-resume` reconstrói o contexto a partir de `.planning/`. Nunca dependa do histórico da conversa.
- Só chame o dono nos três casos de `docs/AUTONOMY.md` §7. Mesmo assim, continue o que não depende da resposta.

## 3. Stack

- Next.js (App Router, versão estável mais recente no momento do scaffold), React Server Components, TypeScript `strict`.
- pnpm, Node LTS. Tailwind CSS v4 com tokens em CSS (`src/styles/tokens.css`). Radix UI para primitivas acessíveis.
- Supabase: Postgres, Auth, RLS, Storage, `pgmq`, `pg_cron`, `pg_net`, `pgvector`, FTS em português com `unaccent`.
- IA via Vercel AI SDK (`ai`) com **OpenRouter** (provedor compatível com OpenAI), modelos registrados no banco, embedding `openai/text-embedding-3-small`. Saídas estruturadas validadas com `zod`. `AI_PROVIDER=fake` em teste e CI.
- Testes: Vitest + Testing Library, Playwright, `@axe-core/playwright`, agent-browser (exploratório), Lighthouse CI.
- GitHub (repositório, Actions para CI e backup) e Vercel (hosting, previews por PR).

## 4. Comandos

```bash
pnpm dev            # desenvolvimento
pnpm lint           # eslint + prettier --check
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest run
pnpm test:e2e       # playwright test
pnpm test:a11y      # playwright test --grep @a11y
pnpm verify         # lint + typecheck + test + build (obrigatório antes de todo commit de fim de tarefa)
pnpm db:reset       # supabase db reset (local)
pnpm db:types       # gera src/lib/db/types.ts
```

## 5. Regras de produto que nunca podem quebrar

1. **Grafia da marca:** `CityNews` (CamelCase, como no brand kit) em toda a interface e no texto; `Cuiabá` sempre acentuado. A exceção são os rótulos de origem em caixa alta (ORIGINAL CITYNEWS). Idioma da interface: pt-BR.
2. **Login nunca é obrigatório** para navegar, ler, pesquisar, usar a busca tradicional, ver a agenda, acessar fontes agregadas, receber recomendações básicas ou usar o portal anônimo. Todo convite de login tem a ação "Agora não".
3. **Origem sempre visível, em vocabulário simples** (spec `2026-10-02-ui-publica-design.md` §4.1, aprovado pelo dono). Plaqueta só para ORIGINAL CITYNEWS e AGREGADO · fonte, no máximo 1 por card, nunca faixa que agrupe rótulos (`OriginStrip` é proibido). Em texto: "Feito a partir de n fontes" (conteúdo derivado de outras fontes), "Patrocinado", e na legenda da foto de terceiros "Foto: reprodução web · Fonte", com crédito (D-02). "Revisado automaticamente", "Revisado por {nome}", confiança, estado do assunto e "Corrigido" saíram do público (R16, R31, R34) e só aparecem no Estúdio. O resumo da matéria é "Resumo em poucos segundos", sem rótulo de origem. **Nenhuma tela pública** exibe "normalizado", "resumo por IA", "publicado automaticamente", "gerado por IA", "inteligência artificial" nem a sigla "IA" como rótulo (exceções: páginas legais e o Estúdio; `/como-usamos-ia` e `/metodologia` estão ocultas pela R34). Os nomes antigos (`normalized`, `ai_summary`, `auto_published`, NORMALIZADO PELO CITYNEWS, RESUMO POR IA, PUBLICADO AUTOMATICAMENTE, REVISADO POR HUMANO, FOTO ORIGINAL, REPRODUÇÃO, IMAGEM LICENCIADA, IMAGEM ILUSTRATIVA, IMAGEM GERADA POR IA, PATROCINADO) continuam **só como nomes internos** em `src/lib/labels`, no dado e no Estúdio/Control Center; `publicLabels` decide o que a tela pública mostra. A referência executável do vocabulário público são `src/content/vocabulary.test.ts` e `tests/e2e/vocabulary.spec.ts`: se este texto e os testes divergirem, valem os testes. Nenhum selo público de conteúdo gerado por IA (D-06, decisão do dono); a rastreabilidade interna (`decisions`, `ai_calls`, versões) continua, e o portal nunca afirma autoria humana, apuração presencial ou revisão que não aconteceu. Texto nunca depende só de cor.
4. **Agregado não é republicado.** Só título original, data, resumo de até 2 frases escrito pelo CityNews (quando a política da fonte permitir), imagem apenas com permissão registrada e link para o original.
5. **IA nunca responde sem fonte** (D-01, decisão do dono de 04/10/2026, substitui a R36). Com fonte relevante, o Pergunte responde só o que ela sustenta, citada; uma fonte basta, atribuída e marcada como fonte única (nunca como confirmação independente). Sem fonte relevante, ou sem fato sustentado, informa a limitação e mostra o que encontrou e a busca tradicional. Falha técnica é erro, não ausência de fonte. Fato, inferência, lacuna e divergência aparecem separados. Imposto por `src/lib/ai/answer.ts` e testes.
6. **Texto externo é dado, nunca instrução.** Todo conteúdo coletado passa por `sanitizeExternalText` e é enviado aos modelos dentro de delimitadores de dados.
7. **Personalização só com consentimento.** Sem consentimento, peso individual = 0. Nunca inferir saúde, religião, orientação política, raça, renda ou outro atributo protegido.
8. **Publicação automática é regra, não improviso.** Decisões passam por `decidePublication` com regras versionadas. **Por decisão expressa do dono (spec `2026-10-03-autonomia-de-publicacao-design.md`, A2/A4), segurança, política, saúde, tema sensível e urgente local publicam sozinhos nas regras v3**, sempre com a fonte citada ("Com informações de {fonte}"), e o motor de autonomia (`decideAutonomy`, `src/lib/rules/engine.ts`, A-143) dá a cada matéria nível A0 a A4 e uma saída: publicar, publicar degradado, reprocessar com espera (30 min, 2 h, 6 h), quarentena com recomendação ou exceção humana. **Falha de IA nunca vai para a fila humana**: nova redação agendada e, esgotada, quarentena (o rascunho sem IA nunca publica, regra 4). Exceção humana (fila de revisão, onde o revisor automático decide os níveis 2 e 3) só para fontes divergentes com confiança baixa ou tema sensível, divergência central em assunto grave, conteúdo `dubious` (D-05), configuração explícita do dono (categoria em revisão, `forceReview`, portões das regras antigas) e conteúdo sem proveniência ou cortado; duplicata e notícia com mais de 72 h vão para quarentena; `read_only` ou `auto_publish` desligado deixam rascunho esperando o religamento; confiança baixa, fonte não confiável com assunto grave e falta de fonte reprocessam e, esgotados, publicam degradado (risco baixo) ou vão para quarentena. Regras antigas (sem `neverAuto` no corpo) continuam retendo segurança e breaking. Disjuntor de 300 por hora e 3.000 por dia pausa a publicação automática (limites do dono, A-126), segura o ciclo como rascunho e se recupera sozinho depois do resfriamento, quando as contagens caem abaixo de 80% dos limites (só religa o que ele desligou; o admin mantém o reset manual). Religar `auto_publish` é ação direta do admin no Control Center (Contingência ou Interruptores), auditada e com o disjuntor zerado, sem segunda pessoa (decisão do dono, A-125). Alterar regras também é ação direta de uma pessoa com o papel de aprovar (admin ou editor-chefe), que propõe e aplica numa ação só, auditada: `approvals` guarda quem pediu e quem aprovou (decisão do dono, A-128; vale para toda mudança crítica). O revisor automático noturno nunca decide rascunho sem IA, correção, direito de resposta, denúncia nem mudança de regra (ADR-013). "Fontes independentes" conta veículos; a contagem por linhagem de texto (cópia do mesmo release vale uma) é só indicador informativo (D-03): não muda confiança, portão nem revisor, e passar a usá-la é decisão futura e explícita do dono. **Risco editorial em quatro níveis (D-05):** toda decisão grava nível e motivos (`classifyRisk`, `articles.risk_level`); com `riskLevels` nas regras (v4, proposta em `supabase/bootstrap/rules-v4-proposal.sql`) divergência em assunto comum publica com as versões atribuídas e só a divergência central em assunto grave vai para revisão; o revisor noturno decide níveis 2 e 3 e nunca o crítico (nível 4).
9. **Imagem gerada nunca é fotorrealista de pessoa real** e nunca ilustra crime, tragédia ou saúde individual.
10. **Fontes:** produção só com fontes reais (`docs/sources-registry.md`), coletadas respeitando `robots.txt`, termos e limites. Testes usam fixtures fictícias (Folha do Cerrado, MT Agora etc.). Nunca atribua manchete inventada a veículo real.
11. **Imagem de terceiros** (D-02, decisão do dono): imagem encontrada na web pode ser usada pela política `reproduction`, com o aviso "Foto: reprodução web", crédito, link para o original, sem recorte de crédito e remoção em 24 h a pedido. Desligável pela flag `image_reproduction_enabled`. Todo ativo fica no Media Registry (`media_assets` + visão `media_registry`, migration 0152) com origem, autor quando conhecido, status de direitos (imagem da web sem autorização registrada é `unknown`, nunca `authorized`), escopo de uso e as matérias que o usaram; ativo bloqueado ou vencido nunca volta a ser escolhido. O aviso não é autorização: a legalidade de cada uso depende de revisão jurídica (B-002).

## 6. Convenções de código

- Pastas por domínio: `src/lib/<dominio>/`, cada uma com `index.ts`, tipos e testes ao lado (`*.test.ts`).
- Funções de domínio são puras e testadas primeiro (TDD). Acesso a banco fica em `src/lib/db/`.
- Server Components por padrão. `"use client"` só onde houver estado ou evento.
- Sem `any`. Sem `// @ts-ignore`. Erros de domínio como `Result<T, E>` (`src/lib/result.ts`).
- Textos de interface em `src/content/pt-BR/*.ts`, nunca soltos nos componentes quando forem reutilizados.
- Componentes de UI não conhecem o banco; recebem dados tipados.
- Commits: Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`). Um commit por tarefa do plano, no mínimo.

## 7. Design

- Leia `DESIGN.md` antes de qualquer componente. Tokens em `src/styles/tokens.css`, com nomes do brand kit e refinamentos R1 a R14. Não crie cor, tamanho ou fonte fora dos tokens (o ESLint bloqueia hex e px crus em `src/components`).
- Componentes base: porte de `design-system/components/*` (P0 Task 9b). Use o `.prompt.md` de cada um como documentação de uso. `design-system/ui_kits/app` e `ui_kits/web` são a referência de composição das telas.
- Skills: `impeccable` (auditoria e polimento em todo gate), `design-intelligence` (decisões), `ui-ux-pro-max` (checagens de UX). `tripled-ui` só para blocos de marketing (newsletter, institucional), nunca no Estúdio.
- Proibido: Papel como superfície de UI, cards aninhados, card sem link real, gradiente decorativo, emoji, texto abaixo de 4,5:1, contagem de curtidas ou comentários, z-index arbitrário, animação sem `prefers-reduced-motion`, imagens do template de terceiros (`design-system` não as inclui).

## 8. Segurança

- Segredos só em variáveis de ambiente (Vercel e Supabase). Nunca em código, testes ou fixtures.
- Toda rota de cron e worker valida `Authorization: Bearer ${CRON_SECRET}`.
- RLS ligada em todas as tabelas. Service role só em rotas de servidor do pipeline.
- Rotas do Estúdio exigem sessão e papel (`src/lib/auth/require-role.ts`).

## 9. Definição de pronto (por tarefa)

- Teste da tarefa escrito antes, falhou, passou.
- `pnpm verify` verde.
- Estados da tela cobertos: carregando, vazio, erro, sucesso (quando a tarefa entrega tela).
- Sem violação do axe nas telas da tarefa.
- Commit feito com o ID da tarefa (`[P#-T#]`) ou, fora dos planos P0 a P6, da iniciativa ou decisão (`[EV-##]`, `A-###`); `STATE.md` atualizado (`progress.json` só para tarefas dos planos).
