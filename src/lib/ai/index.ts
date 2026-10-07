/**
 * Camada de IA (ADR-005). Este índice só expõe código sem segredo nem banco; a instância de
 * produção fica em `@/lib/ai/server` (server-only).
 */
export {
  createCallAgent,
  createEmbedder,
  parseModelJson,
  SYSTEM_GUARD,
  type AgentInput,
  type AiDeps,
  type CallAgent,
  type Embedder,
} from "./call-agent";
export { embeddingDim } from "./config";
export { dayStartCuiaba, GLOBAL_DAILY_BUDGET_BRL, resolveProviderKind } from "./registry";
export * from "./schemas";
export * from "./types";
