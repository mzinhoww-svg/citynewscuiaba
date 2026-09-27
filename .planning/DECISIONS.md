# Registro de decisões

Decisões de produto e arquitetura D1 a D18 estão em `docs/superpowers/specs/2026-09-27-citynews-design.md` §2 e não são reabertas. Refinamentos visuais R1 a R14 estão em `DESIGN.md` §2.

Decisões autônomas tomadas durante a execução recebem `A-###`:

| ID | Data | Tarefa | Contexto | Decisão | Alternativas descartadas | Reversível? |
|---|---|---|---|---|---|---|
| A-000 | 2026-09-27 | kit | Brand kit usa "CityNews" e o canvas usava "CITYNEWS" | Interface usa "CityNews" (brand kit, com assets reais); rótulos de origem continuam em caixa alta | CITYNEWS em todo lugar | Sim, troca de string |
| A-000b | 2026-09-27 | kit | Brand kit usa Papel como superfície de UI | Papel só em marca, impresso e social; UI usa Névoa | Manter Papel | Sim, token |
| A-001 | 2026-09-27 | kickoff | Repositório | `mzinhoww-svg/citynewscuiaba`, privado | Repo novo | Sim |
| A-002 | 2026-09-27 | kickoff | Domínio | `*.vercel.app` até haver domínio próprio | Comprar domínio | Sim |
| A-003 | 2026-09-27 | kickoff | Supabase inexistente | Claude Code cria projetos free (`prod` primeiro; `staging` se a cota de projetos free permitir) e conecta Vercel e GitHub | Só local | Sim |
| A-004 | 2026-09-27 | kickoff | Plano Vercel | Hobby. `drain` em lotes pequenos, cron do ciclo no Supabase | Pro | Sim |
| A-005 | 2026-09-27 | kickoff | Provedor de IA | OpenRouter via Vercel AI SDK com provedor compatível com OpenAI (`baseURL https://openrouter.ai/api/v1`). Embedding `openai/text-embedding-3-small` (1536) pela rota `/embeddings` do OpenRouter. `FakeProvider` em teste e CI | Chamar provedores direto | Sim |
| A-006 | 2026-09-27 | kickoff | Orçamento | R$ 30/dia, pausa em 100% | — | Sim |
| A-007 | 2026-09-27 | kickoff | Login social | Google pelo OAuth do Supabase Auth (Client ID e Secret do Google Cloud cadastrados no Supabase) | Sem Google | Sim |
| A-008 | 2026-09-27 | kickoff | E-mail | SMTP padrão do Supabase Auth para confirmação, link mágico e recuperação. Newsletter e alertas por e-mail ficam na fila `notify` sem envio até haver provedor (BLOCKER B-005); alertas de navegador funcionam | Provedor externo já | Sim |
| A-009 | 2026-09-27 | kickoff | Fontes | Produção só com fontes reais (`supabase/seed_sources_real.sql`, 32 fontes, todas `paused` até validação). Testes e CI continuam com fixtures fictícias para serem determinísticos. Manchete inventada nunca é atribuída a veículo real | Fictícias em produção | Sim |
| A-010 | 2026-09-27 | kickoff | Imagens | Nova política `reproduction`: imagem da matéria original com rótulo REPRODUÇÃO · fonte, crédito, link, sem recorte de crédito, remoção em 24 h e opt-out por veículo. Risco jurídico registrado (B-002) | Só card tipográfico | Sim, por fonte |
| A-011 | 2026-09-27 | kickoff | Plantão | E-mail do dono do repositório no GitHub | — | Sim |
| A-012 | 2026-09-27 | kickoff | Grafia | "CityNews" confirmado | — | Sim |
| A-013 | 2026-09-27 | kickoff | Logotipo vetorial | SVGs gerados a partir do PNG do kit: símbolo medido (arco ±40°, ponto a 1,0 raio externo) e wordmark convertido em contornos de Schibsted Grotesk 800 (tracking −0,065em, igual ao PNG). Arquivos em `design-system/assets/logo/svg/` | PNG | Sim |
| A-014 | 2026-09-27 | kickoff | Dados institucionais | `[PREENCHER]` e B-001 | — | Sim |
| A-015 | 2026-09-27 | kickoff | Recursos | Pode criar tudo o que for gratuito; nunca pago | — | Sim |
| A-016 | 2026-09-27 | kickoff | Ambiente de execução é um container de nuvem que só pode enviar para o branch `claude/keen-hypatia-8qn86r` | Todo o trabalho acontece nesse branch, com um único PR em rascunho para `main`. Os gates de fase viram tags `p#-done` no branch e relatórios em `docs/reports/`; o merge em `main` fica com o dono | Um PR e um merge por fase | Sim |
| A-017 | 2026-09-27 | kickoff | Sem Docker e sem Supabase CLI no container | Pilha Supabase local sem Docker em `scripts/local-stack/`: Postgres 16 + pgvector + pg_cron (apt), PostgREST 12 e Supabase Auth (binários oficiais) atrás de um proxy Node em `:54321` com as rotas `/rest/v1` e `/auth/v1`. `pnpm db:reset` usa o Supabase CLI quando existe (CI) e a pilha local quando não. `pgmq` e `pg_net` não existem na pilha local: as migrations os habilitam só se disponíveis e usam o contorno da tabela `jobs` (`docs/AUTONOMY.md` §4) | Esperar Docker | Sim |
| A-018 | 2026-09-27 | kickoff | `OPENROUTER_API_KEY` ausente no ambiente | `AI_PROVIDER=fake` em todo o fluxo até a chave existir (B-008) | — | Sim |
| A-019 | 2026-09-27 | kickoff | B-007: cota de projetos Supabase free esgotada | A pedido do dono, `listada-escola` foi pausado e `citynews-prod` foi criado (ref `vmvirmemxfdtxfdmivuu`, `sa-east-1`, plano free). `staging` não cabe na cota: previews seguem o contorno de B-004 | Neon (reabriria D2) | Sim, reativar o projeto pausado |
| A-020 | 2026-09-27 | P0-T4 | Plano espera 0,84 para 2 indep. + 1 primária + sem conflito + 30 h, mas a fórmula da spec §6.3 dá 0,795 → 0,80 (frescor 0,3 em 30 h, igual ao exemplo de 0,65 da própria spec) | Spec vence: teste espera 0,80 | Mudar a fórmula | Sim |
| A-021 | 2026-09-27 | P0-T5 | Spec não lista os temas sensíveis padrão | `sensitiveTopics` padrão: crime, violência, morte, tragédia, acidente, suicídio, abuso, saúde individual, eleições; comparação sem caixa e acento, também contra a categoria | Lista vazia | Sim, editável no Control Center |
| A-022 | 2026-09-27 | P0-T1 | Next 16.3.6, React 19.2.8, Tailwind 4.3.3, Playwright fixado em 1.56.1 (casa com o Chromium pré-instalado); `typecheck` = `next typegen && tsc --noEmit` | Versões estáveis do momento | — | Sim |

