import "server-only";
import { parseCreative } from "@/lib/ads/creative";
import type { AdPlacement } from "@/lib/ads/select";
import { isDisplaySlot, type DisplaySlot } from "@/lib/ads/slots";
import type { Result } from "@/lib/result";
import { many, readPublic } from "./run";
import type { QueryError } from "./types";

/** Campos de banner: 60 s de cache, tag `ads` (o Estúdio invalida ao salvar). */
export const ADS_REVALIDATE = 60;

/**
 * Veiculações ativas de um campo (view `public_ad_placements`, 0082). Peça que não passa na
 * validação tipada fica de fora (nunca vai ao ar quebrada).
 */
export async function listSlotPlacements(
  slot: DisplaySlot,
): Promise<Result<AdPlacement[], QueryError>> {
  return readPublic(
    async (db) => {
      const rows = await db
        .from("public_ad_placements")
        .select(
          "id, slot, creative, starts_on, ends_on, allowed_sections, weight, max_impressions_per_day, is_house, impressions_today",
        )
        .eq("slot", slot)
        .then(many);
      return rows.flatMap((r): AdPlacement[] => {
        const c = parseCreative(r.creative);
        if (!c.ok || c.value.kind !== "display" || !r.id || !r.slot || !isDisplaySlot(r.slot))
          return [];
        if (c.value.slot !== r.slot) return [];
        return [
          {
            id: r.id,
            slot: r.slot,
            creative: c.value,
            startsOn: r.starts_on ?? "",
            endsOn: r.ends_on ?? "",
            allowedSections: r.allowed_sections ?? [],
            weight: r.weight ?? 1,
            maxImpressionsPerDay: r.max_impressions_per_day ?? null,
            impressionsToday: r.impressions_today ?? 0,
            isHouse: r.is_house ?? false,
          },
        ];
      });
    },
    { tags: ["ads"], revalidate: ADS_REVALIDATE },
  );
}

/** Categoria de autonomia da editoria (subeditoria herda a proibição). */
export async function getSectionCategory(slug: string): Promise<Result<string | null, QueryError>> {
  return readPublic(
    async (db) => {
      const { data } = await db
        .from("sections")
        .select("autonomy_category")
        .eq("slug", slug)
        .maybeSingle();
      return data?.autonomy_category ?? null;
    },
    { tags: ["sections"], revalidate: 600 },
  );
}
