import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decidePublication as d, type Candidate } from ".";
import { RULES_V3, RULES_V4 } from "./defaults";
import { parseRuleRow } from "./load";
import { validateRuleSet } from "./simulate";

const base: Candidate = {
  category: "cidade",
  tags: [],
  independentSources: 2,
  primarySources: 0,
  centralConflict: false,
  imageApproved: false,
  confidenceScore: 0.6,
  breaking: false,
  sensitive: false,
  dubious: false,
  sourceTrusted: true,
  grave: false,
};

describe("regras v4: níveis de risco (D-05)", () => {
  it("divergência secundária não segura a publicação: publica atribuindo as versões", () => {
    expect(d({ ...base, centralConflict: true }, RULES_V4)).toMatchObject({
      route: "publish",
      rule: "mode",
    });
    // Nas v3 a mesma matéria ia para revisão: a mudança só vale com `riskLevels` ligado.
    expect(d({ ...base, centralConflict: true }, RULES_V3).rule).toBe("conflict");
  });

  it("divergência sobre fato central em assunto grave vai para revisão (nível 3)", () => {
    expect(d({ ...base, centralConflict: true, grave: true }, RULES_V4)).toMatchObject({
      route: "review",
      rule: "conflict_grave",
    });
  });

  it("duvidoso e fonte não confiável com assunto grave continuam em revisão", () => {
    expect(d({ ...base, dubious: true }, RULES_V4).rule).toBe("dubious");
    expect(
      d({ ...base, grave: true, sourceTrusted: false, independentSources: 1 }, RULES_V4).rule,
    ).toBe("untrusted_grave");
  });

  it("uma fonte relevante publica (sem exigir várias fontes independentes)", () => {
    expect(d({ ...base, independentSources: 1 }, RULES_V4).route).toBe("publish");
  });

  it("score abaixo do mínimo ainda vai para revisão", () => {
    expect(d({ ...base, confidenceScore: 0.2 }, RULES_V4).rule).toBe("min_score");
  });

  it("v4 é a v3 com os níveis ligados: mesmas editorias, limites e portões", () => {
    expect({ ...RULES_V4, version: 3, riskLevels: false }).toEqual(RULES_V3);
    expect(validateRuleSet(RULES_V4).ok).toBe(true);
  });

  it("corpo sem `riskLevels` (regras antigas) mantém o portão de conflito", () => {
    const r = parseRuleRow({ version: 3, force_review: false, body: { ...RULES_V3 } });
    expect(r.ok && r.value.riskLevels).toBe(false);
    const v4 = parseRuleRow({ version: 4, force_review: false, body: { ...RULES_V4 } });
    expect(v4.ok && v4.value.riskLevels).toBe(true);
  });

  it("a proposta SQL da v4 nasce inativa e com o mesmo corpo da v4 do código", () => {
    const sql = readFileSync("supabase/bootstrap/rules-v4-proposal.sql", "utf8");
    expect(sql).toContain("'aut-v4'");
    expect(sql).toMatch(/null, false\s+from next/);
    const body = /'(\{"forceReview".*?\})'::jsonb/s.exec(sql)?.[1];
    expect(body).toBeDefined();
    const parsed = parseRuleRow({ version: 4, force_review: false, body: JSON.parse(body!) });
    expect(parsed.ok && { ...parsed.value, version: 4 }).toEqual(RULES_V4);
  });
});
