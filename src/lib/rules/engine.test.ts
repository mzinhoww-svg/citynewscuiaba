import { describe, expect, it } from "vitest";
import { AUTONOMY_POLICY_V1 } from "./autonomy-policy";
import { decideAutonomy, type EngineInput } from "./engine";
import type { Candidate } from "./index";

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  category: "cidade",
  tags: [],
  independentSources: 2,
  primarySources: 1,
  centralConflict: false,
  imageApproved: true,
  confidenceScore: 0.8,
  breaking: false,
  sensitive: false,
  dubious: false,
  sourceTrusted: true,
  grave: false,
  ...over,
});

const input = (over: Partial<EngineInput> = {}): EngineInput => ({
  rule: "mode",
  route: "publish",
  candidate: cand(),
  aiFallback: false,
  reprocessCount: 0,
  ageHours: 1,
  ...over,
});

describe("decideAutonomy", () => {
  it("regras satisfeitas publicam; primária confiável com confiança alta é A0", () => {
    const d = decideAutonomy(input());
    expect(d).toMatchObject({ outcome: "PUBLISH", level: "A0", policyVersion: 1 });
    expect(decideAutonomy(input({ candidate: cand({ primarySources: 0 }) })).level).toBe("A1");
    expect(
      decideAutonomy(input({ candidate: cand({ primarySources: 0, confidenceScore: 0.5 }) })).level,
    ).toBe("A2");
  });

  it("matéria sensível de fonte confiável e confiança alta publica sozinha", () => {
    const d = decideAutonomy(input({ candidate: cand({ sensitive: true, grave: true }) }));
    expect(d.outcome).toBe("PUBLISH");
  });

  it("sensível com fontes divergentes e confiança baixa é a única exceção humana", () => {
    const d = decideAutonomy(
      input({
        rule: "conflict",
        route: "review",
        candidate: cand({ sensitive: true, centralConflict: true, confidenceScore: 0.4 }),
      }),
    );
    expect(d).toMatchObject({ outcome: "HUMAN_EXCEPTION", level: "A4" });
  });

  it("fontes divergentes com confiança alta e primária confiável publicam com atribuição", () => {
    const d = decideAutonomy(
      input({
        rule: "conflict",
        route: "review",
        candidate: cand({ centralConflict: true, confidenceScore: 0.9 }),
      }),
    );
    expect(d.outcome).toBe("PUBLISH");
  });

  it("confiança baixa reprocessa com espera crescente; esgotado, publica degradado se o risco é baixo", () => {
    const low = (n: number) =>
      decideAutonomy(
        input({
          rule: "min_score",
          route: "review",
          candidate: cand({ confidenceScore: 0.2 }),
          reprocessCount: n,
        }),
      );
    expect(low(0)).toMatchObject({ outcome: "REPROCESS", nextAttemptInMin: 30 });
    expect(low(1)).toMatchObject({ outcome: "REPROCESS", nextAttemptInMin: 120 });
    expect(low(2)).toMatchObject({ outcome: "REPROCESS", nextAttemptInMin: 360 });
    expect(low(3)).toMatchObject({ outcome: "PUBLISH_DEGRADED", level: "A3" });
  });

  it("esgotado com risco alto vai para quarentena, nunca para a fila humana", () => {
    const d = decideAutonomy(
      input({
        rule: "untrusted_grave",
        route: "review",
        candidate: cand({
          grave: true,
          sensitive: true,
          sourceTrusted: false,
          independentSources: 1,
        }),
        reprocessCount: 3,
      }),
    );
    expect(d.outcome).toBe("QUARANTINE");
  });

  it("falha de IA nunca vai para pessoa: reprocessa e, esgotado, isola (o rascunho sem IA não publica)", () => {
    const ai = (n: number) =>
      decideAutonomy(
        input({ rule: "ai_unavailable", route: "review", aiFallback: true, reprocessCount: n }),
      );
    expect(ai(0)).toMatchObject({ outcome: "REPROCESS", nextAction: "rewrite" });
    expect(ai(3).outcome).toBe("QUARANTINE");
    for (let n = 0; n < 5; n++) expect(ai(n).outcome).not.toBe("HUMAN_EXCEPTION");
  });

  it("publicação automática desligada pelo dono espera o religamento, sem fila humana", () => {
    const d = decideAutonomy(
      input({ rule: "auto_publish_off", route: "review", reprocessCount: 9 }),
    );
    expect(d).toMatchObject({ outcome: "REPROCESS", nextAction: "await_auto_publish" });
  });

  it("conteúdo duvidoso e duplicata vão para quarentena com recomendação", () => {
    expect(decideAutonomy(input({ rule: "dubious", route: "review" })).outcome).toBe("QUARANTINE");
    const dup = decideAutonomy(input({ duplicate: true }));
    expect(dup.outcome).toBe("QUARANTINE");
    expect(dup.reason).toMatch(/mesclar/);
  });

  it("notícia velha não reprocessa: quarentena", () => {
    const d = decideAutonomy(
      input({ rule: "min_sources", route: "review", ageHours: AUTONOMY_POLICY_V1.maxAgeHours + 1 }),
    );
    expect(d.outcome).toBe("QUARANTINE");
  });

  it("configuração explícita do dono (categoria em revisão, regras antigas) é exceção humana; bloqueio fica retido", () => {
    expect(decideAutonomy(input({ rule: "mode", route: "review" })).outcome).toBe(
      "HUMAN_EXCEPTION",
    );
    expect(decideAutonomy(input({ rule: "never_auto", route: "review" })).outcome).toBe(
      "HUMAN_EXCEPTION",
    );
    expect(decideAutonomy(input({ rule: "blocked", route: "hold" })).outcome).toBe("HOLD");
  });

  it("thresholds vêm da política informada (versionada)", () => {
    const d = decideAutonomy(input({ rule: "min_score", route: "review", reprocessCount: 0 }), {
      ...AUTONOMY_POLICY_V1,
      version: 7,
      reprocessDelaysMin: [5],
    });
    expect(d).toMatchObject({ outcome: "REPROCESS", nextAttemptInMin: 5, policyVersion: 7 });
  });

  it("scores ficam entre 0 e 1", () => {
    const d = decideAutonomy(
      input({
        candidate: cand({ dubious: true, centralConflict: true, grave: true, sensitive: true }),
      }),
    );
    for (const v of [d.qualityScore, d.confidenceScore, d.riskScore]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
