import { describe, expect, it } from "vitest";
import type { Candidate } from "./index";
import { classifyRisk } from "./risk";

const base: Candidate = {
  category: "cidade",
  tags: [],
  independentSources: 2,
  primarySources: 0,
  centralConflict: false,
  imageApproved: true,
  confidenceScore: 0.7,
  breaking: false,
  sensitive: false,
  dubious: false,
  sourceTrusted: true,
  grave: false,
};

describe("classifyRisk (D-05: quatro níveis, por evidência e regra explícita)", () => {
  it("fontes convergentes, sem divergência: nível 1", () => {
    expect(classifyRisk(base)).toEqual({ level: 1, reasons: [] });
  });

  it("uma fonte relevante sem confirmação independente: nível 2", () => {
    expect(classifyRisk({ ...base, independentSources: 1 })).toEqual({
      level: 2,
      reasons: ["single_source"],
    });
  });

  it("uma fonte oficial (evidência primária) não é fonte única fraca: nível 1", () => {
    expect(classifyRisk({ ...base, independentSources: 1, primarySources: 1 }).level).toBe(1);
  });

  it("divergência entre fontes em assunto comum: nível 2 (publica atribuindo as versões)", () => {
    expect(classifyRisk({ ...base, centralConflict: true })).toEqual({
      level: 2,
      reasons: ["divergence"],
    });
  });

  it("notícia urgente ainda em atualização: nível 2 (dados preliminares)", () => {
    expect(classifyRisk({ ...base, breaking: true }).reasons).toContain("preliminary");
    expect(classifyRisk({ ...base, breaking: true }).level).toBe(2);
  });

  it("divergência sobre fato central em assunto grave: nível 3", () => {
    expect(classifyRisk({ ...base, grave: true, centralConflict: true })).toEqual({
      level: 3,
      reasons: ["divergence_grave"],
    });
  });

  it("acusação a pessoa vinda de uma fonte não confiável, sem segunda fonte: nível 3", () => {
    const r = classifyRisk({ ...base, grave: true, sourceTrusted: false, independentSources: 1 });
    expect(r.level).toBe(3);
    expect(r.reasons).toContain("untrusted_grave");
  });

  it("conteúdo que a verificação marcou como duvidoso: nível 3", () => {
    expect(classifyRisk({ ...base, dubious: true })).toEqual({ level: 3, reasons: ["dubious"] });
  });

  it("rascunho sem IA (sem processamento suficiente): nível 4, crítico", () => {
    expect(classifyRisk(base, { aiFallback: true })).toEqual({
      level: 4,
      reasons: ["no_ai_draft"],
    });
  });

  it("o nível é o do motivo mais grave, e todos os motivos ficam registrados", () => {
    const r = classifyRisk(
      { ...base, independentSources: 1, centralConflict: true, dubious: true },
      { aiFallback: true },
    );
    expect(r.level).toBe(4);
    expect(r.reasons).toEqual(["no_ai_draft", "dubious", "single_source", "divergence"]);
  });

  it("republicações do mesmo texto não mudam o nível: linhagem é só indicador (D-03)", () => {
    expect(Object.keys(base)).not.toContain("independentLineages");
    expect(classifyRisk(base)).toEqual(classifyRisk({ ...base }));
  });
});
