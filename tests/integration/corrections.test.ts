// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listCorrections } from "@/lib/db/queries";
import type { Json } from "@/lib/db/types";
import { openCorrection, publishCorrection } from "@/lib/studio/corrections";
import { asUser, lastAudit, SEED_USERS, service } from "./studio";

describe("correções públicas (P1-T10)", () => {
  it("lista as correções publicadas com data e link para a matéria", async () => {
    const r = await listCorrections();
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    const c = r.value.find((x) => /20 minutos, não 18/.test(x.note));
    expect(c).toBeDefined();
    expect(c?.publishedAt).toBeTruthy();
    expect(c?.article?.href).toBe("/materia/com-fumaca-escolas-ajustam-horario-de-educacao-fisica");
  });
});

// ---------------------------------------------------------------------------
// P4-T6 · correção pelo Estúdio (Review Focus 3): nota pública, versão "correction" e aviso
// para quem salvou a matéria.
// ---------------------------------------------------------------------------

const art = randomUUID();
const savers = [randomUUID(), randomUUID()];
const draft = (t: string) => ({
  type: "doc" as const,
  content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
});
const doc = (t: string): NonNullable<Json> => draft(t);
let correctionId = "";

beforeAll(async () => {
  const { error } = await service.from("articles").insert({
    id: art,
    slug: `teste-correcao-${art.slice(0, 8)}`,
    kind: "original",
    section_slug: "cidade",
    title: "Feira do Porto muda de horário",
    dek: "Feira passa a abrir às 5h.",
    body: doc("A feira do Porto abre às 5h e fecha às 13h."),
    status: "published",
    publish_mode: "human",
    published_at: new Date(Date.now() - 3_600_000).toISOString(),
    author_id: SEED_USERS.rafael.id,
  });
  if (error) throw error;
  await service.from("article_versions").insert({
    article_id: art,
    number: 1,
    snapshot: { title: "Feira do Porto muda de horário", dek: "x", body: doc("x") },
    origin: "human",
    author_id: SEED_USERS.rafael.id,
  });
  await service
    .from("saved_items")
    .insert(savers.map((s) => ({ owner_ref: s, content_ref: `article:${art}` })));
});

afterAll(async () => {
  await service.from("reader_notifications").delete().eq("content_ref", `article:${art}`);
  await service.from("saved_items").delete().eq("content_ref", `article:${art}`);
  // Correção publicada é registro público: some junto com a matéria de teste (service role).
  await service.from("corrections").delete().eq("article_id", art);
  await service.from("articles").delete().eq("id", art);
});

describe("correção pelo Estúdio (P4-T6)", () => {
  it("abre pedido de correção com prazo e solicitante", async () => {
    const r = await asUser("beatriz", () =>
      openCorrection({ articleId: art, kind: "correction", requestedBy: "leitor" }),
    );
    expect(r.ok).toBe(true);
    correctionId = r.ok ? r.value.id : "";
    const { data } = await service
      .from("corrections")
      .select("status, requested_by, due_at, published_at")
      .eq("id", correctionId)
      .single();
    expect(data).toMatchObject({ status: "open", requested_by: "leitor", published_at: null });
    expect(new Date(data!.due_at!).getTime()).toBeGreaterThan(Date.now());
  });

  it("jornalista não publica correção", async () => {
    const r = await asUser("rafael", () =>
      publishCorrection({
        id: correctionId,
        baseVersion: 1,
        doc: { title: "x", dek: "y", body: draft("z") },
        publicNote: "Nota",
        notifySavers: true,
      }),
    );
    expect(r).toEqual({ ok: false, error: "forbidden" });
  });

  it("publicar correção cria versão correction com nota pública, aparece em /correcoes e avisa quem salvou", async () => {
    const note = "A feira abre às 6h, não às 5h, como informado na primeira versão.";
    const tags: string[] = [];
    const r = await asUser(
      "beatriz",
      () =>
        publishCorrection({
          id: correctionId,
          baseVersion: 1,
          doc: {
            title: "Feira do Porto muda de horário",
            dek: "Feira passa a abrir às 6h.",
            body: draft("A feira do Porto abre às 6h e fecha às 13h."),
          },
          publicNote: note,
          notifySavers: true,
        }),
      { revalidate: async (t) => void tags.push(...t) },
    );
    expect(r).toMatchObject({ ok: true, value: { version: 2, notified: 2 } });

    const { data: v } = await service
      .from("article_versions")
      .select("change_kind, public_note, origin, author_id")
      .eq("article_id", art)
      .eq("number", 2)
      .single();
    expect(v).toEqual({
      change_kind: "correction",
      public_note: note,
      origin: "human",
      author_id: SEED_USERS.beatriz.id,
    });
    const { data: a } = await service.from("articles").select("status, dek").eq("id", art).single();
    expect(a).toEqual({ status: "updated", dek: "Feira passa a abrir às 6h." });
    // Snapshot no mesmo formato das outras versões (gate P4, achado 16): o E05 compara igual.
    const { data: snap } = await service
      .from("article_versions")
      .select("snapshot")
      .eq("article_id", art)
      .eq("number", 2)
      .single();
    expect(Object.keys(snap?.snapshot as object).sort()).toEqual(
      [
        "body",
        "dek",
        "fieldOrigins",
        "neighborhoods",
        "sectionSlug",
        "seoDescription",
        "seoTitle",
        "tags",
        "title",
      ].sort(),
    );

    const list = await listCorrections();
    if (!list.ok) throw new Error(JSON.stringify(list.error));
    expect(list.value.find((c) => c.note === note)?.article?.href).toBe(
      `/materia/teste-correcao-${art.slice(0, 8)}`,
    );

    const { data: n } = await service
      .from("reader_notifications")
      .select("owner_ref, kind, title")
      .eq("content_ref", `article:${art}`);
    expect(n?.map((x) => x.owner_ref).sort()).toEqual([...savers].sort());
    expect(n?.every((x) => x.kind === "correction")).toBe(true);
    expect(tags).toEqual(expect.arrayContaining([`article:${art}`, "corrections"]));
    expect(await lastAudit(SEED_USERS.beatriz.id)).toMatchObject({
      action: "correction.publish",
      object_ref: `article:${art}`,
    });
  });

  it("correção já publicada não é publicada de novo", async () => {
    const r = await asUser("beatriz", () =>
      publishCorrection({
        id: correctionId,
        baseVersion: 2,
        doc: { title: "x", dek: "y", body: draft("z") },
        publicNote: "Outra nota",
        notifySavers: false,
      }),
    );
    expect(r).toMatchObject({ ok: false, error: "invalid" });
  });
});
