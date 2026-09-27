import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import { CONSENT_VERSION } from "@/lib/consent";
import {
  ARTICLE_KINDS,
  DISMISS_REASONS,
  EVENT_NAMES,
  LOGIN_METHODS,
  LOGIN_TRIGGERS,
  PERSONALIZATION_FROM,
  PERSONAL_PROPS,
  REC_LISTS,
  SEARCH_MODES,
  SHARE_CHANNELS,
  SURFACES,
  type EventName as EventNameType,
} from "./names";

/**
 * Schema do envelope (tracking-plan §1) e das props de cada evento (§2), validado no servidor.
 * Props são estritas: nada fora do plano entra, então não há como gravar atributo sensível,
 * texto livre ou identificador escondido nas props.
 */
export const EventName = z.enum(EVENT_NAMES);

const surface = z.enum(SURFACES);
const count = z.number().int().min(0).max(10_000);
const reasonKey = z.string().regex(/^[a-z_]{1,40}$/);

export const EVENT_PROPS = {
  source_viewed: z.strictObject({ surface }),
  source_followed: z.strictObject({ surface, fromRecommendation: z.boolean() }),
  source_unfollowed: z.strictObject({ surface }),
  article_opened: z.strictObject({ kind: z.enum(ARTICLE_KINDS), position: count }),
  article_read: z.strictObject({
    seconds: z.number().min(0).max(86_400),
    scrollPct: z.number().min(0).max(100),
  }),
  article_saved: z.strictObject({ surface }),
  article_shared: z.strictObject({ channel: z.enum(SHARE_CHANNELS) }),
  search_submitted: z.strictObject({
    mode: z.enum(SEARCH_MODES),
    resultCount: count,
    query: z.string().min(1).max(120).optional(),
  }),
  recommendation_clicked: z.strictObject({
    list: z.enum(REC_LISTS),
    reason: reasonKey,
    position: count,
  }),
  recommendation_dismissed: z.strictObject({
    list: z.enum(REC_LISTS),
    reason: reasonKey,
    dismissReason: z.enum(DISMISS_REASONS),
  }),
  personalization_enabled: z.strictObject({ from: z.enum(PERSONALIZATION_FROM) }),
  personalization_disabled: z.strictObject({ from: z.enum(PERSONALIZATION_FROM) }),
  login_prompt_shown: z.strictObject({ trigger: z.enum(LOGIN_TRIGGERS) }),
  login_started: z.strictObject({
    trigger: z.enum(LOGIN_TRIGGERS),
    method: z.enum(LOGIN_METHODS),
  }),
  login_completed: z.strictObject({ method: z.enum(LOGIN_METHODS), migrated: z.boolean() }),
  login_skipped: z.strictObject({ trigger: z.enum(LOGIN_TRIGGERS) }),
  privacy_settings_updated: z.strictObject({
    metrics: z.boolean(),
    personalization: z.boolean(),
  }),
} satisfies Record<EventNameType, z.ZodType>;

/** Caminho da página, sem query string nem fragmento (a busca nunca vaza pela URL). */
const pagePath = z
  .string()
  .max(300)
  .regex(/^\/[^?#\s]*$/);
/** Só a origem de quem mandou o leitor (`https://exemplo.com`). */
const origin = z
  .string()
  .max(200)
  .regex(/^https?:\/\/[^/?#\s]+$/);
const slug = z
  .string()
  .max(120)
  .regex(/^[a-z0-9-]+$/);
const contentRef = z
  .string()
  .max(120)
  .regex(/^(article|topic|agg|event):[A-Za-z0-9-]+$/);

export const EventEnvelope = z
  .strictObject({
    name: EventName,
    anonId: z.uuid().nullable(),
    userId: z.uuid().nullable(),
    at: z.iso.datetime({ offset: true }),
    sourceId: slug.nullable(),
    contentId: contentRef.nullable(),
    session: z.strictObject({
      id: z.string().max(64),
      page: pagePath,
      referrer: origin.nullable(),
      device: z.enum(["mobile", "tablet", "desktop"]),
    }),
    consent: z.strictObject({
      version: z.literal(CONSENT_VERSION),
      metrics: z.boolean(),
      personalization: z.boolean(),
    }),
    algoVersion: z.string().max(20),
    props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  })
  .superRefine((e, ctx) => {
    if (!e.consent.metrics && !e.consent.personalization)
      ctx.addIssue({ code: "custom", message: "sem consentimento", path: ["consent"] });
    if (e.anonId !== null && !e.consent.personalization)
      ctx.addIssue({ code: "custom", message: "anonId exige personalização", path: ["anonId"] });
    if (!e.consent.personalization) {
      if (e.userId !== null)
        ctx.addIssue({ code: "custom", message: "userId exige personalização", path: ["userId"] });
      for (const key of PERSONAL_PROPS)
        if (key in e.props)
          ctx.addIssue({ code: "custom", message: "prop pessoal", path: ["props", key] });
    }
    const props = EVENT_PROPS[e.name].safeParse(e.props);
    if (!props.success)
      for (const issue of props.error.issues)
        ctx.addIssue({ code: "custom", message: issue.message, path: ["props", ...issue.path] });
  });

export type EventEnvelope = z.infer<typeof EventEnvelope>;

/** Texto JSON → evento válido, ou o motivo da recusa (400). */
export function parseEvent(text: string): Result<EventEnvelope, string> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return err("json");
  }
  const r = EventEnvelope.safeParse(raw);
  return r.success ? ok(r.data) : err(r.error.issues[0]?.message ?? "inválido");
}
