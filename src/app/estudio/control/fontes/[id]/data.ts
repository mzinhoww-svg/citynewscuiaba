import "server-only";
import { cache } from "react";
import { createSourceAdminStore } from "@/lib/db/source-admin-store";
import { sourceDetail } from "@/lib/db/queries/sources-admin";
import { studioContext } from "@/lib/studio/context";
import { isUuid } from "@/lib/sources/form";

/*
 * Leituras compartilhadas das telas Nova fonte e Fonte (FS-T8). `cache` do React evita repetir a
 * consulta da fonte entre o layout e a página da mesma requisição.
 */

export const NEXT = "/estudio/control/fontes";
export { isUuid };

export const getDetail = cache((id: string) => sourceDetail(id));

/** Editorias existentes (slug e nome), para o campo Editorias. */
export async function loadSections(): Promise<{ slug: string; label: string }[]> {
  const { db } = await studioContext();
  const { data, error } = await db.from("sections").select("slug, name").order("name");
  if (error) throw new Error(`editorias: ${error.message}`);
  return (data ?? []).map((s) => ({ slug: s.slug, label: s.name }));
}

/** Vagas da via rápida em uso e o limite. */
export async function loadFastLane(): Promise<{ used: number; max: number }> {
  const { db } = await studioContext();
  const lane = await createSourceAdminStore(db).fastLane();
  return { used: lane.used, max: lane.max };
}

/** Frequência padrão global (`app_settings`). */
export async function loadDefaultMinutes(): Promise<number> {
  const { db } = await studioContext();
  return createSourceAdminStore(db).defaultFrequency();
}

/** Endereço público do logotipo no bucket `source-logos`; `null` sem logotipo ou sem Supabase. */
export function logoUrlOf(path: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/source-logos/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/** Marcas de recomendação da fonte (não fazem parte de `sourceDetail`). */
export async function loadRecFlags(
  id: string,
): Promise<{ pinned: boolean; localHighlight: boolean; excluded: boolean } | null> {
  const { db } = await studioContext();
  const { data, error } = await db
    .from("sources")
    .select("rec_pinned, rec_local_highlight, rec_excluded")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`fonte (recomendação): ${error.message}`);
  return data
    ? {
        pinned: data.rec_pinned,
        localHighlight: data.rec_local_highlight,
        excluded: data.rec_excluded,
      }
    : null;
}

/** Cabeçalhos de cache da última resposta e configuração de descoberta (aba Coleta). */
export async function loadCollectionInfo(id: string): Promise<{
  hasValidators: boolean;
  everFetched: boolean;
  tried: number | null;
  discoveredAt: string | null;
  discoveredBy: string | null;
  inputUrl: string | null;
} | null> {
  const { db } = await studioContext();
  const { data, error } = await db
    .from("sources")
    .select("etag, last_modified, last_fetched_at, consumption")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`fonte (coleta): ${error.message}`);
  if (!data) return null;
  const c = data.consumption;
  const cons = typeof c === "object" && c !== null && !Array.isArray(c) ? c : {};
  const d = (cons as { discovery?: Record<string, unknown> }).discovery;
  return {
    hasValidators: Boolean(data.etag) || Boolean(data.last_modified),
    everFetched: data.last_fetched_at !== null,
    tried: typeof d?.tried === "number" ? d.tried : null,
    discoveredAt: typeof d?.at === "string" ? d.at : null,
    discoveredBy: typeof d?.by === "string" ? d.by : null,
    inputUrl: typeof d?.inputUrl === "string" ? d.inputUrl : null,
  };
}
