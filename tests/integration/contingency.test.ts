// @vitest-environment node
// P5-T10 · Contingência (Review Focus 4): pausar a publicação automática no meio de um ciclo
// manda os itens restantes para revisão; `read_only` bloqueia as Server Actions do Estúdio com
// mensagem; `ai_enabled` desligada faz a busca com IA recusar; rollback volta à versão
// aprovada anterior; religar a publicação automática só por aprovação de outra pessoa.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACTION_NAME } from "@/content/pt-BR/contingency";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { createFlags as createPipelineFlags, createPublishRepo } from "@/lib/db/pipeline-store";
import type { Json } from "@/lib/db/types";
import { createPublishHandlers } from "@/lib/pipeline/steps";
import { DEFAULT_RULES } from "@/lib/rules/defaults";
import { ok } from "@/lib/result";
import type { RuleSet } from "@/lib/rules";
import { decideApprovalCommand } from "@/lib/studio/approvals";
import { contingencyCommand } from "@/lib/studio/contingency";
import { publishArticle } from "@/lib/studio/publish";
import { READ_ONLY_MESSAGE } from "@/lib/studio/read-only";
import { pipelineTrash, purgePipeline } from "./cleanup";
import { asUser, SEED_USERS, service } from "./studio";

const FOLHA = "c5000000-0000-4000-8000-000000000001";
const trash = pipelineTrash();
const runId = randomUUID();
const rawId = randomUUID();
const topics = { decided: randomUUID(), pending: randomUUID(), human: randomUUID() };
const articles = { decided: randomUUID(), pending: randomUUID(), human: randomUUID() };
const approvals: string[] = [];
const body: NonNullable<Json> = { type: "doc", content: [] };

/** Serviços sem exigência nenhuma e sem revisão obrigatória: só a flag decide. */
const OPEN_RULES: RuleSet = {
  ...DEFAULT_RULES,
  forceReview: false,
  categories: {
    ...DEFAULT_RULES.categories,
    servicos: {
      mode: "auto",
      minSources: 0,
      requirePrimary: false,
      requireApprovedImage: false,
      minScore: null,
      summaryWords: 60,
    },
  },
};

const must = (r: { error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message);
};

async function flag(key: string) {
  const { data } = await service.from("feature_flags").select("enabled").eq("key", key).single();
  return data?.enabled;
}
async function setFlagDirect(key: string, enabled: boolean) {
  must(await service.from("feature_flags").update({ enabled }).eq("key", key));
}
async function article(id: string) {
  const { data } = await service
    .from("articles")
    .select("status, review_reason")
    .eq("id", id)
    .single();
  return data!;
}

function handlers() {
  return createPublishHandlers({
    repo: createPublishRepo(service),
    rules: { activeRules: async () => ok(OPEN_RULES) },
    flags: createPipelineFlags(service),
    callAgent: createCallAgent({
      store: createMemoryAiStore(),
      provider: createFakeProvider(),
      now: () => new Date(),
    }),
    promptVersion: async () => 1,
    embed: async () => ({ ok: false, error: "sem embedding no teste" }),
    revalidate: async () => {},
    now: () => new Date(),
  });
}

const msg = (step: "rules" | "publish", id: string) => ({
  runId,
  step,
  itemRef: `article:${id}`,
  attempt: 1,
});

beforeAll(async () => {
  trash.runIds.add(runId);
  const ws = new Date(Date.UTC(2004, 0, 1) + Math.floor(Math.random() * 1e9) * 1000);
  must(
    await service
      .from("ingest_runs")
      .insert({ id: runId, window_start: ws.toISOString(), status: "running" }),
  );
  must(
    await service.from("raw_items").insert({
      id: rawId,
      run_id: runId,
      source_id: FOLHA,
      payload: { url: "https://folhadocerrado.example/feed", status: 200, body: "" },
    }),
  );
  for (const k of ["decided", "pending", "human"] as const) {
    const item = randomUUID();
    trash.itemIds.add(item);
    must(
      await service
        .from("topics")
        .insert({ id: topics[k], slug: `contingencia-${topics[k]}`, title: `Assunto ${k}` }),
    );
    must(
      await service.from("collected_items").insert({
        id: item,
        raw_id: rawId,
        source_id: FOLHA,
        canonical_url: `https://folhadocerrado.example/contingencia/${item}`,
        original_title: `Item ${k}`,
        topic_id: topics[k],
      }),
    );
    must(
      await service.from("articles").insert({
        id: articles[k],
        slug: `contingencia-${articles[k]}`,
        kind: "normalized",
        topic_id: topics[k],
        section_slug: "servicos",
        title: `Matéria ${k}`,
        dek: "Linha fina.",
        body,
        status: "draft",
        agent_id: "write",
        confidence: "alta",
        confidence_score: 0.9,
      }),
    );
    must(
      await service.from("article_versions").insert({
        article_id: articles[k],
        number: 1,
        snapshot: { title: `Matéria ${k}`, dek: "Linha fina.", body },
        origin: k === "human" ? "human" : "ai",
      }),
    );
  }
  // A etapa 15 já decidiu publicar as duas primeiras nesta revisão; a terceira tem edição humana.
  for (const k of ["decided", "human"] as const)
    must(
      await service.from("decisions").insert({
        object_ref: `article:${articles[k]}`,
        step: "rules",
        rules_version: 1,
        input_hash: `contingencia-${articles[k]}`,
        output: { route: "publish", rule: "mode", version: 1 },
        rationale: "teste",
        recommended: "publish",
      }),
    );
  await setFlagDirect("auto_publish", true);
});

afterAll(async () => {
  await setFlagDirect("auto_publish", false);
  await setFlagDirect("read_only", false);
  await setFlagDirect("ai_enabled", true);
  await service.from("rules").update({ active: false }).gt("version", 1);
  await service.from("rules").update({ active: true }).eq("version", 1);
  await service.from("rules").delete().gte("version", 5_000_000);
  if (approvals.length) await service.from("approvals").delete().in("id", approvals);
  await service
    .from("decisions")
    .delete()
    .in(
      "object_ref",
      Object.values(articles).map((a) => `article:${a}`),
    );
  await service.from("articles").delete().in("id", Object.values(articles));
  await purgePipeline(service, trash);
  await service.from("topics").delete().in("id", Object.values(topics));
});

const run = (action: keyof typeof ACTION_NAME, typed = ACTION_NAME[action], reason = "Teste") =>
  asUser("helena", () => contingencyCommand({ action, typed, reason }));

describe("contingência: pausar publicação automática no meio do ciclo (Review Focus 4)", () => {
  it("as ações de auditoria da contingência estão nas duas listas", async () => {
    const r = await service.rpc("studio_audit_actions");
    for (const a of ["flag.set", "rules.rollback"]) {
      expect(AUDIT_ACTIONS).toContain(a);
      expect(r.data).toContain(a);
    }
  });

  it("confirmação errada não faz nada; papel sem users.manage é negado", async () => {
    const wrong = await run("pause_auto_publish", "pausar");
    expect(wrong).toMatchObject({ ok: false, error: "invalid" });
    expect(await flag("auto_publish")).toBe(true);
    const marina = await asUser("marina", () =>
      contingencyCommand({
        action: "pause_auto_publish",
        typed: ACTION_NAME.pause_auto_publish,
        reason: "x",
      }),
    );
    expect(marina).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("pausar: flag desligada, item já decidido do ciclo vai para revisão, edição humana fica", async () => {
    const r = await run("pause_auto_publish");
    expect(r).toMatchObject({
      ok: true,
      value: { action: "pause_auto_publish", changed: true, movedToReview: 1 },
    });
    expect(await flag("auto_publish")).toBe(false);
    expect(await article(articles.decided)).toMatchObject({ status: "in_review" });
    expect((await article(articles.decided)).review_reason).toMatch(
      /Publicação automática desligada/,
    );
    expect(await article(articles.human)).toMatchObject({ status: "draft" });
    expect(await article(articles.pending)).toMatchObject({ status: "draft" });
    const { data: log } = await service
      .from("audit_log")
      .select("actor, action, details")
      .eq("action", "flag.set")
      .eq("object_ref", "contingency:pause_auto_publish")
      .order("id", { ascending: false })
      .limit(1);
    expect(log?.[0]).toMatchObject({ actor: SEED_USERS.helena.id });
    expect(log?.[0]?.details).toMatchObject({ reason: "Teste", movedToReview: 1 });
  });

  it("a etapa 15 do item ainda não decidido passa a rotear para revisão", async () => {
    const h = handlers();
    const r = await h.rules!(msg("rules", articles.pending));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.map((m) => m.step)).toEqual(["notify"]);
    expect(await article(articles.pending)).toMatchObject({ status: "in_review" });
    const { data } = await service
      .from("decisions")
      .select("output")
      .eq("object_ref", `article:${articles.pending}`)
      .eq("step", "rules")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(data?.[0]?.output).toMatchObject({ route: "review", rule: "auto_publish_off" });
  });

  it("a etapa 17 do item já decidido não publica (fica em revisão)", async () => {
    const h = handlers();
    const r = await h.publish!(msg("publish", articles.decided));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.map((m) => m.step)).toEqual(["notify"]);
    expect(await article(articles.decided)).toMatchObject({ status: "in_review" });
  });

  it("pausar de novo é idempotente; religar exige aprovação de outra pessoa", async () => {
    const again = await run("pause_auto_publish");
    expect(again).toMatchObject({ ok: true, value: { changed: false, movedToReview: 0 } });

    // Direto no banco, admin não religa sozinha (guard_feature_flags, 0035).
    const { clientOf } = await import("./studio");
    const helena = await clientOf("helena");
    const direct = await helena
      .from("feature_flags")
      .update({ enabled: true })
      .eq("key", "auto_publish")
      .select("key");
    expect(direct.error?.message).toMatch(/exige aprovação/);
    expect(await flag("auto_publish")).toBe(false);
    const resume = await run(
      "resume_auto_publish",
      ACTION_NAME.resume_auto_publish,
      "Incidente resolvido",
    );
    expect(resume).toMatchObject({
      ok: true,
      value: { action: "resume_auto_publish", existing: false },
    });
    if (resume.ok && resume.value.action === "resume_auto_publish")
      approvals.push(resume.value.approvalId);
    expect(await flag("auto_publish")).toBe(false);
    const id = approvals[0]!;
    const self = await asUser("helena", () => decideApprovalCommand({ id, decision: "approve" }));
    expect(self).toMatchObject({ ok: false, error: "forbidden" });
    // Só admin aprova `safety.disable`; a editora-chefe não.
    const marina = await asUser("marina", () => decideApprovalCommand({ id, decision: "approve" }));
    expect(marina).toMatchObject({ ok: false, error: "forbidden" });
    await service.from("user_roles").insert({ user_id: SEED_USERS.thiago.id, role: "admin" });
    try {
      const other = await asUser("thiago", () =>
        decideApprovalCommand({ id, decision: "approve" }),
      );
      expect(other).toMatchObject({ ok: true, value: { applied: true } });
    } finally {
      await service
        .from("user_roles")
        .delete()
        .eq("user_id", SEED_USERS.thiago.id)
        .eq("role", "admin");
    }
    expect(await flag("auto_publish")).toBe(true);
    await setFlagDirect("auto_publish", false);
  });
});

describe("contingência: modo leitura e busca com IA", () => {
  it("read_only = true bloqueia Server Actions do Estúdio com mensagem; a contingência passa", async () => {
    const on = await run("read_only_on");
    expect(on).toMatchObject({ ok: true, value: { changed: true } });
    expect(await flag("read_only")).toBe(true);
    const blocked = await asUser("marina", () =>
      publishArticle({ id: articles.decided, when: "now", destinations: ["home"] }),
    );
    expect(blocked).toEqual({ ok: false, error: "conflict", message: READ_ONLY_MESSAGE });
    expect(await article(articles.decided)).toMatchObject({ status: "in_review" });
    const off = await run("read_only_off");
    expect(off).toMatchObject({ ok: true, value: { changed: true } });
    expect(await flag("read_only")).toBe(false);
  });

  it("ai_enabled = false: a flag pública fica desligada para /pergunte", async () => {
    const off = await run("ai_off");
    expect(off).toMatchObject({ ok: true, value: { changed: true } });
    expect(await flag("ai_enabled")).toBe(false);
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data } = await anon
      .from("feature_flags")
      .select("enabled")
      .eq("key", "ai_enabled")
      .single();
    expect(data?.enabled).toBe(false);
    const on = await run("ai_on");
    expect(on).toMatchObject({ ok: true, value: { changed: true } });
  });
});

describe("contingência: rollback de regras", () => {
  it("volta para a versão aprovada anterior; sem anterior, explica", async () => {
    const none = await run("rollback_rules");
    expect(none).toMatchObject({ ok: false, error: "conflict" });

    const v = 5_000_000 + Math.floor(Math.random() * 1e5);
    must(
      await service.from("rules").insert({
        version: v,
        body: { ...DEFAULT_RULES, version: v } as unknown as NonNullable<Json>,
        force_review: true,
        proposed_by: SEED_USERS.diego.id,
        approved_by: SEED_USERS.marina.id,
        active: true,
      }),
    );
    must(await service.from("rules").update({ active: false }).eq("version", 1));
    const r = await run("rollback_rules");
    expect(r).toMatchObject({ ok: true, value: { action: "rollback_rules", from: v, to: 1 } });
    const { data } = await service.from("rules").select("version").eq("active", true);
    expect(data).toEqual([{ version: 1 }]);
    const { data: log } = await service
      .from("audit_log")
      .select("actor")
      .eq("action", "rules.rollback")
      .eq("object_ref", "rules:1")
      .order("id", { ascending: false })
      .limit(1);
    expect(log?.[0]?.actor).toBe(SEED_USERS.helena.id);
  });
});
