/**
 * Portas e tipos da camada de IA (ADR-005). O domínio chama `callAgent`/`embed`; provedor
 * (OpenRouter ou falso) e registro (banco ou memória) entram por injeção.
 */

/** Agentes chamados com `callAgent` (um schema zod de saída por agente). */
export const AGENT_IDS = [
  "classify",
  "locate",
  "verify",
  "write",
  "answer",
  "image",
  "aggregate_summary",
  "source_profiler",
  "reviewer",
  "guide_writer",
] as const;
export type AgentId = (typeof AGENT_IDS)[number];

/** Agente de embeddings: mesmo registro, orçamento e `ai_calls`, sem prompt. */
export const EMBED_AGENT = "embed";

/**
 * Erro tipado da camada de IA. `budget_exceeded`: orçamento diário do agente ou global (R$ 30,
 * A-006) atingido; `injection`: instrução embutida nos dados externos (nunca chega ao provedor).
 */
export type AiError =
  "timeout" | "provider" | "schema" | "budget_exceeded" | "disabled" | "injection";

export interface AiModel {
  id: string;
  maxTokens: number | null;
  temperature: number | null;
  /** Custo em R$ por 1 000 tokens de entrada e de saída. */
  costPer1kIn: number;
  costPer1kOut: number;
  active: boolean;
}

export interface AgentConfig {
  id: string;
  enabled: boolean;
  dailyBudgetBrl: number;
  model: AiModel;
  fallback: AiModel | null;
  /** Prompt aprovado em produção (`ai_prompts.status = 'production'`); `null` sem prompt ativo. */
  prompt: { version: number; body: string } | null;
}

/** Linha de `ai_calls` (mesmos nomes de coluna). */
export interface AiCallRow {
  agent_id: string;
  model_id: string;
  prompt_version: number | null;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  cost_brl: number;
  ok: boolean;
  fallback_used: boolean;
  error: string | null;
}

/** Registro de agentes, flags, gastos e chamadas. */
export interface AiStore {
  agent(id: string): Promise<AgentConfig | null>;
  /** `feature_flags.ai_enabled`. */
  aiEnabled(): Promise<boolean>;
  /** Gasto em R$ desde `since`, por agente. */
  spendSince(since: Date): Promise<Record<string, number>>;
  recordCall(row: AiCallRow): Promise<void>;
}

export interface CompletionRequest {
  agentId: string;
  modelId: string;
  system: string;
  prompt: string;
  maxTokens: number | null;
  temperature: number | null;
  signal: AbortSignal;
}

export interface CompletionResponse {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export interface EmbeddingRequest {
  modelId: string;
  texts: string[];
  dimensions: number;
  signal: AbortSignal;
}

export interface EmbeddingResponse {
  vectors: number[][];
  tokensIn: number;
}

export interface ModelProvider {
  readonly kind: "openrouter" | "fake";
  complete(req: CompletionRequest): Promise<CompletionResponse>;
  embed(req: EmbeddingRequest): Promise<EmbeddingResponse>;
}

/** Falha do provedor já classificada (o `callAgent` também classifica erros desconhecidos). */
export class ProviderError extends Error {
  constructor(
    readonly kind: "timeout" | "provider" | "schema",
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
