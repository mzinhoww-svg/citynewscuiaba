import { windowEnd, windowStart, type WindowHours } from "./window";
import type { Candidate } from "./types";

const DAY_MS = 86_400_000;
/** Candidatas: publicadas nos últimos 2 dias (contados do início da janela, para não variar nela). */
const LOOKBACK_MS = 2 * DAY_MS;

/** Pontuação mínima para a matéria "muito relevante" segurar a posição por 3 h (R28). */
export const RELEVANT_SCORE = 0.75;

/** Peso da editoria: notícia dura puxa mais que serviço e guia. */
const SECTION_WEIGHT: Record<string, number> = {
  cidade: 1,
  politica: 1,
  economia: 0.9,
  esportes: 0.85,
  cultura: 0.8,
  entretenimento: 0.75,
  gastronomia: 0.7,
  servicos: 0.6,
  "guia-cuiaba": 0.6,
};
const DEFAULT_SECTION_WEIGHT = 0.8;

/** Escopo regional (R20 a R23): local 1,0; regional 0,8; nacional só com comoção, 0,6. */
function scopeFactor(a: Pick<Candidate, "newsScope" | "nationalCommotion">): number {
  if (a.newsScope === "national") return a.nationalCommotion ? 0.6 : 0;
  if (a.newsScope === "mt") return 0.8;
  return 1;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Pontuação 0 a 1: confiança (0,45), fontes independentes (0,20), frescor (0,20) e editoria
 * (0,15), vezes o fator regional. O frescor é medido a partir do **início da janela**, não de
 * `now`: dentro da janela a pontuação não muda, e o destaque também não.
 */
export function scoreArticle(a: Candidate, now: Date, hours: WindowHours = 1): number {
  const ref = windowStart(now, hours).getTime();
  const ageH = Math.max(0, (ref - a.publishedAt.getTime()) / 3_600_000);
  const fresh = clamp01(1 - ageH / 48);
  const sources = clamp01(a.sourceCount / 4);
  const section = SECTION_WEIGHT[a.sectionSlug] ?? DEFAULT_SECTION_WEIGHT;
  const base = 0.45 * clamp01(a.confidenceScore) + 0.2 * sources + 0.2 * fresh + 0.15 * section;
  return Math.round(base * scopeFactor(a) * 1e6) / 1e6;
}

export interface AutomaticPick {
  items: Candidate[];
  /** Menor fim de janela entre as escolhidas (quando reavaliar); `null` sem escolhidas. */
  until: Date | null;
  /** Melhores candidatas descartadas por falta de capa: buscar imagem para elas (R39). */
  needsImage: string[];
}

function pool(cands: readonly Candidate[], now: Date, hours: WindowHours): Candidate[] {
  const start = windowStart(now, hours).getTime();
  return cands.filter(
    (c) =>
      !c.sponsored &&
      c.publishedAt.getTime() < start &&
      c.publishedAt.getTime() >= start - LOOKBACK_MS &&
      scopeFactor(c) > 0,
  );
}

function ranked(cands: Candidate[], now: Date, hours: WindowHours) {
  return cands
    .map((c) => ({ c, score: scoreArticle(c, now, hours) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.c.publishedAt.getTime() - a.c.publishedAt.getTime() ||
        a.c.id.localeCompare(b.c.id),
    );
}

/**
 * Destaque automático de uma posição (R1 da spec, R28 e R39 do dono):
 * 1. a matéria muito relevante (pontuação ≥ `RELEVANT_SCORE` na janela de 3 h) segura a posição
 *    até o fim da janela de 3 h;
 * 2. as demais vagas trocam a cada hora, entre as publicadas antes do início da hora;
 * 3. candidata sem capa aprovada é pulada e vai para `needsImage`;
 * 4. nacional com comoção ocupa no máximo uma vaga e nunca a única, havendo matéria local.
 */
export function pickAutomaticDetailed(
  cands: readonly Candidate[],
  now: Date,
  take: number,
  exclude: ReadonlySet<string> = new Set(),
): AutomaticPick {
  const items: Candidate[] = [];
  const untils: Date[] = [];
  const needsImage: string[] = [];
  if (take <= 0) return { items, until: null, needsImage };

  const free = cands.filter((c) => !exclude.has(c.id));
  const maxNational = take > 1 ? 1 : 0;
  let nationals = 0;
  const hasLocal = (list: Candidate[]) =>
    list.some(
      (c) => c.hasCover && (c.newsScope === "cuiaba" || c.newsScope === "mt" || !c.newsScope),
    );

  const consume = (hours: WindowHours, minScore: number) => {
    const p = pool(free, now, hours);
    const localExists = hasLocal(p);
    const end = windowEnd(now, hours);
    for (const { c, score } of ranked(p, now, hours)) {
      if (items.length >= take) break;
      if (score < minScore || items.some((i) => i.id === c.id)) continue;
      if (!c.hasCover) {
        needsImage.push(c.id);
        continue;
      }
      if (c.newsScope === "national") {
        if (nationals >= maxNational && localExists) continue;
        nationals += 1;
      }
      items.push(c);
      untils.push(end);
    }
  };

  consume(3, RELEVANT_SCORE);
  consume(1, 0);

  const until = untils.length ? new Date(Math.min(...untils.map((d) => d.getTime()))) : null;
  return { items, until, needsImage: [...new Set(needsImage)] };
}

/** `pickAutomaticDetailed` só com as matérias escolhidas. */
export function pickAutomatic(cands: readonly Candidate[], now: Date, take: number): Candidate[] {
  return pickAutomaticDetailed(cands, now, take).items;
}
