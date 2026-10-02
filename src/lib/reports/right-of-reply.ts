import { z } from "zod";
import { REPLY } from "@/content/pt-BR/institutional";
import type { Result } from "@/lib/result";
import { REPLY_FIELDS, REPLY_HONEYPOT, type ReplyField, type ReplyState } from "./form-state";

export {
  REPLY_FIELDS,
  REPLY_HONEYPOT,
  REPLY_IDLE,
  type ReplyField,
  type ReplyState,
} from "./form-state";

/** Pedido de direito de resposta (P24) → fila `reports` (tipo right_of_reply) do Estúdio. */
export const REPLY_LIMIT = 5;
export const REPLY_WINDOW_SECONDS = 3600;
const REPLY_MIN = 40;
const REPLY_MAX = 3000;

type SaveError = { kind: "unconfigured" | "unavailable" };

export interface ReplyDeps {
  /** id da matéria pública pelo slug; null se não existe. */
  findArticle: (slug: string) => Promise<Result<string | null, SaveError>>;
  allow: () => Promise<Result<boolean, SaveError>>;
  save: (r: {
    contentRef: string;
    kind: "right_of_reply";
    message: string;
    contactEmail: string;
  }) => Promise<Result<void, SaveError>>;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Slug a partir do link colado (URL completa ou caminho `/materia/<slug>`). */
export function articleSlugFromUrl(raw: string): string | null {
  let path: string;
  try {
    path = new URL(raw.trim(), "https://citynews.invalid").pathname;
  } catch {
    return null;
  }
  const slug = /^\/materia\/([^/]+)/.exec(path)?.[1];
  return slug && slug.length <= 200 && SLUG.test(slug) ? slug : null;
}

export async function requestRightOfReply(form: FormData, deps: ReplyDeps): Promise<ReplyState> {
  const values: Partial<Record<ReplyField, string>> = {};
  for (const f of REPLY_FIELDS) values[f] = String(form.get(f) ?? "").slice(0, REPLY_MAX + 500);
  const v = (f: ReplyField) => (values[f] ?? "").trim();
  if (String(form.get(REPLY_HONEYPOT) ?? "").trim() !== "") {
    return { status: "success", message: REPLY.success, errors: {}, values: {} };
  }

  const errors: Partial<Record<ReplyField, string>> = {};
  const name = v("name");
  if (name.length < 2 || name.length > 120) errors.name = REPLY.errors.name;
  const email = emailSchema.safeParse(v("email"));
  if (!email.success) errors.email = REPLY.errors.email;
  const slug = articleSlugFromUrl(v("article"));
  if (!slug) errors.article = REPLY.errors.article;
  const reply = v("reply");
  if (reply.length < REPLY_MIN) errors.reply = REPLY.errors.reply;
  else if (reply.length > REPLY_MAX) errors.reply = REPLY.errors.replyLong;
  if (v("consent") !== "1") errors.consent = REPLY.errors.consent;

  let articleId: string | null = null;
  if (slug && Object.keys(errors).length === 0) {
    const found = await deps.findArticle(slug);
    if (!found.ok) return { status: "error", message: REPLY.error, errors: {}, values };
    articleId = found.value;
    if (!articleId) errors.article = REPLY.errors.articleNotFound;
  }

  const count = Object.keys(errors).length;
  if (count > 0 || !articleId || !email.success) {
    return { status: "invalid", message: REPLY.summary(count), errors, values };
  }

  const allowed = await deps.allow();
  if (!allowed.ok) return { status: "error", message: REPLY.error, errors: {}, values };
  if (!allowed.value) {
    return { status: "rate_limited", message: REPLY.rateLimited, errors: {}, values };
  }

  const saved = await deps.save({
    contentRef: `article:${articleId}`,
    kind: "right_of_reply",
    message: `Nome: ${name}\n\n${reply}`,
    contactEmail: email.data,
  });
  if (!saved.ok) return { status: "error", message: REPLY.error, errors: {}, values };
  return { status: "success", message: REPLY.success, errors: {}, values: {} };
}
