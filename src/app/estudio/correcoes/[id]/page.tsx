import type { Metadata } from "next";
import Link from "next/link";
import { CorrectionForm, EmptyState, InlineAlert } from "@/components";
import { CORRECTIONS_TEXT as T, QUEUE_TEXT } from "@/content/pt-BR/studio";
import { can } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { getCorrection } from "@/lib/db/queries/studio-corrections";
import { formatDateTime } from "@/lib/format/date";
import type { EditorDoc } from "@/lib/studio/doc";
import { publishCorrectionAction } from "../../actions";

export const metadata: Metadata = { title: "Correção · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const isDoc = (v: unknown): v is EditorDoc =>
  typeof v === "object" && v !== null && (v as { type?: unknown }).type === "doc";

export default async function CorrectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("correction.manage", undefined, {
    next: `/estudio/correcoes/${id}`,
  });
  const c = await getCorrection(id);
  if (!c) {
    return (
      <EmptyState as="h1" tone="error" icon="circle-alert" title={T.notFound}>
        <Link href="/estudio/correcoes" className="text-link underline">
          {T.back}
        </Link>
      </EmptyState>
    );
  }
  const allowed = can(session.roles, "correction.manage", {
    section: c.article.sectionSlug,
    userId: session.userId,
  });
  const open = c.publishedAt === null;
  const isPublic = c.articleStatus === "published" || c.articleStatus === "updated";

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/estudio/correcoes"
          className="type-meta font-medium text-link underline-offset-4 hover:underline"
        >
          {T.back}
        </Link>
        <p className="type-eyebrow text-eyebrow">
          {T.kind[c.kind] ?? T.screenTitle} · {T.status[c.status] ?? c.status}
        </p>
        <h1 className="type-screen-title text-strong">{c.article.title}</h1>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 type-body sm:grid-cols-2">
          <div>
            <dt className="type-meta text-meta">{T.requestedBy}</dt>
            <dd className="text-strong">{c.requestedBy}</dd>
          </div>
          <div>
            <dt className="type-meta text-meta">{open ? T.due : T.publishedAt}</dt>
            <dd className="tabular-nums text-strong">
              {formatDateTime(open ? c.dueAt : (c.publishedAt ?? c.dueAt))}
            </dd>
          </div>
        </dl>
      </header>
      {c.reportMessage && (
        <InlineAlert tone="info" role="none" title={T.report}>
          {c.reportMessage}
        </InlineAlert>
      )}
      {!open ? (
        <InlineAlert tone="success" role="status" title={T.published(c.notified)}>
          <p>
            {T.publicNote}: {c.publicNote}
          </p>
        </InlineAlert>
      ) : !isPublic ? (
        <InlineAlert tone="warn" role="none">
          {T.notPublic}
        </InlineAlert>
      ) : allowed ? (
        <section aria-labelledby="campos-corrigidos" className="flex flex-col gap-3">
          <h2 id="campos-corrigidos" className="type-section text-strong">
            {T.fields}
          </h2>
          <CorrectionForm
            mode="correction"
            targetId={c.id}
            baseVersion={c.version}
            userId={session.userId}
            initial={{
              title: c.title,
              dek: c.dek,
              body: isDoc(c.body) ? c.body : { type: "doc", content: [] },
            }}
            submit={publishCorrectionAction}
          />
        </section>
      ) : (
        <InlineAlert tone="info" role="none">
          {QUEUE_TEXT.forbidden}
        </InlineAlert>
      )}
    </article>
  );
}
