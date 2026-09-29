import { HEALTH as T } from "@/content/pt-BR/sources-admin-detail";
import { formatDateTime } from "@/lib/format/date";
import { cx } from "../../cx";
import { FrequencyLabel } from "./FrequencyLabel";
import { HealthBadge, type HealthBadgeState } from "./HealthBadge";

export interface HealthDayView {
  day: string;
  ok: number;
  notModified: number;
  failed: number;
  itemsNew: number;
  avgLatencyMs: number | null;
  lastError: string | null;
}

export interface SourceHealthPanelProps {
  health: {
    days: readonly HealthDayView[];
    score: number | null;
    label: HealthBadgeState;
    ok30: number;
    failed30: number;
    ok24h: number;
    failed24h: number;
    hoursSinceNewItem: number | null;
  };
  /** Dia de hoje em Cuiabá (`AAAA-MM-DD`): o último da faixa de 30 dias do gráfico. */
  today: string;
  lastFetchedAt: string | null;
  nextCollectionAt: string | null;
  lastError: string | null;
  frequency: {
    chosen: number | null;
    effective: number;
    raisedBy: "robots" | "terms" | null;
  };
  className?: string;
}

const DAY_MS = 86_400_000;

/** Os 30 dias que terminam em `today`, com zeros nos dias sem coleta. */
export function chartDays(days: readonly HealthDayView[], today: string): HealthDayView[] {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const end = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: 30 }, (_, i) => {
    const key = new Date(end - (29 - i) * DAY_MS).toISOString().slice(0, 10);
    return (
      byDay.get(key) ?? {
        day: key,
        ok: 0,
        notModified: 0,
        failed: 0,
        itemsNew: 0,
        avgLatencyMs: null,
        lastError: null,
      }
    );
  });
}

const dayText = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Resumo e saúde da fonte (aba inicial): score operacional com seus componentes, gráfico de 30
 * dias em SVG com resumo em texto e tabela dos dados, última e próxima coleta e último erro.
 * O gráfico é decoração informada: tudo o que ele mostra também está em texto.
 */
export function SourceHealthPanel({
  health,
  today,
  lastFetchedAt,
  nextCollectionAt,
  lastError,
  frequency,
  className,
}: SourceHealthPanelProps) {
  const days = chartDays(health.days, today);
  const max = Math.max(1, ...days.map((d) => d.ok + d.notModified + d.failed));
  const items = days.reduce((n, d) => n + d.itemsNew, 0);
  const W = 300;
  const H = 80;
  const slot = W / days.length;
  const empty = days.every((d) => d.ok + d.notModified + d.failed === 0);
  const chartId = "saude-grafico";
  return (
    <div className={cx("flex flex-col gap-8", className)}>
      <section aria-labelledby="saude-score" className="flex flex-col gap-4">
        <h2 id="saude-score" className="type-section text-strong">
          {T.title}
        </h2>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex flex-col gap-1">
            <span className="type-meta text-meta">{T.score}</span>
            <HealthBadge state={health.label} score={health.score} />
            {health.score === null && <span className="type-meta text-meta">{T.scoreNone}</span>}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="type-label text-16 text-strong">{T.components}</h3>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-line-section bg-card-white p-4">
              <dt className="type-meta text-meta">{T.availability}</dt>
              <dd className="type-body font-semibold text-strong">
                {T.availabilityValue(health.ok30, health.failed30)}
              </dd>
            </div>
            <div className="rounded-lg border border-line-section bg-card-white p-4">
              <dt className="type-meta text-meta">{T.errorRate}</dt>
              <dd className="type-body font-semibold text-strong">
                {T.errorRateValue(health.failed24h, health.ok24h)}
              </dd>
            </div>
            <div className="rounded-lg border border-line-section bg-card-white p-4">
              <dt className="type-meta text-meta">{T.freshness}</dt>
              <dd className="type-body font-semibold text-strong">
                {T.freshnessValue(health.hoursSinceNewItem)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section aria-labelledby="saude-coletas" className="flex flex-col gap-3">
        <h2 id="saude-coletas" className="type-section text-strong">
          {T.chartTitle}
        </h2>
        <p id={`${chartId}-resumo`} className="type-body text-strong">
          {T.chartSummary(health.ok30 + 0, health.failed30, items)}
        </p>
        {empty ? (
          <p className="type-meta text-meta">{T.chartEmpty}</p>
        ) : (
          <>
            <svg
              role="img"
              aria-labelledby={`${chartId}-resumo`}
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="h-32 w-full rounded-lg border border-line-section bg-card-white"
            >
              {days.map((d, i) => {
                const okH = ((d.ok + d.notModified) / max) * (H - 4);
                const failH = (d.failed / max) * (H - 4);
                const x = i * slot + slot * 0.15;
                const w = slot * 0.7;
                return (
                  <g key={d.day}>
                    <rect
                      x={x}
                      y={H - okH}
                      width={w}
                      height={okH}
                      className="fill-current text-service"
                    />
                    <rect
                      x={x}
                      y={H - okH - failH}
                      width={w}
                      height={failH}
                      className="fill-current text-danger"
                    />
                  </g>
                );
              })}
            </svg>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 type-meta text-meta" aria-label="Legenda">
              <li className="flex items-center gap-1">
                <span aria-hidden="true" className="size-3 bg-service" />
                {T.legendOk}
              </li>
              <li className="flex items-center gap-1">
                <span aria-hidden="true" className="size-3 bg-danger" />
                {T.legendFailed}
              </li>
            </ul>
          </>
        )}
        <details className="rounded-lg border border-line-section bg-card-white px-4 py-3">
          <summary className="min-h-tap cursor-pointer py-2 type-label text-16 text-strong">
            {T.dataTable}
          </summary>
          <div
            role="region"
            aria-label={T.chartTitle}
            tabIndex={0}
            className="mt-2 max-h-96 overflow-auto"
          >
            <table className="w-full min-w-[28rem] border-collapse text-left">
              <caption className="sr-only">{T.chartTitle}</caption>
              <thead className="border-b border-line-subtle">
                <tr>
                  <th scope="col" className="px-3 py-2 type-meta text-meta">
                    {T.colDay}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right type-meta text-meta">
                    {T.colOk}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right type-meta text-meta">
                    {T.colNotModified}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right type-meta text-meta">
                    {T.colFailed}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right type-meta text-meta">
                    {T.colItems}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right type-meta text-meta">
                    {T.colLatency}
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...days].reverse().map((d) => (
                  <tr key={d.day} className="border-b border-line-subtle last:border-b-0">
                    <th scope="row" className="px-3 py-2 type-body font-normal tabular-nums">
                      {dayText(d.day)}
                    </th>
                    <td className="px-3 py-2 text-right type-body tabular-nums">{d.ok}</td>
                    <td className="px-3 py-2 text-right type-body tabular-nums">{d.notModified}</td>
                    <td className="px-3 py-2 text-right type-body tabular-nums">{d.failed}</td>
                    <td className="px-3 py-2 text-right type-body tabular-nums">{d.itemsNew}</td>
                    <td className="px-3 py-2 text-right type-body tabular-nums">
                      {T.latency(d.avgLatencyMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section aria-labelledby="saude-ultima" className="flex flex-col gap-3">
        <h2 id="saude-ultima" className="sr-only">
          {T.lastCollection}
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line-section bg-card-white p-4">
            <dt className="type-meta text-meta">{T.lastCollection}</dt>
            <dd className="type-body font-semibold text-strong">
              {lastFetchedAt ? formatDateTime(lastFetchedAt) : T.never}
            </dd>
          </div>
          <div className="rounded-lg border border-line-section bg-card-white p-4">
            <dt className="type-meta text-meta">{T.nextCollection}</dt>
            <dd>
              <FrequencyLabel
                chosen={frequency.chosen}
                effective={frequency.effective}
                raisedBy={frequency.raisedBy}
                nextAt={nextCollectionAt}
                showNext
              />
            </dd>
          </div>
          <div className="rounded-lg border border-line-section bg-card-white p-4 sm:col-span-2">
            <dt className="type-meta text-meta">{"Último erro"}</dt>
            <dd className="type-body text-strong break-words">
              {lastError ?? "Nenhum erro registrado"}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
