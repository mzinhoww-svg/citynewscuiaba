import { describe, expect, it } from "vitest";
import {
  approvalTargetLabel,
  APPROVAL_EFFECT_TEXT,
  APPROVAL_KIND_LABEL,
} from "@/content/pt-BR/approvals";
import {
  APPROVAL_KIND_ROLES,
  approvalEffect,
  canDecideApproval,
  canRequestApproval,
  targetRefValid,
  viewerStance,
} from "./kinds";

const ID = "d1000000-0000-4000-8000-000000000001";
const grant = (role: "admin" | "editor_chefe" | "operador_ia" | "analista") => [
  { role, sections: [] },
];

describe("source.critical", () => {
  it("alvo: só campo e valor da lista de mudanças críticas (D-F3)", () => {
    for (const ref of [
      `source:${ID}:image_policy=reproduction`,
      `source:${ID}:image_policy=with_agreement`,
      `source:${ID}:image_policy=licensed_only`,
      `source:${ID}:republish_policy=summary_2_sentences`,
      `source:${ID}:reliability=primary`,
      `source:${ID}:reliability=verified`,
      `source:${ID}:may_be_sole_source=true`,
      `source:${ID}:status=paused`,
    ])
      expect(targetRefValid("source.critical", ref), ref).toBe(true);
    for (const ref of [
      `source:${ID}:image_policy=none`,
      `source:${ID}:reliability=low`,
      `source:${ID}:may_be_sole_source=false`,
      `source:${ID}:name=Outro`,
      `source:${ID}:status=active`,
      `source:not-a-uuid:image_policy=reproduction`,
      ID,
      "",
    ])
      expect(targetRefValid("source.critical", ref), ref).toBe(false);
  });

  it("operador de IA pede e não decide; admin e editora-chefe decidem", () => {
    expect(canRequestApproval(grant("operador_ia"), "source.critical")).toBe(true);
    expect(canDecideApproval(grant("operador_ia"), "source.critical")).toBe(false);
    expect(canDecideApproval(grant("editor_chefe"), "source.critical")).toBe(true);
    expect(canDecideApproval(grant("admin"), "source.critical")).toBe(true);
    expect(canRequestApproval(grant("analista"), "source.critical")).toBe(false);
    expect(APPROVAL_KIND_ROLES["source.critical"].decide).toEqual(["admin", "editor_chefe"]);
  });

  it("quem pediu nunca decide", () => {
    const req = { kind: "source.critical" as const, requestedBy: "u1" };
    expect(viewerStance({ userId: "u1", roles: grant("editor_chefe") }, req)).toBe("requester");
    expect(viewerStance({ userId: "u2", roles: grant("editor_chefe") }, req)).toBe("decider");
    expect(viewerStance({ userId: "u3", roles: grant("operador_ia") }, req)).toBe("observer");
  });

  it("aprovar aplica a mudança na hora e o texto diz isso", () => {
    expect(approvalEffect("source.critical")).toBe("apply");
    expect(APPROVAL_EFFECT_TEXT.apply).toMatch(/aplicada/);
    expect(APPROVAL_KIND_LABEL["source.critical"]).toMatch(/fonte/i);
    expect(approvalTargetLabel("source.critical", `source:${ID}:image_policy=reproduction`)).toBe(
      "Fonte d1000000, image_policy = reproduction",
    );
  });
});
