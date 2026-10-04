import { pickAutomaticDetailed } from "./score";
import type { Candidate, FeaturedSource, Pin, Resolved, Slot } from "./types";

export interface ResolveInput {
  slot: Slot;
  /** Editoria da posição (`editoria.lead`); ausente nas demais. */
  section?: string;
  pins: readonly Pin[];
  /** Matérias publicadas que podem disputar (inclui as pinadas, para trazer os dados delas). */
  candidates: readonly Candidate[];
  now: Date;
  /** Regra de elegibilidade de fora (publicada, escopo regional). */
  eligible: (articleId: string) => boolean;
  /** Pauta quente (HOT, ainda vazia): ocupa as vagas entre o manual e o automático. */
  hot?: readonly Candidate[];
}

function activePin(p: Pin, slot: Slot, section: string | undefined, now: Date): boolean {
  return (
    p.slotKey === slot.key &&
    p.sectionSlug === (section ?? null) &&
    p.endedAt === null &&
    p.startsAt.getTime() <= now.getTime() &&
    (p.endsAt === null || now.getTime() < p.endsAt.getTime())
  );
}

/**
 * Quem ocupa a posição agora. Precedência (R8): pino manual > pauta quente > automático por
 * janela. Matéria que não pode aparecer (saiu do ar, patrocinada, sem capa aprovada) é pulada
 * e a vaga cai para o próximo; nunca vira erro de página.
 */
export function resolveSlot(input: ResolveInput): Resolved {
  const { slot, now, eligible } = input;
  const byId = new Map(input.candidates.map((c) => [c.id, c]));
  const items: Candidate[] = [];
  const dropped: Resolved["dropped"] = [];
  const untils: number[] = [];
  const has = (id: string) => items.some((i) => i.id === id);

  const pins = input.pins
    .filter((p) => activePin(p, slot, input.section, now))
    .sort((a, b) => a.position - b.position || a.startsAt.getTime() - b.startsAt.getTime());
  for (const p of pins) {
    const c = byId.get(p.articleId);
    if (!c) dropped.push({ pinId: p.id, articleId: p.articleId, reason: "gone" });
    else if (c.sponsored || !eligible(c.id))
      dropped.push({ pinId: p.id, articleId: p.articleId, reason: "ineligible" });
    else if (!c.hasCover) dropped.push({ pinId: p.id, articleId: p.articleId, reason: "no_cover" });
    else if (!has(c.id) && items.length < slot.capacity) {
      items.push(c);
      if (p.endsAt) untils.push(p.endsAt.getTime());
    }
  }
  const manual = items.length;

  let hotUsed = 0;
  for (const c of input.hot ?? []) {
    if (items.length >= slot.capacity) break;
    if (has(c.id) || c.sponsored || !c.hasCover || !eligible(c.id)) continue;
    items.push(c);
    hotUsed += 1;
  }

  const pool = input.candidates.filter((c) => eligible(c.id));
  const auto = pickAutomaticDetailed(
    pool,
    now,
    slot.capacity - items.length,
    new Set(items.map((i) => i.id)),
  );
  items.push(...auto.items);
  if (auto.until) untils.push(auto.until.getTime());

  const source: FeaturedSource = manual > 0 ? "manual" : hotUsed > 0 ? "hot" : "automatic";
  return {
    items,
    source,
    until: untils.length ? new Date(Math.min(...untils)) : null,
    needsImage: auto.needsImage,
    dropped,
  };
}
