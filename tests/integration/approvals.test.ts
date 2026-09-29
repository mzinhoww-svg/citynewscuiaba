// @vitest-environment node
// P5-T1 · Aprovações (Review Focus 1): quem pede não decide ("A aprovação precisa ser de outra
// pessoa"), justificativa vazia é inválida, aprovação válida ativa o alvo e audita as duas
// pessoas; `approval_apply` (0029) recusa aprovação expirada e tipo sem consumidor aqui.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APPROVAL_ERROR_TEXT } from "@/content/pt-BR/approvals";
import { createApprovals } from "@/lib/approvals/approvals";
import { rulesTarget } from "@/lib/approvals/targets";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import type { Json } from "@/lib/db/types";
import { DEFAULT_RULES } from "@/lib/rules/defaults";
import { decideApprovalCommand, requestApprovalCommand } from "@/lib/studio/approvals";
import { asUser, clientOf, SEED_USERS, service } from "./studio";

const run = Date.now() % 1_000_000;
const version = (n: number) => 3_000_000 + run * 10 + n;
const created: string[] = [];

async function propose(v: number) {
  const diego = await clientOf("diego");
  const r = await diego.from("rules").insert({
    version: v,
    body: { ...DEFAULT_RULES, version: v } as unknown as NonNullable<Json>,
    force_review: true,
    proposed_by: SEED_USERS.diego.id,
  });
  if (r.error) throw new Error(r.error.message);
}

async function request(v: number, justification = "Serviços com 2 fontes já provou confiança") {
  const r = await asUser("diego", () =>
    requestApprovalCommand({ kind: "rules.activate", targetRef: rulesTarget(v), justification }),
  );
  if (r.ok) created.push(r.value.id);
  return r;
}

async function auditRows(approvalId: string) {
  const { data, error } = await service
    .from("audit_log")
    .select("actor, action")
    .eq("details->>approvalId", approvalId)
    .order("id");
  if (error) throw error;
  return data ?? [];
}

beforeAll(async () => {
  await propose(version(1));
  await propose(version(2));
  await propose(version(3));
});

afterAll(async () => {
  // Devolve a v1 do seed como única ativa e apaga o que a suíte criou.
  await service.from("rules").update({ active: false }).gte("version", 3_000_000);
  await service.from("rules").update({ active: true }).eq("version", 1);
  await service.from("rules").delete().gte("version", 3_000_000);
  if (created.length) await service.from("approvals").delete().in("id", created);
});

describe("aprovações de mudança crítica (banco real)", () => {
  it("as ações de auditoria das aprovações estão nas duas listas", async () => {
    const r = await service.rpc("studio_audit_actions");
    expect(r.error).toBeNull();
    for (const a of [
      "approval.requested",
      "approval.approved",
      "approval.rejected",
      "approval.applied",
    ]) {
      expect(AUDIT_ACTIONS).toContain(a);
      expect(r.data).toContain(a);
    }
  });

  it("tipo desconhecido é recusado pelo banco (approval_kinds)", async () => {
    const r = await service.from("approvals").insert({
      kind: "qualquer.coisa",
      target_ref: "x",
      requested_by: SEED_USERS.diego.id,
      justification: "j",
    });
    expect(r.error?.code).toBe("23514");
    const kinds = await service.rpc("approval_kinds");
    expect(kinds.data).toContain("push.highlight");
    expect(kinds.data).toContain("push.resume");
  });

  it("justificativa vazia → invalid; pedido pendente igual não duplica", async () => {
    const empty = await request(version(1), "   ");
    expect(empty).toMatchObject({ ok: false, error: "invalid" });
    const first = await request(version(1));
    expect(first.ok).toBe(true);
    const again = await request(version(1));
    expect(again.ok && again.value.existing).toBe(true);
    if (first.ok && again.ok) expect(again.value.id).toBe(first.value.id);
  });

  it("quem pediu não aprova, nem pela ação nem direto no banco", async () => {
    const id = created[0]!;
    const r = await asUser("diego", () => decideApprovalCommand({ id, decision: "approve" }));
    expect(r).toMatchObject({
      ok: false,
      error: "forbidden",
      message: APPROVAL_ERROR_TEXT.self_approval,
    });
    expect(APPROVAL_ERROR_TEXT.self_approval).toBe("A aprovação precisa ser de outra pessoa");

    const diego = await clientOf("diego");
    // A RLS `approvals_decide` esconde a linha de quem não é admin/editor-chefe (0 linhas) e
    // `guard_approvals` barra quem pediu mesmo com o papel: o estado não muda.
    const direct = await diego
      .from("approvals")
      .update({ status: "approved", approved_by: SEED_USERS.diego.id })
      .eq("id", id)
      .select("id");
    expect(direct.data ?? []).toEqual([]);
    const row = await service.from("approvals").select("status").eq("id", id).single();
    expect(row.data?.status).toBe("pending");

    // Papel sem a segunda assinatura das regras (analista) também não decide.
    const t = await asUser("thiago", () => decideApprovalCommand({ id, decision: "approve" }));
    expect(t).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("aprovação válida ativa a versão proposta e audita as duas pessoas", async () => {
    const id = created[0]!;
    const r = await asUser("marina", () => decideApprovalCommand({ id, decision: "approve" }));
    expect(r).toMatchObject({ ok: true, value: { applied: true } });

    const rows = await service
      .from("rules")
      .select("version, active, approved_by")
      .eq("active", true);
    expect(rows.data).toEqual([
      { version: version(1), active: true, approved_by: SEED_USERS.marina.id },
    ]);
    const ap = await service
      .from("approvals")
      .select("status, approved_by, decided_at")
      .eq("id", id)
      .single();
    expect(ap.data).toMatchObject({ status: "applied", approved_by: SEED_USERS.marina.id });
    expect(ap.data?.decided_at).not.toBeNull();

    const audit = await auditRows(id);
    expect(audit).toEqual(
      expect.arrayContaining([
        { actor: SEED_USERS.diego.id, action: "approval.requested" },
        { actor: SEED_USERS.marina.id, action: "approval.approved" },
        { actor: SEED_USERS.marina.id, action: "approval.applied" },
      ]),
    );
    // Decisão é final.
    const again = await asUser("helena", () => decideApprovalCommand({ id, decision: "approve" }));
    expect(again).toMatchObject({ ok: false, error: "conflict" });
  });

  it("recusa exige motivo e fica registrada por quem recusou", async () => {
    const req = await request(version(2));
    const id = req.ok ? req.value.id : "";
    const noReason = await asUser("marina", () =>
      decideApprovalCommand({ id, decision: "reject" }),
    );
    expect(noReason).toMatchObject({ ok: false, error: "invalid" });
    const r = await asUser("marina", () =>
      decideApprovalCommand({ id, decision: "reject", reason: "Ainda sem dados de 7 dias" }),
    );
    expect(r).toMatchObject({ ok: true, value: { applied: null } });
    const audit = await auditRows(id);
    expect(audit).toContainEqual({ actor: SEED_USERS.marina.id, action: "approval.rejected" });
    const v2 = await service
      .from("rules")
      .select("active, approved_by")
      .eq("version", version(2))
      .single();
    expect(v2.data).toEqual({ active: false, approved_by: null });
  });

  it("aprovação decidida há mais de 24 h expira e não aplica", async () => {
    const req = await request(version(3));
    const id = req.ok ? req.value.id : "";
    const marina = await clientOf("marina");
    const ap = createApprovals(marina);
    expect(await ap.approve({ id })).toEqual({ ok: true, value: undefined });
    const old = new Date(Date.now() - 25 * 3_600_000).toISOString();
    const back = await service.from("approvals").update({ decided_at: old }).eq("id", id);
    expect(back.error).toBeNull();
    const r = await asUser("marina", () => decideApprovalCommand({ id, decision: "approve" }));
    expect(r).toMatchObject({ ok: false, error: "conflict" });
    expect(r.ok ? "" : r.message).toMatch(/expirou/);
    const v3 = await service.from("rules").select("active").eq("version", version(3)).single();
    expect(v3.data?.active).toBe(false);
  });
});
