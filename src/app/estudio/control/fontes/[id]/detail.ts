import "server-only";
import { cache } from "react";
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
