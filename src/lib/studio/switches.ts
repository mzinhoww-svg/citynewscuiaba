import "server-only";
import { z } from "zod";
import { SWITCH_KEYS, SWITCH_TEXT as T } from "@/content/pt-BR/switches";
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
