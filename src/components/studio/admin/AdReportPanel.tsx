import { ADS_ADMIN_TEXT, SLOT_NAME } from "@/content/pt-BR/ads-admin";
import { percent, type AdReport, type Group } from "@/lib/ads/report";
import { Button } from "../../ui/Button";
import { CollapsibleFilters } from "../../ui/CollapsibleFilters";
import { DateField } from "../../ui/DateField";
import { EmptyState } from "../../ui/EmptyState";
import { StatGrid } from "../../ui/StatGrid";
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
      <CollapsibleFilters
        actions={
          <Button size="md" variant="outline" icon="download" href={csvHref} download>
            {T.csv}
          </Button>
        }
      >
        <form method="get" className="flex flex-wrap items-end gap-3">
          <DateField id="ads-rep-de" name="de" label={T.from} defaultValue={period.from} />
          <DateField id="ads-rep-ate" name="ate" label={T.to} defaultValue={period.to} />
          <Button size="md" variant="outline" type="submit">
            {T.apply}
          </Button>
        </form>
      </CollapsibleFilters>
      <p className="max-w-read type-meta text-meta">{T.note}</p>
      {t.impressions === 0 && t.clicks === 0 ? (
        <EmptyState title={T.empty} />
      ) : (
        <>
          <StatGrid
            columns={5}
            items={[
              { label: T.impressions, value: n(t.impressions) },
              { label: T.views, value: n(t.views) },
              { label: T.clicks, value: n(t.clicks) },
              { label: T.ctr, value: percent(t.ctr) },
              { label: T.viewRate, value: percent(t.viewRate) },
            ]}
          />
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
