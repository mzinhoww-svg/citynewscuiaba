import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState, InlineAlert, Select } from "@/components";
import { ReportResponder } from "@/components/estudio";
import { MODERATION_TEXT as T, QUEUE_TEXT } from "@/content/pt-BR/studio";
import { canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import {
  listEscalations,
  listReports,
  type EscalationRow,
  type ReportRow,
} from "@/lib/db/queries/studio-moderation";
import { formatDateTime } from "@/lib/format/date";
import {
  correctionFromReportAction,
  resolveEscalationAction,
  respondReportAction,
} from "../actions";

export const metadata: Metadata = { title: "Denúncias · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const KINDS = ["wrong_info", "broken_link", "image", "right_of_reply", "other"] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireRole("reports.moderate", undefined, { next: "/estudio/denuncias" });
  const sp = await searchParams;
  const kind = KINDS.find((k) => k === sp.tipo);
  let rows: ReportRow[] | null = null;
  try {
    rows = await listReports(kind);
  } catch {
    rows = null;
  }
  let escalations: EscalationRow[] = [];
  try {
    escalations = await listEscalations();
  } catch {
    escalations = [];
  }
  const now = new Date().getTime();
  const correct = canAccess(session.roles, "correction.manage");

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.reportsTitle}</h1>
        <p className="type-body text-meta">{T.reportsIntro}</p>
      </header>
      {sp.encerrada === "1" && (
        <InlineAlert tone="success" role="status">
          {T.escalation.resolved}
        </InlineAlert>
      )}
      {escalations.length > 0 && (
        <section
          aria-labelledby="escaladas"
          className="flex flex-col gap-3 rounded-lg border-2 border-line-strong bg-card-white p-4"
        >
          <h2 id="escaladas" className="type-section text-strong">
            {T.escalation.title}
          </h2>
          <p className="type-body text-meta">{T.escalation.intro}</p>
          <ul className="flex flex-col gap-3" aria-label={T.escalation.caption}>
            {escalations.map((e) => (
              <li key={e.id} className="flex flex-col gap-2 border-t border-line-subtle pt-3">
                <p className="type-body font-semibold text-strong">
                  <Link href={e.href} className="underline-offset-4 hover:underline">
                    {e.title ?? T.unknownContent}
                  </Link>
                </p>
                <p className="type-meta text-meta">
                  {T.escalation.reports(e.reportCount)} · {T.escalation.openedAt}{" "}
                  {formatDateTime(e.openedAt)}
                </p>
                <form action={resolveEscalationAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={e.id} />
                  <label className="flex min-w-56 flex-col gap-1 type-label text-16 text-strong">
                    {T.escalation.resolveNote}
                    <input
                      name="note"
                      type="text"
                      maxLength={500}
                      className="border-control rounded-lg bg-input px-4 py-3 type-body text-strong"
                    />
                  </label>
                  <Button type="submit" size="md" variant="outline">
                    {T.escalation.resolve}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
      {sp.respondida === "1" && (
        <InlineAlert tone="success" role="status">
          {T.answered}
        </InlineAlert>
      )}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <Select
          id="filtro-tipo"
          name="tipo"
          label={T.kindLabel}
          options={[
            { value: "", label: T.filterAll },
            ...KINDS.map((k) => ({ value: k, label: T.kind[k] ?? k })),
          ]}
          defaultValue={kind ?? ""}
          className="min-w-56"
        />
        <Button type="submit" size="md" variant="outline">
          {T.filterApply}
        </Button>
      </form>
      {rows === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={QUEUE_TEXT.errorTitle}
          actions={
            <Button href="/estudio/denuncias" size="md" variant="outline">
              {QUEUE_TEXT.retry}
            </Button>
          }
        >
          {QUEUE_TEXT.errorBody}
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title={T.emptyTitle} icon="flag">
          {T.noReports}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-4" aria-label={T.reportsCaption}>
          {rows.map((r) => {
            const overdue = Date.parse(r.dueAt) < now;
            const label = `${T.kind[r.kind] ?? r.kind}: ${r.content.title ?? r.content.ref}`;
            return (
              <li key={r.id} className="rounded-lg border border-line-subtle bg-card-white p-4">
                <article aria-labelledby={`den-${r.id}`} className="flex flex-col gap-3">
                  <p className="type-eyebrow text-eyebrow">{T.kind[r.kind] ?? r.kind}</p>
                  <h2 id={`den-${r.id}`} className="type-section text-strong">
                    {r.content.href ? (
                      <Link href={r.content.href} className="underline-offset-4 hover:underline">
                        {r.content.title}
                      </Link>
                    ) : (
                      (r.content.title ?? T.unknownContent)
                    )}
                  </h2>
                  <p className="type-meta">
                    <span className="text-meta">{T.due}: </span>
                    <span className={overdue ? "font-semibold text-danger" : "text-strong"}>
                      {overdue && `${T.overdue} · `}
                      {formatDateTime(r.dueAt)}
                    </span>
                    <span className="text-meta"> · {r.contactEmail ?? T.noContact}</span>
                  </p>
                  <blockquote className="border-l-4 border-line-section pl-3 type-body text-strong">
                    {r.message ?? T.noMessage}
                  </blockquote>
                  {correct &&
                    r.content.articleId &&
                    (r.kind === "wrong_info" || r.kind === "right_of_reply") && (
                      <form action={correctionFromReportAction}>
                        <input type="hidden" name="articleId" value={r.content.articleId} />
                        <input type="hidden" name="reportId" value={r.id} />
                        <input type="hidden" name="kind" value={r.kind} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          icon="pencil"
                          aria-label={`${T.openCorrection}: ${label}`}
                        >
                          {T.openCorrection}
                        </Button>
                      </form>
                    )}
                  <ReportResponder
                    id={r.id}
                    label={label}
                    respond={respondReportAction}
                    doneHref={
                      kind
                        ? `/estudio/denuncias?tipo=${kind}&respondida=1`
                        : "/estudio/denuncias?respondida=1"
                    }
                  />
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
