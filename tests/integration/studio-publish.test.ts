// @vitest-environment node
// Publicação e agendamento pelo Estúdio (P4-T5, Review Focus 5): horário passado é recusado;
// publicar define modo humano, status, versão e invalida o cache; agendada publica na hora.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "@/lib/db/types";
import { publishArticle } from "@/lib/studio/publish";
import { asUser, lastAudit, SEED_USERS, service } from "./studio";

const ids = { now: randomUUID(), later: randomUUID(), incomplete: randomUUID() };
const body: NonNullable<Json> = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Texto de teste." }] }],
};

async function create(id: string, complete: boolean) {
  const { error } = await service.from("articles").insert({
    id,
    slug: `teste-publicar-${id.slice(0, 8)}`,
    kind: "original",
    section_slug: "cultura",
    title: "Festival de teatro de teste abre inscrições",
    dek: "Grupos de Cuiabá podem se inscrever até sexta.",
    body,
    status: "in_review",
    author_id: SEED_USERS.juliana.id,
    tags: complete ? ["teatro"] : [],
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
}

beforeAll(async () => {
  await create(ids.now, true);
  await create(ids.later, true);
  await create(ids.incomplete, false);
});
afterAll(async () => {
  await service.from("articles").delete().in("id", Object.values(ids));
});

describe("publishArticle", () => {
  it("agendamento para horário passado é recusado com mensagem", async () => {
    const r = await asUser("marina", () =>
      publishArticle({ id: ids.later, when: { at: "2020-01-01T08:00" }, destinations: ["home"] }),
    );
    expect(r).toEqual({ ok: false, error: "invalid", message: "Escolha um horário futuro" });
  });

  it("publicar define modo humano, status, versão e dispara revalidateTag", async () => {
    const tags: string[] = [];
    const r = await asUser(
      "marina",
      () => publishArticle({ id: ids.now, when: "now", destinations: ["home", "section"] }),
      { revalidate: async (t) => void tags.push(...t) },
    );
    expect(r).toMatchObject({ ok: true, value: { status: "published" } });
    const { data: a } = await service
      .from("articles")
      .select("status, publish_mode, published_at, publish_destinations")
      .eq("id", ids.now)
      .single();
    expect(a).toMatchObject({
      status: "published",
      publish_mode: "human",
      publish_destinations: ["home", "section"],
    });
    expect(a?.published_at).toBeTruthy();
    const { data: v } = await service
      .from("article_versions")
      .select("number, origin, author_id")
      .eq("article_id", ids.now)
      .order("number", { ascending: false })
      .limit(1)
      .single();
    expect(v).toEqual({ number: 2, origin: "human", author_id: SEED_USERS.marina.id });
    expect(tags).toEqual(expect.arrayContaining([`article:${ids.now}`, "section:cultura", "home"]));
    expect(await lastAudit(SEED_USERS.marina.id)).toMatchObject({
      action: "article.publish",
      details: { when: "now", destinations: ["home", "section"] },
    });
  });

  it("checklist incompleto bloqueia com o motivo", async () => {
    const r = await asUser("marina", () =>
      publishArticle({ id: ids.incomplete, when: "now", destinations: ["home"] }),
    );
    expect(r).toEqual({ ok: false, error: "invalid", message: "Falta editoria, tag ou local" });
  });

  it("agendada fica fora do portal e publica quando chega a hora", async () => {
    const at = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const r = await asUser("marina", () =>
      publishArticle({ id: ids.later, when: { at }, destinations: ["section"] }),
    );
    expect(r).toMatchObject({ ok: true, value: { status: "scheduled", scheduledFor: at } });
    const { data: before } = await service
      .from("articles")
      .select("status, scheduled_for, published_at")
      .eq("id", ids.later)
      .single();
    expect(before).toMatchObject({ status: "scheduled", published_at: null });

    // A hora chega: o job (pg_cron a cada minuto ou o tick) publica o que venceu, com a data
    // agendada. O pg_cron pode chegar antes desta chamada; o estado final é o mesmo.
    const past = new Date(Date.now() - 60_000).toISOString();
    await service.from("articles").update({ scheduled_for: past }).eq("id", ids.later);
    const { error } = await service.rpc("publish_due_scheduled");
    expect(error).toBeNull();
    const { data: after } = await service
      .from("articles")
      .select("status, publish_mode, published_at")
      .eq("id", ids.later)
      .single();
    expect(after?.status).toBe("published");
    expect(after?.publish_mode).toBe("human");
    expect(new Date(after!.published_at!).toISOString()).toBe(past);
  });

  it("editor fora da editoria não publica", async () => {
    const r = await asUser("otavio", () =>
      publishArticle({ id: ids.incomplete, when: "now", destinations: [] }),
    );
    expect(r).toEqual({ ok: false, error: "forbidden" });
  });
});
