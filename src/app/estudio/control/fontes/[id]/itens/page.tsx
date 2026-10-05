import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, EmptyState, Icon, Table } from "@/components";
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
        <Table
          caption={T.title}
          minWidth="md"
          headers={[T.columns.title, T.columns.date, T.columns.state, T.columns.topic]}
        >
          {items.value.map((it) => (
            <tr key={it.id} className="border-b border-line-section align-top type-body">
              <td className="px-3 py-2">
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-link underline-offset-4 hover:underline"
                >
                  {it.title}
                  <Icon name="external-link" size={14} className="ml-1 inline align-baseline" />
                </a>
                <p className="type-meta text-meta">{T.collected(fullDateTime(it.collectedAt))}</p>
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-strong">
                {it.publishedAt ? fullDateTime(it.publishedAt) : T.noDate}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-strong">
                {T.state[it.state] ?? it.state}
              </td>
              <td className="px-3 py-2 text-strong">
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
        </Table>
      )}
    </section>
  );
}
