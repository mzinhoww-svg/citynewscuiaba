import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "./defaults";
import { parseRuleRow, resolveRules } from "./load";

const row = (over: Record<string, unknown> = {}) => ({
  version: 3,
  force_review: false,
  body: { ...DEFAULT_RULES, version: 3, forceReview: false },
  ...over,
});

describe("regras ativas do banco", () => {
  it("lê a versão da coluna e o corpo validado", () => {
    const r = parseRuleRow(row());
    expect(r).toEqual({ ok: true, value: { ...DEFAULT_RULES, version: 3, forceReview: false } });
  });

  it("forceReview ligado na coluna ou no corpo vale (o mais restritivo)", () => {
    const a = parseRuleRow(row({ force_review: true }));
    const b = parseRuleRow(row({ body: { ...DEFAULT_RULES, forceReview: true } }));
    expect(a.ok && a.value.forceReview).toBe(true);
    expect(b.ok && b.value.forceReview).toBe(true);
  });

  it("corpo inválido é erro", () => {
    expect(parseRuleRow(row({ body: { categories: "x" } })).ok).toBe(false);
    expect(
      parseRuleRow(
        row({
          body: {
            ...DEFAULT_RULES,
            categories: { servicos: { ...DEFAULT_RULES.categories.servicos, mode: "sempre" } },
          },
        }),
      ).ok,
    ).toBe(false);
  });

  it("sem regra ativa ou erro ao carregar: forceReview, falha fechada", () => {
    const r = resolveRules({ ok: false, error: "nenhuma regra ativa" });
    expect(r.rules.forceReview).toBe(true);
    expect(r.rulesVersion).toBeNull();
    expect(r.failure).toBe("nenhuma regra ativa");
  });

  it("regra ativa válida passa inteira", () => {
    const rules = { ...DEFAULT_RULES, version: 2, forceReview: false };
    expect(resolveRules({ ok: true, value: rules })).toEqual({
      rules,
      rulesVersion: 2,
      failure: null,
    });
  });
});
