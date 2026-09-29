import { err, ok, type Result } from "@/lib/result";
import type { SourceState, StatusReason } from "./types";

export type SourceAction =
  | { type: "activate" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "block"; reason: string; code?: StatusReason }
  | { type: "unblock" }
  | { type: "archive"; reason: string }
  | { type: "restore" };

export type TransitionError =
  "invalid_transition" | "must_pause_first" | "reason_required" | "archived";

export const AUTO_PAUSE_FAILURES = 3;

/** Transição de estado (spec §7.3). Devolve só o que muda. A checagem de robots/teste/termos é do chamador. */
export function transition(
  state: SourceState,
  action: SourceAction,
  now: Date = new Date(),
): Result<Partial<SourceState>, TransitionError> {
  if (state.archivedAt) {
    if (action.type !== "restore") return err("archived");
    return ok({ archivedAt: null, status: "paused", statusReason: "manual" });
  }
  const running = state.status === "active" || state.status === "degraded";
  switch (action.type) {
    case "activate":
    case "resume":
      if (state.status !== "paused") return err("invalid_transition");
      return ok({ status: "active", statusReason: null, consecutiveFailures: 0 });
    case "pause":
      return running ? ok({ status: "paused", statusReason: "manual" }) : err("invalid_transition");
    case "block":
      if (state.status === "blocked") return err("invalid_transition");
      if (!action.reason.trim()) return err("reason_required");
      return ok({ status: "blocked", statusReason: action.code ?? "other" });
    case "unblock":
      return state.status === "blocked"
        ? ok({ status: "paused", statusReason: "manual" })
        : err("invalid_transition");
    case "archive":
      if (state.status !== "paused" && state.status !== "blocked") return err("must_pause_first");
      if (!action.reason.trim()) return err("reason_required");
      return ok({ archivedAt: now.toISOString() });
    case "restore":
      return err("invalid_transition");
  }
}

/** Só desbloquear exige segunda pessoa (D-F3). */
export function requiresApproval(action: SourceAction): boolean {
  return action.type === "unblock";
}

/**
 * Efeito de uma coleta (D-F18). 1ª e 2ª falha seguidas: degraded; 3ª: pausa automática. Sucesso e 304
 * zeram; limite próprio (`rate_limited`) não conta. Fonte parada ou arquivada não muda. `null` = nada muda.
 */
export function afterFetch(
  state: SourceState,
  outcome: "ok" | "not_modified" | "failed" | "rate_limited",
): Partial<SourceState> | null {
  if (state.archivedAt) return null;
  if (state.status !== "active" && state.status !== "degraded") return null;
  if (outcome === "rate_limited") return null;
  if (outcome === "failed") {
    const n = state.consecutiveFailures + 1;
    return n >= AUTO_PAUSE_FAILURES
      ? { status: "paused", statusReason: "auto_failures", consecutiveFailures: n }
      : { status: "degraded", consecutiveFailures: n };
  }
  if (state.status === "active" && state.consecutiveFailures === 0) return null;
  return { status: "active", statusReason: null, consecutiveFailures: 0 };
}
