/**
 * Seleção da peça de um campo de banner (ADS-T1, spec banners-padrão §3/§4). Puro: o servidor
 * filtra as candidatas (`eligibleCandidates`) e o navegador escolhe uma (`pickCandidate`) com a
 * chave da sessão, para a rotação ser estável por sessão sem cookie no HTML em cache.
 */
import type { DisplayCreative } from "./creative";
import { isNeverSection } from "./rules";
import { SLOT_FORMATS, type Device, type DisplaySlot } from "./slots";

export interface AdPlacement {
  id: string;
  slot: DisplaySlot;
  creative: DisplayCreative;
  startsOn: string;
  endsOn: string;
  /** Vazio: todas as editorias (e a home), menos as proibidas; com lista, só essas editorias. */
  allowedSections: readonly string[];
  weight: number;
  maxImpressionsPerDay: number | null;
  impressionsToday: number;
  /** Peça do próprio CityNews: só entra quando o campo não tem peça paga. */
  isHouse: boolean;
}

export interface SelectContext {
  slot: DisplaySlot;
  /** Editoria da página (a home e páginas sem editoria são `null`). */
  sectionSlug: string | null;
  now: Date;
  /** Matéria ou página urgente: nunca recebe anúncio. */
  urgent?: boolean;
  /** Categoria de autonomia (`sections.autonomy_category`), para subeditorias. */
  categoryOf?: (slug: string) => string | undefined;
}

function live(p: AdPlacement, day: string): boolean {
  return p.startsOn <= day && day <= p.endsOn;
}

/**
 * Candidatas do campo na página: período, editoria permitida, teto diário. Editoria proibida
 * (Política, Justiça, Segurança, Saúde e subeditorias) ou página urgente: nenhuma, nem a da
 * casa. Havendo peça paga, a da casa sai.
 */
export function eligibleCandidates(
  placements: readonly AdPlacement[],
  ctx: SelectContext,
): AdPlacement[] {
  if (ctx.urgent) return [];
  if (ctx.sectionSlug && isNeverSection(ctx.sectionSlug, ctx.categoryOf)) return [];
  const day = ctx.now.toISOString().slice(0, 10);
  const ok = placements.filter(
    (p) =>
      p.slot === ctx.slot &&
      live(p, day) &&
      (p.maxImpressionsPerDay === null || p.impressionsToday < p.maxImpressionsPerDay) &&
      // Peça segmentada só nas editorias dela; páginas sem editoria (home) só recebem as gerais.
      (p.allowedSections.length === 0 ||
        (ctx.sectionSlug !== null && p.allowedSections.includes(ctx.sectionSlug))),
  );
  const paid = ok.filter((p) => !p.isHouse);
  return paid.length > 0 ? paid : ok;
}

/**
 * Formato do campo naquele aparelho: o primeiro do catálogo que tem peça entre as candidatas.
 * Um só por aparelho, para a altura reservada no HTML ser exatamente a da peça (CLS 0).
 */
export function formatFor(
  slot: DisplaySlot,
  device: Device,
  candidates: readonly AdPlacement[],
): { width: number; height: number } | null {
  for (const f of SLOT_FORMATS[slot]) {
    if (!f.devices.includes(device)) continue;
    if (candidates.some((c) => c.creative.width === f.width && c.creative.height === f.height))
      return { width: f.width, height: f.height };
  }
  return null;
}

/** FNV-1a de 32 bits: estável, sem dependência, roda no navegador. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Escolhe uma candidata do aparelho, pelo peso, sempre a mesma para a mesma sessão. */
export function pickCandidate(
  candidates: readonly AdPlacement[],
  opts: { sessionKey: string; device: Device },
): AdPlacement | null {
  const first = candidates[0];
  if (!first) return null;
  const f = formatFor(first.slot, opts.device, candidates);
  if (!f) return null;
  const list = candidates.filter(
    (c) => c.creative.width === f.width && c.creative.height === f.height,
  );
  if (list.length === 0) return null;
  const total = list.reduce((s, c) => s + Math.max(1, c.weight), 0);
  let point = (hash(`${opts.sessionKey}:${list[0]!.slot}`) / 2 ** 32) * total;
  for (const c of list) {
    point -= Math.max(1, c.weight);
    if (point < 0) return c;
  }
  return list[list.length - 1]!;
}
