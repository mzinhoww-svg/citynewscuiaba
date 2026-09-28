import { describe, expect, it } from "vitest";
import {
  APPROVAL_KIND_ROLES,
  CRITICAL_KINDS,
  approvalEffect,
  canDecideApproval,
  canRequestApproval,
  isCriticalKind,
  normalizeJustification,
  targetRefValid,
  viewerStance,
} from "./kinds";

const grant = (role: Parameters<typeof canRequestApproval>[0][number]["role"]) => [
  { role, sections: [] },
];

describe("tipos de mudança crítica", () => {
  it("são os sete da spec §8 (mais o push urgente)", () => {
    expect([...CRITICAL_KINDS].sort()).toEqual(
      [
        "force_review.disable",
        "prompt.publish",
        "push.urgent",
        "rec.weights",
        "role.admin",
        "rules.activate",
        "safety.disable",
      ].sort(),
    );
    expect(isCriticalKind("rules.activate")).toBe(true);
    expect(isCriticalKind("rules.whatever")).toBe(false);
  });

  it("quem decide nunca inclui papéis fora de admin e editor_chefe (RLS approvals_decide)", () => {
    for (const k of CRITICAL_KINDS) {
      for (const role of APPROVAL_KIND_ROLES[k].decide) {
        expect(["admin", "editor_chefe"]).toContain(role);
      }
    }
  });
});

describe("justificativa", () => {
  it("apara espaços; vazia ou só espaços vira null", () => {
    expect(normalizeJustification("  motivo  ")).toBe("motivo");
    expect(normalizeJustification("")).toBeNull();
    expect(normalizeJustification(" \n\t ")).toBeNull();
  });
  it("mais de 2000 caracteres vira null", () => {
    expect(normalizeJustification("a".repeat(2000))).toHaveLength(2000);
    expect(normalizeJustification("a".repeat(2001))).toBeNull();
  });
});

describe("alvo por tipo", () => {
  const uuid = "c1000000-0000-4000-8000-000000000008";
  it("regras usam a versão numérica", () => {
    expect(targetRefValid("rules.activate", "12")).toBe(true);
    expect(targetRefValid("force_review.disable", "3")).toBe(true);
    expect(targetRefValid("safety.disable", "abc")).toBe(false);
    expect(targetRefValid("rules.activate", "0")).toBe(false);
  });
  it("pesos usam a versão em texto; papéis, prompts e push usam uuid", () => {
    expect(targetRefValid("rec.weights", "rec-v2")).toBe(true);
    expect(targetRefValid("rec.weights", "")).toBe(false);
    expect(targetRefValid("role.admin", uuid)).toBe(true);
    expect(targetRefValid("role.admin", "thiago")).toBe(false);
    expect(targetRefValid("prompt.publish", uuid)).toBe(true);
    expect(targetRefValid("push.urgent", uuid)).toBe(true);
  });
});

describe("papéis", () => {
  it("operador de IA pede ativação de regras, mas não decide", () => {
    expect(canRequestApproval(grant("operador_ia"), "rules.activate")).toBe(true);
    expect(canDecideApproval(grant("operador_ia"), "rules.activate")).toBe(false);
  });
  it("editora-chefe decide regras; pesos só o admin decide", () => {
    expect(canDecideApproval(grant("editor_chefe"), "rules.activate")).toBe(true);
    expect(canDecideApproval(grant("editor_chefe"), "rec.weights")).toBe(false);
    expect(canDecideApproval(grant("admin"), "rec.weights")).toBe(true);
  });
  it("analista não pede nem decide", () => {
    for (const k of CRITICAL_KINDS) {
      expect(canRequestApproval(grant("analista"), k)).toBe(false);
      expect(canDecideApproval(grant("analista"), k)).toBe(false);
    }
  });
});

describe("postura de quem vê o pedido", () => {
  const me = "u1";
  it("quem pediu nunca decide, mesmo com papel para isso", () => {
    expect(
      viewerStance(
        { userId: me, roles: grant("editor_chefe") },
        { kind: "rules.activate", requestedBy: me },
      ),
    ).toBe("requester");
  });
  it("outra pessoa com papel decide; sem papel só acompanha", () => {
    const req = { kind: "rules.activate" as const, requestedBy: "u2" };
    expect(viewerStance({ userId: me, roles: grant("editor_chefe") }, req)).toBe("decider");
    expect(viewerStance({ userId: me, roles: grant("editor") }, req)).toBe("observer");
  });
});

describe("efeito da aprovação", () => {
  it("regras e pesos entram em vigor; papel, prompt e push ficam autorizados", () => {
    expect(approvalEffect("rules.activate")).toBe("activate");
    expect(approvalEffect("force_review.disable")).toBe("activate");
    expect(approvalEffect("safety.disable")).toBe("activate");
    expect(approvalEffect("rec.weights")).toBe("activate");
    expect(approvalEffect("role.admin")).toBe("authorize");
    expect(approvalEffect("prompt.publish")).toBe("authorize");
    expect(approvalEffect("push.urgent")).toBe("authorize");
  });
});
