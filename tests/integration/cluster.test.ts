// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { hashEmbedding } from "@/lib/ai/hash-embedding";
import { createServiceClient } from "@/lib/db/client";
import { createClusterRepo } from "@/lib/db/pipeline-store";
import { hamming, simhash64 } from "@/lib/pipeline/simhash";
import { CLUSTER_MIN_COSINE, createClusterStep } from "@/lib/pipeline/steps/cluster";
import {
  DEDUPE_MAX_HAMMING,
  DEDUPE_MIN_COSINE,
  createDedupeStep,
} from "@/lib/pipeline/steps/dedupe";
import { textTokens } from "@/lib/pipeline/text-features";
import { cosine } from "@/lib/pipeline/vector";

const FOLHA = "c5000000-0000-4000-8000-000000000001";
const MT_AGORA = "c5000000-0000-4000-8000-000000000003";
const db = createServiceClient();
const created: string[] = [];

async function insertItem(sourceId: string, title: string): Promise<string> {
  const { data, error } = await db
    .from("collected_items")
    .insert({
      source_id: sourceId,
      canonical_url: `https://teste.example/${randomUUID()}`,
      original_title: title,
      locality: "cuiaba",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "insert falhou");
  created.push(data.id);
  return data.id;
}

const titles = (tag: string) => ({
  a: `Viaduto ${tag} da Miguel Sutil entra em nova fase e interdita duas faixas da avenida`,
  b: `Viaduto ${tag} da Miguel Sutil entra em nova fase e interdita duas faixas da Avenida`,
  c: `Viaduto ${tag} da Miguel Sutil entra em nova fase e interdita pistas`,
  d: `Festival ${tag} de siriri e cururu volta à Orla do Porto`,
});

/**
 * Marcador único da execução, escolhido para não mudar a geometria do embedding falso.
 * O embedding de hash (1536 posições) põe cada token numa posição com sinal; um marcador
 * aleatório que cai na posição de outra palavra do título desloca o cosseno de a × c de 0,840
 * para 0,816 (abaixo de 0,82) em ~0,4% dos UUIDs, e c abria um assunto próprio. Aqui o marcador
 * só vale se for ortogonal a todas as outras palavras e se a × c não virar duplicado por simhash.
 */
function pickTag(): string {
  const words = [...new Set(Object.values(titles("")).flatMap((t) => textTokens(t)))];
  for (;;) {
    const tag = randomUUID().slice(0, 8);
    const v = hashEmbedding(tag);
    if (words.some((w) => cosine(v, hashEmbedding(w)) !== 0)) continue;
    const t = titles(tag);
    if (hamming(simhash64(t.a), simhash64(t.c)) <= DEDUPE_MAX_HAMMING) continue;
    return tag;
  }
}

afterAll(async () => {
  const { data } = await db.from("collected_items").select("topic_id").in("id", created);
  const topics = [...new Set((data ?? []).map((r) => r.topic_id).filter((t) => t !== null))];
  await db.from("collected_items").update({ duplicate_of: null }).in("id", created);
  await db.from("collected_items").delete().in("id", created);
  if (topics.length > 0) await db.from("topics").delete().in("id", topics);
});

describe("dedupe e cluster com banco real", () => {
  it("duplicado, mesmo assunto, assunto novo e centróide médio", async () => {
    const tag = pickTag();
    const t = titles(tag);
    // Pré-condição do cenário: c é do mesmo assunto de a sem ser duplicado dele.
    const cosAC = cosine(hashEmbedding(t.a), hashEmbedding(t.c));
    expect(cosAC).toBeGreaterThanOrEqual(CLUSTER_MIN_COSINE);
    expect(cosAC).toBeLessThan(DEDUPE_MIN_COSINE);
    const deps = {
      repo: createClusterRepo(db),
      embed: async (text: string) => ({ ok: true as const, value: hashEmbedding(text) }),
      now: () => new Date(),
    };
    const dedupe = createDedupeStep(deps);
    const cluster = createClusterStep(deps);
    const run = async (id: string) => {
      const msg = { runId: "r", step: "dedupe" as const, itemRef: `item:${id}`, attempt: 1 };
      const d = await dedupe(msg);
      if (d.ok && d.value.length > 0) return cluster({ ...msg, step: "cluster" });
      return d;
    };

    const a = await insertItem(FOLHA, t.a);
    const b = await insertItem(MT_AGORA, t.b);
    const c = await insertItem(MT_AGORA, t.c);
    const d = await insertItem(FOLHA, t.d);
    for (const id of [a, b, c, d]) expect((await run(id)).ok).toBe(true);
    // Reexecução é idempotente.
    expect((await run(a)).ok).toBe(true);

    const repo = createClusterRepo(db);
    const [ia, ib, ic, id] = await Promise.all([a, b, c, d].map((x) => repo.collectedItem(x)));
    expect(ia?.simhash).not.toBeNull();
    expect(ia?.embedding).toHaveLength(1536);
    expect(ib?.duplicateOf).toBe(a);
    expect(ib?.topicId).toBe(ia?.topicId);
    expect(ic?.duplicateOf).toBeNull();
    expect(ic?.topicId).toBe(ia?.topicId);
    expect(id?.topicId).not.toBe(ia?.topicId);

    const { data: topic } = await db
      .from("topics")
      .select("title, slug, visibility")
      .eq("id", ia!.topicId!)
      .single();
    // Assunto do pipeline nasce interno, com título provisório próprio (nunca a manchete da fonte).
    expect(topic?.title).toBe("Assunto em apuração");
    expect(topic?.title).not.toContain(tag);
    expect(topic?.slug).toMatch(/^apuracao-/);
    expect(topic?.visibility).toBe("internal");
    const cands = await repo.topicCandidates(a, {
      since: new Date(Date.now() - 3600_000),
      limit: 5,
    });
    const centroid = cands.find((t) => t.topicId === ia!.topicId)!.centroid;
    const mean = ia!.embedding!.map((x, i) => (x + ic!.embedding![i]!) / 2);
    expect(centroid[0]).toBeCloseTo(mean[0]!, 5);
    expect(centroid.reduce((s, x, i) => s + Math.abs(x - mean[i]!), 0)).toBeLessThan(1e-3);
  });
});
