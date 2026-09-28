/**
 * Ciclo de vida da fonte (spec §7.3, D-F18, D-F19). As transições espelham `guard_source_changes`
 * em `supabase/migrations/0011_source_admin.sql`: paused→{active,blocked}; active→{degraded,paused,
 * blocked}; degraded→{active,paused,blocked}; blocked→{paused}. `archivedAt` é ortogonal ao status
 * (arquivar exige `paused`/`blocked`; restaurar volta para o status que já tinha).
 */
import { err, ok, type Result } from "@/lib/result";
import type { SourceState, StatusReason } from "./types";

export type SourceAction =
  | { type: "activate" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "block"; reason: StatusReason }
  | { type: "unblock" }
  | { type: "archive"; reason: string }
  | { type: "restore" };

export type TransitionError =
  "invalid_transition" | "must_pause_first" | "reason_required" | "archived";

/** `true` para a única ação desta lista que amplia autonomia (D-F3): desbloquear. */
export function requiresApproval(action: SourceAction): boolean {
  return action.type === "unblock";
}

export function transition(
  state: SourceState,
  action: SourceAction,
): Result<Partial<SourceState>, TransitionError> {
  if (state.archivedAt !== null && action.type !== "restore") {
    return err("archived");
  }

  switch (action.type) {
    case "activate":
    case "resume": {
      if (state.status !== "paused") return err("invalid_transition");
      return ok({ status: "active", statusReason: null, consecutiveFailures: 0 });
    }

    case "pause": {
      if (state.status !== "active" && state.status !== "degraded")
        return err("invalid_transition");
      return ok({ status: "paused", statusReason: "manual" });
    }

    case "block": {
      if (state.status === "blocked") return err("invalid_transition");
      if (!action.reason) return err("reason_required");
      return ok({ status: "blocked", statusReason: action.reason });
    }

    case "unblock": {
      if (state.status !== "blocked") return err("invalid_transition");
      return ok({ status: "paused", statusReason: "manual" });
    }

    case "archive": {
      if (state.status !== "paused" && state.status !== "blocked") return err("must_pause_first");
      if (!action.reason) return err("reason_required");
      return ok({ archivedAt: new Date().toISOString() });
    }

    case "restore": {
      if (state.archivedAt === null) return err("invalid_transition");
      return ok({ archivedAt: null });
    }
  }
}

export type FetchOutcome = "ok" | "not_modified" | "failed" | "rate_limited";

/**
 * Pausa automática (D-F18): 1ª e 2ª falha seguida → `degraded` (continua coletando), 3ª →
 * `paused` com `auto_failures`; sucesso zera. `not_modified` e `rate_limited` não contam.
 */
export function afterFetch(state: SourceState, outcome: FetchOutcome): Partial<SourceState> | null {
  if (outcome === "ok") {
    return { status: "active", statusReason: null, consecutiveFailures: 0 };
  }
  if (outcome === "not_modified" || outcome === "rate_limited") {
    return null;
  }
  const consecutiveFailures = state.consecutiveFailures + 1;
  if (consecutiveFailures >= 3) {
    return { status: "paused", statusReason: "auto_failures", consecutiveFailures };
  }
  return { status: "degraded", consecutiveFailures };
}
