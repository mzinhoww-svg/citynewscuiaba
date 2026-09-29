import { Button, EmptyState, Icon } from "@/components";
import { DETAIL, ITEMS as T } from "@/content/pt-BR/sources-admin-detail";
import { sourceRecentItems } from "@/lib/db/queries/sources-admin";
import { formatDateTime } from "@/lib/format/date";
import { NEXT } from "../data";

export default async function ItemsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await sourceRecentItems(id, 50);
  if (!res.ok)
    return (
      <EmptyState
        tone="error"
        title={DETAIL.errorTitle}
        actions={
          <Button size="md" variant="outline" href={`${NEXT}/${id}/itens`}>
            {DETAIL.retry}
          </Button>
        }
      >
        {DETAIL.sectionError}
      </EmptyState>
    );
  return (
    <div className="flex flex-col gap-4">
      <h2 className="type-section text-strong">{T.title}</h2>
      <p className="type-body text-meta">{T.intro}</p>
      {res.value.length === 0 ? (
        <p className="type-body text-meta">{T.empty}</p>
      ) : (
        <div
          role="region"
          aria-label={T.caption}
          tabIndex={0}
          className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
        >
          <table className="w-full min-w-[32rem] border-collapse text-left">
            <caption className="sr-only">{T.caption}</caption>
            <thead className="border-b border-line-subtle bg-section">
              <tr>
                <th scope="col" className="px-3 py-2 type-meta text-meta">
                  {T.colTitle}
                </th>
                <th scope="col" className="px-3 py-2 type-meta text-meta">
                  {T.colPublished}
                </th>
                <th scope="col" className="px-3 py-2 type-meta text-meta">
                  {T.colCollected}
                </th>
              </tr>
            </thead>
            <tbody>
              {res.value.map((it) => (
                <tr key={it.id} className="border-b border-line-subtle align-top last:border-b-0">
                  <td className="px-3 py-3 type-body">
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={T.open(it.title)}
                      className="inline-flex items-center gap-2 font-semibold text-strong underline-offset-4 hover:underline"
                    >
                      {it.title}
                      <Icon name="external-link" size={16} className="shrink-0 text-meta" />
                    </a>
                  </td>
                  <td className="px-3 py-3 type-body whitespace-nowrap">
                    {it.publishedAt ? formatDateTime(it.publishedAt) : T.noDate}
                  </td>
                  <td className="px-3 py-3 type-body whitespace-nowrap">
                    {formatDateTime(it.collectedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
