// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFixture } from "../fixtures/read";
import { createServiceClient } from "@/lib/db/client";
import { createIngestRepo, createRunStore } from "@/lib/db/pipeline-store";
import { createQueue } from "@/lib/pipeline/queue";
import { runNow } from "@/lib/pipeline/reprocess";
import { createRunStep } from "@/lib/pipeline/run-step";
import { drain } from "@/lib/pipeline/drain";
import { createEventSink } from "@/lib/db/pipeline-store";
import { createIngestHandlers } from "@/lib/pipeline/steps";
import { createFakeHttp, fakeResolve } from "@/lib/pipeline/testing/fake-http";
import { pipelineTrash, purgePipeline, rememberSources } from "./cleanup";
import { asUser } from "./studio";

/*
 * Gate da P5, frente B: "Executar agora" grava run manual (M1) e a pausa/contador automáticos não
 * sobrescrevem uma fonte bloqueada durante a coleta (M2).
 */
const db = createServiceClient();
const trash = pipelineTrash();
const namespace = `gb-${randomUUID().slice(0, 8)}`;
trash.namespaces.add(namespace);
const queue = createQueue(db, { namespace });
const UA = "CityNewsBot/1.0 (+https://citynewscuiaba.vercel.app/sobre#robo)";
const SLUG = "folha-do-cerrado";
trash.rateLimits.push({ bucket: "crawler", keyHash: SLUG });

beforeAll(async () => {
  await db.from("rate_limits").delete().eq("bucket", "run_now");
  await rememberSources(db, trash, [SLUG]);
});
afterAll(async () => {
  await db
    .from("sources")
    .update({ status: "active", status_reason: null, consecutive_failures: 0 })
    .eq("slug", SLUG);
  await purgePipeline(db, trash);
});

function handlersFor(http: Parameters<typeof createIngestHandlers>[0]["http"]) {
  return createIngestHandlers({
    repo: createIngestRepo(db),
    http,
    resolve: fakeResolve(),
    userAgent: UA,
    now: () => new Date("2026-09-27T18:45:00Z"),
  });
}

async function drainAll(h: ReturnType<typeof handlersFor>) {
  return drain({
    queue,
    runStep: createRunStep({ ...h, validate: async () => ({ ok: true, value: [] }) }),
    events: createEventSink(db),
    now: () => Date.now(),
    queues: ["pipeline"],
  });
}

describe("M1: runNow grava run manual", () => {
  it("trigger manual, fetch requisita mesmo com tick recente e o limite por fonte vale", async () => {
    const { data: src } = await db.from("sources").select("id, slug").eq("slug", SLUG).single();
    await db
      .from("sources")
      .update({ status: "active", consecutive_failures: 0 })
      .eq("id", src!.id);
    // Um tick agendado que já reivindicou a fonte nesta janela de 10 min.
    const tick = await createRunStore(db).startRun(new Date(Date.UTC(2001, 5, 1, 0, 0, 0)));
    trash.runIds.add(tick.runId);
    const repo = createIngestRepo(db);
    await repo.claimFetch(src!.id, tick.runId, new Date(Date.now() - 600_000));

    const at = new Date();
    const r = await asUser("diego", () => runNow({ sourceId: src!.id }, { queue, now: () => at }));
    trash.runIds.add(r.runId);
    const { data: run } = await db.from("ingest_runs").select("trigger").eq("id", r.runId).single();
    expect(run!.trigger).toBe("manual");

    const { http, calls } = createFakeHttp({
      "https://folhadocerrado.example/robots.txt": { status: 404 },
      "https://folhadocerrado.example/feed": {
        body: readFixture("folha-do-cerrado.xml"),
        headers: { "content-type": "application/rss+xml" },
      },
    });
    await drainAll(handlersFor(http));
    expect(calls.some((c) => c.url.endsWith("/feed"))).toBe(true);

    // Segundo clique na mesma fonte dentro de 5 min: recusado.
    await expect(
      asUser("diego", () => runNow({ sourceId: src!.id }, { queue, now: () => new Date() })),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("M2: compare-and-set da pausa/contador automáticos", () => {
  it("fonte bloqueada durante o fetch continua bloqueada", async () => {
    const { data: src } = await db.from("sources").select("id").eq("slug", SLUG).single();
    await db
      .from("sources")
      .update({ status: "degraded", status_reason: null, consecutive_failures: 1 })
      .eq("id", src!.id);
    const run = await createRunStore(db).startManualRun(src!.id);
    trash.runIds.add(run);
    const { http } = createFakeHttp({
      "https://folhadocerrado.example/robots.txt": { status: 404 },
      "https://folhadocerrado.example/feed": {
        body: readFixture("folha-do-cerrado.xml"),
        headers: { "content-type": "application/rss+xml" },
      },
    });
    const blocking: typeof http = async (url, init) => {
      if (url.endsWith("/feed"))
        await db
          .from("sources")
          .update({ status: "blocked", status_reason: "opt_out" })
          .eq("id", src!.id);
      return http(url, init);
    };
    await queue.enqueue("pipeline", {
      runId: run,
      step: "fetch",
      itemRef: `source:${SLUG}:manual:${run}`,
      attempt: 1,
    });
    await drainAll(handlersFor(blocking));
    const { data: after } = await db
      .from("sources")
      .select("status, status_reason")
      .eq("id", src!.id)
      .single();
    expect(after).toEqual({ status: "blocked", status_reason: "opt_out" });
  });
});

describe("B3-R2: coletas da fonte não pegam slug com o mesmo prefixo", () => {
  it("sourceRuns filtra por igualdade ou source:<slug>:", async () => {
    const { sourceRuns } = await import("@/lib/db/queries/sources-admin");
    const { data: src } = await db.from("sources").select("id").eq("slug", SLUG).single();
    const tag = randomUUID().slice(0, 8);
    await db.from("pipeline_events").insert(
      [`source:${SLUG}`, `source:${SLUG}:manual:${tag}`, `source:${SLUG}-2`].map((ref) => ({
        step: "fetch",
        item_ref: ref,
        level: "info" as const,
        message: `b3-${tag}`,
      })),
    );
    try {
      const r = await asUser("helena", () => sourceRuns(src!.id, 100));
      expect(r.ok).toBe(true);
      const mine = r.ok ? r.value.filter((x) => x.message === `b3-${tag}`) : [];
      expect(mine).toHaveLength(2);
    } finally {
      await db.from("pipeline_events").delete().eq("message", `b3-${tag}`);
    }
  });
});

describe("B4-R2: banco recusa esquema que não seja http/https", () => {
  it("sources.base_url e feed_url", async () => {
    const slug = `b4-${randomUUID().slice(0, 8)}`;
    const base = { slug, name: "B4 teste", kind: "rss" as const, locality: "cuiaba" };
    for (const row of [
      { base_url: "javascript:alert(1)" },
      { base_url: "https://ok.example", feed_url: "data:text/xml,x" },
    ]) {
      const r = await db
        .from("sources")
        .insert({ ...base, ...row })
        .select("id");
      expect(r.error?.message ?? "").toMatch(/sources_urls_http/);
    }
    await db.from("sources").delete().eq("slug", slug);
  });
});

describe("B1-R3: filtro por IP não é oráculo para quem não é admin", () => {
  it("logs e auditoria recusam filtro parecido com IP para não admin", async () => {
    const { queryLogs } = await import("@/lib/db/queries/control");
    const { listAudit } = await import("@/lib/db/queries/admin");
    const { looksLikeIp } = await import("@/lib/control/monitor");
    expect(looksLikeIp("203.0.113")).toBe(true);
    expect(looksLikeIp("2001:db8:1")).toBe(true);
    expect(looksLikeIp("fetch")).toBe(false);
    expect(looksLikeIp("v1.2")).toBe(false);
    expect(looksLikeIp("203.0.1")).toBe(true);
    expect(looksLikeIp("203.0")).toBe(false);
    expect(looksLikeIp("ip-e2e:ab12cd")).toBe(false);
    expect(looksLikeIp("fe80::1")).toBe(true);
    expect(looksLikeIp("article:12345")).toBe(false);
    expect(looksLikeIp("ip-test:1727")).toBe(false);
    const tag = randomUUID().slice(0, 8);
    const ip = "203.0.113.77";
    await db.from("pipeline_events").insert({
      step: "fetch",
      item_ref: `source:b1-${tag}`,
      level: "info",
      message: `acesso de ${ip} ${tag}`,
    });
    await db.from("audit_log").insert({
      actor: "system",
      action: "b1.teste",
      object_ref: `ip:${ip}:${tag}`,
      details: {},
    });
    try {
      const naoAdmin = await asUser("diego", () => queryLogs({ q: "203.0.113" }, 1));
      expect(naoAdmin.rows).toHaveLength(0);
      const admin = await asUser("helena", () => queryLogs({ q: "203.0.113" }, 1));
      expect(admin.rows.some((r) => r.message.includes(tag))).toBe(true);
      const semIp = await asUser("diego", () => queryLogs({ q: tag }, 1));
      expect(semIp.rows.some((r) => r.message.includes(ip))).toBe(false);

      const a1 = await asUser("diego", () => listAudit({ object: "203.0.113" }, 1));
      expect(a1.rows).toHaveLength(0);
      const a2 = await asUser("helena", () => listAudit({ object: `${tag}` }, 1));
      expect(a2.rows.some((r) => r.objectRef?.includes(tag))).toBe(true);
    } finally {
      await db.from("pipeline_events").delete().like("message", `%${tag}`);
      await db.from("audit_log").delete().eq("action", "b1.teste");
    }
  });
});

describe("B2-R1: 'IA fora do ar' vale na hora", () => {
  it("aiEnabled não usa cache da flag", async () => {
    const { createAiStore } = await import("@/lib/db/ai-store");
    let enabled = true;
    const stub = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { enabled }, error: null }) }),
        }),
      }),
    } as unknown as Parameters<typeof createAiStore>[0];
    const store = createAiStore(stub, () => 1_000);
    expect(await store.aiEnabled()).toBe(true);
    enabled = false;
    expect(await store.aiEnabled()).toBe(false);
  });
});
