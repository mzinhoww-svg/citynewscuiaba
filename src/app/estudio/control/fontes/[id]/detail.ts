import "server-only";
import { cache } from "react";
import { fullDateTime, STATUS_REASON_TEXT } from "@/content/pt-BR/sources-admin";
import { DETAIL_TEXT as T } from "@/content/pt-BR/sources-admin-detail";
import { sourceDetail, type SourceDetail } from "@/lib/db/queries/sources-admin";
import type { QueryError } from "@/lib/db/queries/types";
import type { Result } from "@/lib/result";

export const BASE = "/estudio/control/fontes";

/** Leitura da fonte deduplicada entre o layout e a página da mesma requisição. */
export const loadSource = cache((id: string): Promise<Result<SourceDetail | null, QueryError>> =>
  sourceDetail(id),
);

export const detailPath = (id: string, sub = "") => `${BASE}/${id}${sub}`;

/** URL pública do logotipo no bucket `source-logos` (só a partir do caminho gravado). */
export function logoUrlOf(path: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/source-logos/${path}`;
}

/** Status com motivo em texto (spec §8: "Pausada automaticamente em 27/09 14:30 após 3 falhas"). */
export function statusLine(d: SourceDetail): string {
  const when = d.statusChangedAt ? fullDateTime(d.statusChangedAt) : null;
  if (d.archivedAt) return T.status.archived(fullDateTime(d.archivedAt), d.archiveReason);
  if (d.status === "active") return T.status.active;
  if (d.status === "degraded") return T.status.degraded(d.consecutiveFailures);
  if (d.status === "blocked")
    return T.status.blocked(
      d.statusReason ? STATUS_REASON_TEXT[d.statusReason] : STATUS_REASON_TEXT.other,
    );
  if (d.statusReason === "pending_activation") return T.status.pendingActivation;
  if (d.statusReason === "auto_failures")
    return when ? T.status.auto(when) : STATUS_REASON_TEXT.auto_failures;
  if (d.statusReason === "robots") return T.status.robots;
  return when ? T.status.manual(when, d.statusChangedBy?.name ?? null) : T.status.manualNoDate;
}
