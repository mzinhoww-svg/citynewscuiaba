import { ADS_ADMIN_TEXT, SLOT_NAME } from "@/content/pt-BR/ads-admin";
import { percent, type AdReport, type Group } from "@/lib/ads/report";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { AdminTable } from "./AdminStatus";

const T = ADS_ADMIN_TEXT.report;
const n = (v: number) => v.toLocaleString("pt-BR");

function GroupTable({
  caption,
  rows,
  label,
}: {
  caption: string;
  rows: Group[];
  label?: (k: string) => string;
}) {
  return (
    <AdminTable
      caption={caption}
      headers={[caption, T.impressions, T.views, T.clicks, T.ctr, T.viewRate]}
      minWidth="min-w-[36rem]"
    >
      {rows.map((g) => (
        <tr key={g.key} className="border-b border-line-subtle last:border-0">
          <th scope="row" className="px-3 py-2 type-body font-medium text-strong">
            {label ? label(g.key) : g.key}
          </th>
          <td className="px-3 py-2 type-body tabular-nums text-body">{n(g.impressions)}</td>
          <td className="px-3 py-2 type-body tabular-nums text-body">{n(g.views)}</td>
          <td className="px-3 py-2 type-body tabular-nums text-body">{n(g.clicks)}</td>
          <td className="px-3 py-2 type-body tabular-nums text-body">{percent(g.ctr)}</td>
          <td className="px-3 py-2 type-body tabular-nums text-body">{percent(g.viewRate)}</td>
        </tr>
      ))}
    </AdminTable>
  );
}

/**
 * Relatório dos banners (ADS-T4): período por formulário GET (URL compartilhável), totais com CTR
 * e taxa de visualização, quebras por campo, dia, anunciante e editoria, e CSV do período.
 */
export function AdReportPanel({
  report,
  period,
  csvHref,
}: {
  report: AdReport;
  period: { from: string; to: string };
  csvHref: string;
}) {
  const t = report.total;
  return (
    <section aria-labelledby="ads-rep" className="flex flex-col gap-6">
      <h2 id="ads-rep" className="type-section text-strong">
        {T.title}
      </h2>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 type-meta font-semibold text-strong">
          {T.from}
          <input
            type="date"
            name="de"
            defaultValue={period.from}
            className="min-h-tap rounded-md border border-line-strong bg-card-white px-3 type-body text-strong"
          />
        </label>
        <label className="flex flex-col gap-1.5 type-meta font-semibold text-strong">
          {T.to}
          <input
            type="date"
            name="ate"
            defaultValue={period.to}
            className="min-h-tap rounded-md border border-line-strong bg-card-white px-3 type-body text-strong"
          />
        </label>
        <Button size="md" variant="outline" type="submit">
          {T.apply}
        </Button>
        <Button size="md" variant="outline" icon="download" href={csvHref} download>
          {T.csv}
        </Button>
      </form>
      <p className="max-w-read type-meta text-meta">{T.note}</p>
      {t.impressions === 0 && t.clicks === 0 ? (
        <EmptyState title={T.empty} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {(
              [
                [T.impressions, n(t.impressions)],
                [T.views, n(t.views)],
                [T.clicks, n(t.clicks)],
                [T.ctr, percent(t.ctr)],
                [T.viewRate, percent(t.viewRate)],
              ] as const
            ).map(([k, v]) => (
              <div
                key={k}
                className="flex flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-4"
              >
                <dt className="type-meta text-meta">{k}</dt>
                <dd className="type-headline-sm tabular-nums text-strong">{v}</dd>
              </div>
            ))}
          </dl>
          <GroupTable
            caption={T.bySlot}
            rows={report.bySlot}
            label={(k) => `${SLOT_NAME[k] ?? k} (${k})`}
          />
          <GroupTable caption={T.byAdvertiser} rows={report.byAdvertiser} />
          <GroupTable caption={T.bySection} rows={report.bySection} />
          <GroupTable caption={T.byDay} rows={report.byDay} />
        </>
      )}
    </section>
  );
}
