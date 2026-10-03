import { describe, expect, it } from "vitest";
import { ok } from "@/lib/result";
import { DEFAULT_RULES, RULES_V3 } from "@/lib/rules/defaults";
import type { DecisionContext } from "../ports";
import { candidateOf, isGrave, neverAuto, routeArticle } from "./decide";

const ctx: DecisionContext = {
  articleId: "a1",
  slug: "s",
  topicId: "t1",
  status: "draft",
  publishMode: null,
  sectionSlug: "seguranca",
  category: "seguranca",
  title: "Operação prende suspeitos em Cuiabá",
  urgent: true,
  aiFallback: false,
  confidence: "baixa",
  confidenceScore: 0.35,
  version: 1,
  humanEdited: false,
  independentSources: 1,
  primarySources: 0,
  tags: ["crime", "urgente"],
  sensitive: true,
  centralConflict: false,
  imageApproved: false,
  dubious: false,
  sourceTrusted: true,
  neighborhoods: ["Goiabeiras"],
  municipalities: ["cuiaba"],
  sourceLocalities: ["cuiaba"],
  nationalCommotion: false,
};
const ON = { autoPublish: true, readOnly: false };

describe("routeArticle com regras v3 (AUT-T1)", () => {
  it("segurança urgente e sensível de fonte confiável publica", () =>
    expect(routeArticle(ctx, ok(RULES_V3), ON)).toMatchObject({ route: "publish", rule: "mode" }));

  it("as mesmas regras antigas seguem retendo (Segurança é hold)", () =>
    expect(
      routeArticle(
        { ...ctx, urgent: false, sensitive: false, tags: [] },
        ok({ ...DEFAULT_RULES, forceReview: false }),
        ON,
      ).route,
    ).toBe("hold"));

  it("rascunho sem IA, auto_publish desligado e modo leitura continuam em revisão", () => {
    expect(routeArticle({ ...ctx, aiFallback: true }, ok(RULES_V3), ON)).toMatchObject({
      route: "review",
      rule: "ai_unavailable",
    });
    expect(routeArticle(ctx, ok(RULES_V3), { autoPublish: false, readOnly: false }).rule).toBe(
      "auto_publish_off",
    );
    expect(routeArticle(ctx, ok(RULES_V3), { autoPublish: true, readOnly: true }).rule).toBe(
      "auto_publish_off",
    );
  });

  it("fontes divergentes e conteúdo duvidoso sobem para revisão", () => {
    expect(routeArticle({ ...ctx, centralConflict: true }, ok(RULES_V3), ON).rule).toBe("conflict");
    expect(routeArticle({ ...ctx, dubious: true }, ok(RULES_V3), ON).rule).toBe("dubious");
  });

  it("fonte não confiável com assunto grave e uma fonte sobe; com duas publica", () => {
    const weak = { ...ctx, sourceTrusted: false };
    expect(routeArticle(weak, ok(RULES_V3), ON).rule).toBe("untrusted_grave");
    expect(routeArticle({ ...weak, independentSources: 2 }, ok(RULES_V3), ON).route).toBe(
      "publish",
    );
  });

  it("regras indisponíveis falham fechado", () =>
    expect(
      routeArticle(
        { ...ctx, urgent: false, sensitive: false, tags: [] },
        { ok: false, error: "x" },
        ON,
      ).rule,
    ).toBe("rules_unavailable"));
});

describe("neverAuto e candidato", () => {
  it("nas regras v3 só o rascunho sem IA é travado", () => {
    expect(neverAuto(ctx, RULES_V3)).toBe(false);
    expect(neverAuto({ ...ctx, aiFallback: true }, RULES_V3)).toBe(true);
  });
  it("nas regras antigas breaking, sensível e Segurança travam", () =>
    expect(neverAuto(ctx, DEFAULT_RULES)).toBe(true));
  it("candidateOf carrega dubious, sourceTrusted e grave", () =>
    expect(candidateOf({ ...ctx, dubious: true, sourceTrusted: false })).toMatchObject({
      dubious: true,
      sourceTrusted: false,
      grave: true,
    }));
  it("grave: segurança, sensível ou saúde individual; cidade comum não", () => {
    expect(isGrave({ category: "cidade", sensitive: false, tags: [] })).toBe(false);
    expect(isGrave({ category: "cidade", sensitive: false, tags: ["Saúde individual"] })).toBe(
      true,
    );
    expect(isGrave({ category: "seguranca-urbana", sensitive: false, tags: [] })).toBe(true);
  });
});
