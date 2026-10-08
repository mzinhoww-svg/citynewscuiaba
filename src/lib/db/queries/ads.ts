import "server-only";
import { parseCreative } from "@/lib/ads/creative";
import type { Campaign } from "@/lib/ads/rules";
import type { AdPlacement } from "@/lib/ads/select";
import { isDisplaySlot, type DisplaySlot } from "@/lib/ads/slots";
import type { DbClient } from "@/lib/db/client";
import type { Result } from "@/lib/result";
import { fetchSponsoredGate } from "./home";
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

/** O que uma lista precisa para intercalar o patrocinado nativo (`withNativeSponsored`). */
export interface NativeSponsored {
  enabled: boolean;
  campaign: Campaign | null;
  maxPerPage: number;
  categoryOf: (slug: string) => string | undefined;
}

const NATIVE_OFF: NativeSponsored = {
  enabled: false,
  campaign: null,
  maxPerPage: 0,
  categoryOf: () => undefined,
};

/**
 * Patrocínio nativo de uma editoria (B-022): só com `sponsored_native_enabled` ligada, lê a
 * campanha ativa que inclui a editoria (view `public_sponsored_campaigns`, 0189; a que termina
 * antes vem primeiro). Peça que não passa na validação tipada fica de fora. Falha fechada:
 * qualquer erro vira "sem patrocinado", e a lista segue como sempre.
 */
export async function fetchNativeSponsored(
  db: DbClient,
  sectionSlug: string,
): Promise<NativeSponsored> {
  try {
    const gate = await fetchSponsoredGate(db);
    if (!gate.enabled) return NATIVE_OFF;
    const rows = await db
      .from("public_sponsored_campaigns")
      .select("id, advertiser, starts_on, ends_on, allowed_sections, creative, max_per_page")
      .contains("allowed_sections", [sectionSlug])
      .order("ends_on", { ascending: true })
      .order("id", { ascending: true })
      .limit(5)
      .then(many);
    for (const r of rows) {
      const c = parseCreative(r.creative);
      if (!c.ok || c.value.kind !== "native" || !r.id || !r.advertiser) continue;
      const { title, href, imageUrl, imageAlt } = c.value;
      return {
        enabled: true,
        categoryOf: gate.categoryOf,
        maxPerPage: r.max_per_page ?? 1,
        campaign: {
          id: r.id,
          advertiser: r.advertiser,
          startsOn: r.starts_on ?? "",
          endsOn: r.ends_on ?? "",
          allowedSections: r.allowed_sections ?? [],
          // A view só devolve campanha ativa no período.
          status: "active",
          creative: {
            kind: "native",
            title,
            href,
            ...(imageUrl ? { imageUrl } : {}),
            ...(imageUrl && imageAlt ? { imageAlt } : {}),
          },
        },
      };
    }
    return { ...NATIVE_OFF, enabled: true, categoryOf: gate.categoryOf };
  } catch {
    return NATIVE_OFF;
  }
}
