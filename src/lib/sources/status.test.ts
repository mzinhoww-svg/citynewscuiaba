import { err } from "@/lib/result";
import { afterFetch, requiresApproval, transition } from "./status";
import type { SourceState } from "./types";

const NOW = new Date("2026-09-27T14:00:00Z");

function st(status: SourceState["status"], overrides: Partial<SourceState> = {}): SourceState {
  return { status, statusReason: null, consecutiveFailures: 0, archivedAt: null, ...overrides };
}

describe("transition", () => {
  it("arquivar exige pausa antes", () => {
    expect(transition(st("active"), { type: "archive", reason: "duplicada" }, NOW)).toEqual(
      err("must_pause_first"),
    );
  });

  it("bloquear sem motivo falha", () => {
    expect(transition(st("active"), { type: "block", reason: "" as never }, NOW)).toEqual(
      err("reason_required"),
    );
  });

  it("bloquear uma fonte já bloqueada é no-op, igual ao banco", () => {
    expect(transition(st("blocked"), { type: "block", reason: "legal" }, NOW)).toEqual({
      ok: true,
      value: {},
    });
  });

  it("desbloquear exige aprovação; pausar não", () => {
    expect(requiresApproval({ type: "unblock" })).toBe(true);
    expect(requiresApproval({ type: "pause" })).toBe(false);
  });

  it("qualquer ação numa fonte arquivada falha, menos restaurar", () => {
    const archived = st("paused", { archivedAt: "2026-09-27T00:00:00.000Z" });
    expect(transition(archived, { type: "activate" }, NOW)).toEqual(err("archived"));
    expect(transition(archived, { type: "restore" }, NOW).ok).toBe(true);
  });

  it("ativar só a partir de pausada", () => {
    expect(transition(st("active"), { type: "activate" }, NOW)).toEqual(err("invalid_transition"));
    const result = transition(st("paused"), { type: "activate" }, NOW);
    expect(result).toEqual({
      ok: true,
      value: { status: "active", statusReason: null, consecutiveFailures: 0 },
    });
  });

  it("desbloquear volta para pausada", () => {
    expect(transition(st("blocked"), { type: "unblock" }, NOW)).toEqual({
      ok: true,
      value: { status: "paused", statusReason: "manual" },
    });
  });

  it("arquivar grava archivedAt = now (pura: now vem de fora, nunca de Date.now())", () => {
    expect(transition(st("paused"), { type: "archive", reason: "duplicada" }, NOW)).toEqual({
      ok: true,
      value: { archivedAt: "2026-09-27T14:00:00.000Z" },
    });
  });

  it("restaurar sempre volta para paused/manual, nunca para o status anterior", () => {
    const archivedFromBlocked = st("blocked", { archivedAt: "2026-09-27T00:00:00.000Z" });
    expect(transition(archivedFromBlocked, { type: "restore" }, NOW)).toEqual({
      ok: true,
      value: { archivedAt: null, status: "paused", statusReason: "manual" },
    });
  });
});

describe("afterFetch", () => {
  it("3 falhas seguidas pausam; a 1ª e a 2ª deixam degraded", () => {
    let s = st("active");
    s = { ...s, ...afterFetch(s, "failed") };
    expect(s.status).toBe("degraded");
    s = { ...s, ...afterFetch(s, "failed") };
    expect(s.status).toBe("degraded");
    s = { ...s, ...afterFetch(s, "failed") };
    expect(s).toMatchObject({
      status: "paused",
      statusReason: "auto_failures",
      consecutiveFailures: 3,
    });
  });

  it("sucesso zera e volta a active; limite próprio e 304 não contam", () => {
    expect(afterFetch({ ...st("degraded"), consecutiveFailures: 2 }, "ok")).toMatchObject({
      status: "active",
      consecutiveFailures: 0,
    });
    expect(afterFetch({ ...st("active"), consecutiveFailures: 1 }, "rate_limited")).toBeNull();
    expect(afterFetch({ ...st("active"), consecutiveFailures: 1 }, "not_modified")).toBeNull();
  });
});
