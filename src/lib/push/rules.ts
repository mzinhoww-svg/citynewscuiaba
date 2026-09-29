/**
 * Trilhos do push como funções puras (spec §4 D-P07, D-P08, D-P16, D-P17, D-P19; plano G6, G7).
 * `decideReservation` é o espelho em TypeScript de `push_reserve` (0040): a mesma ordem de
 * decisão, conferida pelos casos de `tests/fixtures/push/reserve-cases.json` nos dois lados.
 * Horário sempre de Cuiabá (UTC−4, sem horário de verão).
 */
import type { PushKind, ReserveOutcome, TargetKey } from "./types";

export const TTL_HOURS: Record<PushKind, number> = { follow: 6, urgent: 2, highlight: 12 };
export const PLATFORM_QUIET: QuietWindow = { start: 22, end: 7 };
export const CUIABA_OFFSET_MIN = -4 * 60;
export const MAX_DAILY = 3;

export interface QuietWindow {
  /** Hora local de início (18–22). */
  start: number;
  /** Hora local de fim (7–10). */
  end: number;
}

/** União das janelas: o leitor só aumenta o silêncio (menor início, maior fim). */
export function effectiveQuiet(
  sub: QuietWindow,
  platform: QuietWindow = PLATFORM_QUIET,
): QuietWindow {
  return { start: Math.min(sub.start, platform.start), end: Math.max(sub.end, platform.end) };
}

/** Mínimo entre o limite do leitor e o padrão da plataforma, sempre entre 1 e 3. */
export function effectiveLimit(sub: number, platform: number = MAX_DAILY): number {
  const p = Math.min(MAX_DAILY, Math.max(1, Math.floor(platform) || MAX_DAILY));
  const s = Math.min(MAX_DAILY, Math.max(1, Math.floor(sub) || MAX_DAILY));
  return Math.min(s, p);
}

/** Data e hora de Cuiabá de um instante. */
function cuiabaParts(now: Date): { y: number; m: number; d: number; h: number; min: number } {
  const t = new Date(now.getTime() + CUIABA_OFFSET_MIN * 60_000);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth(),
    d: t.getUTCDate(),
    h: t.getUTCHours(),
    min: t.getUTCMinutes(),
  };
}

/** Dia de Cuiabá (`YYYY-MM-DD`): a virada é às 04:00Z. */
export function cuiabaDay(now: Date): string {
  const { y, m, d } = cuiabaParts(now);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function isQuiet(q: QuietWindow, now: Date): boolean {
  const { h } = cuiabaParts(now);
  return h >= q.start || h < q.end;
}

/** Fim do silêncio a partir de `now`: hoje às `end` se ainda não passou; senão amanhã. */
export function quietEndsAt(q: QuietWindow, now: Date): Date {
  const { y, m, d, h } = cuiabaParts(now);
  const day = h < q.end ? d : d + 1;
  return new Date(Date.UTC(y, m, day, q.end, 0, 0) - CUIABA_OFFSET_MIN * 60_000);
}

export interface ReserveInput {
  kind: PushKind;
  want: Record<PushKind, boolean>;
  /** Janela efetiva (já unida à da plataforma). */
  quiet: QuietWindow;
  /** Limite efetivo (já mínimo com o padrão). */
  limit: number;
  dayKey: string | null;
  dayCount: number;
  /** A inscrição já tem entrega `queued`/`deferred`/`sent` desta matéria. */
  hasArticle: boolean;
  ttlEndsAt: string;
  now: string;
}

export interface ReserveDecision {
  outcome: ReserveOutcome;
  notBefore: string | null;
}

/**
 * Ordem fixa: preferência → duplicata → silêncio (adia se cabe no TTL, senão pula) → limite do
 * dia (zerado quando o dia de Cuiabá mudou) → ok. Urgente ignora só o silêncio (D-P08).
 */
export function decideReservation(i: ReserveInput): ReserveDecision {
  if (!i.want[i.kind]) return { outcome: "skipped_pref", notBefore: null };
  if (i.hasArticle) return { outcome: "skipped_duplicate", notBefore: null };
  const now = new Date(i.now);
  if (i.kind !== "urgent" && isQuiet(i.quiet, now)) {
    const ends = quietEndsAt(i.quiet, now);
    if (ends.getTime() <= Date.parse(i.ttlEndsAt))
      return { outcome: "deferred", notBefore: ends.toISOString() };
    return { outcome: "skipped_quiet", notBefore: null };
  }
  const count = i.dayKey === cuiabaDay(now) ? i.dayCount : 0;
  if (count >= i.limit) return { outcome: "skipped_limit", notBefore: null };
  return { outcome: "ok", notBefore: null };
}

export const RETRY_DELAYS_SEC = [60, 240, 600] as const;
export const MAX_RETRY_AFTER_SEC = 1800;

/** Espera antes da tentativa `attempt` (1–3), respeitando `Retry-After` até 30 min; `null` depois. */
export function retryDelay(attempt: number, retryAfterSec: number | null): number | null {
  const base = RETRY_DELAYS_SEC[attempt - 1];
  if (base === undefined) return null;
  if (retryAfterSec === null || !Number.isFinite(retryAfterSec)) return base;
  return Math.max(base, Math.min(Math.floor(retryAfterSec), MAX_RETRY_AFTER_SEC));
}

export interface ArticleForTargets {
  sourceSlugs: string[];
  sectionSlug: string;
  topicSlug: string | null;
  neighborhoods: string[];
}

const SLUG = /^[a-z0-9-]{1,80}$/;

/** Alvos que uma matéria casa (spec §12.1): fontes, editoria, assunto e bairros. */
export function articleTargets(a: ArticleForTargets): TargetKey[] {
  const out: TargetKey[] = [];
  const push = (t: TargetKey) => {
    if (!out.includes(t)) out.push(t);
  };
  for (const s of a.sourceSlugs) if (SLUG.test(s)) push(`source:${s}`);
  if (SLUG.test(a.sectionSlug)) push(`section:${a.sectionSlug}`);
  if (a.topicSlug && SLUG.test(a.topicSlug)) push(`topic:${a.topicSlug}`);
  for (const n of a.neighborhoods) if (SLUG.test(n)) push(`bairro:${n}`);
  return out;
}

export type ScheduleWhen = { type: "now" } | { type: "at"; at: string };
export type ScheduleProblem = "urgent_now_only" | "past" | "too_far" | "quiet" | "invalid";
export const MAX_SCHEDULE_DAYS = 7;

/** Urgente só "Agora" (D-P19); Destaque até 7 dias, fora de 22h–7h de Cuiabá. */
export function scheduleProblem(
  kind: "urgent" | "highlight",
  when: ScheduleWhen,
  now: string,
): ScheduleProblem | null {
  if (when.type === "now") return null;
  if (kind === "urgent") return "urgent_now_only";
  const at = Date.parse(when.at);
  const base = Date.parse(now);
  if (!Number.isFinite(at) || !Number.isFinite(base)) return "invalid";
  if (at < base) return "past";
  if (at - base > MAX_SCHEDULE_DAYS * 86_400_000) return "too_far";
  if (isQuiet(PLATFORM_QUIET, new Date(at))) return "quiet";
  return null;
}
