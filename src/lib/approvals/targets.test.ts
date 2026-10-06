import { describe, expect, it } from "vitest";
import { canAccess, type RoleGrant } from "@/lib/auth/permissions";
import {
  APPROVER_ACTION,
  approvalHref,
  decidedElsewhere,
  parseApprovalTarget,
  roleTarget,
} from "./targets";

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

describe("papel numa ação só (role.grant / role.revoke, A-150)", () => {
  const id = "c1000000-0000-4000-8000-000000000009";
  it("o alvo `user:<uuid>:<papel>` volta como papel da conta", () => {
    expect(roleTarget(id, "editor")).toBe(`user:${id}:editor`);
    expect(parseApprovalTarget(roleTarget(id, "editor"))).toEqual({
      kind: "role",
      userId: id,
      role: "editor",
    });
  });

  it("só quem tem users.manage decide; o link leva à tela de usuários", () => {
    for (const k of ["role.grant", "role.revoke"] as const) {
      expect(APPROVER_ACTION[k]).toBe("users.manage");
      expect(decidedElsewhere(k)).toBe(false);
      expect(approvalHref(k, parseApprovalTarget(roleTarget(id, "admin")))).toBe(
        "/estudio/admin/usuarios",
      );
    }
  });
});
