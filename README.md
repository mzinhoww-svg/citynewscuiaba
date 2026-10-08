# CityNews Cuiabá · kit completo para execução autônoma no Claude Code

Spec aprovada, brand kit integrado e refinado, 78 telas, arquitetura, 7 planos com 70 tarefas TDD, protocolo de autonomia com checkpoints e recuperação, schema SQL, seed fictício, CI e comandos do Claude Code.

## Começo rápido

1. Crie uma pasta vazia (ou use o repositório `mzinhoww-svg/citynewscuiaba`), extraia o kit na raiz e faça o primeiro commit.
2. Abra o Claude Code na pasta e cole o prompt de `docs/PROMPT-INICIAL.md`.
3. Responda uma vez as perguntas do kickoff (até 15, todas com padrão).
4. Deixe rodar: `/citynews-build` na sessão, ou `./scripts/autopilot.sh` para vários dias sem janela aberta.

Pré-requisitos: Node LTS, pnpm, Docker, `gh`, `vercel` e `supabase` autenticados, agent-browser, e as skills `superpowers`, `impeccable`, `design-intelligence`, `ui-ux-pro-max` e `tripled-ui`.

## Mapa

| Caminho | Conteúdo |
|---|---|
| `CLAUDE.md` | Regras permanentes, modo autônomo, stack, comandos, definição de pronto |
| `docs/AUTONOMY.md` | Kickoff único, loop, escada de recuperação, gates, retomada, critério de parada |
| `docs/PROMPT-INICIAL.md` | Prompt para colar no Claude Code |
| `.planning/` | `STATE.md`, `progress.json` (70 tarefas), `DECISIONS.md`, `BLOCKERS.md`, `QUESTIONS.md` |
| `.claude/commands/` | `/citynews-kickoff`, `/citynews-build`, `/citynews-resume` |
| `.claude/settings.json` | Permissões para rodar sem prompts e hook de início de sessão |
| `scripts/` | `autopilot.sh` (loop headless) e `next-task.mjs` (próxima tarefa e progresso) |
| `PRODUCT.md` / `DESIGN.md` | Produto e sistema visual v2 (brand kit + refinamentos R1 a R14, contrastes medidos) |
| `src/styles/tokens.css` | Tokens de produção com nomes do brand kit |
| `design-system/` | Brand kit do Claude Design: componentes JSX e `.prompt.md`, guidelines, UI kits, logos, fontes, PDF de identidade |
| `docs/superpowers/specs/…-design.md` | Spec mestre com 18 decisões e 12 critérios de aceite |
| `docs/screens.md` | 78 telas com rota, blocos, estados, dados e aceite |
| `docs/architecture.md`, `docs/tracking-plan.md`, `docs/testing.md` | Arquitetura, eventos e ranking, testes e roteiros do agent-browser |
| `docs/superpowers/plans/` | P0 a P6 no formato writing-plans |
| `supabase/` | Migration inicial e seed fictício |
| `.github/workflows/` | CI, vigia do ciclo de 30 minutos e backup diário |

## Rodando localmente

Pré-requisitos: Node 22+, pnpm 10 (`corepack enable` usa a versão de `packageManager`), `psql`.

```bash
pnpm install
cp .env.example .env.local        # só se for usar o Supabase CLI; a pilha sem Docker grava o seu
```

**Com Docker (Supabase CLI):**

```bash
supabase start                    # sobe a pilha local (API 54321, Postgres 54322)
supabase status -o env            # copie API_URL, ANON_KEY, SERVICE_ROLE_KEY e DB_URL para .env.local
pnpm db:reset                     # supabase db reset: migrations + supabase/seed.sql
```

**Sem Docker (pilha local, A-017):**

```bash
bash scripts/local-stack/setup.sh # uma vez: baixa PostgREST e Auth em .local/bin
pnpm db:start                     # sobe Postgres, PostgREST, Auth e proxy; grava .env.local se não existir
pnpm db:reset                     # sem o CLI no PATH, aplica migrations + seed via psql
```

Detalhes em `scripts/local-stack/README.md`. Depois, em qualquer um dos dois:

```bash
pnpm dev                          # http://localhost:3000
pnpm verify                       # lint + typecheck + test (inclui integração com o banco) + build
pnpm test:e2e                     # Playwright (inclui os testes @a11y); instale antes: pnpm exec playwright install chromium
```

Usuários de seed (só banco local e CI, nunca em produção), todos com a senha `citynews-local-123`:
`helena.costa@citynews.local` (admin), `marina.arruda@citynews.local` (editor_chefe), `otavio.reis@citynews.local` (editor),
`juliana.campos@citynews.local` e `rafael.siqueira@citynews.local` (jornalista), `beatriz.lemos@citynews.local` (revisor),
`diego.prado@citynews.local` (operador_ia), `thiago.moraes@citynews.local` (analista), `carlos.nunes@citynews.local` (moderador),
`paulo.rezende@citynews.local` (leitura). Lista completa em `docs/testing.md` §5.

## Ambientes

| Ambiente | Onde | Observação |
|---|---|---|
| Local | Supabase CLI (Docker) ou pilha local sem Docker | seed fictício, `AI_PROVIDER=fake` |
| CI | GitHub Actions com `supabase start` no runner | `.github/workflows/ci.yml` |
| Produção | Supabase `citynews-prod` (ref `vmvirmemxfdtxfdmivuu`, região `sa-east-1`, plano free) + Vercel Hobby | fontes reais, sem seed fictício |

Não há projeto de staging (cota free do Supabase, A-019); os previews da Vercel seguem o contorno de B-004.

Variáveis (modelo em `.env.example`; valores reais só na Vercel e no Supabase, nunca no repositório):
`APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`,
`CRON_SECRET`, `AI_PROVIDER` (`fake` ou `openrouter`), `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `EMBEDDING_MODEL`,
`EMBEDDING_DIM`, `CRAWLER_USER_AGENT`, `SENTRY_DSN` (opcional).

## Workflows e secrets do GitHub

| Workflow | Quando | O que faz |
|---|---|---|
| `ci.yml` | PR e push em `main` e `claude/**` | Supabase local, `db:reset`, lint, typecheck, unit e integração, build, Playwright (chromium e webkit, inclui a11y) |
| `cron-watchdog.yml` | a cada 15 min | Se o último `ingest_runs.started_at` tiver mais de 45 min, chama `POST ${APP_URL}/api/ingest/tick` (404 vira aviso até a rota existir) |
| `backup.yml` | diário, 03:17 de Cuiabá | `pg_dump` em formato custom da produção, publicado como artifact por 7 dias |

Secrets (Settings → Secrets and variables → Actions). Sem eles, o watchdog e o backup saem com aviso, sem falhar:

| Secret | Usado por | Conteúdo |
|---|---|---|
| `APP_URL` | watchdog | URL pública de produção na Vercel |
| `CRON_SECRET` | watchdog | O mesmo valor configurado na Vercel e no Vault do Supabase |
| `SUPABASE_URL` | watchdog | `https://vmvirmemxfdtxfdmivuu.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | watchdog | Service role do `citynews-prod` (leitura de `ingest_runs` via REST) |
| `SUPABASE_DB_URL` | backup | String de conexão do Postgres de produção. Use a do **session pooler** (`aws-0-sa-east-1.pooler.supabase.com:5432`): a conexão direta `db.<ref>.supabase.co` é só IPv6 e os runners do GitHub não têm IPv6 |
| `BACKUP_PASSPHRASE` | backup | Senha para cifrar o dump com gpg (AES-256). Obrigatória: sem ela o backup não roda, em repositório público ou privado, porque o dump inclui `auth.users` e o artifact é baixável por quem lê o repositório (C4-04) |

Restaurar: baixe o artifact, `gpg -d arquivo.dump.gpg > arquivo.dump` (se cifrado) e `pg_restore --no-owner -d "$DB_URL" arquivo.dump`.
