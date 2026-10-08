import type { Metadata } from "next";
import { Button, EmptyState, InlineAlert } from "@/components";
import { SubmissionReview, StudioScreen } from "@/components/estudio";
import { AGENDA } from "@/content/pt-BR/portal-agenda";
import { MODERATION_TEXT as T, QUEUE_TEXT } from "@/content/pt-BR/studio";
import { can } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { listSubmissions, type SubmissionRow } from "@/lib/db/queries/studio-moderation";
import { AGENDA_CATEGORIES } from "@/lib/filters/agenda";
import { formatDateTime } from "@/lib/format/date";
import { approveSubmissionAction, rejectSubmissionAction } from "../../actions";
import { AgendaTabs } from "../AgendaTabs";

export const metadata: Metadata = { title: "Sugestões de evento · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  // Aba da Agenda (AGM-T7): mesma guarda das outras telas da área, a editoria Agenda.
  const session = await requireRole(
    "article.publish",
    { section: "agenda" },
    {
      next: "/estudio/agenda/sugestoes",
    },
  );
  const sp = await searchParams;
  const decide = can(session.roles, "article.publish", {
    section: "agenda",
    userId: session.userId,
  });
  let rows: SubmissionRow[] | null = null;
  try {
    rows = await listSubmissions();
  } catch {
    rows = null;
  }
  const done = sp.feito === "aprovada" ? T.approved : sp.feito === "rejeitada" ? T.rejected : null;

  return (
    <StudioScreen title={T.submissionsTitle} intro={T.submissionsIntro}>
      <AgendaTabs current="submissions" />
      {done && (
        <InlineAlert tone="success" role="status">
          {done}
        </InlineAlert>
      )}
      {rows === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={QUEUE_TEXT.errorTitle}
          actions={
            <Button href="/estudio/agenda/sugestoes" size="md" variant="outline">
              {QUEUE_TEXT.retry}
            </Button>
          }
        >
          {QUEUE_TEXT.errorBody}
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title={T.emptyTitle} icon="calendar">
          {T.noSubmissions}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-4" aria-label={T.submissionsCaption}>
          {rows.map((s) => (
            <li key={s.id} className="rounded-lg border border-line-subtle bg-card-white p-4">
              <article aria-labelledby={`sug-${s.id}`} className="flex flex-col gap-3">
                <h2 id={`sug-${s.id}`} className="type-section text-strong">
                  {s.title}
                </h2>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-1 type-meta sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-meta">{T.sentAt}</dt>
                    <dd className="text-strong">{formatDateTime(s.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-meta">{T.contact}</dt>
                    <dd className="break-all text-strong">{s.contactEmail}</dd>
                  </div>
                  <div>
                    <dt className="text-meta">{T.price}</dt>
                    <dd className="text-strong">
                      {s.priceCents
                        ? `R$ ${(s.priceCents / 100).toFixed(2).replace(".", ",")}`
                        : T.free}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-meta">{T.age}</dt>
                    <dd className="text-strong">{s.ageRating}</dd>
                  </div>
                </dl>
                <SubmissionReview
                  id={s.id}
                  initial={{
                    title: s.title,
                    startsAt: s.startsAt,
                    venue: s.venue,
                    description: s.description ?? "",
                  }}
                  categories={AGENDA_CATEGORIES.map((c) => ({
                    value: c,
                    label: AGENDA.categories[c] ?? c,
                  }))}
                  approve={decide ? approveSubmissionAction : undefined}
                  reject={decide ? rejectSubmissionAction : undefined}
                  doneHref={{
                    approved: "/estudio/agenda/sugestoes?feito=aprovada",
                    rejected: "/estudio/agenda/sugestoes?feito=rejeitada",
                  }}
                />
              </article>
            </li>
          ))}
        </ul>
      )}
    </StudioScreen>
  );
}
