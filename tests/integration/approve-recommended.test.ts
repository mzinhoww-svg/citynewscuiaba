// @vitest-environment node
// UX-W3-T1 (item 46): "Aprovar recomendadas" aprova em lote só o que as regras recomendaram
// publicar; o resto volta com o motivo. Cada publicação passa pela guarda e pelo checklist de
// `publishArticle`, e o lote fica auditado como `article.bulk_approve`.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "@/lib/db/types";
import { approveRecommended } from "@/lib/studio/approve-recommended";
import { asUser, lastAudit, SEED_USERS, service } from "./studio";

const ids = { a: randomUUID(), b: randomUUID(), c: randomUUID(), d: randomUUID() };
const body: NonNullable<Json> = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Texto de teste." }] }],
};

async function create(id: string, recommended: string | null) {
  const { error } = await service.from("articles").insert({
    id,
    slug: `teste-lote-${id.slice(0, 8)}`,
    kind: "original",
    section_slug: "cultura",
    title: "Festival de teatro de teste abre inscrições",
    dek: "Grupos de Cuiabá podem se inscrever até sexta.",
    body,
    status: "in_review",
    author_id: SEED_USERS.juliana.id,
    tags: ["teatro"],
    neighborhoods: ["porto"],
    seo_title: "Festival de teatro abre inscrições",
    seo_description: "Grupos de Cuiabá podem se inscrever até sexta no festival.",
  });
  if (error) throw error;
  await service.from("article_versions").insert({
    article_id: id,
    number: 1,
    snapshot: { title: "x", dek: "y", body },
    origin: "human",
  });
  if (recommended) {
    const d = await service.from("decisions").insert({
      object_ref: `article:${id}`,
      step: "rules",
      rules_version: 1,
      input_hash: `teste-${id}`,
      output: { route: recommended },
      recommended,
      rationale: "Regra de teste",
    });
    if (d.error) throw d.error;
  }
}

beforeAll(async () => {
  await create(ids.a, "publish");
  await create(ids.b, "publish_notify");
  await create(ids.c, "review");
  await create(ids.d, "publish");
});
afterAll(async () => {
  const all = Object.values(ids);
  await service
    .from("decisions")
    .delete()
    .in(
      "object_ref",
      all.map((i) => `article:${i}`),
    );
  await service.from("articles").delete().in("id", all);
});

describe("approveRecommended", () => {
  it("3 itens, 1 sem recomendação de publicar: aprova 2 e diz por que pulou o outro", async () => {
    const r = await asUser("marina", () => approveRecommended([ids.a, ids.b, ids.c]));
    expect(r.approved).toBe(2);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]).toMatchObject({ id: ids.c, reason: "not_recommended" });

    const { data } = await service
      .from("articles")
      .select("id, status, publish_mode")
      .in("id", [ids.a, ids.b, ids.c]);
    const by = new Map((data ?? []).map((a) => [a.id, a]));
    expect(by.get(ids.a)).toMatchObject({ status: "published", publish_mode: "human" });
    expect(by.get(ids.b)).toMatchObject({ status: "published", publish_mode: "human" });
    expect(by.get(ids.c)?.status).toBe("in_review");

    expect(await lastAudit(SEED_USERS.marina.id)).toMatchObject({
      action: "article.bulk_approve",
      details: { approved: [ids.a, ids.b], skipped: [{ id: ids.c, reason: "not_recommended" }] },
    });
  });

  it("quem não publica não aprova nada (forbidden em cada item)", async () => {
    const r = await asUser("rafael", () => approveRecommended([ids.d]));
    expect(r).toEqual({ approved: 0, skipped: [{ id: ids.d, reason: "forbidden" }] });
    const { data } = await service.from("articles").select("status").eq("id", ids.d).single();
    expect(data?.status).toBe("in_review");
  });
});
