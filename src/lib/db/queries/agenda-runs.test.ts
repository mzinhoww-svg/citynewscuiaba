import { describe, expect, it } from "vitest";
import { rejectionsFromRuns, runFromRow } from "./agenda-runs";

const row = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  started_at: "2026-10-08T12:00:00.000Z",
  finished_at: "2026-10-08T12:00:20.000Z",
  trigger: "cron",
  ai_pages: 4,
  stats: {
    status: "ok",
    found: 3,
    approved: 2,
    rejected: { sem_ano: 1, data_passada: 2 },
    confirmed: 1,
    new: 2,
    updated: 0,
    rejectedSamples: [{ url: "https://teatro.example/evento/sarau", reason: "sem_ano" }],
  },
  ...over,
});

describe("runFromRow", () => {
  it("lê o resumo da execução da fonte", () => {
    expect(runFromRow(row())).toEqual({
      id: "r1",
      startedAt: "2026-10-08T12:00:00.000Z",
      finishedAt: "2026-10-08T12:00:20.000Z",
      trigger: "cron",
      status: "ok",
      detail: null,
      found: 3,
      approved: 2,
      rejected: 3,
      confirmed: 1,
      created: 2,
      updated: 0,
      aiPages: 4,
    });
  });

  it("stats ilegível não derruba a leitura: zeros e situação desconhecida", () => {
    expect(runFromRow(row({ stats: "lixo", trigger: "manual" }))).toMatchObject({
      trigger: "manual",
      status: null,
      found: 0,
      rejected: 0,
    });
  });
});

describe("rejectionsFromRuns", () => {
  it("junta as amostras das execuções, mais recentes primeiro, sem repetir url e motivo", () => {
    const out = rejectionsFromRuns([
      row({ id: "r2", started_at: "2026-10-08T18:00:00.000Z" }),
      row({
        id: "r1",
        stats: {
          rejectedSamples: [
            { url: "https://teatro.example/evento/sarau", reason: "sem_ano" },
            { url: "https://teatro.example/evento/velho", reason: "data_passada" },
            { url: "https://teatro.example/x", reason: "motivo_inventado" },
          ],
        },
      }),
    ]);
    expect(out).toEqual([
      {
        url: "https://teatro.example/evento/sarau",
        reason: "sem_ano",
        at: "2026-10-08T18:00:00.000Z",
      },
      {
        url: "https://teatro.example/evento/velho",
        reason: "data_passada",
        at: "2026-10-08T12:00:00.000Z",
      },
    ]);
  });
});
