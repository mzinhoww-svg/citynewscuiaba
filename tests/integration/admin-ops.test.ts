// @vitest-environment node
// P5-T9 · Administração (A07, A08, A10, A11, A14): exportação da auditoria com IP mascarado
// para quem não é admin; campanha nunca em Política/Segurança/Saúde (comando e banco);
// redirecionamento válido e sem laço; configurações com grade e papel por chave; pedido LGPD
// com prazo de 15 dias e sem e-mail na auditoria.
import { afterAll, describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { listCampaigns, searchAudit } from "@/lib/db/queries/admin-ops";
import {
  deleteCampaignCommand,
  deleteRedirectCommand,
  exportAuditCommand,
  rotateKeyCommand,
  saveCampaignCommand,
  savePrivacyRequestCommand,
  saveRedirectCommand,
  setSettingCommand,
} from "@/lib/studio/admin-ops";
import { asUser, SEED_USERS, service } from "./studio";

const mark = Date.now().toString(36);
const campaignIds: string[] = [];
const redirectIds: string[] = [];
const privacyIds: string[] = [];

afterAll(async () => {
  if (campaignIds.length) await service.from("sponsored_campaigns").delete().in("id", campaignIds);
  if (redirectIds.length) await service.from("redirects").delete().in("id", redirectIds);
  if (privacyIds.length) await service.from("privacy_requests").delete().in("id", privacyIds);
  await service
    .from("app_settings")
    .update({ value: "{title} · CityNews Cuiabá" })
    .eq("key", "seo.title_template");
  await service
    .from("app_settings")
    .update({ value: 12 as never })
    .eq("key", "security.session_hours");
  await service
    .from("integration_keys")
    .update({ rotated_at: null, rotated_by: null })
    .eq("key", "CRON_SECRET");
});

const campaign = (over: Partial<Parameters<typeof saveCampaignCommand>[0]> = {}) => ({
  advertiser: `Padaria ${mark}`,
  startsOn: "2026-09-01",
  endsOn: "2026-12-31",
  allowedSections: ["cidade", "cultura"],
  status: "active" as const,
  creative: { title: "Pão quente às 6h", href: "https://padaria.example/promo" },
  ...over,
});

describe("administração, parte 2 (banco real)", () => {
  it("as ações de auditoria desta tarefa estão nas duas listas", async () => {
    const r = await service.rpc("studio_audit_actions");
    for (const a of [
      "ads.campaign.save",
      "seo.redirect.save",
      "audit.export",
      "privacy.request.save",
      "security.key.rotate",
    ]) {
      expect(AUDIT_ACTIONS).toContain(a);
      expect(r.data).toContain(a);
    }
  });

  it("exporta a auditoria em CSV com IP mascarado para quem não é admin e inteiro para admin", async () => {
    // Uma linha com IP nos detalhes, gravada por Diego (operador de IA, audit.view sem ser admin).
    const diego = await asUser("diego", async () => {
      const { db } = await import("@/lib/studio/context").then((m) => m.studioContext());
      const r = await db.rpc("studio_audit", {
        p_actor: SEED_USERS.diego.id,
        p_action: "logs.export",
        p_object_ref: `logs:${mark}`,
        p_details: { ip: "200.10.20.30", note: mark },
      });
      expect(r.error).toBeNull();
      return exportAuditCommand({ filters: { object: `logs:${mark}` } });
    });
    expect(diego.ok).toBe(true);
    if (!diego.ok) return;
    expect(diego.value.masked).toBe(true);
    expect(diego.value.csv).toContain("200.10.x.x");
    expect(diego.value.csv).not.toContain("200.10.20.30");

    const helena = await asUser("helena", () =>
      exportAuditCommand({ filters: { object: `logs:${mark}` } }),
    );
    expect(helena.ok && helena.value.masked).toBe(false);
    expect(helena.ok && helena.value.csv).toContain("200.10.20.30");

    const rows = await asUser("diego", () =>
      searchAudit({ object: `logs:${mark}` }, { limit: 10, maskIp: true }),
    );
    expect(rows[0]?.ipHash).toBeNull();
    const exported = await service
      .from("audit_log")
      .select("actor")
      .eq("action", "audit.export")
      .eq("details->>rows", "1");
    expect((exported.data ?? []).length).toBeGreaterThanOrEqual(2);

    const rafael = await asUser("rafael", () => exportAuditCommand({ filters: {} }));
    expect(rafael).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("campanha nunca entra em Política, Segurança ou Saúde (comando e banco); editor-chefe gerencia", async () => {
    const bad = await asUser("marina", () =>
      saveCampaignCommand(campaign({ allowedSections: ["cidade", "politica"] })),
    );
    expect(bad).toMatchObject({ ok: false, error: "invalid" });
    const direct = await service.from("sponsored_campaigns").insert({
      advertiser: "x",
      starts_on: "2026-09-01",
      ends_on: "2026-09-02",
      allowed_sections: ["saude"],
      creative: { title: "x", href: "https://x.example" },
    });
    expect(direct.error?.code).toBe("23514");

    const ok = await asUser("marina", () => saveCampaignCommand(campaign()));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    campaignIds.push(ok.value.id);
    const list = await asUser("marina", () => listCampaigns());
    expect(list.find((c) => c.id === ok.value.id)).toMatchObject({
      advertiser: `Padaria ${mark}`,
      status: "active",
      deliveries: 0,
    });
    const denied = await asUser("diego", () =>
      saveCampaignCommand(campaign({ id: ok.value.id, status: "paused" })),
    );
    expect(denied).toMatchObject({ ok: false, error: "forbidden" });
    const del = await asUser("helena", () => deleteCampaignCommand({ id: ok.value.id }));
    expect(del.ok).toBe(true);
    campaignIds.length = 0;
  });

  it("redirecionamento só para caminho interno, sem laço, e apagável", async () => {
    const r = await asUser("marina", () =>
      saveRedirectCommand({
        fromPath: `/materia/antiga-${mark}/`,
        toPath: `/materia/nova-${mark}`,
        kind: 301,
        reason: "arquivada",
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    redirectIds.push(r.value.id);
    expect(r.value.fromPath).toBe(`/materia/antiga-${mark}`);
    const loop = await asUser("marina", () =>
      saveRedirectCommand({
        fromPath: `/materia/nova-${mark}`,
        toPath: `/materia/antiga-${mark}`,
        kind: 301,
      }),
    );
    expect(loop).toMatchObject({ ok: false, error: "invalid" });
    const external = await asUser("marina", () =>
      saveRedirectCommand({ fromPath: `/x-${mark}`, toPath: "https://evil.example", kind: 301 }),
    );
    expect(external).toMatchObject({ ok: false, error: "invalid" });
    const dup = await asUser("marina", () =>
      saveRedirectCommand({ fromPath: `/materia/antiga-${mark}`, toPath: "/", kind: 302 }),
    );
    expect(dup).toMatchObject({ ok: false, error: "conflict" });
    const del = await asUser("marina", () => deleteRedirectCommand({ id: r.value.id }));
    expect(del.ok).toBe(true);
    redirectIds.length = 0;
  });

  it("configurações: grade no banco e papel por chave", async () => {
    const noTitle = await asUser("marina", () =>
      setSettingCommand({ key: "seo.title_template", value: "Sem marcador" }),
    );
    expect(noTitle).toMatchObject({ ok: false, error: "invalid" });
    const okTpl = await asUser("marina", () =>
      setSettingCommand({ key: "seo.title_template", value: `{title} · CityNews ${mark}` }),
    );
    expect(okTpl.ok).toBe(true);
    const security = await asUser("marina", () =>
      setSettingCommand({ key: "security.session_hours", value: 8 }),
    );
    expect(security).toMatchObject({ ok: false, error: "forbidden" });
    const outOfRange = await asUser("helena", () =>
      setSettingCommand({ key: "security.session_hours", value: 5000 }),
    );
    expect(outOfRange).toMatchObject({ ok: false, error: "invalid" });
    const okHours = await asUser("helena", () =>
      setSettingCommand({ key: "security.session_hours", value: 8 }),
    );
    expect(okHours.ok).toBe(true);
    const audit = await service
      .from("audit_log")
      .select("details")
      .eq("action", "settings.update")
      .eq("object_ref", "setting:security.session_hours")
      .order("id", { ascending: false })
      .limit(1)
      .single();
    expect(audit.data?.details).toMatchObject({ from: 12, to: 8 });
    const unknown = await asUser("helena", () =>
      setSettingCommand({ key: "qualquer.coisa", value: 1 }),
    );
    expect(unknown).toMatchObject({ ok: false, error: "invalid" });
  });

  it("pedido LGPD nasce com prazo de 15 dias e sem e-mail na auditoria; chave marcada como rotacionada", async () => {
    const r = await asUser("helena", () =>
      savePrivacyRequestCommand({
        kind: "delete",
        email: `leitor-${mark}@exemplo.com`,
        notes: "Pediu pelo formulário",
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    privacyIds.push(r.value.id);
    const row = await service
      .from("privacy_requests")
      .select("status, due_at, created_at")
      .eq("id", r.value.id)
      .single();
    const days =
      (new Date(row.data!.due_at).getTime() - new Date(row.data!.created_at).getTime()) / 86400_000;
    expect(Math.round(days)).toBe(15);
    const audit = await service
      .from("audit_log")
      .select("details")
      .eq("object_ref", `privacy:${r.value.id}`)
      .eq("action", "privacy.request.save");
    expect(JSON.stringify(audit.data)).not.toContain(`leitor-${mark}`);
    const done = await asUser("helena", () =>
      savePrivacyRequestCommand({ id: r.value.id, status: "done" }),
    );
    expect(done.ok).toBe(true);
    const after = await service
      .from("privacy_requests")
      .select("status, decided_by")
      .eq("id", r.value.id)
      .single();
    expect(after.data).toMatchObject({ status: "done", decided_by: SEED_USERS.helena.id });
    const marina = await asUser("marina", () =>
      savePrivacyRequestCommand({ kind: "access", email: "x@exemplo.com" }),
    );
    expect(marina).toMatchObject({ ok: false, error: "forbidden" });

    const rot = await asUser("helena", () => rotateKeyCommand({ key: "CRON_SECRET" }));
    expect(rot.ok).toBe(true);
    const key = await service
      .from("integration_keys")
      .select("rotated_by")
      .eq("key", "CRON_SECRET")
      .single();
    expect(key.data?.rotated_by).toBe(SEED_USERS.helena.id);
  });
});
