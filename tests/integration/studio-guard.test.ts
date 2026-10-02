// @vitest-environment node
// Guarda de papel e auditoria das Server Actions do Estúdio (P4-T1, Review Focus 2): chamada
// direta sem permissão devolve `forbidden` e deixa rastro no audit_log.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { publishArticle } from "@/lib/studio/publish";
import { studioAction, StudioFailure } from "@/lib/studio/action";
import { audit } from "@/lib/audit";
import { asUser, lastAudit, SEED_USERS } from "./studio";

const seedArticle = { id: "c2000000-0000-4000-8000-000000000002" }; // cidade, de Rafael

describe("guarda do Estúdio", () => {
  it("jornalista chamando publish recebe forbidden e fica auditado", async () => {
    const r = await asUser("rafael", () => publishArticle({ id: seedArticle.id, when: "now" }));
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(await lastAudit(SEED_USERS.rafael.id)).toMatchObject({
      action: "article.publish.denied",
      object_ref: `article:${seedArticle.id}`,
    });
  });

  it("sem sessão recebe forbidden sem executar", async () => {
    let ran = false;
    const act = studioAction(
      "article.edit",
      () => ({}),
      async () => {
        ran = true;
        return 1;
      },
    );
    const { runWithStudioContext } = await import("@/lib/studio/context");
    const r = await runWithStudioContext(
      {
        session: null,
        db: (await import("./studio")).service,
        revalidate: async () => {},
        now: () => new Date(),
      },
      () => act({}),
    );
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(ran).toBe(false);
  });

  it("entrada inválida volta invalid com mensagem, antes da guarda", async () => {
    const act = studioAction(
      "article.edit",
      () => ({}),
      async () => 1,
      { schema: z.object({ id: z.uuid() }), objectRef: () => "article:x" },
    );
    const r = await asUser("marina", () => act({ id: "nao-e-uuid" }));
    expect(r).toMatchObject({ ok: false, error: "invalid" });
  });

  it("escopo por editoria: editor fora da editoria dele é negado", async () => {
    const act = studioAction(
      "article.publish",
      () => ({ section: "politica" }),
      async () => "ok",
      { objectRef: () => "article:teste-escopo" },
    );
    expect(await asUser("otavio", () => act({}))).toEqual({ ok: false, error: "forbidden" });
    expect(await lastAudit(SEED_USERS.otavio.id)).toMatchObject({
      action: "article.publish.denied",
      object_ref: "article:teste-escopo",
      details: { scope: { section: "politica" } },
    });
  });

  it("sucesso audita a ação com os detalhes informados", async () => {
    const act = studioAction(
      "article.edit",
      () => ({ section: "cidade" }),
      async (_i: { n: number }, ctx) => {
        ctx.detail({ motivo: "teste" });
        return ctx.userId;
      },
      { objectRef: () => "article:teste-sucesso" },
    );
    const r = await asUser("marina", () => act({ n: 1 }));
    expect(r).toEqual({ ok: true, value: SEED_USERS.marina.id });
    expect(await lastAudit(SEED_USERS.marina.id)).toMatchObject({
      action: "article.edit",
      object_ref: "article:teste-sucesso",
      details: { motivo: "teste" },
    });
  });

  it("falha de domínio vira erro tipado com mensagem", async () => {
    const act = studioAction(
      "article.edit",
      () => ({ section: "cidade" }),
      async () => {
        throw new StudioFailure("conflict", "Outra pessoa salvou antes");
      },
      { objectRef: () => "article:teste-conflito" },
    );
    expect(await asUser("marina", () => act({}))).toEqual({
      ok: false,
      error: "conflict",
      message: "Outra pessoa salvou antes",
    });
  });

  it("audit grava em nome de quem está na sessão e nunca de outra pessoa", async () => {
    await asUser("beatriz", () =>
      audit(SEED_USERS.beatriz.id, "media.block", "media:teste", { ok: true }),
    );
    expect(await lastAudit(SEED_USERS.beatriz.id)).toMatchObject({
      action: "media.block",
      object_ref: "media:teste",
    });
    await expect(
      asUser("beatriz", () => audit(SEED_USERS.marina.id, "media.block", "media:teste")),
    ).rejects.toThrow();
  });
});
