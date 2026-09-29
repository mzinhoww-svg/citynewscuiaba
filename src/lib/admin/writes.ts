import "server-only";
import { audit } from "@/lib/audit";
import { requestApproval } from "@/lib/approvals";
import { canToggleFlags, canWriteSettings } from "@/lib/admin/access";
import {
  campaignInputSchema,
  validateSettings,
  type SettingKey,
  type CampaignInput,
} from "@/lib/admin/settings";
import type { Json } from "@/lib/db/types";
import { studioContext } from "@/lib/studio/context";

/*
 * Escritas da Administração (P5-T9). Cada função confere o papel, escreve com a sessão da pessoa
 * (a RLS também vale) e audita. Mensagens em pt-BR prontas para a tela; nada de segredo.
 */

export type AdminReply =
  | { ok: true; code: string; message: string }
  | { ok: false; code: "forbidden" | "invalid" | "unavailable"; message: string };

const FORBIDDEN: AdminReply = {
  ok: false,
  code: "forbidden",
  message: "Seu papel não permite esta ação.",
};
const UNAVAILABLE: AdminReply = {
  ok: false,
  code: "unavailable",
  message: "Não foi possível salvar agora. Tente de novo em instantes.",
};

async function who() {
  const ctx = await studioContext();
  return { ctx, session: ctx.session };
}

/* ------------------------------------------------------------------ publicidade */

export async function saveCampaign(input: unknown, id?: string): Promise<AdminReply> {
  const { ctx, session } = await who();
  if (!session || !canWriteSettings(session.roles)) return FORBIDDEN;
  const parsed = campaignInputSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      code: "invalid",
      message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  const c: CampaignInput = parsed.data;
  const row = {
    advertiser: c.advertiser,
    starts_on: c.startsOn,
    ends_on: c.endsOn,
    allowed_sections: c.sections,
    creative: { headline: c.headline, url: c.url } as Json & object,
    updated_by: session.userId,
  };
  const r = id
    ? await ctx.db.from("sponsored_campaigns").update(row).eq("id", id).select("id").maybeSingle()
    : await ctx.db.from("sponsored_campaigns").insert(row).select("id").single();
  if (r.error || !r.data) return UNAVAILABLE;
  await audit(session.userId, "ads.campaign.save", `campaign:${r.data.id}`, {
    advertiser: c.advertiser,
    sections: c.sections,
    created: !id,
  });
  return {
    ok: true,
    code: "campanha",
    message: "Campanha salva. Ela só aparece no portal com o patrocínio ligado e a campanha ativa.",
  };
}

export async function setCampaignActive(id: string, active: boolean): Promise<AdminReply> {
  const { ctx, session } = await who();
  if (!session || !canWriteSettings(session.roles)) return FORBIDDEN;
  const r = await ctx.db
    .from("sponsored_campaigns")
    .update({ active, updated_by: session.userId })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (r.error || !r.data) return UNAVAILABLE;
  await audit(session.userId, "ads.campaign.toggle", `campaign:${id}`, { active });
  return {
    ok: true,
    code: active ? "ativada" : "pausada",
    message: active ? "Campanha ativada." : "Campanha pausada.",
  };
}

/** Flag `sponsored_enabled` (desligada por padrão: B-003). Só admin. */
export async function setSponsoredFlag(enabled: boolean): Promise<AdminReply> {
  const { ctx, session } = await who();
  if (!session) return FORBIDDEN;
  if (!canToggleFlags(session.roles)) {
    await audit(session.userId, "ads.flag.toggle.denied", "flag:sponsored_enabled", {
      enabled,
    }).catch(() => undefined);
    return FORBIDDEN;
  }
  const r = await ctx.db
    .from("feature_flags")
    .update({ enabled, updated_by: session.userId, updated_at: ctx.now().toISOString() })
    .eq("key", "sponsored_enabled")
    .select("key")
    .maybeSingle();
  if (r.error || !r.data) return UNAVAILABLE;
  await audit(session.userId, "ads.flag.toggle", "flag:sponsored_enabled", { enabled });
  return {
    ok: true,
    code: enabled ? "flag_on" : "flag_off",
    message: enabled ? "Patrocínio ligado." : "Patrocínio desligado.",
  };
}

/* ------------------------------------------------------------------ configurações e SEO */

export async function saveSettings(
  input: Partial<Record<string, string>>,
  allowed: readonly SettingKey[],
): Promise<AdminReply & { errors?: Partial<Record<SettingKey, string>> }> {
  const { ctx, session } = await who();
  if (!session || !canWriteSettings(session.roles)) return FORBIDDEN;
  const v = validateSettings(input, allowed);
  if (!v.ok)
    return {
      ok: false,
      code: "invalid",
      message: "Corrija os campos indicados.",
      errors: v.errors,
    };
  const rows = Object.entries(v.values).map(([key, value]) => ({
    key,
    value: value as string,
    updated_by: session.userId,
    updated_at: ctx.now().toISOString(),
  }));
  if (rows.length === 0) return { ok: false, code: "invalid", message: "Nada para salvar." };
  const r = await ctx.db.from("site_settings").upsert(rows, { onConflict: "key" });
  if (r.error) return UNAVAILABLE;
  await audit(session.userId, "settings.update", "site_settings", { keys: rows.map((x) => x.key) });
  return { ok: true, code: "settings", message: "Configurações salvas." };
}

/* ------------------------------------------------------------------ notificações */

export type PushSendResult = "queued" | "approval_required" | "forbidden" | "not_found";

/**
 * Envia um push urgente para a fila. Só passa com uma aprovação `push.urgent` (outra pessoa,
 * até 24 h, ainda não usada); o banco confere e audita (`push.send`, ou `.denied`).
 */
export async function sendUrgentPush(articleId: string): Promise<PushSendResult> {
  const { ctx, session } = await who();
  if (!session) return "forbidden";
  const { data, error } = await ctx.db.rpc("push_urgent_dispatch", { p_article: articleId });
  if (error) {
    if (error.code === "42501") return "forbidden";
    if (error.code === "22P02") return "not_found";
    throw new Error(`push: ${error.message}`);
  }
  switch (data) {
    case "queued":
    case "approval_required":
    case "forbidden":
    case "not_found":
      return data;
    default:
      throw new Error(`push: resposta inesperada do banco (${String(data)})`);
  }
}

/** Pede a aprovação `push.urgent` da matéria (segunda pessoa decide em Aprovações). */
export function requestPushApproval(articleId: string, justification: string) {
  return requestApproval({ kind: "push.urgent", targetRef: articleId, justification });
}

/* ------------------------------------------------------------------ segurança */

export async function clearLoginBlocks(): Promise<AdminReply> {
  const { ctx, session } = await who();
  if (!session || !canToggleFlags(session.roles)) return FORBIDDEN;
  const { data, error } = await ctx.db.rpc("admin_clear_login_blocks");
  if (error) return error.code === "42501" ? FORBIDDEN : UNAVAILABLE;
  return {
    ok: true,
    code: "liberado",
    message: `Bloqueios de login liberados (${data ?? 0} registros).`,
  };
}
