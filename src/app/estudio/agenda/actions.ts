"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { STUDIO_AGENDA_TEXT as T } from "@/content/pt-BR/studio-agenda";
import { EVENT_FORM_FIELDS, parseEventForm } from "@/lib/agenda/event-form";
import type { EventFormState } from "@/lib/agenda/form-state";
import { audit } from "@/lib/audit";
import type { AuditAction } from "@/lib/audit/actions";
import { can } from "@/lib/auth/permissions";
import {
  createEvent,
  restoreEvent,
  updateEvent,
  withdrawEvent,
  type EventActor,
} from "@/lib/db/queries/studio-events";
import { studioContext, type StudioContext } from "@/lib/studio/context";
import { isReadOnly, READ_ONLY_MESSAGE } from "@/lib/studio/read-only";

/** Moderar a Agenda = publicar na editoria Agenda (editor-chefe; editor com a editoria). */
const AGENDA_SCOPE = { section: "agenda" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BASE = "/estudio/agenda";

type Guard = { ok: true; actor: EventActor; ctx: StudioContext } | { ok: false; message: string };

/**
 * Mesma guarda das Server Actions do Estúdio (`studioAction`): sessão, papel na editoria Agenda
 * (negação auditada com `.denied`) e modo leitura. A RLS repete a checagem no banco.
 */
async function agendaActor(action: AuditAction, objectRef: string): Promise<Guard> {
  const ctx = await studioContext();
  const s = ctx.session;
  if (!s) return { ok: false, message: T.form.forbidden };
  if (!can(s.roles, "article.publish", { ...AGENDA_SCOPE, userId: s.userId })) {
    await audit(s.userId, `${action}.denied`, objectRef, { scope: AGENDA_SCOPE }, ctx.db);
    return { ok: false, message: T.form.forbidden };
  }
  if (await isReadOnly(ctx.db)) return { ok: false, message: READ_ONLY_MESSAGE };
  return { ok: true, ctx, actor: { db: ctx.db, userId: s.userId, now: ctx.now() } };
}

/** Lista, home e a página do evento mudam na hora (o cache da agenda pública é por tag). */
async function refresh(ctx: StudioContext, id: string, slug: string) {
  await ctx.revalidate(["agenda", `event:${id}`, "home"]);
  revalidatePath("/agenda");
  revalidatePath(`/agenda/${slug}`);
  revalidatePath(BASE);
}

function valuesOf(form: FormData): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {};
  for (const f of EVENT_FORM_FIELDS) out[f] = String(form.get(f) ?? "").slice(0, 2000);
  return out;
}

/** Cadastrar ou editar evento (campo `id` = edição). Salvo, vai para a edição com o aviso. */
export async function saveEventAction(
  _state: EventFormState,
  form: FormData,
): Promise<EventFormState> {
  const rawId = String(form.get("id") ?? "");
  const id = UUID.test(rawId) ? rawId : null;
  const values = valuesOf(form);
  const guard = await agendaActor(id ? "event.update" : "event.create", `event:${id ?? "novo"}`);
  if (!guard.ok) return { status: "error", message: guard.message, errors: {}, values };

  const parsed = parseEventForm(form, { now: guard.actor.now, mode: id ? "edit" : "create" });
  if (!parsed.ok) {
    const errors = parsed.error;
    return {
      status: "invalid",
      message: T.form.summary(Object.keys(errors).length),
      errors,
      values,
    };
  }
  const saved = id
    ? await updateEvent(id, parsed.value, guard.actor)
    : await createEvent(parsed.value, guard.actor);
  if (!saved.ok) {
    const message = {
      not_found: T.form.notFound,
      conflict: T.form.conflict,
      invalid: T.form.invalidData,
      forbidden: T.form.failed,
    }[saved.error];
    return { status: "error", message, errors: {}, values };
  }
  await refresh(guard.ctx, saved.value.id, saved.value.slug);
  redirect(`${BASE}/${saved.value.id}?feito=${id ? "salvo" : "criado"}`);
}

/** Depois de retirar/devolver: volta para a lista (padrão) ou para a edição (`voltar=evento`). */
function backTo(form: FormData, id: string, done: string): string {
  return form.get("voltar") === "evento" ? `${BASE}/${id}?${done}` : `${BASE}?${done}`;
}

async function toggle(form: FormData, withdraw: boolean): Promise<never> {
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) redirect(`${BASE}?erro=1`);
  const guard = await agendaActor(withdraw ? "event.withdraw" : "event.restore", `event:${id}`);
  if (!guard.ok) redirect(backTo(form, id, "erro=1"));
  const r = withdraw ? await withdrawEvent(id, guard.actor) : await restoreEvent(id, guard.actor);
  if (!r.ok) redirect(backTo(form, id, "erro=1"));
  if (r.value.changed) await refresh(guard.ctx, id, r.value.slug);
  redirect(backTo(form, id, `feito=${withdraw ? "retirado" : "devolvido"}`));
}

/** Retirar do ar: some da agenda pública e da página do evento; a coleta não o devolve. */
export async function withdrawEventAction(form: FormData): Promise<void> {
  await toggle(form, true);
}

/** Devolver ao ar. */
export async function restoreEventAction(form: FormData): Promise<void> {
  await toggle(form, false);
}
