import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState } from "@/components";
import { QueueTabs } from "@/components/estudio";
import { CORRECTIONS_TEXT as T, QUEUE_TEXT } from "@/content/pt-BR/studio";
import { requireRole } from "@/lib/auth/require-role";
import { listCorrectionQueue, type CorrectionRow } from "@/lib/db/queries/studio-corrections";
import { formatDateTime } from "@/lib/format/date";

export const metadata: Metadata = { title: "Correções · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

export default async function CorrectionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole("correction.manage", undefined, { next: "/estudio/correcoes" });
  const sp = await searchParams;
  const tab = sp.estado === "publicadas" ? "published" : "open";
  let rows: CorrectionRow[] | null = null;
  try {
    rows = await listCorrectionQueue(tab);
  } catch {
    rows = null;
  }
  const now = new Date().getTime();

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
      </header>
      <QueueTabs
        label={T.tabsLabel}
        current={tab}
        items={[
          { key: "open", label: T.tabs.open, href: "/estudio/correcoes" },
          {
            key: "published",
            label: T.tabs.published,
            href: "/estudio/correcoes?estado=publicadas",
          },
        ]}
      />
      {rows === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={QUEUE_TEXT.errorTitle}
          actions={
            <Button href="/estudio/correcoes" size="md" variant="outline">
              {QUEUE_TEXT.retry}
            </Button>
          }
        >
          {QUEUE_TEXT.errorBody}
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title={T.emptyTitle} icon="check">
          {T.empty[tab]}
        </EmptyState>
      ) : (
        <div
          role="region"
          aria-label={T.caption}
          tabIndex={0}
          className="relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
        >
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <caption className="sr-only">{T.caption}</caption>
            <thead className="border-b border-line-subtle bg-section type-meta text-meta">
              <tr>
                <th scope="col" className="px-3 py-3">
                  {T.col.article}
                </th>
                <th scope="col" className="px-3 py-3">
                  {T.col.kind}
                </th>
                <th scope="col" className="px-3 py-3">
                  {T.col.requestedBy}
                </th>
                <th scope="col" className="px-3 py-3">
                  {tab === "open" ? T.col.due : T.publishedAt}
                </th>
                <th scope="col" className="px-3 py-3">
                  {T.col.status}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const overdue = tab === "open" && Date.parse(c.dueAt) < now;
                return (
                  <tr key={c.id} className="border-b border-line-subtle align-top last:border-b-0">
                    <th scope="row" className="px-3 py-3 font-normal">
                      <Link
                        href={`/estudio/correcoes/${c.id}`}
                        className="type-body font-semibold text-strong underline-offset-4 hover:underline"
                      >
                        {c.article.title}
                      </Link>
                    </th>
                    <td className="px-3 py-3 type-body">{T.kind[c.kind] ?? c.kind}</td>
                    <td className="px-3 py-3 type-body">{c.requestedBy}</td>
                    <td className="px-3 py-3 type-body tabular-nums">
                      <span className={overdue ? "font-semibold text-danger" : "text-strong"}>
                        {overdue && <span className="sr-only">{T.overdue}: </span>}
                        {formatDateTime(tab === "open" ? c.dueAt : (c.publishedAt ?? c.dueAt))}
                      </span>
                    </td>
                    <td className="px-3 py-3 type-body">
                      {T.status[c.status] ?? c.status}
                      {tab === "published" && (
                        <span className="block type-meta text-meta">{T.notified(c.notified)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
