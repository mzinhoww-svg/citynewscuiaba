import { useId } from "react";
import { fullDateTime, HEALTH_TEXT, scoreText } from "@/content/pt-BR/sources-admin";
import { HEALTH_PANEL_TEXT as T } from "@/content/pt-BR/sources-admin-detail";
import type { HealthDay, SourceHealth } from "@/lib/db/queries/sources-admin";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";
import { Panel } from "../../ui/Panel";

export interface SourceHealthPanelProps {
  health: SourceHealth;
  editorialScore: number;
  /** "definido por Marina Arruda" (opcional). */
  scoreNote?: string | null;
  /** "1 h", "30 min · padrão", "10 min · via rápida". */
  frequencyLabel: string;
  lastFetchedAt: string | null;
  nextCollectionAt: string | null;
  consecutiveFailures: number;
  className?: string;
}

const dayLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const labelOfDay = (day: string) => dayLabel.format(new Date(`${day}T12:00:00Z`));

/** Resumo textual do gráfico (spec §8: gráficos com resumo textual). */
export function chartSummary(days: readonly HealthDay[]): string {
  const ok = days.reduce((s, d) => s + d.ok + d.notModified, 0);
  const failed = days.reduce((s, d) => s + d.failed, 0);
  const items = days.reduce((s, d) => s + d.itemsNew, 0);
  const worst = days.reduce<HealthDay | null>(
    (w, d) => (d.failed > 0 && (!w || d.failed > w.failed) ? d : w),
    null,
  );
  return T.chartSummary(ok, failed, items, worst ? labelOfDay(worst.day) : null);
}

/** Barras empilhadas (ok em cima de falhas) dos últimos 30 dias, em SVG puro, sem biblioteca. */
function HealthChart({
  days,
  titleId,
  descId,
}: {
  days: readonly HealthDay[];
  titleId: string;
  descId: string;
}) {
  const W = 600;
  const H = 120;
  const PAD = 4;
  const max = Math.max(1, ...days.map((d) => d.ok + d.notModified + d.failed));
  const slot = (W - PAD * 2) / days.length;
  const bar = Math.max(2, slot * 0.7);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      className="h-auto w-full"
      preserveAspectRatio="none"
    >
      <line
        x1={PAD}
        x2={W - PAD}
        y1={H - PAD}
        y2={H - PAD}
        className="stroke-current text-line-section"
        strokeWidth={1}
      />
      {days.map((d, i) => {
        const okH = ((d.ok + d.notModified) / max) * (H - PAD * 2);
        const failH = (d.failed / max) * (H - PAD * 2);
        const x = PAD + i * slot + (slot - bar) / 2;
        return (
          <g key={d.day}>
            <title>{`${labelOfDay(d.day)}: ${d.ok + d.notModified} ok, ${d.failed} com falha, ${d.itemsNew} itens`}</title>
            {failH > 0 && (
              <rect
                x={x}
                y={H - PAD - failH}
                width={bar}
                height={failH}
                className="fill-current text-danger"
              />
            )}
            {okH > 0 && (
              <rect
                x={x}
                y={H - PAD - failH - okH}
                width={bar}
                height={okH}
                className="fill-current text-service"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <Panel as="div" className="flex min-w-0 flex-col gap-1">
      <p className="type-meta text-meta">{label}</p>
      <p className="type-section text-strong">{value}</p>
      {note && <p className="type-meta text-meta">{note}</p>}
    </Panel>
  );
}

/**
 * Resumo e saúde da fonte (spec §8, O04 `/`): score editorial e operacional com os componentes
 * (disponibilidade 30 d, erro 24 h, frescor), gráfico de 30 dias em SVG com resumo textual, última
 * e próxima coleta, último erro e itens novos por dia. Nada depende só de cor: cada valor tem
 * texto e o gráfico tem `figcaption`.
 */
export function SourceHealthPanel({
  health,
  editorialScore,
  scoreNote,
  frequencyLabel,
  lastFetchedAt,
  nextCollectionAt,
  consecutiveFailures,
  className,
}: SourceHealthPanelProps) {
  const uid = useId().replace(/:/g, "");
  const total = health.days.reduce((s, d) => s + d.ok + d.notModified + d.failed, 0);
  const today = health.days[health.days.length - 1];
  const c = health.components;
  return (
    <div className={cx("flex flex-col gap-6", className)}>
      {consecutiveFailures > 0 && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-warn bg-atencao-soft px-4 py-3 type-body text-strong"
        >
          <Icon name="circle-alert" size={18} className="mt-0.5 shrink-0 text-warn" />
          {T.failuresAlert(consecutiveFailures)}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={T.editorialScore} value={scoreText(editorialScore)} note={scoreNote} />
        <Stat
          label={T.operational}
          value={health.score === null ? T.noData : String(health.score)}
          note={HEALTH_TEXT[health.label]}
        />
        <Stat
          label={T.frequency}
          value={frequencyLabel}
          note={nextCollectionAt ? `${T.nextFetch}: ${fullDateTime(nextCollectionAt)}` : T.noNext}
        />
        <Stat
          label={T.itemsToday}
          value={String(today?.itemsNew ?? 0)}
          note={`${T.lastFetch}: ${lastFetchedAt ? fullDateTime(lastFetchedAt) : T.never}`}
        />
      </div>

      <section
        aria-labelledby={`${uid}-comp`}
        className="flex flex-col gap-3 rounded-lg border border-line-section bg-card-white p-4 sm:p-5"
      >
        <h2 id={`${uid}-comp`} className="type-section text-strong">
          {T.components}
        </h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="type-meta text-meta">{T.availability}</dt>
            <dd className="type-body font-semibold text-strong">
              {c.availability30 === null ? T.noData : T.percent(c.availability30)}
            </dd>
          </div>
          <div>
            <dt className="type-meta text-meta">{T.errorRate}</dt>
            <dd className="type-body font-semibold text-strong">
              {c.errorRate24h === null ? T.noData : T.percent(c.errorRate24h)}
            </dd>
          </div>
          <div>
            <dt className="type-meta text-meta">{T.freshness}</dt>
            <dd className="type-body font-semibold text-strong">
              {T.freshnessText[c.freshness] ?? c.freshness}
            </dd>
          </div>
        </dl>
        <p className="type-meta text-meta">
          {T.lastError}:{" "}
          {health.lastError ? <span className="text-strong">{health.lastError}</span> : T.noError}
        </p>
      </section>

      <figure
        aria-labelledby={`${uid}-chart`}
        className="flex flex-col gap-3 rounded-lg border border-line-section bg-card-white p-4 sm:p-5"
      >
        <h2 id={`${uid}-chart`} className="type-section text-strong">
          {T.chartTitle}
        </h2>
        {total > 0 && (
          <>
            <HealthChart days={health.days} titleId={`${uid}-chart`} descId={`${uid}-sum`} />
            <ul className="flex flex-wrap gap-4 type-meta text-meta">
              <li className="flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block size-3 rounded-xs bg-service" />
                {T.chartLegendOk}
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block size-3 rounded-xs bg-danger" />
                {T.chartLegendFailed}
              </li>
            </ul>
          </>
        )}
        <figcaption id={`${uid}-sum`} className="type-body text-strong">
          {total === 0 ? T.chartEmpty : chartSummary(health.days)}
        </figcaption>
      </figure>
    </div>
  );
}
