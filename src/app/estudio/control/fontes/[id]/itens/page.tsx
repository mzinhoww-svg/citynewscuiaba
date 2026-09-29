import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, EmptyState, Icon } from "@/components";
import { fullDateTime } from "@/content/pt-BR/sources-admin";
import { DETAIL_TEXT, ITEMS_TAB_TEXT as T } from "@/content/pt-BR/sources-admin-detail";
import { sourceRecentItems } from "@/lib/db/queries/sources-admin";
import { detailPath, loadSource } from "../detail";

export const metadata: Metadata = { title: "Itens da fonte · Control Center · CityNews Cuiabá" };

type Props = { params: Promise<{ id: string }> };

/** Aba Itens (spec §8): últimos 50 itens coletados, só título, data, estado e assunto; link para o original. */
export default async function SourceItemsPage({ params }: Props) {
  const { id } = await params;
  const detail = await loadSource(id);
  if (!detail.ok) throw new Error(detail.error.kind);
  const d = detail.value;
  if (!d) notFound();
  const items = await sourceRecentItems(d.id);
  return (
    <section className="flex flex-col gap-4">
      <h2 className="type-section text-strong">{T.title}</h2>
      {!items.ok ? (
        <EmptyState
          tone="error"
          title={DETAIL_TEXT.error.tab}
          actions={<Button href={detailPath(d.id, "/itens")}>{DETAIL_TEXT.error.retry}</Button>}
        />
      ) : items.value.length === 0 ? (
        <p className="type-body text-meta">{T.empty}</p>
      ) : (
        <div
          className="overflow-x-auto rounded-lg border border-line-section bg-card-white p-4"
          role="region"
          aria-label={T.title}
          tabIndex={0}
        >
          <table className="w-full min-w-2xl border-collapse type-body">
            <thead>
              <tr className="border-b border-line-section text-left type-meta text-meta">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {T.columns.title}
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {T.columns.date}
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {T.columns.state}
                </th>
                <th scope="col" className="py-2 font-semibold">
                  {T.columns.topic}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.value.map((it) => (
                <tr key={it.id} className="border-b border-line-section align-top">
                  <td className="py-2 pr-3">
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-link underline-offset-4 hover:underline"
                    >
                      {it.title}
                      <Icon name="external-link" size={14} className="ml-1 inline align-baseline" />
                    </a>
                    <p className="type-meta text-meta">
                      {T.collected(fullDateTime(it.collectedAt))}
                    </p>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-strong">
                    {it.publishedAt ? fullDateTime(it.publishedAt) : T.noDate}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-strong">
                    {T.state[it.state] ?? it.state}
                  </td>
                  <td className="py-2 text-strong">
                    {it.topicId ? (
                      <Link
                        href={`/estudio/assuntos/${it.topicId}`}
                        className="text-link underline-offset-4 hover:underline"
                      >
                        {T.topic}
                      </Link>
                    ) : (
                      T.noTopic
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
