// @vitest-environment node
// release-backlog (AUT-T8) contra o banco local: ensaio sem escrita, trava das regras antigas e
// liberação em lotes com o worker real (regras v3 do banco, publish com checklist e disjuntor).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import { createServiceClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import {
  createEventSink,
  createFlags,
  createPublishRepo,
  createRulesSource,
} from "@/lib/db/pipeline-store";
import { createBreakerStore } from "@/lib/db/breaker-store";
import { drain } from "@/lib/pipeline/drain";
import { createQueue } from "@/lib/pipeline/queue";
import { createRunStep } from "@/lib/pipeline/run-step";
import { createPublishHandlers } from "@/lib/pipeline/steps";
import { appendCreditLine } from "@/lib/pipeline/steps/credit-line";
import { err } from "@/lib/result";
import { RULES_V3 } from "@/lib/rules/defaults";
import { parseArgs, run } from "../../scripts/release-backlog.mjs";
import { clientOf, SEED_USERS } from "./studio";

const db = createServiceClient();
const tag = randomUUID().slice(0, 8);
const V3_VERSION = 7_800_000 + (Date.now() % 100_000);
const created = { articles: [] as string[], topics: [] as string[], items: [] as string[] };
let previousActive: number[] = [];
let previousAutoPublish = false;

/** Corpo completo: 12 parágrafos de ~225 caracteres (≥30 linhas) com a linha de crédito. */
const longBody = () =>
  appendCreditLine(
    {
      type: "doc",
      content: Array.from({ length: 12 }, (_, i) => ({
        type: "paragraph",
        attrs: { citations: [] },
        content: [
          {
            type: "text",
            text: `${`Parágrafo ${i + 1} da matéria de teste sobre a obra na avenida, segundo a fonte. `.repeat(3)}`.trim(),
          },
        ],
      })),
    },
    [{ name: "MT Agora", url: "https://mtagora.example/obra" }],
  );

async function inReview(label: string) {
  const { data: src } = await db.from("sources").select("id").eq("slug", "mt-agora").single();
  const topic = await db
    .from("topics")
    .insert({ slug: `rb-${tag}-${label}`, title: "Assunto de teste" })
    .select("id")
    .single();
  if (topic.error) throw new Error(topic.error.message);
  created.topics.push(topic.data.id);
  const item = await db
    .from("collected_items")
    .insert({
      source_id: src!.id,
      canonical_url: `https://mtagora.example/rb-${tag}-${label}`,
      original_title: "Obra na avenida em Cuiabá",
      topic_id: topic.data.id,
      locality: "cuiaba",
      neighborhood: "Goiabeiras",
    })
    .select("id")
    .single();
  if (item.error) throw new Error(item.error.message);
  created.items.push(item.data.id);
  const art = await db
    .from("articles")
    .insert({
      slug: `rb-${tag}-${label}`,
      kind: "normalized",
      topic_id: topic.data.id,
      section_slug: "cidade",
      title: `Obra na avenida de Cuiabá segue em ritmo acelerado ${label}`,
      dek: "Prefeitura diz que a entrega é antecipada.",
      body: longBody() as unknown as NonNullable<Json>,
      status: "in_review",
      review_reason: "Revisão obrigatória ligada nas regras v1: nada é publicado sozinho.",
      agent_id: "write",
      confidence: "média",
      confidence_score: 0.45,
    })
    .select("id")
    .single();
  if (art.error) throw new Error(art.error.message);
  created.articles.push(art.data.id);
  await db
    .from("article_sources")
    .insert({ article_id: art.data.id, item_id: item.data.id, role: "primary" });
  await db.from("decisions").insert({
    object_ref: `article:${art.data.id}`,
    step: "image",
    output: { kind: "typographic" },
  });
  return art.data.id;
}

/** Roda o worker real (regras, publicação, índice, avisos) sobre a fila `pipeline`. */
async function worker() {
  const store = createMemoryAiStore();
  const callAgent = createCallAgent({
    store,
    provider: createFakeProvider(),
    now: () => new Date(),
  });
  const handlers = createPublishHandlers({
    repo: createPublishRepo(db),
    rules: createRulesSource(db),
    flags: createFlags(db),
    callAgent,
    promptVersion: async () => null,
    embed: async () => err("provider"),
    revalidate: async () => undefined,
    now: () => new Date(),
    breaker: createBreakerStore(db),
  });
  for (let i = 0; i < 5; i++) {
    const r = await drain({
      queue: createQueue(db),
      runStep: createRunStep(handlers),
      events: createEventSink(db),
      now: () => Date.now(),
      budgetMs: 30_000,
      queues: ["pipeline", "notify"],
    });
    if (r.remaining === 0) break;
  }
}

const quiet = { now: undefined, log: () => undefined };

beforeAll(async () => {
  const active = await db.from("rules").select("version").eq("active", true);
  previousActive = (active.data ?? []).map((r) => r.version);
  const flag = await db.from("feature_flags").select("enabled").eq("key", "auto_publish").single();
  previousAutoPublish = flag.data?.enabled === true;
  const admin = await clientOf("helena");
  await admin.rpc("publish_breaker_reset", { p_ctx: { reason: "teste release-backlog" } });
});

afterAll(async () => {
  const ids = created.articles;
  if (ids.length) {
    await db.from("article_sources").delete().in("article_id", ids);
    await db
      .from("decisions")
      .delete()
      .in(
        "object_ref",
        ids.map((i) => `article:${i}`),
      );
    await db
      .from("notifications")
      .delete()
      .in(
        "object_ref",
        ids.map((i) => `article:${i}`),
      );
    await db.from("articles").delete().in("id", ids);
  }
  if (created.items.length) await db.from("collected_items").delete().in("id", created.items);
  if (created.topics.length) await db.from("topics").delete().in("id", created.topics);
  await db.from("rules").update({ active: false }).eq("version", V3_VERSION);
  if (previousActive.length)
    await db.from("rules").update({ active: true }).in("version", previousActive);
  await db.from("rules").delete().eq("version", V3_VERSION);
  await db.from("feature_flags").update({ enabled: previousAutoPublish }).eq("key", "auto_publish");
  await db.from("jobs").delete().like("dedupe_key", "rules:article:%");
});

describe("release-backlog contra o banco local", () => {
  it("ensaio (padrão): lê, mostra o plano e não escreve nada", async () => {
    const id = await inReview("dry");
    const before = await db.from("jobs").select("*", { count: "exact", head: true });
    const lines: string[] = [];
    const report = await run(parseArgs([]), { db, log: (s: string) => lines.push(s) });
    expect(report.mode).toBe("dry-run");
    expect(report.eligibleBefore).toBeGreaterThanOrEqual(1);
    expect(report.batches).toEqual([]);
    expect(report.hourly).toHaveLength(24);
    expect(lines.join("\n")).toMatch(/ENSAIO: nada foi escrito/);
    const after = await db.from("jobs").select("*", { count: "exact", head: true });
    expect(after.count).toBe(before.count);
    const art = await db.from("articles").select("status").eq("id", id).single();
    expect(art.data?.status).toBe("in_review");
  });

  it("--apply com as regras antigas ativas não enfileira nada", async () => {
    await db.from("feature_flags").update({ enabled: true }).eq("key", "auto_publish");
    const before = await db.from("jobs").select("*", { count: "exact", head: true });
    const report = await run(parseArgs(["--apply"]), { db, ...quiet, now: () => new Date() });
    expect(report.stoppedBecause).toMatch(/não são a v3/);
    expect(report.batches).toEqual([]);
    const after = await db.from("jobs").select("*", { count: "exact", head: true });
    expect(after.count).toBe(before.count);
  });

  it("--apply com a v3 ativa: lotes pequenos, worker real, publica e respeita o teto da hora", async () => {
    // Ativa uma v3 de teste (service role: sem passar pelo pedido de aprovação) e liga a publicação.
    const body = { ...RULES_V3, version: V3_VERSION } as unknown as Record<string, unknown>;
    const ins = await db.from("rules").insert({
      version: V3_VERSION,
      body: body as never,
      force_review: false,
      proposed_by: SEED_USERS.marina.id,
    });
    expect(ins.error).toBeNull();
    await db.from("rules").update({ active: false }).eq("active", true);
    expect(
      (await db.from("rules").update({ active: true }).eq("version", V3_VERSION)).error,
    ).toBeNull();
    await db.from("feature_flags").update({ enabled: true }).eq("key", "auto_publish");

    const ids = [await inReview("a"), await inReview("b"), await inReview("c")];
    // Teto da hora de 2 (limite editável): o script solta 2 e para no teto.
    const admin = await clientOf("helena");
    const { data: snapshot } = await db.rpc("publish_counts", { p_now: new Date().toISOString() });
    const already = (snapshot as { publishedLastHour: number }).publishedLastHour;
    await admin.rpc("publish_breaker_set_limits", { p: { hourly: already + 2 }, p_ctx: {} });

    const lines: string[] = [];
    const report = await run(
      parseArgs(["--apply", "--batch=2", "--poll-sec=1", "--timeout-sec=60"]),
      {
        db,
        now: () => new Date(),
        log: (s: string) => lines.push(s),
        sleep: async () => worker(),
      },
    );
    // Deixa o worker terminar o que ficou na fila (índice e avisos).
    await worker();

    const rows = await db
      .from("articles")
      .select("id, status, publish_mode, review_reason")
      .in("id", ids);
    const published = (rows.data ?? []).filter((r) => r.status === "published");
    expect(published.length).toBeGreaterThanOrEqual(2);
    expect(published.every((r) => r.publish_mode === "auto")).toBe(true);
    expect(report.published).toBe(2);
    expect(report.batches[0]).toMatchObject({ size: 2, published: 2, timedOut: false });
    expect(report.stoppedBecause).toMatch(/teto de volume/);
    expect(
      report.hourly.reduce((s: number, r: { count: number }) => s + r.count, 0),
    ).toBeGreaterThanOrEqual(2);
    expect(lines.join("\n")).toMatch(/publicadas por hora/);

    // O terceiro item continua em revisão (o teto o segurou), com o checklist já aplicado nos outros.
    const left = (rows.data ?? []).filter((r) => r.status !== "published");
    expect(left).toHaveLength(1);
    const checked = await db
      .from("articles")
      .select("seo_title, tags")
      .eq("id", published[0]!.id)
      .single();
    expect(checked.data?.seo_title).toBeTruthy();
    expect(checked.data?.tags?.length).toBeGreaterThan(0);

    // Volta ao padrão do dono (A-126, migration 0186).
    await admin.rpc("publish_breaker_set_limits", { p: { hourly: 300, daily: 3000 }, p_ctx: {} });
  });

  it("disjuntor aberto: o script recusa liberar", async () => {
    await db.from("feature_flags").update({ enabled: true }).eq("key", "auto_publish");
    await db.rpc("publish_breaker_trip", { p_reason: "reports", p_detail: { teste: true } });
    await db.from("feature_flags").update({ enabled: true }).eq("key", "auto_publish");
    const report = await run(parseArgs(["--apply", "--batch=2", "--allow-legacy-rules"]), {
      db,
      ...quiet,
      now: () => new Date(),
    });
    expect(report.stoppedBecause).toMatch(/disjuntor \(tripped\)/);
    expect(report.batches).toEqual([]);
    const admin = await clientOf("helena");
    await admin.rpc("publish_breaker_reset", { p_ctx: { reason: "fim do teste" } });
  });
});
