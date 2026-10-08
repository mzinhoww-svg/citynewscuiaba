// @vitest-environment node
// Migration 0033 (revisão final do Painel de Fontes, docs/reports/painel-fontes-final-review.md):
// regras que valem no banco para qualquer caminho, exercitadas por REST como pessoa da equipe
// (sessão real, RLS valendo) e pela service role. Pilha local sem Docker (A-017), fontes do seed.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";

const SEED_PASSWORD = "citynews-local-123";
const MARINA = "c1000000-0000-4000-8000-000000000002"; // editor_chefe (source.approve_critical)
const DIEGO = "c1000000-0000-4000-8000-000000000007"; // operador_ia (source.manage)

const svc = createServiceClient();
const testStart = new Date().toISOString();

const sessions = new Map<string, Promise<DbClient>>();
function as(email: string): Promise<DbClient> {
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
const diego = () => as("diego.prado@citynews.local");
const marina = () => as("marina.arruda@citynews.local");
const otavio = () => as("otavio.reis@citynews.local"); // editor (metrics.view, sem source.manage)
const thiago = () => as("thiago.moraes@citynews.local"); // analista

type Row = Database["public"]["Tables"]["sources"]["Row"];
async function rowBySlug(slug: string): Promise<Row> {
  const r = await svc.from("sources").select("*").eq("slug", slug).single();
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

/** `update` por REST como pessoa: devolve a mensagem de erro (ou null quando aplicou). */
async function updateAs(client: Promise<DbClient>, id: string, patch: Partial<Row>) {
  const c = await client;
  const r = await c
    .from("sources")
    .update(patch as never)
    .eq("id", id)
    .select("id");
  if (r.error) return r.error.message;
  // RLS que oculta a linha devolve 0 linhas sem erro: também conta como "não aplicou".
  return r.data.length === 0 ? "0 linhas" : null;
}

async function auditActions(objectRef: string) {
  const r = await svc
    .from("audit_log")
    .select("action")
    .eq("object_ref", objectRef)
    .gt("at", testStart)
    .order("id");
  if (r.error) throw new Error(r.error.message);
  return r.data.map((x) => x.action);
}

const TOUCHED = ["agro-em-pauta-mt", "radio-pantanal", "brasil-hoje"] as const;
const snapshots = new Map<string, Row>();

beforeAll(async () => {
  for (const slug of TOUCHED) snapshots.set(slug, await rowBySlug(slug));
});

afterAll(async () => {
  for (const [slug, row] of snapshots) {
    const now = await rowBySlug(slug);
    // Arquivada só aceita restaurar; bloqueada só volta para paused.
    if (now.archived_at) {
      const r = await svc
        .from("sources")
        .update({ archived_at: null, archived_by: null, archive_reason: null })
        .eq("id", row.id);
      if (r.error) throw new Error(`desarquivar ${slug}: ${r.error.message}`);
    }
    if (now.status === "blocked" && row.status !== "blocked") {
      const r = await svc
        .from("sources")
        .update({ status: "paused", status_reason: "manual" })
        .eq("id", row.id);
      if (r.error) throw new Error(`desbloquear ${slug}: ${r.error.message}`);
    }
    const rest: Partial<Row> = { ...row };
    delete rest.id;
    delete rest.created_at;
    delete rest.slug;
    delete rest.version;
    delete rest.updated_at;
    const r = await svc.from("sources").update(rest).eq("id", row.id);
    if (r.error) throw new Error(`restaurar ${slug}: ${r.error.message}`);
  }
  await svc.from("approvals").delete().like("target_ref", "source:%").gt("created_at", testStart);
  await svc.from("approvals").delete().eq("justification", "[0033] aprovação antiga");
  await svc.from("source_health_daily").delete().eq("day", "2020-01-01");
});

// ---------------------------------------------------------------------------

describe("I-3 · slug e created_by não mudam por pessoa", () => {
  it("operador_ia não troca o slug por REST; nada vai para a auditoria", async () => {
    const s = await rowBySlug("agro-em-pauta-mt");
    const before = (await auditActions(`source:${s.id}`)).length;
    expect(await updateAs(diego(), s.id, { slug: "agro-em-pauta-mt-2" })).toMatch(/slug/);
    expect((await rowBySlug("agro-em-pauta-mt")).version).toBe(s.version);
    expect((await auditActions(`source:${s.id}`)).length).toBe(before);
  });

  it("operador_ia não troca created_by", async () => {
    const s = await rowBySlug("agro-em-pauta-mt");
    expect(await updateAs(diego(), s.id, { created_by: MARINA })).toMatch(/created_by/);
  });

  it("service_role (console, migrations) continua podendo corrigir o slug", async () => {
    const s = await rowBySlug("agro-em-pauta-mt");
    const r = await svc.from("sources").update({ slug: "agro-em-pauta-mt-x" }).eq("id", s.id);
    expect(r.error).toBeNull();
    const back = await svc.from("sources").update({ slug: "agro-em-pauta-mt" }).eq("id", s.id);
    expect(back.error).toBeNull();
  });
});

describe("I-5 · motivo obrigatório vale no banco (spec §7.3/§9, D-F5)", () => {
  it("arquivar sem archive_reason é recusado; com motivo aplica e audita source.archive", async () => {
    const s = await rowBySlug("radio-pantanal"); // pausada no seed
    expect(s.status).toBe("paused");
    const at = new Date().toISOString();
    expect(await updateAs(diego(), s.id, { archived_at: at, archived_by: DIEGO })).toMatch(
      /motivo/i,
    );
    expect(
      await updateAs(diego(), s.id, { archived_at: at, archived_by: DIEGO, archive_reason: "  " }),
    ).toMatch(/motivo/i);
    expect((await rowBySlug("radio-pantanal")).archived_at).toBeNull();

    expect(
      await updateAs(diego(), s.id, {
        archived_at: at,
        archived_by: DIEGO,
        archive_reason: "Veículo encerrou as atividades",
      }),
    ).toBeNull();
    expect((await rowBySlug("radio-pantanal")).archive_reason).toBe(
      "Veículo encerrou as atividades",
    );
    expect(await auditActions(`source:${s.id}`)).toContain("source.archive");
  });

  it("bloquear sem motivo de bloqueio é recusado; status_reason antigo não serve", async () => {
    const s = await rowBySlug("agro-em-pauta-mt"); // ativa, status_reason null
    expect(await updateAs(diego(), s.id, { status: "blocked" })).toMatch(/motivo/i);
    expect(await updateAs(diego(), s.id, { status: "blocked", status_reason: "manual" })).toMatch(
      /motivo/i,
    );
    expect(
      await updateAs(diego(), s.id, { status: "blocked", status_reason: "auto_failures" }),
    ).toMatch(/motivo/i);
    expect((await rowBySlug("agro-em-pauta-mt")).status).toBe("active");

    expect(
      await updateAs(diego(), s.id, { status: "blocked", status_reason: "quality" }),
    ).toBeNull();
    expect(await rowBySlug("agro-em-pauta-mt")).toMatchObject({
      status: "blocked",
      status_reason: "quality",
    });
    expect(await auditActions(`source:${s.id}`)).toContain("source.status");
  });
});

describe("I-4 · aprovação aprovada expira em 24 h se não for aplicada", () => {
  const field = "image_policy";
  const value = "with_agreement";

  async function insertApproval(decidedAt: string) {
    const s = await rowBySlug("brasil-hoje");
    const r = await svc
      .from("approvals")
      .insert({
        kind: "source.critical",
        target_ref: `source:${s.id}:${field}=${value}`,
        requested_by: DIEGO,
        approved_by: MARINA,
        justification: "[0033] aprovação antiga",
        status: "approved",
        created_at: decidedAt,
        decided_at: decidedAt,
      })
      .select("id")
      .single();
    if (r.error) throw new Error(r.error.message);
    return r.data.id;
  }
  async function approvalStatus(id: string) {
    return (await svc.from("approvals").select("status").eq("id", id).single()).data?.status;
  }

  it("aprovada há 2 dias não é consumida: o banco exige aprovação registrada e recente", async () => {
    const s = await rowBySlug("brasil-hoje");
    expect(s.image_policy).toBe("none");
    const old = await insertApproval(new Date(Date.now() - 2 * 86_400_000).toISOString());
    expect(await updateAs(diego(), s.id, { image_policy: value })).toMatch(
      /exige aprovação registrada/,
    );
    expect((await rowBySlug("brasil-hoje")).image_policy).toBe("none");
    expect(await approvalStatus(old)).toBe("approved");
  });

  it("aprovada agora é consumida uma vez (applied)", async () => {
    const s = await rowBySlug("brasil-hoje");
    const fresh = await insertApproval(new Date().toISOString());
    expect(await updateAs(diego(), s.id, { image_policy: value })).toBeNull();
    expect((await rowBySlug("brasil-hoje")).image_policy).toBe(value);
    expect(await approvalStatus(fresh)).toBe("applied");
  });

  it("guard_approvals preenche decided_at na decisão (editor-chefe por REST)", async () => {
    const s = await rowBySlug("brasil-hoje");
    const created = await svc
      .from("approvals")
      .insert({
        kind: "source.critical",
        target_ref: `source:${s.id}:republish_policy=summary_2_sentences`,
        requested_by: DIEGO,
        justification: "[0033] aprovação antiga",
      })
      .select("id, decided_at")
      .single();
    if (created.error) throw new Error(created.error.message);
    expect(created.data.decided_at).toBeNull();
    const m = await marina();
    const r = await m
      .from("approvals")
      .update({ status: "approved", approved_by: MARINA })
      .eq("id", created.data.id)
      .select("status, decided_at")
      .single();
    expect(r.error).toBeNull();
    expect(r.data?.status).toBe("approved");
    expect(r.data?.decided_at).not.toBeNull();
  });
});

describe("M-1 · source_health_daily: editor lê (metrics.view)", () => {
  it("editor e analista leem; a linha existe", async () => {
    const s = await rowBySlug("brasil-hoje");
    const ins = await svc
      .from("source_health_daily")
      .insert({ day: "2020-01-01", source_id: s.id, fetch_ok: 1 });
    expect(ins.error).toBeNull();
    for (const who of [otavio(), thiago()]) {
      const c = await who;
      const r = await c.from("source_health_daily").select("day").eq("day", "2020-01-01");
      expect(r.error).toBeNull();
      expect(r.data).toHaveLength(1);
    }
  });
});

describe("M-4 · rate_limit_per_hour entre 1 e 120 no banco", () => {
  it("100000 e 0 são recusados mesmo pela service role; 120 passa", async () => {
    const s = await rowBySlug("agro-em-pauta-mt");
    const big = await svc.from("sources").update({ rate_limit_per_hour: 100_000 }).eq("id", s.id);
    expect(big.error?.code).toBe("23514");
    const zero = await svc.from("sources").update({ rate_limit_per_hour: 0 }).eq("id", s.id);
    expect(zero.error?.code).toBe("23514");
    const ok = await svc.from("sources").update({ rate_limit_per_hour: 120 }).eq("id", s.id);
    expect(ok.error).toBeNull();
  });
});
