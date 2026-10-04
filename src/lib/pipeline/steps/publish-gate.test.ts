import { describe, expect, it, vi } from "vitest";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import { ok } from "@/lib/result";
import { RULES_V3 } from "@/lib/rules/defaults";
import type { BreakerStore } from "../breaker";
import { createMemoryPublishRepo, type MemoryTopic } from "../testing/memory-publish-repo";
import type { PipelineMessage } from "../types";
import { COVER_WAIT_MS, MAX_REWRITES } from "./auto-checklist";
import { createPublishHandlers } from "./index";

const SOURCES = { "mt-agora": { reliability: "verified", name: "MT Agora" } } as const;

const msg = (step: PipelineMessage["step"], itemRef: string): PipelineMessage => ({
  runId: "r1",
  step,
  itemRef,
  attempt: 1,
});

function setup(opts: { breaker?: BreakerStore } = {}) {
  const clock = { now: new Date("2026-10-03T18:00:00Z") };
  const store = createMemoryAiStore();
  const fake = createFakeProvider();
  const callAgent = createCallAgent({ store, provider: fake, now: () => clock.now });
  const repo = createMemoryPublishRepo(SOURCES, {});
  const handlers = createPublishHandlers({
    repo,
    rules: { activeRules: async () => ok(RULES_V3) },
    flags: { isEnabled: async (k) => k === "auto_publish" },
    callAgent,
    promptVersion: async (id: string) => (await store.agent(id))?.prompt?.version ?? null,
    embed: async () => ok([1, 2, 3, 4]),
    revalidate: async () => undefined,
    now: () => clock.now,
    breaker: opts.breaker,
  });
  return { repo, fake, handlers, clock };
}

const SHORT = {
  id: "i1",
  sourceSlug: "mt-agora",
  title: "Prefeitura abre obra na avenida do CPA",
  excerpt: "A obra começa na segunda-feira e dura 40 dias.",
};
/** Material de fonte longo: uma redação séria teria de passar das 30 linhas. */
const LONG = {
  ...SHORT,
  excerpt: `${"A obra começa na segunda-feira e dura 40 dias, segundo a Prefeitura. ".repeat(30)}`,
};

const topic = (item: MemoryTopic["items"][number]): MemoryTopic => ({
  id: "t1",
  slug: "obra",
  title: "Obra",
  sectionSlug: "cidade",
  confidence: "média",
  confidenceScore: 0.6,
  items: [item],
});

type S = ReturnType<typeof setup>;
async function toPublish(s: S, item: MemoryTopic["items"][number], ref = "topic:t1") {
  s.repo.addTopic(topic(item));
  const w = await s.handlers.summarize!(msg("summarize", ref));
  expect(w.ok).toBe(true);
  const id = s.repo.articleOfTopic("t1")!.id;
  const r = await s.handlers.rules!(msg("rules", `article:${id}`));
  expect(r.ok).toBe(true);
  return id;
}
const publish = (s: S, id: string) => s.handlers.publish!(msg("publish", `article:${id}`));

describe("portão de completude e R41 (AUT-T4)", () => {
  it("fonte sem conteúdo: publica abaixo de 30 linhas com short_reason insufficient_source", async () => {
    const s = setup();
    const id = await toPublish(s, SHORT);
    const r = await publish(s, id);
    expect(r.ok).toBe(true);
    expect(s.repo.article(id)).toMatchObject({
      status: "published",
      publishMode: "auto",
      shortReason: "insufficient_source",
    });
    expect(s.repo.decisions().findLast((d) => d.step === "publish")?.output).toMatchObject({
      published: true,
      shortReason: "insufficient_source",
    });
  });

  it("fonte com conteúdo e texto curto: volta ao write até 2 vezes e depois publica com short_reason", async () => {
    const s = setup();
    const id = await toPublish(s, LONG);
    for (let n = 1; n <= MAX_REWRITES; n++) {
      const r = await publish(s, id);
      expect(r).toEqual(ok([msg("summarize", `topic:t1#rewrite${n}`)]));
      expect(s.repo.article(id)!.status).toBe("draft");
      const w = await s.handlers.summarize!(msg("summarize", `topic:t1#rewrite${n}`));
      expect(w.ok).toBe(true);
      await s.handlers.rules!(msg("rules", `article:${id}`));
    }
    expect(s.fake.calls.filter((c) => c.agentId === "write")).toHaveLength(1 + MAX_REWRITES);
    expect(s.fake.calls.at(-1)?.prompt).toMatch(/REESCRITA/);
    const last = await publish(s, id);
    expect(last.ok).toBe(true);
    expect(s.repo.article(id)).toMatchObject({
      status: "published",
      shortReason: "insufficient_source",
    });
  });

  it("corpo cortado no meio da frase, mesmo refeito, não publica: vai para revisão", async () => {
    const s = setup();
    const cut = {
      output: {
        title: "Prefeitura abre obra na avenida do CPA",
        dek: "Obra começa na segunda-feira",
        summary: ["Obra na avenida."],
        body: [{ text: "A Prefeitura anunciou que a obra vai começar e", citations: ["i1"] }],
      },
    };
    s.fake.script([cut, cut, cut]);
    const id = await toPublish(s, LONG);
    for (let n = 1; n <= MAX_REWRITES; n++) {
      await publish(s, id);
      await s.handlers.summarize!(msg("summarize", `topic:t1#rewrite${n}`));
      await s.handlers.rules!(msg("rules", `article:${id}`));
    }
    const r = await publish(s, id);
    expect(r).toEqual(ok([msg("notify", `article:${id}#review`)]));
    expect(s.repo.article(id)).toMatchObject({ status: "in_review" });
    expect(s.repo.article(id)!.reviewReason).toMatch(/Corpo cortado/);
  });

  it("capa pendente espera, depois cai no cartão tipográfico; nunca publica com capa a caminho", async () => {
    const s = setup();
    const id = await toPublish(s, SHORT);
    s.repo.setCover(id, "pending");
    const first = await publish(s, id);
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.error).toMatchObject({ kind: "transient", retryable: true });
    expect(s.repo.article(id)!.status).toBe("draft");

    s.clock.now = new Date(s.clock.now.getTime() + 5 * 60_000);
    expect((await publish(s, id)).ok).toBe(false);
    expect(s.repo.article(id)!.status).toBe("draft");

    s.clock.now = new Date(s.clock.now.getTime() + COVER_WAIT_MS);
    const done = await publish(s, id);
    expect(done.ok).toBe(true);
    expect(s.repo.article(id)!.status).toBe("published");
    expect(
      s.repo
        .decisions()
        .some((d) => d.step === "image" && (d.output as { kind?: string }).kind === "typographic"),
    ).toBe(true);
  });

  it("matéria sem fonte citada não publica", async () => {
    const s = setup();
    const id = await toPublish(s, SHORT);
    s.repo.article(id)!.input.sources = [];
    const r = await publish(s, id);
    expect(r).toEqual(ok([msg("notify", `article:${id}#review`)]));
    expect(s.repo.article(id)).toMatchObject({ status: "in_review" });
    expect(s.repo.article(id)!.reviewReason).toMatch(/sem fonte citada/);
  });

  it("o checklist conserta SEO e taxonomia antes de publicar", async () => {
    const s = setup();
    const id = await toPublish(s, SHORT);
    await publish(s, id);
    const patch = s.repo.article(id)!.checklistPatch;
    expect(patch?.seoTitle).toBeTruthy();
    expect(patch?.seoDescription).toBeTruthy();
    expect(patch?.tags).toEqual(["cidade"]);
    expect(s.repo.decisions().findLast((d) => d.step === "publish")?.output).toMatchObject({
      checklistFixed: expect.arrayContaining(["seo", "taxonomy"]),
    });
  });
});

describe("disjuntor no publish (AUT-T4)", () => {
  const limits = { hourly: 60, daily: 800, reportsPerHour: 10, aiFailuresPerHour: 15 };
  const counts = {
    publishedLastHour: 0,
    publishedToday: 0,
    reportsLastHour: 0,
    aiCallsLastHour: 0,
    aiFailuresLastHour: 0,
  };

  it("61ª publicação na hora abre: não publica, avisa e pede pausa uma vez", async () => {
    const trip = vi.fn(async () => true);
    const s = setup({
      breaker: {
        counts: async () => ({
          counts: { ...counts, publishedLastHour: 60 },
          limits,
          tripped: false,
        }),
        trip,
      },
    });
    const id = await toPublish(s, SHORT);
    const r = await publish(s, id);
    expect(r).toEqual(ok([msg("notify", `article:${id}#breaker_open`)]));
    expect(trip).toHaveBeenCalledWith("hourly", expect.objectContaining({ limits }));
    // Disjuntor não cria fila humana (A-143): rascunho com recuperação automática agendada.
    expect(s.repo.article(id)).toMatchObject({ status: "draft" });
    expect(s.repo.article(id)!.autonomy).toMatchObject({ nextAction: "breaker_recovery" });
    expect(s.repo.article(id)!.reviewReason).toMatch(/Disjuntor de publicação aberto/);
    expect(s.repo.audits().at(-1)).toMatchObject({ action: "breaker.trip" });
  });

  it("pico de denúncias também abre", async () => {
    const trip = vi.fn(async () => false);
    const s = setup({
      breaker: {
        counts: async () => ({
          counts: { ...counts, reportsLastHour: 10 },
          limits,
          tripped: true,
        }),
        trip,
      },
    });
    const id = await toPublish(s, SHORT);
    await publish(s, id);
    expect(trip).toHaveBeenCalledWith("reports", expect.anything());
    expect(s.repo.article(id)!.status).toBe("draft");
    expect(s.repo.audits()).toHaveLength(0);
  });

  it("abaixo dos limites publica normalmente", async () => {
    const s = setup({
      breaker: {
        counts: async () => ({
          counts: { ...counts, publishedLastHour: 59 },
          limits,
          tripped: false,
        }),
        trip: async () => false,
      },
    });
    const id = await toPublish(s, SHORT);
    await publish(s, id);
    expect(s.repo.article(id)!.status).toBe("published");
  });
});
