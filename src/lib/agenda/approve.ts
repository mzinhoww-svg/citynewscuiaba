import type { NormalizedEvent, Verdict, RejectReason } from "./types";

const HORIZON_DAYS = 365;
const MIN_LEAD_MS = 30 * 60_000;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Palavrões em português (base curta e conservadora); casa palavra inteira, sem acento. */
const PROFANITY =
  /\b(porra|caralho|merda|puta|putaria|puto|buceta|foda-se|fodase|cacete|viado|cuzao|arrombad[oa])\b/;

/** Agenda cultural e de lazer: cursos, congressos e encontros profissionais ficam de fora. */
const OFF_PROFILE =
  /\b(curso|workshop|certifica[cç][aã]o|congresso|palestra|mentoria|treinamento|capacita[cç][aã]o|semin[aá]rio|simp[oó]sio|p[oó]s-gradua[cç][aã]o|pass[oa] a pass[oa]|networking|empreendedor\w*|lideran[cç]a|fisioterapia|marketing|vendas|cripto\w*|conecta|aula magna)\b/;

const SHORTENERS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "cutt.ly",
  "is.gd",
  "ow.ly",
  "rebrand.ly",
  "shorturl.at",
  "tiny.cc",
  "linktr.ee",
  "wa.me",
]);

/** Palavrão no texto (sem acento nem caixa), mesma base da aprovação da agenda coletada. */
export function hasProfanity(text: string): boolean {
  return PROFANITY.test(fold(text));
}

/** Link do original: https, host por nome (nunca IP), sem credenciais e sem encurtador. */
export function suspiciousLink(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return true;
  }
  if (u.protocol !== "https:" || u.username || u.password) return true;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (SHORTENERS.has(host) || host === "localhost" || host.startsWith("xn--")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return true;
  return !host.includes(".");
}

/**
 * Aprovação automática da Agenda: data futura (e dentro de 1 ano), local conhecido, sem
 * palavrão e sem link suspeito. Falhou em qualquer uma, o evento não entra no ar (fica sem
 * `confirmed_at`, visível só ao Estúdio).
 */
export function approveEvent(e: NormalizedEvent, now: Date): Verdict {
  const reasons: RejectReason[] = [];
  const at = Date.parse(e.startsAt);
  if (!(at >= now.getTime() + MIN_LEAD_MS)) reasons.push("data_passada");
  else if (at > now.getTime() + HORIZON_DAYS * 86_400_000) reasons.push("data_distante");
  if (!e.venueKnown) reasons.push("local_desconhecido");
  if (PROFANITY.test(fold(`${e.title} ${e.venue}`))) reasons.push("palavrao");
  if (OFF_PROFILE.test(fold(e.title))) reasons.push("fora_do_perfil");
  if (suspiciousLink(e.sourceUrl)) reasons.push("link_suspeito");
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
