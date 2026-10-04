import "server-only";
import type { DbClient } from "@/lib/db/client";
import {
  DEFAULT_REVIEWER_MODE,
  isReviewerMode,
  type ReviewerMode,
} from "@/lib/pipeline/steps/auto-reviewer";
import { studioContext } from "@/lib/studio/context";

export interface ReviewerSettings {
  mode: ReviewerMode;
  updatedAt: string | null;
  updatedByName: string | null;
}

/** Modo do revisor automático e quem mudou por último (Interruptores, admin). */
export async function reviewerSettings(db?: DbClient): Promise<ReviewerSettings> {
  const client = db ?? (await studioContext()).db;
  const { data, error } = await client
    .from("ai_reviewer_settings")
    .select("mode, updated_by, updated_at")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(`revisor: ${error.message}`);
  let name: string | null = null;
  if (data?.updated_by) {
    const p = await client
      .from("profiles")
      .select("display_name")
      .eq("id", data.updated_by)
      .maybeSingle();
    name = p.data?.display_name ?? null;
  }
  return {
    mode: isReviewerMode(data?.mode) ? data.mode : DEFAULT_REVIEWER_MODE,
    updatedAt: data?.updated_by ? (data.updated_at ?? null) : null,
    updatedByName: name,
  };
}
