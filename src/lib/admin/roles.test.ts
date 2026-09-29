import { describe, expect, it } from "vitest";
import { planRoleChange } from "./roles";

describe("plano de papéis (A03)", () => {
  it("separa conceder, revogar e atualizar editorias; admin vira pedido", () => {
    const plan = planRoleChange(
      [
        { role: "editor", sections: ["cidade"] },
        { role: "revisor", sections: [] },
      ],
      [
        { role: "editor", sections: ["cidade", "clima"] },
        { role: "moderador", sections: [] },
        { role: "admin", sections: [] },
      ],
    );
    expect(plan).toEqual({
      grant: [{ role: "moderador", sections: [] }],
      revoke: ["revisor"],
      update: [{ role: "editor", sections: ["cidade", "clima"] }],
      adminRequested: true,
    });
  });

  it("sem mudança não planeja nada; admin já concedido não pede de novo", () => {
    const same = [{ role: "admin" as const, sections: [] }];
    expect(planRoleChange(same, same)).toEqual({
      grant: [],
      revoke: [],
      update: [],
      adminRequested: false,
    });
  });
});
