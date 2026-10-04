// @vitest-environment node
// Gate do P5 (docs/reports/P5-gate-review.md), achados de banco: 0048_p5_gate_fixes.sql.
// Cada cenário roda como `authenticated`, com o JWT de um usuário de seed (RLS valendo), e tenta
// contornar a regra direto pela API.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { Json } from "@/lib/db/types";
import { DEFAULT_RULES } from "@/lib/rules/defaults";
import { clientOf, SEED_USERS, service } from "./studio";

const run = Date.now() % 1_000_000;
const RULES_BODY = DEFAULT_RULES as unknown as NonNullable<Json>;
const ruleVersion = (n: number) => 6_000_000 + run * 10 + n;

/** SQL direto no banco local/CI (psql), para montar cenários que a API não cria. */
function sql(text: string) {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL ausente");
  execFileSync("psql", [url, "-q", "-v", "ON_ERROR_STOP=1", "-c", text], {
    env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" },
  });
}

const createdApprovals: string[] = [];
const createdUsers: string[] = [];
const createdAgents: string[] = [];
const weightsVersions: string[] = [];

afterAll(async () => {
  await service.from("rules").update({ active: false }).gte("version", 6_000_000);
  await service.from("rules").update({ active: true }).eq("version", 1);
  await service.from("rules").delete().gte("version", 6_000_000);
  if (weightsVersions.length)
    await service.from("rec_weights").delete().in("version", weightsVersions);
  for (const a of createdAgents) await service.from("ai_prompts").delete().eq("agent_id", a);
  if (createdApprovals.length) await service.from("approvals").delete().in("id", createdApprovals);
  for (const id of createdUsers) {
    await service.from("staff_invites").delete().eq("user_id", id);
    await service.from("user_roles").delete().eq("user_id", id);
    await service.from("profiles").delete().eq("id", id);
    await service.auth.admin.deleteUser(id).catch(() => undefined);
  }
  await service.from("user_roles").delete().eq("user_id", SEED_USERS.thiago.id).eq("role", "admin");
  await service
    .from("user_roles")
    .upsert({ user_id: SEED_USERS.helena.id, role: "admin", sections: [] });
  sql("drop trigger if exists gate_block_delete on public.profiles");
});

async function newUser(label: string) {
  const email = `gate-${label}-${randomUUID().slice(0, 8)}@exemplo.com`;
  const u = await service.auth.admin.createUser({
    email,
    password: "senha-de-teste-123",
    email_confirm: true,
  });
  if (u.error) throw u.error;
  const id = u.data.user.id;
  createdUsers.push(id);
  const p = await service
    .from("profiles")
    .upsert({ id, display_name: label }, { onConflict: "id" });
  if (p.error) throw p.error;
  return { id, email };
}

async function requestApproval(
  requester: "diego" | "marina" | "helena",
  kind: string,
  target: string,
) {
  const c = await clientOf(requester);
  const r = await c
    .from("approvals")
    .insert({
      kind,
      target_ref: target,
      requested_by: SEED_USERS[requester].id,
      justification: "teste do gate",
    })
    .select("id")
    .single();
  expect(r.error).toBeNull();
  createdApprovals.push(r.data!.id);
  return r.data!.id;
}

async function decide(approver: "helena" | "marina", id: string) {
  const c = await clientOf(approver);
  const r = await c
    .from("approvals")
    .update({ status: "approved", approved_by: SEED_USERS[approver].id })
    .eq("id", id)
    .select("id");
  expect(r.error).toBeNull();
}

describe("achado 1 · exclusão LGPD com convidante ex-staff", () => {
  it("purge_deleted_accounts apaga quem convidou alguém (invited_by vira null)", async () => {
    const inviter = await newUser("convidante");
    const invitee = await newUser("convidado");
    const inv = await service.from("staff_invites").insert({
      user_id: invitee.id,
      email: invitee.email,
      role: "leitura",
      invited_by: inviter.id,
    });
    expect(inv.error).toBeNull();
    await service
      .from("profiles")
      .update({ delete_requested_at: new Date(Date.now() - 10 * 86_400_000).toISOString() })
      .eq("id", inviter.id);
    const r = await service.rpc("purge_deleted_accounts", { p_days: 7 });
    expect(r.error).toBeNull();
    const gone = await service.from("profiles").select("id").eq("id", inviter.id);
    expect(gone.data).toEqual([]);
    const row = await service
      .from("staff_invites")
      .select("invited_by")
      .eq("user_id", invitee.id)
      .single();
    expect(row.data?.invited_by).toBeNull();
  });

  it("uma conta que falha na exclusão não desfaz as outras", async () => {
    const bad = await newUser("bloqueada");
    const good = await newUser("apagavel");
    sql(
      `create or replace function public.gate_block_delete_fn() returns trigger language plpgsql as $$ begin raise exception 'bloqueada de propósito'; end $$;
       drop trigger if exists gate_block_delete on public.profiles;
       create trigger gate_block_delete before delete on public.profiles for each row when (old.id = '${bad.id}') execute function public.gate_block_delete_fn()`,
    );
    const past = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await service
      .from("profiles")
      .update({ delete_requested_at: past })
      .in("id", [bad.id, good.id]);
    const r = await service.rpc("purge_deleted_accounts", { p_days: 7 });
    expect(r.error).toBeNull();
    expect((await service.from("profiles").select("id").eq("id", good.id)).data).toEqual([]);
    expect((await service.from("profiles").select("id").eq("id", bad.id)).data).toHaveLength(1);
    sql("drop trigger if exists gate_block_delete on public.profiles");
  });
});

describe("achado 3 · aprovação amarrada ao conteúdo pedido", () => {
  it("regra: proponente não edita depois do pedido; adulteração direta faz a aplicação falhar", async () => {
    const v = ruleVersion(1);
    const marina = await clientOf("marina");
    const ins = await marina.from("rules").insert({
      version: v,
      body: RULES_BODY,
      force_review: true,
      proposed_by: SEED_USERS.marina.id,
    });
    expect(ins.error).toBeNull();
    const id = await requestApproval("marina", "rules.activate", `rules:${v}`);

    // 1) trava: com pedido aberto o proponente não muda o conteúdo.
    const edit = await marina
      .from("rules")
      .update({ force_review: false })
      .eq("version", v)
      .select("version");
    expect(edit.error).not.toBeNull();

    // 2) hash: mesmo que o conteúdo mude por fora (papel de serviço), aplicar recusa.
    const tamper = await service.from("rules").update({ force_review: false }).eq("version", v);
    expect(tamper.error).toBeNull();
    await decide("helena", id);
    const helena = await clientOf("helena");
    const apply = await helena.rpc("approval_apply", { p_id: id });
    expect(apply.error?.message).toMatch(/conteúdo/);
    const row = await service.from("rules").select("active").eq("version", v).single();
    expect(row.data?.active).toBe(false);
  });

  it("regra sem alteração aplica normalmente", async () => {
    const v = ruleVersion(2);
    const marina = await clientOf("marina");
    await marina.from("rules").insert({
      version: v,
      body: RULES_BODY,
      force_review: true,
      proposed_by: SEED_USERS.marina.id,
    });
    const id = await requestApproval("marina", "rules.activate", `rules:${v}`);
    await decide("helena", id);
    const helena = await clientOf("helena");
    const apply = await helena.rpc("approval_apply", { p_id: id });
    expect(apply.error).toBeNull();
    expect(apply.data).toMatchObject({ applied: true });
    await service.from("rules").update({ active: false }).eq("version", v);
    await service.from("rules").update({ active: true }).eq("version", 1);
  });

  it("prompt: autor não edita o corpo depois do pedido; adulteração faz publicar falhar", async () => {
    const agent = `gate_agente_${String(run).replace(/\d/g, (d) => "abcdefghij"[Number(d)]!)}`;
    createdAgents.push(agent);
    const diego = await clientOf("diego");
    const ins = await diego.from("ai_prompts").insert({
      agent_id: agent,
      version: 1,
      body: "corpo original",
      rationale: "teste",
      author_id: SEED_USERS.diego.id,
      status: "pending",
    });
    expect(ins.error).toBeNull();
    const id = await requestApproval("diego", "prompt.publish", `prompt:${agent}:1`);
    const edit = await diego
      .from("ai_prompts")
      .update({ body: "corpo trocado" })
      .eq("agent_id", agent)
      .eq("version", 1)
      .select("id");
    expect(edit.error).not.toBeNull();
    await service.from("ai_prompts").update({ body: "corpo trocado" }).eq("agent_id", agent);
    await decide("helena", id);
    const helena = await clientOf("helena");
    const pub = await helena.rpc("prompt_publish", { p_approval: id });
    expect(pub.error?.message).toMatch(/conteúdo/);
  });

  it("pesos: proponente não muda os pesos depois do pedido; adulteração faz ativar falhar", async () => {
    const version = `gate-${run}-a`;
    weightsVersions.push(version);
    const diego = await clientOf("diego");
    const ins = await diego.from("rec_weights").insert({
      version,
      weights: { popularity: 0.35, individual: 0.25, recency: 0.4 },
      proposed_by: SEED_USERS.diego.id,
    });
    expect(ins.error).toBeNull();
    const id = await requestApproval("diego", "rec.weights", `rec:${version}`);
    const edit = await diego
      .from("rec_weights")
      .update({ weights: { popularity: 1 } })
      .eq("version", version)
      .select("version");
    expect(edit.error).not.toBeNull();
    await service.from("rec_weights").update({ cap: 0.2 }).eq("version", version);
    await decide("helena", id);
    const helena = await clientOf("helena");
    const act = await helena.rpc("rec_weights_activate", { p_approval: id });
    expect(act.error?.message).toMatch(/conteúdo/);
  });
});

describe("achado 4 · role.admin aprovado expira e o aprovador precisa ser admin", () => {
  it("aprovação com mais de 24 h não concede admin", async () => {
    const helena = await clientOf("helena");
    const target = SEED_USERS.thiago.id;
    const id = await requestApproval("marina", "role.admin", target);
    await decide("helena", id);
    await service
      .from("approvals")
      .update({ decided_at: new Date(Date.now() - 25 * 3_600_000).toISOString() })
      .eq("id", id);
    const r = await helena
      .from("user_roles")
      .insert({ user_id: target, role: "admin", sections: [] });
    expect(r.error).not.toBeNull();
  });

  it("aprovação de quem não é admin (editor_chefe) não concede admin", async () => {
    const helena = await clientOf("helena");
    const target = SEED_USERS.thiago.id;
    const id = await requestApproval("helena", "role.admin", target);
    await decide("marina", id); // approvals_decide deixa editor_chefe decidir qualquer tipo
    const r = await helena
      .from("user_roles")
      .insert({ user_id: target, role: "admin", sections: [] });
    expect(r.error).not.toBeNull();
  });
});

describe("achado 5 · revogar admin exige aprovação role.admin registrada", () => {
  it("DELETE direto de um papel admin é recusado; com aprovação vale uma vez", async () => {
    const target = SEED_USERS.thiago.id;
    await service.from("user_roles").upsert({ user_id: target, role: "admin", sections: [] });
    const helena = await clientOf("helena");
    const direct = await helena
      .from("user_roles")
      .delete()
      .eq("user_id", target)
      .eq("role", "admin")
      .select("user_id");
    expect(direct.error).not.toBeNull();
    expect(
      (await service.from("user_roles").select("role").eq("user_id", target).eq("role", "admin"))
        .data,
    ).toHaveLength(1);

    const id = await requestApproval("marina", "role.admin", `revoke:${target}`);
    await decide("helena", id);
    // a aprovação de conceder (alvo sem prefixo) não vale para revogar e vice-versa
    const ok = await helena
      .from("user_roles")
      .delete()
      .eq("user_id", target)
      .eq("role", "admin")
      .select("user_id");
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);
    const used = await service.from("approvals").select("status").eq("id", id).single();
    expect(used.data?.status).toBe("applied");
  });

  it("ninguém revoga o próprio papel de admin, nem com aprovação", async () => {
    const id = await requestApproval("marina", "role.admin", `revoke:${SEED_USERS.helena.id}`);
    const marina = await clientOf("marina");
    await marina
      .from("approvals")
      .update({ status: "approved", approved_by: SEED_USERS.marina.id })
      .eq("id", id);
    const h = await clientOf("helena");
    const r = await h
      .from("user_roles")
      .delete()
      .eq("user_id", SEED_USERS.helena.id)
      .eq("role", "admin")
      .select("user_id");
    expect(r.error).not.toBeNull();
    expect(
      (
        await service
          .from("user_roles")
          .select("role")
          .eq("user_id", SEED_USERS.helena.id)
          .eq("role", "admin")
      ).data,
    ).toHaveLength(1);
  });
});

describe("achado 6 · rollback de regras que afrouxa exige proposta nova", () => {
  it("volta para versão mais frouxa (forceReview desligado) é recusado", async () => {
    const loose = ruleVersion(3);
    const strict = ruleVersion(4);
    const loosened = { ...DEFAULT_RULES, forceReview: false } as unknown as NonNullable<Json>;
    const ins = await service.from("rules").insert([
      {
        version: loose,
        body: loosened,
        force_review: false,
        proposed_by: SEED_USERS.diego.id,
        approved_by: SEED_USERS.marina.id,
        active: false,
      },
      {
        version: strict,
        body: RULES_BODY,
        force_review: true,
        proposed_by: SEED_USERS.diego.id,
        approved_by: SEED_USERS.marina.id,
        active: false,
      },
    ]);
    expect(ins.error).toBeNull();
    await service.from("rules").update({ active: false }).eq("active", true);
    await service.from("rules").update({ active: true }).eq("version", strict);
    const helena = await clientOf("helena");
    const r = await helena.rpc("rules_rollback");
    expect(r.error?.message).toMatch(/afrouxa|frouxa/);
    const active = await service.from("rules").select("version").eq("active", true);
    expect(active.data).toEqual([{ version: strict }]);
  });
});
