import { describe, expect, it } from "vitest";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { copiedRun, sentencesOf } from "@/lib/ai/schemas/aggregate-summary";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import { createMemoryUnderstandRepo } from "../testing/memory-understand-repo";
import type { PipelineMessage } from "../types";
import { createUnderstandHandlers } from "./index";

const NOW = new Date("2026-09-27T18:00:00Z");
const SOURCES = {
  "mt-agora": { reliability: "verified", locality: "mt", republishPolicy: "summary_2_sentences" },
  "portal-varzea": {
    reliability: "standard",
    locality: "varzea-grande",
    republishPolicy: "link_only",
  },
} as const;

const EXCERPT =
  "A nova linha expressa terá intervalo de 12 minutos nos horários de pico. Nos fins de semana, o intervalo será de 25 minutos.";

function setup() {
  const store = createMemoryAiStore();
  const fake = createFakeProvider();
  const callAgent = createCallAgent({ store, provider: fake, now: () => NOW });
  const repo = createMemoryUnderstandRepo(SOURCES);
  const promptVersion = async (id: string) => (await store.agent(id))?.prompt?.version ?? null;
  const handlers = createUnderstandHandlers({ repo, callAgent, promptVersion, now: () => NOW });
  return { store, fake, repo, handlers };
}

const msg = (id: string): PipelineMessage => ({
  runId: "run-1",
  step: "classify",
  itemRef: `item:${id}`,
  attempt: 1,
});

const classifyOk = { section: "cidade", relevance: 0.8, sensitive: false, tags: [] };

describe("resumo próprio do agregado (agente aggregate_summary, dentro do classify)", () => {
  it("fonte summary_2_sentences: grava resumo de até 2 frases que não copia a fonte", async () => {
    const { repo, handlers, fake } = setup();
    repo.add({
      id: "i1",
      sourceSlug: "mt-agora",
      title: "Linha expressa CPA–Centro terá saídas a cada 12 minutos no pico",
      excerpt: EXCERPT,
    });
    const r = await handlers.classify!(msg("i1"));
    expect(r.ok).toBe(true);
    const summary = repo.item("i1")!.summary!;
    expect(summary).toBeTruthy();
    expect(summary.length).toBeLessThanOrEqual(280);
    expect(sentencesOf(summary).length).toBeLessThanOrEqual(2);
    expect(copiedRun(summary, EXCERPT)).toBeNull();
    expect(repo.item("i1")!.excerpt).toBe(EXCERPT);
    const call = fake.calls.find((c) => c.agentId === "aggregate_summary")!;
    expect(call.prompt).toContain('<fonte_externa id="item:i1">');
    // Idempotente: mesma entrada não chama o modelo de novo.
    await handlers.classify!(msg("i1"));
    expect(fake.calls.filter((c) => c.agentId === "aggregate_summary")).toHaveLength(1);
  });

  it("resumo que copia 8 palavras seguidas do excerpt é descartado com motivo", async () => {
    const { repo, handlers, fake } = setup();
    repo.add({ id: "i2", sourceSlug: "mt-agora", title: "Linha expressa", excerpt: EXCERPT });
    fake.script([
      { output: classifyOk },
      {
        output: {
          summary:
            "A nova linha expressa terá intervalo de 12 minutos nos horários de pico, diz o site.",
        },
      },
    ]);
    const r = await handlers.classify!(msg("i2"));
    expect(r.ok).toBe(true);
    expect(repo.item("i2")!.summary).toBeNull();
    expect(repo.decisions().find((d) => d.agentId === "aggregate_summary")).toMatchObject({
      output: expect.objectContaining({ accepted: false }),
      rationale: expect.stringMatching(/copia 8 palavras/),
    });
  });

  it("resumo com 3 frases não passa no schema e não é gravado", async () => {
    const { repo, handlers, fake } = setup();
    repo.add({ id: "i3", sourceSlug: "mt-agora", title: "Linha expressa", excerpt: EXCERPT });
    const three = { summary: "Primeira frase curta aqui. Segunda frase curta. Terceira frase." };
    fake.script([{ output: classifyOk }, { output: three }, { output: three }]);
    expect((await handlers.classify!(msg("i3"))).ok).toBe(true);
    expect(repo.item("i3")!.summary).toBeNull();
  });

  it("fonte link_only, tema sensível ou item sem texto da fonte: nenhuma chamada", async () => {
    const { repo, handlers, fake } = setup();
    repo.add({ id: "a", sourceSlug: "portal-varzea", title: "Plano de ônibus", excerpt: EXCERPT });
    repo.add({ id: "b", sourceSlug: "mt-agora", title: "Linha expressa", excerpt: null });
    repo.add({ id: "c", sourceSlug: "mt-agora", title: "Homicídio no CPA", excerpt: EXCERPT });
    fake.script([
      { output: classifyOk },
      { output: classifyOk },
      { output: { ...classifyOk, section: "seguranca", sensitive: true } },
    ]);
    for (const id of ["a", "b", "c"]) await handlers.classify!(msg(id));
    expect(fake.calls.filter((c) => c.agentId === "aggregate_summary")).toHaveLength(0);
    for (const id of ["a", "b", "c"]) expect(repo.item(id)!.summary).toBeNull();
  });

  it("IA fora do ar não trava a classificação", async () => {
    const { repo, handlers, fake } = setup();
    repo.add({ id: "i4", sourceSlug: "mt-agora", title: "Linha expressa", excerpt: EXCERPT });
    fake.script([{ output: classifyOk }, { error: "provider" }, { error: "timeout" }]);
    const r = await handlers.classify!(msg("i4"));
    expect(r).toEqual({ ok: true, value: [expect.objectContaining({ step: "locate" })] });
    expect(repo.item("i4")!.summary).toBeNull();
  });
});
