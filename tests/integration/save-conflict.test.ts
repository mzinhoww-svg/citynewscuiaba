// @vitest-environment node
// Salvamento com versão base (P4-T3, Review Focus 1): dois editores abrem a mesma matéria e
// salvam; o segundo recebe conflito com diff e nada é sobrescrito.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveDraft, acceptSuggestion, type DraftDoc } from "@/lib/studio/save";
import type { Json } from "@/lib/db/types";
import { asUser, SEED_USERS, service, lastAudit } from "./studio";

const id = randomUUID();
const para = (text: string) => ({
  type: "doc" as const,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const bodyJson = (text: string): NonNullable<Json> => para(text);
const BODY = "A linha 507 passa a circular pela avenida principal do CPA.";
const base: DraftDoc = {
  title: "Linha 507 muda de itinerário no CPA",
  dek: "Mudança vale a partir de segunda.",
  body: para(BODY),
};

beforeAll(async () => {
  const { error } = await service.from("articles").insert({
    id,
    slug: `teste-salvar-${id.slice(0, 8)}`,
    kind: "original",
    section_slug: "cidade",
    title: base.title,
    dek: base.dek,
    body: bodyJson(BODY),
    status: "draft",
    author_id: SEED_USERS.juliana.id,
  });
  if (error) throw error;
  await service.from("article_versions").insert({
    article_id: id,
    number: 1,
    snapshot: { title: base.title, dek: base.dek, body: bodyJson(BODY) },
    origin: "human",
    author_id: SEED_USERS.juliana.id,
  });
});
afterAll(async () => {
  await service.from("article_suggestions").delete().eq("article_id", id);
  await service.from("articles").delete().eq("id", id);
});

describe("saveDraft", () => {
  it("salvar com versão base desatualizada retorna conflict", async () => {
    const a = { ...base, title: "Linha 507 muda de itinerário no CPA a partir de segunda" };
    const b = { ...base, title: "Linha 507 deixa de passar pela avenida do CPA" };
    expect(await asUser("marina", () => saveDraft({ id, baseVersion: 1, doc: a }))).toEqual({
      ok: true,
      value: { version: 2, unscheduled: false },
    });
    const second = await asUser("otavio", () => saveDraft({ id, baseVersion: 1, doc: b }));
    expect(second).toMatchObject({ ok: false, error: "conflict" });
    // O conflito traz a versão atual e o diff do título salvo × o que a pessoa tentou salvar.
    expect(second.ok ? null : second.data).toMatchObject({
      version: 2,
      diff: {
        title: expect.arrayContaining([{ op: "del", text: "segunda" }]),
      },
    });
    // Nada foi sobrescrito.
    const { data } = await service.from("articles").select("title").eq("id", id).single();
    expect(data?.title).toBe(a.title);
    const { count } = await service
      .from("article_versions")
      .select("*", { count: "exact", head: true })
      .eq("article_id", id);
    expect(count).toBe(2);
  });

  it("versão nova é humana, com autor, e fica auditada", async () => {
    const r = await asUser("juliana", () =>
      saveDraft({ id, baseVersion: 2, doc: { ...base, dek: "Mudança vale já na segunda." } }),
    );
    expect(r).toEqual({ ok: true, value: { version: 3, unscheduled: false } });
    const { data: v } = await service
      .from("article_versions")
      .select("origin, author_id, change_kind, snapshot")
      .eq("article_id", id)
      .eq("number", 3)
      .single();
    expect(v).toMatchObject({
      origin: "human",
      author_id: SEED_USERS.juliana.id,
      change_kind: "edit",
      snapshot: { dek: "Mudança vale já na segunda." },
    });
    expect(await lastAudit(SEED_USERS.juliana.id)).toMatchObject({
      action: "article.save",
      object_ref: `article:${id}`,
      details: { version: 3 },
    });
  });

  it("jornalista não salva matéria de outra pessoa", async () => {
    const r = await asUser("rafael", () => saveDraft({ id, baseVersion: 3, doc: base }));
    expect(r).toEqual({ ok: false, error: "forbidden" });
  });

  it("aceitar sugestão de título marca origem IA e autor humano", async () => {
    const { data: s } = await service
      .from("article_suggestions")
      .insert({
        article_id: id,
        field: "title",
        value: "Linha 507 passa a circular pela avenida principal do CPA",
        agent_id: "write",
        prompt_version: 3,
      })
      .select("id")
      .single();
    const r = await asUser("juliana", () =>
      acceptSuggestion({ id: s!.id, articleId: id, baseVersion: 3 }),
    );
    expect(r).toMatchObject({ ok: true, value: { version: 4 } });
    const { data: a } = await service
      .from("articles")
      .select("title, field_origins")
      .eq("id", id)
      .single();
    expect(a?.title).toBe("Linha 507 passa a circular pela avenida principal do CPA");
    expect(a?.field_origins).toMatchObject({
      title: {
        origin: "ai",
        agentId: "write",
        promptVersion: 3,
        acceptedBy: SEED_USERS.juliana.id,
      },
    });
    // Só o id: o nome é resolvido na leitura (gate P4, achado 5).
    expect(JSON.stringify(a?.field_origins)).not.toContain("Juliana");
    const { data: after } = await service
      .from("article_suggestions")
      .select("status, decided_by")
      .eq("id", s!.id)
      .single();
    expect(after).toEqual({ status: "accepted", decided_by: SEED_USERS.juliana.id });
  });

  it("editar o campo à mão troca a origem para humana", async () => {
    const r = await asUser("juliana", () =>
      saveDraft({ id, baseVersion: 4, doc: { ...base, title: "Linha 507 muda no CPA" } }),
    );
    expect(r.ok).toBe(true);
    const { data: a } = await service
      .from("articles")
      .select("field_origins")
      .eq("id", id)
      .single();
    expect(a?.field_origins).toMatchObject({
      title: { origin: "human", editedBy: SEED_USERS.juliana.id },
    });
  });
});
