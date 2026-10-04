import "server-only";
import { randomUUID } from "node:crypto";
import { categoryFromText } from "@/lib/agenda/normalize";
import type { EventSubmission } from "@/lib/agenda/submission";
import { startOfDay } from "@/lib/format/date";
import { revalidateTags } from "@/lib/pipeline/revalidate";
import { slugify } from "@/lib/pipeline/slug";
import { autoApproveReasons, type AutoApproveReason } from "@/lib/studio/event-auto-approve";
import type { DbClient } from "./client";

/** Texto da decisão gravada na sugestão aprovada sem pessoa. */
export const AUTO_APPROVED_NOTE = "Aprovação automática (data futura, local conhecido, sem link).";

export type AutoApproveOutcome =
  { approved: true; eventId: string } | { approved: false; reasons: AutoApproveReason[] };

/** Locais da agenda confirmada (base do "local conhecido"). */
async function knownVenues(db: DbClient): Promise<string[]> {
  const { data, error } = await db
    .from("event_listings")
    .select("venue")
    .not("confirmed_at", "is", null)
    .limit(5000);
  if (error) throw new Error(`event-auto: locais: ${error.message}`);
  return [...new Set((data ?? []).map((r) => r.venue))];
}

/** Sugestões do leitor (pelo e-mail) no dia de Cuiabá, fora esta. */
async function submittedToday(db: DbClient, email: string, selfId: string, now: Date) {
  const { count, error } = await db
    .from("event_submissions")
    .select("id", { count: "exact", head: true })
    .eq("contact_email", email)
    .neq("id", selfId)
    .gte("created_at", startOfDay(now).toISOString());
  if (error) throw new Error(`event-auto: limite diário: ${error.message}`);
  return count ?? 0;
}

/**
 * Tenta aprovar uma sugestão recém-gravada sem pessoa (A14). Aprova: cria `event_listings` com
 * `origin = "reader"` (mesma forma da aprovação humana), marca a sugestão como aprovada (sem
 * `decided_by`: foi o sistema) e grava a decisão. Não aprova: deixa pendente para a fila humana,
 * com os motivos na decisão. Chamada com a service role, logo depois do envio do leitor.
 */
export async function autoApproveSubmission(
  db: DbClient,
  submissionId: string,
  e: EventSubmission,
  now: Date = new Date(),
): Promise<AutoApproveOutcome> {
  const [venues, today] = await Promise.all([
    knownVenues(db),
    submittedToday(db, e.contactEmail, submissionId, now),
  ]);
  const reasons = autoApproveReasons(e, { knownVenues: venues, submittedTodayByUser: today, now });
  const record = (output: Record<string, unknown>, rationale: string) =>
    db.from("decisions").insert({
      object_ref: `submission:${submissionId}`,
      step: "event_auto",
      input_hash: `event_auto:${submissionId}`,
      output: JSON.parse(JSON.stringify(output)),
      rationale,
    });

  if (reasons.length > 0) {
    await record({ approved: false, reasons }, `Segue para a fila humana: ${reasons.join(", ")}.`);
    return { approved: false, reasons };
  }

  // Reserva a sugestão antes de criar o evento: duas chamadas não criam dois eventos.
  const claim = await db
    .from("event_submissions")
    .update({
      status: "approved",
      decided_at: now.toISOString(),
      decision_reason: AUTO_APPROVED_NOTE,
    })
    .eq("id", submissionId)
    .eq("status", "pending")
    .select("id");
  if (claim.error) throw new Error(`event-auto: reserva: ${claim.error.message}`);
  if (!claim.data?.length) return { approved: false, reasons: [] };

  const eventId = randomUUID();
  const insert = await db.from("event_listings").insert({
    id: eventId,
    slug: `${slugify(e.title).slice(0, 80)}-${eventId.slice(0, 6)}`,
    title: e.title,
    starts_at: e.startsAt,
    ends_at: e.endsAt,
    venue: e.venue,
    neighborhood: e.neighborhood,
    price_cents: e.priceCents,
    age_rating: e.ageRating,
    category: categoryFromText(`${e.title} ${e.venue}`),
    origin: "reader",
    confirmed_at: now.toISOString(),
    description: e.description,
  });
  if (insert.error) {
    await db
      .from("event_submissions")
      .update({ status: "pending", decided_at: null, decision_reason: null })
      .eq("id", submissionId);
    throw new Error(`event-auto: evento: ${insert.error.message}`);
  }
  await db.from("event_submissions").update({ event_id: eventId }).eq("id", submissionId);
  await record({ approved: true, eventId }, AUTO_APPROVED_NOTE);
  try {
    await revalidateTags(["agenda", `event:${eventId}`, "home"]);
  } catch {
    /* fora de uma requisição do Next a invalidação não existe; o cache expira sozinho */
  }
  return { approved: true, eventId };
}
