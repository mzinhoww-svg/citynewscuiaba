# Estratégia de testes

## 1. Camadas

| Camada | Ferramenta | O que cobre | Gate |
|---|---|---|---|
| Unidade | Vitest | `src/lib/**` (domínio puro): labels, confiança, regras, ranking, consentimento, sanitização, dedupe, cluster, mídia, schemas | 90% de linhas em `src/lib` |
| Componente | Vitest + Testing Library | estados de componentes (vazio, erro, carregando), a11y básica (roles, labels) | todos os componentes de `components/editorial` e `components/ai` |
| Integração | Vitest + Supabase local | queries, RLS por papel, pipeline de ponta a ponta com fixtures | RLS: 1 teste por tabela sensível |
| E2E | Playwright (Chromium, WebKit, mobile 390 × 844) | fluxos críticos (seção 2) | verde no PR |
| Acessibilidade | `@axe-core/playwright` | todas as rotas públicas e do Estúdio com dados de seed | 0 violações `serious`/`critical` |
| Performance | Lighthouse CI | home, matéria, fontes, busca | LCP ≤ 2,5 s, CLS ≤ 0,1, TBT ≤ 200 ms (mobile simulado) |
| Exploratório | agent-browser | roteiros da seção 3, em preview da Vercel | relatório em `docs/reports/` |

## 2. Fluxos E2E obrigatórios (`tests/e2e`)

1. `anon-read.spec.ts`: visitante abre home, matéria, assunto, agenda, busca e fontes sem nenhum convite bloqueante; banner não cobre h1.
2. `consent.spec.ts`: "Só o necessário" → nenhuma chamada a `/api/events`; "Aceitar recomendações" → `anonId` criado e eventos com `personalization: true`.
3. `sources.spec.ts`: seguir fonte sem login; aba "Fontes que você segue" mostra a fonte; ocultar com motivo; desfazer; desligar personalização mostra estado sem histórico.
4. `login-invite.spec.ts`: salvar matéria exibe convite com "Agora não"; "Agora não" fecha e não reaparece para o mesmo gatilho na sessão.
5. `login-migrate.spec.ts`: anônimo com 2 fontes e 3 salvos cria conta, migra, vê "2 fontes e 3 salvos sincronizados".
6. `ask.spec.ts`: pergunta com fixture de 3 fontes gera resposta com citações; pergunta com fixture de 1 fonte gera `insufficient`; provedor falso com timeout mostra fallback de busca.
7. `aggregated.spec.ts`: todo card agregado tem rótulo AGREGADO e link `target="_blank" rel="noopener"` para o domínio da fonte.
8. `studio-review.spec.ts`: editor aprova item da fila de exceção; jornalista não vê botão Publicar; item automático pode ser despublicado com motivo.
9. `control-rules.spec.ts`: operador propõe regra v2; mesma pessoa não consegue aprovar; segunda pessoa aprova; auditoria registra os dois.
10. `pipeline.spec.ts` (integração): tick com 3 fontes de fixture produz assunto agrupado, matéria em revisão (Cidade com `forceReview`), item de Serviços publicado quando `forceReview=false`, item com instrução injetada em quarentena.

## 3. Roteiros do agent-browser (por fase)

Executar contra a URL de preview da Vercel. Para cada passo: navegar, capturar screenshot em 390 e 1280, verificar o esperado, anotar divergências.

**P1 Portal**
- Abrir `/` → ver manchete com rótulos e confiança; "Veja também em outros portais" abaixo da dobra, em superfície neutra.
- Abrir a manchete → resumo por IA com rótulo e revisor; fontes listadas; "Informar problema" envia sem login.
- `/agenda` → alternar Lista/Calendário; filtro "Só gratuitos"; abrir evento; baixar `.ics`.
- Forçar 404 → mensagem e busca.
- Navegar só com teclado da home até ler uma matéria; foco sempre visível.

**P2 Fontes e conta**
- Primeira visita em janela anônima → banner no rodapé; ler 3 matérias → painel "Personalize suas fontes…".
- `/fontes` → percorrer as 7 abas; conferir justificativa em cada card; nenhuma fonte com mais de 25% da lista.
- Seguir 2 fontes, salvar 1 matéria → convite de login; "Agora não"; recarregar; fontes continuam seguidas.
- `/privacidade/recomendacoes` → remover um interesse; redefinir; desativar; voltar a `/fontes` e ver estado sem histórico.
- Criar conta → migrar → confirmar contagens.

**P3 Busca e pipeline**
- `/busca?q=onibus` → encontra "ônibus"; resultados agrupados por assunto; termos destacados.
- `/pergunte` → "O que aconteceu em Cuiabá hoje?" → citações clicáveis; "Resuma saúde pública no Coxipó" → sem dados.

**P4 e P5 Estúdio e Control Center** (login com usuários de seed)
- Jornalista: criar rascunho, aceitar sugestão de título, enviar para revisão.
- Editora: aprovar com imagem ilustrativa; conferir rótulos no portal.
- Operador: executar ciclo manual; ver fila em tempo real; reprocessar item com falha; propor mudança de pesos; ver bloqueio de autoaprovação.

## 4. Fixtures

`tests/fixtures/feeds/*.xml` (RSS das fontes fictícias, incluindo um item com instrução injetada e um duplicado), `tests/fixtures/ai/*.json` (respostas gravadas do provedor falso), `tests/fixtures/images/*` (original sem permissão, licenciada, com marca d'água). O provedor de IA em teste é `FakeProvider` (`src/lib/ai/fake.ts`), determinístico, selecionado por `AI_PROVIDER=fake`.
