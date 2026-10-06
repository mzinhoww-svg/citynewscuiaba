// @vitest-environment node
// UX-W3-T3 · item 51: contagens do menu do Estúdio com a sessão de quem consulta (RLS valendo).
// Cada número só é contado para quem vê o item; a casca nunca cai: erro vira zero.
import { afterAll, describe, expect, it } from "vitest";
import type { DbClient } from "@/lib/db/client";
import { studioCounts, ZERO_COUNTS } from "@/lib/db/queries/studio-counts";
import { runWithStudioContext } from "@/lib/studio/context";
import { asUser, service } from "./studio";

const tag = `counts-${Date.now()}`;
const created = { reports: [] as string[], media: [] as string[], quarantine: [] as number[] };

afterAll(async () => {
  if (created.reports.length) await service.from("reports").delete().in("id", created.reports);
  if (created.media.length) await service.from("media_assets").delete().in("id", created.media);
  if (created.quarantine.length)
    await service.from("pipeline_quarantine").delete().in("id", created.quarantine);
});

const countsAs = (user: Parameters<typeof asUser>[0]) =>
  asUser(user, async () => {
    const { studioContext } = await import("@/lib/studio/context");
    return studioCounts((await studioContext()).session!.roles);
  });

describe("studioCounts", () => {
  it("editor-chefe vê denúncias vencidas, falhas em quarentena e mídia pendente", async () => {
    const before = await countsAs("marina");

    const report = await service
      .from("reports")
      .insert({
        content_ref: `teste:${tag}`,
        kind: "other",
        message: "teste de contagem",
        due_at: new Date(Date.now() - 3_600_000).toISOString(),
      })
      .select("id")
      .single();
    expect(report.error).toBeNull();
    created.reports.push(report.data!.id);
    // Denúncia aberta ainda no prazo não entra na contagem de vencidas.
    const onTime = await service
      .from("reports")
      .insert({ content_ref: `teste:${tag}:prazo`, kind: "other", message: "no prazo" })
      .select("id")
      .single();
    created.reports.push(onTime.data!.id);

    const media = await service
      .from("media_assets")
      .insert({
        kind: "licensed",
        storage_path: `teste/${tag}.jpg`,
        license: "teste",
        credit: "teste",
        allowed_use: "teste",
        status: "pending",
      })
      .select("id")
      .single();
    expect(media.error).toBeNull();
    created.media.push(media.data!.id);

    const q = await service
      .from("pipeline_quarantine")
      .insert({
        queue: "notify",
        msg_id: 0,
        dedupe_key: tag,
        message: { tag },
        read_ct: 5,
        error: "teste de contagem",
      })
      .select("id")
      .single();
    expect(q.error).toBeNull();
    created.quarantine.push(q.data!.id);

    const after = await countsAs("marina");
    expect(after.reportsOverdue).toBeGreaterThanOrEqual(before.reportsOverdue + 1);
    expect(after.mediaPending).toBeGreaterThanOrEqual(before.mediaPending + 1);
    expect(after.failures).toBeGreaterThanOrEqual(before.failures + 1);
    expect(after.exceptions).toBeGreaterThanOrEqual(0);
    expect(after.approvals).toBeGreaterThanOrEqual(0);
  });

  it("só conta o que o papel vê: jornalista não recebe denúncias, aprovações, falhas nem mídia", async () => {
    const c = await countsAs("juliana");
    expect(c).toMatchObject({ reportsOverdue: 0, approvals: 0, failures: 0, mediaPending: 0 });
  });

  it("admin sem article.edit não recebe exceções da fila", async () => {
    expect((await countsAs("helena")).exceptions).toBe(0);
  });

  it("erro do banco vira zero em tudo, sem lançar", async () => {
    const broken = {
      from() {
        throw new Error("banco fora do ar");
      },
    } as unknown as DbClient;
    const c = await runWithStudioContext(
      {
        session: null,
        db: broken,
        revalidate: async () => {},
        now: () => new Date(),
      },
      () => studioCounts([{ role: "editor_chefe", sections: [] }]),
    );
    expect(c).toEqual(ZERO_COUNTS);
  });

  it("sem contexto de requisição (fora do Next) devolve zeros", async () => {
    await expect(studioCounts([{ role: "editor_chefe", sections: [] }])).resolves.toEqual(
      ZERO_COUNTS,
    );
  });
});
