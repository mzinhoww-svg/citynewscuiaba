# Correções de segurança P1 — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os 5 achados médios da auditoria (C1-01, C1-02, C1-03, C3-01, C4-01) e devolver o CI ao verde (T0).

**Architecture:** As correções de banco ficam numa migration nova, `supabase/migrations/0074_security_p1.sql`. Cada task acrescenta a sua seção a esse arquivo, sem nunca editar migrations antigas. A correção de app fica em `src/lib/studio/media.ts` e no Estúdio. Os testes de banco rodam contra o Supabase local, no padrão de `tests/security/rls.test.ts`; os de Server Action seguem o padrão `asUser` de `tests/integration/studio-gate.test.ts`.

**Tech Stack:** Next.js App Router, TypeScript strict, Supabase (Postgres/RLS/GoTrue), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-seguranca-p1-design.md`

## Global Constraints

- Migrations novas a partir de `0074`; nunca editar as existentes.
- TDD: o teste da task é escrito antes e falha antes da correção.
- Nenhum teste pode ser pulado, desativado ou afrouxado para passar. O único teste que muda de expectativa é o desatualizado da T0, item 1.
- Commits Conventional com o ID: `fix(security): ... [SEC-C1-01]`, `test(e2e): ... [SEC-T0]`. Um commit por task, no mínimo.
- `pnpm verify` verde antes de cada commit de fim de task.
- Textos de interface em `src/content/pt-BR/*.ts`. Cores e tamanhos só por token (`--tap-min: 44px`).
- Toda função `security definer` nova fixa `set search_path = public`, com `revoke`/`grant` explícitos.
- **Desvio da spec, decidido no plano:** `supabase/config.toml` **não** muda `enable_confirmations`. As e2e de cadastro (`tests/e2e/login-migrate.spec.ts:132,161`) dependem de sessão imediata no ambiente local e de CI. O app já trata os dois modos (`src/app/(public)/criar-conta/actions.ts:60`, estado `check_email`). A proteção real é o predicado no banco (Task 6); ligar "Confirm email" em produção continua sendo tarefa do dono.

## Review Focus

1. **Conta OAuth (Google) com e-mail verificado** pelo provedor deve continuar exportando os próprios dados por e-mail. Teste na Task 6: usuário com `raw_app_meta_data.provider = 'google'` → `export_email_data` devolve objeto.
2. **Imagem sem matéria ligada** (escopo `{}`) com `allFromSource: true` não pode cair no caminho permissivo. Teste na Task 5: editor de editoria, reprodução sem `article_media`, `allFromSource: true` → `forbidden`.
3. **`p_details` nulo** em `push_audit` continua aceito e vira `{}`. Teste na Task 4.
4. **Equipe ainda lê `article_versions`** (Estúdio, correções, Control Center usam a tabela). Teste na Task 3: editor-chefe lê as versões de uma matéria publicada.
5. **Expurgo de conta sem prova** ainda apaga a conta e os dados por `user_id`; só preserva os dados por e-mail. Teste na Task 6.

---

### Task 1: T0 — CI verde

Falhas reproduzidas na `main` e no PR #17. As falhas deste task são as que continuarem vermelhas depois do re-run único pedido no PR. Cada item exige causa raiz (`superpowers:systematic-debugging`) antes da correção.

**Files:**
- Modify: `tests/e2e/a09-new-settings.spec.ts:110-112`
- Modify: `src/components/editorial/SiteHeader.tsx:71-74` (link do logo)
- Investigate/Modify: o que a causa raiz apontar para `tests/e2e/article.spec.ts:520` (figura 10 px mais larga que `.reading-body` no mobile-webkit) e `tests/e2e/review-bulk-publish.spec.ts:66` (contador "3 matérias selecionadas nesta página." ausente no mobile-webkit)
- Se ainda falharem após o re-run: `tests/e2e/control-sources-detail.spec.ts:306`, `tests/e2e/control-sources-list.spec.ts:83` (rolagem horizontal em 390/360 px) e `tests/e2e/keyboard.spec.ts:453,499` (indicador de foco nos diálogos Rejeitar/Publicar)

**Interfaces:** nenhuma para as outras tasks.

- [ ] **Step 1: Atualizar o teste desatualizado do A09.** Em `tests/e2e/a09-new-settings.spec.ts:110-112`, trocar o padrão por `/Feito a partir de outras fontes|ORIGINAL CITYNEWS/`, que é o vocabulário público de `src/content/pt-BR/labels.ts:31`.
- [ ] **Step 2: Rodar e confirmar.** `pnpm exec playwright test tests/e2e/a09-new-settings.spec.ts --project=desktop` → PASS.
- [ ] **Step 3: Reproduzir o alvo de toque do logo.** `pnpm exec playwright test tests/a11y/all-routes.spec.ts --project=mobile -g "alvos de toque"` → FAIL com `a "CityNews Cuiabá, página inicial" 148x32`.
- [ ] **Step 4: Corrigir o link do logo.** No `<Link>` de `SiteHeader.tsx:71`, garantir altura mínima de `--tap-min` (classe `min-h-tap` ou equivalente do tema Tailwind ligado ao token), sem mudar o tamanho do `<Logo>`. Conferir que a linha `h-14` e o estado rolado (`h-tap`) continuam iguais.
- [ ] **Step 5: Rodar de novo.** O comando do Step 3, mais o mesmo com `--project=mobile-webkit` → PASS. Rodar `tests/e2e/header*.spec.ts`, se existir, → PASS.
- [ ] **Step 6: Figura no mobile-webkit.** Reproduzir com `pnpm exec playwright test tests/e2e/article.spec.ts:500 --project=mobile-webkit`. Achar a causa: comparar a largura computada de `figure` e `.reading-body` e olhar o diff do PR de posições de mídia (`git log -p --since=2026-10-02 -- src/components/editorial`). Corrigir o CSS do componente, nunca a tolerância do teste. Rodar → PASS.
- [ ] **Step 7: Seleção em massa no mobile-webkit.** Reproduzir com `pnpm exec playwright test tests/e2e/review-bulk-publish.spec.ts --project=mobile-webkit`. Achar a causa: o texto está escondido no layout mobile, ou o clique não marcou? Se for a tela, corrigir a tela; se o teste usa um seletor que não vale no mobile, corrigir o teste e explicar no commit. Rodar → PASS.
- [ ] **Step 8: Instáveis do re-run.** Para cada teste que ainda falhar depois do re-run (lista em "Files"), reproduzir localmente 3 vezes. Se falhar, causa raiz e correção. Se passar 3/3 localmente e falhar no CI, registrar em `.planning/BLOCKERS.md` com o log do CI e avisar no PR, sem desativar nada.
- [ ] **Step 9: Verificar e fazer commit.** `pnpm verify` → verde. Rodar `pnpm exec playwright test --project=mobile-webkit` nos arquivos tocados → PASS.

```bash
git add tests/e2e src/components .planning/BLOCKERS.md
git commit -m "test(e2e): CI verde — vocabulário do A09, alvo de toque do logo e regressões do mobile-webkit [SEC-T0]"
```

---

### Task 2: C4-01 — `.gitignore`

**Files:**
- Modify: `.gitignore:3-4`
- Test: `tests/security/gitignore.test.ts` (novo)

- [ ] **Step 1: Escrever o teste.** `it(".env de produção e desenvolvimento são ignorados e .env.example não")`: com `execFileSync("git", ["check-ignore", "--no-index", ...])`, esperar que `.env.prod`, `.env.production`, `.env.development` e `.env` sejam ignorados. `.env.example` não pode ser ignorado: `git check-ignore` sai com código 1.
- [ ] **Step 2: Rodar.** `pnpm vitest run tests/security/gitignore.test.ts` → FAIL em `.env.prod`.
- [ ] **Step 3: Corrigir.** Trocar as linhas 3-4 por `.env*` e `!.env.example`, mantendo a linha `.supabase.env` existente.
- [ ] **Step 4: Rodar.** O mesmo comando → PASS. `git ls-files .env.example` ainda lista o arquivo.
- [ ] **Step 5: Commit.** `fix(security): .gitignore cobre todo .env* exceto o exemplo [SEC-C4-01]`

---

### Task 3: C1-01 — versões de matérias só pela view pública

**Files:**
- Create: `supabase/migrations/0074_security_p1.sql` (seção C1-01)
- Test: `tests/security/p1.test.ts` (novo; clientes anon, leitor e equipe copiados do padrão de `tests/security/rls.test.ts:28-34` e de `tests/integration/studio.ts` → `clientOf`)

**Interfaces:**
- Produces: `tests/security/p1.test.ts`, com `anonClient()`, `readerClient()` (leitor sem papel, criado por `service.auth.admin.createUser` no `beforeAll`) e `staff(name)` = `clientOf(name)`. As Tasks 4 e 6 acrescentam `describe`s a este arquivo.

- [ ] **Step 1: Escrever os testes.** `describe("C1-01 article_versions")`, usando uma matéria publicada do seed:
  - `it("anon não lê article_versions")`: `select("id").eq("article_id", pub)` → 0 linhas.
  - `it("leitor sem papel não lê article_versions")` → 0 linhas.
  - `it("public_article_versions continua lendo as versões pós-publicação")`: anon → ≥ 1 linha.
  - `it("equipe continua lendo article_versions")`: `staff("helena")` → ≥ 1 linha.
- [ ] **Step 2: Rodar.** `pnpm vitest run tests/security/p1.test.ts` → FAIL nos dois primeiros.
- [ ] **Step 3: Criar a `0074` com a seção C1-01.** Cabeçalho do arquivo com a referência à spec, e depois `drop policy if exists article_versions_read_public on article_versions;`.
- [ ] **Step 4: Aplicar e rodar.** `pnpm db:reset && pnpm vitest run tests/security/p1.test.ts` → PASS. `pnpm vitest run tests/security/rls.test.ts` → PASS. A lista de políticas de anon pode ter mudado; se o teste estrutural tiver uma allowlist que cita a política, remover só essa entrada.
- [ ] **Step 5: Commit.** `fix(security): anônimos leem versões só pela view pública [SEC-C1-01]`

---

### Task 4: C1-03 — `push_audit` só para quem gere push

**Files:**
- Modify: `supabase/migrations/0074_security_p1.sql` (seção C1-03)
- Test: `tests/security/p1.test.ts` (novo `describe`)

**Interfaces:**
- Consumes: `readerClient()`, `staff(name)` da Task 3.
- Produces: `public.push_audit(p_action text, p_object text, p_details jsonb default '{}')`, com a mesma assinatura e os mesmos grants. O comportamento muda: `42501` sem `push_can(auth.uid(), 'push.settings')`; `22023` se `octet_length(coalesce(p_details,'{}')::text) > 2048`.

- [ ] **Step 1: Escrever os testes.** `describe("C1-03 push_audit")`:
  - `it("leitor sem papel recebe 42501 e nada é gravado")`: `rpc("push_audit", { p_action: "push.approve", p_object: "push:x", p_details: {} })` → `error.code === "42501"`. Via service, `audit_log` com `object_ref = 'push:x'` deve ter 0 linhas.
  - `it("admin com p_details acima de 2 KB recebe 22023")`: `p_details: { s: "x".repeat(2100) }` → `22023`.
  - `it("admin grava com p_details nulo como {}")`: `p_details: null`, depois ler a linha e conferir `details` igual a `{}`.
  - `it("push_resume_request por admin continua auditando")`: chamar a RPC com motivo válido → sem erro, e uma linha `push.resume_requested` aparece.
- [ ] **Step 2: Rodar.** O comando da Task 3 → FAIL no primeiro e no segundo.
- [ ] **Step 3: Implementar.** Na `0074`, `create or replace function public.push_audit(...)` mantendo `security definer` e `set search_path = public`. As checagens, nesta ordem: papel, prefixo `push.`, tamanho. Depois o insert atual. Repetir o `revoke ... from public, anon` e o `grant ... to authenticated, service_role`.
- [ ] **Step 4: Aplicar e rodar.** `pnpm db:reset && pnpm vitest run tests/security/p1.test.ts tests/integration` → PASS.
- [ ] **Step 5: Commit.** `fix(security): push_audit exige papel de push e limita detalhes [SEC-C1-03]`

---

### Task 5: C3-01 — "remover todas da fonte" só com escopo total

**Files:**
- Modify: `src/lib/studio/media.ts:119-137` (`takedownImage`)
- Modify: `src/app/estudio/midia/[id]/page.tsx:191-196` (prop nova)
- Modify: `src/components/studio/ImageApproval.tsx:19,46,206` (opção condicional)
- Test: `tests/integration/studio-gate.test.ts` (no `describe("mídia: remoção de reprodução e aprovação")`, linha 623)

**Interfaces:**
- Consumes: `MULTI_SECTION` de `src/lib/studio/scope.ts:23`, `can(roles, action, scope)` de `src/lib/auth/permissions.ts:126`.
- Produces: `ImageApproval` ganha a prop `canTakedownAll?: boolean` (padrão `false`).

- [ ] **Step 1: Escrever os testes.** No `describe` da linha 623, reutilizando o helper `asset()`:
  - `it("editor de editoria não remove todas da fonte")`: reprodução com `source_id` ligada a uma matéria de `cidade`. `asUser("otavio", () => takedownImage({ id, reason: "Pedido", allFromSource: true }), { mediaStore })` → `{ ok: false, error: "forbidden" }`, e o status da imagem continua `approved`.
  - `it("editor de editoria sem matéria ligada também não remove todas da fonte")`: reprodução sem `article_media`, mesmas expectativas.
  - `it("editor remove só a imagem da própria editoria")`: o mesmo caso do primeiro, mas com `allFromSource: false` → `ok: true`, `blocked: 1`.
  - `it("editora-chefe remove todas da fonte")`: duas reproduções com o mesmo `source_id` em editorias diferentes, `asUser("marina", ..., allFromSource: true)` → `ok: true`, `blocked: 2`.
- [ ] **Step 2: Rodar.** `pnpm vitest run tests/integration/studio-gate.test.ts -t "mídia"` → FAIL no primeiro e no segundo.
- [ ] **Step 3: Implementar.** No segundo argumento de `studioAction` em `takedownImage`, o resolvedor de escopo vira `(i, ctx) => i.allFromSource ? Promise.resolve({ section: MULTI_SECTION }) : mediaScope(ctx, i.id)`. Escopo `{ section: MULTI_SECTION }` só passa com grant `all`. A guarda de existência (`not_found`) continua no corpo.
- [ ] **Step 4: UI.** Na página, calcular `canTakedownAll = can(session.roles, "media.approve", { section: MULTI_SECTION })` e passar para `ImageApproval`. No componente, o checkbox "remover todas da fonte" só renderiza com `canTakedownAll`; sem a prop, `allFromSource` vai sempre `false`.
- [ ] **Step 5: Rodar.** O comando do Step 2 → PASS. `pnpm vitest run src/components/studio` → PASS.
- [ ] **Step 6: Commit.** `fix(security): remover todas da fonte exige escopo total [SEC-C3-01]`

---

### Task 6: C1-02 — prova de posse do e-mail para exportar e expurgar

**Files:**
- Modify: `supabase/migrations/0074_security_p1.sql` (seção C1-02)
- Test: `tests/security/p1.test.ts` (novo `describe`)
- Modify: `.planning/BLOCKERS.md` (tarefa do dono: "Confirm email" em produção)

**Interfaces:**
- Consumes: `readerClient()` e `service` da Task 3; `psql()` copiado de `tests/security/rls.test.ts:17-26`.
- Produces: `public.email_ownership_proven(p_uid uuid) returns boolean`, `security definer`, só para `service_role`. Novas versões de `export_email_data()` e de `purge_deleted_accounts(...)`, com as mesmas assinaturas e grants das versões vigentes. Antes de reescrever, ler a versão mais recente de cada uma com `grep -n "function purge_deleted_accounts" supabase/migrations/*.sql`.

- [ ] **Step 1: Verificar a premissa do GoTrue.** No Supabase local, criar um usuário com `service.auth.admin.createUser({ email, password, email_confirm: true })` e ler `select email_confirmed_at, confirmation_sent_at, raw_app_meta_data->>'provider' from auth.users where email = ...`. Esperado: `email_confirmed_at` preenchido, `confirmation_sent_at` nulo, provider `email`. Se o `confirmation_sent_at` vier preenchido, parar a task, registrar em `.planning/BLOCKERS.md` com a alternativa da spec §3 e avisar o dono.
- [ ] **Step 2: Escrever os testes.** `describe("C1-02 prova de posse do e-mail")`, com o e-mail `vitima-<run>@exemplo.com` inscrito na newsletter (confirmada) e com um alerta `email:` criados via service:
  - `it("conta auto-confirmada com e-mail alheio não exporta")`: conta criada como no Step 1, logada, `rpc("export_email_data")` → `data === null`.
  - `it("conta com confirmação por link exporta")`: outra conta; via `psql`, `update auth.users set confirmation_sent_at = now() where id = ...`; `export_email_data` → objeto com `newsletter.length >= 1`.
  - `it("conta OAuth exporta")`: via `psql`, `raw_app_meta_data = jsonb_set(raw_app_meta_data, '{provider}', '"google"')` → objeto.
  - `it("expurgo de conta sem prova apaga a conta e mantém newsletter e alertas do e-mail")`: marcar `delete_requested_at` vencido e chamar `purge_deleted_accounts` como na migration vigente. A conta some de `auth.users`; `newsletter_subscriptions` e `alerts` do e-mail continuam.
  - `it("expurgo de conta com prova apaga também os dados do e-mail")`.
- [ ] **Step 3: Rodar.** `pnpm vitest run tests/security/p1.test.ts -t "C1-02"` → FAIL no primeiro e no quarto.
- [ ] **Step 4: Implementar a seção C1-02.** O predicado é `email_confirmed_at is not null and (confirmation_sent_at is not null or coalesce(raw_app_meta_data->>'provider','email') <> 'email')`. `revoke all ... from public, anon, authenticated`; `grant execute ... to service_role`. Nas novas versões, `export_email_data` troca a condição `u.email_confirmed_at is not null` por `email_ownership_proven(u.id)` (a função é definer e roda como dono). `purge_deleted_accounts` só chama `purge_email_data(v_email)` quando `email_ownership_proven(<uid>)` for verdadeiro; o resto fica idêntico à versão vigente.
- [ ] **Step 5: Aplicar e rodar.** `pnpm db:reset && pnpm vitest run tests/security tests/integration` → PASS. As e2e de privacidade e de exclusão de conta: `pnpm exec playwright test tests/e2e/privacy.spec.ts tests/e2e/privacy-strict.spec.ts --project=desktop` → PASS. Se alguma usar conta auto-confirmada esperando a exportação por e-mail, ajustar o setup do teste para marcar `confirmation_sent_at`, como no Step 2, e explicar no commit.
- [ ] **Step 6: BLOCKERS.** Acrescentar a entrada "Ligar Confirm email no Supabase de produção (Auth → Providers → Email); contas já auto-confirmadas perdem a exportação por e-mail até confirmar", com referência a C1-02.
- [ ] **Step 7: Commit.** `fix(security): exportação e expurgo por e-mail exigem prova de posse [SEC-C1-02]`

---

### Task 7: Fechamento

**Files:**
- Modify: `src/lib/db/types.ts` (só se `pnpm db:types` mudar algo)
- Modify: `docs/security-audit/achados.json`: nos 5 achados, campo novo `"status": "corrigido em <commit>"`
- Modify: `docs/security-audit/gerar_relatorio.py`: mostrar o `status`, quando houver, na descrição do achado
- Regenerate: `docs/security-audit/relatorio-auditoria-seguranca.pdf`, `docs/security-audit/issues.md`
- Modify: `.planning/STATE.md`, `.planning/progress.json` (checkpoint, como pede o CLAUDE.md)

- [ ] **Step 1:** `pnpm db:types` e commitar se houver diff.
- [ ] **Step 2:** Atualizar `achados.json` e o gerador. Rodar `docs/security-audit/.venv/bin/python docs/security-audit/gerar_relatorio.py` → "PDF gerado". Rasterizar a página dos achados com `pdftoppm` e conferir o texto do status.
- [ ] **Step 3:** `pnpm verify` → verde.
- [ ] **Step 4: Commit.** `docs(security): marca P1 como corrigido e regenera o relatório [SEC-P1]`. Depois `git push -u origin claude/saas-security-audit-v2-p5kwh9` e acompanhar o CI do PR #17 até ficar verde.
