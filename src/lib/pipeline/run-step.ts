import { err, ok, type Result } from "@/lib/result";
import type { PipelineMessage, StepName } from "./types";

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
export type StepHandler = (msg: PipelineMessage) => Promise<StepResult>;
export type StepHandlers = Partial<Record<StepName, StepHandler>>;
export type RunStep = (msg: PipelineMessage) => Promise<StepResult>;

/** Próxima etapa do mesmo run. */
export function nextMessage(
  msg: PipelineMessage,
  step: StepName,
  itemRef: string,
): PipelineMessage {
  return { runId: msg.runId, step, itemRef, attempt: 1 };
}

/**
 * Executa a etapa da mensagem e devolve as próximas mensagens. Exceção inesperada vira erro
 * transitório (nova tentativa com espera); nunca derruba o worker.
 */
export function createRunStep(handlers: StepHandlers): RunStep {
  return async (msg) => {
    const handler = handlers[msg.step];
    if (!handler) return err(stepError.noHandler(`etapa ${msg.step} sem implementação`));
    try {
      const r = await handler(msg);
      return r.ok ? ok(r.value) : r;
    } catch (e) {
      return err(stepError.transient(e instanceof Error ? e.message : String(e)));
    }
  };
}
