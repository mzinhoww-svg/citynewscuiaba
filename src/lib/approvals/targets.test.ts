import { describe, expect, it } from "vitest";
import { canAccess, type RoleGrant } from "@/lib/auth/permissions";
import { APPROVER_ACTION, approvalHref, decidedElsewhere, parseApprovalTarget } from "./targets";

const role = (r: RoleGrant["role"], sections: string[] = []): RoleGrant[] => [
  { role: r, sections },
];

describe("APPROVER_ACTION", () => {
  it("push.* é decidido por quem tem push.approve (o mesmo que o banco exige em guard_push_approvals)", () => {
    for (const k of ["push.urgent", "push.highlight", "push.resume"] as const)
      expect(APPROVER_ACTION[k]).toBe("push.approve");
  });

  it("admin vê decisões de push na caixa de aprovações; editor de editoria não", () => {
    expect(canAccess(role("admin"), APPROVER_ACTION["push.urgent"])).toBe(true);
    expect(canAccess(role("editor_chefe"), APPROVER_ACTION["push.highlight"])).toBe(true);
    expect(canAccess(role("editor", ["cidade"]), APPROVER_ACTION["push.highlight"])).toBe(false);
  });
});

describe("decidedElsewhere / approvalHref", () => {
  it("push e fonte crítica se decidem na tela do próprio alvo, nunca pela caixa", () => {
    for (const k of ["push.urgent", "push.highlight", "push.resume"] as const) {
      expect(decidedElsewhere(k)).toBe(true);
      expect(approvalHref(k, parseApprovalTarget("push:abc"))).toBe("/estudio/admin/notificacoes");
    }
    expect(decidedElsewhere("source.critical")).toBe(true);
    expect(decidedElsewhere("rules.activate")).toBe(false);
  });
});
