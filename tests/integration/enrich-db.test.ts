// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { createIngestRepo } from "@/lib/db/pipeline-store";

const db = createServiceClient();
const created: string[] = [];
afterAll(async () => {
  if (created.length) await db.from("collected_items").delete().in("id", created);
});

describe("enrich com banco real: collectedForEnrich e applyEnrichment", () => {
  it("lê o item e aplica só os campos presentes", async () => {
    const repo = createIngestRepo(db);
    const source = await repo.sourceBySlug("folha-do-cerrado");
    expect(source).not.toBeNull();
    const url = `https://folhadocerrado.example/teste/enrich-${randomUUID()}`;
    const { id } = await repo.insertCollectedItem({
      // `collected_items.raw_id` aceita nulo; o item de teste não tem documento bruto.
      rawId: undefined as unknown as string,
      sourceId: source!.id,
      canonicalUrl: url,
      originalTitle: "Titulo do slug",
      excerpt: null,
      author: null,
      publishedAt: "2026-10-02T16:00:00.000Z",
      imageUrl: null,
      locality: "cuiaba",
    });
    created.push(id);

    const before = await repo.collectedForEnrich(id);
    expect(before).toMatchObject({
      id,
      sourceId: source!.id,
      canonicalUrl: url,
      originalTitle: "Titulo do slug",
      excerpt: null,
      imageUrl: null,
    });
    const publishedMs = Date.parse("2026-10-02T16:00:00.000Z");
    expect(Date.parse(before!.publishedAt!)).toBe(publishedMs);

    await repo.applyEnrichment(id, {
      originalTitle: "Título do site",
      imageUrl: "https://folhadocerrado.example/img/x.jpg",
    });
    const after = await repo.collectedForEnrich(id);
    expect(after).toMatchObject({
      originalTitle: "Título do site",
      imageUrl: "https://folhadocerrado.example/img/x.jpg",
      excerpt: null,
    });
    expect(Date.parse(after!.publishedAt!)).toBe(publishedMs);

    await repo.applyEnrichment(id, {}); // sem campos: não faz nada
    expect(await repo.collectedForEnrich("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
