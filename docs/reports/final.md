# Relatório final · CityNews Cuiabá v1.0.0

Checklist dos 12 critérios de aceite da spec §11, com a evidência de cada um. Telas de apoio em `docs/vitrine/` (52 capturas, 390 e 1280 px) e galeria em `docs/vitrine/index.html`.

## Critérios de aceite

| # | Critério | Evidência |
|---|---|---|
| 1 | Visitante lê, pesquisa, usa agenda, explora e segue fontes sem login | `tests/e2e/anon-read.spec.ts`, `search.spec.ts`, `agenda.spec.ts`, `explore.spec.ts`, `sources.spec.ts`; telas `docs/vitrine/portal-*` |
| 2 | Login só como convite contextual, sempre com "Agora não" | `tests/e2e/login-invite.spec.ts`, `consent.spec.ts` |
| 3 | Fontes preferidas escolhidas à mão e também recomendadas | `tests/e2e/sources.spec.ts`, `source-page.spec.ts`; `docs/reports/fontes/` |
| 4 | Ranking combina popularidade, comportamento, recência e diversidade | `src/lib/ranking/*.test.ts`; Control Center, tela Recomendação (`estudio-08-recomendacao-*`) |
| 5 | Personalização desativável e explicada | `tests/e2e/privacy.spec.ts`, `privacy-strict.spec.ts`, `favorites-alerts.spec.ts` |
| 6 | Sem histórico, Fontes mostra populares e locais | `tests/e2e/sources.spec.ts` (estado frio); `portal-05-fontes-*` |
| 7 | Fontes locais em destaque | `src/lib/ranking` (bônus local) e `portal-05-fontes-*` |
| 8 | Agregado rotulado, abre no original; Fontes não substitui o portal | `tests/e2e/aggregated.spec.ts`; `portal-04-panorama-*` |
| 9 | Administrador audita, ajusta pesos, fixa, destaca, bloqueia, vê justificativas | `tests/e2e/control-rec.spec.ts`, `control-sources-*.spec.ts`, `admin-core.spec.ts`; `estudio-08/09/10-*` |
| 10 | Toda tela com carregando, erro, vazio e sucesso, em desktop e mobile | `tests/e2e/system-states.spec.ts`; `tests/a11y/all-routes.spec.ts` (todas as rotas, 2 viewports) |
| 11 | Publicação automática com regra, justificativa, confiança e desfazer em um clique | `tests/e2e/publish.spec.ts`, `control-rules.spec.ts`; `src/lib/publication/*.test.ts` |
| 12 | Busca com IA nunca sem fonte; separa fato, inferência, lacuna, conflito | `tests/e2e/ask.spec.ts`; `src/lib/ask/*.test.ts`; `portal-13-pergunte-*` |

## Gates e relatórios

P0 a P5, Painel de Fontes e PWA têm gate revisado por agente independente (`docs/reports/P*-gate-review.md`, `pwa-gate-review.md`). P6: desempenho `perf.md`, acessibilidade `a11y.md`, segurança `security.md`.

## Degradados e pendências conhecidas (registradas em BLOCKERS)

- **Desempenho:** JS inicial da home dentro de 170 kB; matéria e fontes em 178 a 180 kB (exceção orçada 185 kB). LCP (2,5 s) e TBT (200 ms) acima da meta em medição de laboratório (`perf.md`); sem regressão funcional.
- **Recuperação (P6-T4):** runbook `docs/runbooks/restore.md` escrito; o exercício de restauração exige um segundo projeto Supabase e fica pendente do dono.
- **2FA do staff:** não aplicado (BLOCKER).
- **`placeSponsored`:** o portal ainda não chama; entregas de patrocínio ficam em 0.
- **Revisão humana com leitor de tela** (VoiceOver/NVDA): pendente do dono.
- **Do dono:** `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` na Vercel e no Vault, chaves VAPID, repositório privado, Google OAuth, secrets do GitHub, dados institucionais, ativação das fontes reais.

## Produção

Banco de produção migrado até 0049 e verificado por hash. IA em produção com modelos baratos (DeepSeek/Qwen) e orçamento de R$ 30/dia. Telas verificadas contra produção após o merge na `main` (seção abaixo).
