// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { hashEmbedding } from "@/lib/ai/hash-embedding";
import { createServiceClient } from "@/lib/db/client";
import { createClusterRepo } from "@/lib/db/pipeline-store";
import { createClusterStep } from "@/lib/pipeline/steps/cluster";
import { createDedupeStep } from "@/lib/pipeline/steps/dedupe";

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

afterAll(async () => {
  const { data } = await db.from("collected_items").select("topic_id").in("id", created);
  const topics = [...new Set((data ?? []).map((r) => r.topic_id).filter((t) => t !== null))];
  await db.from("collected_items").update({ duplicate_of: null }).in("id", created);
  await db.from("collected_items").delete().in("id", created);
  if (topics.length > 0) await db.from("topics").delete().in("id", topics);
});

describe("dedupe e cluster com banco real", () => {
  it("duplicado, mesmo assunto, assunto novo e centróide médio", async () => {
    const tag = randomUUID().slice(0, 8);
    const deps = {
      repo: createClusterRepo(db),
      embed: async (t: string) => ({ ok: true as const, value: hashEmbedding(t) }),
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

    const a = await insertItem(
      FOLHA,
      `Viaduto ${tag} da Miguel Sutil entra em nova fase e interdita duas faixas da avenida`,
    );
    const b = await insertItem(
      MT_AGORA,
      `Viaduto ${tag} da Miguel Sutil entra em nova fase e interdita duas faixas da Avenida`,
    );
    const c = await insertItem(
      MT_AGORA,
      `Viaduto ${tag} da Miguel Sutil entra em nova fase e interdita pistas`,
    );
    const d = await insertItem(FOLHA, `Festival ${tag} de siriri e cururu volta à Orla do Porto`);
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
      .select("title, slug")
      .eq("id", ia!.topicId!)
      .single();
    expect(topic?.title).toContain(tag);
    expect(topic?.slug).toMatch(/^viaduto-/);
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
