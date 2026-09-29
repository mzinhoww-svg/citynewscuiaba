# Tracking plan · eventos, consentimento e ranking

## 1. Envelope comum (`src/lib/events/schema.ts`)

```ts
const EventEnvelope = z.object({
  name: EventName,                              // enum abaixo
  anonId: z.string().uuid().nullable(),        // null sem consentimento de personalização
  userId: z.string().uuid().nullable(),        // só com conta
  at: z.string().datetime(),                   // ISO, relógio do cliente; servidor grava received_at
  sourceId: z.string().nullable(),             // slug da fonte
  contentId: z.string().nullable(),            // article:<id> | topic:<id> | agg:<id> | event:<id>
  session: z.object({ id: z.string(), page: z.string(), referrer: z.string().nullable(), device: z.enum(["mobile","tablet","desktop"]) }),
  consent: z.object({ version: z.string(), metrics: z.boolean(), personalization: z.boolean() }),
  algoVersion: z.string(),                     // ex.: "rec-v1"
  props: z.record(z.union([z.string(), z.number(), z.boolean()])).default({})
});
```

Regra de envio: sem `metrics` e sem `personalization` → nada é enviado. Só `metrics` → envia com `anonId = null` e sem `props` de conteúdo pessoal. `personalization` → envia completo.

## 2. Eventos

| Evento | Quando | `props` obrigatórias |
|---|---|---|
| `source_viewed` | página da fonte ou card de fonte visível ≥ 1 s | `surface` (fontes, home, panorama) |
| `source_followed` | toque em Seguir | `surface`, `fromRecommendation` |
| `source_unfollowed` | deixar de seguir | `surface` |
| `article_opened` | matéria ou link agregado aberto | `kind` (original, normalized, aggregated), `position` |
| `article_read` | leitura qualificada (≥ 30 s e rolagem ≥ 50%, ou ≥ 60 s) | `seconds`, `scrollPct` |
| `article_saved` | salvar | `surface` |
| `article_shared` | compartilhar | `channel` |
| `search_submitted` | busca tradicional ou IA | `mode` (traditional, ai), `resultCount` (sem o texto da busca quando só métricas) |
| `recommendation_clicked` | clique em item recomendado | `list`, `reason`, `position` |
| `recommendation_dismissed` | ocultar | `list`, `reason`, `dismissReason` |
| `personalization_enabled` | ligar | `from` (banner, switch, privacidade) |
| `personalization_disabled` | desligar | `from` |
| `login_prompt_shown` | convite exibido | `trigger` (save, follow, alert, collection, sync, topic, ai) |
| `login_started` | clicou em Entrar ou Criar conta | `trigger`, `method` |
| `login_completed` | sessão criada | `method`, `migrated` |
| `login_skipped` | "Agora não" ou fechar | `trigger` |
| `privacy_settings_updated` | salvar escolhas | `metrics`, `personalization` |
| `install_prompt_shown` | faixa de instalação (C07) visível ≥ 1 s | `platform` (android, ios, desktop), `trigger` (visits, reads) |
| `install_prompt_dismissed` | "Agora não" na faixa ou recusa no diálogo nativo | `platform`, `refusals` (1–3) |
| `app_installed` | `appinstalled` ou 1ª abertura em `standalone` | `via` (prompt, ios_steps, browser, unknown) |
| `notif_preprompt_shown` | pré-prompt de notificações (C09) visível ≥ 1 s | `trigger` (follow, alert, urgent_article) |
| `notif_preprompt_dismissed` | "Agora não" em C09 | `trigger`, `refusals` (1–3) |
| `notif_permission_granted` | permissão de notificação concedida | `trigger` (follow, alert, urgent_article, settings) |
| `notif_permission_denied` | permissão negada | `trigger` |
| `push_unsubscribed` | "Desativar avisos" em Alertas | `from` (settings) |

Nos oito eventos do app (spec 2026-09-28 §9.1), `/api/events` acrescenta `props.browser` (família derivada do `User-Agent` no servidor: chrome, safari, firefox, edge, samsung, other); o `User-Agent` não é gravado. `push_sent`, `push_delivered` e `push_clicked` não são eventos: são contadores agregados em `push_sends`/`push_send_counters`, sem id de inscrição.

Nunca registrar: texto de busca quando só métricas; conteúdo de conversas com IA fora da tabela própria; IP em claro; atributos sensíveis.

## 3. Sinal fraco (`isWeakSignal`)

Fraco se qualquer: `seconds < 10`; `scrollPct < 25`; interação única isolada da fonte nos últimos 14 dias; retorno em < 5 s. Sinais fracos são guardados mas têm peso 0 no score individual até se repetirem 3 vezes em dias diferentes.

## 4. Score e ranking (`scoreSource`, `rankSources`)

```
score = Σ w_i · c_i, com c_i ∈ [0,1] normalizado por percentil dentro da janela
w (rec-v1) = { popularity: .35, individual: .25, recency: .15, engagement: .10, operational: .10, diversity: .05 }
sem personalização: individual = 0 e renormalizar os demais para somar 1
```

`rankSources(candidates, { list, cap: 0.25, discoveryEvery: 5, limit })`:
1. ordena por score;
2. aplica teto: nenhuma fonte ocupa mais de `ceil(limit * cap)` posições (relevante para listas de itens de fontes);
3. em `recommended`, a cada 5 posições garante 1 fonte com `c_individual` = 0 e `c_diversity` > 0 (descoberta), marcada com razão "Recomendado para ampliar a diversidade de fontes" ou "Nova recomendação";
4. remove fontes ocultadas pelo leitor e fontes `blocked` ou `excluded_from_rec`;
5. aplica fixações do admin (`pinned`) no topo da lista correspondente, contando no teto.

## 5. Justificativa (`explainRecommendation`)

Escolhe a razão de maior contribuição, na ordem de desempate: seguida > busca recente > editoria acompanhada > local > em alta > popular > diversidade. Textos em `src/content/pt-BR/recommendations.ts` (spec §7.4). Nunca usar verbo "gostar".

## 6. Métricas do painel (O17)

CTR por lista e por razão, taxa de ocultação por motivo, retorno 7 d de quem seguiu via recomendação, índice de diversidade (1 − Σ share²) por leitor e global, concentração top-3, % personalização ativa, anônimos × contas, versão do algoritmo em uso, experimentos ativos.
