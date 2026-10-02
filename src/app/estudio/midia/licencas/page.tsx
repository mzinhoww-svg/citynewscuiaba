import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState, InlineAlert } from "@/components";
import { LicenseActions } from "@/components/estudio";
import { MEDIA_TEXT as T, QUEUE_TEXT } from "@/content/pt-BR/studio";
import { canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { licensesOverview, type LicensesOverview } from "@/lib/db/queries/studio-media";
import { formatDate } from "@/lib/format/date";
import { blockExpiredAction, renewLicenseAction } from "../../actions";

export const metadata: Metadata = { title: "Direitos e licenças · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

export default async function LicensesPage() {
  const session = await requireRole("media.approve", undefined, {
    next: "/estudio/midia/licencas",
  });
  let data: LicensesOverview | null = null;
  try {
    data = await licensesOverview();
  } catch {
    data = null;
  }
  const manage = canAccess(session.roles, "media.approve");

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/estudio/midia"
          className="type-meta font-medium text-link underline-offset-4 hover:underline"
        >
          {T.back}
        </Link>
        <h1 className="type-screen-title text-strong">{T.licensesTitle}</h1>
        <p className="type-body text-meta">{T.licensesIntro}</p>
      </header>
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={QUEUE_TEXT.errorTitle}
          actions={
            <Button href="/estudio/midia/licencas" size="md" variant="outline">
              {QUEUE_TEXT.retry}
            </Button>
          }
        >
          {QUEUE_TEXT.errorBody}
        </EmptyState>
      ) : (
        <>
          {data.alerts.length > 0 && (
            <InlineAlert tone="warn" role="none" title={T.alertsTitle}>
              <ul className="flex flex-col gap-1">
                {data.alerts.map((a) => (
                  <li key={`${a.mediaId}:${a.articleId}`}>
                    {a.message}{" "}
                    <Link
                      href={`/estudio/midia/${a.mediaId}`}
                      className="font-semibold text-link underline"
                    >
                      {T.replace}
                    </Link>
                  </li>
                ))}
              </ul>
            </InlineAlert>
          )}
          {data.licenses.length === 0 ? (
            <EmptyState title={T.emptyTitle} icon="file-check">
              {T.noLicenses}
            </EmptyState>
          ) : (
            <div
              role="region"
              aria-label={T.licensesCaption}
              tabIndex={0}
              className="relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
            >
              <table className="w-full min-w-[48rem] border-collapse text-left">
                <caption className="sr-only">{T.licensesCaption}</caption>
                <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                  <tr>
                    <th scope="col" className="px-3 py-3">
                      {T.col.license}
                    </th>
                    <th scope="col" className="px-3 py-3">
                      {T.col.until}
                    </th>
                    <th scope="col" className="px-3 py-3">
                      {T.col.images}
                    </th>
                    <th scope="col" className="px-3 py-3">
                      {T.col.alert}
                    </th>
                    {manage && (
                      <th scope="col" className="px-3 py-3">
                        {T.col.actions}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.licenses.map((l) => (
                    <tr
                      key={l.license}
                      className="border-b border-line-subtle align-top last:border-b-0"
                    >
                      <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                        {l.license}
                      </th>
                      <td className="px-3 py-3 type-body tabular-nums">
                        {l.until ? formatDate(l.until) : T.noUntil}
                      </td>
                      <td className="px-3 py-3 type-body tabular-nums">{l.images}</td>
                      <td className="px-3 py-3 type-body">
                        {l.daysLeft === null ? (
                          <span className="text-meta">{T.valid}</span>
                        ) : l.daysLeft < 0 ? (
                          <span className="font-semibold text-danger">
                            {T.expiredAgo(-l.daysLeft)}
                          </span>
                        ) : (
                          <span className="font-semibold text-warn">{T.expiresIn(l.daysLeft)}</span>
                        )}
                      </td>
                      {manage && (
                        <td className="px-3 py-3">
                          <LicenseActions
                            license={l.license}
                            expiredImages={l.expiredImages}
                            renew={renewLicenseAction}
                            blockExpired={blockExpiredAction}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <section aria-labelledby="acordos" className="flex flex-col gap-2">
            <h2 id="acordos" className="type-section text-strong">
              {T.agreementsTitle}
            </h2>
            <div
              role="region"
              aria-label={T.agreementsCaption}
              tabIndex={0}
              className="relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
            >
              <table className="w-full min-w-[32rem] border-collapse text-left">
                <caption className="sr-only">{T.agreementsCaption}</caption>
                <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                  <tr>
                    <th scope="col" className="px-3 py-3">
                      {T.agreementCol.source}
                    </th>
                    <th scope="col" className="px-3 py-3">
                      {T.agreementCol.policy}
                    </th>
                    <th scope="col" className="px-3 py-3">
                      {T.agreementCol.until}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.agreements.map((a) => (
                    <tr key={a.source} className="border-b border-line-subtle last:border-b-0">
                      <th scope="row" className="px-3 py-3 type-body font-normal text-strong">
                        {a.source}
                      </th>
                      <td className="px-3 py-3 type-body">{T.policy[a.policy] ?? a.policy}</td>
                      <td className="px-3 py-3 type-body tabular-nums">
                        {a.until ? (
                          formatDate(a.until)
                        ) : (
                          <span className="text-meta">{T.noAgreement}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
