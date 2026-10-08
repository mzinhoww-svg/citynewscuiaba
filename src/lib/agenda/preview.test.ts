import { describe, expect, it } from "vitest";
import type { CollectReport, SourceReport } from "./collect";
import {
  PREVIEW_AI_CALLS,
  PREVIEW_MAX_EVENTS,
  previewActivationProblem,
  previewFromReport,
} from "./preview";

const SRC = { id: "teatro", uuid: "f1000000-0000-4000-8000-000000000006" };

function sourceReport(over: Partial<SourceReport> = {}): SourceReport {
  return {
    id: SRC.id,
    uuid: SRC.uuid,
    name: "Teatro",
    status: "ok",
    found: 3,
    approved: 2,
    rejected: { sem_ano: 1 },
    aiPages: 4,
    confirmed: 0,
    new: 2,
    updated: 0,
    rejectedSamples: [{ url: "https://teatro.example/evento/sarau", reason: "sem_ano" }],
    images: 0,
    imageSkipped: {},
    ...over,
  };
}

const item = (n: number, sourceId = SRC.id) => ({
  title: `Evento ${n}`,
  startsAt: `2026-10-${String(10 + n).padStart(2, "0")}T23:00:00.000Z`,
  venue: "Teatro",
  sourceUrl: `https://teatro.example/evento/${n}`,
  sourceId,
  evidence: { data: { trecho: `${10 + n} de outubro de 2026`, ano: "corpo" as const } },
});

function report(over: Partial<CollectReport> = {}, src = sourceReport()): CollectReport {
  return {
    startedAt: "2026-10-08T12:00:00.000Z",
    sources: [src],
    found: src.found,
    approved: src.approved,
    duplicates: 0,
    saved: 0,
    aiPages: src.aiPages,
    dryRun: true,
    preview: [item(1), item(2)],
    ...over,
  };
}

describe("previewFromReport", () => {
  it("traz eventos com evidência e recusas com motivo da fonte pedida", () => {
    const p = previewFromReport(report(), SRC);
    expect(p).toMatchObject({ status: "ok", detail: null, found: 3, approved: 2, aiPages: 4 });
    expect(p.events.map((e) => e.title)).toEqual(["Evento 1", "Evento 2"]);
    expect(p.events[0]!.evidence.data?.trecho).toBe("11 de outubro de 2026");
    expect(p.events[0]).not.toHaveProperty("sourceId");
    expect(p.rejected).toEqual([{ url: "https://teatro.example/evento/sarau", reason: "sem_ano" }]);
  });

  it("mostra no máximo 5 eventos e ignora itens de outra fonte", () => {
    const many = [1, 2, 3, 4, 5, 6, 7].map((n) => item(n));
    const p = previewFromReport(report({ preview: [item(9, "outra"), ...many] }), SRC);
    expect(PREVIEW_MAX_EVENTS).toBe(5);
    expect(p.events).toHaveLength(5);
    expect(p.events.map((e) => e.title)).not.toContain("Evento 9");
  });

  it("fonte ausente do relatório: erro, sem eventos", () => {
    const p = previewFromReport(report({ sources: [], preview: [] }), SRC);
    expect(p).toMatchObject({ status: "erro", events: [], rejected: [] });
  });

  it("orçamento da prévia: 1 listagem + 5 páginas", () => {
    expect(PREVIEW_AI_CALLS).toBe(6);
  });
});

describe("previewActivationProblem", () => {
  it("sem problema com fonte ok e ao menos 1 evento aprovado", () => {
    expect(previewActivationProblem(previewFromReport(report(), SRC))).toBeNull();
  });

  it("robots bloqueando, fonte fora do ar, erro ou prévia adiada impedem a ativação", () => {
    const cases: [SourceReport["status"], string][] = [
      ["robots", "robots"],
      ["indisponivel", "unavailable"],
      ["erro", "error"],
      ["ia_adiada", "deferred"],
      ["adiada", "deferred"],
    ];
    for (const [status, code] of cases) {
      const p = previewFromReport(
        report({ preview: [] }, sourceReport({ status, detail: "x", approved: 0 })),
        SRC,
      );
      expect(previewActivationProblem(p)).toEqual({ code, detail: "x" });
    }
  });

  it("nenhum evento aprovado impede a ativação", () => {
    const p = previewFromReport(report({ preview: [] }, sourceReport({ approved: 0 })), SRC);
    expect(previewActivationProblem(p)).toEqual({ code: "no_events", detail: null });
  });
});
