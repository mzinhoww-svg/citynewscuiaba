# Inventário de regras, conflitos e matriz de revisão

Data: 04/10/2026. Fonte única do inventário de regras do projeto. Legenda [O]/[I]/[R] em `AUDIT-REPORT.md`. A hierarquia e o mecanismo de resolução de conflito estão no ADR-010; este documento aplica os dois.

## 1. Onde as regras moram hoje

| Camada | Lugares | Natureza |
|---|---|---|
| Instrução de agente | `CLAUDE.md`, `AGENTS.md`, `docs/AUTONOMY.md`, `docs/PROMPT-INICIAL.md`, `.claude/commands/*`, `.claude/settings.json` (hook), `scripts/autopilot.sh` | Texto |
| Produto e design | `PRODUCT.md`, `DESIGN.md`, `docs/screens.md`, `docs/testing.md`, `docs/tracking-plan.md`, `docs/sources-registry.md` | Texto |
| Specs e decisões do dono | spec mestre `2026-09-27`, specs filhas (painel de fontes, PWA, UI pública, autonomia, destaques, banners, guia, segurança P1), `respostas-do-dono-rodada-3.md`, `.planning/DECISIONS.md` (127 entradas) | Texto |
| Código | `src/lib/rules` (regras v1/v3), `src/lib/labels` (vocabulário), `src/lib/auth/permissions.ts` (21 ações × 9 papéis), `src/lib/pipeline/breaker.ts`, `auto-checklist.ts`, schemas zod, prompts padrão em `src/lib/ai/defaults.ts` | Executável |
| Banco | 59 triggers de regra, checks de tabela, RLS, `rules` versionadas, `feature_flags` (9), `app_settings`, `publish_breaker`, `ai_agents`/`ai_prompts`/`ai_models`, `sources.*` | Executável |
| Testes | `vocabulary.test.ts`, `tests/e2e/vocabulary.spec.ts`, `adherence.test.ts`, `public-bundle.test.ts`, `rules/*.test.ts`, `rls-two-person.test.ts`, axe | Executável |
| Lint e CI | `eslint.config.mjs` (hex, px, fontes, import por índice), `ci.yml` (verify, e2e, detector de design não bloqueante) | Executável |

## 2. Inventário

IDs: **PR** processo, **ED** editorial e produto, **CD** código, **DS** design, **SE** segurança e governança. O texto completo de cada regra está no local indicado.

### Processo (agente)

| ID | Regra | Local |
|---|---|---|
| PR-01 | Ordem de autoridade: spec mestre vence → screens → architecture → PRODUCT/DESIGN → … | `CLAUDE.md` §1 |
| PR-02 | Desempate autônomo: spec → DESIGN → screens → architecture → escolha mais conservadora → A-### | `docs/AUTONOMY.md:81` |
| PR-03 | DESIGN.md vence tokens.css, que vence design-system | `DESIGN.md:5` |
| PR-04 | Spec, design e planos pré-aprovados; AUTONOMY obrigatório | `CLAUDE.md` §2 |
| PR-05 | Kickoff com até 15 perguntas; depois nenhuma até o fim do P6 | `CLAUDE.md` §2, `AUTONOMY.md` §2, `QUESTIONS.md`, `citynews-kickoff.md`, `PROMPT-INICIAL.md` |
| PR-07 | Ordem das fases P0 → (P1∥P3) → (P2∥P4) → P5 → P6 | `CLAUDE.md` §2 |
| PR-08 | Toda tarefa por subagentes (subagent-driven, parallel agents) | `CLAUDE.md` §2 |
| PR-09 | Checkpoint por tarefa: commit, `progress.json`, `STATE.md`; decisões e bloqueios registrados | `CLAUDE.md` §2, `AUTONOMY.md` §3 |
| PR-11 | Escada de recuperação L1 a L5 | `AUTONOMY.md` §4 |
| PR-12 | Nunca desativar teste, `any`, `@ts-ignore`, baixar limiar de a11y, mudar spec em silêncio, force-push na main, apagar migration aplicada, gastar dinheiro, mexer fora do repositório | `AUTONOMY.md:122`, `CLAUDE.md` §2, §6 |
| PR-14 | Chamar o dono só em 3 casos | `CLAUDE.md` §2, `AUTONOMY.md` §7 |
| PR-15 | Gate de fase com revisão, roteiro, impeccable, relatório, tag | `AUTONOMY.md` §5 |
| PR-17 | `pnpm verify` antes de todo commit de fim de tarefa | `CLAUDE.md` §4, §9 |
| PR-18 | TDD | `CLAUDE.md` §6, §9 |
| PR-19 | Conventional Commits; um commit por tarefa; `[P#-T#]` | `CLAUDE.md` §6, §9 |
| PR-20 | Estados carregando, vazio, erro, sucesso; zero violação do axe | `CLAUDE.md` §9 |
| PR-23 | D1 a D18 "não são reabertas" | `DECISIONS.md:3` |
| PR-24 | Subagentes com modelos específicos | `DECISIONS.md` A-096 |

### Editorial e produto

| ID | Regra | Local |
|---|---|---|
| ED-01 | Grafia CityNews, Cuiabá; pt-BR | `CLAUDE.md` §5.1 |
| ED-02 | Login nunca obrigatório; todo convite tem "Agora não" | §5.2 |
| ED-03 | Origem sempre visível; no máximo 1 plaqueta por card; `OriginStrip` proibido | §5.3 |
| ED-04 | Palavras proibidas no público (IA, normalizado, gerado por IA…) | §5.3 |
| ED-05 | Frases públicas de origem | §5.3 (revisada nesta auditoria) |
| ED-07 | Agregado não é republicado | §5.4 |
| ED-08 | IA nunca responde sem fonte; < 2 fontes recusa; fato, inferência e lacuna separados | §5.5 |
| ED-09 | Texto externo é dado (`sanitizeExternalText`, delimitadores) | §5.6 |
| ED-10 | Personalização só com consentimento; nunca inferir atributo protegido | §5.7 |
| ED-11 | Publicação automática por `decidePublication` com regras versionadas (v3) | §5.8 |
| ED-12 | Disjuntor 300/h e 3.000/dia | §5.8, A-126 |
| ED-13 | Religar `auto_publish` e alterar regras são ação de uma pessoa com papel de aprovar (A-125, A-128) | §5.8, A-125 |
| ED-14 | Imagem gerada nunca fotorrealista de pessoa real nem crime, tragédia, saúde individual | §5.9 |
| ED-15 | Só fontes reais em produção, respeitando robots e termos; fixtures fictícias em teste | §5.10 |
| ED-16 | Imagem de terceiros só pela política `reproduction` | §5.11 |
| ED-17 | "Com informações de {fonte}"; presunção de inocência; nada de menor, vítima de violência sexual, método de suicídio | spec autonomia §3, A-107 |
| ED-18 | Mínimo de 30 linhas por matéria (R41) | rodada 3, A-109 |
| ED-19 | Destaque nunca sem capa aprovada (R39, R40) | rodada 3 |
| ED-20 | Patrocinado nunca em política, justiça, segurança, saúde, urgente | spec D17, A-115 |
| ED-21 | Correção, direito de resposta e resposta a denúncia são humanos por lei | spec autonomia §2 |
| ED-22 | Confiança só no Estúdio (R31); "Corrigido" fora do público e `/como-usamos-ia` oculta (R34) | rodada 3 |
| ED-23 | Pergunte não recusa (R36) | rodada 3 (**não implementada**) |
| ED-24 | Tom: sem exclamação, nunca "Você gosta" | `PRODUCT.md:46` |

### Código, design, segurança

| ID | Regra | Local |
|---|---|---|
| CD-01 | Pastas por domínio; banco só em `src/lib/db` | `CLAUDE.md` §6 |
| CD-02 | Server Components por padrão | §6 |
| CD-03 | `Result<T,E>`; sem `any` e sem `@ts-ignore` | §6 |
| CD-04 | Textos em `src/content/pt-BR` | §6 |
| CD-05 | Componente de UI não conhece o banco | §6 |
| CD-06 | Importar componentes pelo índice (só no ESLint) | `eslint.config.mjs:41-56` |
| DS-01 | Nada fora dos tokens; sem hex/px crus em `src/components` | `CLAUDE.md` §7 |
| DS-02 | `tripled-ui` só em marketing | §7 |
| DS-03 | Proibições visuais (Papel como superfície, cards aninhados, gradiente, emoji, contraste < 4,5:1, curtidas, z-index arbitrário, animação sem reduced-motion) | §7, `DESIGN.md` §10 |
| DS-05 | Alvo de toque ≥ 44 px; WCAG 2.2 AA | `DESIGN.md:131` |
| SE-01 | Segredos só em variáveis de ambiente | `CLAUDE.md` §8 |
| SE-02 | Rotas de cron e worker exigem `Bearer CRON_SECRET` | §8 |
| SE-03 | RLS em todas as tabelas; service role só no pipeline | §8 |
| SE-04 | Estúdio exige sessão e papel | §8 |
| SE-05 | Duas pessoas no banco (`approved_by <> requested_by`) — removido pela A-128 (0149); `approvals` segue registrando quem pediu e quem aprovou | `architecture.md` §6, `0002_rls.sql` |
| SE-06 | Admin não tem `article.publish` | `permissions.ts:72` |

## 3. Conflitos e inconsistências

| ID | Conflito | Lado A | Lado B | Resolução |
|---|---|---|---|---|
| C1 | Não perguntar "até o fim do P6", P6 terminou, rodadas de perguntas aconteceram depois | `CLAUDE.md` §2 | `progress.json` (P6 done), rodadas de 03/10 | **Resolvido**: CLAUDE.md §2 passa a ter protocolo pós-P6 (ADR-010) |
| C2 | `STATE.md` vencido (P5 ativo, 54/70, PR #1 pendente, B-008 pendente) e ADS-T1 duplicado | `STATE.md` | `progress.json`, `BLOCKERS.md:12`, A-102 | **Resolvido**: `STATE.md` reescrito |
| C3 | IDs de decisão colidem entre ramos (A-123 duas vezes; A-117 citado e inexistente; A-124 em MS-T2) | commits `69762a3`, `37a75cf`; `progress.json` | `DECISIONS.md` | **Resolvido em parte**: convenção de reserva de ID e status no ADR-011; colisões listadas em `DECISIONS.md` |
| C4 | "Spec mestre vence", mas a spec de autonomia e a rodada 3 a substituem; D11/D12 reabertos apesar de "não são reabertas" | `CLAUDE.md` §1, `DECISIONS.md:3` | spec autonomia `:3`, rodada 3 `:1` | **Resolvido**: decisão do dono datada vence a spec mais antiga, registrada como emenda (ADR-010 §2) |
| C5 | Autoridade circular sobre vocabulário | spec UI pública `:3` | `CLAUDE.md` §5.3, `DESIGN.md:77` | **Resolvido**: o teste de vocabulário é a referência executável (ADR-010 §3) |
| C6 | CLAUDE.md e DESIGN.md mostram "Revisado automaticamente/por {nome}" e o painel "Como esta matéria foi feita"; os testes proíbem | `CLAUDE.md:67`, `DESIGN.md:86-97,103` | `vocabulary.test.ts:36-52`, `vocabulary.spec.ts:145-153`, R16, R31, R34 | **Resolvido em CLAUDE.md**; DESIGN.md fica para a etapa 2 do `MIGRATION-PLAN.md` |
| C7 | `/como-usamos-ia` citada como exceção linkada; está oculta (R34); texto institucional aponta para ela | `CLAUDE.md:67`, `DESIGN.md:99` | `como-usamos-ia/page.tsx:16`, `institutional.ts:108` | CLAUDE.md corrigido; link morto em `institutional.ts:108` fica como tarefa (EV-14) |
| C8 | R36 substitui a regra 5, mas código e e2e fazem o oposto (**resolvido pela D-01, A-133**) | rodada 3 `:18` | `answer.ts:4`, e2e `:131-142`, `PRODUCT.md:52` | **Pendente do dono** (D-01). CLAUDE.md marca a pendência |
| C9 | Religar automático e limites do disjuntor: regras antigas não marcadas como superadas | spec autonomia A8/A13, A-067, A-110, `restore.md:18` | A-125, A-126, `0146` | **Resolvido**: supersessão em `DECISIONS.md`; `restore.md` corrigido |
| C10 | Ordem da spec mestre §6.4 começa por "tema sensível"; `testing.md:26` presume v1 | spec mestre `:134` | regras v3 | Anotar na spec mestre como emenda (etapa 2) |
| C11 | "≤ 4 rótulos por card" e confiança na manchete vs 1 plaqueta e confiança só no Estúdio | `screens.md:18-21`, `testing.md:33-34` | `CLAUDE.md` §5.3, R16, R31 | Etapa 2 do `MIGRATION-PLAN.md` |
| C12 | (**resolvido em parte pela D-02, A-134**: vale "Foto: reprodução web" com Media Registry; revisão jurídica segue em B-002) "Imagem só com permissão registrada" vs reprodução sem permissão; três formas de crédito ("REPRODUÇÃO · fonte", "Reprodução web · Fonte", "Foto: veículo"); corpo de fonte "só link" vai ao `write` | `CLAUDE.md:68,75`, `sources-registry.md:9-16`, R25, A-114 | B-002 aberto | **Pendente do dono** (D-02); proposta em `MEDIA-POLICY.md` |
| C13 | Chave do OpenRouter: qual vence em 28/10 | `BLOCKERS.md:12` | A-094 | Conferir com o dono; operacional |
| C14 | Migrations pelo CI e staging (documento) vs à mão e sem staging (prática) | `architecture.md` ADR-002, §9 | A-054, A-095, B-004 | **Anotado** em `architecture.md`; EV-12 |
| C15 | "Nunca mexer fora do repositório" vs operação em produção pelo agente | `AUTONOMY.md:122` | A-095, A-124, B-025 | **Resolvido**: CLAUDE.md §2 define o que o agente pode fazer em produção |
| C16 | Duas ordens de desempate diferentes | `CLAUDE.md` §1 | `AUTONOMY.md:81` | **Resolvido**: ADR-010 define uma só |
| C17 | Pequenos vencidos: "78 telas" × 79; agent-browser exigido e ausente; skill `impeccable` local citada e ausente; `autopilot.sh` ignora iniciativas pós-P6; formatos diferentes em `progress.json` | vários | vários | Etapa 2; `progress.json` fica histórico do P0–P6 (ADR-011) |

## 4. Redundâncias

| Tema | Onde se repete | Fonte única proposta |
|---|---|---|
| Vocabulário público | `CLAUDE.md`, `DESIGN.md`, spec UI pública, spec destaques, `vocabulary.test.ts`, `vocabulary.spec.ts` | Os dois testes; os textos apontam para eles |
| Não perguntar | 5 lugares | `CLAUDE.md` §2 (protocolo vigente) |
| Duas pessoas | spec mestre §8, `architecture.md` §6, spec autonomia A13, A-027, A-067, A-110, `CLAUDE.md` | Trigger + `CONFIGURATION-STRATEGY.md` §3 (lista do que exige duas pessoas) |
| Proibições de design | `CLAUDE.md` §7 e `DESIGN.md` §10 | `DESIGN.md` §10; `CLAUDE.md` só aponta |
| Cadência de commit e verificação | `CLAUDE.md` §2, §4, §9; `AUTONOMY.md` §3; comandos | `CLAUDE.md` §9 |
| Reprodução de imagem | `CLAUDE.md` 4 e 11, spec §6.5, spec UI §4.10, A-010, B-002 | `MEDIA-POLICY.md` depois de D-02 |

## 5. O que é imposto por máquina e o que é só texto

**Imposto [O]:** vocabulário público (unitário + e2e), `OriginStrip`, hex/px/fontes em componentes, import por índice, bundle público, duas pessoas para regras e prompts (trigger), religar automático com uma pessoa (0145), disjuntor (0073, 0146), patrocinado fora de política (trigger e check), recusa com < 2 fontes (`answer.ts`), sanitização, portões v3, `CRON_SECRET`, "Agora não", reduced-motion, consentimento, robots, licença vencida, publicação só pela função.

**Parcial:** detector de design roda no CI sem bloquear (`ci.yml:82`).

**Só texto:** limite de perguntas; TDD; um commit por tarefa; Conventional Commits; `pnpm verify` antes do commit (sem hook); grafia da marca; emoji; cards aninhados; gradiente; `tripled-ui`; nunca inferir atributo sensível; nunca inventar manchete; remoção de imagem em 24 h; regras de redação (só no prompt); ordem de autoridade; registro de decisões.

As regras editoriais "só texto" que protegem terceiros (redação, 24 h, atributo sensível) são as que mais precisam virar verificação automática. Ver `CONFIGURATION-STRATEGY.md` §5.

## 6. Matriz de revisão

Classes: **KEEP** manter · **MODIFY** revisar · **RELAX** flexibilizar · **REMOVE** remover · **MERGE** consolidar · **CONFIGURABLE** virar parâmetro · **AUTOMATE** virar verificação · **INVESTIGATE** faltam dados. Status: **Pendente**, **Aprovada**, **Implementada**, **Validada**. "Implementada" aqui significa feito nesta auditoria e validado por teste ou revisão.

| ID | Regra (resumo) | Classe | Problema → nova abordagem | Risco da mudança | Dependências | Prior. | Status |
|---|---|---|---|---|---|---|---|
| PR-01/02/16 | Ordem de autoridade e desempate | MODIFY, MERGE | Duas ordens e "spec mestre vence" desatualizado → uma ordem com decisão datada do dono e teste executável no topo (ADR-010) | Baixo | CLAUDE.md, AUTONOMY.md | P1 | Implementada |
| PR-05 | Não perguntar até o fim do P6 | MODIFY | Vencida → protocolo pós-P6: perguntar só decisão de produto, risco jurídico ou gasto, em lote | Baixo | CLAUDE.md §2 | P1 | Implementada |
| PR-07/08/15/16 | Fases, subagentes, gate, parada | MODIFY | Presumem o plano de 70 tarefas → valem para iniciativas com plano; trabalho avulso segue §9 | Baixo | AUTONOMY.md | P2 | Implementada (CLAUDE.md §2) |
| PR-09 | Checkpoint em `STATE.md`/`progress.json` | MODIFY | `STATE.md` virou log e envelheceu → STATE curto (estado + próximas ações), histórico em DECISIONS e relatórios | Baixo | ADR-011 | P1 | Implementada |
| PR-12 | Proibições de recuperação | KEEP | Corretas; "fora do repositório" ganhou exceção explícita para produção autorizada | — | — | — | Implementada |
| PR-17/18/19 | verify, TDD, Conventional Commits | AUTOMATE | Só texto → hook de pre-commit opcional e commitlint no CI | Baixo | CI | P3 | Pendente |
| PR-19 | Um commit por tarefa com `[P#-T#]` | RELAX | Trabalho avulso não tem P#-T# → ID da iniciativa ou da decisão | Baixo | — | P3 | Implementada (CLAUDE.md §9) |
| PR-23 | D1–D18 não reabertos | REMOVE | Já foi violada e não tem caminho de emenda → ADR-011 (emenda com status) | Baixo | DECISIONS.md | P2 | Implementada |
| PR-24 | Modelo dos subagentes | REMOVE | Trivia operacional que envelhece → fora do registro de decisões de produto | Nenhum | — | P3 | Pendente |
| ED-01, 02, 09, 10, 15, 21 | Marca, login opcional, texto externo como dado, consentimento, fontes reais, correção humana | KEEP | Válidas e testadas (exceto grafia) | — | — | — | — |
| ED-03/04/05/06 | Vocabulário de origem | MERGE, AUTOMATE | Seis versões → teste é a fonte; texto curto que aponta para ele | Baixo | testes de vocabulário | P1 | Implementada (CLAUDE.md); DESIGN.md pendente |
| ED-04 (transparência) | Proibido dizer "IA" no público | INVESTIGATE | Esconde do leitor que o texto e a imagem ilustrativa são gerados; risco regulatório e de confiança → avaliar rótulo discreto em página de matéria e imagem gerada (D-06) | Médio | publicLabels, testes | P2 | Decidida (D-06, A-138: sem selo público; rastreabilidade interna) |
| ED-07 | Agregado não é republicado | KEEP, AUTOMATE | Correta; vale também para o rascunho sem IA (P0-01) → teste de que nenhum caminho automático publica `ai_fallback` | Baixo | auto-reviewer, rules | P0 | Implementada |
| ED-08 | IA nunca sem fonte | KEEP | R36 a contradiz → manter até D-01; alternativa: "não encontramos fontes" + busca tradicional + sugestão de pergunta | Alto se relaxada | answer.ts, e2e | P0 | Implementada (D-01, A-133: uma fonte basta, atribuída) |
| ED-11 | Publicação por regras v3 | MODIFY | Independência conta veículos → medir linhagens em sombra (feito) e decidir portão (D-03) | Médio | verify, rules, confidence | P0 | Implementada como indicador (D-03, A-135: não vira portão) |
| ED-11 (revisor) | Revisor noturno decide o que subiu | MODIFY | Decidia rascunho sem IA e sem saber de conflito/duvidoso → exclui rascunho sem IA, recebe contexto; conflito e duvidoso à noite ficam para D-05 | Baixo | 0150 | P0 | Implementada (A-129, A-137: revisor decide níveis 2 e 3, nunca 4) |
| ED-12 | Disjuntor 300/3.000 | CONFIGURABLE, INVESTIGATE | Já é linha no banco; produção pode estar em 60/800 → conferir; manter editável no Interruptores | Baixo | `publish_breaker` | P1 | Pendente (conferir) |
| ED-13 | Duas pessoas para regras | RELAX, CONFIGURABLE | Operação de uma pessoa → duas pessoas só para o que amplia risco (regra mais permissiva, papel admin, política de imagem); o que restringe é imediato; o resto com espera de 24 h e auditoria (D-04) | Médio | triggers 0002, 0048 | P1 | Resolvida pelo dono (A-128) |
| ED-14 | Imagem gerada | KEEP, AUTOMATE | Guardas já existem em `choose.ts:36-92` → manter; teste ao ligar gerador | — | — | — | — |
| ED-16 | Reprodução de imagem | MODIFY | Contradiz ED-07; B-002 aberto; `og:image` sem crédito; recorte → política em `MEDIA-POLICY.md` (D-02) | Alto | media, seo | P0 | Implementada (D-02, A-134: "Foto: reprodução web" + Media Registry) |
| ED-17 | Regras de redação | AUTOMATE | Só no prompt → verificador pós-geração (nome de menor, "culpado" antes de condenação, método de suicídio) que derruba o parágrafo ou manda para revisão | Médio | write | P1 | Pendente (EV-03) |
| ED-18 | 30 linhas | CONFIGURABLE, MERGE | Medido de dois jeitos (75 caracteres e 12 palavras) e fixo no código → mínimo por editoria em `rules`, uma só medida | Baixo | auto-checklist, bulk-risk | P2 | Pendente |
| ED-19 | Destaque com capa | KEEP | — | — | — | — | — |
| ED-20 | Patrocinado fora de áreas sensíveis | KEEP | Imposta no banco | — | — | — | — |
| ED-22 | Confiança só no Estúdio | KEEP | Decisão de produto do dono | — | — | — | — |
| ED-24 | Tom | KEEP, AUTOMATE | Teste de texto em `src/content` | Baixo | — | P3 | Pendente |
| CD-01..06 | Convenções de código | KEEP | Seguidas (0 `any`, 0 `@ts-ignore`); documentar CD-06 em CLAUDE.md | — | — | P3 | Pendente |
| DS-01..05 | Design | KEEP | Corretas; detector de design deve bloquear (UI-T15 concluída?) → INVESTIGATE | Baixo | ci.yml | P3 | Pendente |
| SE-01..04 | Segurança | KEEP | Corretas e testadas; `/estudio` sem verificação na borda é aceitável (layout + página) | — | — | — | — |
| SE-05 | Duas pessoas no banco | KEEP, MODIFY | Ver ED-13; `service_role` passa por cima por desenho → registrar como exceção auditada | Baixo | 0002 | P1 | Resolvida pelo dono (A-128, 0149) |
| SE-06 | Admin sem `article.publish` | INVESTIGATE | Faz sentido com equipe; numa pessoa obriga dois papéis → decidir junto com D-04 | Baixo | permissions.ts | P2 | Pendente |
| (novo) | Afirmações do texto gerado conferidas contra as fontes | AUTOMATE | Não existe (P0-03) → `claimCheck` no `write` | Médio | write, schemas | P0 | Pendente (EV-03) |
| (novo) | Remoção de imagem em 24 h medida | AUTOMATE | Promessa sem relógio → prazo e alerta na fila de remoção | Baixo | takedown | P2 | Pendente |
| (novo) | Avaliação como portão de prompt | AUTOMATE | Avaliação não bloqueia → prompt só vai a produção com execução de avaliação aprovada | Baixo | ai_prompts, eval | P1 | Pendente (EV-05) |
