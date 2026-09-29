// @vitest-environment node
// P5-T1 · Aprovação dupla para mudanças críticas (spec §8; plano P5, Review Focus 1).
// As funções de domínio rodam como usuários de seed (JWT real, RLS e triggers valendo).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  APPROVAL_KIND_ROLES,
  CRITICAL_KINDS,
  approve,
  reject,
  requestApproval,
} from "@/lib/approvals";
import type { Json } from "@/lib/db/types";
import { DEFAULT_RULES } from "@/lib/rules/defaults";
import { asUser, clientOf, SEED_USERS, service } from "./studio";

const run = Date.now() % 1_000_000;
const ruleVersion = (n: number) => 60_000_000 + run * 10 + n;
const weightsVersion = (n: number) => `rec-approvals-${run}-${n}`;
const RULES_BODY = DEFAULT_RULES as unknown as NonNullable<Json>;

const DIEGO = SEED_USERS.diego.id; // operador_ia
const MARINA = SEED_USERS.marina.id; // editor_chefe
const HELENA = SEED_USERS.helena.id; // admin

const createdApprovals: string[] = [];
let activeRules: number[] = [];
let activeWeights: string[] = [];

beforeAll(async () => {
  activeRules = ((await service.from("rules").select("version").eq("active", true)).data ?? []).map(
    (r) => r.version,
  );
  activeWeights = (
    (await service.from("rec_weights").select("version").eq("active", true)).data ?? []
  ).map((r) => r.version);
});

afterAll(async () => {
  if (createdApprovals.length > 0)
    await service.from("approvals").delete().in("id", createdApprovals);
  await service.from("rules").delete().gte("version", 60_000_000);
  await service.from("rec_weights").delete().like("version", `rec-approvals-${run}-%`);
  if (activeRules.length > 0)
    await service.from("rules").update({ active: true }).in("version", activeRules);
  if (activeWeights.length > 0)
    await service.from("rec_weights").update({ active: true }).in("version", activeWeights);
});

/** Diego propõe uma versão de regras (inativa, sem aprovação), como no Control Center. */
async function proposeRules(n: number, forceReview = true): Promise<number> {
  const v = ruleVersion(n);
  const db = await clientOf("diego");
  const r = await db
    .from("rules")
    .insert({ version: v, body: RULES_BODY, force_review: forceReview, proposed_by: DIEGO });
  expect(r.error).toBeNull();
  return v;
}

async function proposeWeights(n: number): Promise<string> {
  const v = weightsVersion(n);
  const db = await clientOf("diego");
  const r = await db.from("rec_weights").insert({
    version: v,
    weights: {
      popularity: 0.35,
      individual: 0.25,
      recency: 0.15,
      engagement: 0.1,
      operational: 0.1,
      diversity: 0.05,
    },
    proposed_by: DIEGO,
  });
  expect(r.error).toBeNull();
  return v;
}

async function approvalRow(id: string) {
  const r = await service.from("approvals").select("*").eq("id", id).single();
  expect(r.error).toBeNull();
  return r.data!;
}

async function auditOf(objectRef: string) {
  const r = await service
    .from("audit_log")
    .select("actor, action, object_ref, details")
    .eq("object_ref", objectRef)
    .order("id", { ascending: true });
  expect(r.error).toBeNull();
  return r.data ?? [];
}

async function requestAs(
  user: Parameters<typeof asUser>[0],
  input: Parameters<typeof requestApproval>[0],
) {
  const r = await asUser(user, () => requestApproval(input));
  if (r.ok) createdApprovals.push(r.value.id);
  return r;
}

describe("requestApproval", () => {
  it("justificativa vazia ou só com espaços → invalid, sem gravar pedido", async () => {
    const v = await proposeRules(1);
    const before = await service
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .eq("target_ref", String(v));
    for (const justification of ["", "   \n\t "]) {
      const r = await requestAs("diego", {
        kind: "rules.activate",
        targetRef: String(v),
        justification,
      });
      expect(r).toMatchObject({ ok: false, error: "invalid" });
    }
    const after = await service
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .eq("target_ref", String(v));
    expect(after.count).toBe(before.count);
  });

  it("tipo desconhecido, alvo inexistente ou proposto por outra pessoa → invalid", async () => {
    const unknown = await requestAs("diego", {
      // @ts-expect-error tipo fora da lista de mudanças críticas
      kind: "rules.whatever",
      targetRef: "1",
      justification: "teste",
    });
    expect(unknown).toMatchObject({ ok: false, error: "invalid" });
    const missing = await requestAs("diego", {
      kind: "rules.activate",
      targetRef: String(ruleVersion(9)),
      justification: "Ativar regras novas",
    });
    expect(missing).toMatchObject({ ok: false, error: "invalid" });
    // v1 do seed foi proposta por Marina: Diego não pede a ativação de proposta alheia.
    const notMine = await requestAs("diego", {
      kind: "rules.activate",
      targetRef: "1",
      justification: "Reativar a v1",
    });
    expect(notMine).toMatchObject({ ok: false, error: "invalid" });
  });

  it("desligar forceReview só pelo tipo force_review.disable", async () => {
    const v = await proposeRules(2, false);
    const asActivate = await requestAs("diego", {
      kind: "rules.activate",
      targetRef: String(v),
      justification: "Regras sem revisão obrigatória",
    });
    expect(asActivate).toMatchObject({ ok: false, error: "invalid" });
    const asDisable = await requestAs("diego", {
      kind: "force_review.disable",
      targetRef: String(v),
      justification: "Regras sem revisão obrigatória",
    });
    expect(asDisable.ok).toBe(true);
  });

  it("papel sem permissão de pedir → forbidden", async () => {
    const r = await requestAs("thiago", {
      kind: "rules.activate",
      targetRef: "1",
      justification: "teste",
    });
    expect(r).toMatchObject({ ok: false, error: "forbidden" });
  });
});

describe("approve", () => {
  let v: number;
  let id: string;

  beforeAll(async () => {
    v = await proposeRules(3);
    const r = await requestAs("diego", {
      kind: "rules.activate",
      targetRef: String(v),
      justification: "  Limiar de confiança de Serviços ajustado  ",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("pedido não criado");
    id = r.value.id;
  });

  it("o pedido nasce pendente, em nome de quem pede, com justificativa aparada e auditado", async () => {
    expect(await approvalRow(id)).toMatchObject({
      kind: "rules.activate",
      target_ref: String(v),
      requested_by: DIEGO,
      approved_by: null,
      status: "pending",
      justification: "Limiar de confiança de Serviços ajustado",
    });
    const rows = await auditOf(`approval:${id}`);
    expect(rows).toContainEqual(
      expect.objectContaining({ actor: DIEGO, action: "approval.request" }),
    );
  });

  it("autoaprovação → self_approval com a mensagem, e o pedido segue pendente", async () => {
    const r = await asUser("diego", () => approve({ id }));
    expect(r).toEqual({
      ok: false,
      error: "self_approval",
      message: "A aprovação precisa ser de outra pessoa",
    });
    expect(await approvalRow(id)).toMatchObject({ status: "pending", approved_by: null });
    const rows = await auditOf(`approval:${id}`);
    expect(rows).toContainEqual(
      expect.objectContaining({ actor: DIEGO, action: "approval.approve.denied" }),
    );
  });

  it("papel sem permissão para decidir → forbidden (equipe e leitor)", async () => {
    for (const user of ["thiago", "otavio", "carlos", "paulo"] as const) {
      const r = await asUser(user, () => approve({ id }));
      expect(r, user).toMatchObject({ ok: false, error: "forbidden" });
    }
    expect(await approvalRow(id)).toMatchObject({ status: "pending", approved_by: null });
  });

  it("aprovação válida ativa o alvo e audita as duas pessoas", async () => {
    const r = await asUser("marina", () => approve({ id }));
    expect(r).toEqual({ ok: true, value: undefined });
    expect(await approvalRow(id)).toMatchObject({ status: "applied", approved_by: MARINA });

    const rule = await service.from("rules").select("*").eq("version", v).single();
    expect(rule.data).toMatchObject({ approved_by: MARINA, active: true, proposed_by: DIEGO });
    const active = await service.from("rules").select("version").eq("active", true);
    expect((active.data ?? []).map((x) => x.version)).toEqual([v]);

    const rows = await auditOf(`approval:${id}`);
    const request = rows.find((x) => x.action === "approval.request");
    const decision = rows.find((x) => x.action === "approval.approve");
    expect(request).toMatchObject({ actor: DIEGO });
    expect(decision).toMatchObject({
      actor: MARINA,
      details: expect.objectContaining({
        kind: "rules.activate",
        target_ref: String(v),
        requested_by: DIEGO,
        approved_by: MARINA,
        effect: "activated",
      }),
    });
  });

  it("decisão repetida → not_pending (aprovar de novo ou recusar depois)", async () => {
    expect(await asUser("helena", () => approve({ id }))).toMatchObject({
      ok: false,
      error: "not_pending",
    });
    expect(await asUser("marina", () => reject({ id }))).toMatchObject({
      ok: false,
      error: "not_pending",
    });
    expect(await approvalRow(id)).toMatchObject({ status: "applied", approved_by: MARINA });
  });

  it("id inexistente → not_pending", async () => {
    const r = await asUser("marina", () => approve({ id: "00000000-0000-4000-8000-00000000abcd" }));
    expect(r).toMatchObject({ ok: false, error: "not_pending" });
  });
});

describe("pesos de recomendação e recusa", () => {
  it("rec.weights: editor_chefe não decide; admin aprova e os pesos entram em vigor", async () => {
    const v = await proposeWeights(1);
    const r = await requestAs("diego", {
      kind: "rec.weights",
      targetRef: v,
      justification: "Mais peso para recência",
    });
    if (!r.ok) throw new Error(`pedido falhou: ${r.error}`);
    expect(await asUser("marina", () => approve({ id: r.value.id }))).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    expect(await asUser("helena", () => approve({ id: r.value.id }))).toEqual({
      ok: true,
      value: undefined,
    });
    const row = await service.from("rec_weights").select("*").eq("version", v).single();
    expect(row.data).toMatchObject({ approved_by: HELENA, active: true });
    const active = await service.from("rec_weights").select("version").eq("active", true);
    expect((active.data ?? []).map((x) => x.version)).toEqual([v]);
  });

  it("recusa não ativa o alvo, é final e audita quem recusou", async () => {
    const v = await proposeRules(4);
    const r = await requestAs("diego", {
      kind: "rules.activate",
      targetRef: String(v),
      justification: "Proposta para recusar",
    });
    if (!r.ok) throw new Error(`pedido falhou: ${r.error}`);
    expect(await asUser("diego", () => reject({ id: r.value.id }))).toMatchObject({
      ok: false,
      error: "self_approval",
    });
    expect(await asUser("marina", () => reject({ id: r.value.id }))).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await approvalRow(r.value.id)).toMatchObject({
      status: "rejected",
      approved_by: MARINA,
    });
    const rule = await service.from("rules").select("*").eq("version", v).single();
    expect(rule.data).toMatchObject({ approved_by: null, active: false });
    const rows = await auditOf(`approval:${r.value.id}`);
    expect(rows).toContainEqual(
      expect.objectContaining({
        actor: MARINA,
        action: "approval.reject",
        details: expect.objectContaining({ requested_by: DIEGO }),
      }),
    );
    expect(await asUser("helena", () => approve({ id: r.value.id }))).toMatchObject({
      ok: false,
      error: "not_pending",
    });
  });

  it("role.admin é autorização: aprovada, libera uma concessão (consumida no user_roles)", async () => {
    const r = await requestAs("marina", {
      kind: "role.admin",
      targetRef: SEED_USERS.thiago.id,
      justification: "Thiago cobre as férias da Helena",
    });
    if (!r.ok) throw new Error(`pedido falhou: ${r.error}`);
    expect(await asUser("helena", () => approve({ id: r.value.id }))).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await approvalRow(r.value.id)).toMatchObject({ status: "approved" });
    const decision = (await auditOf(`approval:${r.value.id}`)).find(
      (x) => x.action === "approval.approve",
    );
    expect(decision?.details).toMatchObject({ effect: "authorized" });
    // Não concede nada sozinha: a concessão é um passo à parte (T8), aqui só limpamos o bilhete.
    await service.from("approvals").update({ status: "applied" }).eq("id", r.value.id);
  });
});

describe("contrato com o banco", () => {
  it("a matriz de papéis por tipo é a mesma no código e no banco", async () => {
    const db = await clientOf("helena");
    const { data, error } = await db.rpc("approval_kind_roles");
    expect(error).toBeNull();
    const fromDb = Object.fromEntries(
      (data ?? []).map((r) => [
        r.kind,
        { request: [...r.requesters].sort(), decide: [...r.approvers].sort() },
      ]),
    );
    const fromCode = Object.fromEntries(
      CRITICAL_KINDS.map((k) => [
        k,
        {
          request: [...APPROVAL_KIND_ROLES[k].request].sort(),
          decide: [...APPROVAL_KIND_ROLES[k].decide].sort(),
        },
      ]),
    );
    expect(fromDb).toEqual(fromCode);
  });
});
