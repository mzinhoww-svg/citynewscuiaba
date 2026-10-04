# Correções de segurança P1 (auditoria de 04/10/2026)

**Status:** aprovado em conversa (abordagens e escopo C + tarefa 0), aguardando revisão da spec escrita.
**Origem:** `docs/security-audit/relatorio-auditoria-seguranca.pdf` e `docs/security-audit/achados.json`.
**Branch:** `claude/saas-security-audit-v2-p5kwh9` (PR #17).

## 1. Objetivo e escopo

Fechar os 5 achados de severidade média da auditoria sem quebrar portal nem Estúdio, e devolver o CI ao verde.

| ID | Achado | Dentro do escopo |
|---|---|---|
| T0 | CI vermelho na `main` (4 falhas e2e pré-existentes) | sim, pré-requisito |
| C1-01 | Anônimos leem `article_versions` (rascunhos pré-publicação) | sim |
| C1-02 | Exportação e expurgo por e-mail sem prova de posse | sim |
| C1-03 | `push_audit` grava no `audit_log` para qualquer conta | sim |
| C3-01 | Editor de editoria remove imagens de todas as editorias | sim |
| C4-01 | `.gitignore` não cobre `.env.prod` | sim |

**Fora do escopo** (próxima rodada, P2/P3 do relatório): C1-04 a C1-08, C2-*, C3-02, C3-03, C4-02 a C4-05, C5-*, e a política ampla `audit_log_insert` (usada por `src/lib/db/source-admin-store.ts:522`).

**Critério de sucesso:** cada achado tem teste que falha antes e passa depois; `pnpm verify` verde; CI do PR #17 verde; nenhuma migration antiga editada; nenhum teste pulado ou desativado.

## 2. Restrições

- Migrations novas a partir de `0074`; nunca editar as existentes.
- Regras do CLAUDE.md: TDD, `Result` em erros de domínio, textos em `src/content/pt-BR`, commits Conventional com o ID do achado (`[SEC-C1-01]`).
- Testes de banco em `tests/security/rls.test.ts` (padrão existente: clientes anon, leitor e equipe contra o Supabase local).
- Ações em produção que dependem do painel do Supabase ficam registradas como tarefa do dono em `.planning/BLOCKERS.md`.

## 3. Design por item

### T0 — CI verde (pré-requisito)

Falhas reproduzidas na `main` (`7b5cb94`) e no PR #17, com re-run confirmando:

1. `tests/e2e/a09-new-settings.spec.ts:110` espera o nome interno `NORMALIZADO PELO CITYNEWS`; o Estúdio agora mostra o vocabulário novo (`src/lib/push/text.ts:49`, "Feito a partir de outras fontes"). **Correção:** o teste passa a esperar o rótulo atual. É o teste que está desatualizado, não a tela (regra §5.3 do CLAUDE.md).
2. `tests/a11y/all-routes.spec.ts:188` (mobile e mobile-webkit): o link do logo "CityNews Cuiabá, página inicial" mede 148×32, abaixo dos 44 px. **Correção:** alvo de toque mínimo de 44 px no link do logo (componente do cabeçalho, via token), sem mudar o tamanho visual da marca.
3. `tests/e2e/article.spec.ts:520` (mobile-webkit): a figura da matéria fica 10 px mais larga que a coluna do texto. **Correção:** depurar a causa (provável regressão do PR de posições de mídia) e alinhar a figura à coluna.
4. `tests/e2e/review-bulk-publish.spec.ts:66` (mobile-webkit): "3 matérias selecionadas nesta página." não aparece. **Correção:** depurar a causa e corrigir o componente ou o teste, conforme o que estiver errado.

Itens 3 e 4 usam `superpowers:systematic-debugging`; se a causa for tela, conserta a tela.

### C1-01 — versões de matérias legíveis por anônimos

- Migration `0074_security_p1.sql`: `drop policy article_versions_read_public on article_versions;`.
- O portal já lê só a view `public_article_versions` (`src/lib/db/queries/articles.ts:429,520`); o Estúdio lê com a política `article_versions_read_staff`. Nada no app muda.
- **Teste:** anon e leitor sem papel recebem 0 linhas em `article_versions`; `public_article_versions` continua devolvendo as versões pós-publicação de uma matéria publicada; equipe continua lendo a tabela.

### C1-02 — exportação e expurgo por e-mail sem prova de posse

O dado ligado só a e-mail (newsletter, alertas `email:`, fila `reader_emails`) só pode ser lido ou apagado pela conta quando o e-mail da conta foi comprovado de fato.

- **Configuração:** `supabase/config.toml` passa a `enable_confirmations = true`. Ligar "Confirm email" no projeto de produção é tarefa do dono (BLOCKERS).
- **Predicado no banco:** nova função `email_ownership_proven(uid uuid) returns boolean` (`security definer`, `search_path = public`, revogada de public, anon e authenticated). Verdadeira quando `email_confirmed_at is not null` **e** a confirmação veio de prova real: `confirmation_sent_at is not null` (cadastro com e-mail confirmado por link) ou provedor diferente de `email` em `raw_app_meta_data` (OAuth com e-mail verificado pelo provedor).
- `export_email_data()` (nova versão) usa o predicado no lugar de `email_confirmed_at is not null`; sem prova, devolve `null`, que a UI já trata.
- `purge_deleted_accounts` (nova versão) só chama `purge_email_data(v_email)` quando o predicado é verdadeiro. A conta, o perfil e os dados por `user_id` continuam sendo apagados sempre.
- **Verificação obrigatória no início da tarefa:** confirmar, no Supabase local, que um cadastro com auto-confirmação deixa `confirmation_sent_at` nulo e que um cadastro com confirmação o preenche. Se o GoTrue não distinguir os dois casos, parar e registrar em `.planning/BLOCKERS.md` com a alternativa: e-mail de confirmação próprio antes de exportar ou apagar dado por e-mail.
- **Teste:** conta auto-confirmada com o e-mail de um assinante → `export_email_data` devolve `null` e o expurgo mantém newsletter e alertas; conta com prova → comportamento atual.

### C1-03 — `push_audit` aberta a qualquer conta

- Nova versão de `public.push_audit` na `0074`:
  - exige `push_can(auth.uid(), 'push.settings')` (admin ou editor-chefe), senão `raise ... errcode '42501'`;
  - recusa `p_details` acima de 2048 bytes (`octet_length(p_details::text)`), `errcode '22023'`;
  - mantém a checagem `p_action like 'push.%'`, o `search_path` e os grants atuais. O único chamador, `push_resume_request` (0041:625, `security invoker`), já exige o mesmo papel, então o grant a `authenticated` continua necessário.
- **Teste:** leitor sem papel → 42501; admin com `p_details` grande → 22023; `push_resume_request` por admin continua gravando a auditoria.

### C3-01 — editor apaga imagens de outras editorias

- `src/lib/studio/media.ts`: em `takedownImage`, o resolvedor de escopo devolve `{ section: MULTI_SECTION }` quando `allFromSource` é verdadeiro. Só papéis com grant `all` em `media.approve` (editor-chefe, revisor) passam; editor de editoria recebe `forbidden` pelo `studioAction` antes de qualquer escrita com service role.
- `src/components/studio/ImageApproval.tsx`: a opção "remover todas da fonte" só aparece quando a página recebe `canTakedownAll` (calculado no servidor com `can(roles, "media.approve", { section: MULTI_SECTION })`). A checagem do servidor é a que protege.
- **Teste:** unitário de `takedownImage` com editor `sections=["esportes"]` e `allFromSource: true` → `forbidden`, sem chamada ao repositório de mídia; com editor-chefe → segue para `takedownReproduction`; editor sem `allFromSource` na própria editoria → segue.

### C4-01 — `.gitignore`

- Trocar `.env*.local` e `.env` por `.env*` e `!.env.example`.
- **Teste:** `git check-ignore .env.prod .env.production .env.development` devolve os três; `git ls-files .env.example` continua listando o arquivo.

## 4. Ordem e entrega

T0 → C4-01 → C1-01 → C1-03 → C3-01 → C1-02 (o mais incerto por último). Um commit por item, todos no PR #17. Depois de tudo: regenerar `src/lib/db/types.ts` se a assinatura de funções mudar, atualizar `achados.json` com o estado "corrigido" dos 5 itens e regenerar o PDF.

## 5. Riscos

- **GoTrue não distinguir auto-confirmação** (C1-02): tratado pela verificação obrigatória e pela alternativa registrada.
- **Falhas de webkit em T0 serem de ambiente**: a regra é achar a causa; nada de pular teste. Se a causa estiver fora do repositório, registrar em BLOCKERS e avisar.
- **Contas já auto-confirmadas em produção** perdem a exportação por e-mail até confirmarem; é a troca segura e deve ser comunicada ao dono.
