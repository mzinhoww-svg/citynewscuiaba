import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button, InlineAlert, StatusBadge } from "@/components";
import { EventForm, StudioScreen } from "@/components/estudio";
import { AGENDA } from "@/content/pt-BR/portal-agenda";
import { STUDIO_AGENDA_TEXT as T } from "@/content/pt-BR/studio-agenda";
import { eventFormValues } from "@/lib/agenda/event-form";
import { requireRole } from "@/lib/auth/require-role";
import { getStudioEvent, situationOf } from "@/lib/db/queries/studio-events";
import { AGENDA_CATEGORIES } from "@/lib/filters/agenda";
import { restoreEventAction, saveEventAction, withdrawEventAction } from "../actions";

export const metadata: Metadata = { title: `${T.form.breadcrumbs.edit} · ${T.metaTitle}` };
export const dynamic = "force-dynamic";

const BASE = "/estudio/agenda";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Editar evento (AGM-T7): o que mudar fica travado contra a coleta; retirar e devolver. */
export default async function EditEventPage({ params, searchParams }: Props) {
  const { id } = await params;
  await requireRole("article.publish", { section: "agenda" }, { next: `${BASE}/${id}` });
  if (!UUID.test(id)) notFound();
  const event = await getStudioEvent(id);
  if (!event) notFound();
  const sp = await searchParams;
  const feito = typeof sp.feito === "string" ? sp.feito : "";
  const done = T.done[feito];
  const failed = sp.erro === "1";
  const situation = situationOf(event, new Date());
  const withdrawn = situation === "retirado";

  return (
    <StudioScreen
      title={T.form.editTitle(event.title)}
      intro={<p className="type-body text-meta">{T.form.editIntro}</p>}
      breadcrumbs={[
        { href: BASE, label: T.form.breadcrumbs.agenda },
        { href: `${BASE}/${id}`, label: T.form.breadcrumbs.edit },
      ]}
      actions={
        situation === "no_ar" ? (
          <Button href={`/agenda/${event.slug}`} size="md" variant="outline" icon="external-link">
            {T.form.viewPublic}
          </Button>
        ) : undefined
      }
    >
      {done && (
        <InlineAlert tone="success" role="status">
          {done}
        </InlineAlert>
      )}
      {failed && (
        <InlineAlert tone="error" role="alert">
          {T.actionFailed}
        </InlineAlert>
      )}
      <section
        aria-labelledby="evento-situacao"
        className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-card-white p-4"
      >
        <h2 id="evento-situacao" className="type-section text-strong">
          {T.form.statusTitle}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge
            tone={withdrawn ? "danger" : situation === "no_ar" ? "success" : "neutral"}
            icon={withdrawn ? "eye-off" : situation === "no_ar" ? "check" : "history"}
            size="md"
          >
            {T.situation[situation]}
          </StatusBadge>
          <span className="type-meta text-meta">
            {T.origin[event.origin]}
            {event.source ? ` · ${event.source}` : ""}
          </span>
        </div>
        <form
          action={withdrawn ? restoreEventAction : withdrawEventAction}
          className="flex flex-col items-start gap-2"
        >
          <input type="hidden" name="id" value={event.id} />
          <input type="hidden" name="voltar" value="evento" />
          <p className="type-meta text-meta">
            {withdrawn ? T.form.restoreHint : T.form.withdrawHint}
          </p>
          <Button type="submit" size="sm" variant="outline" icon={withdrawn ? "eye" : "eye-off"}>
            {withdrawn ? T.table.restore : T.table.withdraw}
          </Button>
        </form>
        <div className="flex flex-col gap-1">
          <h3 className="type-label text-strong">{T.form.lockedTitle}</h3>
          {event.locked_fields.length === 0 ? (
            <p className="type-meta text-meta">{T.form.lockedNone}</p>
          ) : (
            <ul className="flex flex-wrap gap-x-3 gap-y-1 type-meta text-strong">
              {event.locked_fields.map((f) => (
                <li key={f}>{T.form.lockedField[f] ?? f}</li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <EventForm
        action={saveEventAction}
        cancelHref={BASE}
        eventId={event.id}
        initial={eventFormValues(event)}
        categories={AGENDA_CATEGORIES.map((c) => ({ value: c, label: AGENDA.categories[c] ?? c }))}
      />
    </StudioScreen>
  );
}
