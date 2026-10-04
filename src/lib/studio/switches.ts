import "server-only";
import { z } from "zod";
import { SWITCH_KEYS, SWITCH_TEXT as T } from "@/content/pt-BR/switches";
import { REVIEWER_MODES } from "@/lib/pipeline/steps/auto-reviewer";
import { createFlags } from "@/lib/db/flags-store";
import { StudioFailure, studioAction } from "./action";

/*
 * Interruptores livres (admin): flags sem guarda de aprovação. `auto_publish`, `read_only` e
 * `ai_enabled` continuam pela Contingência (A15), que tem confirmação e efeitos próprios.
 */

export const FREE_SWITCHES = [
  "personalization_enabled",
  "image_reproduction_enabled",
  "source_link_analysis",
  "sponsored_native_enabled",
] as const;

const Input = z.object({
  key: z.enum(FREE_SWITCHES),
  value: z.boolean(),
  reason: z.string().trim().min(1, T.dialog.reasonRequired).max(500),
});
export type SwitchInput = z.infer<typeof Input>;

export const setSwitchCommand = studioAction(
  "users.manage",
  () => ({}),
  async (i: SwitchInput, ctx): Promise<{ changed: boolean }> => {
    ctx.detail({ key: i.key, value: i.value, reason: i.reason });
    const r = await createFlags(ctx.db).setFlag(i.key, i.value, ctx.userId);
    if (!r.ok) {
      if (r.error === "forbidden") throw new StudioFailure("forbidden", T.error.forbidden);
      throw new StudioFailure("conflict", T.error.generic);
    }
    return { changed: r.value.changed };
  },
  {
    schema: Input,
    auditAs: "flag.set",
    objectRef: (i) => `flag:${i.key}`,
    allowReadOnly: true,
  },
);

export const isFreeSwitch = (k: string): k is (typeof FREE_SWITCHES)[number] =>
  (FREE_SWITCHES as readonly string[]).includes(k);
export { SWITCH_KEYS };

/*
 * Disjuntor da publicação automática (AUT-T4, A8): limites editáveis e reset manual (admin). O
 * reset zera a janela de contagem; religar `auto_publish` continua pela Contingência, com duas
 * pessoas.
 */

const LimitsInput = z.object({
  hourly: z.number().int().min(1).max(100_000).optional(),
  daily: z.number().int().min(1).max(1_000_000).optional(),
  reportsPerHour: z.number().int().min(1).max(100_000).optional(),
  aiFailuresPerHour: z.number().int().min(1).max(100_000).optional(),
  reason: z.string().trim().min(1, T.dialog.reasonRequired).max(500),
});
export type BreakerLimitsInput = z.infer<typeof LimitsInput>;

export const setBreakerLimitsCommand = studioAction(
  "users.manage",
  () => ({}),
  async (i: BreakerLimitsInput, ctx): Promise<{ saved: true }> => {
    const { reason, ...limits } = i;
    ctx.detail({ ...limits, reason });
    const { error } = await ctx.db.rpc("publish_breaker_set_limits", {
      p: limits,
      p_ctx: { reason },
    });
    if (error) {
      if (error.code === "42501") throw new StudioFailure("forbidden", T.error.forbidden);
      throw new StudioFailure("conflict", T.error.generic);
    }
    return { saved: true };
  },
  {
    schema: LimitsInput,
    auditAs: "flag.set",
    objectRef: () => "flag:auto_publish",
    allowReadOnly: true,
  },
);

const ResetInput = z.object({ reason: z.string().trim().min(1, T.dialog.reasonRequired).max(500) });

export const resetBreakerCommand = studioAction(
  "users.manage",
  () => ({}),
  async (i: z.infer<typeof ResetInput>, ctx): Promise<{ reset: true }> => {
    ctx.detail({ reason: i.reason });
    const { error } = await ctx.db.rpc("publish_breaker_reset", { p_ctx: { reason: i.reason } });
    if (error) {
      if (error.code === "42501") throw new StudioFailure("forbidden", T.error.forbidden);
      throw new StudioFailure("conflict", T.error.generic);
    }
    return { reset: true };
  },
  {
    schema: ResetInput,
    auditAs: "flag.set",
    objectRef: () => "flag:auto_publish",
    allowReadOnly: true,
  },
);

/*
 * Revisor automático (AUT-T6): modo `off`, `night` ou `always` (admin, com motivo). Mudar o modo
 * não pede segunda pessoa: o revisor só age sobre matéria em revisão vencida, com publicação
 * automática ligada, dentro das regras e do orçamento de IA.
 */

const ModeInput = z.object({
  mode: z.enum(REVIEWER_MODES),
  reason: z.string().trim().min(1, T.dialog.reasonRequired).max(500),
});
export type ReviewerModeInput = z.infer<typeof ModeInput>;

export const setReviewerModeCommand = studioAction(
  "users.manage",
  () => ({}),
  async (i: ReviewerModeInput, ctx): Promise<{ mode: ReviewerModeInput["mode"] }> => {
    ctx.detail({ mode: i.mode, reason: i.reason });
    const { error } = await ctx.db.rpc("ai_reviewer_set_mode", {
      p_mode: i.mode,
      p_ctx: { reason: i.reason },
    });
    if (error) {
      if (error.code === "42501") throw new StudioFailure("forbidden", T.error.forbidden);
      throw new StudioFailure("conflict", T.error.generic);
    }
    return { mode: i.mode };
  },
  {
    schema: ModeInput,
    auditAs: "flag.set",
    objectRef: () => "flag:ai_reviewer",
    allowReadOnly: true,
  },
);
