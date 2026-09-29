import type { SourceDetail } from "@/lib/db/queries/sources-admin";
import { statusLine } from "./detail";

const base = {
  archivedAt: null,
  archiveReason: null,
  status: "paused",
  statusReason: "manual",
  statusChangedAt: "2026-09-27T17:30:00Z",
  statusChangedBy: { id: "u1", name: "Helena Costa" },
  consecutiveFailures: 0,
} as unknown as SourceDetail;

const d = (over: Partial<SourceDetail>) => ({ ...base, ...over }) as SourceDetail;

describe("statusLine (spec §8: status com motivo em texto)", () => {
  it("ativa", () => {
    expect(statusLine(d({ status: "active" }))).toBe("Ativa");
  });

  it("pausada automaticamente após 3 falhas, com data e hora", () => {
    expect(statusLine(d({ statusReason: "auto_failures", consecutiveFailures: 3 }))).toBe(
      "Pausada automaticamente em 27/09, 13:30 após 3 falhas",
    );
  });

  it("pausada manualmente cita quem pausou", () => {
    expect(statusLine(d({}))).toContain("Helena Costa");
  });

  it("arquivada vence qualquer status", () => {
    const line = statusLine(
      d({ status: "active", archivedAt: "2026-09-28T12:00:00Z", archiveReason: "Sem uso" }),
    );
    expect(line).toMatch(/Arquivada/i);
    expect(line).toContain("Sem uso");
  });

  it("degradada informa as falhas seguidas", () => {
    expect(statusLine(d({ status: "degraded", consecutiveFailures: 2 }))).toContain("2");
  });
});
