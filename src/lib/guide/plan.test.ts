import { describe, expect, it } from "vitest";
import { CATEGORIES } from "./categories";
import { allTargets, pickTargets, targetKey } from "./plan";

describe("plano da coleta", () => {
  it("todas as categorias, mais as cozinhas dos modelos, sem repetir", () => {
    const t = allTargets([
      { category: "restaurante", subcategory: "italiana" },
      { category: "restaurante", subcategory: "italiana" },
      { category: "padaria", subcategory: null },
    ]);
    expect(t).toHaveLength(CATEGORIES.length + 1);
    expect(t.filter((x) => x.subcategory === "italiana")).toHaveLength(1);
  });

  it("escolhe os mais antigos, os nunca sincronizados primeiro", () => {
    const targets = [
      { category: "padaria", subcategory: null },
      { category: "bar", subcategory: null },
      { category: "hotel", subcategory: null },
    ];
    const last = new Map([
      [targetKey(targets[0]!), "2026-10-01T00:00:00Z"],
      [targetKey(targets[1]!), "2026-09-20T00:00:00Z"],
    ]);
    expect(pickTargets(targets, last, 2).map((t) => t.category)).toEqual(["hotel", "bar"]);
    expect(pickTargets(targets, last, 0)).toEqual([]);
    expect(pickTargets(targets, last, 99)).toHaveLength(3);
  });

  it("uma volta completa em semana: 2 por dia cobrem as 12 categorias em 6 dias", () => {
    const targets = allTargets([]);
    const last = new Map<string, string>();
    const seen = new Set<string>();
    for (let day = 0; day < 6; day += 1) {
      for (const t of pickTargets(targets, last, 2)) {
        seen.add(targetKey(t));
        last.set(targetKey(t), `2026-10-0${day + 1}T00:00:00Z`);
      }
    }
    expect(seen.size).toBe(targets.length);
  });
});
