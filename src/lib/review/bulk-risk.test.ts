import { describe, expect, it } from "vitest";
import { summarizeRisks, TOP_RISKS, type RiskItem } from "./bulk-risk";

const base = (over: Partial<RiskItem> & { id: string }): RiskItem => ({
  title: `Matéria ${over.id}`,
  sectionSlug: "cidade",
  sourceCount: 3,
  hasCitableSource: true,
  hasApprovedPhoto: true,
  wordCount: 600,
  shortReason: null,
  doubtful: false,
  confidence: "alta",
  reported: false,
  hasBody: true,
  ...over,
});

describe("summarizeRisks", () => {
  it("seleção limpa: total e nenhum risco", () => {
    const s = summarizeRisks([base({ id: "a" }), base({ id: "b" })]);
    expect(s.total).toBe(2);
    expect(s.excluded).toEqual([]);
    expect(s.risks).toEqual([]);
    expect(s.top).toEqual([]);
    expect(s.publishableIds).toEqual(["a", "b"]);
  });

  it("conta editoria sensível separada por política, segurança e saúde", () => {
    const s = summarizeRisks([
      base({ id: "1", sectionSlug: "politica" }),
      base({ id: "2", sectionSlug: "politica" }),
      base({ id: "3", sectionSlug: "seguranca" }),
      base({ id: "4", sectionSlug: "saude" }),
      base({ id: "5", sectionSlug: "esportes" }),
    ]);
    const count = (k: string) => s.risks.find((r) => r.key === k)?.count ?? 0;
    expect(count("sensitive_politica")).toBe(2);
    expect(count("sensitive_seguranca")).toBe(1);
    expect(count("sensitive_saude")).toBe(1);
  });

  it("fonte única, sem foto aprovada, duvidoso, baixa pontuação, denúncia e sem fonte citável", () => {
    const s = summarizeRisks([
      base({ id: "1", sourceCount: 1 }),
      base({ id: "2", hasApprovedPhoto: false }),
      base({ id: "3", doubtful: true }),
      base({ id: "4", confidence: "baixa" }),
      base({ id: "5", reported: true }),
      base({ id: "6", sourceCount: 0, hasCitableSource: false }),
    ]);
    const keys = s.risks.map((r) => r.key).sort();
    expect(keys).toEqual(
      [
        "doubtful",
        "low_score",
        "no_citable_source",
        "no_photo",
        "reported",
        "single_source",
      ].sort(),
    );
    // sem fonte alguma não conta também como "fonte única"
    expect(s.risks.find((r) => r.key === "single_source")?.count).toBe(1);
  });

  it("texto curto: abaixo de 30 linhas, com o motivo curto no exemplo", () => {
    const s = summarizeRisks([
      base({ id: "1", wordCount: 12 * 29, shortReason: "só havia uma nota oficial" }),
      base({ id: "2", wordCount: 12 * 30 }),
      base({ id: "3", wordCount: 40 }),
    ]);
    const r = s.risks.find((x) => x.key === "short_text");
    expect(r?.count).toBe(2);
    expect(r?.example).toContain("só havia uma nota oficial");
  });

  it("sem corpo algum fica de fora do total e dos riscos e é listado", () => {
    const s = summarizeRisks([
      base({ id: "1" }),
      base({ id: "2", hasBody: false, sourceCount: 1, sectionSlug: "politica" }),
    ]);
    expect(s.total).toBe(1);
    expect(s.excluded).toEqual([{ id: "2", title: "Matéria 2" }]);
    expect(s.risks).toEqual([]);
    expect(s.publishableIds).toEqual(["1"]);
  });

  it("ordena por quantidade, limita aos 5 maiores e traz exemplo curto", () => {
    const long = "T".repeat(200);
    const items: RiskItem[] = [
      ...Array.from({ length: 6 }, (_, i) =>
        base({ id: `p${i}`, sectionSlug: "politica", title: long }),
      ),
      ...Array.from({ length: 5 }, (_, i) => base({ id: `f${i}`, sourceCount: 1 })),
      ...Array.from({ length: 4 }, (_, i) => base({ id: `n${i}`, hasApprovedPhoto: false })),
      ...Array.from({ length: 3 }, (_, i) => base({ id: `d${i}`, doubtful: true })),
      ...Array.from({ length: 2 }, (_, i) => base({ id: `r${i}`, reported: true })),
      base({ id: "l0", confidence: "baixa" }),
    ];
    const s = summarizeRisks(items);
    expect(s.risks.length).toBe(6);
    expect(s.top).toHaveLength(TOP_RISKS);
    expect(s.top.map((r) => r.key)).toEqual([
      "sensitive_politica",
      "single_source",
      "no_photo",
      "doubtful",
      "reported",
    ]);
    expect(s.top[0]?.example.length).toBeLessThanOrEqual(80);
    expect(s.total).toBe(items.length);
  });

  it("uma matéria com vários riscos entra em cada contagem", () => {
    const s = summarizeRisks([
      base({
        id: "1",
        sectionSlug: "saude",
        sourceCount: 1,
        doubtful: true,
        hasApprovedPhoto: false,
      }),
    ]);
    expect(s.risks.map((r) => r.key).sort()).toEqual(
      ["doubtful", "no_photo", "sensitive_saude", "single_source"].sort(),
    );
  });
});
