import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState } from "@/components";
import { AI_TEXT, formatInt, formatPct } from "@/content/pt-BR/ai-control";
import { requireRole } from "@/lib/auth/require-role";
import { canAccess } from "@/lib/auth";
import { knowledgeBases } from "@/lib/db/queries/ai-control";
import { formatDateTime } from "@/lib/format/date";
import { NEIGHBORHOODS } from "@/lib/geo";
import { loadOrNull } from "../../load-error";

export const metadata: Metadata = {
  title: "Bases de conhecimento · Control Center · CityNews Cuiabá",
};
export const dynamic = "force-dynamic";

const T = AI_TEXT.knowledge;

export default async function KnowledgePage() {
  const session = await requireRole("metrics.view", undefined, {
    next: "/estudio/control/conhecimento",
  });
  const data = await loadOrNull("ai knowledge", () => knowledgeBases());
  const share = (n: number, total: number) => (total > 0 ? formatPct(n / total) : AI_TEXT.none);

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="type-eyebrow">{AI_TEXT.sectionLabel}</p>
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
      </header>
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={AI_TEXT.errorTitle}
          actions={
            <Button href="/estudio/control/conhecimento" size="md" variant="outline">
              {AI_TEXT.retry}
            </Button>
          }
        >
          {AI_TEXT.errorBody}
        </EmptyState>
      ) : data.value.length === 0 ? (
        <EmptyState icon="database" title={T.empty} />
      ) : (
        <>
          <div
            role="region"
            aria-label={T.caption}
            tabIndex={0}
            className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
          >
            <table className="w-full min-w-[52rem] border-collapse text-left">
              <caption className="sr-only">{T.caption}</caption>
              <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                <tr>
                  <th scope="col" className="px-3 py-3">
                    {T.col.base}
                  </th>
                  <th scope="col" className="px-3 py-3">
                    {T.col.use}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    {T.col.total}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    {T.col.indexed}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    {T.col.embedded}
                  </th>
                  <th scope="col" className="px-3 py-3">
                    {T.col.updated}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.value.map((b) => {
                  const info = T.bases[b.base] ?? { name: b.base, use: "" };
                  const vectors =
                    b.base === "articles" || b.base === "aggregated" || b.base === "topics";
                  return (
                    <tr key={b.base} className="border-b border-line-subtle last:border-b-0">
                      <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                        {info.name}
                      </th>
                      <td className="px-3 py-3 type-meta text-body">{info.use}</td>
                      <td className="px-3 py-3 text-right type-body tabular-nums">
                        {formatInt(b.total)}
                      </td>
                      <td className="px-3 py-3 text-right type-body tabular-nums">
                        {b.base === "sources"
                          ? `${formatInt(b.indexed)} ${T.activeSources}`
                          : share(b.indexed, b.total)}
                      </td>
                      <td className="px-3 py-3 text-right type-body tabular-nums">
                        {vectors ? share(b.embedded, b.total) : T.notApplicable}
                      </td>
                      <td className="px-3 py-3 type-body tabular-nums">
                        {b.updatedAt ? formatDateTime(b.updatedAt) : AI_TEXT.none}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="type-meta text-meta">{T.pendingNote}</p>
          <section aria-labelledby="dicionario" className="flex flex-col gap-2">
            <h2 id="dicionario" className="type-section text-strong">
              {T.dictionaryTitle}
            </h2>
            <p className="type-body text-body">{T.dictionaryText(NEIGHBORHOODS.length)}</p>
          </section>
          {canAccess(session.roles, "audit.view") && (
            <Link
              href="/estudio/control/logs?etapa=index"
              className="type-body font-medium text-link underline-offset-4 hover:underline"
            >
              {T.logsLink}
            </Link>
          )}
        </>
      )}
    </section>
  );
}
