// release-backlog (AUT-T8): partes puras do script. O fluxo com banco fica em
// tests/integration/release-backlog.test.ts.
import { describe, expect, it } from "vitest";
import {
  applyGuard,
  breakerBlock,
  hourlyReport,
  nextWindowAt,
  parseArgs,
  roomFor,
  rulesAreV3,
  summarizeReasons,
} from "./release-backlog.mjs";

const limits = { hourly: 60, daily: 800, reportsPerHour: 10, aiFailuresPerHour: 15 };
const calm = {
  publishedLastHour: 0,
  publishedToday: 0,
  reportsLastHour: 0,
  aiCallsLastHour: 0,
  aiFailuresLastHour: 0,
};

describe("release-backlog: argumentos", () => {
  it("ensaio é o padrão; lote de 50", () => {
    expect(parseArgs([])).toMatchObject({ apply: false, batch: 50, wait: false });
  });
  it("--apply é explícito e não convive com --dry-run", () => {
    expect(parseArgs(["--apply"]).apply).toBe(true);
    expect(parseArgs(["--dry-run"]).apply).toBe(false);
    expect(() => parseArgs(["--apply", "--dry-run"])).toThrow(/não combinam/);
  });
  it("opção desconhecida ou valor inválido é erro (nada de digitação virar escrita)", () => {
    expect(() => parseArgs(["--aplly"])).toThrow(/desconhecida/);
    expect(() => parseArgs(["--batch=0"])).toThrow(/batch/);
    expect(() => parseArgs(["--batch=500"])).toThrow(/batch/);
    expect(parseArgs(["--batch=20", "--max-batches=2", "--max-age-days=7"])).toMatchObject({
      batch: 20,
      maxBatches: 2,
      maxAgeDays: 7,
    });
  });
});

describe("release-backlog: trava de banco", () => {
  const apply = parseArgs(["--apply"]);
  it("ensaio nunca é barrado; apply local passa", () => {
    expect(applyGuard("https://abc.supabase.co", parseArgs([]))).toBeNull();
    expect(applyGuard("http://127.0.0.1:54321", apply)).toBeNull();
    expect(applyGuard("http://localhost:54321", apply)).toBeNull();
  });
  it("apply fora do local exige --confirm-host igual ao host", () => {
    expect(applyGuard("https://abc.supabase.co", apply)).toMatch(/--confirm-host=abc\.supabase\.co/);
    expect(
      applyGuard("https://abc.supabase.co", parseArgs(["--apply", "--confirm-host=outro.co"])),
    ).toMatch(/exige/);
    expect(
      applyGuard("https://abc.supabase.co", parseArgs(["--apply", "--confirm-host=abc.supabase.co"])),
    ).toBeNull();
  });
});

describe("release-backlog: disjuntor", () => {
  it("vaga = menor entre o lote e o que resta na hora e no dia", () => {
    expect(roomFor({ batch: 50, counts: calm, limits })).toBe(50);
    expect(roomFor({ batch: 50, counts: { ...calm, publishedLastHour: 50 }, limits })).toBe(10);
    expect(roomFor({ batch: 50, counts: { ...calm, publishedLastHour: 60 }, limits })).toBe(0);
    expect(roomFor({ batch: 50, counts: { ...calm, publishedToday: 790 }, limits })).toBe(10);
    expect(roomFor({ batch: 50, counts: { ...calm, publishedToday: 900 }, limits })).toBe(0);
  });

  it("aberto, denúncias e falha de IA param; calmo segue", () => {
    expect(breakerBlock(calm, limits, null)).toBeNull();
    expect(breakerBlock(calm, limits, "2026-10-03T10:00:00Z")).toBe("tripped");
    expect(breakerBlock({ ...calm, reportsLastHour: 10 }, limits, null)).toBe("reports");
    expect(
      breakerBlock({ ...calm, aiCallsLastHour: 20, aiFailuresLastHour: 16 }, limits, null),
    ).toBe("ai_failures");
    expect(
      breakerBlock({ ...calm, aiCallsLastHour: 100, aiFailuresLastHour: 16 }, limits, null),
    ).toBeNull();
  });

  it("a próxima janela abre quando a publicação mais antiga completa 1 h", () => {
    const t = (min: number) => new Date(Date.UTC(2026, 9, 3, 12, min)).toISOString();
    expect(nextWindowAt([t(0), t(10)], 60, 1)).toBeNull();
    const full = Array.from({ length: 60 }, (_, i) => t(i % 50));
    // 60 na janela e teto 60: a vaga abre 1 h depois da mais antiga (12:00).
    expect(nextWindowAt(full, 60, 1)?.toISOString()).toBe("2026-10-03T13:00:00.000Z");
    // Para 10 vagas, as 10 mais antigas precisam sair.
    expect(nextWindowAt(full, 60, 10)?.toISOString()).toBe(
      new Date(Date.parse(full.map((s) => s).sort()[9]!) + 3_600_000).toISOString(),
    );
  });
});

describe("release-backlog: relatório", () => {
  it("publicadas por hora no fuso de Cuiabá, com horas vazias", () => {
    const now = new Date("2026-10-03T18:30:00Z"); // 14:30 em Cuiabá
    const rows = hourlyReport(
      [
        "2026-10-03T18:05:00Z",
        "2026-10-03T18:45:00Z",
        "2026-10-03T17:10:00Z",
        "2026-10-02T10:00:00Z", // fora das 24 h
      ],
      now,
    );
    expect(rows).toHaveLength(24);
    expect(rows.at(-1)).toEqual({ hour: "03/10 14h", count: 2 });
    expect(rows.at(-2)).toEqual({ hour: "03/10 13h", count: 1 });
    expect(rows.reduce((s: number, r: { count: number }) => s + r.count, 0)).toBe(3);
  });

  it("motivos agrupados e v3 reconhecida pelo corpo", () => {
    expect(summarizeReasons(["a", "a", null, "b", "a"])).toEqual([
      { reason: "a", count: 3 },
      { reason: "(sem motivo)", count: 1 },
      { reason: "b", count: 1 },
    ]);
    expect(
      rulesAreV3({ neverAuto: [], breakingReview: false, sensitiveFlagReview: false }),
    ).toBe(true);
    expect(rulesAreV3({ neverAuto: [] })).toBe(false);
    expect(
      rulesAreV3({ neverAuto: ["seguranca"], breakingReview: true, sensitiveFlagReview: true }),
    ).toBe(false);
    expect(rulesAreV3({ forceReview: false })).toBe(false);
    expect(rulesAreV3(null)).toBe(false);
  });
});
