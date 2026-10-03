import { describe, expect, it } from "vitest";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import { ok } from "@/lib/result";
import { RULES_V3 } from "@/lib/rules/defaults";
import { createMemoryPublishRepo, type MemoryTopic } from "../testing/memory-publish-repo";
import type { PipelineMessage } from "../types";
import { createPublishHandlers } from "./index";

const NOW = new Date("2026-10-03T18:00:00Z");
const SOURCES = {
  "portal-brasil": { reliability: "verified", name: "Portal Brasil", locality: "nacional" },
  "mt-agora": { reliability: "verified", name: "MT Agora", locality: "cuiaba" },
} as const;

const msg = (step: PipelineMessage["step"], itemRef: string): PipelineMessage => ({
  runId: "r1",
  step,
  itemRef,
  attempt: 1,
});

function setup() {
  const store = createMemoryAiStore();
  const callAgent = createCallAgent({ store, provider: createFakeProvider(), now: () => NOW });
  const repo = createMemoryPublishRepo(SOURCES, {});
  const handlers = createPublishHandlers({
    repo,
    rules: { activeRules: async () => ok(RULES_V3) },
    flags: { isEnabled: async (k) => k === "auto_publish" },
    callAgent,
    promptVersion: async (id: string) => (await store.agent(id))?.prompt?.version ?? null,
    embed: async () => ok([1, 2, 3, 4]),
    revalidate: async () => undefined,
    now: () => NOW,
  });
  return { repo, handlers };
}

const topic = (item: MemoryTopic["items"][number]): MemoryTopic => ({
  id: "t1",
  slug: "assunto",
  title: "Assunto",
  sectionSlug: "cidade",
  confidence: "média",
  confidenceScore: 0.5,
  items: [item],
});

async function decide(item: MemoryTopic["items"][number], urgent = true) {
  const { repo, handlers } = setup();
  repo.addTopic(topic(item));
  await handlers.summarize!(msg("summarize", "topic:t1"));
  const a = repo.articleOfTopic("t1")!;
  if (urgent) repo.setUrgent(a.id);
  const r = await handlers.rules!(msg("rules", `article:${a.id}`));
  expect(r.ok).toBe(true);
  return { article: repo.article(a.id)!, repo };
}

describe("escopo regional e urgência local (AUT-T3)", () => {
  it("urgente de notícia nacional sem comoção perde o marcador, mas publica", async () => {
    const { article, repo } = await decide({
      id: "i1",
      sourceSlug: "portal-brasil",
      title: "Congresso aprova reforma em Brasília",
      tags: ["urgente"],
    });
    expect(article.newsScope).toBe("national");
    expect(article.urgent).toBe(false);
    expect(article.nationalCommotion).toBe(false);
    expect(repo.decisions().find((d) => d.step === "rules")?.output).toMatchObject({
      route: "publish",
      candidate: expect.objectContaining({ newsScope: "national" }),
    });
  });

  it("com comoção nacional o urgente permanece elegível", async () => {
    const { article } = await decide({
      id: "i1",
      sourceSlug: "portal-brasil",
      title: "Tragédia comove o país",
      tags: ["urgente", "comocao-nacional"],
    });
    expect(article.newsScope).toBe("national");
    expect(article.nationalCommotion).toBe(true);
    expect(article.urgent).toBe(true);
  });

  it("urgente de bairro de Cuiabá fica urgente e publica", async () => {
    const { article, repo } = await decide({
      id: "i1",
      sourceSlug: "mt-agora",
      title: "Incêndio atinge depósito em Cuiabá",
      tags: ["urgente"],
      neighborhood: "Goiabeiras",
      municipality: "cuiaba",
    });
    expect(article.newsScope).toBe("cuiaba");
    expect(article.urgent).toBe(true);
    expect(repo.decisions().find((d) => d.step === "rules")?.output).toMatchObject({
      route: "publish",
    });
  });

  it("notícia nacional não urgente também recebe o escopo", async () => {
    const { article } = await decide(
      { id: "i1", sourceSlug: "portal-brasil", title: "Dólar fecha em alta" },
      false,
    );
    expect(article.newsScope).toBe("national");
    expect(article.urgent).toBe(false);
  });
});
