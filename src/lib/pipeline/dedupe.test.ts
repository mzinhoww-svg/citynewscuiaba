import { describe, expect, it } from "vitest";
import { hashEmbedding } from "@/lib/ai/hash-embedding";
import { drain } from "./drain";
import type { PipelineEvent } from "./ports";
import { createRunStep } from "./run-step";
import { hamming, simhash64 } from "./simhash";
import { assignTopic, CLUSTER_MIN_COSINE, createClusterStep } from "./steps/cluster";
import { createDedupeStep, isDuplicate } from "./steps/dedupe";
import { createMemoryClusterRepo } from "./testing/memory-cluster-repo";
import { createMemoryQueue } from "./testing/memory-queue";
import { cosine } from "./vector";

const item = (embedding: number[]) => ({ embedding });
const NOW = new Date("2026-09-27T00:00:00Z");

describe("simhash e hamming", () => {
  it("títulos quase iguais são duplicados", () => {
    expect(
      hamming(
        simhash64("Cesta básica recua 2,1% em setembro na capital"),
        simhash64("Cesta básica recua 2,1% em setembro na Capital"),
      ),
    ).toBeLessThanOrEqual(3);
  });

  it("ignora acento, caixa e pontuação", () => {
    expect(simhash64("Ônibus do CPA: novas linhas!")).toBe(simhash64("onibus do cpa novas linhas"));
  });

  it("títulos diferentes ficam longe", () => {
    expect(
      hamming(
        simhash64("Cesta básica recua 2,1% em setembro na capital"),
        simhash64("Final da Copa Cuiabana de futebol amador será na Arena Pantanal"),
      ),
    ).toBeGreaterThan(3);
  });

  it("é um inteiro de 64 bits sem sinal e estável", () => {
    const h = simhash64("Feira do agro em Cuiabá");
    expect(h).toBeGreaterThanOrEqual(0n);
    expect(h).toBeLessThan(1n << 64n);
    expect(simhash64("Feira do agro em Cuiabá")).toBe(h);
    expect(hamming(0n, (1n << 64n) - 1n)).toBe(64);
  });
});

describe("isDuplicate", () => {
  const a = simhash64("Prefeitura anuncia nova linha de ônibus para o CPA");
  it("simhash a distância ≤ 3", () => expect(isDuplicate(a, a)).toBe(true));
  it("cosseno ≥ 0,90 mesmo com simhash distante", () => {
    const b = simhash64("Assunto completamente diferente sobre o clima em Várzea Grande");
    expect(isDuplicate(a, b, 0.9)).toBe(true);
    expect(isDuplicate(a, b, 0.89)).toBe(false);
    expect(isDuplicate(a, b)).toBe(false);
  });
});

describe("assignTopic", () => {
  it("não agrupa com assunto de mais de 72 h", () => {
    const r = assignTopic(
      item([1, 0]),
      [{ topicId: "t1", centroid: [1, 0], updatedAt: "2026-09-23T00:00:00Z" }],
      NOW,
    );
    expect(r.topicId).toBeNull();
  });

  it("agrupa acima de 0,82", () => {
    expect(
      assignTopic(
        item([0.9, 0.44]),
        [{ topicId: "t1", centroid: [1, 0], updatedAt: "2026-09-26T00:00:00Z" }],
        NOW,
      ).topicId,
    ).toBe("t1");
  });

  it("abaixo de 0,82 não agrupa e devolve a melhor similaridade", () => {
    const r = assignTopic(
      item([0.8, 0.6]),
      [{ topicId: "t1", centroid: [1, 0], updatedAt: "2026-09-26T00:00:00Z" }],
      NOW,
    );
    expect(r).toEqual({ topicId: null, similarity: 0.8 });
  });

  it("escolhe o assunto mais próximo dentro da janela", () => {
    const r = assignTopic(
      item([1, 0.1]),
      [
        { topicId: "t1", centroid: [0.9, 0.44], updatedAt: "2026-09-26T00:00:00Z" },
        { topicId: "t2", centroid: [1, 0.05], updatedAt: "2026-09-26T12:00:00Z" },
        { topicId: "t3", centroid: [1, 0.1], updatedAt: "2026-09-20T00:00:00Z" },
      ],
      NOW,
    );
    expect(r.topicId).toBe("t2");
    expect(r.similarity).toBeGreaterThanOrEqual(CLUSTER_MIN_COSINE);
  });

  it("ignora centróide de dimensão diferente ou vazio", () => {
    const r = assignTopic(
      item([1, 0]),
      [
        { topicId: "t1", centroid: [1, 0, 0], updatedAt: "2026-09-26T00:00:00Z" },
        { topicId: "t2", centroid: [], updatedAt: "2026-09-26T00:00:00Z" },
      ],
      NOW,
    );
    expect(r.topicId).toBeNull();
  });
});

describe("embedding determinístico do provedor falso", () => {
  it("textos quase idênticos ficam acima de 0,90; assuntos diferentes, abaixo de 0,82", () => {
    const a = hashEmbedding("Cesta básica recua 2,1% em setembro na capital, aponta levantamento");
    const b = hashEmbedding("Cesta básica recua 2,1% em setembro na Capital, aponta levantamento");
    const c = hashEmbedding("Final da Copa Cuiabana de futebol amador será na Arena Pantanal");
    expect(cosine(a, b)).toBeGreaterThanOrEqual(0.9);
    expect(cosine(a, c)).toBeLessThan(0.82);
    expect(a).toHaveLength(1536);
    expect(hashEmbedding("x", 8)).toHaveLength(8);
  });

  it("mesmo assunto com redação próxima fica acima de 0,82", () => {
    const a = hashEmbedding(
      "Viaduto da Miguel Sutil entra em nova fase e interdita duas faixas da avenida",
    );
    const b = hashEmbedding("Viaduto da Miguel Sutil entra em nova fase e interdita faixas");
    expect(cosine(a, b)).toBeGreaterThanOrEqual(CLUSTER_MIN_COSINE);
  });
});

describe("etapas dedupe e cluster", () => {
  const embed = async (text: string) => ({ ok: true as const, value: hashEmbedding(text, 64) });

  function setup() {
    const repo = createMemoryClusterRepo();
    const queue = createMemoryQueue();
    const deps = { repo, embed, now: () => NOW };
    const classified: string[] = [];
    const runStep = createRunStep({
      dedupe: createDedupeStep(deps),
      cluster: createClusterStep(deps),
      classify: async (m) => {
        classified.push(m.itemRef);
        return { ok: true, value: [] };
      },
    });
    const events: PipelineEvent[] = [];
    const run = async (ids: string[]) => {
      for (const id of ids)
        await queue.enqueue("pipeline", {
          runId: "run-1",
          step: "dedupe",
          itemRef: `item:${id}`,
          attempt: 1,
        });
      return drain({
        queue,
        runStep,
        events: { record: async (e) => void events.push(...e) },
        now: () => 0,
        queues: ["pipeline"],
      });
    };
    return { repo, run, events, classified };
  }

  it("duplicado herda o assunto do original e não segue para cluster", async () => {
    const { repo, run, classified } = setup();
    repo.add({ id: "a", title: "Cesta básica recua 2,1% em setembro na capital" });
    repo.add({ id: "b", title: "Cesta básica recua 2,1% em setembro na Capital" });
    await run(["a"]);
    await run(["b"]);
    const a = repo.item("a")!;
    const b = repo.item("b")!;
    expect(a.topicId).not.toBeNull();
    expect(b.duplicateOf).toBe("a");
    expect(b.topicId).toBe(a.topicId);
    expect(repo.topics()).toHaveLength(1);
    expect(classified).toEqual(["item:a"]);
  });

  it("item novo cria assunto; item próximo entra no mesmo assunto e atualiza o centróide", async () => {
    const { repo, run, classified } = setup();
    repo.add({
      id: "a",
      title: "Viaduto da Miguel Sutil entra em nova fase e interdita duas faixas da avenida",
    });
    repo.add({ id: "b", title: "Viaduto da Miguel Sutil entra em nova fase e interdita faixas" });
    repo.add({ id: "c", title: "Festival de siriri e cururu volta à Orla do Porto em outubro" });
    const r = await run(["a", "b", "c"]);
    expect(r.quarantined).toBe(0);
    const a = repo.item("a")!;
    const b = repo.item("b")!;
    const c = repo.item("c")!;
    expect(b.duplicateOf).toBeNull();
    expect(b.topicId).toBe(a.topicId);
    expect(c.topicId).not.toBe(a.topicId);
    expect(repo.topics()).toHaveLength(2);
    const topic = repo.topics().find((t) => t.id === a.topicId)!;
    expect(topic.members).toEqual(["a", "b"]);
    expect(topic.updatedAt).toBe(NOW.toISOString());
    expect(classified).toEqual(["item:a", "item:b", "item:c"]);
  });

  it("reexecução não recalcula embedding nem cria outro assunto", async () => {
    const repo = createMemoryClusterRepo();
    let calls = 0;
    repo.add({ id: "a", title: "Mutirão de emprego oferece 800 vagas no Centro" });
    const deps = {
      repo,
      embed: async (t: string) => {
        calls++;
        return embed(t);
      },
      now: () => NOW,
    };
    const dedupe = createDedupeStep(deps);
    const cluster = createClusterStep(deps);
    const msg = { runId: "r", step: "dedupe" as const, itemRef: "item:a", attempt: 1 };
    await dedupe(msg);
    await dedupe(msg);
    await cluster({ ...msg, step: "cluster" });
    await cluster({ ...msg, step: "cluster" });
    expect(calls).toBe(1);
    expect(repo.topics()).toHaveLength(1);
  });

  it("falha no embedding é transitória; item inexistente vai para quarentena", async () => {
    const repo = createMemoryClusterRepo();
    repo.add({ id: "a", title: "Qualquer título" });
    const step = createDedupeStep({
      repo,
      embed: async () => ({ ok: false as const, error: "provider" }),
      now: () => NOW,
    });
    const r1 = await step({ runId: "r", step: "dedupe", itemRef: "item:a", attempt: 1 });
    expect(r1).toMatchObject({ ok: false, error: { kind: "transient", retryable: true } });
    const r2 = await step({ runId: "r", step: "dedupe", itemRef: "item:zzz", attempt: 1 });
    expect(r2).toMatchObject({ ok: false, error: { kind: "not_found" } });
  });
});
