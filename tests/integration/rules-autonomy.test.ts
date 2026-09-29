// @vitest-environment node
// P5-T2 · Regras de autonomia: simulação com candidatos reais, proposta com as aprovações que o
// banco exige, e as travas do banco (Segurança nunca automática; ativação só com aprovação).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approve, requestApproval } from "@/lib/approvals";
import type { Json } from "@/lib/db/types";
import type { Candidate, RuleSet } from "@/lib/rules";
import { requiredRuleKinds, ruleProblems } from "@/lib/rules/critical";
import { DEFAULT_RULES } from "@/lib/rules/defaults";
import { foldKey } from "@/lib/rules/safety";
import { proposeRules, simulateProposal, type RulesDraft } from "@/lib/studio/rules";
import { asUser, clientOf, SEED_USERS, service } from "./studio";

const run = Date.now() % 1_000_000;
const tag = `sim-${run}`;
let activeRules: number[] = [];
let maxBefore = 0;
const createdApprovals: string[] = [];

const draftOf = (r: RuleSet): RulesDraft => ({
  forceReview: r.forceReview,
  sensitiveTopics: r.sensitiveTopics,
  categories: r.categories,
});
const v1Draft = draftOf(DEFAULT_RULES);

const ready: Candidate = {
  category: "servicos",
  tags: [],
  independentSources: 2,
  primarySources: 0,
  centralConflict: false,
  imageApproved: false,
  confidenceScore: 0.7,
  breaking: false,
};

beforeAll(async () => {
  activeRules = ((await service.from("rules").select("version").eq("active", true)).data ?? []).map(
    (r) => r.version,
  );
  const top = await service.from("rules").select("version").order("version", { ascending: false });
  maxBefore = top.data?.[0]?.version ?? 0;
  // 3 candidatos reais de Serviços prontos para publicar (a revisão obrigatória segura hoje).
  const rows = [0, 1, 2].map((i) => ({
    object_ref: `article:${tag}-${i}-${randomUUID()}`,
    step: "rules",
    rules_version: 1,
    input_hash: `${tag}-${i}`,
    output: { route: "review", rule: "force_review", candidate: { ...ready } } as unknown as Json,
    rationale: "teste de simulação",
    recommended: "review",
  }));
  const ins = await service.from("decisions").insert(rows);
  expect(ins.error).toBeNull();
});

afterAll(async () => {
  await service.from("decisions").delete().like("input_hash", `${tag}-%`);
  const ours = await service
    .from("rules")
    .select("version")
    .gt("version", maxBefore)
    .eq("proposed_by", SEED_USERS.diego.id);
  const versions = (ours.data ?? []).map((r) => String(r.version));
  if (versions.length > 0)
    await service
      .from("approvals")
      .delete()
      .in("target_ref", versions)
      .in("kind", ["rules.activate", "safety.disable", "force_review.disable"]);
  if (createdApprovals.length > 0)
    await service.from("approvals").delete().in("id", createdApprovals);
  await service.from("rules").update({ active: false }).in("version", versions.map(Number));
  if (activeRules.length > 0)
    await service.from("rules").update({ active: true }).in("version", activeRules);
  await service.from("rules").delete().in("version", versions.map(Number));
});

async function simulateAs(draft: RulesDraft) {
  const r = await asUser("diego", () => simulateProposal({ rules: draft }));
  if (!r.ok) throw new Error(`simulação falhou: ${r.message}`);
  return r.value;
}

async function proposeAs(draft: RulesDraft, justification = "Ajuste de teste") {
  const sim = await simulateAs(draft);
  const r = await asUser("diego", () =>
    proposeRules({ rules: draft, justification, digest: sim.digest }),
  );
  if (r.ok) createdApprovals.push(...r.value.approvals.map((a) => a.id));
  return r;
}

describe("espelho código × banco", () => {
  const cases: [string, RuleSet | null, RuleSet][] = [
    [
      "limiar",
      DEFAULT_RULES,
      {
        ...DEFAULT_RULES,
        categories: {
          ...DEFAULT_RULES.categories,
          servicos: { ...DEFAULT_RULES.categories.servicos!, minScore: 0.5 },
        },
      },
    ],
    ["forceReview", DEFAULT_RULES, { ...DEFAULT_RULES, forceReview: false }],
    ["tema removido", DEFAULT_RULES, { ...DEFAULT_RULES, sensitiveTopics: ["crime"] }],
    [
      "tema com acento",
      DEFAULT_RULES,
      {
        ...DEFAULT_RULES,
        sensitiveTopics: DEFAULT_RULES.sensitiveTopics.map((t) =>
          t === "violencia" ? "Violência" : t,
        ),
      },
    ],
    [
      "Segurança em revisão",
      DEFAULT_RULES,
      {
        ...DEFAULT_RULES,
        forceReview: false,
        categories: {
          ...DEFAULT_RULES.categories,
          seguranca: { ...DEFAULT_RULES.categories.seguranca!, mode: "review" },
        },
      },
    ],
    ["sem versão ativa", null, DEFAULT_RULES],
    ["sem versão ativa, sem revisão", null, { ...DEFAULT_RULES, forceReview: false }],
  ];
  it.each(cases)("rules_kinds_between = requiredRuleKinds (%s)", async (_name, cur, next) => {
    const db = await clientOf("diego");
    const { data, error } = await db.rpc("rules_kinds_between", {
      p_cur_force: cur?.forceReview ?? true,
      p_cur_body: (cur ?? null) as unknown as Json,
      p_next_force: next.forceReview,
      p_next_body: next as unknown as Json,
    });
    expect(error).toBeNull();
    expect(data).toEqual(requiredRuleKinds(cur, next));
  });

  it("rules_fold = foldKey e rules_body_safe = ruleProblems (never_auto)", async () => {
    const db = await clientOf("diego");
    for (const s of ["Segurança", " saúde_individual ", "Última Hora", "ELEIÇÕES"]) {
      const { data } = await db.rpc("rules_fold", { t: s });
      expect(data, s).toBe(foldKey(s));
    }
    const unsafe = {
      ...DEFAULT_RULES,
      categories: {
        ...DEFAULT_RULES.categories,
        Urgente: { ...DEFAULT_RULES.categories.servicos! },
      },
    };
    for (const body of [DEFAULT_RULES, unsafe]) {
      const { data } = await db.rpc("rules_body_safe", { p_body: body as unknown as Json });
      expect(data).toBe(!ruleProblems(body).some((p) => p.code === "never_auto"));
    }
  });
});

describe("travas do banco", () => {
  it("nenhuma versão deixa Segurança automática, nem pelo service role", async () => {
    const body = {
      ...DEFAULT_RULES,
      categories: {
        ...DEFAULT_RULES.categories,
        seguranca: { ...DEFAULT_RULES.categories.seguranca!, mode: "auto" },
      },
    };
    const r = await service.from("rules").insert({
      version: 70_000_000 + run,
      body: body as unknown as NonNullable<Json>,
      proposed_by: SEED_USERS.diego.id,
    });
    expect(r.error?.code).toBe("23514");
  });

  it("a proposta pela tela recusa Segurança automática antes do banco", async () => {
    const draft = {
      ...v1Draft,
      categories: {
        ...v1Draft.categories,
        seguranca: { ...v1Draft.categories.seguranca!, mode: "auto_notify" as const },
      },
    };
    const r = await asUser("diego", () => simulateProposal({ rules: draft }));
    expect(r).toMatchObject({ ok: false, error: "invalid" });
  });
});

describe("simulação e proposta", () => {
  it("simula com os candidatos reais dos últimos 7 dias (antes de propor)", async () => {
    const same = await simulateAs(v1Draft);
    expect(same.sampleSize).toBeGreaterThanOrEqual(3);
    expect(same.changed).toBe(0);
    expect(same.kinds).toEqual(["rules.activate"]);
    const open = await simulateAs({ ...v1Draft, forceReview: false });
    expect(open.changed).toBeGreaterThanOrEqual(3);
    expect(open.byRoute.review).toContainEqual(
      expect.objectContaining({ from: "review", to: "publish" }),
    );
    expect(open.kinds).toEqual(["force_review.disable"]);
    expect(open.changes).toEqual([
      expect.objectContaining({ field: "forceReview", from: true, to: false }),
    ]);
  });

  it("propor exige a simulação da mesma proposta e justificativa", async () => {
    const sim = await simulateAs(v1Draft);
    const other = await asUser("diego", () =>
      proposeRules({
        rules: { ...v1Draft, forceReview: false },
        justification: "x",
        digest: sim.digest,
      }),
    );
    expect(other).toMatchObject({ ok: false, error: "invalid" });
    const empty = await asUser("diego", () =>
      proposeRules({ rules: v1Draft, justification: "   ", digest: sim.digest }),
    );
    expect(empty).toMatchObject({ ok: false, error: "invalid" });
  });

  it("papel sem rules.propose não simula nem propõe", async () => {
    const r = await asUser("thiago", () => simulateProposal({ rules: v1Draft }));
    expect(r).toMatchObject({ ok: false, error: "forbidden" });
    const p = await asUser("thiago", () =>
      proposeRules({ rules: v1Draft, justification: "x", digest: "0" }),
    );
    expect(p).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("proposta comum: nasce inativa, pede rules.activate e fica ativa com a aprovação de outra pessoa", async () => {
    const draft = {
      ...v1Draft,
      categories: {
        ...v1Draft.categories,
        servicos: { ...v1Draft.categories.servicos!, minScore: 0.65 },
      },
    };
    const r = await proposeAs(draft, "Serviços com confiança mínima 0,65");
    if (!r.ok) throw new Error(`proposta falhou: ${r.error} ${r.message ?? ""}`);
    expect(r.value.approvals.map((a) => a.kind)).toEqual(["rules.activate"]);
    const row = await service.from("rules").select("*").eq("version", r.value.version).single();
    expect(row.data).toMatchObject({
      proposed_by: SEED_USERS.diego.id,
      active: false,
      approved_by: null,
    });

    // Pedido repetido do mesmo tipo e tipo que não corresponde à mudança → invalid.
    const again = await asUser("diego", () =>
      requestApproval({
        kind: "rules.activate",
        targetRef: String(r.value.version),
        justification: "de novo",
      }),
    );
    expect(again).toMatchObject({ ok: false, error: "invalid" });
    const wrong = await asUser("diego", () =>
      requestApproval({
        kind: "safety.disable",
        targetRef: String(r.value.version),
        justification: "tipo errado",
      }),
    );
    expect(wrong).toMatchObject({ ok: false, error: "invalid" });

    const id = r.value.approvals[0]!.id;
    expect(await asUser("diego", () => approve({ id }))).toMatchObject({ error: "self_approval" });
    expect(await asUser("marina", () => approve({ id }))).toEqual({ ok: true, value: undefined });
    const after = await service.from("rules").select("*").eq("version", r.value.version).single();
    expect(after.data).toMatchObject({ active: true, approved_by: SEED_USERS.marina.id });
    const audit = await service
      .from("audit_log")
      .select("actor, action, object_ref")
      .eq("object_ref", `rules:${r.value.version}`);
    expect(audit.data).toContainEqual(
      expect.objectContaining({ actor: SEED_USERS.diego.id, action: "rules.propose" }),
    );
  });

  it("desligar forceReview e tirar tema sensível pede os dois tipos; só ativa com os dois aprovados", async () => {
    const draft = {
      ...v1Draft,
      forceReview: false,
      sensitiveTopics: v1Draft.sensitiveTopics.filter((t) => t !== "overdose"),
    };
    const r = await proposeAs(draft, "Autonomia plena, sem o tema overdose");
    if (!r.ok) throw new Error(`proposta falhou: ${r.error} ${r.message ?? ""}`);
    const kinds = r.value.approvals.map((a) => a.kind).sort();
    expect(kinds).toEqual(["force_review.disable", "safety.disable"]);
    const v = r.value.version;
    const [first, second] = r.value.approvals;

    // ativação comum não é aceita para esta versão
    const plain = await asUser("diego", () =>
      requestApproval({ kind: "rules.activate", targetRef: String(v), justification: "comum" }),
    );
    expect(plain).toMatchObject({ ok: false, error: "invalid" });

    expect(await asUser("marina", () => approve({ id: first!.id }))).toEqual({
      ok: true,
      value: undefined,
    });
    let row = await service.from("rules").select("active, approved_by").eq("version", v).single();
    expect(row.data).toEqual({ active: false, approved_by: null });
    const waiting = await service
      .from("audit_log")
      .select("details")
      .eq("object_ref", `approval:${first!.id}`)
      .eq("action", "approval.approve")
      .single();
    expect(waiting.data?.details).toMatchObject({ effect: "waiting" });

    // UPDATE direto com só um dos tipos aprovado: recusado.
    const m = await clientOf("marina");
    const direct = await m
      .from("rules")
      .update({ approved_by: SEED_USERS.marina.id })
      .eq("version", v)
      .select();
    expect(direct.error).not.toBeNull();

    expect(await asUser("helena", () => approve({ id: second!.id }))).toEqual({
      ok: true,
      value: undefined,
    });
    row = await service.from("rules").select("active, approved_by").eq("version", v).single();
    expect(row.data).toEqual({ active: true, approved_by: SEED_USERS.helena.id });
  });
});
