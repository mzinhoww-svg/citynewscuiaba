import { err, ok } from "@/lib/result";
import { afterFetch, requiresApproval, transition } from "./status";
import type { SourceState } from "./types";

const st = (status: SourceState["status"], o: Partial<SourceState> = {}): SourceState => ({
  status,
  statusReason: null,
  consecutiveFailures: 0,
  archivedAt: null,
  ...o,
});
const NOW = new Date("2026-09-27T14:00:00Z");

describe("transições", () => {
  it("arquivar exige pausa antes", () =>
    expect(transition(st("active"), { type: "archive", reason: "duplicada" })).toEqual(
      err("must_pause_first"),
    ));
  it("arquivar pausada ou bloqueada, com motivo", () => {
    expect(transition(st("paused"), { type: "archive", reason: "duplicada" }, NOW)).toEqual(
      ok({ archivedAt: NOW.toISOString() }),
    );
    expect(transition(st("blocked"), { type: "archive", reason: "x" }, NOW).ok).toBe(true);
    expect(transition(st("paused"), { type: "archive", reason: " " })).toEqual(
      err("reason_required"),
    );
  });
  it("bloquear sem motivo falha", () =>
    expect(transition(st("active"), { type: "block", reason: "" })).toEqual(
      err("reason_required"),
    ));
  it("bloquear ativa, degradada ou pausada", () => {
    for (const s of ["active", "degraded", "paused"] as const)
      expect(transition(st(s), { type: "block", reason: "opt-out", code: "opt_out" })).toEqual(
        ok({ status: "blocked", statusReason: "opt_out" }),
      );
    expect(transition(st("blocked"), { type: "block", reason: "x" })).toEqual(
      err("invalid_transition"),
    );
  });
  it("desbloquear leva a paused e exige aprovação; pausar não", () => {
    expect(transition(st("blocked"), { type: "unblock" })).toEqual(
      ok({ status: "paused", statusReason: "manual" }),
    );
    expect(transition(st("active"), { type: "unblock" })).toEqual(err("invalid_transition"));
    expect(requiresApproval({ type: "unblock" })).toBe(true);
    for (const a of [
      { type: "pause" },
      { type: "activate" },
      { type: "resume" },
      { type: "restore" },
      { type: "block", reason: "x" },
      { type: "archive", reason: "x" },
    ] as const)
      expect(requiresApproval(a)).toBe(false);
  });
  it("pausar, ativar, retomar", () => {
    expect(transition(st("active"), { type: "pause" })).toEqual(
      ok({ status: "paused", statusReason: "manual" }),
    );
    expect(transition(st("degraded"), { type: "pause" }).ok).toBe(true);
    expect(transition(st("paused"), { type: "pause" })).toEqual(err("invalid_transition"));
    expect(
      transition(st("paused", { statusReason: "pending_activation" }), { type: "activate" }),
    ).toEqual(ok({ status: "active", statusReason: null, consecutiveFailures: 0 }));
    expect(
      transition(st("paused", { statusReason: "auto_failures", consecutiveFailures: 3 }), {
        type: "resume",
      }),
    ).toEqual(ok({ status: "active", statusReason: null, consecutiveFailures: 0 }));
    expect(transition(st("blocked"), { type: "activate" })).toEqual(err("invalid_transition"));
    expect(transition(st("active"), { type: "resume" })).toEqual(err("invalid_transition"));
  });
  it("arquivada só aceita restaurar, que volta a paused", () => {
    const a = st("paused", { archivedAt: NOW.toISOString() });
    expect(transition(a, { type: "activate" })).toEqual(err("archived"));
    expect(transition(a, { type: "pause" })).toEqual(err("archived"));
    expect(transition(a, { type: "restore" })).toEqual(
      ok({ archivedAt: null, status: "paused", statusReason: "manual" }),
    );
    expect(transition(st("paused"), { type: "restore" })).toEqual(err("invalid_transition"));
  });
});

describe("afterFetch", () => {
  it("3 falhas seguidas pausam; a 1ª e a 2ª deixam degraded", () => {
    let s = st("active");
    s = { ...s, ...afterFetch(s, "failed") };
    expect(s).toMatchObject({ status: "degraded", consecutiveFailures: 1 });
    s = { ...s, ...afterFetch(s, "failed") };
    expect(s).toMatchObject({ status: "degraded", consecutiveFailures: 2 });
    s = { ...s, ...afterFetch(s, "failed") };
    expect(s).toMatchObject({
      status: "paused",
      statusReason: "auto_failures",
      consecutiveFailures: 3,
    });
  });
  it("sucesso zera e volta a active; limite próprio não conta; 304 conta como sucesso", () => {
    expect(afterFetch(st("degraded", { consecutiveFailures: 2 }), "ok")).toMatchObject({
      status: "active",
      consecutiveFailures: 0,
    });
    expect(afterFetch(st("active", { consecutiveFailures: 1 }), "rate_limited")).toBeNull();
    expect(afterFetch(st("degraded", { consecutiveFailures: 1 }), "not_modified")).toMatchObject({
      status: "active",
      consecutiveFailures: 0,
    });
    expect(afterFetch(st("active"), "ok")).toBeNull();
  });
  it("fonte pausada, bloqueada ou arquivada não muda por coleta", () => {
    expect(afterFetch(st("paused"), "failed")).toBeNull();
    expect(afterFetch(st("blocked"), "ok")).toBeNull();
    expect(afterFetch(st("active", { archivedAt: NOW.toISOString() }), "failed")).toBeNull();
  });
});
