import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button, EmptyState, Panel, Table } from "@/components";
import { fullDateTime } from "@/content/pt-BR/sources-admin";
import { DETAIL_TEXT } from "@/content/pt-BR/sources-admin-detail";
import { EVENT_TABS_TEXT as T } from "@/content/pt-BR/sources-admin-events";
import { REJECT_REASON_TEXT } from "@/content/pt-BR/studio-agenda";
import { agendaRejections } from "@/lib/db/queries/agenda-runs";
import { detailPath, loadSource } from "../detail";

export const metadata: Metadata = { title: "Recusas · Control Center · CityNews Cuiabá" };

type Props = { params: Promise<{ id: string }> };

const isWebUrl = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};

/**
 * Aba Recusas da fonte de eventos (AGM-T6, spec §5.1): páginas recusadas nas últimas 10 coletas
 * desta fonte, com o motivo em texto. Só para fontes de eventos.
 */
export default async function SourceRejectionsPage({ params }: Props) {
  const { id } = await params;
  const detail = await loadSource(id);
  if (!detail.ok) throw new Error(detail.error.kind);
  const d = detail.value;
  if (!d || !d.event) notFound();
  const rejections = await agendaRejections(d.id);

  return (
    <section className="flex flex-col gap-6">
      <h2 className="sr-only">{DETAIL_TEXT.sections.rejections}</h2>
      <Panel aria-labelledby="recusas-titulo" className="flex flex-col gap-3 sm:p-5">
        <h2 id="recusas-titulo" className="type-section text-strong">
          {T.rejectionsTitle}
        </h2>
        <p className="type-meta text-meta">{T.rejectionsIntro}</p>
        {!rejections.ok ? (
          <EmptyState
            tone="error"
            title={DETAIL_TEXT.error.tab}
            actions={<Button href={detailPath(d.id, "/recusas")}>{DETAIL_TEXT.error.retry}</Button>}
          />
        ) : rejections.value.length === 0 ? (
          <p className="type-body text-meta">{T.rejectionsEmpty}</p>
        ) : (
          <Table
            caption={T.rejectionsTitle}
            minWidth="sm"
            headers={[T.rejectionsCols.reason, T.rejectionsCols.page, T.rejectionsCols.when]}
          >
            {rejections.value.map((r) => (
              <tr key={`${r.reason}-${r.url}`} className="border-b border-line-section type-body">
                <td className="px-3 py-2 font-semibold text-strong">
                  {REJECT_REASON_TEXT[r.reason]}
                </td>
                <td className="max-w-[28rem] px-3 py-2 break-all text-strong">
                  {isWebUrl(r.url) ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-link underline-offset-4 hover:underline"
                    >
                      {r.url}
                    </a>
                  ) : (
                    r.url
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-strong">{fullDateTime(r.at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </section>
  );
}
