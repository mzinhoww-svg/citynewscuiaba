import { describe, expect, it } from "vitest";
import { canRequestUrgent, canSeeAllPushes, hasAnyPushAction, pushKindsFor } from "./permissions";

describe("permissões do push", () => {
  it("editor só Destaque da própria editoria", () => {
    expect(pushKindsFor([{ role: "editor", sections: ["cidade"] }], "cidade")).toEqual([
      "highlight",
    ]);
    expect(pushKindsFor([{ role: "editor", sections: ["cidade"] }], "esportes")).toEqual([]);
    expect(pushKindsFor([{ role: "editor", sections: ["cidade"] }])).toEqual(["highlight"]);
    expect(pushKindsFor([{ role: "editor_chefe", sections: [] }], "esportes")).toEqual([
      "urgent",
      "highlight",
    ]);
    expect(pushKindsFor([{ role: "admin", sections: [] }])).toEqual(["urgent", "highlight"]);
    expect(pushKindsFor([{ role: "analista", sections: [] }])).toEqual([]);
  });
  it("urgente, visão total e item de menu", () => {
    expect(canRequestUrgent([{ role: "editor", sections: ["cidade"] }])).toBe(false);
    expect(canRequestUrgent([{ role: "editor_chefe", sections: [] }])).toBe(true);
    expect(canSeeAllPushes([{ role: "editor", sections: ["cidade"] }])).toBe(false);
    expect(canSeeAllPushes([{ role: "admin", sections: [] }])).toBe(true);
    expect(hasAnyPushAction([{ role: "analista", sections: [] }])).toBe(true);
    expect(hasAnyPushAction([{ role: "jornalista", sections: [] }])).toBe(false);
    expect(hasAnyPushAction([{ role: "editor", sections: ["cidade"] }])).toBe(true);
  });
});
