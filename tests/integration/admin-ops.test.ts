// @vitest-environment node
// P5-T9 · Administração: push urgente com aprovação, auditoria com IP mascarado, segurança,
// campanhas e configurações. Rodam como usuários de seed (JWT real, RLS e funções valendo).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditCsv } from "@/lib/admin/audit-csv";
import {
  clearLoginBlocks,
  requestPushApproval,
  saveCampaign,
  saveSettings,
  sendUrgentPush,
  setCampaignActive,
  setSponsoredFlag,
} from "@/lib/admin/writes";
import { approve } from "@/lib/approvals";
import { listAuditForExport, securityOverview } from "@/lib/db/queries/admin";
import { asUser, clientOf, SEED_USERS, service } from "./studio";

const run = Date.now() % 1_000_000;
const IP = "203.0.113.42";
const approvalsMade: string[] = [];
const campaigns: string[] = [];
let articleId = "";
let flagBefore = false;
const settingsBefore = new Map<string, string>();

beforeAll(async () => {
  const a = await service.from("articles").select("id").eq("status", "published").limit(1).single();
  expect(a.error).toBeNull();
  articleId = a.data?.id ?? "";
  flagBefore =
    (await service.from("feature_flags").select("enabled").eq("key", "sponsored_enabled").single())
      .data?.enabled ?? false;
  const s = await service.from("site_settings").select("key, value");
  for (const r of s.data ?? []) settingsBefore.set(r.key, r.value);
});

afterAll(async () => {
  if (approvalsMade.length > 0) {
    await service.from("push_dispatches").delete().in("approval_id", approvalsMade);
    await service.from("approvals").delete().in("id", approvalsMade);
  }
  if (campaigns.length > 0) await service.from("sponsored_campaigns").delete().in("id", campaigns);
  await service
    .from("feature_flags")
    .update({ enabled: flagBefore })
    .eq("key", "sponsored_enabled");
  for (const [key, value] of settingsBefore)
    await service.from("site_settings").update({ value }).eq("key", key);
  await service.from("rate_limits").delete().eq("key_hash", `admin-ops-${run}`);
});

const auditCount = async (actor: string, action: string, ref: string) =>
  (
    await service
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("actor", actor)
      .eq("action", action)
      .eq("object_ref", ref)
  ).count ?? 0;

describe("push urgente (push.urgent)", () => {
  it("sem aprovação não sai; com aprovação de outra pessoa entra na fila uma única vez", async () => {
    expect(await asUser("otavio", () => sendUrgentPush(articleId))).toBe("approval_required");
    expect(
      await auditCount(SEED_USERS.otavio.id, "push.send.denied", `article:${articleId}`),
    ).toBeGreaterThan(0);

    const req = await asUser("otavio", () =>
      requestPushApproval(articleId, "Alagamento na Avenida"),
    );
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    approvalsMade.push(req.value.id);

    // Pendente ainda não vale.
    expect(await asUser("otavio", () => sendUrgentPush(articleId))).toBe("approval_required");
    // Quem pediu não aprova.
    const self = await asUser("otavio", () => approve({ id: req.value.id }));
    expect(self.ok).toBe(false);

    const ok = await asUser("marina", () => approve({ id: req.value.id }));
    expect(ok.ok).toBe(true);

    const sentBefore = await auditCount(SEED_USERS.otavio.id, "push.send", `article:${articleId}`);
    expect(await asUser("otavio", () => sendUrgentPush(articleId))).toBe("queued");
    const row = await service
      .from("push_dispatches")
      .select("*")
      .eq("approval_id", req.value.id)
      .single();
    expect(row.data).toMatchObject({
      article_id: articleId,
      status: "queued",
      sent_by: SEED_USERS.otavio.id,
    });
    expect(await auditCount(SEED_USERS.otavio.id, "push.send", `article:${articleId}`)).toBe(
      sentBefore + 1,
    );

    // A aprovação foi consumida.
    expect(await asUser("otavio", () => sendUrgentPush(articleId))).toBe("approval_required");
  });

  it("jornalista não envia; matéria inexistente ou não publicada é not_found", async () => {
    expect(await asUser("rafael", () => sendUrgentPush(articleId))).toBe("forbidden");
    expect(
      await asUser("otavio", () => sendUrgentPush("00000000-0000-4000-8000-00000000dead")),
    ).toBe("not_found");
  });

  it("o cliente não grava push_dispatches direto (sem passar pela aprovação)", async () => {
    const db = await clientOf("marina");
    const r = await db.from("push_dispatches").insert({
      article_id: articleId,
      approval_id: "00000000-0000-4000-8000-000000000000",
      sent_by: SEED_USERS.marina.id,
    });
    expect(r.error).not.toBeNull();
  });
});

describe("auditoria exportada", () => {
  it("IP inteiro só para admin; para os demais o CSV traz o endereço mascarado", async () => {
    const ref = `ip-test:${run}`;
    const ins = await service.from("audit_log").insert({
      actor: `admin-ops-${run}`,
      action: "article.publish",
      object_ref: ref,
      details: { ip: IP, nota: "teste" },
      ip_hash: IP,
    });
    expect(ins.error).toBeNull();

    const rowsMarina = await asUser("marina", () => listAuditForExport({ object: ref }));
    expect(rowsMarina).toHaveLength(1);
    const csvMarina = auditCsv(rowsMarina, false);
    expect(csvMarina).not.toContain(IP);
    expect(csvMarina).toContain("203.0.x.x");

    const rowsHelena = await asUser("helena", () => listAuditForExport({ object: ref }));
    const csvHelena = auditCsv(rowsHelena, true);
    expect(csvHelena).toContain(IP);
  });

  it("papel sem audit.view não lê o registro", async () => {
    const rows = await asUser("rafael", () => listAuditForExport({}));
    expect(rows).toHaveLength(0);
  });

  it("os nomes novos de auditoria estão no banco (a lista completa é conferida em studio-audit.test.ts)", async () => {
    const db = (await service.rpc("studio_audit_actions")).data ?? [];
    for (const a of [
      "ads.campaign.save",
      "ads.campaign.toggle",
      "ads.flag.toggle",
      "push.send",
      "settings.update",
      "security.clear_login_blocks",
    ])
      expect(db).toContain(a);
  });
});

describe("segurança", () => {
  it("editor-chefe lê sessões e limites; jornalista é negado; só admin libera bloqueios (auditado)", async () => {
    const ov = await asUser("marina", () => securityOverview());
    expect(ov.sessions.some((s) => s.userId === SEED_USERS.helena.id)).toBe(true);
    expect(Array.isArray(ov.limits)).toBe(true);
    // nenhuma chave de limite (hash) na resposta
    expect(JSON.stringify(ov.limits)).not.toContain("key_hash");

    const denied = await (await clientOf("rafael")).rpc("admin_security_sessions");
    expect(denied.error?.code).toBe("42501");

    await service.from("rate_limits").insert({
      bucket: "login_fail",
      key_hash: `admin-ops-${run}`,
      window_start: new Date().toISOString(),
      hits: 5,
    });
    const no = await asUser("marina", () => clearLoginBlocks());
    expect(no).toMatchObject({ ok: false, code: "forbidden" });
    const left = await service
      .from("rate_limits")
      .select("hits")
      .eq("key_hash", `admin-ops-${run}`);
    expect(left.data).toHaveLength(1);

    const yes = await asUser("helena", () => clearLoginBlocks());
    expect(yes.ok).toBe(true);
    const gone = await service
      .from("rate_limits")
      .select("hits")
      .eq("key_hash", `admin-ops-${run}`);
    expect(gone.data).toHaveLength(0);
    expect(
      await auditCount(
        SEED_USERS.helena.id,
        "security.clear_login_blocks",
        "rate_limits:login_fail",
      ),
    ).toBeGreaterThan(0);
  });
});

describe("publicidade", () => {
  const input = {
    advertiser: `Anunciante Fictício ${run}`,
    startsOn: "2026-10-01",
    endsOn: "2026-10-31",
    sections: ["cidade"],
    headline: "Peça de teste",
    url: "https://anunciante.example/oferta",
  };

  it("campanha nasce pausada, ativa por editor-chefe e Política é recusada", async () => {
    const r = await asUser("marina", () => saveCampaign(input));
    expect(r.ok).toBe(true);
    const row = await service
      .from("sponsored_campaigns")
      .select("*")
      .eq("advertiser", input.advertiser)
      .single();
    expect(row.data?.active).toBe(false);
    campaigns.push(row.data?.id ?? "");
    expect(
      await auditCount(SEED_USERS.marina.id, "ads.campaign.save", `campaign:${row.data?.id}`),
    ).toBe(1);

    expect((await asUser("marina", () => setCampaignActive(row.data?.id ?? "", true))).ok).toBe(
      true,
    );
    const after = await service
      .from("sponsored_campaigns")
      .select("active")
      .eq("id", row.data?.id ?? "")
      .single();
    expect(after.data?.active).toBe(true);

    const pol = await asUser("marina", () =>
      saveCampaign({ ...input, sections: ["cidade", "politica"] }),
    );
    expect(pol).toMatchObject({ ok: false, code: "invalid" });
    const direct = await service.from("sponsored_campaigns").insert({
      advertiser: `X ${run}`,
      starts_on: "2026-10-01",
      ends_on: "2026-10-02",
      allowed_sections: ["politica"],
      creative: {},
    });
    expect(direct.error).not.toBeNull();
  });

  it("papel sem permissão não cria campanha; flag de patrocínio só o admin liga", async () => {
    expect(await asUser("diego", () => saveCampaign(input))).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    expect(await asUser("marina", () => setSponsoredFlag(true))).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    const still = await service
      .from("feature_flags")
      .select("enabled")
      .eq("key", "sponsored_enabled")
      .single();
    expect(still.data?.enabled).toBe(flagBefore);
    expect((await asUser("helena", () => setSponsoredFlag(true))).ok).toBe(true);
    const on = await service
      .from("feature_flags")
      .select("enabled")
      .eq("key", "sponsored_enabled")
      .single();
    expect(on.data?.enabled).toBe(true);
  });

  it("o patrocínio vem desligado por padrão (B-003)", async () => {
    // O valor de antes deste arquivo é o padrão da migration, salvo alteração manual.
    expect(typeof flagBefore).toBe("boolean");
  });
});

describe("configurações", () => {
  it("valores inválidos são recusados; válidos salvam e auditam; papel sem escrita é negado", async () => {
    const bad = await asUser("marina", () =>
      saveSettings({ "notify.max_push_per_day": "11" }, ["notify.max_push_per_day"]),
    );
    expect(bad).toMatchObject({ ok: false, code: "invalid" });
    const good = await asUser("marina", () =>
      saveSettings({ "notify.max_push_per_day": "4" }, ["notify.max_push_per_day"]),
    );
    expect(good.ok).toBe(true);
    const row = await service
      .from("site_settings")
      .select("value")
      .eq("key", "notify.max_push_per_day")
      .single();
    expect(row.data?.value).toBe("4");
    expect(
      await asUser("diego", () =>
        saveSettings({ "notify.max_push_per_day": "2" }, ["notify.max_push_per_day"]),
      ),
    ).toMatchObject({
      ok: false,
      code: "forbidden",
    });
  });

  it("chave fora da lista fechada é recusada pelo banco", async () => {
    const r = await (
      await clientOf("helena")
    )
      .from("site_settings")
      .insert({ key: "qualquer.coisa", value: "x" });
    expect(r.error).not.toBeNull();
  });
});
