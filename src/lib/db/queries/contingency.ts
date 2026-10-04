import "server-only";
import { flagTarget } from "@/lib/approvals/targets";
import type { DbClient } from "@/lib/db/client";
import type { FlagKey, FlagRow } from "@/lib/flags";
import { studioContext } from "@/lib/studio/context";
import { createFlags } from "../flags-store";
import { pendingApprovalsFor, type ApprovalItem } from "./approvals";

/* Leituras da Contingência (A15): flags, quem mudou por último, regras ativa/anterior. */

export interface FlagState extends FlagRow {
  updatedByName: string | null;
}

export interface ContingencyOverview {
  flags: Record<FlagKey, FlagState | null>;
  rules: { active: number | null; previous: number | null };
  /** Pedido aberto para religar a publicação automática. */
  resumeRequests: ApprovalItem[];
}

export async function contingencyOverview(db?: DbClient): Promise<ContingencyOverview> {
  const client = db ?? (await studioContext()).db;
  const [rows, rules, resumeRequests] = await Promise.all([
    createFlags(client).getAll(),
    client
      .from("rules")
      .select("version, active, approved_by, proposed_by")
      .order("version", { ascending: false })
      .limit(50),
    pendingApprovalsFor(flagTarget("auto_publish", true), client),
  ]);
  if (rules.error) throw new Error(`contingency rules: ${rules.error.message}`);
  const ids = [...new Set(rows.map((r) => r.updatedBy).filter((i): i is string => Boolean(i)))];
  const people = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await client.from("profiles").select("id, display_name").in("id", ids);
    for (const p of data ?? []) people.set(p.id, p.display_name);
  }
  const flags = {} as Record<FlagKey, FlagState | null>;
  for (const key of [
    "auto_publish",
    "read_only",
    "ai_enabled",
    "personalization_enabled",
    "image_reproduction_enabled",
    "source_link_analysis",
    "sponsored_native_enabled",
    "ads_enabled",
    "hot_featured_enabled",
  ] as const) {
    const r = rows.find((x) => x.key === key);
    flags[key] = r
      ? { ...r, updatedByName: r.updatedBy ? (people.get(r.updatedBy) ?? null) : null }
      : null;
  }
  const active = (rules.data ?? []).find((r) => r.active)?.version ?? null;
  const previous =
    active === null
      ? null
      : ((rules.data ?? []).find((r) => r.version < active && r.approved_by !== null)?.version ??
        null);
  return { flags, rules: { active, previous }, resumeRequests };
}
