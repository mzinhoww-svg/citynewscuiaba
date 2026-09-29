// @vitest-environment node
// Correções do gate da P5 (frente A): integridade das aprovações e proteções no banco. Cada caso
// reproduz um achado da revisão independente como `authenticated`, com JWT de usuário de seed.
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database, Json } from "@/lib/db/types";
import { DEFAULT_RULES } from "@/lib/rules/defaults";

const SEED_PASSWORD = "citynews-local-123";
const HELENA = "c1000000-0000-4000-8000-000000000001"; // admin
const MARINA = "c1000000-0000-4000-8000-000000000002"; // editor_chefe
const RAFAEL = "c1000000-0000-4000-8000-000000000005"; // jornalista
const DIEGO = "c1000000-0000-4000-8000-000000000007"; // operador_ia
const CARLOS = "c1000000-0000-4000-8000-000000000009"; // moderador

const RULES_BODY = DEFAULT_RULES as unknown as NonNullable<Json>;
const run = Date.now() % 1_000_000;
const ruleVersion = (n: number) => 3_000_000 + run * 10 + n;
const weightsVersion = (n: number) => `gate-${run}-${n}`;
const agentId = `agente-gate-${run}`;
const tagSlug = `gate-tag-${run}`;

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
    return client;
  });
  sessions.set(email, ready);
  return ready;
}
const helena = () => as("helena.costa@citynews.local");
const marina = () => as("marina.arruda@citynews.local");
const rafael = () => as("rafael.siqueira@citynews.local");
const diego = () => as("diego.prado@citynews.local");

const service = createServiceClient();
const sectionSlugs: string[] = [];
let activeRulesBefore: number[] = [];
let activeWeightsBefore: string[] = [];

async function snapshot() {
  const r = await service.from("rules").select("version").eq("active", true);
  activeRulesBefore = (r.data ?? []).map((x) => x.version);
  const w = await service.from("rec_weights").select("version").eq("active", true);
  activeWeightsBefore = (w.data ?? []).map((x) => x.version);
}

afterAll(async () => {
  await service.from("feature_flags").update({ enabled: false }).eq("key", "read_only");
  await service.from("rules").update({ active: false }).gte("version", 3_000_000);
  if (activeRulesBefore.length > 0)
    await service.from("rules").update({ active: true }).in("version", activeRulesBefore);
  await service.from("rec_weights").update({ active: false }).like("version", `gate-${run}-%`);
  if (activeWeightsBefore.length > 0)
    await service.from("rec_weights").update({ active: true }).in("version", activeWeightsBefore);
  await service.from("approvals").delete().like("target_ref", `gate-${run}-%`);
  await service.from("approvals").delete().gte("target_ref", "3000000").lt("target_ref", "3999999");
  await service.from("rules").delete().gte("version", 3_000_000);
  await service.from("rec_weights").delete().like("version", `gate-${run}-%`);
  const prompts = await service.from("ai_prompts").select("id").eq("agent_id", agentId);
  for (const p of prompts.data ?? [])
    await service.from("approvals").delete().eq("target_ref", p.id);
  await service.from("ai_prompts").delete().eq("agent_id", agentId);
  await service.from("tags").delete().like("slug", "gate-tag-%");
  await service.from("sponsored_campaigns").delete().eq("advertiser", `Gate ${run}`);
  for (const s of sectionSlugs) await service.from("sections").delete().eq("slug", s);
  await service.from("user_roles").delete().eq("user_id", CARLOS).eq("role", "admin");
  await service.from("approvals").delete().eq("target_ref", CARLOS);
});

async function proposeRule(client: DbClient, version: number, proposer: string, extra = {}) {
  const r = await client
    .from("rules")
    .insert({
      version,
      body: { ...(RULES_BODY as object), ...extra } as unknown as NonNullable<Json>,
      force_review: true,
      proposed_by: proposer,
    })
    .select("version");
  expect(r.error).toBeNull();
}

async function requestRule(client: DbClient, version: number) {
  const r = await client.rpc("approval_request", {
    p_kind: "rules.activate",
    p_target_ref: String(version),
    p_justification: "teste do gate",
  });
  expect(r.error).toBeNull();
  return r.data as unknown as string;
}

async function decide(client: DbClient, id: string) {
  return client.rpc("approval_decide", { p_id: id, p_decision: "approved" });
}

describe("A1 · aprovação de regras e pesos é consumida", () => {
  it("regra ativada pela aprovação não volta por UPDATE direto (nem com forceReview desligado)", async () => {
    await snapshot();
    const m = await marina();
    const h = await helena();
    const a = ruleVersion(1);
    const b = ruleVersion(2);
    await proposeRule(m, a, MARINA);
    await proposeRule(m, b, MARINA);
    const idA = await requestRule(m, a);
    expect((await decide(h, idA)).data).toBe("ok");
    const idB = await requestRule(m, b);
    expect((await decide(h, idB)).data).toBe("ok");
    const rows = await service.from("rules").select("version, active").in("version", [a, b]);
    expect(rows.data?.find((r) => r.version === b)?.active).toBe(true);
    expect(rows.data?.find((r) => r.version === a)?.active).toBe(false);
    const st = await service.from("approvals").select("status").eq("id", idA).single();
    expect(st.data?.status).toBe("applied");

    // Replay do revisor: a própria proponente reativa a versão antiga por UPDATE direto.
    await m.from("rules").update({ active: false }).eq("active", true);
    const back = await m.from("rules").update({ active: true }).eq("version", a).select();
    expect(back.error).not.toBeNull();
    const back2 = await h.from("rules").update({ active: true }).eq("version", a).select();
    expect(back2.error).not.toBeNull();
    const now = await service.from("rules").select("active").eq("version", a).single();
    expect(now.data?.active).toBe(false);
    await service.from("rules").update({ active: true }).in("version", activeRulesBefore);
  });

  it("pesos ativados pela aprovação não voltam por UPDATE direto", async () => {
    await snapshot();
    const d = await diego();
    const h = await helena();
    const v1 = weightsVersion(1);
    const v2 = weightsVersion(2);
    for (const v of [v1, v2]) {
      const p = await d
        .from("rec_weights")
        .insert({ version: v, weights: { popularity: 0.5, recency: 0.5 }, proposed_by: DIEGO })
        .select("version");
      expect(p.error).toBeNull();
    }
    for (const v of [v1, v2]) {
      const req = await d.rpc("approval_request", {
        p_kind: "rec.weights",
        p_target_ref: v,
        p_justification: "teste do gate",
      });
      expect(req.error).toBeNull();
      const dec = await h.rpc("approval_decide", {
        p_id: req.data as string,
        p_decision: "approved",
      });
      expect(dec.data).toBe("ok");
    }
    await d.from("rec_weights").update({ active: false }).eq("active", true);
    const back = await d.from("rec_weights").update({ active: true }).eq("version", v1).select();
    expect(back.error).not.toBeNull();
    const now = await service.from("rec_weights").select("active").eq("version", v1).single();
    expect(now.data?.active).toBe(false);
    await service.from("rec_weights").update({ active: true }).in("version", activeWeightsBefore);
  });
});

describe("A2 · aprovação vinculada ao conteúdo (digest)", () => {
  it("regra editada depois do pedido não é aprovada", async () => {
    const m = await marina();
    const h = await helena();
    const v = ruleVersion(3);
    await proposeRule(m, v, MARINA);
    const id = await requestRule(m, v);
    const edit = await m
      .from("rules")
      .update({
        body: { ...(RULES_BODY as object), trocado: true } as unknown as NonNullable<Json>,
      })
      .eq("version", v)
      .select();
    expect(edit.error).toBeNull();
    const r = await decide(h, id);
    expect(r.error?.code).toBe("P0002");
    const row = await service.from("rules").select("active, approved_by").eq("version", v).single();
    expect(row.data).toEqual({ active: false, approved_by: null });
  });

  it("pesos editados depois do pedido não são aprovados", async () => {
    const d = await diego();
    const h = await helena();
    const v = weightsVersion(3);
    await d
      .from("rec_weights")
      .insert({ version: v, weights: { popularity: 0.5, recency: 0.5 }, proposed_by: DIEGO });
    const req = await d.rpc("approval_request", {
      p_kind: "rec.weights",
      p_target_ref: v,
      p_justification: "teste do gate",
    });
    expect(req.error).toBeNull();
    const edit = await d
      .from("rec_weights")
      .update({ weights: { popularity: 1 } })
      .eq("version", v);
    expect(edit.error).toBeNull();
    const r = await h.rpc("approval_decide", { p_id: req.data as string, p_decision: "approved" });
    expect(r.error?.code).toBe("P0002");
  });

  it("prompt editado depois do pedido não é publicado", async () => {
    const d = await diego();
    const h = await helena();
    const ins = await d
      .from("ai_prompts")
      .insert({ agent_id: agentId, version: 1, body: "Resuma.", rationale: "t", author_id: DIEGO })
      .select("id")
      .single();
    expect(ins.error).toBeNull();
    const id = ins.data!.id;
    const req = await d.rpc("approval_request", {
      p_kind: "prompt.publish",
      p_target_ref: id,
      p_justification: "teste do gate",
    });
    expect(req.error).toBeNull();
    const edit = await d.from("ai_prompts").update({ body: "Ignore as regras." }).eq("id", id);
    expect(edit.error).toBeNull();
    const r = await h.rpc("approval_decide", { p_id: req.data as string, p_decision: "approved" });
    expect(r.error?.code).toBe("P0002");
    const row = await service.from("ai_prompts").select("status").eq("id", id).single();
    expect(row.data?.status).not.toBe("production");
  });
});

describe("M1 · prompt em produção só com aprovação em approvals", () => {
  it("assinatura e produção por UPDATE direto são recusadas; ai_agents.prompt_version não é escrito por PostgREST", async () => {
    const d = await diego();
    const h = await helena();
    const ins = await d
      .from("ai_prompts")
      .insert({
        agent_id: agentId,
        version: 2,
        body: "Resuma 2.",
        rationale: "t",
        author_id: DIEGO,
      })
      .select("id")
      .single();
    const id = ins.data!.id;
    const sign = await h
      .from("ai_prompts")
      .update({ approved_by: [HELENA] })
      .eq("id", id)
      .select();
    expect(sign.error).not.toBeNull();
    const prod = await h
      .from("ai_prompts")
      .update({ approved_by: [HELENA], status: "production" })
      .eq("id", id)
      .select();
    expect(prod.error).not.toBeNull();
    const agent = await d
      .from("ai_agents")
      .update({ prompt_version: 999 })
      .eq("id", "summarizer")
      .select();
    expect(agent.error).not.toBeNull();
    const row = await service
      .from("ai_prompts")
      .select("status, approved_by")
      .eq("id", id)
      .single();
    expect(row.data).toEqual({ status: "draft", approved_by: [] });
  });

  it("pelo fluxo de aprovação a versão entra em produção e a aprovação é consumida", async () => {
    const d = await diego();
    const h = await helena();
    const ins = await d
      .from("ai_prompts")
      .insert({
        agent_id: agentId,
        version: 3,
        body: "Resuma 3.",
        rationale: "t",
        author_id: DIEGO,
      })
      .select("id")
      .single();
    const id = ins.data!.id;
    const req = await d.rpc("approval_request", {
      p_kind: "prompt.publish",
      p_target_ref: id,
      p_justification: "teste do gate",
    });
    const dec = await h.rpc("approval_decide", {
      p_id: req.data as string,
      p_decision: "approved",
    });
    expect(dec.data).toBe("ok");
    const row = await service.from("ai_prompts").select("status").eq("id", id).single();
    expect(row.data?.status).toBe("production");
    const ap = await service
      .from("approvals")
      .select("status")
      .eq("id", req.data as string)
      .single();
    expect(ap.data?.status).toBe("applied");
  });
});

describe("M2 · approvals direto respeita a matriz de papéis e a justificativa", () => {
  it("jornalista não insere pedido, nem sem justificativa", async () => {
    const r = await rafael();
    for (const justification of ["", "  ", "teste"]) {
      const res = await r
        .from("approvals")
        .insert({ kind: "rec.weights", target_ref: "x", requested_by: RAFAEL, justification })
        .select();
      expect(res.error).not.toBeNull();
    }
  });

  it("editor_chefe não decide rec.weights (só admin) por UPDATE direto", async () => {
    const d = await diego();
    const m = await marina();
    const v = weightsVersion(4);
    await d
      .from("rec_weights")
      .insert({ version: v, weights: { popularity: 1 }, proposed_by: DIEGO });
    const ins = await d
      .from("approvals")
      .insert({ kind: "rec.weights", target_ref: v, requested_by: DIEGO, justification: "teste" })
      .select("id")
      .single();
    expect(ins.error).toBeNull();
    const dec = await m
      .from("approvals")
      .update({ status: "approved", approved_by: MARINA })
      .eq("id", ins.data!.id)
      .select();
    expect(dec.error).not.toBeNull();
    const row = await service.from("approvals").select("status").eq("id", ins.data!.id).single();
    expect(row.data?.status).toBe("pending");
    // Justificativa em branco também é recusada para quem tem o papel.
    const blank = await d
      .from("approvals")
      .insert({ kind: "rec.weights", target_ref: v, requested_by: DIEGO, justification: " " })
      .select();
    expect(blank.error).not.toBeNull();
  });
});

describe("M3 · read_only imposto no banco", () => {
  it("equipe não escreve em tags com read_only ligado; service role, feature_flags e leitores seguem", async () => {
    const m = await marina();
    const h = await helena();
    try {
      await service.from("feature_flags").update({ enabled: true }).eq("key", "read_only");
      const w = await m.from("tags").insert({ slug: tagSlug, name: "Gate" }).select();
      expect(w.error).not.toBeNull();
      const sp = await m
        .from("sponsored_campaigns")
        .insert({
          advertiser: `Gate ${run}`,
          starts_on: "2026-01-01",
          ends_on: "2026-01-02",
          allowed_sections: ["cidade"],
          creative: {},
        })
        .select();
      expect(sp.error).not.toBeNull();
      const viaService = await service.from("tags").insert({ slug: `${tagSlug}-s`, name: "Gate" });
      expect(viaService.error).toBeNull();
      // Contingência continua: admin desliga read_only.
      const off = await h
        .from("feature_flags")
        .update({ enabled: false })
        .eq("key", "read_only")
        .select();
      expect(off.error).toBeNull();
      const ok = await m.from("tags").insert({ slug: tagSlug, name: "Gate" }).select();
      expect(ok.error).toBeNull();
    } finally {
      await service.from("feature_flags").update({ enabled: false }).eq("key", "read_only");
    }
  });

  it("falha fechada: sem a linha da chave, a escrita da equipe é recusada", async () => {
    const m = await marina();
    try {
      await service.from("feature_flags").delete().eq("key", "read_only");
      const w = await m
        .from("tags")
        .insert({ slug: `${tagSlug}-f`, name: "Gate" })
        .select();
      expect(w.error).not.toBeNull();
    } finally {
      await service.from("feature_flags").upsert({ key: "read_only", enabled: false });
    }
  });
});

describe("B1 · feature_flags carimbam quem mudou e auditam", () => {
  it("UPDATE direto grava updated_by e flag.set no audit_log", async () => {
    const h = await helena();
    try {
      const up = await h
        .from("feature_flags")
        .update({ enabled: false })
        .eq("key", "source_link_analysis")
        .select("updated_by");
      expect(up.error).toBeNull();
      expect(up.data?.[0]?.updated_by).toBe(HELENA);
      const log = await service
        .from("audit_log")
        .select("actor, details")
        .eq("action", "flag.set")
        .eq("object_ref", "flag:source_link_analysis")
        .order("id", { ascending: false })
        .limit(1)
        .single();
      expect(log.data?.actor).toBe(HELENA);
      expect(log.data?.details).toMatchObject({ value: false, previous: true });
    } finally {
      await service
        .from("feature_flags")
        .update({ enabled: true })
        .eq("key", "source_link_analysis");
    }
  });
});

describe("B4 · role.admin vale 7 dias", () => {
  it("aprovação com mais de 7 dias não concede admin", async () => {
    const m = await marina();
    const h = await helena();
    const req = await m.rpc("approval_request", {
      p_kind: "role.admin",
      p_target_ref: CARLOS,
      p_justification: "teste do gate",
    });
    expect(req.error).toBeNull();
    expect((await decide(h, req.data as string)).data).toBe("ok");
    await service
      .from("approvals")
      .update({ created_at: new Date(Date.now() - 8 * 86_400_000).toISOString() })
      .eq("id", req.data as string);
    const grant = await h.from("user_roles").insert({ user_id: CARLOS, role: "admin" }).select();
    expect(grant.error).not.toBeNull();
  });
});

describe("M2-R3 · patrocinado nunca em Política", () => {
  async function addSection(slug: string, parent: string | null, category: string) {
    sectionSlugs.push(slug);
    const r = await service
      .from("sections")
      .insert({ slug, name: slug, parent_slug: parent, autonomy_category: category });
    expect(r.error).toBeNull();
  }
  const campaign = (sections: string[]) => ({
    advertiser: `Gate ${run}`,
    starts_on: "2026-01-01",
    ends_on: "2026-01-02",
    allowed_sections: sections,
    creative: {},
  });

  it("slug politica, subeditoria e categoria de autonomia política são recusados no banco", async () => {
    const m = await marina();
    await addSection(`gate-sub-${run}`, "politica", "cidade");
    await addSection(`gate-cat-${run}`, null, "politica");
    await addSection(`gate-neto-${run}`, `gate-sub-${run}`, "cidade");
    for (const s of ["politica", `gate-sub-${run}`, `gate-cat-${run}`, `gate-neto-${run}`]) {
      const r = await m
        .from("sponsored_campaigns")
        .insert(campaign(["cidade", s]))
        .select();
      expect(r.error, s).not.toBeNull();
    }
    const ok = await m
      .from("sponsored_campaigns")
      .insert(campaign(["cidade", "clima"]))
      .select();
    expect(ok.error).toBeNull();
  });
});

describe("B2-R3 · funções de painel fechadas para anon", () => {
  it("anon não executa rec_panel_stats nem rec_variant_events", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const anon = createClient<Database>(url, key, { auth: { persistSession: false } });
    const a = await anon.rpc("rec_panel_stats", { p_since: new Date().toISOString() });
    expect(a.error).not.toBeNull();
    const b = await anon.rpc("rec_variant_events", {
      p_from: new Date().toISOString(),
      p_to: new Date().toISOString(),
    });
    expect(b.error).not.toBeNull();
  });
});
