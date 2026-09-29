import { describe, expect, it } from "vitest";
import { scoreBreakdown } from "./breakdown";
import { compareToControl, variantMetrics, type ReaderSourceRow } from "./experiment-metrics";
import { assignVariant } from "./experiments";
import { REC_V1, scoreSource } from "./score";
import type { SourceSignals } from "./types";

const exp = { id: "teste-x", split: [0.5, 0.5] };

function row(i: number, patch: Partial<ReaderSourceRow> = {}): ReaderSourceRow {
  return {
    anonId: `anon-${i}`,
    sourceSlug: i % 2 === 0 ? "folha-do-cerrado" : "mt-agora",
    viewed: 10,
    clicked: 2,
    dismissed: 0,
    firstAt: "2026-09-20T10:00:00Z",
    lastAt: "2026-09-20T10:30:00Z",
    ...patch,
  };
}

describe("variantMetrics", () => {
  it("soma por variante segundo o mesmo sorteio do portal", () => {
    const rows = Array.from({ length: 400 }, (_, i) => row(i));
    const m = variantMetrics(rows, exp);
    expect(m).toHaveLength(2);
    expect(m[0]!.readers + m[1]!.readers).toBe(400);
    const expected0 = rows.filter((r) => assignVariant(r.anonId, exp) === 0).length;
    expect(m[0]!.readers).toBe(expected0);
    expect(m[0]!.ctr).toBeCloseTo(0.2, 10);
  });
  it("retorno: só quem tem eventos com 24 h ou mais de distância", () => {
    const rows = [
      row(1, { lastAt: "2026-09-22T10:00:00Z" }),
      row(1, { sourceSlug: "outra", lastAt: "2026-09-20T11:00:00Z" }),
      row(2),
    ];
    const m = variantMetrics(rows, { id: "e", split: [0.5, 0.5] });
    const total = m.reduce((a, x) => a + x.returnRate * x.readers, 0);
    expect(Math.round(total)).toBe(1);
  });
  it("sem linhas ou divisão inválida não quebra", () => {
    expect(variantMetrics([], exp).every((m) => m.readers === 0 && m.ctr === 0)).toBe(true);
    expect(variantMetrics([row(1)], { id: "e", split: [0.9] })).toEqual([]);
  });
  it("compara com o controle e marca significância", () => {
    const control = { n: 3000, x: 300 };
    const rows: ReaderSourceRow[] = [];
    // Leitores fabricados por variante para controlar viewed/clicked.
    let i = 0;
    const push = (variant: number, viewed: number, clicked: number) => {
      while (assignVariant(`anon-${i}`, exp) !== variant) i++;
      rows.push(row(i, { viewed, clicked }));
      i++;
    };
    push(0, control.n, control.x);
    push(1, 3000, 450);
    const [cmp] = compareToControl(variantMetrics(rows, exp));
    expect(cmp!.significant).toBe(true);
    expect(cmp!.lift).toBeCloseTo(0.5, 5);
  });
});

describe("scoreBreakdown", () => {
  const s: SourceSignals = {
    slug: "a",
    locality: "cuiaba",
    popularity: 0.8,
    individual: 0.9,
    recency: 0.5,
    engagement: 0.4,
    operational: 1,
    diversity: 0.2,
    trend: 0.1,
    followed: false,
    pinned: false,
    excluded: false,
    blocked: false,
    isNewForUser: false,
    localHighlight: false,
    verified: true,
  };
  it("a soma das contribuições é o score", () => {
    for (const p of [true, false]) {
      const b = scoreBreakdown(s, REC_V1, p);
      expect(b.total).toBeCloseTo(scoreSource(s, REC_V1, p), 10);
    }
  });
  it("sem Personalização o componente individual pesa 0 e some", () => {
    const b = scoreBreakdown(s, REC_V1, false);
    const ind = b.components.find((c) => c.key === "individual")!;
    expect(ind.weight).toBe(0);
    expect(ind.value).toBe(0);
    expect(b.components.reduce((a, c) => a + c.weight, 0)).toBeCloseTo(1, 10);
  });
});
