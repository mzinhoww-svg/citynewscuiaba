import "server-only";
import { z } from "zod";
import {
  ACTION_NAME,
  CONTINGENCY_ACTIONS,
  CONTINGENCY_TEXT as T,
  type ContingencyAction,
} from "@/content/pt-BR/contingency";
import { RULE_RATIONALE } from "@/content/pt-BR/rules";
import { flagTarget } from "@/lib/approvals/targets";
import { audit } from "@/lib/audit";
import { createFlags } from "@/lib/db/flags-store";
import type { FlagKey } from "@/lib/flags";
import { StudioFailure, studioAction } from "./action";
import { requestApprovalCommand } from "./approvals";

/*
 * Contingência (A15, P5-T10): cada botão é uma ação de admin (`users.manage`) confirmada
 * digitando o nome da ação, com motivo, auditada (`flag.set` / `rules.rollback`) e válida mesmo
 * em modo leitura (senão ninguém sairia dele). Pausar a publicação automática no meio de um
 * ciclo manda os itens restantes para revisão (`contingency_pause_cycle`, Review Focus 4).
 * Religar a publicação automática é mudança crítica: abre pedido `safety.disable`.
 */

const Input = z.object({
  action: z.enum(CONTINGENCY_ACTIONS),
  typed: z.string().trim(),
  reason: z.string().trim().min(1, T.dialog.reasonRequired).max(500),
});
export type ContingencyInput = z.infer<typeof Input>;

export type ContingencyOutcome =
  | { action: "pause_auto_publish"; changed: boolean; movedToReview: number }
  | { action: "resume_auto_publish"; approvalId: string; existing: boolean }
  | { action: "read_only_on" | "read_only_off" | "ai_off" | "ai_on"; changed: boolean }
  | { action: "rollback_rules"; from: number; to: number };

const FLAG_OF: Partial<Record<ContingencyAction, { key: FlagKey; value: boolean }>> = {
  pause_auto_publish: { key: "auto_publish", value: false },
  read_only_on: { key: "read_only", value: true },
  read_only_off: { key: "read_only", value: false },
  ai_off: { key: "ai_enabled", value: false },
  ai_on: { key: "ai_enabled", value: true },
};

export const contingencyCommand = studioAction(
  "users.manage",
  () => ({}),
  async (i: ContingencyInput, ctx): Promise<ContingencyOutcome> => {
    if (i.typed !== ACTION_NAME[i.action]) throw new StudioFailure("invalid", T.error.typed);
    ctx.detail({ action: i.action, reason: i.reason });

    if (i.action === "resume_auto_publish") {
      const r = await requestApprovalCommand({
        kind: "safety.disable",
        targetRef: flagTarget("auto_publish", true),
        justification: i.reason,
        details: { contingency: i.action },
      });
      if (!r.ok) throw new StudioFailure(r.error, r.message ?? T.error.generic);
      ctx.detail({ approvalId: r.value.id, existing: r.value.existing });
      return { action: i.action, approvalId: r.value.id, existing: r.value.existing };
    }

    if (i.action === "rollback_rules") {
      const { data, error } = await ctx.db.rpc("rules_rollback");
      if (error) {
        if (error.code === "P0002") throw new StudioFailure("conflict", T.error.no_previous);
        if (error.code === "42501" && /afrouxa/.test(error.message))
          throw new StudioFailure("conflict", T.error.rollback_loosens);
        if (error.code === "42501") throw new StudioFailure("forbidden", T.error.forbidden);
        throw new Error(`rules_rollback: ${error.message}`);
      }
      const out = data as { from?: number; to?: number } | null;
      const from = Number(out?.from ?? 0);
      const to = Number(out?.to ?? 0);
      ctx.setObjectRef(`rules:${to}`);
      ctx.detail({ from, to });
      await audit(
        ctx.userId,
        "rules.rollback",
        `rules:${to}`,
        { from, to, reason: i.reason },
        ctx.db,
      );
      return { action: i.action, from, to };
    }

    const flag = FLAG_OF[i.action]!;
    const flags = createFlags(ctx.db);
    const r = await flags.setFlag(flag.key, flag.value, ctx.userId);
    if (!r.ok) {
      if (r.error === "forbidden") throw new StudioFailure("forbidden", T.error.forbidden);
      if (r.error === "needs_approval") throw new StudioFailure("conflict", T.error.needs_approval);
      throw new StudioFailure("conflict", T.error.generic);
    }
    ctx.detail({ key: flag.key, value: flag.value, changed: r.value.changed });

    if (i.action === "pause_auto_publish") {
      // Itens do ciclo em andamento que as regras já mandaram publicar vão para revisão.
      const { data, error } = await ctx.db.rpc("contingency_pause_cycle", {
        p_reason: `${RULE_RATIONALE.autoPublishOff()} Motivo: ${i.reason}`,
      });
      if (error) throw new Error(`contingency_pause_cycle: ${error.message}`);
      const moved = Number(data ?? 0);
      ctx.detail({ movedToReview: moved });
      return { action: i.action, changed: r.value.changed, movedToReview: moved };
    }
    return { action: i.action, changed: r.value.changed };
  },
  {
    schema: Input,
    auditAs: "flag.set",
    objectRef: (i) => `contingency:${i.action}`,
    allowReadOnly: true,
  },
);
