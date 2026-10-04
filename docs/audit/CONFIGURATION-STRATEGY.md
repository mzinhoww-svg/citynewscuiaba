# Estratégia de configuração

Data: 04/10/2026. Define o que é fixo, configurável, automatizado ou experimental. Legenda [O]/[I]/[R] em `AUDIT-REPORT.md`.

## 1. As cinco camadas

| Camada | O que é | Onde mora | Como muda | Exemplos |
|---|---|---|---|---|
| 1. Fundamentais | Integridade, segurança, conformidade, direitos de terceiros | Código + banco (trigger, RLS, check) + teste | PR com revisão e teste; nunca por painel | sanitização, RLS, publicação só pela função, regras de redação verificadas, correção humana, consentimento, cópia ≠ confirmação |
| 2. Negócio configurável | Regras de publicação e de produto | Banco versionado (`rules`, `sources`, `publish_breaker`) | Painel com proposta, simulação e aprovação conforme o risco (§3) | portões v3, mínimos por editoria, disjuntor, política da fonte |
| 3. Preferências editoriais | Tom, formatos, destaques, home | Banco (`rules`, `home_layouts`, `featured_*`, `ai_prompts`) | Painel, uma pessoa, auditado | layout da home, janelas de destaque, prompts (com avaliação) |
| 4. Parâmetros operacionais | Frequência, limites, orçamento, modelos | Banco (`app_settings`, `sources`, `ai_agents`, `ai_models`) | Painel, uma pessoa, auditado | frequência de coleta, orçamento por agente, modelo e fallback |
| 5. Experimentos | Funcionalidades em teste | `feature_flags`, `rec_experiments`, medições em sombra | Painel; desligado por padrão | linhagens (sombra), revisor `always`, reprodução de imagem, patrocinado nativo |

Regra de bolso: **se errar prejudica terceiros ou a verdade do que foi publicado, é camada 1**. Se errar só prejudica o desempenho ou o volume, é camada 2 a 4.

## 2. O que já é configurável sem deploy [O]

| Item | Tabela | Painel |
|---|---|---|
| Portões e modos por editoria | `rules` (versionada) | Control Center → Regras (com simulação de 7 dias) |
| Publicação automática, modo leitura, IA, personalização, reprodução de imagem, análise de link, patrocinado, anúncios, guia | `feature_flags` (9) | Admin → Interruptores, Contingência |
| Disjuntor | `publish_breaker` | Interruptores |
| Revisor automático (off, night, always) | `ai_reviewer_settings` | Interruptores |
| Modelo, fallback, orçamento, prompt por agente | `ai_agents`, `ai_models`, `ai_prompts` | Control Center → Agentes, Modelos, Prompts |
| Fonte: frequência, limite, confiança, políticas, consumo | `sources` | Painel de Fontes |
| Pesos de recomendação | `rec_weights` | Control Center → Recomendação |
| Layout da home, destaques, SEO, push | `home_layouts`, `featured_*`, `app_settings` | Admin |

## 3. Quem aprova o quê

> **Resolvida pelo dono em 04/10 (A-128, PR #37):** fim da regra de duas pessoas em todas as mudanças críticas; uma pessoa com o papel de aprovar pede, aprova e aplica numa ação só, com `approvals` e auditoria registrando quem fez (migration 0149). A proposta abaixo fica registrada como alternativa para quando houver equipe.

Hoje "duas pessoas" vale para regras, pesos, prompts, papéis e algumas mudanças de fonte, imposto por trigger; religar automático virou uma pessoa (A-125). Numa operação de uma pessoa isso trava. Proposta por **direção do risco**, não por tipo de objeto:

| Mudança | Aprovação |
|---|---|
| Restringe (mais revisão, menos autonomia, desliga algo, baixa limite) | Imediata, uma pessoa, auditada |
| Ajuste operacional (frequência, orçamento, modelo com avaliação aprovada) | Imediata, uma pessoa, auditada |
| Amplia autonomia ou risco (regra mais permissiva, sobe disjuntor, política de imagem mais ampla, confiança de fonte para cima) | Segunda pessoa **ou**, sem segunda pessoa cadastrada, espera de 24 h com aviso e cancelamento possível |
| Papel admin, segredo, exclusão de dados | Segunda pessoa sempre |

A simulação de 7 dias (`rules/simulate.ts`) passa a ser anexada à proposta automaticamente.

## 4. O que ainda está no código e deveria virar parâmetro

| Valor | Local [O] | Destino |
|---|---|---|
| Limiar de duplicata (Hamming 3, cosseno 0,90) e de assunto (0,82, 72 h) | `dedupe.ts:8`, `cluster.ts:8`, `understanding.ts:14` | `rules.body.clustering` (camada 2), com simulação |
| Mínimo de 30 linhas × 75 caracteres; 2 reescritas; 10 min de espera de capa | `auto-checklist.ts:13-21`, `publish.ts:138` | `rules.body.categories[*].minLines` (camada 3) |
| Janela noturna 20h–6h, prazos 10/30 min | `auto-reviewer.ts:27-28,49` e trigger 0141 | `ai_reviewer_settings` (camada 3) |
| Retentativas 1/4/10 min, 4 tentativas | `retry.ts:5-6` | Fica no código (camada 4 de baixa mudança) |
| Pesos da confiança (0,3/0,3/0,25/0,15) e frescor | `confidence/index.ts:39-44` | `rules.body.confidence` (camada 2), com simulação |
| Lado mínimo de imagem 600 px, dHash 8 | `media/checks.ts` | `app_settings.media.*` (camada 4) |
| Timeouts por agente | `ai/registry.ts:11-22` | `ai_agents.timeout_ms` (camada 4) |
| Temperatura e `max_tokens` | já em `ai_models` [O] | — |

Ordem sugerida: primeiro o que o dono já pediu para mudar mais de uma vez (mínimo de linhas: R29 → R41; limites do disjuntor: A8 → A-126).

## 5. O que deve virar verificação automática

| Regra hoje em texto | Verificação proposta |
|---|---|
| Regras de redação (menor, presunção de inocência, suicídio, saúde) | `checkClaims` no `write` (EV-03) |
| Remoção de imagem em 24 h | prazo em `media_assets.removal_due_at` + alerta |
| Nunca inferir atributo protegido | teste de que eventos e perfis não têm campos proibidos; lista fechada no schema de `events` |
| Grafia CityNews/Cuiabá, sem exclamação | teste sobre `src/content/pt-BR` |
| Prompt só com avaliação | portão em `prompt_publish` |
| `pnpm verify` antes do commit, Conventional Commits | hook opcional + commitlint no CI |
| Nenhum caminho automático publica rascunho sem IA | teste já criado (P0-01); repetir para `forced_publish` se aplicável |

## 6. Experimentos ativos ou propostos

| Experimento | Flag ou mecanismo | Critério para virar regra |
|---|---|---|
| Linhagens independentes | gravado em `decisions` (sombra) | 2 semanas de dados; quantas matérias mudariam de nível; decisão D-03 |
| Conferência de afirmações | sombra em `decisions` | taxa de parágrafos que cairiam < 15% e amostra humana confirma acerto |
| Revisor `always` | `ai_reviewer_settings.mode` | concordância com humano ≥ 0,8 em avaliação |
| Reprodução de imagem | `image_reproduction_enabled` | D-02 |
| Patrocinado nativo | `sponsored_native_enabled` | B-022 |
