// @vitest-environment node
// AUT-T5 (A9): a 3ª denúncia aberta em 24 h na mesma matéria abre um item urgente (uma vez) e liga
// o banner público; resolver o item desliga o banner. Migration 0140.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { saveReport } from "@/lib/db/writes";
import { resolveEscalation } from "@/lib/studio/report-escalate";
import { asUser, clientOf } from "./studio";

const service = createServiceClient();
const tag = randomUUID().slice(0, 8);
const articles: string[] = [];

afterAll(async () => {
  if (articles.length) {
    const refs = articles.map((a) => `article:${a}`);
    await service.from("review_escalations").delete().in("article_id", articles);
    await service.from("reports").delete().in("content_ref", refs);
    await service.from("articles").delete().in("id", articles);
  }
});

async function published(): Promise<string> {
  const a = await service
    .from("articles")
    .insert({
      slug: `aut5-${tag}-${articles.length}`,
      kind: "original",
      section_slug: "cidade",
      title: "Matéria de teste da escalada",
      dek: "Linha fina.",
      body: { type: "doc", content: [] },
      status: "published",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (a.error) throw new Error(a.error.message);
  articles.push(a.data.id);
  return a.data.id;
}

async function report(id: string, kind = "wrong_info", createdAt?: string) {
  const r = await service.from("reports").insert({
    content_ref: `article:${id}`,
    kind,
    message: "teste",
    ...(createdAt ? { created_at: createdAt } : {}),
  });
  if (r.error) throw new Error(r.error.message);
}

const state = async (id: string) => {
  const a = await service.from("articles").select("review_banner").eq("id", id).single();
  const e = await service
    .from("review_escalations")
    .select("id, status, report_count, kind")
    .eq("article_id", id);
  return { banner: a.data?.review_banner, escalations: e.data ?? [] };
};

describe("report_escalate", () => {
  it("2 denúncias não escalam; a 3ª liga o banner e abre um item urgente; a 4ª não duplica", async () => {
    const id = await published();
    await report(id);
    await report(id, "image");
    expect(await state(id)).toEqual({ banner: false, escalations: [] });

    await report(id, "other");
    const s3 = await state(id);
    expect(s3.banner).toBe(true);
    expect(s3.escalations).toHaveLength(1);
    expect(s3.escalations[0]).toMatchObject({
      kind: "report_urgent",
      status: "open",
      report_count: 3,
    });

    await report(id, "broken_link");
    const s4 = await state(id);
    expect(s4.escalations).toHaveLength(1);
    expect(s4.escalations[0]).toMatchObject({ report_count: 4 });

    // Gancho de evento para a central de notificações do Estúdio: uma linha de auditoria.
    const audit = await service
      .from("audit_log")
      .select("action, actor")
      .eq("object_ref", `article:${id}`)
      .eq("action", "report.escalate");
    expect(audit.data).toHaveLength(1);
    // Aviso na central do Control Center e na fila do plantão, uma vez por canal.
    const notes = await service
      .from("notifications")
      .select("channel, severity")
      .eq("object_ref", `article:${id}`)
      .eq("kind", "report_escalated");
    expect((notes.data ?? []).map((n) => n.channel).sort()).toEqual([
      "control_center",
      "oncall_email",
    ]);
    expect((notes.data ?? []).every((n) => n.severity === "critical")).toBe(true);
  });

  it("denúncia fora das 24 h e direito de resposta não contam", async () => {
    const id = await published();
    const old = new Date(Date.now() - 30 * 3_600_000).toISOString();
    await report(id, "wrong_info", old);
    await report(id, "wrong_info", old);
    await report(id, "right_of_reply");
    await report(id, "right_of_reply");
    await report(id);
    expect(await state(id)).toEqual({ banner: false, escalations: [] });
  });

  it("denúncia de evento ou de outro conteúdo não liga banner em matéria", async () => {
    const id = await published();
    for (let i = 0; i < 3; i++)
      await service.from("reports").insert({ content_ref: `event:${randomUUID()}`, kind: "other" });
    expect(await state(id)).toEqual({ banner: false, escalations: [] });
  });

  it("saveReport (rota pública) também escala", async () => {
    const id = await published();
    for (let i = 0; i < 3; i++) {
      const r = await saveReport({
        contentRef: `article:${id}`,
        kind: "wrong_info",
        message: null,
        contactEmail: null,
      });
      expect(r.ok).toBe(true);
    }
    expect((await state(id)).banner).toBe(true);
  });
});

describe("resolução humana", () => {
  it("quem modera resolve: item encerrado e banner desligado; repetir é recusado", async () => {
    const id = await published();
    for (let i = 0; i < 3; i++) await report(id);
    const esc = (await state(id)).escalations[0]!;

    const r = await asUser("carlos", () => resolveEscalation({ id: esc.id, note: "Conferido" }));
    expect(r.ok).toBe(true);
    const after = await state(id);
    expect(after.banner).toBe(false);
    expect(after.escalations[0]).toMatchObject({ status: "resolved" });

    const again = await asUser("carlos", () => resolveEscalation({ id: esc.id }));
    expect(again.ok).toBe(false);
  });

  it("depois de resolvido, só denúncia nova volta a contar", async () => {
    const id = await published();
    for (let i = 0; i < 3; i++) await report(id);
    const esc = (await state(id)).escalations[0]!;
    await asUser("carlos", () => resolveEscalation({ id: esc.id }));
    await report(id);
    expect(await state(id)).toMatchObject({ banner: false });
    await report(id);
    await report(id);
    const s = await state(id);
    expect(s.banner).toBe(true);
    expect(s.escalations.filter((e) => e.status === "open")).toHaveLength(1);
  });

  it("quem só lê não resolve; a função recusa direto no banco", async () => {
    const id = await published();
    for (let i = 0; i < 3; i++) await report(id);
    const esc = (await state(id)).escalations[0]!;
    const denied = await asUser("paulo", () => resolveEscalation({ id: esc.id }));
    expect(denied.ok).toBe(false);
    const db = await clientOf("paulo");
    const direct = await db.rpc("report_escalation_resolve", { p_id: esc.id });
    expect(direct.error?.code).toBe("42501");
    expect((await state(id)).banner).toBe(true);
  });

  it("o item é visível para a moderação e invisível para o anônimo", async () => {
    const id = await published();
    for (let i = 0; i < 3; i++) await report(id);
    const mod = await clientOf("carlos");
    const seen = await mod.from("review_escalations").select("id").eq("article_id", id);
    expect(seen.data).toHaveLength(1);
    const reader = await clientOf("paulo");
    const hidden = await reader.from("review_escalations").select("id").eq("article_id", id);
    expect(hidden.data ?? []).toHaveLength(0);
  });
});
