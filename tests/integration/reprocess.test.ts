// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { createQueue } from "@/lib/pipeline/queue";
import { ReprocessError, reprocess, runNow } from "@/lib/pipeline/reprocess";
import { pipelineTrash, purgePipeline } from "./cleanup";
import { asUser } from "./studio";

/*
 * P5-T3: reprocessar e "Executar agora". Papel vem da sessão (operador_ia, editor_chefe e admin
 * podem; leitura e jornalista não). Com keepHumanDecisions (padrão) a decisão humana não muda e
 * o item nem volta às etapas que decidem; sem ele, a decisão humana é descartada com registro.
 */
const db = createServiceClient();
const trash = pipelineTrash();
const namespace = `rp-${randomUUID().slice(0, 8)}`;
trash.namespaces.add(namespace);
const queue = createQueue(db, { namespace });
const deps = { queue };
const articleIds: string[] = [];
const auditBefore = new Date().toISOString();

async function newRun(): Promise<string> {
  const { data, error } = await db
    .from("ingest_runs")
    .insert({ window_start: new Date(Date.now() - Math.floor(Math.random() * 1e9)).toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  trash.runIds.add(data.id);
  return data.id;
}

async function seedRun() {
  const runId = await newRun();
  const human = `article:${randomUUID()}`;
  const machine = `article:${randomUUID()}`;
  articleIds.push(human, machine);
  await db.from("pipeline_events").insert(
    [human, machine].map((ref) => ({
      run_id: runId,
      step: "rules",
      item_ref: ref,
      level: "info" as const,
      message: "regras aplicadas",
    })),
  );
  await db.from("decisions").insert([
    { object_ref: human, step: "rules", recommended: "publish", human_decision: "reject" },
    { object_ref: machine, step: "rules", recommended: "review" },
  ]);
  return { runId, human, machine };
}

afterAll(async () => {
  if (articleIds.length) await db.from("decisions").delete().in("object_ref", articleIds);
  await purgePipeline(db, trash);
});

const humanOf = async (ref: string) =>
  (await db.from("decisions").select("human_decision").eq("object_ref", ref)).data?.map(
    (d) => d.human_decision,
  );

describe("reprocess", () => {
  it("mantém a decisão humana por padrão e não devolve o item às etapas que decidem", async () => {
    const { runId, human, machine } = await seedRun();
    const r = await asUser("diego", () =>
      reprocess({ scope: { runId }, fromStep: "rules", keepHumanDecisions: true }, deps),
    );
    expect(r.enqueued).toBe(1);
    expect(await humanOf(human)).toEqual(["reject"]);
    expect(await humanOf(machine)).toEqual([null]);
    expect(await queue.pending("pipeline", { runId })).toBe(1);
  });

  it("sem manter, descarta a decisão humana e reenfileira os dois; a auditoria registra", async () => {
    const { runId, human, machine } = await seedRun();
    const r = await asUser("marina", () =>
      reprocess({ scope: { runId }, fromStep: "rules", keepHumanDecisions: false }, deps),
    );
    expect(r.enqueued).toBe(2);
    expect(await humanOf(human)).toEqual([null]);
    expect(await humanOf(machine)).toEqual([null]);
    const { data } = await db
      .from("audit_log")
      .select("action, details")
      .eq("action", "pipeline.reprocess")
      .gte("at", auditBefore)
      .order("id", { ascending: false })
      .limit(1);
    expect(data?.[0]?.details).toMatchObject({ fromStep: "rules", keepHumanDecisions: false });
  });

  it("etapas que não decidem reenfileiram inclusive itens com decisão humana", async () => {
    const runId = await newRun();
    const ref = `item:${randomUUID()}`;
    await db.from("pipeline_events").insert({
      run_id: runId,
      step: "classify",
      item_ref: ref,
      level: "error",
      message: "falha",
    });
    const r = await asUser("diego", () =>
      reprocess({ scope: { runId }, fromStep: "classify", keepHumanDecisions: true }, deps),
    );
    expect(r.enqueued).toBe(1);
  });

  it("itemIds valem como referências e repetir não duplica a fila", async () => {
    const runId = await newRun();
    const ref = `item:${randomUUID()}`;
    const input = {
      scope: { runId, itemIds: [ref] },
      fromStep: "classify" as const,
      keepHumanDecisions: true,
    };
    const first = await asUser("diego", () => reprocess(input, deps));
    const second = await asUser("diego", () => reprocess(input, deps));
    expect([first.enqueued, second.enqueued]).toEqual([1, 0]);
  });

  it("referência fora do formato é recusada", async () => {
    await expect(
      asUser("diego", () =>
        reprocess(
          {
            scope: { itemIds: ["qualquer coisa"] },
            fromStep: "classify",
            keepHumanDecisions: true,
          },
          deps,
        ),
      ),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("papel sem permissão é recusado e audita a negação", async () => {
    const runId = await newRun();
    for (const who of ["thiago", "juliana", "paulo"] as const) {
      await expect(
        asUser(who, () =>
          reprocess({ scope: { runId }, fromStep: "rules", keepHumanDecisions: true }, deps),
        ),
      ).rejects.toBeInstanceOf(ReprocessError);
    }
    const { data } = await db
      .from("audit_log")
      .select("action")
      .eq("action", "pipeline.reprocess.denied")
      .gte("at", auditBefore);
    expect((data ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("runNow", () => {
  beforeAll(async () => {
    await db.from("rate_limits").delete().eq("bucket", "run_now");
  });

  it("cria um run fora da janela de 30 min, com window_start próprio, e enfileira fetch", async () => {
    const { data: src } = await db
      .from("sources")
      .select("id, slug")
      .eq("slug", "mt-agora")
      .single();
    // Gate P5 (M1): 1 execução por fonte a cada 5 min; zera as marcas de testes anteriores.
    await db.from("rate_limits").delete().eq("bucket", "run_now");
    await db
      .from("ingest_runs")
      .update({ stats: { manual: true } })
      .eq("trigger", "manual")
      .eq("stats->>source", src!.id);
    const at = new Date("2026-09-29T14:07:13.412Z");
    const r = await asUser("diego", () =>
      runNow({ sourceId: src?.id }, { ...deps, now: () => at }),
    );
    trash.runIds.add(r.runId);
    expect(r.windowStart).toBe(at.toISOString());
    expect(r.enqueued).toBe(1);
    const { data: run } = await db
      .from("ingest_runs")
      .select("window_start, stats")
      .eq("id", r.runId)
      .single();
    expect(new Date(run!.window_start).getTime()).toBe(at.getTime());
    expect(new Date(run!.window_start).getUTCMinutes() % 30).not.toBe(0);
    expect(run!.stats).toMatchObject({ manual: true, fetch_enqueued: 1 });
    expect(await queue.pending("pipeline", { runId: r.runId })).toBe(1);
  });

  it("dois cliques no mesmo instante geram dois runs distintos", async () => {
    const at = new Date("2026-09-29T15:11:05.000Z");
    const a = await asUser("marina", () => runNow({}, { ...deps, now: () => at }));
    const b = await asUser("marina", () => runNow({}, { ...deps, now: () => at }));
    trash.runIds.add(a.runId);
    trash.runIds.add(b.runId);
    expect(a.runId).not.toBe(b.runId);
  });

  it("sem permissão, nada é criado", async () => {
    const at = new Date("2026-09-29T16:22:33.000Z");
    await expect(
      asUser("juliana", () => runNow({}, { ...deps, now: () => at })),
    ).rejects.toMatchObject({ code: "forbidden" });
    const { count } = await db
      .from("ingest_runs")
      .select("*", { count: "exact", head: true })
      .eq("window_start", at.toISOString());
    expect(count).toBe(0);
  });
});
