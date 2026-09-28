import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, ImageApproval, InlineAlert, MediaThumb, OriginLabel } from "@/components";
import { ARTICLE_STATUS_LABEL, MEDIA_TEXT as T } from "@/content/pt-BR/studio";
import { can } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { getMedia, replacementOptions } from "@/lib/db/queries/studio-media";
import { formatDate, formatDateTime, localDateKey } from "@/lib/format/date";
import { labelsFor } from "@/lib/labels";
import { approveImageAction, blockImageAction, replaceImageAction } from "../../actions";

export const metadata: Metadata = { title: "Aprovação de imagem · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

export default async function MediaApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("media.approve", undefined, { next: `/estudio/midia/${id}` });
  const m = await getMedia(id);
  if (!m) {
    return (
      <EmptyState as="h1" tone="error" icon="circle-alert" title={T.notFound}>
        <Link href="/estudio/midia" className="text-link underline">
          {T.back}
        </Link>
      </EmptyState>
    );
  }
  const section = m.articles[0]?.sectionSlug;
  const canApprove = can(session.roles, "media.approve", {
    ...(section ? { section } : {}),
    userId: session.userId,
  });
  const today = localDateKey(new Date());
  const expired = m.licenseUntil !== null && m.licenseUntil < today;
  const publicArticles = m.articles.filter(
    (a) => a.status === "published" || a.status === "updated",
  );
  const replaceable = m.articles.filter((a) =>
    can(session.roles, "article.edit", { section: a.sectionSlug, userId: session.userId }),
  );
  const options = replaceable.length ? await replacementOptions(m.id) : [];
  const label = labelsFor({
    kind: "original",
    hasAiSummary: false,
    publishMode: null,
    image: { kind: m.kind, credit: m.credit ?? undefined, sourceName: m.sourceName ?? undefined },
    sponsored: false,
  }).shown[1]!;

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/estudio/midia"
          className="type-meta font-medium text-link underline-offset-4 hover:underline"
        >
          {T.back}
        </Link>
        <p className="type-eyebrow text-eyebrow">
          {T.approvalTitle} · {T.status[m.status]}
        </p>
        <h1 className="type-screen-title text-strong">{m.credit ?? m.license}</h1>
        <div>
          <OriginLabel label={label} />
        </div>
      </header>
      {expired && publicArticles.length > 0 && (
        <InlineAlert tone="warn" role="none" title={T.alertsTitle}>
          {publicArticles.map((a) => (
            <p key={a.id}>{T.expiredAlert(a.title)}</p>
          ))}
        </InlineAlert>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-4">
          <MediaThumb
            src={`/api/estudio/midia/${m.id}`}
            alt={m.credit ?? m.license}
            className="max-w-2xl"
          />
          <section
            aria-labelledby="origem-direitos"
            className="rounded-lg border border-line-subtle bg-card-white p-4"
          >
            <h2 id="origem-direitos" className="type-section text-strong">
              {T.details}
            </h2>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {[
                [T.field.kind, T.kind[m.kind] ?? m.kind],
                [T.field.credit, m.credit ?? "—"],
                [T.field.license, m.license],
                [
                  T.field.licenseUntil,
                  m.licenseUntil
                    ? `${formatDate(m.licenseUntil)}${expired ? ` · ${T.expired}` : ""}`
                    : T.noUntil,
                ],
                [T.field.source, m.sourceName ?? "—"],
                [T.field.risk, T.risk[m.risk] ?? m.risk],
                [T.field.allowedUse, m.allowedUse],
                [T.field.captured, formatDateTime(m.capturedAt)],
                [T.field.size, m.width && m.height ? `${m.width} × ${m.height}` : "—"],
                ...(m.removalReason ? [[T.field.removal, m.removalReason]] : []),
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="type-meta text-meta">{k}</dt>
                  <dd className="type-body text-strong">{v}</dd>
                </div>
              ))}
              {m.pageUrl && (
                <div className="sm:col-span-2">
                  <dt className="type-meta text-meta">{T.field.page}</dt>
                  <dd className="type-body">
                    <a
                      href={m.pageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-link underline"
                    >
                      {m.pageUrl}
                      <span className="sr-only"> (abre em nova aba)</span>
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </section>
          <section
            aria-labelledby="usada-em"
            className="rounded-lg border border-line-subtle bg-card-white p-4"
          >
            <h2 id="usada-em" className="type-section text-strong">
              {T.usedIn}
            </h2>
            {m.articles.length === 0 ? (
              <p className="mt-2 type-body text-meta">{T.notUsed}</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {m.articles.map((a) => (
                  <li key={a.id} className="type-body">
                    <Link
                      href={`/estudio/materias/${a.id}`}
                      className="font-semibold text-strong underline-offset-4 hover:underline"
                    >
                      {a.title}
                    </Link>
                    <span className="block type-meta text-meta">
                      {ARTICLE_STATUS_LABEL[a.status as keyof typeof ARTICLE_STATUS_LABEL] ??
                        a.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <ImageApproval
          mediaId={m.id}
          status={m.status}
          approve={canApprove ? approveImageAction : undefined}
          block={canApprove ? blockImageAction : undefined}
          replace={
            replaceable.length
              ? {
                  articles: replaceable.map((a) => ({ id: a.id, title: a.title })),
                  options,
                  run: replaceImageAction,
                }
              : undefined
          }
        />
      </div>
    </article>
  );
}
