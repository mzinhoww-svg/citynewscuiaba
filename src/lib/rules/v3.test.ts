import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decidePublication as d, type Candidate } from ".";
import { DEFAULT_RULES, RULES_V3 } from "./defaults";
import { isDubious } from "./dubious";
import { parseRuleRow } from "./load";
import { ruleDiff, validateRuleSet, weakensSafety } from "./simulate";

const base: Candidate = {
  category: "politica",
  tags: [],
  independentSources: 1,
  primarySources: 0,
  centralConflict: false,
  imageApproved: false,
  confidenceScore: 0.35,
  breaking: false,
  sensitive: false,
  dubious: false,
  sourceTrusted: true,
  grave: false,
};

describe("regras v3: portões de decidePublication (AUT-T1)", () => {
  it("segurança com fonte confiável e score 0,35 publica", () =>
    expect(
      d({ ...base, category: "seguranca", grave: true, sensitive: true }, RULES_V3),
    ).toMatchObject({ route: "publish", rule: "mode" }));
  it("política com 1 veículo independente publica", () =>
    expect(d(base, RULES_V3).route).toBe("publish"));
  it("saúde com fonte citada publica", () =>
    expect(d({ ...base, category: "saude", grave: true }, RULES_V3).route).toBe("publish"));
  it("urgente local publica (breaking deixa de ser portão)", () =>
    expect(d({ ...base, category: "cidade", breaking: true }, RULES_V3).route).toBe("publish"));
  it("sensível deixa de ser portão", () =>
    expect(d({ ...base, sensitive: true, tags: ["crime", "tragedia"] }, RULES_V3).route).toBe(
      "publish",
    ));
  it("conflito central confirmado vai para revisão mesmo com score alto", () =>
    expect(d({ ...base, centralConflict: true, confidenceScore: 0.95 }, RULES_V3)).toMatchObject({
      route: "review",
      rule: "conflict",
    }));
  it("conteúdo duvidoso vai para revisão", () =>
    expect(d({ ...base, dubious: true }, RULES_V3)).toMatchObject({
      route: "review",
      rule: "dubious",
    }));
  it("fonte não confiável + assunto grave + 1 fonte vai para revisão", () =>
    expect(
      d({ ...base, sourceTrusted: false, grave: true, category: "seguranca" }, RULES_V3),
    ).toMatchObject({ route: "review", rule: "untrusted_grave" }));
  it("fonte não confiável + grave mas com segunda fonte publica", () =>
    expect(
      d({ ...base, sourceTrusted: false, grave: true, independentSources: 2 }, RULES_V3).route,
    ).toBe("publish"));
  it("fonte não confiável sem assunto grave publica", () =>
    expect(d({ ...base, sourceTrusted: false, grave: false }, RULES_V3).route).toBe("publish"));
  it("score 0,29 revisão, 0,30 publica", () => {
    expect(d({ ...base, confidenceScore: 0.29 }, RULES_V3)).toMatchObject({
      route: "review",
      rule: "min_score",
    });
    expect(d({ ...base, confidenceScore: 0.3 }, RULES_V3).route).toBe("publish");
  });
  it("sem imagem aprovada e sem fonte primária não trava", () =>
    expect(d({ ...base, imageApproved: false, primarySources: 0 }, RULES_V3).route).toBe(
      "publish",
    ));
  it("entrada inválida segue falhando fechado", () =>
    expect(d({ ...base, confidenceScore: Number.NaN }, RULES_V3).rule).toBe("invalid_input"));
  it("neverAuto vazio por padrão nas regras v3", () => expect(RULES_V3.neverAuto).toEqual([]));
});

describe("regras antigas continuam fechadas (sem `neverAuto` no corpo)", () => {
  const open = { ...DEFAULT_RULES, forceReview: false };
  it("DEFAULT_RULES mantém Segurança bloqueada e breaking em revisão", () => {
    expect(d({ ...base, category: "seguranca" }, open).route).toBe("hold");
    expect(
      d(
        {
          ...base,
          category: "servicos",
          independentSources: 2,
          confidenceScore: 0.7,
          breaking: true,
        },
        open,
      ).rule,
    ).toBe("breaking");
  });
  it("parseRuleRow de corpo v1/v2 liga os portões; corpo v3 os desliga", () => {
    const v1 = parseRuleRow({
      version: 2,
      force_review: false,
      body: { forceReview: false, sensitiveTopics: [], categories: DEFAULT_RULES.categories },
    });
    expect(v1.ok && v1.value).toMatchObject({
      neverAuto: ["seguranca"],
      breakingReview: true,
      sensitiveFlagReview: true,
    });
    const v3 = parseRuleRow({ version: 3, force_review: false, body: RULES_V3 });
    expect(v3.ok && v3.value).toMatchObject({
      neverAuto: [],
      breakingReview: false,
      sensitiveFlagReview: false,
      forceReview: false,
    });
  });
  it("RULES_V3 é válido e afrouxa a Segurança (pede aprovação safety.disable)", () => {
    expect(validateRuleSet(RULES_V3).ok).toBe(true);
    expect(weakensSafety(DEFAULT_RULES, RULES_V3)).toBe(true);
    expect(ruleDiff(DEFAULT_RULES, RULES_V3).map((c) => c.path)).toEqual(
      expect.arrayContaining(["forceReview", "neverAuto", "breakingReview", "seguranca.mode"]),
    );
  });
});

describe("isDubious", () => {
  it("dubious ou unattributable marcam", () => {
    expect(isDubious({ dubious: true })).toBe(true);
    expect(isDubious({ unattributable: true })).toBe(true);
    expect(isDubious({ dubious: false }, null, undefined)).toBe(false);
  });
});

describe("proposta SQL v3 inativa", () => {
  const sql = readFileSync("supabase/bootstrap/rules-v3-proposal.sql", "utf8");
  it("espelha RULES_V3, nasce inativa e sem aprovação", () => {
    const json = /'(\{"forceReview".*?\})'::jsonb/s.exec(sql)?.[1];
    expect(json).toBeTruthy();
    const body = JSON.parse(json!) as Record<string, unknown>;
    const expected = Object.fromEntries(Object.entries(RULES_V3).filter(([k]) => k !== "version"));
    expect(body).toEqual(expected);
    expect(sql).toMatch(/false, '00000000-0000-4000-8000-0000000000a1', null, false/);
    expect(sql).not.toMatch(/\bdelete\b/i);
  });
});
