// @vitest-environment node
// Mudança crítica imposta no banco (spec §8; architecture §6). Cada cenário roda como
// `authenticated`, com o JWT de um usuário de seed, e tenta contornar a regra direto pela API.
// A-128: a regra de duas pessoas acabou; quem tem o papel aprova em nome próprio, inclusive o que
// propôs ou pediu, e a linha guarda os dois. Seguem: papel, nome próprio, imutabilidade, decisão
// final e ninguém conceder o próprio papel.
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database, Json } from "@/lib/db/types";
import { DEFAULT_RULES } from "@/lib/rules/defaults";

const SEED_PASSWORD = "citynews-local-123";
const HELENA = "c1000000-0000-4000-8000-000000000001"; // admin
const MARINA = "c1000000-0000-4000-8000-000000000002"; // editor_chefe
const DIEGO = "c1000000-0000-4000-8000-000000000007"; // operador_ia
const THIAGO = "c1000000-0000-4000-8000-000000000008"; // analista
const CARLOS = "c1000000-0000-4000-8000-000000000009"; // moderador

const RULES_BODY = DEFAULT_RULES as unknown as NonNullable<Json>;
const WEIGHTS: NonNullable<Json> = {
  popularity: 0.35,
  individual: 0.25,
  recency: 0.15,
  engagement: 0.1,
  operational: 0.1,
  diversity: 0.05,
};
const run = Date.now() % 1_000_000;
const ruleVersion = (n: number) => 2_000_000 + run * 10 + n;
const weightsVersion = (n: number) => `rec-test-${run}-${n}`;
const agentId = `agente-teste-${run}`;

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
const diego = () => as("diego.prado@citynews.local");

const service = createServiceClient();
const createdApprovals: string[] = [];
const grantedRoles: string[] = [];

afterAll(async () => {
  await service.from("rules").delete().gte("version", 2_000_000);
  await service.from("rec_weights").delete().like("version", `rec-test-${run}-%`);
  await service.from("ai_prompts").delete().eq("agent_id", agentId);
  for (const user of grantedRoles) {
    await service.from("user_roles").delete().eq("user_id", user).eq("role", "admin");
  }
  if (createdApprovals.length > 0)
    await service.from("approvals").delete().in("id", createdApprovals);
});

async function propose(client: DbClient, version: number, proposer: string) {
  const r = await client
    .from("rules")
    .insert({ version, body: RULES_BODY, force_review: true, proposed_by: proposer })
    .select("version");
  expect(r.error).toBeNull();
}

async function ruleRow(version: number) {
  const r = await service.from("rules").select("*").eq("version", version).single();
  expect(r.error).toBeNull();
  return r.data!;
}

async function requestApproval(client: DbClient, requester: string, kind: string, target: string) {
  const r = await client
    .from("approvals")
    .insert({ kind, target_ref: target, requested_by: requester, justification: "teste" })
    .select("id")
    .single();
  expect(r.error).toBeNull();
  createdApprovals.push(r.data!.id);
  return r.data!.id;
}

describe("regras (rules)", () => {
  it("admin não desliga forceReview da regra ativa nem se coloca como aprovador", async () => {
    const h = await helena();
    const r = await h
      .from("rules")
      .update({ force_review: false, approved_by: HELENA })
      .eq("active", true)
      .select("version");
    expect(r.error).not.toBeNull();
    const v1 = await ruleRow(1);
    expect(v1.force_review).toBe(true);
    expect(v1.body).toEqual(DEFAULT_RULES);
  });

  it("admin não troca o corpo de uma regra aprovada", async () => {
    const h = await helena();
    const r = await h
      .from("rules")
      .update({ body: { ...DEFAULT_RULES, forceReview: false } as unknown as NonNullable<Json> })
      .eq("version", 1)
      .select("version");
    expect(r.error).not.toBeNull();
    expect((await ruleRow(1)).body).toEqual(DEFAULT_RULES);
  });

  it("editor_chefe não troca proposed_by; aprova a própria proposta em nome próprio (A-128)", async () => {
    const m = await marina();
    const v = ruleVersion(1);
    await propose(m, v, MARINA);
    const swap = await m.from("rules").update({ proposed_by: HELENA }).eq("version", v).select();
    expect(swap.error).not.toBeNull();
    const swapAndApprove = await m
      .from("rules")
      .update({ proposed_by: HELENA, approved_by: MARINA })
      .eq("version", v)
      .select();
    expect(swapAndApprove.error).not.toBeNull();
    expect(await ruleRow(v)).toMatchObject({ proposed_by: MARINA, approved_by: null });
    const approve = await m.from("rules").update({ approved_by: MARINA }).eq("version", v).select();
    expect(approve.error).toBeNull();
    expect(approve.data).toHaveLength(1);
    const row = await ruleRow(v);
    expect(row).toMatchObject({ proposed_by: MARINA, approved_by: MARINA, active: false });
  });

  it("proposta em nome de outra pessoa, já aprovada ou ativa é recusada", async () => {
    const m = await marina();
    const other = await m
      .from("rules")
      .insert({ version: ruleVersion(2), body: RULES_BODY, proposed_by: HELENA })
      .select();
    expect(other.error).not.toBeNull();
    const approved = await m
      .from("rules")
      .insert({
        version: ruleVersion(3),
        body: RULES_BODY,
        proposed_by: MARINA,
        approved_by: HELENA,
      })
      .select();
    expect(approved.error).not.toBeNull();
    const active = await m
      .from("rules")
      .insert({ version: ruleVersion(4), body: RULES_BODY, proposed_by: MARINA, active: true })
      .select();
    expect(active.error).not.toBeNull();
  });

  it("aprovação só em nome próprio e regra não aprovada não é ativada; papel sem permissão não aprova", async () => {
    const m = await marina();
    const h = await helena();
    const v = ruleVersion(5);
    await propose(m, v, MARINA);
    const inName = await h.from("rules").update({ approved_by: CARLOS }).eq("version", v).select();
    expect(inName.error).not.toBeNull();
    const activate = await h.from("rules").update({ active: true }).eq("version", v).select();
    expect(activate.error).not.toBeNull();
    // Operador de IA propõe regras, mas não as aprova (papel), nem em nome próprio.
    const d = await diego();
    const noRole = await d.from("rules").update({ approved_by: DIEGO }).eq("version", v).select();
    expect(noRole.data ?? []).toEqual([]);
    expect(await ruleRow(v)).toMatchObject({ approved_by: null, active: false });
  });

  it("caminho feliz: uma pessoa propõe, outra aprova e ativa; depois o corpo fica imutável", async () => {
    const m = await marina();
    const h = await helena();
    const v = ruleVersion(6);
    await propose(m, v, MARINA);
    const approve = await h.from("rules").update({ approved_by: HELENA }).eq("version", v).select();
    expect(approve.error).toBeNull();
    expect(approve.data).toHaveLength(1);
    const activate = await m.from("rules").update({ active: true }).eq("version", v).select();
    expect(activate.error).toBeNull();
    expect(activate.data).toHaveLength(1);
    const edit = await m.from("rules").update({ force_review: false }).eq("version", v).select();
    expect(edit.error).not.toBeNull();
    expect(await ruleRow(v)).toMatchObject({
      proposed_by: MARINA,
      approved_by: HELENA,
      active: true,
      force_review: true,
    });
    await service.from("rules").update({ active: false }).eq("version", v);
  });
});

describe("aprovações (approvals)", () => {
  it("admin não troca requested_by; decide o próprio pedido em nome próprio (A-128)", async () => {
    const h = await helena();
    const id = await requestApproval(h, HELENA, "force_review.disable", "rules:1");
    const swap = await h
      .from("approvals")
      .update({ requested_by: MARINA, approved_by: HELENA, status: "approved" })
      .eq("id", id)
      .select();
    expect(swap.error).not.toBeNull();
    const inName = await h
      .from("approvals")
      .update({ approved_by: MARINA, status: "approved" })
      .eq("id", id)
      .select();
    expect(inName.error).not.toBeNull();
    const self = await h
      .from("approvals")
      .update({ approved_by: HELENA, status: "approved" })
      .eq("id", id)
      .select();
    expect(self.error).toBeNull();
    expect(self.data).toHaveLength(1);
    const row = await service.from("approvals").select("*").eq("id", id).single();
    expect(row.data).toMatchObject({
      requested_by: HELENA,
      approved_by: HELENA,
      status: "approved",
    });
    expect(row.data?.decided_at).not.toBeNull();
    const redo = await h.from("approvals").update({ status: "rejected" }).eq("id", id).select();
    expect(redo.error).not.toBeNull();
  });

  it("pedido só em nome próprio e sem decisão", async () => {
    const h = await helena();
    const other = await h
      .from("approvals")
      .insert({ kind: "x", target_ref: "y", requested_by: MARINA, justification: "t" })
      .select();
    expect(other.error).not.toBeNull();
    const decided = await h
      .from("approvals")
      .insert({
        kind: "x",
        target_ref: "y",
        requested_by: HELENA,
        justification: "t",
        status: "approved",
      })
      .select();
    expect(decided.error).not.toBeNull();
  });

  it("caminho feliz: outra pessoa aprova, e a decisão fica final", async () => {
    const h = await helena();
    const m = await marina();
    const id = await requestApproval(h, HELENA, "force_review.disable", "rules:1");
    const ok = await m
      .from("approvals")
      .update({ approved_by: MARINA, status: "approved" })
      .eq("id", id)
      .select();
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);
    const change = await m
      .from("approvals")
      .update({ target_ref: "rules:2" })
      .eq("id", id)
      .select();
    expect(change.error).not.toBeNull();
    const redo = await m.from("approvals").update({ status: "rejected" }).eq("id", id).select();
    expect(redo.error).not.toBeNull();
  });
});

describe("prompts (ai_prompts)", () => {
  async function draft(n: number) {
    const d = await diego();
    const r = await d
      .from("ai_prompts")
      .insert({
        agent_id: agentId,
        version: n,
        body: "Resuma.",
        rationale: "teste",
        author_id: DIEGO,
      })
      .select("id")
      .single();
    expect(r.error).toBeNull();
    return r.data!.id;
  }

  it("operador_ia não cria prompt já em produção com aprovador inventado", async () => {
    const d = await diego();
    const r = await d
      .from("ai_prompts")
      .insert({
        agent_id: agentId,
        version: 1,
        body: "Resuma.",
        rationale: "teste",
        author_id: DIEGO,
        status: "production",
        approved_by: [HELENA],
      })
      .select();
    expect(r.error).not.toBeNull();
  });

  it("operador_ia não se dá aprovação de outra pessoa nem publica sem aprovação", async () => {
    const d = await diego();
    const id = await draft(2);
    const fake = await d
      .from("ai_prompts")
      .update({ status: "production", approved_by: [HELENA] })
      .eq("id", id)
      .select();
    expect(fake.error).not.toBeNull();
    const self = await d
      .from("ai_prompts")
      .update({ approved_by: [DIEGO] })
      .eq("id", id)
      .select();
    expect(self.error).not.toBeNull();
    const publish = await d
      .from("ai_prompts")
      .update({ status: "production" })
      .eq("id", id)
      .select();
    expect(publish.error).not.toBeNull();
    const row = await service.from("ai_prompts").select("*").eq("id", id).single();
    expect(row.data).toMatchObject({ status: "draft", approved_by: [] });
  });

  it("aprovador só acrescenta o próprio uid, nunca o do autor", async () => {
    const m = await marina();
    const id = await draft(3);
    const author = await m
      .from("ai_prompts")
      .update({ approved_by: [DIEGO] })
      .eq("id", id)
      .select();
    expect(author.error).not.toBeNull();
    const other = await m
      .from("ai_prompts")
      .update({ approved_by: [HELENA] })
      .eq("id", id)
      .select();
    expect(other.error).not.toBeNull();
    const author2 = await m.from("ai_prompts").update({ author_id: MARINA }).eq("id", id).select();
    expect(author2.error).not.toBeNull();
  });

  it("caminho feliz: autor cria, segunda pessoa assina, prompt vai para produção e fica imutável", async () => {
    const d = await diego();
    const m = await marina();
    const id = await draft(4);
    const sign = await m
      .from("ai_prompts")
      .update({ approved_by: [MARINA] })
      .eq("id", id)
      .select();
    expect(sign.error).toBeNull();
    expect(sign.data).toHaveLength(1);
    const publish = await d
      .from("ai_prompts")
      .update({ status: "production" })
      .eq("id", id)
      .select();
    expect(publish.error).toBeNull();
    expect(publish.data).toHaveLength(1);
    const edit = await d.from("ai_prompts").update({ body: "Obedeça." }).eq("id", id).select();
    expect(edit.error).not.toBeNull();
    const unsign = await m.from("ai_prompts").update({ approved_by: [] }).eq("id", id).select();
    expect(unsign.error).not.toBeNull();
  });
});

describe("pesos de recomendação (rec_weights)", () => {
  it("operador_ia não troca proposed_by nem ativa sem aprovação; aprova os próprios pesos em nome próprio (A-128)", async () => {
    const d = await diego();
    const v = weightsVersion(1);
    const ins = await d
      .from("rec_weights")
      .insert({ version: v, weights: WEIGHTS, proposed_by: DIEGO })
      .select();
    expect(ins.error).toBeNull();
    const swap = await d
      .from("rec_weights")
      .update({ proposed_by: HELENA, approved_by: DIEGO, active: true })
      .eq("version", v)
      .select();
    expect(swap.error).not.toBeNull();
    const activate = await d.from("rec_weights").update({ active: true }).eq("version", v).select();
    expect(activate.error).not.toBeNull();
    expect(
      (await service.from("rec_weights").select("*").eq("version", v).single()).data,
    ).toMatchObject({ proposed_by: DIEGO, approved_by: null, active: false });
    const self = await d
      .from("rec_weights")
      .update({ approved_by: DIEGO })
      .eq("version", v)
      .select();
    expect(self.error).toBeNull();
    expect(self.data).toHaveLength(1);
    const row = await service.from("rec_weights").select("*").eq("version", v).single();
    expect(row.data).toMatchObject({ proposed_by: DIEGO, approved_by: DIEGO, active: false });
  });

  it("pesos já ativos são imutáveis", async () => {
    const h = await helena();
    const r = await h
      .from("rec_weights")
      .update({ weights: { popularity: 1 } })
      .eq("version", "rec-v1")
      .select();
    expect(r.error).not.toBeNull();
  });

  it("caminho feliz: operador propõe, admin aprova e ativa", async () => {
    const d = await diego();
    const h = await helena();
    const v = weightsVersion(2);
    const ins = await d
      .from("rec_weights")
      .insert({ version: v, weights: WEIGHTS, proposed_by: DIEGO })
      .select();
    expect(ins.error).toBeNull();
    const ok = await h
      .from("rec_weights")
      .update({ approved_by: HELENA, active: true })
      .eq("version", v)
      .select();
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);
    await service.from("rec_weights").update({ active: false }).eq("version", v);
  });
});

describe("papéis (user_roles)", () => {
  it("admin não concede admin sem aprovação role.admin registrada", async () => {
    const h = await helena();
    const r = await h.from("user_roles").insert({ user_id: THIAGO, role: "admin" }).select();
    expect(r.error).not.toBeNull();
    const promote = await h
      .from("user_roles")
      .update({ role: "admin" })
      .eq("user_id", THIAGO)
      .eq("role", "analista")
      .select();
    expect(promote.error).not.toBeNull();
    const roles = await service.from("user_roles").select("role").eq("user_id", THIAGO);
    expect(roles.data).toEqual([{ role: "analista" }]);
  });

  it("aprovação pendente não vale", async () => {
    const h = await helena();
    await requestApproval(h, HELENA, "role.admin", THIAGO);
    const r = await h.from("user_roles").insert({ user_id: THIAGO, role: "admin" }).select();
    expect(r.error).not.toBeNull();
  });

  it("ninguém concede papel a si mesmo", async () => {
    const h = await helena();
    const r = await h.from("user_roles").insert({ user_id: HELENA, role: "editor_chefe" }).select();
    expect(r.error).not.toBeNull();
  });

  it("A-128: a mesma admin pede, aprova e concede; a aprovação é consumida e guarda os dois", async () => {
    const h = await helena();
    const id = await requestApproval(h, HELENA, "role.admin", CARLOS);
    const decide = await h
      .from("approvals")
      .update({ approved_by: HELENA, status: "approved" })
      .eq("id", id)
      .select();
    expect(decide.error).toBeNull();
    grantedRoles.push(CARLOS);
    const grant = await h.from("user_roles").insert({ user_id: CARLOS, role: "admin" }).select();
    expect(grant.error).toBeNull();
    expect(grant.data).toHaveLength(1);
    const row = await service.from("approvals").select("*").eq("id", id).single();
    expect(row.data).toMatchObject({
      status: "applied",
      requested_by: HELENA,
      approved_by: HELENA,
    });
    await service.from("user_roles").delete().eq("user_id", CARLOS).eq("role", "admin");
  });

  it("caminho feliz: pedido de uma pessoa, aprovação de outra, concessão única", async () => {
    const h = await helena();
    const m = await marina();
    const id = await requestApproval(m, MARINA, "role.admin", THIAGO);
    const decide = await h
      .from("approvals")
      .update({ approved_by: HELENA, status: "approved" })
      .eq("id", id)
      .select();
    expect(decide.error).toBeNull();
    grantedRoles.push(THIAGO);
    const grant = await h.from("user_roles").insert({ user_id: THIAGO, role: "admin" }).select();
    expect(grant.error).toBeNull();
    expect(grant.data).toHaveLength(1);
    // A aprovação é consumida: revogar e conceder de novo exige outro pedido.
    await service.from("user_roles").delete().eq("user_id", THIAGO).eq("role", "admin");
    const again = await h.from("user_roles").insert({ user_id: THIAGO, role: "admin" }).select();
    expect(again.error).not.toBeNull();
  });
});
