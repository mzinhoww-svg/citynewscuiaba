// @vitest-environment node
// Painel de fontes, FS-T6: Server Actions ponta a ponta sem navegador, com sessões reais do seed
// (Diego operador de IA, Marina editora-chefe, Helena admin, Thiago analista). Review Focus 2 do
// plano, mais lote, arquivar/restaurar, bloquear/desbloquear e opt-out como pessoas de verdade
// (FS-T1 só os exercitou como service_role).
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";

const state = vi.hoisted(() => ({
  client: null as unknown,
  ip: "10.20.30.40",
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `${state.ip}, 10.0.0.1` }),
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("@/lib/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/client")>();
  return {
    ...actual,
    createServerClient: async () => {
      if (!state.client) throw new Error("sem sessão no teste");
      return state.client;
    },
  };
});

const { createServiceClient } = await import("@/lib/db/client");
const actions = await import("@/app/estudio/control/fontes/actions");
const {
  pendingSourceApprovals,
  listSources,
  parseSourceFilters,
  sourceDetail,
  sourceHistory,
  fastLaneSkippedSources,
} = await import("@/lib/db/queries/sources-admin");
const { clockTime } = await import("@/content/pt-BR/sources-admin");
const {
  updateSourceAction,
  decideApprovalAction,
  sourceStatusAction,
  bulkSourcesAction,
  setDefaultFrequencyAction,
  setFastLaneMaxAction,
  collectNowAction,
  analyzeLinkAction,
} = actions;

const SEED_PASSWORD = "citynews-local-123";
const HELENA = "helena.costa@citynews.local"; // admin
const MARINA = "marina.arruda@citynews.local"; // editor_chefe
const DIEGO = "diego.prado@citynews.local"; // operador_ia
const THIAGO = "thiago.moraes@citynews.local"; // analista (sem source.manage)

const testStart = new Date().toISOString();
const svc = createServiceClient();

const sessions = new Map<string, Promise<DbClient>>();
function signedIn(email: string): Promise<DbClient> {
  const cached = sessions.get(email);
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL/ANON_KEY ausentes");
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ready = client.auth.signInWithPassword({ email, password: SEED_PASSWORD }).then((r) => {
    if (r.error) throw r.error;
    return client as unknown as DbClient;
  });
  sessions.set(email, ready);
  return ready;
}

/** Roda `fn` com a sessão da pessoa; fora disso, a sessão padrão é a da Helena (admin). */
async function asUser<T>(email: string, fn: () => Promise<T>): Promise<T> {
  const previous = state.client;
  state.client = await signedIn(email);
  try {
    return await fn();
  } finally {
    state.client = previous;
  }
}

function formFrom(values: Record<string, unknown>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) {
    if (Array.isArray(v)) for (const x of v) f.append(k, String(x));
    else if (v !== undefined && v !== null) f.append(k, String(v));
  }
  return f;
}

type Row = Database["public"]["Tables"]["sources"]["Row"];
async function rowBySlug(slug: string): Promise<Row> {
  const r = await svc.from("sources").select("*").eq("slug", slug).single();
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
/** Detalhe como o painel vê (camelCase), lido pela query do painel. */
async function detailBySlug(slug: string) {
  const row = await rowBySlug(slug);
  const d = await sourceDetail(row.id);
  if (!d.ok || !d.value) throw new Error(`detalhe de ${slug}`);
  return { ...d.value.config, id: d.value.id, version: d.value.version, status: d.value.status };
}
async function auditRows(objectRef: string) {
  const r = await svc
    .from("audit_log")
    .select("*")
    .eq("object_ref", objectRef)
    .gt("at", testStart)
    .order("id");
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
const auditActions = async (ref: string) => (await auditRows(ref)).map((r) => r.action);

// ---------------------------------------------------------------------------
// Snapshot e restauração (banco compartilhado com as outras suítes)
// ---------------------------------------------------------------------------
const TOUCHED = [
  "portal-varzea",
  "mt-agora",
  "folha-do-cerrado",
  "diario-da-baixada",
  "radio-pantanal",
  "correio-mato-grossense",
  "brasil-hoje",
  "cena-cuiabana",
] as const;
const snapshots = new Map<string, Row>();
const mediaIds: string[] = [];
const runIds: string[] = [];

beforeAll(async () => {
  process.env.MEDIA_STORE = "memory";
  state.client = await signedIn(HELENA);
  for (const slug of TOUCHED) snapshots.set(slug, await rowBySlug(slug));
});

afterAll(async () => {
  for (const [, row] of snapshots) {
    const now = (await svc.from("sources").select("status, archived_at").eq("id", row.id).single())
      .data;
    // Transições válidas também para o service_role: bloqueada volta por "pausada".
    if (now?.archived_at) await svc.from("sources").update({ archived_at: null }).eq("id", row.id);
    if (now?.status === "blocked" && row.status !== "blocked")
      await svc.from("sources").update({ status: "paused" }).eq("id", row.id);
    const rest: Partial<Row> = { ...row };
    delete rest.id;
    delete rest.created_at;
    delete rest.slug;
    delete rest.version;
    delete rest.updated_at;
    const r = await svc.from("sources").update(rest).eq("id", row.id);
    if (r.error) throw new Error(`restaurar ${row.slug}: ${r.error.message}`);
  }
  await svc.rpc("app_setting_set", { p_key: "sources.fast_lane_max", p_value: 10, p_ctx: {} });
  await svc.rpc("app_setting_set", {
    p_key: "sources.default_frequency_minutes",
    p_value: 30,
    p_ctx: {},
  });
  const ids = [...snapshots.values()].map((r) => r.id);
  await svc.from("approvals").delete().like("target_ref", "source:%").gt("created_at", testStart);
  if (mediaIds.length) await svc.from("media_assets").delete().in("id", mediaIds);
  for (const run of runIds) {
    await svc.from("jobs").delete().eq("message->>runId", run);
    await svc.from("ingest_runs").delete().eq("id", run);
  }
  await svc.from("rate_limits").delete().like("bucket", "source_admin%");
  await svc.from("rate_limits").delete().like("bucket", "collect_now%");
  await svc.from("rate_limits").delete().like("bucket", "discover%");
  await svc.from("source_discoveries").delete().gt("created_at", testStart);
  expect(ids.length).toBe(TOUCHED.length);
});

// ---------------------------------------------------------------------------

describe("mudança crítica: duas pessoas (Review Focus 2)", () => {
  it("operador pede, tenta aprovar, editora-chefe aprova", async () => {
    const s = await detailBySlug("portal-varzea");
    expect(s.imagePolicy).toBe("none");
    const r = await asUser(DIEGO, () =>
      updateSourceAction(
        formFrom({
          id: s.id,
          version: s.version,
          imagePolicy: "reproduction",
          justification: "Acordo assinado em 20/09",
        }),
      ),
    );
    expect(r).toMatchObject({ ok: true, message: "1 alteração aguarda segunda aprovação" });
    expect((await detailBySlug("portal-varzea")).imagePolicy).toBe("none");

    const pending = await pendingSourceApprovals();
    if (!pending.ok) throw new Error("pendentes");
    const [p] = pending.value.filter((x) => x.sourceId === s.id);
    expect(p).toMatchObject({
      field: "image_policy",
      value: "reproduction",
      requestedBy: { name: "Diego Prado" },
      justification: "Acordo assinado em 20/09",
    });

    expect(
      await asUser(DIEGO, () => decideApprovalAction(formFrom({ id: p!.id, decision: "approve" }))),
    ).toMatchObject({ ok: false, message: "A aprovação precisa ser de outra pessoa" });
    expect(
      await asUser(MARINA, () =>
        decideApprovalAction(formFrom({ id: p!.id, decision: "approve" })),
      ),
    ).toMatchObject({ ok: true });
    expect((await detailBySlug("portal-varzea")).imagePolicy).toBe("reproduction");

    const approval = (await svc.from("approvals").select("*").eq("id", p!.id).single()).data;
    expect(approval).toMatchObject({ status: "applied" });
    expect(await auditActions(`source:${s.id}`)).toEqual(
      expect.arrayContaining([
        "source.approval_requested",
        "source.approval_applied",
        "source.update",
      ]),
    );
    // Auditoria com as duas pessoas e o hash do IP (nunca o IP cru).
    const rows = await auditRows(`source:${s.id}`);
    const applied = rows.find((x) => x.action === "source.approval_applied");
    expect(applied?.details).toMatchObject({
      approvalId: p!.id,
      justification: "Acordo assinado em 20/09",
    });
    expect(rows.every((x) => x.ip_hash && !x.ip_hash.includes("10.20.30.40"))).toBe(true);
  });

  it("não crítico aplica na hora e crítico vira pedido, no mesmo envio", async () => {
    const s = await detailBySlug("brasil-hoje");
    const r = await asUser(DIEGO, () =>
      updateSourceAction(
        formFrom({
          id: s.id,
          version: s.version,
          editorialScore: 4,
          reliability: "verified",
          justification: "Veículo com correções públicas consistentes",
        }),
      ),
    );
    expect(r).toMatchObject({
      ok: true,
      message: "Alterações salvas. 1 alteração aguarda segunda aprovação",
    });
    const after = await detailBySlug("brasil-hoje");
    expect(after.editorialScore).toBe(4);
    expect(after.reliability).toBe("standard");
  });

  it("crítico sem justificativa é recusado sem gravar nada", async () => {
    const s = await detailBySlug("cena-cuiabana");
    const r = await asUser(DIEGO, () =>
      updateSourceAction(formFrom({ id: s.id, version: s.version, maySoleSource: "true" })),
    );
    expect(r).toMatchObject({ ok: false, fieldErrors: { justification: expect.any(String) } });
    expect((await detailBySlug("cena-cuiabana")).version).toBe(s.version);
  });

  it("recusar exige motivo e registra na auditoria", async () => {
    const pending = await pendingSourceApprovals();
    if (!pending.ok) throw new Error("pendentes");
    const brasil = await rowBySlug("brasil-hoje");
    const p = pending.value.find((x) => x.sourceId === brasil.id);
    expect(p).toBeDefined();
    expect(
      await asUser(MARINA, () => decideApprovalAction(formFrom({ id: p!.id, decision: "reject" }))),
    ).toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) } });
    expect(
      await asUser(MARINA, () =>
        decideApprovalAction(
          formFrom({ id: p!.id, decision: "reject", reason: "Sem histórico suficiente" }),
        ),
      ),
    ).toMatchObject({ ok: true, message: "Pedido recusado" });
    expect((await rowBySlug("brasil-hoje")).reliability).toBe("standard");
    expect(await auditActions(`source:${brasil.id}`)).toContain("source.approval_rejected");
  });
});

describe("acesso e concorrência", () => {
  it("sem source.manage a ação redireciona para entrar com motivo", async () => {
    const s = await detailBySlug("mt-agora");
    await expect(
      asUser(THIAGO, () =>
        updateSourceAction(formFrom({ id: s.id, version: s.version, editorialScore: 2 })),
      ),
    ).rejects.toThrow("REDIRECT /entrar?next=%2Festudio%2Fcontrol%2Ffontes&motivo=sem-permissao");
    expect((await detailBySlug("mt-agora")).editorialScore).toBe(s.editorialScore);
  });

  it("conflito de versão devolve mensagem e não grava", async () => {
    const s = await detailBySlug("mt-agora");
    const first = await asUser(HELENA, () =>
      updateSourceAction(formFrom({ id: s.id, version: s.version, editorialScore: 5 })),
    );
    expect(first).toMatchObject({ ok: true, message: "Alterações salvas" });
    const last = (await auditRows(`source:${s.id}`)).at(-1)!;
    const r = await asUser(DIEGO, () =>
      updateSourceAction(formFrom({ id: s.id, version: s.version, editorialScore: 1 })),
    );
    expect(r).toEqual({
      ok: false,
      message: `Esta fonte foi alterada por Helena Costa às ${clockTime(last.at)}. Recarregue para ver a versão atual.`,
    });
    expect((await detailBySlug("mt-agora")).editorialScore).toBe(5);
  });
});

describe("ciclo de vida como pessoas reais", () => {
  it("opt-out bloqueia, zera política de imagem e remove reproduções", async () => {
    const src = await rowBySlug("correio-mato-grossense");
    await svc.from("sources").update({ image_policy: "licensed_only" }).eq("id", src.id);
    const media = await svc
      .from("media_assets")
      .insert({
        kind: "reproduction",
        storage_path: `reproductions/teste-fs-t6-${Date.now()}.jpg`,
        origin_url: "https://correiomt.example/img/teste.jpg",
        source_id: src.id,
        license: "reprodução",
        allowed_use: "reprodução com crédito",
        status: "approved",
      })
      .select("id")
      .single();
    if (media.error) throw new Error(media.error.message);
    mediaIds.push(media.data.id);

    const s = await detailBySlug("correio-mato-grossense");
    const r = await asUser(DIEGO, () =>
      sourceStatusAction(
        formFrom({ id: s.id, version: s.version, action: "block", reason: "opt_out" }),
      ),
    );
    expect(r).toMatchObject({ ok: true });
    const after = await rowBySlug("correio-mato-grossense");
    expect(after).toMatchObject({
      status: "blocked",
      status_reason: "opt_out",
      image_policy: "none",
    });
    const m = (await svc.from("media_assets").select("status").eq("id", media.data.id).single())
      .data;
    expect(m?.status).toBe("blocked");
  });

  it("desbloquear pede segunda aprovação; editora-chefe aprova e a fonte volta pausada", async () => {
    const s = await detailBySlug("correio-mato-grossense");
    const r = await asUser(DIEGO, () =>
      sourceStatusAction(
        formFrom({
          id: s.id,
          version: s.version,
          action: "unblock",
          justification: "Veículo retirou o pedido por e-mail",
        }),
      ),
    );
    expect(r).toMatchObject({ ok: true, message: "O desbloqueio aguarda segunda aprovação" });
    expect((await rowBySlug("correio-mato-grossense")).status).toBe("blocked");
    const approval = (
      await svc
        .from("approvals")
        .select("id, target_ref")
        .eq("target_ref", `source:${s.id}:status=paused`)
        .eq("status", "pending")
        .single()
    ).data;
    expect(approval).toBeTruthy();
    expect(
      await asUser(MARINA, () =>
        decideApprovalAction(formFrom({ id: approval!.id, decision: "approve" })),
      ),
    ).toMatchObject({ ok: true });
    expect((await rowBySlug("correio-mato-grossense")).status).toBe("paused");
  });

  it("arquivar exige digitar o nome; restaurar volta pausada", async () => {
    const s = await detailBySlug("correio-mato-grossense");
    expect(
      await asUser(DIEGO, () =>
        sourceStatusAction(
          formFrom({
            id: s.id,
            version: s.version,
            action: "archive",
            reason: "Veículo encerrado",
            confirmName: "outro nome",
          }),
        ),
      ),
    ).toMatchObject({ ok: false, fieldErrors: { confirmName: expect.any(String) } });
    expect(
      await asUser(DIEGO, () =>
        sourceStatusAction(
          formFrom({
            id: s.id,
            version: s.version,
            action: "archive",
            reason: "Veículo encerrado",
            confirmName: "Correio Mato-grossense",
          }),
        ),
      ),
    ).toMatchObject({ ok: true });
    const archived = await rowBySlug("correio-mato-grossense");
    expect(archived.archived_at).not.toBeNull();
    const again = await detailBySlug("correio-mato-grossense");
    expect(
      await asUser(DIEGO, () =>
        sourceStatusAction(formFrom({ id: again.id, version: again.version, action: "restore" })),
      ),
    ).toMatchObject({ ok: true, message: "Fonte restaurada. Ela volta pausada." });
    const restored = await rowBySlug("correio-mato-grossense");
    expect(restored).toMatchObject({ archived_at: null, status: "paused" });
    expect(await auditActions(`source:${s.id}`)).toEqual(
      expect.arrayContaining(["source.status", "source.archive", "source.restore"]),
    );
  });

  it("lote de 3: 2 pausadas e 1 ignorada com motivo, mesmo batchId", async () => {
    const ids = await Promise.all(
      ["diario-da-baixada", "folha-do-cerrado", "radio-pantanal"].map(
        async (slug) => (await rowBySlug(slug)).id,
      ),
    );
    const r = await asUser(DIEGO, () => bulkSourcesAction(formFrom({ ids, action: "pause" })));
    expect(r).toMatchObject({ ok: true, message: "2 pausadas, 1 ignorada: já estava pausada" });
    if (!r.ok) throw new Error("lote");
    const data = r.data as { items: { id: string; outcome: string }[]; batchId: string };
    expect(data.items.map((i) => i.outcome)).toEqual(["done", "done", "ignored"]);
    const batch = await Promise.all(
      ids.slice(0, 2).map(async (id) => (await auditRows(`source:${id}`)).at(-1)?.details),
    );
    const batchIds = batch.map((d) => (d as { batchId?: string }).batchId);
    expect(batchIds[0]).toBeTruthy();
    expect(batchIds[0]).toBe(batchIds[1]);
    expect(data.batchId).toBe(batchIds[0]);
    // Volta a ativar em lote (fontes com feed e termos revisados).
    const back = await asUser(DIEGO, () =>
      bulkSourcesAction(formFrom({ ids: ids.slice(0, 2), action: "activate" })),
    );
    expect(back).toMatchObject({ ok: true, message: "2 ativadas" });
  });

  it("lote acima de 50 fontes é recusado", async () => {
    const ids = Array.from(
      { length: 51 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    expect(await bulkSourcesAction(formFrom({ ids, action: "pause" }))).toMatchObject({
      ok: false,
    });
  });
});

describe("frequência e via rápida", () => {
  it("via rápida cheia: updateSourceAction devolve a mensagem e nada muda", async () => {
    expect(await setFastLaneMaxAction(formFrom({ value: 1 }))).toMatchObject({ ok: true });
    const folha = await detailBySlug("folha-do-cerrado");
    expect(
      await asUser(DIEGO, () =>
        updateSourceAction(
          formFrom({ id: folha.id, version: folha.version, frequencyMinutes: 10 }),
        ),
      ),
    ).toMatchObject({ ok: true });
    const mt = await detailBySlug("mt-agora");
    const r = await asUser(DIEGO, () =>
      updateSourceAction(formFrom({ id: mt.id, version: mt.version, frequencyMinutes: 10 })),
    );
    expect(r).toMatchObject({
      ok: false,
      fieldErrors: {
        frequencyMinutes:
          "A via rápida está cheia: 1 de 1 fontes. Tire outra fonte da via rápida ou peça para aumentar o limite.",
      },
    });
    const after = await detailBySlug("mt-agora");
    expect(after.frequencyMinutes).toBe(mt.frequencyMinutes);
    expect(after.version).toBe(mt.version);

    const list = await listSources(parseSourceFilters(new URLSearchParams("via=rapida")));
    if (!list.ok) throw new Error("lista");
    expect(list.value.rows.map((x) => x.slug)).toEqual(["folha-do-cerrado"]);
    expect(list.value.fastLane).toMatchObject({ max: 1, used: 1 });

    // Volta ao padrão (sair da via rápida é sempre livre).
    const f2 = await detailBySlug("folha-do-cerrado");
    await asUser(DIEGO, () =>
      updateSourceAction(formFrom({ id: f2.id, version: f2.version, frequencyMinutes: "" })),
    );
    expect((await detailBySlug("folha-do-cerrado")).frequencyMinutes).toBeNull();
  });

  it("frequência fora da grade é recusada na ação", async () => {
    const mt = await detailBySlug("mt-agora");
    expect(
      await updateSourceAction(formFrom({ id: mt.id, version: mt.version, frequencyMinutes: 25 })),
    ).toMatchObject({ ok: false, fieldErrors: { frequencyMinutes: expect.any(String) } });
  });

  it("padrão global recusa 10", async () => {
    expect(await setDefaultFrequencyAction(formFrom({ value: 10 }))).toMatchObject({ ok: false });
    expect(await setDefaultFrequencyAction(formFrom({ value: 45 }))).toMatchObject({ ok: false });
    expect(await setDefaultFrequencyAction(formFrom({ value: 60 }))).toMatchObject({ ok: true });
    const setting = (
      await svc
        .from("app_settings")
        .select("value")
        .eq("key", "sources.default_frequency_minutes")
        .single()
    ).data;
    expect(setting?.value).toBe(60);
    expect(await setDefaultFrequencyAction(formFrom({ value: 30 }))).toMatchObject({ ok: true });
  });
});

describe("coleta, análise e histórico", () => {
  it("coletar agora cria run manual e grava source.collect_now", async () => {
    const mt = await rowBySlug("mt-agora");
    const r = await asUser(DIEGO, () => collectNowAction(formFrom({ id: mt.id })));
    expect(r).toMatchObject({
      ok: true,
      message: "Coleta enfileirada. Acompanhe em Coleta e teste.",
    });
    if (!r.ok) throw new Error("coleta");
    runIds.push((r.data as { runId: string }).runId);
    const audit = await auditRows(`source:${mt.id}`);
    expect(audit.find((a) => a.action === "source.collect_now")?.details).toMatchObject({
      runId: (r.data as { runId: string }).runId,
    });
    // Mesma fonte de novo em menos de 5 min: recusado com a mensagem do limite.
    expect(await asUser(DIEGO, () => collectNowAction(formFrom({ id: mt.id })))).toMatchObject({
      ok: false,
    });
  });

  it("análise de link com fixtures aponta a Folha do Cerrado como já cadastrada", async () => {
    process.env.CRAWLER_FIXTURES = "1";
    try {
      const r = await asUser(DIEGO, () =>
        analyzeLinkAction(formFrom({ url: "https://folhadocerrado.example/" })),
      );
      expect(r).toMatchObject({
        ok: true,
        data: { duplicate: { name: "Folha do Cerrado", archived: false } },
      });
      const bad = await asUser(DIEGO, () =>
        analyzeLinkAction(formFrom({ url: "http://169.254.169.254/latest/meta-data/" })),
      );
      expect(bad).toMatchObject({ ok: false, message: "Este endereço não é permitido." });
    } finally {
      delete process.env.CRAWLER_FIXTURES;
    }
  });

  it("histórico da fonte mostra quem mudou, com diff", async () => {
    const mt = await rowBySlug("mt-agora");
    const h = await sourceHistory(mt.id);
    if (!h.ok) throw new Error("histórico");
    const update = h.value.rows.find(
      (r) => r.action === "source.update" && r.changes.some((c) => c.field === "editorial_score"),
    );
    expect(update?.actor.name).toBe("Helena Costa");
  });
});

describe("aviso de fontes puladas pela via rápida (fast_lane_full)", () => {
  it("só mostra quem foi pulada por falta de vaga nos últimos 30 min", async () => {
    const mt = await rowBySlug("mt-agora");
    const now = new Date();

    const recent = await svc
      .from("ingest_runs")
      .insert({
        window_start: now.toISOString(),
        trigger: "fast",
        started_at: now.toISOString(),
        stats: {
          skipped: [
            { slug: mt.slug, reason: "fast_lane_full" },
            { slug: "folha-do-cerrado", reason: "previous_pending" },
          ],
        },
      })
      .select("id")
      .single();
    expect(recent.error).toBeNull();
    runIds.push(recent.data!.id);

    const old = new Date(now.getTime() - 40 * 60_000);
    const stale = await svc
      .from("ingest_runs")
      .insert({
        window_start: old.toISOString(),
        trigger: "fast",
        started_at: old.toISOString(),
        stats: { skipped: [{ slug: "diario-da-baixada", reason: "fast_lane_full" }] },
      })
      .select("id")
      .single();
    expect(stale.error).toBeNull();
    runIds.push(stale.data!.id);

    const r = await asUser(HELENA, () => fastLaneSkippedSources(now));
    if (!r.ok) throw new Error("fastLaneSkippedSources");
    expect(r.value.map((s) => s.slug)).toEqual([mt.slug]);
    expect(r.value[0]?.name).toBe("MT Agora");
  });
});
