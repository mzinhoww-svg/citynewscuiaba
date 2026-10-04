// @vitest-environment node
// P5-T7 · Recomendação (banco real): propor pesos abre pedido `rec.weights`; operador (sem o papel
// de decidir) não ativa; admin aprova e ativa pelo `rec_weights_activate`, inclusive o que ela
// mesma propõe, numa ação só (A-128); pesos 0,99 recusados;
// campanhas e testes A/B com variantes aprovadas; `getRecConfigFor` estável por anonId;
// "Por que esta recomendação" só via pseudônimo e sem peso individual sem consentimento.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { getRecConfigFor } from "@/lib/db/queries/sources";
import { assignVariant, experimentVersion } from "@/lib/ranking/experiments";
import { REC_V1 } from "@/lib/ranking/score";
import {
  activateWeightsCommand,
  createCampaignCommand,
  createExperimentCommand,
  endExperimentCommand,
  explainRecommendationCommand,
  promoteExperimentCommand,
  proposeWeightsCommand,
  pseudonymOf,
} from "@/lib/studio/recommendation";
import { asUser, SEED_USERS, service } from "./studio";

const W2 = { ...REC_V1, popularity: 0.3, diversity: 0.1 };
const approvals: string[] = [];
const experiments: string[] = [];
const campaigns: string[] = [];
const anon = randomUUID();

afterAll(async () => {
  // Devolve rec-v1 como única ativa e apaga o que a suíte criou.
  if (experiments.length) await service.from("rec_experiments").delete().in("id", experiments);
  if (campaigns.length) await service.from("rec_campaigns").delete().in("id", campaigns);
  await service.from("rec_weights").update({ active: false }).neq("version", "rec-v1");
  await service.from("rec_weights").update({ active: true }).eq("version", "rec-v1");
  await service.from("rec_weights").delete().like("version", "rec-v%").neq("version", "rec-v1");
  if (approvals.length) await service.from("approvals").delete().in("id", approvals);
  await service.from("events").delete().eq("anon_id", anon);
});

async function weightsRow(version: string) {
  const { data } = await service
    .from("rec_weights")
    .select("version, active, approved_by, proposed_by")
    .eq("version", version)
    .maybeSingle();
  return data;
}

describe("pesos de recomendação (banco real)", () => {
  it("as ações de auditoria novas estão nas duas listas", async () => {
    const r = await service.rpc("studio_audit_actions");
    for (const a of ["rec.weights.activate", "rec.experiment.promote", "rec.explain"]) {
      expect(AUDIT_ACTIONS).toContain(a);
      expect(r.data).toContain(a);
    }
  });

  it("soma 0,99 é recusada; analista não propõe", async () => {
    const bad = await asUser("diego", () =>
      proposeWeightsCommand({ weights: { ...REC_V1, diversity: 0.04 }, justification: "x" }),
    );
    expect(bad).toMatchObject({ ok: false, error: "invalid" });
    const no = await asUser("thiago", () =>
      proposeWeightsCommand({ weights: W2, justification: "x" }),
    );
    expect(no).toMatchObject({ ok: false, error: "forbidden" });
  });

  let version = "";
  let approvalId = "";

  it("operador propõe rec-v2: validar → simular → ativar → auditar, sem fila (A-150)", async () => {
    const r = await asUser("diego", () =>
      proposeWeightsCommand({ weights: W2, justification: "Mais diversidade nas Recomendadas" }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    version = r.value.version;
    approvalId = r.value.approvalId ?? "";
    approvals.push(approvalId);
    expect(r.value.status).toBe("applied");
    expect(version).toMatch(/^rec-v\d+$/);
    expect(await weightsRow(version)).toMatchObject({
      active: true,
      approved_by: SEED_USERS.diego.id,
      proposed_by: SEED_USERS.diego.id,
    });
    const ap = await service
      .from("approvals")
      .select("status, decision_mode, outcome, rule_id")
      .eq("id", approvalId)
      .single();
    expect(ap.data).toMatchObject({
      status: "applied",
      decision_mode: "system",
      outcome: "auto_apply",
      rule_id: "rec.valid",
    });
    const dec = await service
      .from("governance_decisions")
      .select("decision, actor, policy_version")
      .eq("approval_id", approvalId)
      .single();
    expect(dec.data).toMatchObject({
      decision: "auto_approved",
      actor: "system",
      policy_version: 1,
    });
    // Editora-chefe não tem `rec.weights` (só admin e operador_ia).
    const marina = await asUser("marina", () => activateWeightsCommand({ approvalId }));
    expect(marina).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("mudança brusca é recusada sem fila; admin volta ao padrão na mesma ação", async () => {
    const abrupt = {
      popularity: 0.9,
      individual: 0.02,
      recency: 0.02,
      engagement: 0.02,
      operational: 0.02,
      diversity: 0.02,
    };
    const no = await asUser("helena", () =>
      proposeWeightsCommand({ weights: abrupt, justification: "teste de mudança brusca" }),
    );
    expect(no).toMatchObject({ ok: false, error: "invalid" });
    expect(no.ok ? "" : no.message).toMatch(/Recusado pela política/);
    const stillActive = await service.from("rec_weights").select("version").eq("active", true);
    expect(stillActive.data).toEqual([{ version }]);
    // A-128: admin que propõe aprova e ativa na mesma ação; o pedido e a auditoria registram
    // quem propôs e quem aprovou (a mesma pessoa).
    const back = await asUser("helena", () =>
      proposeWeightsCommand({ weights: REC_V1, justification: "Voltar ao padrão" }),
    );
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const backId = back.value.approvalId ?? "";
    approvals.push(backId);
    expect(back.value.status).toBe("applied");
    const nowActive = await service.from("rec_weights").select("version").eq("active", true);
    expect(nowActive.data).toEqual([{ version: back.value.version }]);
    expect(await weightsRow(back.value.version)).toMatchObject({
      active: true,
      proposed_by: SEED_USERS.helena.id,
      approved_by: SEED_USERS.helena.id,
    });
    const backRow = await service
      .from("approvals")
      .select("status, requested_by, approved_by")
      .eq("id", backId)
      .single();
    expect(backRow.data).toEqual({
      status: "applied",
      requested_by: SEED_USERS.helena.id,
      approved_by: SEED_USERS.helena.id,
    });
    const backAudit = await service
      .from("audit_log")
      .select("actor, action")
      .eq("details->>approvalId", backId);
    expect(backAudit.data).toEqual(
      expect.arrayContaining([
        { actor: SEED_USERS.helena.id, action: "approval.requested" },
        { actor: SEED_USERS.helena.id, action: "approval.approved" },
        { actor: SEED_USERS.helena.id, action: "approval.applied" },
      ]),
    );
  });

  it("campanha exige fonte e período válido; criada com auditoria", async () => {
    const { data: src } = await service
      .from("sources")
      .select("id")
      .eq("slug", "folha-do-cerrado")
      .single();
    const bad = await asUser("diego", () =>
      createCampaignCommand({
        name: "x",
        sourceIds: [src!.id],
        startsOn: "2026-10-10",
        endsOn: "2026-10-01",
        quota: 1,
        audience: "all",
      }),
    );
    expect(bad).toMatchObject({ ok: false, error: "invalid" });
    const ok = await asUser("diego", () =>
      createCampaignCommand({
        name: "Descoberta outubro",
        sourceIds: [src!.id],
        startsOn: "2026-10-01",
        endsOn: "2026-10-31",
        quota: 2,
        audience: "local",
      }),
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) campaigns.push(ok.value.id);
  });

  it("teste A/B: só versões aprovadas; variante estável por anonId; encerrar e promover ativa pela política", async () => {
    const approved = await service
      .from("rec_weights")
      .select("version")
      .not("approved_by", "is", null)
      .order("created_at");
    const versions = (approved.data ?? []).map((r) => r.version);
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const [a, b] = versions;
    const same = await asUser("diego", () =>
      createExperimentCommand({
        name: "x",
        variants: [
          { name: "c", weightsVersion: a! },
          { name: "v", weightsVersion: a! },
        ],
        split: [50, 50],
      }),
    );
    expect(same).toMatchObject({ ok: false, error: "invalid" });
    const r = await asUser("diego", () =>
      createExperimentCommand({
        name: "Diversidade +5",
        variants: [
          { name: "controle", weightsVersion: a! },
          { name: "variante-1", weightsVersion: b! },
        ],
        split: [50, 50],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    experiments.push(r.value.id);

    const c1 = await getRecConfigFor(anon);
    const c2 = await getRecConfigFor(anon);
    expect(c1.version).toBe(c2.version);
    const variant = assignVariant(anon, { id: r.value.id, split: [50, 50] });
    const base = (await getRecConfigFor(null)).version;
    expect(c1.version).toBe(experimentVersion(base, r.value.id, variant));
    expect(c1.version.length).toBeLessThanOrEqual(20);
    expect((await getRecConfigFor(null)).version).not.toContain("+");

    const promoted = await asUser("diego", () =>
      promoteExperimentCommand({
        id: r.value.id,
        variant: 1,
        justification: "Variante venceu no CTR",
      }),
    );
    expect(promoted.ok).toBe(true);
    if (!promoted.ok) return;
    approvals.push(promoted.value.approvalId ?? "");
    const exp = await service
      .from("rec_experiments")
      .select("status, promoted_version")
      .eq("id", r.value.id)
      .single();
    expect(exp.data).toEqual({ status: "promoted", promoted_version: promoted.value.version });
    const pending = await service
      .from("approvals")
      .select("status, kind")
      .eq("id", promoted.value.approvalId ?? "")
      .single();
    expect(pending.data).toEqual({ status: "applied", kind: "rec.weights" });
    const ended = await asUser("diego", () => endExperimentCommand({ id: r.value.id }));
    expect(ended).toMatchObject({ ok: false, error: "not_found" });
  });

  it("Por que esta recomendação: pseudônimo na auditoria, individual 0 sem consentimento", async () => {
    const bad = await asUser("diego", () => explainRecommendationCommand({ anonId: "nao-e-uuid" }));
    expect(bad).toMatchObject({ ok: false, error: "invalid" });
    const r = await asUser("diego", () => explainRecommendationCommand({ anonId: anon }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pseudonym).toBe(pseudonymOf(anon));
    expect(r.value.pseudonym).not.toContain(anon.slice(0, 8));
    expect(r.value.personalization).toBe(false);
    expect(r.value.sources.length).toBeGreaterThan(0);
    for (const s of r.value.sources) {
      const ind = s.components.find((c) => c.key === "individual");
      expect(ind?.weight).toBe(0);
      expect(s.components.reduce((acc, c) => acc + c.weight, 0)).toBeCloseTo(1, 6);
    }
    const audit = await service
      .from("audit_log")
      .select("object_ref, details")
      .eq("action", "rec.explain")
      .order("id", { ascending: false })
      .limit(1)
      .single();
    expect(audit.data?.object_ref).toBe(`reader:${pseudonymOf(anon)}`);
    expect(JSON.stringify(audit.data)).not.toContain(anon);
    const no = await asUser("thiago", () => explainRecommendationCommand({ anonId: anon }));
    expect(no).toMatchObject({ ok: false, error: "forbidden" });
  });
});
