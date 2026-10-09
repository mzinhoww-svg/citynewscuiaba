import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { MODERATION_TEXT as T } from "@/content/pt-BR/studio";
import { normalizeAgeRating } from "@/lib/agenda/age-rating";
import { AGENDA_CATEGORIES } from "@/lib/filters/agenda";
import { slugify } from "@/lib/pipeline/slug";
import { studioAction, StudioFailure, type ActionContext } from "./action";

/** Moderar a agenda = publicar na editoria Agenda (editor-chefe; editor com a editoria). */
const AGENDA_SCOPE = { section: "agenda" };

const Payload = z
  .object({
    title: z.string(),
    startsAt: z.string(),
    endsAt: z.string().nullable().optional(),
    venue: z.string(),
    neighborhood: z.string().nullable().optional(),
    priceCents: z.number().int().nullable().optional(),
    ageRating: z.string().optional(),
    description: z.string().nullable().optional(),
  })
  .loose();

const ApproveInput = z.object({
  id: z.uuid(),
  /** Campos editados antes de aprovar (a sugestão chega sem categoria). */
  edits: z.object({
    title: z.string().trim().min(3).max(200),
    startsAt: z.string().min(10).max(40),
    venue: z.string().trim().min(2).max(200),
    category: z.enum(AGENDA_CATEGORIES),
    description: z.string().trim().max(2000).nullable().optional(),
  }),
});
export type ApproveSubmissionInput = z.infer<typeof ApproveInput>;

async function pendingSubmission(ctx: ActionContext, id: string) {
  const { data } = await ctx.db
    .from("event_submissions")
    .select("id, payload, contact_email, status")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new StudioFailure("not_found");
  if (data.status !== "pending") throw new StudioFailure("invalid", T.alreadyDecided);
  return data;
}

/**
 * Aprovar sugestão de evento (E13): cria `event_listings` com `origin = "reader"`, confirmado,
 * com os campos revisados pela redação; a sugestão guarda quem decidiu e o evento criado.
 */
export const approveSubmission = studioAction(
  "article.publish",
  () => AGENDA_SCOPE,
  async (i: ApproveSubmissionInput, ctx) => {
    const s = await pendingSubmission(ctx, i.id);
    const p = Payload.safeParse(s.payload);
    if (!p.success) throw new StudioFailure("invalid", T.invalidPayload);
    const startsAt = new Date(i.edits.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new StudioFailure("invalid", T.invalidDate);
    const eventId = randomUUID();
    // Reserva a sugestão antes de criar o evento (achado 13): dois cliques concorrentes não
    // criam dois eventos; só um UPDATE encontra a linha ainda pendente.
    const claim = await ctx.db
      .from("event_submissions")
      .update({ status: "approved", decided_by: ctx.userId, decided_at: ctx.now().toISOString() })
      .eq("id", i.id)
      .eq("status", "pending")
      .select("id");
    if (claim.error) throw new StudioFailure("forbidden");
    if (!claim.data?.length) throw new StudioFailure("invalid", T.alreadyDecided);
    const { error } = await ctx.db.from("event_listings").insert({
      id: eventId,
      slug: `${slugify(i.edits.title).slice(0, 80)}-${eventId.slice(0, 6)}`,
      title: i.edits.title,
      starts_at: startsAt.toISOString(),
      ends_at: p.data.endsAt ?? null,
      venue: i.edits.venue,
      neighborhood: p.data.neighborhood ?? null,
      price_cents: p.data.priceCents ?? null,
      // Lista fechada (check da 0200): valor antigo fora dela vira `consulte`.
      age_rating: normalizeAgeRating(p.data.ageRating ?? "livre"),
      category: i.edits.category,
      origin: "reader",
      confirmed_at: ctx.now().toISOString(),
      description: i.edits.description ?? p.data.description ?? null,
    });
    if (error) {
      await ctx.db
        .from("event_submissions")
        .update({ status: "pending", decided_by: null, decided_at: null })
        .eq("id", i.id);
      throw new StudioFailure("forbidden");
    }
    const upd = await ctx.db.from("event_submissions").update({ event_id: eventId }).eq("id", i.id);
    if (upd.error) throw new StudioFailure("forbidden");
    ctx.detail({ event: eventId, category: i.edits.category });
    await ctx.revalidate(["agenda", `event:${eventId}`, "home"]);
    return { eventId };
  },
  { schema: ApproveInput, objectRef: (i) => `submission:${i.id}`, auditAs: "event.approve" },
);

const RejectInput = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(1, T.reasonRequired).max(500),
});
export type RejectSubmissionInput = z.infer<typeof RejectInput>;

/** Rejeitar sugestão com motivo: o motivo vai para o remetente (fila de e-mail do leitor). */
export const rejectSubmission = studioAction(
  "article.publish",
  () => AGENDA_SCOPE,
  async (i: RejectSubmissionInput, ctx) => {
    await pendingSubmission(ctx, i.id);
    const upd = await ctx.db
      .from("event_submissions")
      .update({
        status: "rejected",
        decided_by: ctx.userId,
        decided_at: ctx.now().toISOString(),
        decision_reason: i.reason,
      })
      .eq("id", i.id)
      .eq("status", "pending")
      .select("id");
    if (upd.error) throw new StudioFailure("forbidden");
    if (!upd.data?.length) throw new StudioFailure("invalid", T.alreadyDecided);
    // Destinatário e texto vêm da sugestão rejeitada, em modelo fixo (achado 8).
    const mail = await ctx.db.rpc("studio_queue_reader_email", {
      p_kind: "event_rejected",
      p_ref: `submission:${i.id}`,
    });
    if (mail.error) throw new Error(`e-mail: ${mail.error.message}`);
    ctx.detail({ reason: i.reason });
    return { id: i.id };
  },
  { schema: RejectInput, objectRef: (i) => `submission:${i.id}`, auditAs: "event.reject" },
);

const RespondInput = z.object({
  id: z.uuid(),
  response: z.string().trim().min(1, T.responseRequired).max(2000),
});
export type RespondReportInput = z.infer<typeof RespondInput>;

/**
 * Responder denúncia (E14, `reports.moderate`): grava a resposta, quem respondeu e quando; a
 * denúncia sai da fila. Com e-mail de contato, a resposta vai para a fila de e-mail do leitor.
 */
export const respondReport = studioAction(
  "reports.moderate",
  () => ({}),
  async (i: RespondReportInput, ctx) => {
    const { data: r } = await ctx.db
      .from("reports")
      .select("id, status, contact_email")
      .eq("id", i.id)
      .maybeSingle();
    if (!r) throw new StudioFailure("not_found");
    if (r.status !== "open") throw new StudioFailure("invalid", T.alreadyAnswered);
    const { data: upd, error } = await ctx.db
      .from("reports")
      .update({
        status: "answered",
        response: i.response,
        responded_at: ctx.now().toISOString(),
        responded_by: ctx.userId,
      })
      .eq("id", i.id)
      .eq("status", "open")
      .select("id");
    if (error) throw new StudioFailure("forbidden");
    if (!upd?.length) throw new StudioFailure("invalid", T.alreadyAnswered);
    if (r.contact_email) {
      const mail = await ctx.db.rpc("studio_queue_reader_email", {
        p_kind: "report_response",
        p_ref: `report:${i.id}`,
      });
      if (mail.error) throw new Error(`e-mail: ${mail.error.message}`);
    }
    ctx.detail({ emailed: Boolean(r.contact_email) });
    return { id: i.id, emailed: Boolean(r.contact_email) };
  },
  { schema: RespondInput, objectRef: (i) => `report:${i.id}`, auditAs: "report.respond" },
);
