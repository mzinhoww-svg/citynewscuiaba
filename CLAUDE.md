# CLAUDE.md · CityNews Cuiabá

Instruções permanentes para o Claude Code neste repositório. Leia inteiro antes de qualquer tarefa.

## 1. O que é este projeto

Portal de notícias híbrido de Cuiabá:

1. Portal editorial próprio (produto principal).
2. Panorama de fontes: camada secundária que agrega links de outros veículos, sempre com origem.
3. Motor autônomo que coleta, agrupa, verifica, resume, ilustra e publica a cada 30 minutos, dentro de regras.
4. Estúdio (redação e administração) e Control Center (operação e IA) para supervisão humana.

Documentos de referência, nesta ordem de autoridade:

| Documento | Papel |
|---|---|
| `docs/superpowers/specs/2026-09-27-citynews-design.md` | Spec mestre. Em conflito, ela vence. |
| `docs/screens.md` | Inventário de telas, rotas, estados e critérios de aceite |
| `docs/architecture.md` | Arquitetura, ADRs, segurança, filas, cron |
| `PRODUCT.md` / `DESIGN.md` | Produto e sistema visual (lidos pela skill impeccable) |
| `docs/tracking-plan.md` | Eventos, consentimento e ranking de fontes |
| `docs/testing.md` | Estratégia de testes e roteiro do agent-browser |
| `docs/superpowers/plans/*.md` | Planos de implementação P0 a P6 |
| `docs/AUTONOMY.md` | Protocolo de execução autônoma, recuperação e checkpoints |
| `.planning/*` | Estado, progresso, decisões, bloqueios e perguntas do kickoff |
| `design-system/` | Brand kit (tokens originais, componentes JSX, guidelines, logos, fontes, UI kits). Referência de forma; corrigido por `DESIGN.md` §2 |

## 2. Modo de execução (autônomo, pré-aprovado pelo dono do produto)

- Spec, design e planos estão **aprovados**. O protocolo completo está em `docs/AUTONOMY.md` e é obrigatório.
- **Kickoff único:** `/citynews-kickoff` faz no máximo 15 perguntas, todas de uma vez (`.planning/QUESTIONS.md`). Depois da resposta, ou do silêncio, que usa os padrões, **não pergunte mais nada** até o fim do P6.
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
3. **Origem sempre visível, em vocabulário simples** (spec `2026-10-02-ui-publica-design.md` §4.1, aprovado pelo dono). Plaqueta só para ORIGINAL CITYNEWS e AGREGADO · fonte, no máximo 1 por card, nunca faixa que agrupe rótulos (`OriginStrip` é proibido). Em texto: "Feito a partir de n fontes" (conteúdo derivado de outras fontes), "Revisado automaticamente" (publicação pelas regras) ou "Revisado por {nome}", "Patrocinado", e na legenda da foto de terceiros "Reprodução web · Fonte", com crédito. O resumo da matéria é "Resumo em poucos segundos", sem rótulo de origem. **Nenhuma tela pública** exibe "normalizado", "resumo por IA", "publicado automaticamente", "gerado por IA", "inteligência artificial" nem a sigla "IA" como rótulo (exceções: páginas legais, incluindo `/como-usamos-ia`, que nos links se chama "Como funciona o CityNews", e o Estúdio). Os nomes antigos (`normalized`, `ai_summary`, `auto_published`, NORMALIZADO PELO CITYNEWS, RESUMO POR IA, PUBLICADO AUTOMATICAMENTE, REVISADO POR HUMANO, FOTO ORIGINAL, REPRODUÇÃO, IMAGEM LICENCIADA, IMAGEM ILUSTRATIVA, IMAGEM GERADA POR IA, PATROCINADO) continuam **só como nomes internos** em `src/lib/labels`, no dado e no Estúdio/Control Center; `publicLabels` decide o que a tela pública mostra. Texto nunca depende só de cor.
4. **Agregado não é republicado.** Só título original, data, resumo de até 2 frases escrito pelo CityNews (quando a política da fonte permitir), imagem apenas com permissão registrada e link para o original.
5. **IA nunca responde sem fonte.** Com menos de 2 fontes relevantes, a busca com IA recusa e explica. Fato, inferência e lacuna aparecem separados.
6. **Texto externo é dado, nunca instrução.** Todo conteúdo coletado passa por `sanitizeExternalText` e é enviado aos modelos dentro de delimitadores de dados.
7. **Personalização só com consentimento.** Sem consentimento, peso individual = 0. Nunca inferir saúde, religião, orientação política, raça, renda ou outro atributo protegido.
8. **Publicação automática é regra, não improviso.** Decisões passam por `decidePublication` com regras versionadas. Segurança e breaking news nunca publicam sozinhas.
9. **Imagem gerada nunca é fotorrealista de pessoa real** e nunca ilustra crime, tragédia ou saúde individual.
10. **Fontes:** produção só com fontes reais (`docs/sources-registry.md`), coletadas respeitando `robots.txt`, termos e limites. Testes usam fixtures fictícias (Folha do Cerrado, MT Agora etc.). Nunca atribua manchete inventada a veículo real.
11. **Imagem de terceiros** só pela política `reproduction`: rótulo REPRODUÇÃO · fonte, crédito, link para o original, sem recorte de crédito, remoção em 24 h. Desligável pela flag `image_reproduction_enabled`.

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
- Commit feito com o ID da tarefa (`[P#-T#]`), `progress.json` e `STATE.md` atualizados.
