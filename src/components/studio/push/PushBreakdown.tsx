import { PUSH_HISTORY_TEXT as T } from "@/content/pt-BR/notifications-admin";
import type { HistoryDetail } from "@/lib/db/queries/push-admin";
import { cx } from "../../cx";

export interface PushBreakdownProps {
  rows: HistoryDetail["byDevice"];
  className?: string;
}

const deviceName = (d: string) => T.detail.device[d] ?? d;
const browserName = (b: string) => T.detail.browser[b] ?? b;

/** Resumo textual do detalhamento (regra fixa, sem IA). */
export function breakdownSummary(rows: HistoryDetail["byDevice"]): string {
  const delivered = rows.reduce((s, r) => s + r.delivered, 0);
  const clicked = rows.reduce((s, r) => s + r.clicked, 0);
  const top = rows.filter((r) => r.delivered > 0).sort((a, b) => b.delivered - a.delivered)[0];
  return T.detail.summary(
    delivered,
    clicked,
    top ? `${deviceName(top.device)} · ${browserName(top.browser)}` : null,
  );
}

/**
 * Detalhamento por classe de aparelho e navegador (spec §10.4): tabela (`<th scope="col">`) e
 * gráfico de barras SVG (enviados, recebidos, tocados) com cores dos tokens, sem gradiente, e
 * resumo textual visível. O gráfico é `role="img"` com o resumo como nome.
 */
export function PushBreakdown({ rows, className }: PushBreakdownProps) {
  const summary = breakdownSummary(rows);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.sent, r.delivered, r.clicked)));
  const w = (n: number) => Math.max(n > 0 ? 1 : 0, (n / max) * 100);
  if (rows.length === 0)
    return <p className={cx("type-body text-meta", className)}>{T.detail.noBreakdown}</p>;
  return (
    <figure className={cx("flex flex-col gap-4", className)}>
      <figcaption className="type-body text-strong">{summary}</figcaption>
      <div
        role="img"
        aria-label={`${T.detail.breakdownChart}. ${summary}`}
        className="flex flex-col gap-3"
      >
        {rows.map((r) => (
          <div
            key={`${r.device}|${r.browser}`}
            className="grid grid-cols-[9rem_1fr] items-center gap-3"
          >
            <span aria-hidden="true" className="type-meta font-semibold text-strong">
              {deviceName(r.device)} · {browserName(r.browser)}
            </span>
            <svg
              aria-hidden="true"
              viewBox="0 0 100 18"
              preserveAspectRatio="none"
              className="h-8 w-full"
            >
              <rect x={0} y={0} width={w(r.sent)} height={5} className="fill-line-strong" />
              <rect x={0} y={6.5} width={w(r.delivered)} height={5} className="fill-cerrado" />
              <rect x={0} y={13} width={w(r.clicked)} height={5} className="fill-urucum" />
            </svg>
          </div>
        ))}
      </div>
      <table className="w-full border-collapse type-body">
        <caption className="sr-only">{T.detail.breakdown}</caption>
        <thead>
          <tr className="border-b border-line-section text-left type-meta text-meta">
            {Object.values(T.detail.columns).map((h) => (
              <th key={h} scope="col" className="py-2 pr-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.device}|${r.browser}`} className="border-b border-line-section">
              <td className="py-2 pr-3 text-strong">{deviceName(r.device)}</td>
              <td className="py-2 pr-3 text-strong">{browserName(r.browser)}</td>
              <td className="py-2 pr-3 text-right text-strong">{r.sent}</td>
              <td className="py-2 pr-3 text-right text-strong">{r.delivered}</td>
              <td className="py-2 text-right text-strong">{r.clicked}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
