// @vitest-environment node
// Gate do P5 (docs/reports/P5-gate-review.md), achados de aplicação contra o banco real:
// Segurança em proposta de regras (7), CSV sem dado pessoal (9), exportação além do max_rows
// (11), publicidade (13), pedido de aprovação alheio (15) e redirecionamento (17).
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { APPROVAL_ERROR_TEXT } from "@/content/pt-BR/approvals";
import { rulesTarget } from "@/lib/approvals/targets";
import type { Json } from "@/lib/db/types";
import { DEFAULT_RULES } from "@/lib/rules/defaults";
import {
  exportAuditCommand,
  saveCampaignCommand,
  savePrivacyRequestCommand,
} from "@/lib/studio/admin-ops";
import { inviteUserCommand } from "@/lib/studio/admin-users";
import { decideApprovalCommand, requestApprovalCommand } from "@/lib/studio/approvals";
import { proposeRulesCommand } from "@/lib/studio/rules";
import { asUser, clientOf, SEED_USERS, service } from "./studio";

const mark = randomUUID().slice(0, 8);
const run = Date.now() % 1_000_000;
const invitedIds: string[] = [];
const privacyIds: string[] = [];
const approvalIds: string[] = [];
const campaignIds: string[] = [];
const ruleVersions: number[] = [];

afterAll(async () => {
  await service.from("rules").update({ active: false }).neq("version", 1);
  await service.from("rules").update({ active: true }).eq("version", 1);
  if (ruleVersions.length) await service.from("rules").delete().in("version", ruleVersions);
  if (approvalIds.length) await service.from("approvals").delete().in("id", approvalIds);
  if (campaignIds.length) await service.from("sponsored_campaigns").delete().in("id", campaignIds);
  if (privacyIds.length) await service.from("privacy_requests").delete().in("id", privacyIds);
  for (const id of invitedIds) {
    await service.from("staff_invites").delete().eq("user_id", id);
    await service.from("user_roles").delete().eq("user_id", id);
    await service.from("profiles").delete().eq("id", id);
    await service.auth.admin.deleteUser(id).catch(() => undefined);
  }
  await service.from("redirects").delete().like("from_path", `/gate-${mark}%`);
});

describe("achado 7 · proposta que tira tema sensível vira safety.disable", () => {
  it("só admin aprova; a versão ativa depois de outra pessoa decidir", async () => {
    const rules = {
      forceReview: DEFAULT_RULES.forceReview,
      sensitiveTopics: DEFAULT_RULES.sensitiveTopics.filter((t) => t !== "overdose"),
      categories: DEFAULT_RULES.categories,
    };
    const proposed = await asUser("marina", () =>
      proposeRulesCommand({ rules, justification: "Tema de overdose vai para outra editoria" }),
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    ruleVersions.push(proposed.value.version);
    expect(proposed.value.kind).toBe("safety.disable");
    approvalIds.push(proposed.value.approvalId!);

    // Editor-chefe e operador não têm a segunda assinatura de Segurança (é do admin).
    const self = await asUser("marina", () =>
      decideApprovalCommand({ id: proposed.value.approvalId!, decision: "approve" }),
    );
    expect(self).toMatchObject({ ok: false, error: "forbidden" });
    const diego = await asUser("diego", () =>
      decideApprovalCommand({ id: proposed.value.approvalId!, decision: "approve" }),
    );
    expect(diego).toMatchObject({ ok: false, error: "forbidden" });

    const ok = await asUser("helena", () =>
      decideApprovalCommand({ id: proposed.value.approvalId!, decision: "approve" }),
    );
    expect(ok).toMatchObject({ ok: true, value: { applied: true } });
    const active = await service.from("rules").select("version, approved_by").eq("active", true);
    expect(active.data).toEqual([
      { version: proposed.value.version, approved_by: SEED_USERS.helena.id },
    ]);
  });

  it("proposta que só acrescenta tema segue como rules.activate", async () => {
    const rules = {
      forceReview: DEFAULT_RULES.forceReview,
      sensitiveTopics: [...DEFAULT_RULES.sensitiveTopics, `greve-${mark}`],
      categories: DEFAULT_RULES.categories,
    };
    const proposed = await asUser("marina", () =>
      proposeRulesCommand({ rules, justification: "Cobrir greves com revisão" }),
    );
    expect(proposed.ok && proposed.value.kind).toBe("rules.activate");
    if (proposed.ok) {
      ruleVersions.push(proposed.value.version);
      approvalIds.push(proposed.value.approvalId!);
    }
  });

  it("proposta com Segurança automática é recusada antes de gravar", async () => {
    const proposed = await asUser("marina", () =>
      proposeRulesCommand({
        rules: {
          forceReview: true,
          sensitiveTopics: [...DEFAULT_RULES.sensitiveTopics, `x-${mark}`],
          categories: {
            ...DEFAULT_RULES.categories,
            seguranca: { ...DEFAULT_RULES.categories.seguranca!, mode: "auto" },
          },
        },
        justification: "Tentativa",
      }),
    );
    expect(proposed).toMatchObject({ ok: false, error: "invalid" });
  });
});

describe("achado 9 · CSV de auditoria sem dado pessoal", () => {
  it("convite e notas de titular ficam fora da auditoria e do arquivo", async () => {
    const email = `titular-${mark}@exemplo.com`;
    const invite = await asUser("helena", () =>
      inviteUserCommand({ name: `Pessoa ${mark}`, email, role: "leitura" }),
    );
    expect(invite.ok).toBe(true);
    if (!invite.ok) return;
    invitedIds.push(invite.value.userId);
    const req = await asUser("helena", () =>
      savePrivacyRequestCommand({ kind: "access", email: `pedido-${mark}@exemplo.com` }),
    );
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    privacyIds.push(req.value.id);
    const noted = await asUser("helena", () =>
      savePrivacyRequestCommand({
        id: req.value.id,
        notes: `titular ${mark} pediu por telefone 65 99999-0000`,
        status: "in_progress",
      }),
    );
    expect(noted.ok).toBe(true);

    // O que ficou gravado no banco já não tem e-mail nem notas.
    const rows = await service
      .from("audit_log")
      .select("details")
      .in("object_ref", [`user:${invite.value.userId}`, `privacy:${req.value.id}`]);
    const stored = JSON.stringify(rows.data);
    expect(stored).not.toContain(email);
    expect(stored).not.toContain("99999");
    expect(stored).toContain("notesChanged");

    for (const who of ["helena", "diego"] as const) {
      const csv = await asUser(who, () =>
        exportAuditCommand({ filters: { object: "user:" + invite.value.userId } }),
      );
      expect(csv.ok).toBe(true);
      if (!csv.ok) continue;
      expect(csv.value.csv).toContain("user.invite");
      expect(csv.value.csv).not.toContain("@");
      expect(csv.value.csv).not.toContain("Pessoa");
      expect(csv.value.csv.split("\r\n")[0]).toBe("id,quando,ator,acao,objeto,detalhes,ip_hash");
    }
  });
});

describe("achado 11 · exportação além do max_rows do PostgREST", () => {
  it("entrega as 1100 linhas (não 1000) e diz que não truncou", async () => {
    const object = `gate-export-${run}`;
    const batch = Array.from({ length: 1100 }, (_, i) => ({
      actor: "system",
      action: "settings.update",
      object_ref: object,
      details: { n: i },
    }));
    for (let i = 0; i < batch.length; i += 550) {
      const r = await service.from("audit_log").insert(batch.slice(i, i + 550));
      expect(r.error).toBeNull();
    }
    const r = await asUser("helena", () => exportAuditCommand({ filters: { object } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.rows).toBe(1100);
    expect(r.value.truncated).toBe(false);
    expect(r.value.csv.trimEnd().split("\r\n")).toHaveLength(1101);
    expect(r.value.csv).not.toContain("AVISO");
  });
});

describe("achado 13 · publicidade", () => {
  const campaign = (over: Record<string, unknown> = {}) => ({
    advertiser: `Padaria ${mark}`,
    startsOn: "2026-09-01",
    endsOn: "2026-12-31",
    allowedSections: ["cidade"],
    status: "active" as const,
    creative: { title: "Pão quente às 6h", href: "https://padaria.example/promo" },
    ...over,
  });

  it("link e imagem só em https; javascript:, data: e http: são recusados no servidor", async () => {
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,<b>x</b>",
      "http://padaria.example",
    ]) {
      const r = await asUser("marina", () =>
        saveCampaignCommand(campaign({ creative: { title: "Pão", href } })),
      );
      expect(r).toMatchObject({ ok: false, error: "invalid" });
    }
    const img = await asUser("marina", () =>
      saveCampaignCommand(
        campaign({
          creative: {
            title: "Pão",
            href: "https://padaria.example",
            imageUrl: "http://rastreio.example/pixel.gif",
          },
        }),
      ),
    );
    expect(img).toMatchObject({ ok: false, error: "invalid" });
    const ok = await asUser("marina", () => saveCampaignCommand(campaign()));
    expect(ok.ok).toBe(true);
    if (ok.ok) campaignIds.push(ok.value.id);
  });

  it("subeditoria de Política, Segurança ou Saúde também é recusada", async () => {
    const slug = `saude-mental-${mark}`;
    await service
      .from("sections")
      .insert({ slug, name: "Saúde mental", parent_slug: "saude", autonomy_category: "saude" });
    try {
      const r = await asUser("marina", () =>
        saveCampaignCommand(campaign({ allowedSections: ["cidade", slug] })),
      );
      expect(r).toMatchObject({ ok: false, error: "invalid" });
    } finally {
      await service.from("sections").delete().eq("slug", slug);
    }
  });
});

describe("achado 15 · pedido de aprovação alheio não trava a proposta", () => {
  it("cada pessoa reaproveita só o próprio pedido pendente", async () => {
    const target = rulesTarget(9_000_000 + (run % 1000));
    const first = await asUser("diego", () =>
      requestApprovalCommand({
        kind: "rules.activate",
        targetRef: target,
        justification: "reserva",
      }),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    approvalIds.push(first.value.id);
    const mine = await asUser("marina", () =>
      requestApprovalCommand({ kind: "rules.activate", targetRef: target, justification: "meu" }),
    );
    expect(mine.ok).toBe(true);
    if (!mine.ok) return;
    approvalIds.push(mine.value.id);
    expect(mine.value.id).not.toBe(first.value.id);
    expect(mine.value.existing).toBe(false);
    const again = await asUser("marina", () =>
      requestApprovalCommand({ kind: "rules.activate", targetRef: target, justification: "meu" }),
    );
    expect(again.ok && again.value).toEqual({ id: mine.value.id, existing: true });
    expect(APPROVAL_ERROR_TEXT.self_approval).toBeTruthy();
  });
});

describe("achado 17 · redirecionamento com barra invertida", () => {
  it("o banco recusa `/\\host` e `/%5chost` como destino", async () => {
    const marina = await clientOf("marina");
    for (const to of ["/\\evil.example", "/%5cevil.example", "//evil.example"]) {
      const r = await marina
        .from("redirects")
        .insert({ from_path: `/gate-${mark}-a`, to_path: to, kind: 301 });
      expect(r.error).not.toBeNull();
    }
    const ok = await marina
      .from("redirects")
      .insert({ from_path: `/gate-${mark}-b`, to_path: "/materia/nova", kind: 301 });
    expect(ok.error).toBeNull();
  });
});

describe("achado 18 · rascunho da home não é público", () => {
  it("anônimo lê só a versão publicada", async () => {
    const draft = await service
      .from("home_layouts")
      .insert({
        version: 900_000 + (run % 1000),
        modules: [{ id: "topics", enabled: true }] as unknown as NonNullable<Json>,
        status: "draft",
        note: `rascunho interno ${mark}`,
      })
      .select("id")
      .single();
    expect(draft.error).toBeNull();
    try {
      const anon = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const rows = await anon.from("home_layouts").select("version, status, note");
      expect(rows.error).toBeNull();
      expect((rows.data ?? []).every((r) => r.status === "published")).toBe(true);
      expect(JSON.stringify(rows.data)).not.toContain("rascunho interno");
      const marina = await clientOf("marina");
      const staff = await marina.from("home_layouts").select("status").eq("id", draft.data!.id);
      expect(staff.data).toEqual([{ status: "draft" }]);
    } finally {
      await service.from("home_layouts").delete().eq("id", draft.data!.id);
    }
  });
});
