import "server-only";
import { z } from "zod";
import { ADMIN_OPS_TEXT as T } from "@/content/pt-BR/admin-ops";
import { auditCsv, collectAuditRows, type AuditFilters } from "@/lib/admin/audit-export";
import { isNeverSection } from "@/lib/ads/rules";
import { audit } from "@/lib/audit";
import { canAccess, type Action } from "@/lib/auth/permissions";
import type { Json } from "@/lib/db/types";
import { listRedirects, searchAudit } from "@/lib/db/queries/admin-ops";
import { validateRedirect } from "@/lib/seo/redirects";
import { StudioFailure, studioAction, type StudioResult } from "./action";
import { studioContext } from "./context";
import { isReadOnly, READ_ONLY_MESSAGE } from "./read-only";

/*
 * Comandos da Administração, parte 2 (P5-T9): publicidade e SEO (`site.manage`), exportação da
 * auditoria (`audit.view`, IP mascarado para quem não é admin), pedidos LGPD e rotação de chaves
 * (`users.manage`) e configurações (papel por chave, conferido de novo por `app_setting_set`).
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SECTION = /^[a-z0-9-]+$/;
const HTTPS = /^https:\/\//i;

// ---------------------------------------------------------------------------
// Publicidade
// ---------------------------------------------------------------------------
const CampaignInput = z.object({
  id: z.string().uuid().optional(),
  advertiser: z.string().trim().min(2).max(80),
  startsOn: z.string().regex(DAY),
  endsOn: z.string().regex(DAY),
  allowedSections: z.array(z.string().regex(SECTION)).min(1).max(20),
  status: z.enum(["draft", "active", "paused", "ended"]),
  creative: z.object({
    title: z.string().trim().min(2).max(120),
    // Só https: `javascript:`, `data:` e `http:` nunca entram (o formulário também confere).
    href: z.string().trim().url().max(500).regex(HTTPS, "O link precisa começar com https://"),
    imageUrl: z
      .string()
      .trim()
      .url()
      .max(500)
      .regex(HTTPS, "A imagem precisa ser um endereço https://")
      .optional(),
    imageAlt: z.string().trim().max(200).optional(),
  }),
});
export type CampaignInput = z.input<typeof CampaignInput>;

export const saveCampaignCommand = studioAction(
  "site.manage",
  () => ({}),
  async (i, ctx) => {
    // Subeditoria herda a proibição: confere a categoria de autonomia de cada editoria escolhida.
    const cats = await ctx.db
      .from("sections")
      .select("slug, autonomy_category")
      .in("slug", i.allowedSections);
    if (cats.error) throw new Error(`campaign sections: ${cats.error.message}`);
    const categoryOf = (slug: string) => cats.data?.find((c) => c.slug === slug)?.autonomy_category;
    if (i.allowedSections.some((s) => isNeverSection(s, categoryOf)))
      throw new StudioFailure("invalid", T.ads.dialog.forbiddenSection);
    if (i.endsOn < i.startsOn) throw new StudioFailure("invalid", T.ads.dialog.period);
    const creative: Record<string, string> = { title: i.creative.title, href: i.creative.href };
    if (i.creative.imageUrl) {
      creative.imageUrl = i.creative.imageUrl;
      creative.imageAlt = i.creative.imageAlt ?? "";
    }
    const row = {
      advertiser: i.advertiser,
      starts_on: i.startsOn,
      ends_on: i.endsOn,
      allowed_sections: i.allowedSections,
      status: i.status,
      creative: creative as NonNullable<Json>,
      updated_at: new Date().toISOString(),
    };
    const saved = i.id
      ? await ctx.db
          .from("sponsored_campaigns")
          .update(row)
          .eq("id", i.id)
          .select("id")
          .maybeSingle()
      : await ctx.db
          .from("sponsored_campaigns")
          .insert({ ...row, created_by: ctx.userId })
          .select("id")
          .single();
    if (saved.error) {
      if (saved.error.code === "23514")
        throw new StudioFailure("invalid", T.ads.dialog.forbiddenSection);
      throw new Error(`campaign: ${saved.error.message}`);
    }
    if (!saved.data) throw new StudioFailure("not_found");
    ctx.setObjectRef(`campaign:${saved.data.id}`);
    ctx.detail({
      advertiser: i.advertiser,
      status: i.status,
      sections: i.allowedSections,
      period: [i.startsOn, i.endsOn],
    });
    await ctx.revalidate(["home"]);
    return { id: saved.data.id };
  },
  { schema: CampaignInput, auditAs: "ads.campaign.save" },
);

export const deleteCampaignCommand = studioAction(
  "site.manage",
  () => ({}),
  async (i: { id: string }, ctx) => {
    const { data, error } = await ctx.db
      .from("sponsored_campaigns")
      .delete()
      .eq("id", i.id)
      .select("advertiser");
    if (error) throw new Error(`campaign delete: ${error.message}`);
    if (!data?.length) throw new StudioFailure("not_found");
    ctx.detail({ advertiser: data[0]!.advertiser });
    await ctx.revalidate(["home"]);
    return {};
  },
  {
    schema: z.object({ id: z.string().uuid() }),
    auditAs: "ads.campaign.delete",
    objectRef: (i) => `campaign:${i.id}`,
  },
);

// ---------------------------------------------------------------------------
// SEO: redirecionamentos
// ---------------------------------------------------------------------------
const RedirectInput = z.object({
  fromPath: z.string().trim().min(2).max(300),
  toPath: z.string().trim().min(1).max(300),
  kind: z.union([z.literal(301), z.literal(302)]),
  reason: z.string().trim().max(300).optional(),
});
export type RedirectInput = z.input<typeof RedirectInput>;

export const saveRedirectCommand = studioAction(
  "site.manage",
  () => ({}),
  async (i, ctx) => {
    const existing = await listRedirects(ctx.db);
    const v = validateRedirect(i, existing);
    if (!v.ok) throw new StudioFailure("invalid", T.seo.dialog.errors[v.error]);
    const r = await ctx.db
      .from("redirects")
      .insert({
        from_path: v.value.fromPath,
        to_path: v.value.toPath,
        kind: i.kind,
        reason: i.reason ?? "",
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (r.error) {
      if (r.error.code === "23505") throw new StudioFailure("conflict", T.seo.dialog.errors.exists);
      throw new Error(`redirect: ${r.error.message}`);
    }
    ctx.setObjectRef(`redirect:${r.data.id}`);
    ctx.detail({ from: v.value.fromPath, to: v.value.toPath, kind: i.kind });
    await ctx.revalidate(["redirects"]);
    return { id: r.data.id, ...v.value };
  },
  { schema: RedirectInput, auditAs: "seo.redirect.save" },
);

export const deleteRedirectCommand = studioAction(
  "site.manage",
  () => ({}),
  async (i: { id: string }, ctx) => {
    const { data, error } = await ctx.db
      .from("redirects")
      .delete()
      .eq("id", i.id)
      .select("from_path");
    if (error) throw new Error(`redirect delete: ${error.message}`);
    if (!data?.length) throw new StudioFailure("not_found");
    ctx.detail({ from: data[0]!.from_path });
    await ctx.revalidate(["redirects"]);
    return {};
  },
  {
    schema: z.object({ id: z.string().uuid() }),
    auditAs: "seo.redirect.delete",
    objectRef: (i) => `redirect:${i.id}`,
  },
);

// ---------------------------------------------------------------------------
// Auditoria: exportação
// ---------------------------------------------------------------------------
export const EXPORT_LIMIT = 5000;
/** Tamanho de página da leitura: o PostgREST corta em `max_rows` (1000 no config.toml). */
const EXPORT_PAGE = 1000;

/**
 * CSV dos registros filtrados; IP mascarado (`a.b.x.x`), hash oculto e ator pseudonimizado para
 * quem não é admin. Lê por páginas (`id` decrescente) até `EXPORT_LIMIT` e uma linha a mais para
 * saber se parou no limite: a resposta, o arquivo e a auditoria dizem quando foi truncada.
 */
export const exportAuditCommand = studioAction(
  "audit.view",
  () => ({}),
  async (i: { filters: AuditFilters }, ctx) => {
    const admin = ctx.session!.roles.some((r) => r.role === "admin");
    const { rows, truncated } = await collectAuditRows(
      (o) => searchAudit(i.filters, { ...o, maskIp: !admin }, ctx.db),
      EXPORT_LIMIT,
      EXPORT_PAGE,
    );
    ctx.detail({ filters: i.filters, rows: rows.length, masked: !admin, truncated });
    return {
      csv: auditCsv(rows, { maskIp: !admin, ...(truncated ? { truncatedAt: EXPORT_LIMIT } : {}) }),
      rows: rows.length,
      masked: !admin,
      truncated,
    };
  },
  { auditAs: "audit.export", objectRef: () => "audit:export" },
);

// ---------------------------------------------------------------------------
// Segurança: pedidos LGPD e chaves
// ---------------------------------------------------------------------------
const PrivacyInput = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["access", "delete", "rectify", "portability"]).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  notes: z.string().trim().max(1000).optional(),
  status: z.enum(["open", "in_progress", "done", "rejected"]).optional(),
});
export type PrivacyInput = z.input<typeof PrivacyInput>;

export const savePrivacyRequestCommand = studioAction(
  "users.manage",
  () => ({}),
  async (i, ctx) => {
    if (i.id) {
      const patch: { status?: string; decided_by?: string; decided_at?: string; notes?: string } =
        {};
      if (i.status) {
        patch.status = i.status;
        if (i.status === "done" || i.status === "rejected") {
          patch.decided_by = ctx.userId;
          patch.decided_at = new Date().toISOString();
        }
      }
      // Notas livres de titular não vão para a auditoria (imutável): só que mudaram.
      const detail = { ...patch };
      if (i.notes !== undefined) patch.notes = i.notes;
      const r = await ctx.db
        .from("privacy_requests")
        .update(patch)
        .eq("id", i.id)
        .select("id")
        .maybeSingle();
      if (r.error) throw new Error(`privacy: ${r.error.message}`);
      if (!r.data) throw new StudioFailure("not_found");
      ctx.detail({ ...detail, ...(i.notes !== undefined ? { notesChanged: true } : {}) });
      return { id: i.id };
    }
    if (!i.kind || !i.email) throw new StudioFailure("invalid");
    const r = await ctx.db
      .from("privacy_requests")
      .insert({ kind: i.kind, email: i.email, notes: i.notes ?? "", created_by: ctx.userId })
      .select("id")
      .single();
    if (r.error) throw new Error(`privacy: ${r.error.message}`);
    ctx.setObjectRef(`privacy:${r.data.id}`);
    // O e-mail de quem pediu não vai para a auditoria (dado pessoal): só tipo e id.
    ctx.detail({ kind: i.kind });
    return { id: r.data.id };
  },
  {
    schema: PrivacyInput,
    auditAs: "privacy.request.save",
    objectRef: (i) => `privacy:${i.id ?? "new"}`,
  },
);

export const rotateKeyCommand = studioAction(
  "users.manage",
  () => ({}),
  async (i: { key: string }, ctx) => {
    const { data, error } = await ctx.db
      .from("integration_keys")
      .update({ rotated_at: new Date().toISOString(), rotated_by: ctx.userId })
      .eq("key", i.key)
      .select("key");
    if (error) throw new Error(`key: ${error.message}`);
    if (!data?.length) throw new StudioFailure("not_found");
    return { key: i.key };
  },
  {
    schema: z.object({ key: z.string().regex(/^[A-Z][A-Z0-9_]{2,60}$/) }),
    auditAs: "security.key.rotate",
    objectRef: (i) => `key:${i.key}`,
  },
);

// ---------------------------------------------------------------------------
// Configurações (o RPC audita `settings.update` com o valor anterior e o novo)
// ---------------------------------------------------------------------------
const SETTING_ACTION: Record<string, Action> = {
  "sources.default_frequency_minutes": "source.manage",
  "sources.fast_lane_max": "source.manage",
  "seo.title_template": "site.manage",
  "ads.max_per_page": "site.manage",
  "security.session_hours": "users.manage",
  "security.retention_days": "users.manage",
  "security.require_2fa": "users.manage",
};
export const SETTING_KEYS = Object.keys(SETTING_ACTION);

export async function setSettingCommand(i: {
  key: string;
  value: Json;
  reason?: string;
}): Promise<StudioResult<{ key: string }>> {
  const ctx = await studioContext();
  const session = ctx.session;
  if (!session) return { ok: false, error: "forbidden" };
  const action = SETTING_ACTION[i.key];
  if (!action) return { ok: false, error: "invalid" };
  if (!canAccess(session.roles, action)) {
    await audit(session.userId, "settings.update.denied", `setting:${i.key}`, {}, ctx.db);
    return { ok: false, error: "forbidden" };
  }
  if (await isReadOnly(ctx.db)) return { ok: false, error: "conflict", message: READ_ONLY_MESSAGE };
  const { error } = await ctx.db.rpc("app_setting_set", {
    p_key: i.key,
    p_value: i.value as NonNullable<Json>,
    p_ctx: { reason: i.reason ?? "" },
  });
  if (error) {
    if (error.code === "23514") return { ok: false, error: "invalid", message: T.settings.invalid };
    if (error.code === "42501") return { ok: false, error: "forbidden" };
    if (error.code === "22023") return { ok: false, error: "invalid" };
    throw new Error(`setting: ${error.message}`);
  }
  return { ok: true, value: { key: i.key } };
}
