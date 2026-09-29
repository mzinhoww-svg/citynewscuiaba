// @vitest-environment node
// FS-T1 · Painel de fontes no banco (migration 0011): grade de frequência, via rápida, trava de coleta,
// duas pessoas em campo crítico, versão otimista, auditoria, arquivamento, runs e views públicas.
// Pilha local (A-017); usuários do seed (JWT real, RLS e triggers valendo).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { clientOf, SEED_USERS, type SeedUser } from "./studio";

const db = createServiceClient();
const HELENA = SEED_USERS.helena.id; // admin
const MARINA = SEED_USERS.marina.id; // editor_chefe
const DIEGO = SEED_USERS.diego.id; // operador_ia

const WINDOW = "2031-03-05T14:30:00.000Z"; // longe de qualquer outro teste
const SLUGS = [
  "folha-do-cerrado",
  "diario-da-baixada",
  "mt-agora",
  "portal-varzea",
  "radio-pantanal",
  "correio-mato-grossense",
];

interface Err {
  message: string;
}
/** Resposta PostgREST → valor, ou exceção com a mensagem do banco. */
function must<T>(r: { data: T; error: Err | null }): NonNullable<T> {
  if (r.error) throw new Error(r.error.message);
  if (r.data === null || r.data === undefined) throw new Error("resposta vazia");
  return r.data;
}
async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await (db.rpc as any)(name, args);
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
async function rpcAs<T = unknown>(
  user: SeedUser,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const c = await clientOf(user);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await (c.rpc as any)(name, args);
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

async function sourceBySlug(slug: string) {
  return must(await db.from("sources").select("*").eq("slug", slug).single());
}
async function setting(key: string, value: number) {
  await rpc("app_setting_set", { p_key: key, p_value: value, p_ctx: {} });
}
const update = (
  user: SeedUser,
  s: { id: string; version: number },
  patch: Record<string, unknown>,
  ctx: Record<string, unknown> = {},
) =>
  rpcAs<number>(user, "source_admin_update", {
    p_id: s.id,
    p_version: s.version,
    p_patch: patch,
    p_ctx: ctx,
  });
const status = (
  user: SeedUser,
  s: { id: string; version: number },
  action: string,
  reason: string | null = null,
  ctx: Record<string, unknown> = {},
) =>
  rpcAs<number>(user, "source_admin_status", {
    p_id: s.id,
    p_version: s.version,
    p_action: action,
    p_reason: reason,
    p_ctx: ctx,
  });

async function auditFor(id: string, after: number) {
  const { data } = await db
    .from("audit_log")
    .select("*")
    .eq("object_ref", `source:${id}`)
    .gt("id", after)
    .order("id");
  return data ?? [];
}

let baseline = 0;
let snapshot: Awaited<ReturnType<typeof sourceBySlug>>[] = [];
const approvalIds: string[] = [];
const runIds: string[] = [];
const createdSourceIds: string[] = [];

beforeAll(async () => {
  const last = await db
    .from("audit_log")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  baseline = last.data?.id ?? 0;
  snapshot = must(await db.from("sources").select("*").in("slug", SLUGS));
});

afterAll(async () => {
  // Tira todas da via rápida antes de restaurar (a vaga é conferida pelo trigger).
  await db.from("sources").update({ frequency_minutes: null }).in("slug", SLUGS);
  await setting("sources.fast_lane_max", 10);
  await setting("sources.default_frequency_minutes", 30);
  for (const s of snapshot) {
    await db
      .from("sources")
      .update({
        status: s.status,
        status_reason: s.status_reason,
        archived_at: null,
        archived_by: null,
        archive_reason: null,
        image_policy: s.image_policy,
        republish_policy: s.republish_policy,
        reliability: s.reliability,
        may_be_sole_source: s.may_be_sole_source,
        editorial_score: s.editorial_score,
        frequency_minutes: s.frequency_minutes,
        last_fetch_started_at: null,
        last_fetch_run_id: null,
      })
      .eq("id", s.id);
  }
  if (approvalIds.length) await db.from("approvals").delete().in("id", approvalIds);
  if (runIds.length) await db.from("ingest_runs").delete().in("id", runIds);
  await db.from("ingest_runs").delete().eq("window_start", WINDOW);
  if (createdSourceIds.length) {
    await db.from("source_health_daily").delete().in("source_id", createdSourceIds);
    await db.from("sources").delete().in("id", createdSourceIds);
  }
});

describe("grade de frequência", () => {
  it("fora da grade é recusada pelo banco; 10, 15 e 20 passam", async () => {
    for (const v of [5, 25, 45, 1470]) {
      const r = await db
        .from("sources")
        .update({ frequency_minutes: v })
        .eq("slug", "folha-do-cerrado");
      expect(r.error?.message, `valor ${v}`).toMatch(/check/);
    }
    for (const v of [10, 15, 20, 60, null]) {
      const r = await db
        .from("sources")
        .update({ frequency_minutes: v })
        .eq("slug", "folha-do-cerrado");
      expect(r.error, `valor ${v}`).toBeNull();
    }
  });

  it("padrão global só aceita 30 a 1440 em múltiplos de 30; vagas de 0 a 20", async () => {
    for (const v of [10, 45, 1470, 0]) {
      await expect(setting("sources.default_frequency_minutes", v)).rejects.toThrow();
    }
    await setting("sources.default_frequency_minutes", 60);
    await setting("sources.default_frequency_minutes", 30);
    await expect(setting("sources.fast_lane_max", 21)).rejects.toThrow();
    await expect(setting("sources.fast_lane_max", -1)).rejects.toThrow();
    await setting("sources.fast_lane_max", 0);
    await setting("sources.fast_lane_max", 10);
    await expect(setting("sources.chave_desconhecida", 1)).rejects.toThrow();
  });

  it("app_setting_set audita settings.update e a semente existe", async () => {
    const before =
      must(await db.from("audit_log").select("id").order("id", { ascending: false }).limit(1))[0]
        ?.id ?? 0;
    await rpcAs("helena", "app_setting_set", {
      p_key: "sources.default_frequency_minutes",
      p_value: 90,
      p_ctx: { reason: "Teste" },
    });
    const rows = must(
      await db.from("audit_log").select("*").eq("action", "settings.update").gt("id", before),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor: HELENA,
      object_ref: "setting:sources.default_frequency_minutes",
    });
    expect(rows[0]?.details).toMatchObject({
      changes: [{ field: "value", from: 30, to: 90 }],
      reason: "Teste",
    });
    await setting("sources.default_frequency_minutes", 30);
    const seeds = must(await db.from("app_settings").select("key, value").like("key", "sources.%"));
    expect(Object.fromEntries(seeds.map((r) => [r.key, r.value]))).toMatchObject({
      "sources.default_frequency_minutes": 30,
      "sources.fast_lane_max": 10,
    });
  });
});

describe("via rápida (D-F28)", () => {
  it("só fonte ativa e com vaga", async () => {
    await setting("sources.fast_lane_max", 1);
    const folha = await sourceBySlug("folha-do-cerrado");
    await db.from("sources").update({ frequency_minutes: null }).eq("id", folha.id);
    await update("helena", await sourceBySlug("folha-do-cerrado"), { frequency_minutes: 10 });

    const mt = await sourceBySlug("mt-agora"); // active
    await expect(update("helena", mt, { frequency_minutes: 15 })).rejects.toThrow(
      /via rápida está cheia/,
    );

    const pausada = await sourceBySlug("radio-pantanal"); // paused no seed
    expect(pausada.status).toBe("paused");
    await expect(update("helena", pausada, { frequency_minutes: 10 })).rejects.toThrow(
      /Ative a fonte/,
    );

    // Troca dentro da via não ocupa vaga; sair da via também é livre.
    const f2 = await sourceBySlug("folha-do-cerrado");
    await update("helena", f2, { frequency_minutes: 20 });
    await update("helena", await sourceBySlug("folha-do-cerrado"), { frequency_minutes: 60 });
    // Vaga liberada: agora a MT Agora entra.
    await update("helena", await sourceBySlug("mt-agora"), { frequency_minutes: 15 });
    await update("helena", await sourceBySlug("mt-agora"), { frequency_minutes: null });
  });

  it("arquivar fonte rápida devolve o padrão e libera a vaga", async () => {
    await setting("sources.fast_lane_max", 10);
    const folha = await sourceBySlug("folha-do-cerrado");
    await update("helena", folha, { frequency_minutes: 10 });
    await status("helena", await sourceBySlug("folha-do-cerrado"), "pause", "manual");
    // Pausar não libera vaga.
    const paused = await sourceBySlug("folha-do-cerrado");
    expect(paused.frequency_minutes).toBe(10);
    await status("helena", paused, "archive", "duplicada");
    const arch = await sourceBySlug("folha-do-cerrado");
    expect(arch.frequency_minutes).toBeNull();
    expect(arch.archived_at).not.toBeNull();
    await status("helena", arch, "restore");
    await status("helena", await sourceBySlug("folha-do-cerrado"), "activate");
    expect((await sourceBySlug("folha-do-cerrado")).status).toBe("active");
  });

  it("ativar ou retomar zera as falhas seguidas (0031)", async () => {
    const s = await sourceBySlug("radio-pantanal"); // paused (seed)
    await db
      .from("sources")
      .update({ status_reason: "auto_failures", consecutive_failures: 3 })
      .eq("id", s.id);
    await status("helena", await sourceBySlug("radio-pantanal"), "activate");
    const after = await sourceBySlug("radio-pantanal");
    expect(after).toMatchObject({ status: "active", status_reason: null, consecutive_failures: 0 });
    await status("helena", after, "pause", "manual");
  });

  it("marcações simultâneas não passam da vaga", async () => {
    await setting("sources.fast_lane_max", 1);
    const a = await sourceBySlug("diario-da-baixada");
    const b = await sourceBySlug("correio-mato-grossense");
    const results = await Promise.allSettled([
      update("helena", a, { frequency_minutes: 10 }),
      update("marina", b, { frequency_minutes: 10 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const { count } = await db
      .from("sources")
      .select("*", { count: "exact", head: true })
      .in("slug", SLUGS)
      .lt("frequency_minutes", 30);
    expect(count).toBe(1);
    await db.from("sources").update({ frequency_minutes: null }).in("slug", SLUGS);
    await setting("sources.fast_lane_max", 10);
  });
});

describe("claim_source_fetch (D-F29)", () => {
  it("uma coleta por janela de 10 min; retry do mesmo run passa", async () => {
    const id = (await sourceBySlug("folha-do-cerrado")).id;
    const since = new Date(Date.now() - 60_000).toISOString(); // início da janela de 10 min
    await db
      .from("sources")
      .update({ last_fetch_started_at: null, last_fetch_run_id: null })
      .eq("id", id);
    const CRON_RUN = randomUUID();
    const FAST_RUN = randomUUID();
    expect(await rpc("claim_source_fetch", { p_source: id, p_run: CRON_RUN, p_since: since })).toBe(
      true,
    );
    expect(await rpc("claim_source_fetch", { p_source: id, p_run: FAST_RUN, p_since: since })).toBe(
      false,
    );
    expect(await rpc("claim_source_fetch", { p_source: id, p_run: CRON_RUN, p_since: since })).toBe(
      true,
    );
    // Janela nova (since no futuro): outra coleta pode começar.
    const later = new Date(Date.now() + 3_600_000).toISOString();
    expect(await rpc("claim_source_fetch", { p_source: id, p_run: FAST_RUN, p_since: later })).toBe(
      true,
    );
  });

  it("campos operacionais não bumpam a versão nem entram na auditoria", async () => {
    const s = await sourceBySlug("folha-do-cerrado");
    const mark =
      must(await db.from("audit_log").select("id").order("id", { ascending: false }).limit(1))[0]
        ?.id ?? 0;
    await db
      .from("sources")
      .update({
        last_fetched_at: new Date().toISOString(),
        etag: "x",
        last_error: null,
        consecutive_failures: 0,
      })
      .eq("id", s.id);
    expect((await sourceBySlug("folha-do-cerrado")).version).toBe(s.version);
    expect(await auditFor(s.id, mark)).toHaveLength(0);
  });

  it("peek_rate_limit lê a cota sem consumir", async () => {
    const key = `fs-t1-${randomUUID()}`;
    expect(
      await rpc("peek_rate_limit", {
        p_bucket: "fs-t1",
        p_key_hash: key,
        p_limit: 2,
        p_window_seconds: 3600,
      }),
    ).toBe(true);
    await rpc("hit_rate_limit", {
      p_bucket: "fs-t1",
      p_key_hash: key,
      p_limit: 2,
      p_window_seconds: 3600,
    });
    await rpc("hit_rate_limit", {
      p_bucket: "fs-t1",
      p_key_hash: key,
      p_limit: 2,
      p_window_seconds: 3600,
    });
    expect(
      await rpc("peek_rate_limit", {
        p_bucket: "fs-t1",
        p_key_hash: key,
        p_limit: 2,
        p_window_seconds: 3600,
      }),
    ).toBe(false);
    expect(
      await rpc("peek_rate_limit", {
        p_bucket: "fs-t1",
        p_key_hash: key,
        p_limit: 2,
        p_window_seconds: 3600,
      }),
    ).toBe(false);
    await db.from("rate_limits").delete().eq("bucket", "fs-t1");
  });
});

describe("duas pessoas em campo crítico (Review Focus 2)", () => {
  it("sem aprovação não muda, nem por SQL direto", async () => {
    const s = await sourceBySlug("portal-varzea"); // image_policy none no seed
    expect(s.image_policy).toBe("none");
    await expect(update("diego", s, { image_policy: "reproduction" })).rejects.toThrow(/aprovação/);
    const c = await clientOf("diego");
    const direct = await c.from("sources").update({ image_policy: "reproduction" }).eq("id", s.id);
    expect(direct.error?.message).toMatch(/aprovação/);
    expect((await sourceBySlug("portal-varzea")).image_policy).toBe("none");
  });

  it("cada campo crítico é barrado sem aprovação", async () => {
    const s = await sourceBySlug("portal-varzea");
    for (const patch of [
      { republish_policy: "summary_2_sentences" },
      { reliability: "verified" },
      { reliability: "primary" },
      { may_be_sole_source: true },
      { image_policy: "licensed_only" },
    ]) {
      await expect(update("diego", s, patch), JSON.stringify(patch)).rejects.toThrow(/aprovação/);
    }
    // Restringir e mudar o resto aplica na hora.
    await update("diego", s, { reliability: "low", editorial_score: 3 });
    await update("diego", await sourceBySlug("portal-varzea"), { reliability: "standard" });
  });

  it("aprovação de outra pessoa aplica e é consumida", async () => {
    const s = await sourceBySlug("portal-varzea");
    const d = await clientOf("diego");
    const a = must(
      await d
        .from("approvals")
        .insert({
          kind: "source.critical",
          target_ref: `source:${s.id}:image_policy=reproduction`,
          requested_by: DIEGO,
          justification: "Acordo assinado em 20/09",
        })
        .select()
        .single(),
    );
    approvalIds.push(a.id);
    // Operador de IA nem enxerga o pedido como decidível (RLS): nada muda.
    await d.from("approvals").update({ status: "approved", approved_by: DIEGO }).eq("id", a.id);
    expect(must(await db.from("approvals").select("status").eq("id", a.id).single()).status).toBe(
      "pending",
    );
    // Ainda pendente: não aplica.
    await expect(update("diego", s, { image_policy: "reproduction" })).rejects.toThrow(/aprovação/);

    const m = await clientOf("marina");
    must(
      await m
        .from("approvals")
        .update({ status: "approved", approved_by: MARINA })
        .eq("id", a.id)
        .select(),
    );
    // Aprovação vale só para o valor pedido.
    await expect(update("marina", s, { image_policy: "licensed_only" })).rejects.toThrow(
      /aprovação/,
    );
    const mark =
      must(await db.from("audit_log").select("id").order("id", { ascending: false }).limit(1))[0]
        ?.id ?? 0;
    await update("marina", s, { image_policy: "reproduction" }, { reason: "Acordo" });
    expect((await sourceBySlug("portal-varzea")).image_policy).toBe("reproduction");
    const row = must(await db.from("approvals").select("*").eq("id", a.id).single());
    expect(row.status).toBe("applied");
    // Uso único: repetir a mudança depois de voltar exige nova aprovação.
    await update("marina", await sourceBySlug("portal-varzea"), { image_policy: "none" });
    await expect(
      update("marina", await sourceBySlug("portal-varzea"), { image_policy: "reproduction" }),
    ).rejects.toThrow(/aprovação/);
    // A auditoria tem as duas pessoas.
    const rows = await auditFor(s.id, mark);
    const applied = rows.find((r) => JSON.stringify(r.details).includes("reproduction"));
    expect(applied?.actor).toBe(MARINA);
    expect(applied?.details).toMatchObject({
      reason: "Acordo",
      approvals: [{ id: a.id, requested_by: DIEGO, approved_by: MARINA }],
    });
  });

  it("aprovação da mesma pessoa que pediu (via service) não é aceita pelo guard", async () => {
    const s = await sourceBySlug("correio-mato-grossense");
    const a = must(
      await db
        .from("approvals")
        .insert({
          kind: "source.critical",
          target_ref: `source:${s.id}:may_be_sole_source=true`,
          requested_by: DIEGO,
          justification: "x",
          status: "approved",
          approved_by: MARINA,
        })
        .select()
        .single(),
    );
    approvalIds.push(a.id);
    await update("diego", s, { may_be_sole_source: true });
    expect((await sourceBySlug("correio-mato-grossense")).may_be_sole_source).toBe(true);
    await update("diego", await sourceBySlug("correio-mato-grossense"), {
      may_be_sole_source: false,
    });
  });

  it("desbloquear exige aprovação; bloquear não", async () => {
    const s = await sourceBySlug("radio-pantanal");
    await status("helena", s, "block", "quality");
    const blocked = await sourceBySlug("radio-pantanal");
    expect(blocked.status).toBe("blocked");
    expect(blocked.status_reason).toBe("quality");
    await expect(status("helena", blocked, "unblock")).rejects.toThrow(/aprovação/);
    const m = await clientOf("marina");
    const h = await clientOf("helena");
    const a = must(
      await h
        .from("approvals")
        .insert({
          kind: "source.critical",
          target_ref: `source:${s.id}:status=paused`,
          requested_by: HELENA,
          justification: "Contato reaberto",
        })
        .select()
        .single(),
    );
    approvalIds.push(a.id);
    const self = await h
      .from("approvals")
      .update({ status: "approved", approved_by: HELENA })
      .eq("id", a.id);
    expect(self.error?.message).toMatch(/quem pede não decide/);
    await expect(status("helena", blocked, "unblock")).rejects.toThrow(/aprovação/);
    must(
      await m
        .from("approvals")
        .update({ status: "approved", approved_by: MARINA })
        .eq("id", a.id)
        .select(),
    );
    await status("helena", blocked, "unblock");
    expect((await sourceBySlug("radio-pantanal")).status).toBe("paused");
  });

  it("nova fonte com campo crítico ou já ativa é recusada", async () => {
    const id = randomUUID();
    const base = {
      slug: `fs-t1-${id.slice(0, 8)}`,
      name: "Fonte Teste",
      base_url: "https://teste.example",
      kind: "rss",
      locality: "cuiaba",
    };
    await expect(
      rpcAs("diego", "source_admin_create", {
        p: { ...base, id, image_policy: "reproduction" },
        p_ctx: {},
      }),
    ).rejects.toThrow(/aprovação/);
    await expect(
      rpcAs("diego", "source_admin_create", { p: { ...base, frequency_minutes: 10 }, p_ctx: {} }),
    ).rejects.toThrow(/Ative a fonte/);
    await expect(
      rpcAs("diego", "source_admin_create", { p: { ...base, status: "active" }, p_ctx: {} }),
    ).rejects.toThrow();
    const created = await rpcAs<string>("diego", "source_admin_create", {
      p: { ...base, feed_url: "https://teste.example/feed" },
      p_ctx: { reason: "Novo" },
    });
    createdSourceIds.push(created);
    const row = must(await db.from("sources").select("*").eq("id", created).single());
    expect(row).toMatchObject({
      status: "paused",
      status_reason: "pending_activation",
      version: 1,
      created_by: DIEGO,
      editorial_score: 3,
      image_policy: "none",
    });
    const rows = await auditFor(created, baseline);
    expect(rows[0]).toMatchObject({ action: "source.create", actor: DIEGO });
    // Ativar exige termos revisados.
    await expect(status("diego", row, "activate")).rejects.toThrow(/termos/);
    await update("diego", row, {
      terms_reviewed_at: new Date().toISOString(),
      terms_reviewed_by: DIEGO,
    });
    await status("diego", await sourceBySlug(base.slug), "activate");
    expect((await sourceBySlug(base.slug)).status).toBe("active");
  });
});

describe("versão otimista e auditoria", () => {
  it("versão desatualizada não sobrescreve", async () => {
    const s = await sourceBySlug("correio-mato-grossense");
    const mine = s.editorial_score === 4 ? 5 : 4;
    const next = await update("helena", s, { editorial_score: mine });
    expect(next).toBe(s.version + 1);
    await expect(update("diego", s, { editorial_score: 2 })).rejects.toThrow(/conflito de versão/);
    expect((await sourceBySlug("correio-mato-grossense")).editorial_score).toBe(mine);
  });

  it("campo fora da lista editável é recusado", async () => {
    const s = await sourceBySlug("correio-mato-grossense");
    for (const patch of [
      { status: "blocked" },
      { version: 99 },
      { last_error: "x" },
      { slug: "outro" },
      { archived_at: new Date().toISOString() },
    ]) {
      await expect(update("helena", s, patch), JSON.stringify(patch)).rejects.toThrow(
        /não editável/,
      );
    }
  });

  it("registra o diff de configuração e ignora campos operacionais", async () => {
    const s = await sourceBySlug("radio-pantanal");
    const from = s.editorial_score;
    const to = from === 5 ? 4 : 5;
    await update(
      "helena",
      s,
      { editorial_score: to },
      { reason: "Cobertura de serviços", batchId: "lote-1", ipHash: "abc123" },
    );
    await db
      .from("sources")
      .update({ last_fetched_at: new Date().toISOString(), etag: "y" })
      .eq("id", s.id);
    const rows = await auditFor(s.id, baseline);
    const mine = rows.filter((r) => r.action === "source.update");
    const last = mine[mine.length - 1];
    expect(last).toMatchObject({ actor: HELENA, ip_hash: "abc123" });
    expect(last?.details).toMatchObject({
      changes: [{ field: "editorial_score", from, to }],
      reason: "Cobertura de serviços",
      batchId: "lote-1",
    });
    // A escrita operacional do service role não gerou linha extra.
    expect(rows[rows.length - 1]?.id).toBe(last?.id);
  });

  it("status e arquivamento têm ações próprias e ator sistema para o service role", async () => {
    const s = await sourceBySlug("diario-da-baixada");
    const mark =
      must(await db.from("audit_log").select("id").order("id", { ascending: false }).limit(1))[0]
        ?.id ?? 0;
    await db.from("sources").update({ status: "degraded" }).eq("id", s.id);
    await status("helena", await sourceBySlug("diario-da-baixada"), "pause", "manual", {
      reason: "Manutenção",
    });
    await status("helena", await sourceBySlug("diario-da-baixada"), "archive", "duplicada");
    await status("helena", await sourceBySlug("diario-da-baixada"), "restore");
    await status("helena", await sourceBySlug("diario-da-baixada"), "activate");
    const rows = await auditFor(s.id, mark);
    expect(rows.map((r) => [r.action, r.actor])).toEqual([
      ["source.status", "sistema"],
      ["source.status", HELENA],
      ["source.archive", HELENA],
      ["source.restore", HELENA],
      ["source.status", HELENA],
    ]);
    expect(rows[1]?.details).toMatchObject({
      reason: "Manutenção",
      changes: expect.arrayContaining([
        { field: "status", from: "degraded", to: "paused" },
        { field: "status_reason", from: null, to: "manual" },
      ]),
    });
  });
});

describe("ciclo de vida", () => {
  it("arquivar só pausada ou bloqueada; arquivada só aceita restaurar; delete revogado", async () => {
    const s = await sourceBySlug("mt-agora"); // active no seed
    await expect(status("helena", s, "archive", "duplicada")).rejects.toThrow(
      /pausada ou bloqueada/,
    );
    const h = await clientOf("helena");
    const del = await h.from("sources").delete().eq("id", s.id);
    expect(del.error?.message).toMatch(/permission denied/);

    await status("helena", s, "pause", "manual");
    await status("helena", await sourceBySlug("mt-agora"), "archive", "duplicada");
    const arch = await sourceBySlug("mt-agora");
    await expect(update("helena", arch, { editorial_score: 2 })).rejects.toThrow(/arquivada/);
    await expect(status("helena", arch, "activate")).rejects.toThrow(/arquivada/);
    await status("helena", arch, "restore");
    await status("helena", await sourceBySlug("mt-agora"), "activate");
  });

  it("fonte arquivada some de public_sources; o agregado já exibido continua íntegro", async () => {
    const s = await sourceBySlug("mt-agora");
    const visible = async () =>
      (await db.from("public_sources").select("slug").eq("slug", "mt-agora")).data?.length ?? 0;
    expect(await visible()).toBe(1);
    await status("helena", s, "pause", "manual");
    await status("helena", await sourceBySlug("mt-agora"), "archive", "duplicada");
    expect(await visible()).toBe(0);
    const aggBefore =
      (await db.from("public_aggregated").select("id").eq("source_slug", "mt-agora")).data ?? [];
    expect(aggBefore.length).toBeGreaterThan(0);
    await status("helena", await sourceBySlug("mt-agora"), "restore");
    await status("helena", await sourceBySlug("mt-agora"), "activate");
    expect(await visible()).toBe(1);
  });

  it("public_aggregated expõe source_editorial_score", async () => {
    const r = await db
      .from("public_aggregated")
      .select("source_slug, source_editorial_score")
      .limit(5);
    expect(r.error).toBeNull();
    expect((r.data ?? []).length).toBeGreaterThan(0);
    for (const row of r.data ?? []) expect(row.source_editorial_score).toBeGreaterThanOrEqual(1);
  });

  it("lote: resultado por fonte, frequência na via rápida até encher e motivo das ignoradas", async () => {
    await setting("sources.fast_lane_max", 2);
    const ids = [
      "folha-do-cerrado",
      "diario-da-baixada",
      "correio-mato-grossense",
      "radio-pantanal",
    ];
    const rows = await Promise.all(ids.map(sourceBySlug));
    const out = await rpcAs<{
      applied: number;
      skipped: number;
      items: { id: string; outcome: string; reason: string | null }[];
    }>("helena", "source_admin_bulk", {
      p_ids: rows.map((r) => r.id),
      p_action: "frequency",
      p_value: { frequency_minutes: 10 },
      p_ctx: { batchId: "lote-freq" },
    });
    expect(out.applied).toBe(2);
    expect(out.skipped).toBe(2);
    expect(out.items.map((i) => [i.outcome, i.reason])).toEqual([
      ["applied", null],
      ["applied", null],
      ["skipped", "fast_lane_full"],
      ["skipped", "not_active"],
    ]);
    const pause = await rpcAs<{
      applied: number;
      skipped: number;
      items: { reason: string | null }[];
    }>("helena", "source_admin_bulk", {
      p_ids: rows.map((r) => r.id),
      p_action: "pause",
      p_value: {},
      p_ctx: { batchId: "lote-pausa" },
    });
    expect(pause.applied).toBe(3);
    expect(pause.items[3]?.reason).toBe("already_paused");
    const audits = must(
      await db
        .from("audit_log")
        .select("details")
        .in(
          "object_ref",
          rows.map((r) => `source:${r.id}`),
        )
        .gt("id", baseline),
    );
    expect(audits.filter((a) => JSON.stringify(a.details).includes("lote-pausa"))).toHaveLength(3);
    await expect(
      rpcAs("helena", "source_admin_bulk", {
        p_ids: Array.from({ length: 51 }, () => randomUUID()),
        p_action: "pause",
        p_value: {},
        p_ctx: {},
      }),
    ).rejects.toThrow(/50/);
    // Fontes voltam ao normal no afterAll (status do snapshot).
  });
});

describe("runs e saúde", () => {
  it("run manual não conflita com o run da janela e o tick duplo continua único", async () => {
    const one = async (fn: string, args: Record<string, unknown>) => {
      const r = await rpc<{ run_id: string; created: boolean }[]>(fn, args);
      runIds.push(r[0]!.run_id);
      return r[0]!;
    };
    const a = await one("start_ingest_run", { p_window: WINDOW });
    const b = await one("start_ingest_run", { p_window: WINDOW });
    expect([a.created, b.created]).toEqual([true, false]);
    expect(b.run_id).toBe(a.run_id);
    const f1 = await one("start_fast_run", { p_window: WINDOW });
    const f2 = await one("start_fast_run", { p_window: WINDOW });
    expect([f1.created, f2.created]).toEqual([true, false]);
    expect(f2.run_id).toBe(f1.run_id);
    expect(f1.run_id).not.toBe(a.run_id);
    const folha = await sourceBySlug("folha-do-cerrado");
    const m1 = await rpc<string>("start_manual_run", { p_source: folha.id });
    const m2 = await rpc<string>("start_manual_run", { p_source: folha.id });
    runIds.push(m1, m2);
    expect(m1).not.toBe(m2);

    const rows = must(
      await db.from("ingest_runs").select("id, trigger, window_start, stats").in("id", runIds),
    );
    expect(
      rows.filter(
        (r) => r.trigger === "cron" && r.window_start === WINDOW.replace(".000Z", "+00:00"),
      ),
    ).toHaveLength(1);
    expect(rows.filter((r) => r.trigger === "fast")).toHaveLength(1);
    const manual = rows.filter((r) => r.trigger === "manual");
    expect(manual).toHaveLength(2);
    expect(manual[0]?.stats).toMatchObject({ source: folha.id });
  });

  it("record_source_fetch acumula o dia por fonte", async () => {
    const created = createdSourceIds[0] ?? (await sourceBySlug("placar-mt")).id;
    await rpc("record_source_fetch", {
      p_source: created,
      p_outcome: "ok",
      p_latency_ms: 200,
      p_items_new: 3,
      p_error: null,
    });
    await rpc("record_source_fetch", {
      p_source: created,
      p_outcome: "not_modified",
      p_latency_ms: 100,
      p_items_new: 0,
      p_error: null,
    });
    await rpc("record_source_fetch", {
      p_source: created,
      p_outcome: "failed",
      p_latency_ms: null,
      p_items_new: 0,
      p_error: "HTTP 503",
    });
    const rows = must(await db.from("source_health_daily").select("*").eq("source_id", created));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fetch_ok: 1,
      fetch_not_modified: 1,
      fetch_failed: 1,
      items_new: 3,
      latency_ms_sum: 300,
      latency_samples: 2,
      last_error: "HTTP 503",
    });
    await expect(
      rpc("record_source_fetch", {
        p_source: created,
        p_outcome: "?",
        p_latency_ms: 1,
        p_items_new: 0,
        p_error: null,
      }),
    ).rejects.toThrow();
    await db.from("source_health_daily").delete().eq("source_id", created);
  });
});

describe("seed, agente e permissões", () => {
  it("fontes do seed: camada, score, motivo e nenhuma na via rápida", async () => {
    const rows = must(await db.from("sources").select("*").in("slug", SLUGS));
    for (const r of rows) {
      expect(r.layer, r.slug).not.toBeNull();
      expect(r.editorial_score, r.slug).toBeGreaterThanOrEqual(1);
      expect(r.terms_reviewed_at, r.slug).not.toBeNull();
    }
    const pantanal = snapshot.find((s) => s.slug === "radio-pantanal");
    expect(pantanal).toMatchObject({ status: "paused", status_reason: "manual" });
    for (const s of snapshot.filter((x) => x.slug !== "radio-pantanal"))
      expect(s.status, s.slug).toBe("active");
    for (const s of snapshot) expect(s.frequency_minutes ?? null, s.slug).toBeNull();
  });

  it("agente source_profiler em produção e orçamento de write em 10", async () => {
    const agent = must(await db.from("ai_agents").select("*").eq("id", "source_profiler").single());
    expect(agent).toMatchObject({
      model_id: "google/gemini-2.5-flash",
      fallback_model_id: "openai/gpt-4o-mini",
      prompt_version: 1,
      daily_budget_brl: 1,
      enabled: true,
    });
    const prompt = must(
      await db
        .from("ai_prompts")
        .select("*")
        .eq("agent_id", "source_profiler")
        .eq("version", 1)
        .single(),
    );
    expect(prompt.status).toBe("production");
    expect(prompt.body).toContain("Não opine sobre direitos de uso, confiabilidade ou frequência.");
    const agents = must(await db.from("ai_agents").select("id, daily_budget_brl"));
    expect(agents.find((a) => a.id === "write")?.daily_budget_brl).toBe(10);
    expect(agents.reduce((n, a) => n + Number(a.daily_budget_brl), 0)).toBe(30);
  });

  it("flag da análise por link ligada", async () => {
    const f = must(
      await db.from("feature_flags").select("enabled").eq("key", "source_link_analysis").single(),
    );
    expect(f.enabled).toBe(true);
  });

  it("leitura de tabelas novas: equipe de fontes lê; leitor e anônimo não; escrita direta só do servidor", async () => {
    const diego = await clientOf("diego");
    expect((await diego.from("app_settings").select("key")).error).toBeNull();
    expect((await diego.from("source_health_daily").select("day")).error).toBeNull();
    expect((await diego.from("source_discoveries").select("id")).error).toBeNull();
    const carlos = await clientOf("carlos"); // leitor da equipe sem source.manage
    const seen = must(await carlos.from("source_discoveries").select("id"));
    expect(seen).toHaveLength(0);
    const ins = await diego
      .from("source_discoveries")
      .insert({ input_url: "https://x.example", created_by: DIEGO });
    expect(ins.error).not.toBeNull();
    const fn = await diego.rpc("claim_source_fetch", {
      p_source: randomUUID(),
      p_run: randomUUID(),
      p_since: new Date().toISOString(),
    });
    expect(fn.error).not.toBeNull();
  });
});
