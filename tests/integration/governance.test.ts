// @vitest-environment node
// Governança autônoma (A-133, 0151): todo pedido pendente tem prazo e vira estado terminal;
// decisão do motor fica na trilha `governance_decisions` (actor = system); termos restritivos são
// o único bloqueio de ativação de fonte; o modo de uso deriva dos termos.
import { afterAll, describe, expect, it } from "vitest";
import { asUser, clientOf, SEED_USERS, service } from "./studio";
import { proposeRulesCommand } from "@/lib/studio/rules";
import { DEFAULT_RULES } from "@/lib/rules/defaults";

const created: string[] = [];
const createdRules: number[] = [];

afterAll(async () => {
  if (created.length) await service.from("approvals").delete().in("id", created);
  if (createdRules.length) {
    await service.from("rules").update({ active: false }).in("version", createdRules);
    await service.from("rules").update({ active: true }).eq("version", 1);
    await service.from("rules").delete().in("version", createdRules);
  }
});

describe("nada fica parado (no-stuck)", () => {
  it("pedido pendente nasce com prazo e próxima ação; vencido, a varredura o expira", async () => {
    const m = await clientOf("marina");
    const ins = await m
      .from("approvals")
      .insert({
        kind: "source.critical",
        target_ref: "source:00000000-0000-4000-8000-000000000000:image_policy=reproduction",
        requested_by: SEED_USERS.marina.id,
        justification: "teste de prazo",
      })
      .select("id, expires_at, next_action, status")
      .single();
    expect(ins.error).toBeNull();
    created.push(ins.data!.id);
    expect(ins.data!.expires_at).not.toBeNull();
    expect(ins.data!.next_action).toBeTruthy();
    await service
      .from("approvals")
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", ins.data!.id);
    const r = await service.rpc("governance_sweep", {});
    expect(r.error).toBeNull();
    const row = await service.from("approvals").select("status").eq("id", ins.data!.id).single();
    expect(row.data?.status).toBe("expired");
    const dec = await service
      .from("governance_decisions")
      .select("decision, actor")
      .eq("approval_id", ins.data!.id)
      .single();
    expect(dec.data).toMatchObject({ decision: "expired", actor: "system" });
    // Decidir depois do prazo é recusado: o sistema reavalia, nada fica aberto para sempre.
    const late = await m
      .from("approvals")
      .update({ status: "approved", approved_by: SEED_USERS.marina.id })
      .eq("id", ins.data!.id)
      .select("id");
    expect(late.error ?? late.data).not.toEqual([{ id: ins.data!.id }]);
  });

  it("apagar um pedido não quebra a trilha (sem chave estrangeira na trilha imutável)", async () => {
    const m = await clientOf("marina");
    const ins = await m
      .from("approvals")
      .insert({
        kind: "rules.activate",
        target_ref: "rules:999999",
        requested_by: SEED_USERS.marina.id,
        justification: "teste de trilha",
      })
      .select("id")
      .single();
    expect(ins.error).toBeNull();
    await service.rpc("governance_sweep", {});
    await service
      .from("approvals")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", ins.data!.id);
    await service.rpc("governance_sweep", {});
    const del = await service.from("approvals").delete().eq("id", ins.data!.id);
    expect(del.error).toBeNull();
    const trail = await service
      .from("governance_decisions")
      .select("decision")
      .eq("approval_id", ins.data!.id);
    expect(trail.data).toEqual([{ decision: "expired" }]);
  });

  it("governance_decisions é somente inserção", async () => {
    const { data } = await service.from("governance_decisions").select("id").limit(1).single();
    const up = await service
      .from("governance_decisions")
      .update({ reason: "x" })
      .eq("id", data!.id);
    expect(up.error).not.toBeNull();
  });
});

describe("motor de política nas regras", () => {
  it("regra válida com papel certo aplica na hora e registra a decisão do sistema", async () => {
    const r = await asUser("marina", () =>
      proposeRulesCommand({
        rules: {
          forceReview: true,
          sensitiveTopics: [...DEFAULT_RULES.sensitiveTopics, "teste-governanca"],
          categories: DEFAULT_RULES.categories,
        },
        justification: "teste do motor de política",
      }),
    );
    expect(r).toMatchObject({ ok: true, value: { status: "applied" } });
    if (!r.ok) return;
    createdRules.push(r.value.version);
    created.push(r.value.approvalId ?? "");
    const dec = await service
      .from("governance_decisions")
      .select("decision, actor, rule_id, policy_version, input_hash")
      .eq("approval_id", r.value.approvalId ?? "")
      .single();
    expect(dec.data).toMatchObject({
      decision: "auto_approved",
      actor: "system",
      rule_id: "rules.valid",
      policy_version: 1,
    });
    expect(dec.data!.input_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("fontes: termos em três estados", () => {
  it("modo de uso deriva dos termos; só termos restritivos impedem ativar", async () => {
    const mode = async (terms: string, status = "active", rep = "link_only", img = "none") =>
      (
        await service.rpc("source_usage_mode", {
          p_terms: terms,
          p_status: status,
          p_republish: rep,
          p_image: img,
        })
      ).data;
    expect(await mode("unknown")).toBe("EXCERPT");
    expect(await mode("acknowledged")).toBe("ATTRIBUTED");
    expect(await mode("acknowledged", "active", "summary_2_sentences", "reproduction")).toBe(
      "FULL",
    );
    expect(await mode("restricted")).toBe("BLOCKED");
    expect(await mode("acknowledged", "blocked")).toBe("BLOCKED");

    const s = await service
      .from("sources")
      .insert({
        slug: `termos-restritos-${Date.now()}`,
        name: "Fonte com termos restritivos",
        base_url: "https://termos-restritos.example",
        kind: "rss",
        locality: "cuiaba",
        status: "paused",
        terms_status: "restricted",
      })
      .select("id")
      .single();
    expect(s.error).toBeNull();
    const up = await service.from("sources").update({ status: "active" }).eq("id", s.data!.id);
    expect(up.error?.message).toMatch(/restritivos/);
    await service.from("sources").delete().eq("id", s.data!.id);
  });
});
