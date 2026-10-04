# Spec · Retomada da UI pública e da pauta quente

Data: 04/10/2026 · Filha de `2026-10-02-ui-publica-design.md` (§4.5 a §4.9, §6) e de `2026-10-03-destaques-e-profundidade-design.md` (R8 a R11). Não muda nenhuma regra dessas specs; só registra o que mudou no código desde que os planos foram escritos e fixa a ordem de entrega pedida pelo dono em 04/10.

## 1. Entendimento

**Pedido do dono (04/10):** entregar o que ficou para trás dos planos `2026-10-02-ui-publica.md` e `2026-10-03-destaques-e-profundidade.md`, nesta ordem de prioridade: UI-T12 (login), UI-T13 (chat), TXT-T2, HOT-T1 a T3, depois UI-T10, UI-T11, UI-T14 e os dois fechamentos.

**Por que ficou para trás:** depois de UI-T9 (03/10 14:22) a execução passou para as specs novas (autonomia, Guia, anúncios, segurança) e nenhum dos dois planos estava em `.planning/progress.json`, então nenhuma retomada viu a lacuna.

**Sucesso:** as tarefas abaixo entregues com os critérios das specs-mãe, `pnpm verify` verde, e os dois planos rastreados em `progress.json` até o fechamento.

## 2. O que mudou desde os planos (desvio de rota)

| Item | Plano dizia | Código hoje | Decisão |
|---|---|---|---|
| TXT-T1 | `collected_items.body_text` (0054) | `source_text` + `enrich` automático para feed curto (A-114, 0074) | **Feita por outro caminho.** Fecha. |
| TXT-T2 | 5 a 9 parágrafos, 350 a 600 palavras, `short_body` | R41 (substitui R29): mínimo de 30 linhas, 8 a 12 parágrafos, até 2 reescritas, `short_reason = 'insufficient_source'` (AUT-T4) | **Feita, com a regra mais nova do dono.** Fecha; não reabrir o limite antigo. |
| TXT-T3 | "Aprofundar matérias curtas" no Control Center | A-126: reescrita no ar (`live`, 0147) e script de recuperação das 550 matérias de uma frase | **Feita por outro caminho.** Fecha. |
| HOT-T1 | criar `featured_items.kind`, `topic_id`, `dismissed_at` | `kind ('manual','hot')` já existe (0090); `topic_id` e `dismissed_at` não | Migration nova só acrescenta o que falta. |
| HOT-T3 | precedência manual > quente > automático em `resolve.ts` | `resolveSlot` já aceita `hot` e devolve `source: "hot"`; rótulo "Em alta" já em `featured.ts` | Só falta alimentar `hot` a partir de `featured_items kind='hot'`. |
| Numeração | 0053 a 0057 | última é 0150 | HOT usa 0151 (sinais, flags, colunas e cron) e 0152 (limpeza com `delete`, aplicada pelo dono no SQL Editor). |
| R22 (comoção nacional pelo `frontpage`) | não estava no plano | `national_commotion` só por classificação ou marcação manual | **Fora desta rodada.** O passo `frontpage` fica genérico para servir depois; pendência registrada. |

## 3. Escopo desta rodada

1. **UI-T12 Login e cadastro** (spec UI §4.7, critério 7). Sem mudança.
2. **UI-T13 Pergunte como chat** (§4.8, critério 8). Usa `POST /api/ask` NDJSON existente (`status` e `answer`); a resposta chega inteira no evento `answer` (o "streaming" do §4.8 é o indicador de passos, não token a token). Sem mudança de rota nem de contrato.
3. **HOT-T1 a T3 Pauta quente** (R8 a R11), com as correções da §2.
4. **UI-T10 Fontes e Panorama, UI-T11 Marketing, UI-T14 Conta e legais.** Sem mudança.
5. **Fechamentos:** UI-T15 (relatório `docs/reports/ui-publica.md`, critérios §6) e GATE de destaques (relatório `docs/reports/destaques-e-profundidade.md`).

## 4. Execução

- Ondas paralelas por arquivos disjuntos, cada tarefa num worktree próprio e integrada no branch de trabalho em seguida:
  - Onda 1: UI-T12 ∥ UI-T13 ∥ HOT-T1.
  - Onda 2: HOT-T2 ∥ UI-T10 ∥ UI-T11 ∥ UI-T14 (UI-T14 depois de UI-T12, porque as duas mexem em `AccountShell`).
  - Onda 3: HOT-T3.
  - Onda 4: UI-T15 e GATE.
- Produção (aplicar 0151, ligar `consumption.frontpage` nas fontes com `robots.txt` permitindo `/`, conferir lead em dois reloads) **só depois do merge da PR**, como nos fechamentos anteriores. A 0152 (com `delete`) fica para o dono.
- Integração com banco: este container não tem a pilha Supabase local; testes de integração rodam no CI.

## 5. Fora do escopo

R22 por sinal de portais nacionais; mudança de regra de publicação; qualquer tela do Estúdio além do quadro de destaques (pílula "Em alta · n portais", Dispensar) e do interruptor `hot_featured_enabled`.
