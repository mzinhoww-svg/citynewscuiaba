import { eligibleCandidates } from "@/lib/ads/select";
import type { DisplaySlot } from "@/lib/ads/slots";
import { getSectionCategory, listSlotPlacements } from "@/lib/db/queries/ads";
import { AdSlotClient } from "./AdSlotClient";

export interface AdSlotProps {
  code: DisplaySlot;
  /** Editoria da página (`null` na home). */
  sectionSlug?: string | null;
  /** Categoria de autonomia da editoria (subeditoria de Política, Justiça etc.). */
  sectionCategory?: string | null;
  /** Página urgente: nunca recebe anúncio. */
  urgent?: boolean;
  className?: string;
}

/**
 * Campo de banner (ADS-T1, spec banners-padrão §2/§4). O servidor decide se o campo existe na
 * página (editoria proibida, urgência, período, teto diário); sem peça, o campo colapsa e não
 * deixa espaço em branco. A escolha entre as candidatas é do navegador (`AdSlotClient`).
 */
export async function AdSlot({
  code,
  sectionSlug = null,
  sectionCategory = null,
  urgent = false,
  className,
}: AdSlotProps) {
  const [res, cat] = await Promise.all([
    listSlotPlacements(code),
    sectionSlug && !sectionCategory ? getSectionCategory(sectionSlug) : null,
  ]);
  if (!res.ok) return null;
  const category = sectionCategory ?? (cat?.ok ? cat.value : null);
  const candidates = eligibleCandidates(res.value, {
    slot: code,
    sectionSlug,
    now: new Date(),
    urgent,
    categoryOf: () => category ?? undefined,
  });
  if (candidates.length === 0) return null;
  return (
    <AdSlotClient
      code={code}
      candidates={candidates}
      sectionSlug={sectionSlug}
      className={className}
    />
  );
}
