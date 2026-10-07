import { hasProfanity } from "@/lib/agenda/approve";
import type { EventSubmission } from "@/lib/agenda/submission";
import { fold as foldText } from "@/lib/text/fold";

/*
 * Agenda de leitor com aprovação automática (AUT-T7, A14): a sugestão entra sozinha no ar quando a
 * data é futura, o local é conhecido, não há link nem palavrão e o leitor não passou do limite
 * diário. Qualquer outra coisa segue para a fila humana (E13), como antes.
 */

/** Sugestões por leitor (e-mail) por dia de Cuiabá que ainda entram sozinhas. */
export const DAILY_SUBMISSION_LIMIT = 3;

export type AutoApproveReason =
  "past_date" | "unknown_venue" | "has_link" | "profanity" | "daily_limit";

export interface AutoApproveContext {
  /** Locais já presentes na agenda confirmada (comparados sem acento nem caixa). */
  knownVenues: readonly string[];
  /** Sugestões que o leitor já enviou hoje, sem contar esta. */
  submittedTodayByUser: number;
  now?: Date;
}

const fold = (s: string) => foldText(s).replace(/\s+/g, " ").trim();

/** Qualquer coisa com cara de link: endereço, `www.`, domínio comum ou encurtador. */
const LINK_LIKE =
  /(https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|gov|edu|app|io|me|ly|gg|tv|co|info|xyz|link|site|online)(?:\.[a-z]{2})?\b|\bbit\.ly\b)/i;

export function autoApproveReasons(
  e: EventSubmission,
  ctx: AutoApproveContext,
): AutoApproveReason[] {
  const now = ctx.now ?? new Date();
  const reasons: AutoApproveReason[] = [];
  const at = Date.parse(e.startsAt);
  if (!(at > now.getTime())) reasons.push("past_date");
  const venue = fold(e.venue);
  if (!venue || !ctx.knownVenues.some((v) => fold(v) === venue)) reasons.push("unknown_venue");
  const text = [e.title, e.venue, e.description ?? ""].join(" ");
  if ((e.link ?? "").trim() !== "" || LINK_LIKE.test(text)) reasons.push("has_link");
  if (hasProfanity(text)) reasons.push("profanity");
  if (ctx.submittedTodayByUser >= DAILY_SUBMISSION_LIMIT) reasons.push("daily_limit");
  return reasons;
}

/** `true` quando a sugestão pode entrar na agenda sem passar por uma pessoa. */
export function canAutoApproveEvent(e: EventSubmission, ctx: AutoApproveContext): boolean {
  return autoApproveReasons(e, ctx).length === 0;
}
