import { err, ok, type Result } from "@/lib/result";
import type { JobStep, PipelineMessage } from "./types";

export type StepErrorKind =
  | "transient" // rede, banco, provedor: nova tentativa
  | "invalid" // entrada inválida: quarentena
  | "injection" // instrução embutida em texto externo: quarentena + alerta de segurança
  | "not_found" // referência sumiu: quarentena
  | "no_handler"; // etapa ainda sem implementação: quarentena (reprocessável)

export interface StepError {
  kind: StepErrorKind;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
  /** Espera mínima até a nova tentativa (ex.: limite por hora); o drain usa o maior valor. */
  retryAfterSec?: number;
}

const make =
  (kind: StepErrorKind, retryable: boolean) =>
  (message: string, details?: Record<string, unknown>): StepError => ({
    kind,
    message,
    retryable,
    ...(details ? { details } : {}),
  });

export const stepError = {
  transient: make("transient", true),
  invalid: make("invalid", false),
  injection: make("injection", false),
  notFound: make("not_found", false),
  noHandler: make("no_handler", false),
};

export type StepResult = Result<PipelineMessage[], StepError>;

/** Contexto de execução: o prazo do drain (as chamadas de rede e IA usam o menor tempo). */
export interface StepContext {
  signal?: AbortSignal;
  /**
   * Detalhes do resultado que entram no evento `ok` em `pipeline_events` (ex.: por que o `enrich`
   * não guardou o texto). Sem isso, um desvio silencioso não deixa rastro em produção.
   */
  note?: (details: Record<string, unknown>) => void;
}

export type StepHandler = (msg: PipelineMessage, ctx?: StepContext) => Promise<StepResult>;
export type StepHandlers = Partial<Record<JobStep, StepHandler>>;
export type RunStep = (msg: PipelineMessage, ctx?: StepContext) => Promise<StepResult>;

/** Próxima etapa do mesmo run. */
export function nextMessage(msg: PipelineMessage, step: JobStep, itemRef: string): PipelineMessage {
  return { runId: msg.runId, step, itemRef, attempt: 1 };
}

/**
 * Executa a etapa da mensagem e devolve as próximas mensagens. Exceção inesperada vira erro
 * transitório (nova tentativa com espera); nunca derruba o worker.
 */
export function createRunStep(handlers: StepHandlers): RunStep {
  return async (msg, ctx) => {
    const handler = handlers[msg.step];
    if (!handler) return err(stepError.noHandler(`etapa ${msg.step} sem implementação`));
    try {
      const r = await handler(msg, ctx);
      return r.ok ? ok(r.value) : r;
    } catch (e) {
      return err(stepError.transient(e instanceof Error ? e.message : String(e)));
    }
  };
}
