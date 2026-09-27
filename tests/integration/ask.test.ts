// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { buildAnswer, independentCount, type AnswerContext } from "@/lib/ai/answer";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import { createServiceClient } from "@/lib/db/client";
import { retrieveForAnswer } from "@/lib/search/ask";

const noEmbed = { embed: async () => null };
const SPONSORED_SLUG = "mutirao-de-emprego-oferece-800-vagas-no-centro";

function ctx(): AnswerContext {
  return {
    retrieve: (q) => retrieveForAnswer(q, noEmbed),
    callAgent: createCallAgent({
      store: createMemoryAiStore(),
      provider: createFakeProvider(),
      now: () => new Date(),
    }),
    now: () => new Date("2026-09-27T18:00:00Z"),
  };
}

describe("busca com IA sobre o seed (P3-T11)", () => {
  it("pergunta geral acha fontes de 2+ veículos e responde com citações", async () => {
    const r = await retrieveForAnswer("O que aconteceu em Cuiabá hoje?", noEmbed);
    expect(r.ok).toBe(true);
    if (r.ok) expect(independentCount(r.value)).toBeGreaterThanOrEqual(2);
    const a = await buildAnswer("O que aconteceu em Cuiabá hoje?", ctx());
    expect(a.kind).toBe("answer");
    if (a.kind === "answer") {
      expect(a.facts.every((f) => f.citations.length > 0)).toBe(true);
      expect(independentCount(a.sources)).toBeGreaterThanOrEqual(2);
    }
  });

  it("assunto sem 2 fontes independentes vira insufficient", async () => {
    const a = await buildAnswer("Resuma saúde pública no Coxipó", ctx());
    expect(a.kind).toBe("insufficient");
  });

  it("agência oficial conta como fonte primária", async () => {
    const r = await retrieveForAnswer("plano de ônibus do CPA", noEmbed);
    expect(r.ok && r.value.some((s) => s.publisher === "agencia-mt" && s.primary)).toBe(true);
  });

  it("matéria patrocinada nunca vira fonte", async () => {
    const db = createServiceClient();
    await db.from("articles").update({ sponsored: true }).eq("slug", SPONSORED_SLUG);
    const r = await retrieveForAnswer("mutirão de emprego vagas", noEmbed);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.some((s) => s.url.endsWith(SPONSORED_SLUG))).toBe(false);
  });

  afterAll(async () => {
    await createServiceClient()
      .from("articles")
      .update({ sponsored: false })
      .eq("slug", SPONSORED_SLUG);
  });
});

describe("IA desligada (feature_flags.ai_enabled = false)", () => {
  it("responde indisponível sem consumir limite nem chamar o modelo", async () => {
    const { answerQuestion } = await import("@/lib/search/ask");
    const db = createServiceClient();
    await db.from("feature_flags").update({ enabled: false }).eq("key", "ai_enabled");
    try {
      const out = await answerQuestion("O que aconteceu em Cuiabá hoje?");
      expect(out).toMatchObject({ aiOff: true, answer: { kind: "error", reason: "unavailable" } });
    } finally {
      await db.from("feature_flags").update({ enabled: true }).eq("key", "ai_enabled");
    }
  });
});
