// @vitest-environment node
// A-126: reescrita de matéria no ar. `save_pipeline_draft` com `live` atualiza o texto da matéria
// publicada pelas regras sem tirar do ar; sem `live` (ou com edição humana), recusa como antes.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { createPublishRepo } from "@/lib/db/pipeline-store";
import type { DraftInput } from "@/lib/pipeline/ports";

const db = createServiceClient();
const topic = "c4000000-0000-4000-8000-000000000002";
const slug = `ao-vivo-${randomUUID().slice(0, 8)}`;
let articleId = "";

afterAll(async () => {
  if (articleId) await db.from("articles").delete().eq("id", articleId);
});

const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", attrs: { citations: [] }, content: [{ type: "text", text }] }],
});

function input(text: string, over: Partial<DraftInput> = {}): DraftInput {
  return {
    topicId: topic,
    slug,
    sectionSlug: "cidade",
    title: "Título",
    dek: "Linha fina",
    body: doc(text),
    aiSummary: ["Resumo"],
    confidence: "média",
    confidenceScore: 0.6,
    status: "draft",
    aiFallback: false,
    reviewReason: null,
    sources: [],
    ...over,
  };
}

describe("reescrita de matéria no ar (banco real)", () => {
  it("live atualiza o texto e mantém publicada; sem live o banco recusa", async () => {
    const repo = createPublishRepo(db);
    await db.from("articles").delete().eq("topic_id", topic).eq("agent_id", "write");
    const first = await repo.saveDraft(input("Uma frase só."));
    articleId = first.articleId;
    await db
      .from("articles")
      .update({ status: "published", publish_mode: "auto", published_at: new Date().toISOString() })
      .eq("id", articleId);

    await expect(repo.saveDraft(input("Sem live."))).rejects.toThrow();

    const second = await repo.saveDraft(input("Texto completo da fonte.", { live: true }));
    expect(second.version).toBe(first.version + 1);
    const { data } = await db
      .from("articles")
      .select("status, publish_mode, body")
      .eq("id", articleId)
      .single();
    expect(data).toMatchObject({ status: "published", publish_mode: "auto" });
    expect(JSON.stringify(data?.body)).toContain("Texto completo da fonte.");

    // Edição humana bloqueia mesmo com live.
    await db.from("article_versions").insert({
      article_id: articleId,
      number: second.version + 1,
      snapshot: {},
      origin: "human",
      change_kind: "edit",
    });
    await expect(repo.saveDraft(input("Depois da pessoa.", { live: true }))).rejects.toThrow();
  });
});
